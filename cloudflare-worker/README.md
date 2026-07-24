# NBA Quick News Cloudflare Worker

This Worker is the Cloudflare-side RSS refresh and Chinese summary pipeline for NBA Quick News.

It does not replace the frontend data source yet. The frontend still reads its own `/data/news.json` until Worker output quality is verified.

## What It Does

- `GET /data/news.json`: read the latest generated payload from Workers KV.
- `GET /refresh`: fetch RSS, optionally read articles through Jina Reader, summarize selected items with Workers AI, and write `news.json` to KV.
- Cron trigger: runs every 30 minutes.

## Existing Cloudflare Resources

Do not recreate these resources:

- Worker: `nba-quick-news-worker`
- KV binding: `NEWS_KV`
- Workers AI binding: `AI`
- Cron: `*/30 * * * *`

## Useful Commands

```bash
npm run worker:dev
npm run worker:deploy
```

After deployment:

```text
https://nba-quick-news-worker.cibstan1999.workers.dev/health
https://nba-quick-news-worker.cibstan1999.workers.dev/data/news.json
```

The manual refresh endpoint is protected by a Cloudflare secret. Do not commit or document the secret value.

## Environment Variables

These defaults are in `wrangler.jsonc`:

```text
AI_ENABLED=true
AI_MODEL=@cf/qwen/qwen3-30b-a3b-fp8
AI_MAX_ITEMS_PER_RUN=3
JINA_READER_ENABLED=true
ARTICLE_CHAR_LIMIT=5000
SUMMARY_CACHE_VERSION=cf-summary-v3-qwen3
```

## Summary Strategy

The Worker does not translate titles. It keeps the English original title and uses Workers AI only to generate:

- `summaryZh`: 2-3 sentence Chinese recap.
- `oneLineZh`: one-line Chinese quick hit for today's brief.

Workers AI output is cached in KV by a source hash, so unchanged articles do not consume AI requests again. The `SUMMARY_CACHE_VERSION` value intentionally changes when prompt and validation quality changes.

## Quality Checks

Worker output is validated before being cached:

- Rejects generic copy such as "相关消息更新" or "后续动向".
- Rejects obvious mixed Chinese/English machine phrases.
- Preserves explicit money, years, picks, and other strict facts when present.
- Keeps rumors uncertain and analysis/opinion framed as analysis/opinion.
- Tracks `aiRejected`, `aiFailed`, `aiAccepted`, `aiCacheHits`, and `aiRejectionSamples` in `lastFetchStatus`.
