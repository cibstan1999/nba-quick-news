# NBA Quick News Cloudflare Worker Prototype

This is a parallel prototype for moving RSS refresh and Chinese summaries from GitHub Actions to Cloudflare Workers.

It does not replace the current GitHub Pages / Cloudflare Pages frontend yet.

## What It Does

- `GET /data/news.json`: read the latest generated payload from Workers KV.
- `GET /refresh`: fetch RSS, optionally read articles through Jina Reader, summarize selected items with Workers AI, and write `news.json` to KV.
- Cron trigger: runs every 30 minutes.

## Cloudflare Resources

Create one Workers KV namespace:

```bash
npx wrangler kv namespace create NBA_QUICK_NEWS
```

Copy the returned namespace id into `cloudflare-worker/wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  {
    "binding": "NEWS_KV",
    "id": "YOUR_NAMESPACE_ID"
  }
]
```

The Worker also uses a Workers AI binding:

```jsonc
"ai": {
  "binding": "AI"
}
```

No personal AI API key is needed for Workers AI.

## Useful Commands

```bash
npm run worker:dev
npm run worker:deploy
```

After deployment:

```text
https://<worker-domain>/refresh
https://<worker-domain>/data/news.json
```

If you set `REFRESH_TOKEN` as a Worker secret, call refresh with:

```text
https://<worker-domain>/refresh?token=<REFRESH_TOKEN>
```

## Environment Variables

These defaults are in `wrangler.jsonc`:

```text
AI_ENABLED=true
AI_MODEL=@cf/meta/llama-3.1-8b-instruct
AI_MAX_ITEMS_PER_RUN=5
JINA_READER_ENABLED=true
ARTICLE_CHAR_LIMIT=5000
SUMMARY_CACHE_VERSION=cf-summary-v1
```

Recommended first test:

```text
AI_MAX_ITEMS_PER_RUN=3
```

Once quality and usage look good, increase to 5.

## Summary Strategy

The Worker does not translate titles. It keeps the English original title and uses Workers AI only to generate:

- `summaryZh`: 2-3 sentence Chinese recap.
- `oneLineZh`: one-line Chinese quick hit for today's brief.

Workers AI output is cached in KV by a source hash, so unchanged articles do not consume AI requests again.

## Current Status

This is a prototype. The existing GitHub Actions RSS job remains the source of truth until the Worker output is manually verified.
