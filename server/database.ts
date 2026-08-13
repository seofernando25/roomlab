import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Database } from 'bun:sqlite';

const databasePath = resolve(process.env.ROOMLAB_DB ?? './data/roomlab.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });

export const db = new Database(databasePath, { create: true });
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA foreign_keys = ON');
db.run('PRAGMA busy_timeout = 5000');

const INITIAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(token_hash);

CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0)
);
CREATE TABLE IF NOT EXISTS currency_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reference_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS currency_ledger_user_idx ON currency_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  access TEXT NOT NULL DEFAULT 'open' CHECK(access IN ('open','friends','locked')),
  max_users INTEGER NOT NULL DEFAULT 25 CHECK(max_users BETWEEN 1 AND 100),
  tags_json TEXT NOT NULL DEFAULT '[]',
  snapshot_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rooms_owner_idx ON rooms(owner_user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS room_permissions (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('rights')),
  PRIMARY KEY(room_id, user_id)
);
CREATE TABLE IF NOT EXISTS recent_rooms (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  last_joined_at TEXT NOT NULL,
  PRIMARY KEY(user_id, room_id)
);

CREATE TABLE IF NOT EXISTS item_instances (
  id TEXT PRIMARY KEY,
  prototype_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK(state IN ('inventory','placed','listed')),
  room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  entity_id TEXT,
  acquired_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(room_id, entity_id)
);
CREATE INDEX IF NOT EXISTS item_instances_owner_idx ON item_instances(owner_user_id, state);

CREATE TABLE IF NOT EXISTS store_offers (
  id TEXT PRIMARY KEY,
  prototype_id TEXT NOT NULL,
  label TEXT NOT NULL,
  price INTEGER NOT NULL CHECK(price >= 0),
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS market_listings (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL UNIQUE REFERENCES item_instances(id) ON DELETE CASCADE,
  seller_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  price INTEGER NOT NULL CHECK(price > 0),
  status TEXT NOT NULL CHECK(status IN ('active','sold','cancelled')),
  created_at TEXT NOT NULL,
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS market_active_idx ON market_listings(status, created_at DESC);

CREATE TABLE IF NOT EXISTS friendships (
  id TEXT PRIMARY KEY,
  user_low TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('pending','accepted','blocked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_low, user_high),
  CHECK(user_low <> user_high)
);
`;

db.run('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
let schemaVersion = db.query<{ version: number }, []>('SELECT COALESCE(MAX(version), 0) version FROM schema_migrations').get()?.version ?? 0;
if (schemaVersion < 1) {
  db.transaction(() => {
    db.run(INITIAL_SCHEMA);
    db.query('INSERT INTO schema_migrations(version, applied_at) VALUES(1, ?)').run(new Date().toISOString());
  })();
  schemaVersion = 1;
}
if (schemaVersion < 2) {
  db.transaction(() => {
    db.run(`CREATE TABLE IF NOT EXISTS operation_receipts (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(user_id, request_id)
    )`);
    db.query('INSERT INTO schema_migrations(version, applied_at) VALUES(2, ?)').run(new Date().toISOString());
  })();
  schemaVersion = 2;
}
if (schemaVersion > 2) throw new Error(`Database schema ${schemaVersion} is newer than this server supports.`);

export function nowIso(): string { return new Date().toISOString(); }

export function transaction<T>(operation: () => T): T {
  return db.transaction(operation)();
}

export function closeDatabase(): void { db.close(); }
