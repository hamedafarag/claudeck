// Home page — AI Activity contribution grid + summary cards
import { $ } from '../core/dom.js';
import { on as onState, setState, getState } from '../core/store.js';
import { fetchHomeData } from '../core/api.js';
import { loadHomeAnalytics } from './analytics.js';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── View switching ─────────────────────────────────────
const chatAreaMain = document.querySelector('.chat-area-main');

// ── Data loading ───────────────────────────────────────
let loaded = false;

async function loadHome() {
  loaded = false;
  try {
    const data = await fetchHomeData();
    renderGrid(data.yearlyActivity);
    renderCards(data.yearlyActivity, data.overview);
    loadHomeAnalytics();
    loaded = true;
  } catch (err) {
    console.error('Failed to load home data:', err);
  }
}

onState('view', (view) => {
  $.homePage.classList.toggle('hidden', view !== 'home');
  chatAreaMain.classList.toggle('hidden', view !== 'chat');
  $.homeBtn.classList.toggle('active', view === 'home');
  if (view === 'home') loadHome();
});

onState('sessionId', (id) => {
  if (id) setState('view', 'chat');
});

$.homeBtn.addEventListener('click', () => {
  setState('view', 'home');
  setState('sessionId', null);
  $.projectSelect.value = '';
  localStorage.removeItem('claudeck-cwd');
  $.sessionList.innerHTML = '';
});

// ── Grid rendering ─────────────────────────────────────
function renderGrid(activity) {
  const grid = document.getElementById('home-activity-grid');
  const monthsRow = document.getElementById('home-grid-months');
  const yearLabel = document.getElementById('home-year-label');

  // Build date map
  const dateMap = {};
  for (const row of activity) {
    dateMap[row.date] = row;
  }

  // Today and start date (364 days ago, aligned to Sunday)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - 364);
  // Align to Sunday (day 0)
  const dayOfWeek = start.getDay();
  start.setDate(start.getDate() - dayOfWeek);

  yearLabel.textContent = `${start.getFullYear()} – ${today.getFullYear()}`;

  // Collect all cells with their scores
  const cells = [];
  const scores = [];
  const d = new Date(start);

  while (d <= today) {
    const key = localDateStr(d);
    const row = dateMap[key];
    let score = 0;
    if (row) {
      score = row.sessions + row.queries + (row.cost * 50) + ((row.input_tokens + row.output_tokens) / 5000);
    }
    cells.push({ date: key, row, score });
    if (score > 0) scores.push(score);
    d.setDate(d.getDate() + 1);
  }

  // Quartile thresholds
  scores.sort((a, b) => a - b);
  const p25 = scores[Math.floor(scores.length * 0.25)] || 0;
  const p50 = scores[Math.floor(scores.length * 0.50)] || 0;
  const p75 = scores[Math.floor(scores.length * 0.75)] || 0;

  function getLevel(score) {
    if (score === 0) return 0;
    if (score <= p25) return 1;
    if (score <= p50) return 2;
    if (score <= p75) return 3;
    return 4;
  }

  // Render cells
  grid.innerHTML = '';
  for (const cell of cells) {
    const div = document.createElement('div');
    div.className = 'home-grid-cell';
    div.dataset.level = getLevel(cell.score);
    div.dataset.date = cell.date;
    if (cell.row) {
      div.dataset.sessions = cell.row.sessions;
      div.dataset.queries = cell.row.queries;
      div.dataset.cost = cell.row.cost.toFixed(2);
      div.dataset.tokens = (cell.row.input_tokens + cell.row.output_tokens).toString();
    }
    grid.appendChild(div);
  }

  // Month labels
  monthsRow.innerHTML = '';
  let currentMonth = -1;
  let weekIndex = 0;
  const cellSize = 15; // 12px + 3px gap
  const dc = new Date(start);

  while (dc <= today) {
    if (dc.getDay() === 0) { // start of week
      const m = dc.getMonth();
      if (m !== currentMonth) {
        const span = document.createElement('span');
        span.textContent = MONTHS[m];
        span.style.marginLeft = (weekIndex * cellSize) + 'px';
        span.style.position = 'absolute';
        monthsRow.appendChild(span);
        currentMonth = m;
      }
      weekIndex++;
    }
    dc.setDate(dc.getDate() + 1);
  }
  monthsRow.style.position = 'relative';
  monthsRow.style.height = '16px';

  // Tooltip
  setupTooltip(grid);
}

// ── Tooltip ────────────────────────────────────────────
let tooltip = null;

function setupTooltip(grid) {
  grid.addEventListener('mouseover', (e) => {
    const cell = e.target.closest('.home-grid-cell');
    if (!cell) return;
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'home-grid-tooltip';
      document.body.appendChild(tooltip);
    }
    const date = cell.dataset.date;
    const sessions = cell.dataset.sessions || '0';
    const queries = cell.dataset.queries || '0';
    const cost = cell.dataset.cost || '0.00';
    const tokens = cell.dataset.tokens || '0';

    tooltip.innerHTML = `<strong>${date}</strong><br>` +
      `${sessions} sessions &middot; ${queries} queries<br>` +
      `${formatTokens(+tokens)} tokens &middot; $${cost}`;
    tooltip.style.display = 'block';
  });

  grid.addEventListener('mousemove', (e) => {
    if (tooltip) {
      tooltip.style.left = (e.clientX + 12) + 'px';
      tooltip.style.top = (e.clientY - 40) + 'px';
    }
  });

  grid.addEventListener('mouseout', (e) => {
    if (!e.target.closest('.home-grid-cell')) return;
    if (tooltip) tooltip.style.display = 'none';
  });
}

// ── Summary cards ──────────────────────────────────────
function renderCards(activity, overview) {
  const cards = document.getElementById('home-cards');

  // Streak calculations
  const activeDates = new Set(activity.map(r => r.date));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = localDateStr(today);

  // Current streak
  let currentStreak = 0;
  const d = new Date(today);
  while (true) {
    const key = localDateStr(d);
    if (activeDates.has(key)) {
      currentStreak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  // Longest streak
  let longestStreak = 0;
  let streak = 0;
  const sortedDates = [...activeDates].sort();
  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0) {
      streak = 1;
    } else {
      const prev = new Date(sortedDates[i - 1]);
      const curr = new Date(sortedDates[i]);
      const diff = (curr - prev) / 86400000;
      streak = diff === 1 ? streak + 1 : 1;
    }
    longestStreak = Math.max(longestStreak, streak);
  }

  // Today's stats
  const todayData = activity.find(r => r.date === todayKey);
  const todayCost = todayData ? todayData.cost : 0;
  const todayQueries = todayData ? todayData.queries : 0;

  const totalTokens = overview.totalOutputTokens || 0;
  const totalSessions = overview.sessions || 0;
  const totalCost = overview.totalCost || 0;

  const cardData = [
    { label: 'Sessions', value: totalSessions.toLocaleString(), sub: 'all time' },
    { label: 'Total Cost', value: '$' + totalCost.toFixed(2), sub: 'all time' },
    { label: 'Output Tokens', value: formatTokens(totalTokens), sub: 'all time' },
    { label: 'Current Streak', value: currentStreak + 'd', sub: currentStreak > 0 ? 'active' : 'no activity today' },
    { label: 'Longest Streak', value: longestStreak + 'd', sub: 'consecutive days' },
    { label: 'Today', value: todayQueries + ' queries', sub: '$' + todayCost.toFixed(2) },
  ];

  cards.innerHTML = cardData.map(c => `
    <div class="home-card">
      <div class="home-card-label">${c.label}</div>
      <div class="home-card-value">${c.value}</div>
      <div class="home-card-sub">${c.sub}</div>
    </div>
  `).join('');
}

// ── Helpers ────────────────────────────────────────────
function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return n.toString();
}

// If a session was already restored from localStorage before this module loaded,
// or a project was previously selected, switch to chat view; otherwise load home.
const savedProject = localStorage.getItem('claudeck-cwd');
if (getState('sessionId') || savedProject) {
  setState('view', 'chat');
} else if (getState('view') === 'home') {
  loadHome();
}
