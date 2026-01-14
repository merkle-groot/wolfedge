# Escrow Task

### Get it running

1. **Install dependencies**
```bash
npm install
```

2. **Set up environment variables**
```bash
# Copy the example .env file
cp .env.example .env

# Edit .env with your Neon PostgreSQL credentials:
# DB_HOST=your-neon-host
# DB_PORT=5432
# DB_NAME=your-database-name
# DB_USER=your-username
# DB_PASSWORD=your-password
```

3. **Start the development server**
```bash
npm run dev
```

The server will start on `http://localhost:3000` and automatically:
- Initialize the database tables
- Create dummy users (Alice, Bob, Charlie, Dave)
- Serve the frontend at the root URL

4. **Access the application**
- Frontend: http://localhost:3000
- API endpoints: http://localhost:3000/api/escrow/*

**Commands:**
```bash
npm run build    # Compile TypeScript to dist/
npm run start    # Run production build
npm test         # Run tests
npm run test:watch # Run tests in watch mode
```

### Architecture

**Tech Stack**: Node.js + Express + PostgreSQL (Neon) + Vanilla JS frontend

**Valid Transitions**:
| From State | To State | Who Can Initiate | Description |
|-----------|----------|------------------|-------------|
| PROPOSED | FUNDED | Buyer | Buyer deposits funds into escrow |
| FUNDED | DISPUTED | Buyer, Seller | Either party raises a dispute |
| FUNDED | RELEASED | Seller | Seller confirms delivery, releases funds |
| DISPUTED | RELEASED | Arbiter | Arbiter resolves dispute in seller's favor |
| DISPUTED | REFUNDED | Arbiter | Arbiter resolves dispute in buyer's favor |
| RELEASED | - | - | Terminal state (funds with seller) |
| REFUNDED | - | - | Terminal state (funds returned to buyer) |

**Events**:
- EscrowProposed, EscrowFunded, EscrowDisputed, EscrowReleased, EscrowRefunded

**Database Schema**:
- `escrow_users`: User entities (buyer, seller, arbiter)
- `escrow_metadata`: Escrow contracts (amount, participants)
- `escrow_events`: Immutable event log with versioning

**API Endpoints**:
- POST `/api/escrow/metadata` - Create escrow
- GET `/api/escrow/metadata` - List all escrows
- GET `/api/escrow/metadata/:id` - Get escrow with computed state
- POST `/api/escrow/action/:id` - Perform state transition
- GET `/api/escrow/events` - Get event log

**Invariants**:
- **Event immutability**: Once written, events are never modified or deleted
- **Version monotonicity**: Event versions strictly increase (optimistic locking)
- **State derivation**: Current state is always computed by replaying all events
- **Permission enforcement**: Only authorized roles can trigger specific transitions (no explicit auth methods, the user id is passed in the request)

### Learnings

**Iteration 1: The "Last Event" Approach**

The initial implementation used the last event's type as the current state. This worked functionally but defeated the purpose of event sourcing—there was no audit trail, no ability to reconstruct how the system reached a given state, and limited debugging capabilities.

**Iteration 2: Proper Event Replay**

The current implementation replays all events from scratch to compute state. While this is O(n), it provides complete event history, enables debugging, and maintains a proper audit log. 

**Concurrency Handling**

The implementation uses a hybrid approach combining both pessimistic and optimistic locking:

- **Row-level locking** (`SELECT FOR UPDATE` on metadata): Ensures transactions read the latest committed state before making changes
- **Version numbers** on events: Provides ordering and audit capabilities

When two transactions attempt to modify the same escrow concurrently:
1. The first transaction acquires a lock on the metadata row
2. The second transaction waits for the first to complete
3. After the first commits, the second sees the new state and validates its transition against it
4. If the transition is now invalid (e.g., trying to dispute a released escrow), the second transaction rolls back with an error
5. Version numbers increment monotonically, creating a clear ordering of events

This approach provides strong consistency while maintaining a complete audit trail. The row lock prevents race conditions, while version numbers make the event history explicit and queryable. Invalid transitions due to concurrent changes are rejected gracefully rather than corrupting the state.

**Key Takeaway**

Event sourcing requires more work upfront, but having a complete history of every state change makes debugging and understanding the system much easier.

### Improvements
1. The tests are not exhaustive, more tests are needed
2. The website definitely needs some work, it's completely vibecoded
