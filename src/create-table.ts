

async function createTableWithConstraints() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const createEventsTable = `
      CREATE TYPE STATE AS ENUM ('PROPOSED', 'FUNDED', 'RELEASED', 'DISPUTED', 'REFUNDED');
      CREATE TABLE IF NOT EXISTS escrow-events (
        escrow_id SERIAL PRIMARY KEY,
        amount INTERGER NOT NULL,
        state STATE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      );
    `;

    // Execute table creation queries
    console.log('Creating events table...');
    await client.query(createEventsTable);

    await client.query('COMMIT');
    console.log('\nEvent table created successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating tables:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export { createTableWithConstraints };
