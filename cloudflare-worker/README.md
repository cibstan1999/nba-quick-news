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
6. Ask Qwen for no-think, directly parseable Chinese editorial JSON.
7. Retry Qwen once with a larger output budget when content is empty, truncated, or invalid.
8. Use one bounded JSON-mode fallback review when Qwen is still unusable or rejected.
9. Validate language, facts, category, fact level, names, amounts, and duration.
10. Store the result as `accepted`, `rejected`, or `failed`.
11. Materialize only `accepted` stories into `news.json`.

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

The Worker never uses or logs model reasoning text as content. Qwen must return a
complete JSON object directly. Empty, length-limited, or invalid JSON receives
one bounded Qwen retry; `AI_FALLBACK_MODEL` then provides the existing structured
JSON review if needed. Any result that remains invalid, fabricated, overconfident,
or mixed-language is rejected and scheduled for a later retry.

The default models are:

- Primary: `@cf/qwen/qwen3-30b-a3b-fp8`
- Structured fallback: `@cf/meta/llama-3.1-8b-instruct-fast`

## Routes

- `GET /health`
- `GET /data/news.json`
- `GET /refresh`
- `GET /debug/reprocess`: list up to 20 rejected records.
- `POST /debug/reprocess`: run one rejected `newsId` through the existing AI pipeline without writing KV.

`/refresh` accepts the existing `REFRESH_TOKEN` through the
`x-refresh-token` header or the existing query parameter. Never commit or log
the secret value.

The temporary `/debug/reprocess` route is stricter: `REFRESH_TOKEN` must be
configured and is accepted only through the `x-refresh-token` header. A POST
body must contain `{ "newsId": "news_...", "dryRun": true }`. The route clones
the rejected record in memory, returns whitelisted Qwen and quality-gate
diagnostics, and never updates the record, catalog, or public `news.json`.

## Commands

```bash
npm test
npm run worker:dev
npm run worker:deploy
```
