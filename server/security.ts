import { Elysia } from 'elysia';

interface RateBucket { count: number; resetAt: number; }
const mutationBuckets = new Map<string, RateBucket>();
const WINDOW_MS = 60_000;
const MAX_MUTATIONS_PER_WINDOW = 180;
const MAX_BODY_BYTES = 128 * 1024;
const TRUST_PROXY = process.env.TRUST_PROXY === '1'
  || process.env.TRUST_PROXY === 'true'
  || process.env.ROOMLAB_TRUST_PROXY === '1';

export const securityPlugin = new Elysia({ name: 'security' })
  .onRequest(({ request, server, set }) => {
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      set.status = 413;
      return { error: 'Request body is too large.' };
    }
    if (isSafeMethod(request.method)) return;
    const origin = request.headers.get('origin');
    if (origin && origin !== effectiveOrigin(request)) {
      set.status = 403;
      return { error: 'Cross-origin mutation blocked.' };
    }
    const address = clientAddress(request, server?.requestIP(request)?.address);
    const now = Date.now();
    const key = `${address}:${request.method}`;
    const current = mutationBuckets.get(key);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + WINDOW_MS } : current;
    bucket.count += 1;
    mutationBuckets.set(key, bucket);
    if (bucket.count > MAX_MUTATIONS_PER_WINDOW) {
      set.status = 429;
      set.headers['retry-after'] = String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
      return { error: 'Too many requests. Try again shortly.' };
    }
    if (mutationBuckets.size > 10_000) pruneBuckets(now);
  })
  .onAfterHandle(({ request, set }) => {
    set.headers['x-content-type-options'] = 'nosniff';
    set.headers['referrer-policy'] = 'strict-origin-when-cross-origin';
    set.headers['x-frame-options'] = 'DENY';
    set.headers['permissions-policy'] = 'camera=(), microphone=(), geolocation=()';
    set.headers['content-security-policy'] = "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; worker-src 'self' blob:";
    if (effectiveProtocol(request) === 'https') set.headers['strict-transport-security'] = 'max-age=31536000; includeSubDomains';
  });

export function effectiveOrigin(request: Request, trustProxy = TRUST_PROXY, appOrigin = process.env.APP_ORIGIN): string {
  const configured = appOrigin?.replace(/\/$/, '');
  if (configured) return configured;
  const url = new URL(request.url);
  if (!trustProxy) return url.origin;
  const host = firstForwarded(request.headers.get('x-forwarded-host')) ?? request.headers.get('host');
  if (!host) return url.origin;
  return `${effectiveProtocol(request, trustProxy)}://${host}`;
}

export function clientAddress(request: Request, direct?: string, trustProxy = TRUST_PROXY): string {
  if (trustProxy) return firstForwarded(request.headers.get('x-forwarded-for')) ?? direct ?? 'direct';
  return direct ?? 'direct';
}

function effectiveProtocol(request: Request, trustProxy = TRUST_PROXY): 'http' | 'https' {
  if (trustProxy) {
    const forwarded = firstForwarded(request.headers.get('x-forwarded-proto'));
    if (forwarded === 'https' || forwarded === 'http') return forwarded;
  }
  return new URL(request.url).protocol === 'https:' ? 'https' : 'http';
}
function firstForwarded(value: string | null): string | null { return value?.split(',')[0]?.trim() || null; }
function isSafeMethod(method: string): boolean { return method === 'GET' || method === 'HEAD' || method === 'OPTIONS'; }
function pruneBuckets(now: number): void { for (const [key, bucket] of mutationBuckets) if (bucket.resetAt <= now) mutationBuckets.delete(key); }
