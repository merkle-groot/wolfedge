import { Router, Request, Response } from 'express';
import pool from '../../../db.js';
import { createEscrowEventSchema, CreateEscrowEventInput, EscrowStateEnumValues } from '../../validators/escrow-action.validator.js';

const router = Router();

// POST /api/escrow/action/:id - Add an action/event to an escrow
router.post('/action/:id', async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    // Validate request body
    const validatedData: CreateEscrowEventInput = createEscrowEventSchema.parse(req.body);
    const { action, user_id } = req.body;

    // Start transaction
    await client.query('BEGIN');

    // Check if escrow exists
    const metadata = await client.query(
      'SELECT * FROM escrow_metadata WHERE escrow_id = $1',
      [id]
    );

    if (metadata.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: 'Escrow not found',
        details: `Escrow with ID ${id} does not exist`
      });
    }

    const { buyer_id, seller_id, arbiter_id } = metadata.rows[0];

    // User permission check
    if (
      (action === EscrowStateEnumValues.FUNDED && user_id !== buyer_id) ||
      (action === EscrowStateEnumValues.DISPUTED && user_id === arbiter_id) ||
      ([EscrowStateEnumValues.RELEASED, EscrowStateEnumValues.REFUNDED].includes(action) && user_id !== arbiter_id) ||
      (action === EscrowStateEnumValues.PROPOSED)
    ) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: 'Permission denied',
        details: 'User cannot perform this action'
      });
    }

    // Get latest event WITH ROW-LEVEL LOCK to prevent concurrent modifications
    const eventsResult = await client.query(
      'SELECT * FROM escrow_events WHERE escrow_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE',
      [id]
    );

    if (eventsResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: 'Escrow not found',
        details: `Escrow with ID ${id} does not exist`
      });
    }

    const { state } = eventsResult.rows[0];

    // State transition validation
    if (
      (
        state === EscrowStateEnumValues.PROPOSED &&
        ![EscrowStateEnumValues.FUNDED].includes(action)
      ) ||
      (
        state === EscrowStateEnumValues.FUNDED &&
        ![EscrowStateEnumValues.DISPUTED, EscrowStateEnumValues.RELEASED].includes(action)
      ) ||
      (
        state === EscrowStateEnumValues.DISPUTED &&
        ![EscrowStateEnumValues.RELEASED, EscrowStateEnumValues.REFUNDED].includes(action)
      ) ||
      (
        [EscrowStateEnumValues.REFUNDED, EscrowStateEnumValues.RELEASED].includes(state)
      )
    ) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Invalid state transition',
        details: `Cannot execute the action with the escrow in current state`
      });
    }

    // Insert new event
    const insertionResult = await client.query(
      'INSERT INTO escrow_events(escrow_id, state) VALUES($1, $2) RETURNING *',
      [id, action]
    );

    if (insertionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(500).json({
        error: 'Could not insert into events table'
      });
    }

    // Commit transaction
    await client.query('COMMIT');

    console.log(`Created event for escrow ${id}: ${state} -> ${action}`);

    res.status(201).json({
      message: 'Escrow event created successfully',
      data: insertionResult.rows[0],
      previous_state: state,
      new_state: action
    });
  } catch (error: any) {
    // Rollback transaction on any error
    await client.query('ROLLBACK');

    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors
      });
    }

    console.error('Error creating escrow event:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create escrow event'
    });
  } finally {
    // Release client back to pool
    client.release();
  }
});

export default router;
