import './style.css';

const categories = ['最新', '交易', '签约', '伤病', '选秀', '季后赛', '其他'];

const app = document.querySelector('#app');

const state = {
  items: [],
  updatedAt: '',
  query: '',
  category: '最新',
  loading: true,
  error: ''
};

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value, options = {}) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options
  }).format(date);
}

function getFilteredItems() {
  const query = state.query.trim().toLowerCase();

  return state.items.filter((item) => {
    const matchesCategory = state.category === '最新' || item.category === state.category;
    const haystack = `${item.title} ${item.summary} ${item.category}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    return matchesCategory && matchesQuery;
  });
}

function render() {
  const filteredItems = getFilteredItems();
  const updatedLabel = state.updatedAt
    ? formatDate(state.updatedAt, { year: 'numeric', second: '2-digit' })
    : 'Waiting for first update';

  app.innerHTML = `
    <main class="shell">
      <header class="site-header">
        <div>
          <p class="eyebrow">NBA wiretap monitor</p>
          <h1>NBA Quick News</h1>
          <p class="subtitle">Real-time NBA wiretap from RealGM</p>
        </div>
        <div class="status-card" aria-label="Feed status">
          <span>Last updated</span>
          <strong>${escapeHtml(updatedLabel)}</strong>
        </div>
      </header>

      <section class="controls" aria-label="News filters">
        <label class="search">
          <span>Search</span>
          <input id="searchInput" type="search" value="${escapeHtml(state.query)}" placeholder="Search players, teams, topics..." autocomplete="off" />
        </label>
        <div class="category-tabs" role="tablist" aria-label="Categories">
          ${categories
            .map(
              (category) => `
                <button class="tab ${category === state.category ? 'active' : ''}" type="button" data-category="${category}" aria-selected="${category === state.category}">
                  ${category}
                </button>
              `
            )
            .join('')}
        </div>
      </section>

      ${state.error ? `<p class="notice">${escapeHtml(state.error)}</p>` : ''}

      <section class="news-meta" aria-live="polite">
        <span>${state.loading ? 'Loading feed...' : `${filteredItems.length} stories`}</span>
        <span>Source: RealGM</span>
      </section>

      <section class="news-list" aria-label="NBA news stories">
        ${
          filteredItems.length
            ? filteredItems.map(renderCard).join('')
            : `<article class="empty-state"><h2>No stories found</h2><p>Try a different keyword or category.</p></article>`
        }
      </section>
    </main>
  `;

  document.querySelector('#searchInput')?.addEventListener('input', (event) => {
    state.query = event.target.value;
    render();
    document.querySelector('#searchInput')?.focus();
  });

  document.querySelectorAll('[data-category]').forEach((button) => {
    button.addEventListener('click', () => {
      state.category = button.dataset.category;
      render();
    });
  });
}

function renderCard(item) {
  return `
    <article class="news-card">
      <div class="card-topline">
        <span class="pill">${escapeHtml(item.category || '其他')}</span>
        <time datetime="${escapeHtml(item.pubDate || '')}">${escapeHtml(formatDate(item.pubDate))}</time>
      </div>
      <h2><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></h2>
      <p>${escapeHtml(item.summary || 'No summary available.')}</p>
      <div class="card-footer">
        <span>RealGM</span>
        <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">Open original</a>
      </div>
    </article>
  `;
}

async function loadNews() {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/news.json`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Feed unavailable (${response.status})`);
    }

    const data = await response.json();
    state.items = Array.isArray(data.items) ? data.items : [];
    state.updatedAt = data.updatedAt || '';
  } catch (error) {
    state.error = 'Unable to load the local news feed. Run npm run fetch and try again.';
    console.error(error);
  } finally {
    state.loading = false;
    render();
  }
}

render();
loadNews();
