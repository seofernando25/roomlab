import { Elysia, t } from 'elysia';
import type { RoomAccess } from '../src/online/types';
import { authenticatedAccount } from './http-auth';
import type { LiveRoomManager } from './live-room-manager';
import {
  createRoom,
  grantRoomEditor,
  listRoomEditors,
  listRooms,
  revokeRoomEditor,
  roomDetail,
  updateRoom,
  type RoomScope,
} from './room-repository';

const roomAccessSchema = t.Union([t.Literal('open'), t.Literal('friends'), t.Literal('locked')]);
const roomScopeSchema = t.Union([t.Literal('popular'), t.Literal('mine'), t.Literal('friends'), t.Literal('recent')]);

export function createRoomRoutes(liveRooms: LiveRoomManager, directoryChanged: () => void = () => {}) {
  return new Elysia({ name: 'room-routes' })
    .get('/api/rooms', ({ request, query, set }) => {
      const account = authenticatedAccount(request);
      if (!account) { set.status = 401; return { error: 'Sign in first.' }; }
      const scope = (query.scope ?? 'popular') as RoomScope;
      return { rooms: listRooms(account.id, scope, query.search ?? '', (id) => liveRooms.userCount(id)) };
    }, { query: t.Object({ scope: t.Optional(roomScopeSchema), search: t.Optional(t.String({ maxLength: 60 })) }) })
    .post('/api/rooms', ({ request, body, set }) => {
      const account = authenticatedAccount(request);
      if (!account) { set.status = 401; return { error: 'Sign in first.' }; }
      try {
        const room = createRoom(account.id, { name: body.name, ...(body.description === undefined ? {} : { description: body.description }), ...(body.access === undefined ? {} : { access: body.access as RoomAccess }), ...(body.maxUsers === undefined ? {} : { maxUsers: body.maxUsers }) });
        directoryChanged();
        return { room };
      } catch (error) {
        set.status = 400;
        return { error: error instanceof Error ? error.message : 'Could not create room.' };
      }
    }, { body: t.Object({ name: t.String({ minLength: 2, maxLength: 48 }), description: t.Optional(t.String({ maxLength: 240 })), access: t.Optional(roomAccessSchema), maxUsers: t.Optional(t.Integer({ minimum: 1, maximum: 50 })) }) })
    .get('/api/rooms/:id', ({ request, params, set }) => {
      const account = authenticatedAccount(request);
      if (!account) { set.status = 401; return { error: 'Sign in first.' }; }
      const room = roomDetail(params.id, account.id, (id) => liveRooms.userCount(id));
      if (!room) { set.status = 404; return { error: 'Room not found.' }; }
      return { room };
    })
    .patch('/api/rooms/:id', ({ request, params, body, set }) => {
      const account = authenticatedAccount(request);
      if (!account) { set.status = 401; return { error: 'Sign in first.' }; }
      try {
        const room = updateRoom(account.id, params.id, { ...(body.name === undefined ? {} : { name: body.name }), ...(body.description === undefined ? {} : { description: body.description }), ...(body.access === undefined ? {} : { access: body.access as RoomAccess }), ...(body.maxUsers === undefined ? {} : { maxUsers: body.maxUsers }) });
        directoryChanged();
        return { room };
      } catch (error) {
        set.status = 403;
        return { error: error instanceof Error ? error.message : 'Could not update room.' };
      }
    }, { body: t.Object({ name: t.Optional(t.String({ minLength: 2, maxLength: 48 })), description: t.Optional(t.String({ maxLength: 240 })), access: t.Optional(roomAccessSchema), maxUsers: t.Optional(t.Integer({ minimum: 1, maximum: 50 })) }) })
    .get('/api/rooms/:id/editors', ({ request, params, set }) => {
      const account = authenticatedAccount(request);
      if (!account) { set.status = 401; return { error: 'Sign in first.' }; }
      try { return { editors: listRoomEditors(account.id, params.id) }; }
      catch (error) { set.status = 403; return { error: error instanceof Error ? error.message : 'Could not load editor rights.' }; }
    })
    .post('/api/rooms/:id/editors', ({ request, params, body, set }) => {
      const account = authenticatedAccount(request);
      if (!account) { set.status = 401; return { error: 'Sign in first.' }; }
      try {
        const editor = grantRoomEditor(account.id, params.id, body.username);
        liveRooms.refreshUserRole(params.id, editor.userId);
        return { editor };
      } catch (error) {
        set.status = 409;
        return { error: error instanceof Error ? error.message : 'Could not grant editor rights.' };
      }
    }, { body: t.Object({ username: t.String({ minLength: 3, maxLength: 18 }) }) })
    .delete('/api/rooms/:id/editors/:userId', ({ request, params, set }) => {
      const account = authenticatedAccount(request);
      if (!account) { set.status = 401; return { error: 'Sign in first.' }; }
      try {
        revokeRoomEditor(account.id, params.id, params.userId);
        liveRooms.refreshUserRole(params.id, params.userId);
        return { ok: true };
      } catch (error) {
        set.status = 403;
        return { error: error instanceof Error ? error.message : 'Could not revoke editor rights.' };
      }
    })
    .post('/api/rooms/:id/join', ({ request, params, set }) => {
      const account = authenticatedAccount(request);
      if (!account) { set.status = 401; return { error: 'Sign in first.' }; }
      try { return { join: liveRooms.prepareJoin(account, params.id) }; }
      catch (error) { set.status = 403; return { error: error instanceof Error ? error.message : 'Could not join room.' }; }
    });
}
