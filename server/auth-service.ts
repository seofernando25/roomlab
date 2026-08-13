import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AccountDto, UserId } from '../src/online/types';
import { db, nowIso, transaction } from './database';

export const SESSION_COOKIE = 'roomlab_session';
const SESSION_DAYS = 90;
const STARTING_BALANCE = 500;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,18}$/;

interface UserRow { id: string; username: string; created_at: string; balance: number; }
interface SessionRow { id: string; user_id: string; expires_at: string; }

export function normalizeUsername(value: string): string {
  return value.trim();
}

export function validateUsername(username: string): string | null {
  if (!USERNAME_PATTERN.test(username)) return 'Use 3–18 letters, numbers, or underscores.';
  return null;
}

export function createAccountSession(usernameInput: string): { account: AccountDto; token: string } {
  const username = normalizeUsername(usernameInput);
  const invalid = validateUsername(username);
  if (invalid) throw new Error(invalid);
  const existing = db.query<{ id: string }, [string]>('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username);
  if (existing) throw new Error('That username is already claimed. Use the browser where it was created, or choose another name for now.');

  const userId = randomUUID();
  const createdAt = nowIso();
  const token = makeToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  transaction(() => {
    db.query('INSERT INTO users(id, username, created_at, updated_at) VALUES(?, ?, ?, ?)').run(userId, username, createdAt, createdAt);
    db.query('INSERT INTO wallets(user_id, balance) VALUES(?, ?)').run(userId, STARTING_BALANCE);
    db.query('INSERT INTO currency_ledger(id, user_id, delta, reason, created_at) VALUES(?, ?, ?, ?, ?)')
      .run(randomUUID(), userId, STARTING_BALANCE, 'welcome', createdAt);
    db.query('INSERT INTO sessions(id, user_id, token_hash, created_at, expires_at, last_seen_at) VALUES(?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), userId, tokenHash(token), createdAt, expiresAt, createdAt);
  });
  return { account: accountById(userId)!, token };
}

export function accountForToken(token: string | undefined | null): AccountDto | null {
  if (!token) return null;
  const row = db.query<SessionRow, [string]>('SELECT id, user_id, expires_at FROM sessions WHERE token_hash = ?').get(tokenHash(token));
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) {
    db.query('DELETE FROM sessions WHERE id = ?').run(row.id);
    return null;
  }
  db.query('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(nowIso(), row.id);
  return accountById(row.user_id);
}

export function renameAccount(userId: UserId, usernameInput: string): AccountDto {
  const username = normalizeUsername(usernameInput);
  const invalid = validateUsername(username);
  if (invalid) throw new Error(invalid);
  const taken = db.query<{ id: string }, [string, string]>('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id <> ?').get(username, userId);
  if (taken) throw new Error('That username is already taken.');
  db.query('UPDATE users SET username = ?, updated_at = ? WHERE id = ?').run(username, nowIso(), userId);
  const account = accountById(userId);
  if (!account) throw new Error('Account no longer exists.');
  return account;
}

export function revokeSession(token: string | undefined | null): void {
  if (!token) return;
  db.query('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
}

export function accountById(userId: UserId): AccountDto | null {
  const row = db.query<UserRow, [string]>(`
    SELECT u.id, u.username, u.created_at, COALESCE(w.balance, 0) balance
    FROM users u LEFT JOIN wallets w ON w.user_id = u.id WHERE u.id = ?
  `).get(userId);
  return row ? { id: row.id, username: row.username, createdAt: row.created_at, balance: row.balance } : null;
}

export function userIdByUsername(username: string): UserId | null {
  return db.query<{ id: string }, [string]>('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(normalizeUsername(username))?.id ?? null;
}

function makeToken(): string { return randomBytes(32).toString('base64url'); }
function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex'); }
