# NBA Quick News Cloudflare Worker

This Worker owns the complete production content pipeline for NBA Quick News.
It uses the existing `NEWS_KV` and `AI` bindings and the existing 30-minute
Cron trigger. No additional Cloudflare resources are required.

## Pipeline

1. Fetch RealGM RSS.
2. Normalize each story and generate a stable `newsId`.
3. Store new stories as `pending`.
4. Select fresh and backlog stories without starving either group.
5. Optionally read article text through Jina Reader.
6. Ask Qwen for structured Chinese editorial copy.
7. Validate JSON shape, language, facts, category, and fact level.
8. Store the result as `accepted`, `rejected`, or `failed`.
9. Materialize only `accepted` stories into `news.json`.

## KV Keys

- `news:catalog:v1`: bounded list of known `newsId` values.
- `news:item:<newsId>`: source, editorial state, retry metadata, and accepted copy.
- `news.json`: read-optimized public payload for the frontend.

Per-story keys keep failures isolated. The catalog and public payload are each
written at most once per refresh.

## AI Output

The model must return strict JSON with:

- `titleZh`
- `summaryZh`
- `categoryZh`
- `tagsZh`
- `confidence`
- `factLevel`

The Worker never uses model reasoning text as content. Empty output caused by a
token limit gets one bounded retry. Any invalid, fabricated, overconfident, or
mixed-language output is rejected and scheduled for a later retry.

## Routes

- `GET /health`
- `GET /data/news.json`
- `GET /refresh`

`/refresh` accepts the existing `REFRESH_TOKEN` through the
`x-refresh-token` header or the existing query parameter. Never commit or log
the secret value.

## Commands

```bash
npm test
npm run worker:dev
npm run worker:deploy
```
