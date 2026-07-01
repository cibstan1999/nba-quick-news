import './style.css';

const categories = ['最新', '交易', '签约', '伤病', '选秀', '季后赛', '其他'];

const app = document.querySelector('#app');

const state = {
  items: [],
  highlights: [],
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
    const haystack = `${item.title} ${item.titleZh} ${item.summary} ${item.summaryZh} ${item.category}`.toLowerCase();
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
          <p class="eyebrow">NBA 中文速览</p>
          <h1>NBA Quick News</h1>
          <p class="subtitle">3 分钟刷完 NBA 今日流言、签约与交易。</p>
        </div>
        <div class="status-card" aria-label="Feed status">
          <span>最后更新</span>
          <strong>${escapeHtml(updatedLabel)}</strong>
        </div>
      </header>

      <section class="controls" aria-label="News filters">
        <label class="search">
          <span>搜索</span>
          <input id="searchInput" type="search" value="${escapeHtml(state.query)}" placeholder="搜索球员、球队、交易、伤病..." autocomplete="off" />
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

      ${renderHighlights()}

      <section class="news-meta" aria-live="polite">
        <span>${state.loading ? '正在加载...' : `${filteredItems.length} 条新闻`}</span>
        <span>来源：RealGM / Yahoo Sports</span>
      </section>

      <section class="news-list" aria-label="NBA news stories">
        ${
          filteredItems.length
            ? filteredItems.map(renderCard).join('')
            : `<article class="empty-state"><h2>没有找到相关新闻</h2><p>换个关键词或分类试试。</p></article>`
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

function renderHighlights() {
  if (!state.highlights.length) return '';

  return `
    <section class="highlights" aria-label="今日速览">
      <div class="section-heading">
        <h2>今日速览</h2>
        <span>打开就知道重点</span>
      </div>
      <ul>
        ${state.highlights
          .map(
            (item) => `
              <li>
                <span class="mini-pill">${escapeHtml(item.category || 'NBA')}</span>
                <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.text)}</a>
              </li>
            `
          )
          .join('')}
      </ul>
    </section>
  `;
}

function renderCard(item) {
  const titleZh = item.titleZh || item.title;
  const summaryZh = item.summaryZh || item.summary || '暂无摘要。';
  const source = item.source || 'Original source';

  return `
    <article class="news-card ${item.imageUrl ? 'has-image' : ''}">
      ${
        item.imageUrl
          ? `<a class="thumb" href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" aria-label="Open original image source">
              <img src="${escapeHtml(item.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />
            </a>`
          : ''
      }
      <div class="card-body">
        <div class="card-topline">
          <time datetime="${escapeHtml(item.pubDate || '')}">${escapeHtml(formatDate(item.pubDate))}</time>
        </div>
        <h2><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(titleZh)}</a></h2>
        <p class="summary">${escapeHtml(summaryZh)}</p>
        <div class="card-tags">
          <span class="pill">${escapeHtml(item.category || '其他')}</span>
          ${item.isMerged ? '<span class="merged-note">多源报道</span>' : ''}
        </div>
        <details class="original-title">
          <summary>英文原题</summary>
          <p>${escapeHtml(item.title)}</p>
        </details>
        <div class="card-footer">
          <span>${escapeHtml(source)} 原文${item.imageUrl ? ' / 图片预览来自原站元数据' : ''}</span>
          <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">查看原文</a>
        </div>
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
    state.highlights = Array.isArray(data.highlights) ? data.highlights : [];
    state.updatedAt = data.updatedAt || '';
  } catch (error) {
    state.error = '无法读取本地新闻数据。请运行 npm run fetch 后重试。';
    console.error(error);
  } finally {
    state.loading = false;
    render();
  }
}

render();
loadNews();
