import express, { Request, Response, Application } from 'express';
import pool from './db';
import 'dotenv/config';

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Dummy route
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Welcome to the API!' });
});

app.get('/api/hello', (req: Request, res: Response) => {
  res.json({ message: 'Hello, World!' });
});

// Database test route
app.get('/api/test-db', async (req: Request, res: Response) => {
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

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
