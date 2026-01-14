import { Client } from 'pg';
import 'dotenv/config';

async function createDatabaseIfNotExists() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: 'postgres', 
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  // ToDo: checking env loading
  console.log(process.env.DB_HOST);

  try {
    await client.connect();
    console.log('Connected to PostgreSQL server');

    // Check if database exists
    const checkDbQuery = 'SELECT 1 FROM pg_database WHERE datname = $1';
    const result = await client.query(checkDbQuery, [process.env.DB_NAME || 'wolfedge']);

    console.log("result: ", result);

    if (result.rows.length === 0) {
      // Database doesn't exist, create it
      await client.query(`CREATE DATABASE ${process.env.DB_NAME || 'wolfedge'}`);
      console.log(`Database "${process.env.DB_NAME || 'wolfedge'}" created successfully`);
    } else {
      console.log(`Database "${process.env.DB_NAME || 'wolfedge'}" already exists`);
    }
  } catch (error) {
    console.error('Error creating database:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run if this file is executed directly
if (require.main === module) {
  createDatabaseIfNotExists()
    .then(() => {
      console.log('Database initialization complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to initialize database:', error);
      process.exit(1);
    });
}

export default createDatabaseIfNotExists;
