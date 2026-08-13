const children = [
  Bun.spawn(['bun', '--watch', 'server/index.ts'], { stdout: 'inherit', stderr: 'inherit', env: { ...process.env, PORT: process.env.PORT ?? '3001' } }),
  Bun.spawn(['bunx', 'vite', '--host', '127.0.0.1'], { stdout: 'inherit', stderr: 'inherit', env: process.env }),
];

function stop(): void {
  for (const child of children) child.kill();
  process.exit(0);
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
await Promise.race(children.map((child) => child.exited));
stop();
