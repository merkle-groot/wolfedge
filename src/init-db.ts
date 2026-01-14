import { Client } from 'pg';
import 'dotenv/config';

async function createTableIfNotExists() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'postgres',
    ssl: {
      rejectUnauthorized: false // Required for Neon
    }
  });

  try {
    await client.connect();
    await client.query('BEGIN');


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
        id SERIAL PRIMARY KEY,
        escrow_id INTEGER NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        user_id INTEGER NOT NULL,
        event_data JSONB,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT escrow_constraint
          FOREIGN KEY(escrow_id)
          REFERENCES escrow_metadata(escrow_id),
        CONSTRAINT user_constraint
          FOREIGN KEY(user_id)
          REFERENCES escrow_users(user_id)
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
    console.log('Event table created successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating tables:', error);
    throw error;
  } finally {
    await client.end();
  }
}

export const initDB = async() => {
  // await createDatabaseIfNotExists();
  await createTableIfNotExists();
} 
