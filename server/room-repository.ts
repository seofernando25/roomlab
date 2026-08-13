import { randomUUID } from 'node:crypto';
import { getEntityPrototype } from '../src/domain/prototype-registry';
import { createInitialWorld } from '../src/domain/world-state';
import { validateWorldState } from '../src/domain/world-validation';
import type { RoomAccess, RoomDetailDto, RoomId, RoomRole, RoomSummaryDto, UserId } from '../src/online/types';
import type { WorldState } from '../src/domain/types';
import { db, nowIso, transaction } from './database';

interface RoomRow {
  id: string; owner_user_id: string; owner_username: string; name: string; description: string; access: RoomAccess;
  max_users: number; tags_json: string; snapshot_json: string; revision: number; updated_at: string;
}

export type RoomScope = 'popular' | 'mine' | 'friends' | 'recent';
export type PresenceCount = (roomId: RoomId) => number;

export function createRoom(userId: UserId, input: { name: string; description?: string; access?: RoomAccess; maxUsers?: number }): RoomDetailDto {
  const name = cleanRoomName(input.name);
  const roomId = randomUUID();
  const now = nowIso();
  const world = blankRoomWorld(roomId);
  db.query(`
    INSERT INTO rooms(id, owner_user_id, name, description, access, max_users, tags_json, snapshot_json, revision, created_at, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, '[]', ?, 0, ?, ?)
  `).run(roomId, userId, name, (input.description ?? '').trim().slice(0, 240), input.access ?? 'open', clampUsers(input.maxUsers), JSON.stringify(world), now, now);
  return roomDetail(roomId, userId, () => 0)!;
}

export function roomDetail(roomId: RoomId, userId: UserId, presence: PresenceCount): RoomDetailDto | null {
  const row = roomRow(roomId);
  if (!row) return null;
  return { ...toSummary(row, presence(row.id)), role: roomRole(roomId, userId) };
}

export function listRooms(userId: UserId, scope: RoomScope, search: string, presence: PresenceCount): readonly RoomSummaryDto[] {
  const query = search.trim().slice(0, 60);
  const like = `%${query}%`;
  let rows: RoomRow[];
  if (scope === 'mine') {
    rows = db.query<RoomRow, [string, string, string]>(`${BASE_SELECT} WHERE r.owner_user_id = ? AND (r.name LIKE ? OR r.description LIKE ?) ORDER BY r.updated_at DESC LIMIT 80`).all(userId, like, like);
  } else if (scope === 'friends') {
    rows = db.query<RoomRow, [string, string, string, string]>(`${BASE_SELECT}
      JOIN friendships f ON f.status = 'accepted' AND ((f.user_low = ? AND f.user_high = r.owner_user_id) OR (f.user_high = ? AND f.user_low = r.owner_user_id))
      WHERE (r.name LIKE ? OR r.description LIKE ?) ORDER BY r.updated_at DESC LIMIT 80`).all(userId, userId, like, like);
  } else if (scope === 'recent') {
    rows = db.query<RoomRow, [string, string, string]>(`${BASE_SELECT}
      JOIN recent_rooms rr ON rr.room_id = r.id AND rr.user_id = ?
      WHERE (r.name LIKE ? OR r.description LIKE ?) ORDER BY rr.last_joined_at DESC LIMIT 80`).all(userId, like, like);
  } else {
    rows = db.query<RoomRow, [string, string]>(`${BASE_SELECT} WHERE (r.name LIKE ? OR r.description LIKE ?) ORDER BY r.updated_at DESC LIMIT 120`).all(like, like)
      .sort((a, b) => presence(b.id) - presence(a.id) || b.updated_at.localeCompare(a.updated_at));
  }
  return rows.map((row) => toSummary(row, presence(row.id)));
}

export function updateRoom(userId: UserId, roomId: RoomId, input: Partial<{ name: string; description: string; access: RoomAccess; maxUsers: number }>): RoomDetailDto {
  if (roomRole(roomId, userId) !== 'owner') throw new Error('Only the room owner can change room settings.');
  const current = roomRow(roomId);
  if (!current) throw new Error('Room not found.');
  const name = input.name === undefined ? current.name : cleanRoomName(input.name);
  const description = input.description === undefined ? current.description : input.description.trim().slice(0, 240);
  const access = input.access ?? current.access;
  const maxUsers = input.maxUsers === undefined ? current.max_users : clampUsers(input.maxUsers);
  db.query('UPDATE rooms SET name = ?, description = ?, access = ?, max_users = ?, updated_at = ? WHERE id = ?')
    .run(name, description, access, maxUsers, nowIso(), roomId);
  return roomDetail(roomId, userId, () => 0)!;
}

export function roomRole(roomId: RoomId, userId: UserId): RoomRole {
  const room = db.query<{ owner_user_id: string }, [string]>('SELECT owner_user_id FROM rooms WHERE id = ?').get(roomId);
  if (!room) return 'visitor';
  if (room.owner_user_id === userId) return 'owner';
  const rights = db.query<{ role: string }, [string, string]>('SELECT role FROM room_permissions WHERE room_id = ? AND user_id = ?').get(roomId, userId);
  return rights ? 'rights' : 'visitor';
}

export function canJoinRoom(roomId: RoomId, userId: UserId): boolean {
  const row = db.query<{ owner_user_id: string; access: RoomAccess }, [string]>('SELECT owner_user_id, access FROM rooms WHERE id = ?').get(roomId);
  if (!row) return false;
  const role = roomRole(roomId, userId);
  if (role !== 'visitor') return true;
  if (row.access === 'open') return true;
  if (row.access === 'locked') return false;
  return areFriends(userId, row.owner_user_id);
}

export function loadRoomWorld(roomId: RoomId): WorldState {
  const row = db.query<{ snapshot_json: string }, [string]>('SELECT snapshot_json FROM rooms WHERE id = ?').get(roomId);
  if (!row) throw new Error('Room not found.');
  const world = JSON.parse(row.snapshot_json) as WorldState;
  const validation = validateWorldState(world);
  if (!validation.valid) throw new Error(`Stored room is invalid: ${validation.errors.join(' ')}`);
  return world;
}

export function saveRoomWorld(roomId: RoomId, liveWorld: WorldState): WorldState {
  return transaction(() => saveRoomWorldInTransaction(roomId, liveWorld));
}

export function saveRoomWorldInTransaction(roomId: RoomId, liveWorld: WorldState): WorldState {
  const persistent = persistentProjection(liveWorld);
  const validation = validateWorldState(persistent);
  if (!validation.valid) throw new Error(`Refusing to persist invalid room: ${validation.errors.join(' ')}`);
  const revision = (db.query<{ revision: number }, [string]>('SELECT revision FROM rooms WHERE id = ?').get(roomId)?.revision ?? 0) + 1;
  const saved = { ...persistent, revision };
  db.query('UPDATE rooms SET snapshot_json = ?, revision = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(saved), revision, nowIso(), roomId);
  return saved;
}

export function recordRoomJoin(userId: UserId, roomId: RoomId): void {
  db.query(`INSERT INTO recent_rooms(user_id, room_id, last_joined_at) VALUES(?, ?, ?)
    ON CONFLICT(user_id, room_id) DO UPDATE SET last_joined_at = excluded.last_joined_at`).run(userId, roomId, nowIso());
}

export function roomOwnerId(roomId: RoomId): UserId | null {
  return db.query<{ owner_user_id: string }, [string]>('SELECT owner_user_id FROM rooms WHERE id = ?').get(roomId)?.owner_user_id ?? null;
}

export function roomNameById(roomId: RoomId): string | null {
  return db.query<{ name: string }, [string]>('SELECT name FROM rooms WHERE id = ?').get(roomId)?.name ?? null;
}

function roomRow(roomId: RoomId): RoomRow | null { return db.query<RoomRow, [string]>(`${BASE_SELECT} WHERE r.id = ?`).get(roomId) ?? null; }
function toSummary(row: RoomRow, userCount: number): RoomSummaryDto {
  return { id: row.id, ownerUserId: row.owner_user_id, ownerUsername: row.owner_username, name: row.name, description: row.description, access: row.access, maxUsers: row.max_users, tags: parseTags(row.tags_json), userCount, updatedAt: row.updated_at };
}
function blankRoomWorld(roomId: RoomId): WorldState {
  const seed = createInitialWorld();
  return { ...seed, id: roomId, revision: 0, entities: [] };
}
function persistentProjection(world: WorldState): WorldState {
  return { ...world, entities: world.entities.filter((entity) => {
    const kind = getEntityPrototype(entity.prototypeId).kind;
    return kind === 'furni' || kind === 'effect';
  }) };
}
function areFriends(a: UserId, b: UserId): boolean {
  const [low, high] = a < b ? [a, b] : [b, a];
  return Boolean(db.query<{ status: string }, [string, string]>("SELECT status FROM friendships WHERE user_low = ? AND user_high = ? AND status = 'accepted'").get(low, high));
}
function cleanRoomName(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ').slice(0, 48);
  if (name.length < 2) throw new Error('Room names need at least 2 characters.');
  return name;
}
function clampUsers(value?: number): number { return Math.max(1, Math.min(50, Math.round(value ?? 25))); }
function parseTags(value: string): readonly string[] { try { return JSON.parse(value) as string[]; } catch { return []; } }

const BASE_SELECT = `SELECT r.id, r.owner_user_id, u.username owner_username, r.name, r.description, r.access, r.max_users, r.tags_json, r.snapshot_json, r.revision, r.updated_at FROM rooms r JOIN users u ON u.id = r.owner_user_id`;

export function listRoomEditors(ownerUserId: UserId, roomId: RoomId): readonly { userId: UserId; username: string }[] {
  if (roomOwnerId(roomId) !== ownerUserId) throw new Error('Only the room owner can manage editor rights.');
  return db.query<{ user_id: string; username: string }, [string]>(`
    SELECT p.user_id, u.username
    FROM room_permissions p JOIN users u ON u.id = p.user_id
    WHERE p.room_id = ? AND p.role = 'rights'
    ORDER BY lower(u.username)
  `).all(roomId).map((row) => ({ userId: row.user_id, username: row.username }));
}

export function grantRoomEditor(ownerUserId: UserId, roomId: RoomId, username: string): { userId: UserId; username: string } {
  if (roomOwnerId(roomId) !== ownerUserId) throw new Error('Only the room owner can manage editor rights.');
  const normalized = username.trim();
  const user = db.query<{ id: string; username: string }, [string]>('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE').get(normalized);
  if (!user) throw new Error('That username does not exist.');
  if (user.id === ownerUserId) throw new Error('The room owner already has full rights.');
  db.query(`
    INSERT INTO room_permissions(room_id, user_id, role)
    VALUES(?, ?, 'rights')
    ON CONFLICT(room_id, user_id) DO UPDATE SET role = 'rights'
  `).run(roomId, user.id);
  return { userId: user.id, username: user.username };
}

export function revokeRoomEditor(ownerUserId: UserId, roomId: RoomId, editorUserId: UserId): void {
  if (roomOwnerId(roomId) !== ownerUserId) throw new Error('Only the room owner can manage editor rights.');
  db.query("DELETE FROM room_permissions WHERE room_id = ? AND user_id = ? AND role = 'rights'").run(roomId, editorUserId);
}
