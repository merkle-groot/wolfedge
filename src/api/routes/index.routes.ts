import { Router, Request, Response } from 'express';
import pool from '../../db.js';

const router = Router();

// Root route
router.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Welcome to the Wolfedge API!' });
});

// Database test route
router.get('/api/test-db', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      message: 'Database connection successful',
      timestamp: result.rows[0].now
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

export default router;
