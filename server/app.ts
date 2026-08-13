import { openapi } from '@elysia/openapi';
import { staticPlugin } from '@elysia/static';
import { Elysia, t } from 'elysia';
import { accountForToken, SESSION_COOKIE } from './auth-service';
import { seedStoreOffers } from './economy-service';
import { LiveRoomManager } from './live-room-manager';
import { parseRoomClientMessage } from './protocol';
import { accountRoutes } from './routes-account';
import { securityPlugin } from './security';
import { economyRoutes } from './routes-economy';
import { createFriendRoutes } from './routes-friends';
import { createRoomRoutes } from './routes-rooms';

export const liveRooms = new LiveRoomManager();
seedStoreOffers();

export const app = new Elysia({ websocket: { idleTimeout: 60, maxPayloadLength: 64 * 1024 } })
  .use(securityPlugin)
  .use(openapi({ path: '/openapi' }))
  .use(accountRoutes)
  .use(createRoomRoutes(liveRooms))
  .use(economyRoutes)
  .use(createFriendRoutes(liveRooms))
  .get('/api/health', () => ({ ok: true, runtime: 'bun', realtimeRooms: true }))
  .ws('/ws/rooms/:roomId', {
    query: t.Object({ ticket: t.String({ minLength: 1 }) }),
    cookie: t.Cookie({ [SESSION_COOKIE]: t.Optional(t.String()) }),
    open(ws) {
      const raw = ws.data.cookie[SESSION_COOKIE].value;
      const account = accountForToken(typeof raw === 'string' ? raw : null);
      const attached = account && liveRooms.attach(ws.data.query.ticket, account.id, {
        id: ws.id,
        send: (message) => { ws.send(JSON.stringify(message)); },
      });
      if (!attached) ws.close(4001, 'Room session expired or authentication is invalid.');
    },
    message(ws, raw) {
      try {
        const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const message = parseRoomClientMessage(value);
        if (!message) { ws.close(4002, 'Invalid room command.'); return; }
        liveRooms.handle(ws.id, message);
      } catch { ws.close(4002, 'Invalid room command.'); }
    },
    close(ws) { liveRooms.detach(ws.id); },
  })
  .use(staticPlugin({ assets: 'dist', prefix: '', indexHTML: true, headers: { 'cache-control': 'no-cache' } }))
  .get('/rooms', spaIndex)
  .get('/shop', spaIndex)
  .get('/items', spaIndex)
  .get('/friends', spaIndex)
  .get('/me', spaIndex)
  .get('/room/:id', spaIndex);

function spaIndex() { return Bun.file('dist/index.html'); }

export type App = typeof app;
