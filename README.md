# Movie Night

Static site built with Vite. Uses a Cloudflare Worker to proxy TMDB (so no client token).

## Local dev

1. Create `.env`:
```
VITE_TMDB_PROXY_URL=https://tmdb-proxy.<your-subdomain>.workers.dev
```
2. Run dev:
```
npm run dev
```

## Build
```
npm run build
```
Output in `dist/`.

## Cloudflare Worker
- Source: `worker/tmdb-proxy.js`
- Deploy:
```
wrangler secret put TMDB_BEARER
wrangler deploy
```

## Deploy to GitHub Pages
- Workflow: `.github/workflows/pages.yml`
- In repo settings → Pages → set source to GitHub Actions
- Set repository variable `VITE_TMDB_PROXY_URL` to your worker URL
