# NBA Quick News

NBA Quick News is a clean static NBA news reader powered by the RealGM Wiretap RSS feed.

## Local Setup

```bash
npm install
```

## Fetch News Locally

```bash
npm run fetch
```

This reads `https://basketball.realgm.com/rss/wiretap/15/0.xml`, parses the RSS with `fast-xml-parser`, cleans summaries, assigns categories, and writes `public/data/news.json`. If fetching fails and an old JSON file exists, the script leaves the old file untouched.

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
