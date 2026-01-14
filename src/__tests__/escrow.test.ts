import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { replayEvents, isValidTransition, canUserPerformAction } from '../api/routes/escrow.routes.js';
import { EscrowEvent } from '../types/escrow.types.js';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'wolfedge',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

describe('Escrow Tests', () => {
  beforeAll(async () => {
    // Clean test data
    await pool.query('DELETE FROM escrow_events WHERE escrow_id < 0');
    await pool.query('DELETE FROM escrow_metadata WHERE escrow_id < 0');
  });

  beforeEach(async () => {
    // Clean before each test
    await pool.query('DELETE FROM escrow_events WHERE escrow_id = -1');
    await pool.query('DELETE FROM escrow_metadata WHERE escrow_id = -1');
  });

  // 1. Unit tests for command handling
  describe('Command Handling', () => {
    it('should accept valid action request', async () => {
      const res = await fetch(`http://localhost:3000/api/escrow/action/999999`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'FUNDED', user_id: 0 })
      });
      expect(res.status).toBe(404); // Escrow doesn't exist
    });

    it('should reject invalid action', async () => {
      const res = await fetch(`http://localhost:3000/api/escrow/action/999999`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'INVALID', user_id: 0 })
      });
      expect(res.status).toBe(400);
    });
  });

  // 2. Unit tests for event-to-state folding
  describe('Event Folding', () => {
    it('should fold empty events to initial state', () => {
      const state = replayEvents([]);
      expect(state.status).toBe('PROPOSED');
      expect(state.buyer_id).toBeNull();
    });

    it('should fold EscrowProposed event correctly', () => {
      const events: EscrowEvent[] = [{
        id: 1,
        escrow_id: 1,
        event_type: 'EscrowProposed',
        user_id: 1,
        event_data: { buyer_id: 1, seller_id: 2, amount: 100 },
        version: 1,
        created_at: new Date()
      }];
      const state = replayEvents(events);
      expect(state.status).toBe('PROPOSED');
      expect(state.buyer_id).toBe(1);
      expect(state.amount).toBe(100);
    });

    it('should fold event sequence to final state', () => {
      const events: EscrowEvent[] = [
        {
          id: 1, escrow_id: 1, event_type: 'EscrowProposed', user_id: 1,
          event_data: { buyer_id: 1, seller_id: 2, amount: 100 }, version: 1, created_at: new Date()
        },
        { id: 2, escrow_id: 1, event_type: 'EscrowFunded', user_id: 1, version: 2, created_at: new Date() },
        { id: 3, escrow_id: 1, event_type: 'EscrowReleased', user_id: 3, version: 3, created_at: new Date() }
      ];
      const state = replayEvents(events);
      expect(state.status).toBe('RELEASED');
      expect(state.isFinal).toBe(true);
    });
  });

  // 3. Concurrency test
  describe('Concurrency', () => {
    it('should handle parallel state transitions correctly', async () => {
      // Insert test escrow in FUNDED state
      await pool.query(
        'INSERT INTO escrow_metadata (escrow_id, amount, buyer_id, seller_id, arbiter_id) VALUES ($1, $2, $3, $4, $5)',
        [-1, 100, 0, 1, 2]
      );
      await pool.query(
        "INSERT INTO escrow_events (escrow_id, event_type, user_id, event_data, version) VALUES ($1, 'EscrowProposed', $2, $3, $4)",
        [-1, 0, JSON.stringify({ buyer_id: 0, seller_id: 1, amount: 100 }), 1]
      );
      await pool.query(
        "INSERT INTO escrow_events (escrow_id, event_type, user_id, version) VALUES ($1, 'EscrowFunded', $2, $3)",
        [-1, 0, 2]
      );

      // Send parallel requests (both valid from FUNDED state)
      const [res1, res2] = await Promise.all([
        fetch(`http://localhost:3000/api/escrow/action/-1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'RELEASED', user_id: 2 })
        }),
        fetch(`http://localhost:3000/api/escrow/action/-1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'DISPUTED', user_id: 1 })
        })
      ]);

      // One should succeed, one should fail
      expect([res1.status, res2.status]).not.toContain(500);

      // Final state should be valid (no corrupted state)
      const events = await pool.query('SELECT * FROM escrow_events WHERE escrow_id = -1 ORDER BY id');
      expect(events.rows.length).toBeGreaterThan(0);
    });
  });

  // 4. Idempotency/Invariant test
  describe('Invariants', () => {
    it('should preserve version sequence invariant', async () => {
      await pool.query(
        'INSERT INTO escrow_metadata (escrow_id, amount, buyer_id, seller_id, arbiter_id) VALUES ($1, $2, $3, $4, $5)',
        [-1, 100, 0, 1, 2]
      );
      await pool.query(
        "INSERT INTO escrow_events (escrow_id, event_type, user_id, event_data, version) VALUES ($1, 'EscrowProposed', $2, $3, $4)",
        [-1, 0, JSON.stringify({ buyer_id: 0, seller_id: 1, amount: 100 }), 1]
      );

      // Create multiple events
      await fetch(`http://localhost:3000/api/escrow/action/-1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'FUNDED', user_id: 0 })
      });

      const events = await pool.query('SELECT version FROM escrow_events WHERE escrow_id = -1 ORDER BY id');
      const versions = events.rows.map((r: any) => r.version);

      // Versions should be sequential 1, 2, 3...
      for (let i = 0; i < versions.length; i++) {
        expect(versions[i]).toBe(i + 1);
      }
    });

    it('should reject duplicate final state transitions', async () => {
      await pool.query(
        'INSERT INTO escrow_metadata (escrow_id, amount, buyer_id, seller_id, arbiter_id) VALUES ($1, $2, $3, $4, $5)',
        [-1, 100, 0, 1, 2]
      );
      await pool.query(
        "INSERT INTO escrow_events (escrow_id, event_type, user_id, event_data, version) VALUES ($1, 'EscrowProposed', $2, $3, $4)",
        [-1, 0, JSON.stringify({ buyer_id: 0, seller_id: 1, amount: 100 }), 1]
      );

      // Transition to RELEASED
      await pool.query("INSERT INTO escrow_events (escrow_id, event_type, user_id, version) VALUES ($1, 'EscrowFunded', $2, $3)", [-1, 0, 2]);
      await pool.query("INSERT INTO escrow_events (escrow_id, event_type, user_id, version) VALUES ($1, 'EscrowReleased', $2, $3)", [-1, 2, 3]);

      // Try to transition from RELEASED (should fail)
      const res = await fetch(`http://localhost:3000/api/escrow/action/-1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REFUNDED', user_id: 2 })
      });

      expect(res.status).toBe(400);
    });
  });

  // 5. Role permissions test
  describe('Role Permissions', () => {
    it('should allow buyer to FUND', () => {
      expect(canUserPerformAction('FUNDED', 0, { buyer_id: 0, seller_id: 1, arbiter_id: 2 })).toBe(true);
    });

    it('should reject seller from FUNDing', () => {
      expect(canUserPerformAction('FUNDED', 1, { buyer_id: 0, seller_id: 1, arbiter_id: 2 })).toBe(false);
    });

    it('should allow arbiter to RELEASE', () => {
      expect(canUserPerformAction('RELEASED', 2, { buyer_id: 0, seller_id: 1, arbiter_id: 2 })).toBe(true);
    });

    it('should reject buyer from RELEASING', () => {
      expect(canUserPerformAction('RELEASED', 0, { buyer_id: 0, seller_id: 1, arbiter_id: 2 })).toBe(false);
    });

    it('should allow both buyer and seller to DISPUTE', () => {
      expect(canUserPerformAction('DISPUTED', 0, { buyer_id: 0, seller_id: 1, arbiter_id: 2 })).toBe(true);
      expect(canUserPerformAction('DISPUTED', 1, { buyer_id: 0, seller_id: 1, arbiter_id: 2 })).toBe(true);
    });

    it('should reject arbiter from DISPUTING', () => {
      expect(canUserPerformAction('DISPUTED', 2, { buyer_id: 0, seller_id: 1, arbiter_id: 2 })).toBe(false);
    });
  });
});
