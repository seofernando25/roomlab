# Room Lab deployment

Room Lab ships as one Bun/Elysia application container. The same Dockerfile has a `dev` target for the development container and a `production` target for Coolify.

## Production contract

- Runtime: Bun 1.3.14, pinned in `Dockerfile`.
- Container port: `3000`.
- Health endpoint: `GET /api/health`.
- Database: SQLite at `/app/data/roomlab.sqlite`.
- Persistent storage: mount a named volume at `/app/data`.
- Reverse proxy: set `TRUST_PROXY=1` only when the container is behind the trusted Coolify proxy.
- Replicas: **exactly 1** while `LiveRoomManager` is process-local. Horizontal scaling requires an explicit room-session ownership/pub-sub design first.
- The production process runs as the non-root `bun` user.

## Coolify

Use a source-controlled Application from the public GitHub repository, Dockerfile build pack, branch `main`, and port `3000`.

Pushes to `main` are delivered through the application's signed GitHub manual webhook. Coolify builds the Dockerfile, whose build stage runs the test suite and TypeScript/Vite production build before producing the release image.

The public origin may change from the generated `sslip.io` domain to a custom domain without an application code change. Origin validation derives the external scheme/host from proxy headers only when `TRUST_PROXY=1`; untrusted forwarded headers are ignored.

## Persistence and releases

Coolify releases are disposable. Only `/app/data` is persistent. Do not store account, room, inventory, marketplace, friendship, or wallet state elsewhere in the container filesystem.

Before destructive database/schema work, take a SQLite-consistent backup or VPS snapshot. A deployment/restart must preserve `/app/data`; verify `/api/health` after every release.

## Local verification

```sh
bun run verify

docker build --target production -t roomlab:local .
```

The Docker production image also runs tests and `bun run build` during its build stage, so a failing test/build cannot produce a normal release image.
