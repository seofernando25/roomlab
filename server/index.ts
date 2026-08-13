import { app, liveRooms } from './app';
import { closeDatabase } from './database';

const port = Number(process.env.PORT ?? 3001);
app.listen({ hostname: process.env.HOST ?? '0.0.0.0', port });
console.log(`Room Lab server listening on http://${app.server?.hostname}:${app.server?.port}`);

function shutdown(): void {
  liveRooms.dispose();
  app.stop();
  closeDatabase();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
