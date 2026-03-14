// Tips Feed Panel
import { $ } from '../core/dom.js';
import { getState, on } from '../core/store.js';
import { registerCommand } from '../ui/commands.js';
import { fetchTips, fetchRssFeed } from '../core/api.js';

const LS_OPEN = 'claudeck-tips-feed';
const LS_CATEGORY = 'claudeck-tips-category';
const LS_WIDTH = 'claudeck-tips-width';

let tipsData = null;
let rssItems = {};    // feedId -> items[]
let activeCategory = localStorage.getItem(LS_CATEGORY) || 'all';

// ── Toggle ──────────────────────────────────────────────
export function toggleTipsFeed() {
  if (getState('parallelMode')) return;
  const panel = $.tipsFeedPanel;
  if (!panel) return;
  const isHidden = panel.classList.contains('hidden');
  if (isHidden) {
    openTipsFeed();
  } else {
    closeTipsFeed();
  }
}

function openTipsFeed() {
  if (getState('parallelMode')) return;
  const panel = $.tipsFeedPanel;
  if (!panel) return;
  panel.classList.remove('hidden');
  localStorage.setItem(LS_OPEN, '1');
  if ($.tipsFeedToggleBtn) $.tipsFeedToggleBtn.classList.add('active');

  // Restore width
  const savedWidth = localStorage.getItem(LS_WIDTH);
  if (savedWidth) panel.style.width = savedWidth + 'px';

  // Load data if not loaded
  if (!tipsData) loadTipsData();
}

function closeTipsFeed() {
  const panel = $.tipsFeedPanel;
  if (!panel) return;
  panel.classList.add('hidden');
  localStorage.setItem(LS_OPEN, '0');
  if ($.tipsFeedToggleBtn) $.tipsFeedToggleBtn.classList.remove('active');
}

// ── Data Loading ────────────────────────────────────────
async function loadTipsData() {
  const content = $.tipsFeedContent;
  if (!content) return;
  content.innerHTML = '<div class="tips-feed-loading">Loading tips...</div>';

  try {
    const [tipsResult, ...rssResults] = await Promise.allSettled([
      fetchTips(),
      // RSS feeds will be loaded after we know the feed URLs
    ]);

    if (tipsResult.status === 'fulfilled') {
      tipsData = tipsResult.value;
      // Now load RSS feeds
      if (tipsData.feeds) {
        const rssPromises = tipsData.feeds.map(feed =>
          fetchRssFeed(feed.url).then(data => ({ feedId: feed.id, feed, items: data.items || [] }))
        );
        const rssSettled = await Promise.allSettled(rssPromises);
        rssSettled.forEach(r => {
          if (r.status === 'fulfilled') {
            rssItems[r.value.feedId] = { feed: r.value.feed, items: r.value.items };
          }
        });
      }
    }

    renderFeed();
  } catch {
    content.innerHTML = '<div class="tips-feed-loading">Failed to load tips</div>';
  }
}

// ── Rendering ───────────────────────────────────────────
function renderFeed() {
  const content = $.tipsFeedContent;
  if (!content || !tipsData) return;

  content.innerHTML = '';

  // Tip of the day
  const totd = getTipOfTheDay();
  if (totd && (activeCategory === 'all' || activeCategory === totd.category)) {
    content.appendChild(renderTotd(totd));
  }

  // Category tabs
  renderTabs();

  // Filter tips
  const tips = activeCategory === 'all'
    ? tipsData.tips
    : tipsData.tips.filter(t => t.category === activeCategory);

  // Section: Curated Tips
  if (tips.length > 0) {
    const label = document.createElement('div');
    label.className = 'tips-feed-section-label';
    label.textContent = 'Curated Tips';
    content.appendChild(label);

    tips.forEach(tip => {
      if (totd && tip.id === totd.id) return; // skip totd duplicate
      content.appendChild(renderTipCard(tip));
    });
  }

  // Section: RSS Feed Items
  const rssEntries = Object.values(rssItems).filter(r =>
    activeCategory === 'all' || r.feed.category === activeCategory
  );

  if (rssEntries.length > 0) {
    const label = document.createElement('div');
    label.className = 'tips-feed-section-label';
    label.textContent = 'From the Web';
    content.appendChild(label);

    rssEntries.forEach(({ feed, items }) => {
      items.slice(0, 5).forEach(item => {
        content.appendChild(renderRssCard(item, feed));
      });
    });
  }
}

function getTipOfTheDay() {
  if (!tipsData || !tipsData.tips.length) return null;
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  return tipsData.tips[dayOfYear % tipsData.tips.length];
}

function renderTotd(tip) {
  const el = document.createElement('div');
  el.className = 'tips-feed-totd';
  const cat = tipsData.categories[tip.category];
  el.innerHTML = `
    <div class="tips-feed-totd-label">
      <span>${cat ? cat.icon : '>'}</span> tip of the day
    </div>
    <div class="tips-feed-totd-title">${escapeHtml(tip.title)}</div>
    <div class="tips-feed-totd-body">${escapeHtml(tip.body)}</div>
    ${renderExtLink(tip.source, 'Reference')}
  `;
  return el;
}

function renderTipCard(tip) {
  const el = document.createElement('div');
  el.className = 'tips-feed-card';
  const cat = tipsData.categories[tip.category];
  const iconColor = cat ? cat.color : 'var(--text-dim)';
  el.innerHTML = `
    <div class="tips-feed-card-header">
      <span class="tips-feed-card-icon" style="color:${iconColor}">${cat ? cat.icon : '?'}</span>
      <span class="tips-feed-card-title">${escapeHtml(tip.title)}</span>
    </div>
    <div class="tips-feed-card-body">${escapeHtml(tip.body)}</div>
    ${tip.tags ? `<div class="tips-feed-card-tags">${tip.tags.map(t => `<span class="tips-feed-card-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    ${renderExtLink(tip.source, 'Reference')}
  `;
  return el;
}

function renderRssCard(item, feed) {
  const el = document.createElement('div');
  el.className = 'tips-feed-rss-card';
  el.innerHTML = `
    <div class="tips-feed-rss-source">${escapeHtml(feed.name)}</div>
    <div class="tips-feed-rss-title">${escapeHtml(item.title)}</div>
    ${item.description ? `<div class="tips-feed-rss-desc">${escapeHtml(item.description)}</div>` : ''}
    ${renderExtLink(item.link, 'Read more')}
  `;
  return el;
}

function renderTabs() {
  const tabsContainer = document.querySelector('.tips-feed-tabs');
  if (!tabsContainer || !tipsData) return;

  tabsContainer.innerHTML = '';

  // "All" tab
  const allTab = document.createElement('button');
  allTab.className = 'tips-feed-tab' + (activeCategory === 'all' ? ' active' : '');
  allTab.textContent = 'All';
  allTab.addEventListener('click', () => setCategory('all'));
  tabsContainer.appendChild(allTab);

  // Category tabs
  Object.entries(tipsData.categories).forEach(([key, cat]) => {
    const tab = document.createElement('button');
    tab.className = 'tips-feed-tab' + (activeCategory === key ? ' active' : '');
    tab.innerHTML = `<span class="tips-feed-tab-icon">${cat.icon}</span>${cat.label}`;
    tab.addEventListener('click', () => setCategory(key));
    tabsContainer.appendChild(tab);
  });
}

function setCategory(cat) {
  activeCategory = cat;
  localStorage.setItem(LS_CATEGORY, cat);
  renderFeed();
}

// ── Resize ──────────────────────────────────────────────
function initResize() {
  const handle = $.tipsFeedResize;
  const panel = $.tipsFeedPanel;
  if (!handle || !panel) return;

  let startX, startWidth;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startWidth = panel.offsetWidth;
    handle.classList.add('dragging');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  function onMouseMove(e) {
    // Dragging left edge: increasing width means mouse moves left
    const diff = startX - e.clientX;
    const newWidth = Math.min(Math.max(startWidth + diff, 260), 600);
    panel.style.width = newWidth + 'px';
  }

  function onMouseUp() {
    handle.classList.remove('dragging');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    localStorage.setItem(LS_WIDTH, panel.offsetWidth);
  }
}

// ── Parallel Mode Safety ────────────────────────────────
on('parallelMode', (isParallel) => {
  if (isParallel) {
    closeTipsFeed();
    if ($.tipsFeedToggleBtn) $.tipsFeedToggleBtn.disabled = true;
  } else {
    if ($.tipsFeedToggleBtn) $.tipsFeedToggleBtn.disabled = false;
  }
});

// ── Helpers ─────────────────────────────────────────────
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const extLinkIcon = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

function renderExtLink(url, label) {
  if (!url) return '';
  return `<a class="tips-feed-ext-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${extLinkIcon} ${escapeHtml(label || 'Source')}</a>`;
}

// ── Init ────────────────────────────────────────────────
function init() {
  // Toggle button
  if ($.tipsFeedToggleBtn) {
    $.tipsFeedToggleBtn.addEventListener('click', toggleTipsFeed);
  }

  // Close button
  if ($.tipsFeedClose) {
    $.tipsFeedClose.addEventListener('click', closeTipsFeed);
  }

  // Resize
  initResize();

  // Restore state
  if (localStorage.getItem(LS_OPEN) === '1' && !getState('parallelMode')) {
    openTipsFeed();
  }
}

init();

// Register /tips slash command
registerCommand('tips', {
  category: 'app',
  description: 'Toggle tips feed panel',
  execute() {
    toggleTipsFeed();
  },
});
