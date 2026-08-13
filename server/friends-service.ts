import { randomUUID } from 'node:crypto';
import type { FriendDto, UserId } from '../src/online/types';
import { userIdByUsername } from './auth-service';
import { db, nowIso } from './database';

export interface PresenceInfo { readonly online: boolean; readonly roomId: string | null; readonly roomName: string | null; }
export type PresenceLookup = (userId: UserId) => PresenceInfo;

interface FriendshipRow {
  id: string; user_low: string; user_high: string; requester_user_id: string; status: 'pending' | 'accepted' | 'blocked';
}

export function listFriends(userId: UserId, presence: PresenceLookup): readonly FriendDto[] {
  const rows = db.query<FriendshipRow, [string, string]>(`
    SELECT id, user_low, user_high, requester_user_id, status FROM friendships
    WHERE (user_low = ? OR user_high = ?) AND status IN ('pending','accepted') ORDER BY updated_at DESC
  `).all(userId, userId);
  return rows.map((row) => {
    const otherId = row.user_low === userId ? row.user_high : row.user_low;
    const username = db.query<{ username: string }, [string]>('SELECT username FROM users WHERE id = ?').get(otherId)?.username ?? 'Unknown';
    const state: FriendDto['status'] = row.status === 'accepted' ? 'accepted' : row.requester_user_id === userId ? 'outgoing' : 'incoming';
    const online = presence(otherId);
    return { friendshipId: row.id, userId: otherId, username, status: state, online: online.online, roomId: online.roomId, roomName: online.roomName };
  }).sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));
}

export function requestFriend(userId: UserId, username: string): void {
  const targetId = userIdByUsername(username);
  if (!targetId) throw new Error('No user with that username was found.');
  if (targetId === userId) throw new Error('You cannot friend yourself.');
  const [low, high] = userId < targetId ? [userId, targetId] : [targetId, userId];
  const existing = db.query<FriendshipRow, [string, string]>('SELECT id, user_low, user_high, requester_user_id, status FROM friendships WHERE user_low = ? AND user_high = ?').get(low, high);
  if (existing?.status === 'accepted') throw new Error('You are already friends.');
  const now = nowIso();
  if (existing) {
    if (existing.status === 'blocked') throw new Error('That friendship cannot be requested.');
    db.query("UPDATE friendships SET requester_user_id = ?, status = 'pending', updated_at = ? WHERE id = ?").run(userId, now, existing.id);
    return;
  }
  db.query("INSERT INTO friendships(id, user_low, user_high, requester_user_id, status, created_at, updated_at) VALUES(?, ?, ?, ?, 'pending', ?, ?)")
    .run(randomUUID(), low, high, userId, now, now);
}

export function acceptFriend(userId: UserId, friendshipId: string): void {
  const row = db.query<FriendshipRow, [string]>('SELECT id, user_low, user_high, requester_user_id, status FROM friendships WHERE id = ?').get(friendshipId);
  if (!row || row.status !== 'pending' || row.requester_user_id === userId || (row.user_low !== userId && row.user_high !== userId)) {
    throw new Error('That friend request cannot be accepted.');
  }
  db.query("UPDATE friendships SET status = 'accepted', updated_at = ? WHERE id = ?").run(nowIso(), friendshipId);
}

export function removeFriend(userId: UserId, friendshipId: string): void {
  const result = db.query('DELETE FROM friendships WHERE id = ? AND (user_low = ? OR user_high = ?)').run(friendshipId, userId, userId);
  if (result.changes !== 1) throw new Error('Friendship not found.');
}

export function acceptedFriendIds(userId: UserId): readonly UserId[] {
  return db.query<{ user_low: string; user_high: string }, [string, string]>("SELECT user_low, user_high FROM friendships WHERE status = 'accepted' AND (user_low = ? OR user_high = ?)").all(userId, userId)
    .map((row) => row.user_low === userId ? row.user_high : row.user_low);
}
