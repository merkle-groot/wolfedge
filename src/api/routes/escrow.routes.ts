import { Router, Request, Response } from 'express';
import pool from '../../db.js';
import {
  EscrowEvent,
  EscrowState,
  EscrowStatus
} from '../../types/escrow.types.js';
import {
  createEscrowEventSchema,
  statusToEventType
} from '../validators/escrow-action.validator.js';
import { createEscrowMetadataSchema } from '../validators/escrow.validator.js';

const router = Router();

/**
 * Get current state by replaying all events with optimistic locking
 */
export async function getCurrentState(
  escrowId: string,
  client: any
): Promise<EscrowState & { version: number }> {
  const result = await client.query(
    `SELECT * FROM escrow_events
     WHERE escrow_id = $1
     ORDER BY id ASC`,
    [escrowId]
  );

  const events = result.rows as EscrowEvent[];

  // Replay all events to derive state
  const state = replayEvents(events);

  // Get the latest version for optimistic locking
  const latestVersion = events.length > 0
    ? events[events.length - 1].version
    : 0;

  return {
    ...state,
    version: latestVersion
  };
}

/**
 * Replay events to derive current state
 */
export function replayEvents(events: EscrowEvent[]): EscrowState {
  let state: EscrowState = {
    status: 'PROPOSED',
    buyer_id: null,
    seller_id: null,
    amount: null,
    version: 1,
    isFinal: false
  };

  for (const event of events) {
    switch (event.event_type) {
      case 'EscrowProposed':
        state = {
          ...state,
          status: 'PROPOSED',
          buyer_id: event.event_data?.buyer_id ?? null,
          seller_id: event.event_data?.seller_id ?? null,
          amount: event.event_data?.amount ?? null
        };
        break;

      case 'EscrowFunded':
        state = { ...state, status: 'FUNDED' };
        break;

      case 'EscrowReleased':
        state = { ...state, status: 'RELEASED', isFinal: true };
        break;

      case 'EscrowDisputed':
        state = { ...state, status: 'DISPUTED' };
        break;

      case 'EscrowRefunded':
        state = { ...state, status: 'REFUNDED', isFinal: true };
        break;
    }
  }

  return state;
}

/**
 * Create a new escrow with initial PROPOSED event
 */
router.post('/metadata', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    // Validate input
    const validatedData = createEscrowMetadataSchema.parse(req.body);

    await client.query('BEGIN');

    // Insert metadata
    const metadataResult = await client.query(
      `INSERT INTO escrow_metadata (amount, buyer_id, seller_id, arbiter_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [validatedData.amount, validatedData.buyer_id, validatedData.seller_id, validatedData.arbiter_id]
    );

    const escrowId = metadataResult.rows[0].escrow_id;

    // Create initial EscrowProposed event
    const eventResult = await client.query(
      `INSERT INTO escrow_events (escrow_id, event_type, user_id, event_data, version)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        escrowId,
        'EscrowProposed',
        validatedData.buyer_id,
        JSON.stringify({
          buyer_id: validatedData.buyer_id,
          seller_id: validatedData.seller_id,
          arbiter_id: validatedData.arbiter_id,
          amount: validatedData.amount
        }),
        1
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Escrow created successfully',
      data: {
        metadata: metadataResult.rows[0],
        event: eventResult.rows[0]
      }
    });

  } catch (error: any) {
    await client.query('ROLLBACK');

    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors
      });
    }

    console.error('Error creating escrow:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  } finally {
    client.release();
  }
});

/**
 * Get all escrows
 */
router.get('/metadata', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM escrow_metadata ORDER BY created_at DESC'
    );

    res.json({
      data: result.rows,
      count: result.rows.length
    });

  } catch (error: any) {
    console.error('Error fetching escrows:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

/**
 * Get escrow metadata and current state
 */
router.get('/metadata/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get metadata
    const metadataResult = await pool.query(
      'SELECT * FROM escrow_metadata WHERE escrow_id = $1',
      [id]
    );

    if (metadataResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Escrow not found',
        details: `Escrow with ID ${id} does not exist`
      });
    }

    // Get all events to compute current state
    const eventsResult = await pool.query(
      `SELECT * FROM escrow_events
       WHERE escrow_id = $1
       ORDER BY id ASC`,
      [id]
    );

    const currentState = replayEvents(eventsResult.rows);

    res.json({
      metadata: metadataResult.rows[0],
      current_state: currentState.status,
      events: eventsResult.rows,
      event_count: eventsResult.rows.length
    });

  } catch (error: any) {
    console.error('Error fetching escrow:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

/**
 * Perform an action on an escrow (state transition)
 * Uses optimistic locking with version numbers
 */
router.post('/action/:id', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    // Validate input
    const validatedData = createEscrowEventSchema.parse(req.body);
    const { action, user_id } = validatedData;

    await client.query('BEGIN');

    // Get metadata
    const metadataResult = await client.query(
      'SELECT * FROM escrow_metadata WHERE escrow_id = $1 FOR UPDATE',
      [id]
    );

    if (metadataResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: 'Escrow not found',
        details: `Escrow with ID ${id} does not exist`
      });
    }

    const { buyer_id, seller_id, arbiter_id } = metadataResult.rows[0];

    // Get current state and version with row lock
    const currentState = await getCurrentState(String(id), client);

    // Validate permission
    if (!canUserPerformAction(action, user_id, { buyer_id, seller_id, arbiter_id })) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: 'Permission denied',
        details: 'User does not have permission to perform this action'
      });
    }

    // Validate state transition
    if (!isValidTransition(currentState.status, action)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Invalid state transition',
        details: `Cannot transition from ${currentState.status} to ${action}`,
        current_state: currentState.status,
        attempted_action: action
      });
    }

    // Insert new event with incremented version
    const newVersion = currentState.version + 1;
    const eventType = statusToEventType[action];

    const eventResult = await client.query(
      `INSERT INTO escrow_events (escrow_id, event_type, user_id, event_data, version)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, eventType, user_id, JSON.stringify({}), newVersion]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Event created successfully',
      previous_state: currentState.status,
      new_state: action,
      event: eventResult.rows[0],
      version: newVersion
    });

  } catch (error: any) {
    await client.query('ROLLBACK');

    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors
      });
    }

    console.error('Error creating event:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  } finally {
    client.release();
  }
});

/**
 * Get all events for a specific escrow
 */
router.get('/events/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT e.*, u.name as user_name
       FROM escrow_events e
       LEFT JOIN escrow_users u ON e.user_id = u.user_id
       WHERE e.escrow_id = $1
       ORDER BY e.id ASC`,
      [id]
    );

    res.json({
      data: result.rows,
      count: result.rows.length,
      escrow_id: id
    });

  } catch (error: any) {
    console.error('Error fetching events:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

/**
 * Get all events across all escrows
 */
router.get('/events', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT e.*, u.name as user_name, em.amount as escrow_amount
       FROM escrow_events e
       LEFT JOIN escrow_users u ON e.user_id = u.user_id
       LEFT JOIN escrow_metadata em ON e.escrow_id = em.escrow_id
       ORDER BY e.created_at DESC`
    );

    res.json({
      data: result.rows,
      count: result.rows.length
    });

  } catch (error: any) {
    console.error('Error fetching events:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Helper functions

export function isValidTransition(currentState: EscrowStatus, action: EscrowStatus): boolean {
  const validTransitions: Record<EscrowStatus, EscrowStatus[]> = {
    'PROPOSED': ['FUNDED'],
    'FUNDED': ['DISPUTED', 'RELEASED'],
    'DISPUTED': ['RELEASED', 'REFUNDED'],
    'RELEASED': [],  // Final state
    'REFUNDED': []   // Final state
  };

  return validTransitions[currentState]?.includes(action) ?? false;
}

export function canUserPerformAction(
  action: EscrowStatus,
  user_id: number,
  { buyer_id, seller_id, arbiter_id }: { buyer_id: number; seller_id: number; arbiter_id: number }
): boolean {
  const permissions: Record<string, number[]> = {
    'FUNDED': [buyer_id],
    'DISPUTED': [buyer_id, seller_id],
    'RELEASED': [arbiter_id],
    'REFUNDED': [arbiter_id]
  };

  return permissions[action]?.includes(user_id) ?? false;
}

export default router;
