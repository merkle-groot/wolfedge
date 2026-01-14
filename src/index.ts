import express, { Application } from 'express';
import { initDB } from './init-db.js';
import 'dotenv/config';
import apiRouter from './api/index.js';

console.log("Setting up db...");
await initDB();
console.log("Db successfully set!");

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Mount API routes
app.use(apiRouter);

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
