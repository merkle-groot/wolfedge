import { Router, Request, Response } from 'express';
import pool from '../../../db.js';

const router = Router();

// GET /api/escrow/events - Get all events across all escrows
router.get('/events', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT e.*, em.amount as escrow_amount, em.buyer_id, em.seller_id, em.arbiter_id
       FROM escrow_events e
       JOIN escrow_metadata em ON e.escrow_id = em.escrow_id
       ORDER BY e.created_at DESC`
    );

    res.json({
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching all events:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch events'
    });
  }
});

// GET /api/escrow/events/:id - Get all events for a specific escrow
router.get('/events/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if escrow exists
    const escrowCheck = await pool.query(
      'SELECT escrow_id FROM escrow_metadata WHERE escrow_id = $1',
      [id]
    );

    if (escrowCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Escrow not found',
        details: `Escrow with ID ${id} does not exist`
      });
    }

    const result = await pool.query(
      `SELECT * FROM escrow_events
       WHERE escrow_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    res.json({
      data: result.rows,
      count: result.rows.length,
      escrow_id: id
    });
  } catch (error) {
    console.error('Error fetching escrow events:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch escrow events'
    });
  }
});

export default router;
