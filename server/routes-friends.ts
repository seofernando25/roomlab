import { Elysia, t } from 'elysia';
import { authenticatedAccount } from './http-auth';
import type { LiveRoomManager } from './live-room-manager';
import { acceptFriend, listFriends, removeFriend, requestFriend } from './friends-service';

export function createFriendRoutes(liveRooms: LiveRoomManager, directoryChanged: () => void = () => {}) {
  return new Elysia({ name: 'friend-routes' })
    .get('/api/friends', ({ request, set }) => {
      const account = authenticatedAccount(request);
      if (!account) { set.status = 401; return { error: 'Sign in first.' }; }
      return { friends: listFriends(account.id, (id) => liveRooms.presence(id)) };
    })
    .post('/api/friends/request', ({ request, body, set }) => {
      const account = authenticatedAccount(request);
      if (!account) { set.status = 401; return { error: 'Sign in first.' }; }
      try { requestFriend(account.id, body.username); directoryChanged(); return { ok: true }; }
      catch (error) { set.status = 409; return { error: error instanceof Error ? error.message : 'Could not send friend request.' }; }
    }, { body: t.Object({ username: t.String({ minLength: 3, maxLength: 18 }) }) })
    .post('/api/friends/:id/accept', ({ request, params, set }) => {
      const account = authenticatedAccount(request);
      if (!account) { set.status = 401; return { error: 'Sign in first.' }; }
      try { acceptFriend(account.id, params.id); directoryChanged(); return { ok: true }; }
      catch (error) { set.status = 409; return { error: error instanceof Error ? error.message : 'Could not accept friend request.' }; }
    })
    .delete('/api/friends/:id', ({ request, params, set }) => {
      const account = authenticatedAccount(request);
      if (!account) { set.status = 401; return { error: 'Sign in first.' }; }
      try { removeFriend(account.id, params.id); directoryChanged(); return { ok: true }; }
      catch (error) { set.status = 404; return { error: error instanceof Error ? error.message : 'Friendship not found.' }; }
    });
}
