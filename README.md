# NBA Quick News

NBA Quick News is an automated Chinese NBA editorial feed. RealGM RSS is the
source material; Cloudflare Workers AI produces structured Chinese copy after
the article passes local fact and language checks.

## Production Architecture

```text
RealGM RSS
  -> Cloudflare Worker normalization and stable newsId
  -> KV-backed AI processing queue
  -> Qwen no-think direct editorial JSON with one bounded parse retry
  -> JSON-mode fallback model when Qwen cannot produce an acceptable payload
  -> fact, rumor, language, and schema validation
  -> accepted records in Workers KV
  -> /data/news.json
  -> Vite frontend
```

Workers KV is the only production content source. The frontend does not merge
repository JSON with Worker output. It saves the latest successful Worker
payload in browser local storage and uses that copy only when the Worker is
temporarily unavailable.

## Local Development

Install dependencies:

```bash
npm install
```

Run the frontend:

```bash
npm run dev
```

The local site reads the production Worker API. Open:

```text
http://127.0.0.1:5173/nba-quick-news/
```

Run the deterministic pipeline tests:

```bash
npm test
```

Build for GitHub Pages:

```bash
npm run build
```

Build for the Cloudflare-connected frontend:

```bash
npm run build:cloudflare
```

## Cloudflare Worker

The existing Worker is configured in `cloudflare-worker/wrangler.jsonc`.

```bash
npm run worker:dev
npm run worker:deploy
```

Routes:

- `GET /health`: pipeline and queue health.
- `GET /data/news.json`: accepted editorial content.
- `GET /refresh`: protected manual refresh.

The production `REFRESH_TOKEN` is a Cloudflare secret. Do not add its value to
the repository, documentation, command history, or logs. The scheduled
Cloudflare Cron runs every 30 minutes and does not need the token.

## Editorial State

Every normalized story has one of these states:

- `pending`: waiting for AI processing.
- `processing`: currently being edited.
- `accepted`: passed all quality checks and may appear on the homepage.
- `rejected`: AI responded, but the copy failed validation.
- `failed`: the request failed or timed out.

Rejected and failed stories receive `retryCount`, `processedAt`, and
`nextRetryAt`. A failed story cannot block later queue items. The queue reserves
capacity for fresh news while continuing to drain older work.

Workers AI must return:

```json
{
  "titleZh": "",
  "summaryZh": "",
  "categoryZh": "",
  "tagsZh": [],
  "confidence": 0.0,
  "factLevel": "confirmed"
}
```

Rumors and analysis must retain uncertain wording. Contract money, contract
length, named teams, named players, scores, and major trade assets are checked
against the RSS and extracted article evidence.

Qwen is the primary Chinese editor. It receives `/no_think` instructions and
must return only a directly parseable JSON object. If Qwen returns empty content,
stops at its token limit, or produces invalid JSON, the Worker retries Qwen once
with a larger output budget. Reasoning is never parsed or logged as copy. If the
retry is still unusable, or if a parsed result fails the quality gate, the Worker
uses the bounded JSON-mode model configured by `AI_FALLBACK_MODEL`. Every path
passes the same local validation before a story can become `accepted`.

## GitHub Actions

- `deploy-pages.yml` builds and deploys the frontend to GitHub Pages.
- `update-news.yml` now validates the Worker pipeline and frontend build only.

GitHub Actions no longer fetches RSS or commits `public/data/news.json`.
Cloudflare Cron and Workers KV own the production content lifecycle.
