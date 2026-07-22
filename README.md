# NBA Quick News

NBA Quick News is a clean static NBA news reader powered by RealGM and Yahoo Sports NBA RSS feeds.

## Local Setup

```bash
npm install
```

## Fetch News Locally

```bash
npm run fetch
```

This reads the configured NBA RSS feeds, parses them with `fast-xml-parser`, cleans summaries, assigns categories, and writes `public/data/news.json`. If fetching fails and an old JSON file exists, the script leaves the old file untouched.

## Local Preview

```bash
npm run dev
```

Open the local Vite URL shown in the terminal.

## Build

```bash
npm run build
```

The production site is generated in `dist/`.

## GitHub Pages Deployment

1. Push this repository to GitHub as `nba-quick-news`.
2. In GitHub, open `Settings > Pages`.
3. Set the source to `GitHub Actions`.
4. The included `Deploy GitHub Pages` workflow builds the Vite app and publishes `dist/`.

The Vite base path is configured for the project site URL `/nba-quick-news/`.

## GitHub Actions News Updates

`.github/workflows/update-news.yml` runs every 30 minutes and can also be started manually with `workflow_dispatch`.

The workflow:

1. Installs dependencies with `npm ci`.
2. Runs `npm run fetch`.
3. Checks whether `public/data/news.json` changed.
4. Commits changes back to the repository with `chore: update NBA news feed`.

The frontend reads `data/news.json` under the configured Vite base path, so it works both locally and on the GitHub Pages project URL.

## Free-First AI Policy

The scheduled workflow keeps GitHub Models disabled by default to avoid background usage of AI quota. RSS fetching, GitHub Actions for this public repository, and GitHub Pages deployment are intended to stay on free GitHub services.

To manually fill missing Chinese summaries, run the workflow with:

- `backfill_ai=true` (this enables GitHub Models only for that manual run)
- `github_models_max_items=5` by default

The script still enforces a hard safety cap of 30 items per run. If GitHub Models free quota or rate limits are exhausted, the workflow logs the issue and keeps existing news data instead of writing English text into Chinese summary fields.

For richer summaries from article text, manually run the workflow with:

- `github_models_enabled=true`
- `jina_reader_enabled=true`
- Keep `github_models_max_items=5` while testing, or use `10` when you want to fill more summaries in one run

The AI prompt asks for a short human-style Chinese retelling, not a title translation: 2-3 sentences, roughly 120-220 Chinese characters, based on the RSS text plus the article text Jina Reader can extract. Jina Reader does not require an account for basic usage. If anonymous rate limits become a problem later, add a free or paid Jina key as the optional repository secret `JINA_API_KEY`; the site still works without it.
