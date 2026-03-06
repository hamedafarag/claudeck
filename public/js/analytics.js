// Analytics dashboard
import { $ } from './dom.js';
import { escapeHtml } from './utils.js';
import * as api from './api.js';
import { registerCommand } from './commands.js';

function formatCost(n) {
  if (n >= 100) return '$' + n.toFixed(0);
  if (n >= 1) return '$' + n.toFixed(2);
  return '$' + n.toFixed(4);
}

function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function pct(value, max) {
  return max > 0 ? Math.round((value / max) * 100) : 0;
}

function renderBarChart(container, items, labelKey, valueKey, formatFn = String) {
  container.innerHTML = '';
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="analytics-empty">No data</div>';
    return;
  }
  const maxVal = Math.max(...items.map(d => d[valueKey]), 0.001);
  for (const item of items) {
    const p = pct(item[valueKey], maxVal);
    const row = document.createElement('div');
    row.className = 'cost-chart-row';
    row.innerHTML = `
      <span class="cost-chart-label">${escapeHtml(String(item[labelKey]))}</span>
      <div class="cost-chart-bar-bg"><div class="cost-chart-bar" style="width:${p}%"></div></div>
      <span class="cost-chart-value">${formatFn(item[valueKey])}</span>
    `;
    container.appendChild(row);
  }
}

function sortTable(tbody, colIdx, numeric) {
  const current = tbody.dataset.sortCol === String(colIdx) && tbody.dataset.sortDir === 'desc' ? 'asc' : 'desc';
  tbody.dataset.sortCol = colIdx;
  tbody.dataset.sortDir = current;
  const rows = [...tbody.querySelectorAll('tr')];
  rows.sort((a, b) => {
    const aVal = a.children[colIdx].textContent;
    const bVal = b.children[colIdx].textContent;
    if (!numeric) return current === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    const aNum = parseFloat(aVal.replace(/[$,%km]/g, '')) || 0;
    const bNum = parseFloat(bVal.replace(/[$,%km]/g, '')) || 0;
    return current === 'asc' ? aNum - bNum : bNum - aNum;
  });
  tbody.innerHTML = '';
  rows.forEach(r => tbody.appendChild(r));
}

function renderTable(container, columns, rows) {
  if (!rows || rows.length === 0) {
    container.innerHTML += '<div class="analytics-empty">No data</div>';
    return;
  }
  const table = document.createElement('table');
  table.className = 'cost-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  columns.forEach((col, idx) => {
    const th = document.createElement('th');
    th.textContent = col.label;
    th.onclick = () => sortTable(tbody, idx, col.numeric);
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    columns.forEach(col => {
      const td = document.createElement('td');
      const val = row[col.key];
      td.textContent = col.format ? col.format(val) : (val ?? '');
      if (col.title && row[col.title]) td.title = row[col.title];
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  const wrap = document.createElement('div');
  wrap.className = 'cost-table-container';
  wrap.appendChild(table);
  container.appendChild(wrap);
}

function section(title) {
  const div = document.createElement('div');
  div.className = 'analytics-section';
  const h4 = document.createElement('h4');
  h4.textContent = title;
  div.appendChild(h4);
  return div;
}

function renderAnalytics(data) {
  const el = $.analyticsContent;
  el.innerHTML = '';

  // 1. Overview cards
  const o = data.overview;
  const cardsDiv = document.createElement('div');
  cardsDiv.className = 'analytics-cards';
  cardsDiv.innerHTML = `
    <div class="cost-card">
      <div class="cost-card-label">Total Cost</div>
      <div class="cost-card-value">${formatCost(o.totalCost)}</div>
    </div>
    <div class="cost-card">
      <div class="cost-card-label">Sessions</div>
      <div class="cost-card-value">${formatNumber(o.sessions)}</div>
    </div>
    <div class="cost-card">
      <div class="cost-card-label">Queries</div>
      <div class="cost-card-value">${formatNumber(o.queries)}</div>
    </div>
    <div class="cost-card">
      <div class="cost-card-label">Turns</div>
      <div class="cost-card-value">${formatNumber(o.totalTurns)}</div>
    </div>
    <div class="cost-card">
      <div class="cost-card-label">Output Tokens</div>
      <div class="cost-card-value">${formatNumber(o.totalOutputTokens)}</div>
    </div>
    <div class="cost-card">
      <div class="cost-card-label">Error Rate</div>
      <div class="cost-card-value${o.errorRate > 5 ? ' analytics-error-value' : ''}">${o.errorRate.toFixed(1)}%</div>
    </div>
  `;
  el.appendChild(cardsDiv);

  // 2. Daily Activity
  const dailySec = section('Daily Activity (Last 30 Days)');
  const dailyChart = document.createElement('div');
  dailyChart.className = 'cost-chart';
  renderBarChart(dailyChart, data.dailyBreakdown, 'date', 'cost', v => formatCost(v));
  dailyChart.querySelectorAll('.cost-chart-label').forEach(lbl => {
    lbl.textContent = lbl.textContent.slice(5);
  });
  dailySec.appendChild(dailyChart);
  el.appendChild(dailySec);

  // 3. Hourly Activity
  const hourlySec = section('Activity by Hour');
  const hourlyChart = document.createElement('div');
  hourlyChart.className = 'cost-chart';
  const hourMap = new Map(data.hourlyActivity.map(h => [h.hour, h]));
  const allHours = [];
  for (let h = 0; h < 24; h++) {
    allHours.push(hourMap.get(h) || { hour: h, queries: 0, cost: 0 });
  }
  renderBarChart(hourlyChart, allHours, 'hour', 'queries', v => String(v));
  hourlyChart.querySelectorAll('.cost-chart-label').forEach(lbl => {
    const h = parseInt(lbl.textContent);
    lbl.textContent = `${h.toString().padStart(2, '0')}:00`;
  });
  hourlySec.appendChild(hourlyChart);
  el.appendChild(hourlySec);

  // 4. Project Breakdown
  if (data.projectBreakdown.length > 1) {
    const projSec = section('Project Breakdown');
    renderTable(projSec, [
      { label: 'Project', key: 'name' },
      { label: 'Sessions', key: 'sessions', numeric: true },
      { label: 'Queries', key: 'queries', numeric: true },
      { label: 'Cost', key: 'totalCost', numeric: true, format: formatCost },
      { label: 'Avg Cost', key: 'avgCost', numeric: true, format: formatCost },
      { label: 'Avg Turns', key: 'avgTurns', numeric: true, format: v => String(Math.round(v)) },
    ], data.projectBreakdown);
    el.appendChild(projSec);
  }

  // 5. Tool Usage
  if (data.toolUsage.length > 0) {
    const toolSec = section('Tool Usage');
    const toolChart = document.createElement('div');
    toolChart.className = 'cost-chart';
    const errorMap = new Map((data.toolErrors || []).map(e => [e.name, e]));
    const maxCount = Math.max(...data.toolUsage.map(t => t.count), 1);
    for (const tool of data.toolUsage) {
      const p = pct(tool.count, maxCount);
      const row = document.createElement('div');
      row.className = 'cost-chart-row';
      const err = errorMap.get(tool.name);
      const errHtml = err
        ? ` <span class="analytics-error-badge">${err.errors} err (${err.errorRate.toFixed(0)}%)</span>`
        : '';
      row.innerHTML = `
        <span class="cost-chart-label">${escapeHtml(tool.name)}</span>
        <div class="cost-chart-bar-bg"><div class="cost-chart-bar" style="width:${p}%"></div></div>
        <span class="cost-chart-value">${tool.count}${errHtml}</span>
      `;
      toolChart.appendChild(row);
    }
    toolSec.appendChild(toolChart);
    el.appendChild(toolSec);
  }

  // 6. Top Sessions
  if (data.topSessions.length > 0) {
    const sesSec = section('Top Sessions by Cost');
    renderTable(sesSec, [
      { label: 'Session', key: 'title', format: v => v || 'Untitled' },
      { label: 'Project', key: 'project' },
      { label: 'Cost', key: 'cost', numeric: true, format: formatCost },
      { label: 'Turns', key: 'turns', numeric: true },
      { label: 'Duration', key: 'duration_min', numeric: true, format: v => v > 0 ? Math.round(v) + 'm' : '-' },
    ], data.topSessions);
    el.appendChild(sesSec);
  }

  // 7. Session Depth
  if (data.sessionDepth.length > 0) {
    const depthSec = section('Session Depth');
    const depthChart = document.createElement('div');
    depthChart.className = 'cost-chart';
    renderBarChart(depthChart, data.sessionDepth, 'bucket', 'count', String);
    depthSec.appendChild(depthChart);
    el.appendChild(depthSec);
  }

  // 8. Message Length Distribution
  if (data.msgLength.length > 0) {
    const msgSec = section('Message Length Distribution');
    const msgChart = document.createElement('div');
    msgChart.className = 'cost-chart';
    renderBarChart(msgChart, data.msgLength, 'bucket', 'count', String);
    msgSec.appendChild(msgChart);
    el.appendChild(msgSec);
  }

  // 9. Top Bash Commands
  if (data.topBashCommands.length > 0) {
    const bashSec = section('Top Bash Commands');
    renderTable(bashSec, [
      { label: 'Command', key: 'command' },
      { label: 'Count', key: 'count', numeric: true },
    ], data.topBashCommands);
    el.appendChild(bashSec);
  }

  // 10. Top Files
  if (data.topFiles.length > 0) {
    const filesSec = section('Top Files');
    renderTable(filesSec, [
      { label: 'Path', key: 'path', format: v => v ? v.split('/').slice(-2).join('/') : '', title: 'path' },
      { label: 'Tool', key: 'tool' },
      { label: 'Count', key: 'count', numeric: true },
    ], data.topFiles);
    el.appendChild(filesSec);
  }
}

function populateProjectFilter() {
  const select = document.getElementById('analytics-project-filter');
  const options = $.projectSelect.options;
  select.innerHTML = '<option value="">All Projects</option>';
  for (let i = 0; i < options.length; i++) {
    if (options[i].value) {
      const opt = document.createElement('option');
      opt.value = options[i].value;
      opt.textContent = options[i].textContent;
      select.appendChild(opt);
    }
  }
  if ($.projectSelect.value) {
    select.value = $.projectSelect.value;
  }
}

export async function openAnalytics() {
  $.analyticsModal.classList.remove('hidden');
  populateProjectFilter();
  await loadAnalyticsData();
}

async function loadAnalyticsData() {
  const filter = document.getElementById('analytics-project-filter');
  const projectPath = filter ? filter.value : '';
  $.analyticsContent.innerHTML = '<div class="analytics-loading">Loading analytics...</div>';
  try {
    const data = await api.fetchAnalytics(projectPath || undefined);
    renderAnalytics(data);
  } catch (err) {
    $.analyticsContent.innerHTML = `<div class="analytics-empty">Failed to load analytics: ${escapeHtml(err.message)}</div>`;
  }
}

function closeAnalytics() {
  $.analyticsModal.classList.add('hidden');
}

// Event listeners
$.analyticsBtn.addEventListener('click', openAnalytics);
$.analyticsClose.addEventListener('click', closeAnalytics);
$.analyticsModal.addEventListener('click', (e) => {
  if (e.target === $.analyticsModal) closeAnalytics();
});

document.getElementById('analytics-project-filter').addEventListener('change', loadAnalyticsData);

registerCommand('analytics', {
  category: 'app',
  description: 'Open analytics dashboard',
  execute() {
    openAnalytics();
  },
});
