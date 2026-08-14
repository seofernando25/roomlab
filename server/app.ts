import { openapi } from '@elysia/openapi';
import { Elysia, t } from 'elysia';
import { resolve } from 'node:path';
import { accountForToken, SESSION_COOKIE } from './auth-service';
import { seedStoreOffers } from './economy-service';
import { LiveRoomManager } from './live-room-manager';
import { RoomDirectoryHub } from './room-directory-hub';
import { parseRoomClientMessage } from './protocol';
import { accountRoutes } from './routes-account';
import { securityPlugin } from './security';
import { economyRoutes } from './routes-economy';
import { createFriendRoutes } from './routes-friends';
import { createRoomRoutes } from './routes-rooms';

export const roomDirectory = new RoomDirectoryHub();
export const liveRooms = new LiveRoomManager(() => roomDirectory.changed());
const DIST_DIR = resolve(import.meta.dir, '..', 'dist');
seedStoreOffers();

export const app = new Elysia({ websocket: { idleTimeout: 60, maxPayloadLength: 64 * 1024 } })
  .use(securityPlugin)
  .use(openapi({ path: '/openapi' }))
  .use(accountRoutes)
  .use(createRoomRoutes(liveRooms, () => roomDirectory.changed()))
  .use(economyRoutes)
  .use(createFriendRoutes(liveRooms, () => roomDirectory.changed()))
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
  .ws('/ws/directory', {
    cookie: t.Cookie({ [SESSION_COOKIE]: t.Optional(t.String()) }),
    open(ws) {
      const raw = ws.data.cookie[SESSION_COOKIE].value;
      const account = accountForToken(typeof raw === 'string' ? raw : null);
      if (!account) { ws.close(4001, 'Authentication is invalid.'); return; }
      roomDirectory.attach({ id: ws.id, send: (message) => ws.send(JSON.stringify(message)) });
    },
    message() { /* client keepalive */ },
    close(ws) { roomDirectory.detach(ws.id); },
  })
  .get('/', spaIndex)
  .get('/favicon.svg', () => Bun.file(resolve(DIST_DIR, 'favicon.svg')))
  .get('/assets/*', async ({ params, set }) => {
    const relative = params['*'];
    const assetsRoot = resolve(DIST_DIR, 'assets');
    const filePath = resolve(assetsRoot, relative);
    if (!relative || relative.includes('..') || !filePath.startsWith(`${assetsRoot}/`)) { set.status = 404; return 'Not found'; }
    const file = Bun.file(filePath);
    if (!(await file.exists())) { set.status = 404; return 'Not found'; }
    set.headers['cache-control'] = 'public, max-age=31536000, immutable';
    return file;
  })
  .get('/rooms', spaIndex)
  .get('/shop', spaIndex)
  .get('/items', spaIndex)
  .get('/friends', spaIndex)
  .get('/me', spaIndex)
  .get('/room/:id', spaIndex);

function spaIndex() {
  return new Response(Bun.file(resolve(DIST_DIR, 'index.html')), { headers: { 'cache-control': 'no-cache' } });
}

export type App = typeof app;
