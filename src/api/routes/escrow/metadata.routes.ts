import { Router, Request, Response } from 'express';
import pool from '../../../db.js';
import { createEscrowMetadataSchema, CreateEscrowMetadataInput } from '../../validators/escrow.validator.js';
import { EscrowStateEnumValues } from '../../validators/escrow-action.validator.js';

const router = Router();

// POST /api/escrow/metadata - Create new escrow metadata
router.post('/metadata', async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    // Validate request body
    const validatedData: CreateEscrowMetadataInput = createEscrowMetadataSchema.parse(req.body);

    // Start transaction
    await client.query('BEGIN');

    // Check if all users exist
    const usersCheck = await client.query(
      'SELECT user_id FROM escrow_users WHERE user_id IN ($1, $2, $3)',
      [validatedData.buyer_id, validatedData.seller_id, validatedData.arbiter_id]
    );

    if (usersCheck.rows.length !== 3) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'One or more users do not exist',
        details: 'All buyer_id, seller_id, and arbiter_id must reference existing users'
      });
    }

    // Check that buyer, seller, and arbiter are different users
    if (validatedData.buyer_id === validatedData.seller_id ||
        validatedData.buyer_id === validatedData.arbiter_id ||
        validatedData.seller_id === validatedData.arbiter_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Invalid user assignment',
        details: 'Buyer, seller, and arbiter must be different users'
      });
    }

    // Insert escrow metadata
    const result = await client.query(
      `INSERT INTO escrow_metadata (amount, buyer_id, seller_id, arbiter_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [validatedData.amount, validatedData.buyer_id, validatedData.seller_id, validatedData.arbiter_id]
    );

    // Check if insert was successful
    if (result.rowCount === 0 || !result.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(500).json({
        error: 'Failed to create escrow metadata',
        message: 'No rows were inserted'
      });
    }

    const newEscrow = result.rows[0];
    const escrowId = newEscrow.escrow_id;

    // Create initial event with PROPOSED state
    const eventResult = await client.query(
      `INSERT INTO escrow_events (escrow_id, state)
       VALUES ($1, $2)
       RETURNING *`,
      [escrowId, EscrowStateEnumValues.PROPOSED]
    );

    // Check if event insert was successful
    if (eventResult.rowCount === 0 || !eventResult.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(500).json({
        error: 'Failed to create escrow event',
        message: 'Initial event creation failed'
      });
    }

    // Commit transaction
    await client.query('COMMIT');

    console.log(`Created escrow with ID: ${escrowId} and initial PROPOSED event`);

    res.status(201).json({
      message: 'Escrow metadata created successfully',
      data: {
        ...newEscrow,
        initial_event: eventResult.rows[0]
      }
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

    console.error('Error creating escrow metadata:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create escrow metadata'
    });
  } finally {
    // Release client back to pool
    client.release();
  }
});

// GET /api/escrow/metadata/:id - Get escrow metadata by ID
router.get('/metadata/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM escrow_metadata WHERE escrow_id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Escrow metadata not found'
      });
    }

    res.json({
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching escrow metadata:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch escrow metadata'
    });
  }
});

export default router;
