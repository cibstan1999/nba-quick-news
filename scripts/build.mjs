import { spawnSync } from 'node:child_process';

const isCloudflarePages = ['1', 'true'].includes(String(process.env.CF_PAGES || '').toLowerCase());
const base = process.env.VITE_BASE || (isCloudflarePages ? '/' : '/nba-quick-news/');

const result = spawnSync(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'build', `--base=${base}`],
  { stdio: 'inherit' }
);

process.exit(result.status ?? 1);
