/**
 * Cloudflare Worker: TMDB proxy with Bearer secret.
 *
 * - Set secret: wrangler secret put TMDB_BEARER
 * - Deploy: wrangler deploy
 */
const DEFAULT_ORIGIN = '*';
const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': origin || DEFAULT_ORIGIN,
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
});

class RateLimiter {
  /** @param {number} capacity tokens, @param {number} refillPerSec tokens/sec */
  constructor(capacity, refillPerSec) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.buckets = new Map();
  }
  _refill(bucket) {
    const now = Date.now() / 1000;
    const elapsed = Math.max(0, now - bucket.last);
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerSec);
    bucket.last = now;
  }
  allow(key) {
    const now = Date.now() / 1000;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.capacity, last: now };
      this.buckets.set(key, bucket);
    }
    this._refill(bucket);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }
}

const BAD_USER_AGENTS = [
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /scrapy/i,
  /go-http-client/i,
  /httpclient/i,
  /postman/i,
  /insomnia/i,
];

const limiter = new RateLimiter(30, 0.5);

export default {
  async fetch(request, env, ctx) {
    const allowedOrigin = env.ALLOWED_ORIGIN || DEFAULT_ORIGIN;
    const headers = corsHeaders(allowedOrigin);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+/, '');
    if (!path) return new Response('Missing path', { status: 400, headers });

    const bearer = env.TMDB_BEARER;
    if (!bearer) return new Response('Missing TMDB_BEARER', { status: 500, headers });

    // Origin enforcement (if configured)
    if (allowedOrigin !== '*' ) {
      const origin = request.headers.get('Origin') || '';
      const referer = request.headers.get('Referer') || '';
      const ok = origin === allowedOrigin || referer.startsWith(allowedOrigin);
      if (!ok) return new Response('Forbidden', { status: 403, headers });
    }

    // Bot UA block (simple)
    const ua = request.headers.get('User-Agent') || '';
    if (BAD_USER_AGENTS.some(rx => rx.test(ua))) {
      return new Response('Blocked', { status: 403, headers });
    }

    // Rate limit per IP
    const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
    if (!limiter.allow(ip)) {
      return new Response('Too Many Requests', { status: 429, headers });
    }

    const isCacheable = request.method === 'GET' || request.method === 'HEAD';
    const cacheKey = new Request(`https://tmdb-cache/${path}${url.search}`, { method: 'GET' });

    if (isCacheable) {
      const cached = await caches.default.match(cacheKey);
      if (cached) {
        return cached;
      }
    }

    if (isCacheable && env.TMDB_CACHE) {
      const kvKey = `${path}${url.search}`;
      try {
        const kvValue = await env.TMDB_CACHE.get(kvKey);
        if (kvValue) {
          const kvResp = new Response(kvValue, {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, s-maxage=7200, max-age=7200, stale-while-revalidate=86400',
              ...headers,
            }
          });
          try { ctx && ctx.waitUntil && ctx.waitUntil(caches.default.put(cacheKey, kvResp.clone())); } catch {}
          return kvResp;
        }
      } catch {}
    }

    const target = `https://api.themoviedb.org/3/${path}${url.search}`;
    const upstreamReq = new Request(target, {
      method: request.method,
      headers: {
        'Authorization': `Bearer ${bearer}`,
        'Content-Type': 'application/json'
      },
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text()
    });

    const resp = await fetch(upstreamReq);

    const mergedHeaders = {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=7200, max-age=7200, stale-while-revalidate=86400',
      ...headers,
    };

    if (!isCacheable || resp.status >= 400) {
      return new Response(resp.body, { status: resp.status, headers: mergedHeaders });
    }

    const cacheable = new Response(resp.body, { status: resp.status, headers: mergedHeaders });
    try { await caches.default.put(cacheKey, cacheable.clone()); } catch {}
    if (env.TMDB_CACHE) {
      try {
        const bodyText = await cacheable.clone().text();
        await env.TMDB_CACHE.put(`${path}${url.search}`, bodyText, { expirationTtl: 7200 });
      } catch {}
    }
    return cacheable;
  }
};