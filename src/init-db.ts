import { Client } from 'pg';
import 'dotenv/config';

async function createDatabaseIfNotExists() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: 'postgres', // Must connect to default database to create a new one
  });

  try {
    await client.connect();

    // Check if database exists
    const checkDbQuery = 'SELECT 1 FROM pg_database WHERE datname = $1';
    const result = await client.query(checkDbQuery, [process.env.DB_NAME || 'wolfedge']);

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

async function createTableIfNotExists() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'wolfedge',
  });

  try {
    await client.connect();
    await client.query('BEGIN');

    // Create ENUM type first (outside of IF NOT EXISTS for tables)
    const createEnumType = `
      DO $$ BEGIN
        CREATE TYPE STATE AS ENUM ('PROPOSED', 'FUNDED', 'RELEASED', 'DISPUTED', 'REFUNDED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;
    await client.query(createEnumType);

    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS escrow_users (
        user_id INTEGER PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    console.log('Creating users table...');
    await client.query(createUsersTable);

    const createEventsMetadataTable = `
      CREATE TABLE IF NOT EXISTS escrow_metadata (
        escrow_id SERIAL PRIMARY KEY,
        amount NUMERIC NOT NULL,
        buyer_id INTEGER NOT NULL,
        seller_id INTEGER NOT NULL,
        arbiter_id INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT buyer_constraint
          FOREIGN KEY(buyer_id)
          REFERENCES escrow_users(user_id),
        CONSTRAINT seller_constraint
          FOREIGN KEY(seller_id)
          REFERENCES escrow_users(user_id),
        CONSTRAINT arbiter_constraint
          FOREIGN KEY(arbiter_id)
          REFERENCES escrow_users(user_id)
      );
    `;

    console.log('Creating metadata table...');
    await client.query(createEventsMetadataTable);

    const createEventsTable = `
      CREATE TABLE IF NOT EXISTS escrow_events (
        escrow_id INTEGER,
        state STATE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT escrow_constraint
          FOREIGN KEY(escrow_id)
          REFERENCES escrow_metadata(escrow_id)
      );
    `;

    // Execute table creation query
    console.log('Creating events table...');
    await client.query(createEventsTable);

    const createDummyUsers = `
      INSERT INTO escrow_users(user_id, name) VALUES (0, 'Alice'), (1, 'Bob'), (2, 'Charlie'), (3, 'Dave');
    `
    const userCount = await client.query('SELECT COUNT(*) FROM escrow_users');
    if (userCount.rows[0].count === '0') {
      console.log('Creating dummy users...');
      await client.query(createDummyUsers);
    }

    await client.query('COMMIT');
    console.log('\nEvent table created successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating tables:', error);
    throw error;
  } finally {
    await client.end();
  }
}

export const initDB = async() => {
  await createDatabaseIfNotExists();
  await createTableIfNotExists();
} 
