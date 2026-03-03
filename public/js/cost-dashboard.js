// Cost dashboard
import { $ } from './dom.js';
import { escapeHtml } from './utils.js';
import * as api from './api.js';
import { registerCommand } from './commands.js';

function formatTokenCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

export async function loadStats() {
  try {
    const cwd = $.projectSelect.value;
    const data = await api.fetchStats(cwd || undefined);
    if (data.totalCost != null) {
      $.totalCostEl.textContent = "$" + data.totalCost.toFixed(2);
    }
    if (data.projectCost != null) {
      $.projectCostEl.textContent = "$" + data.projectCost.toFixed(2);
    } else {
      $.projectCostEl.textContent = "$0.00";
    }
  } catch (err) {
    console.error("Failed to load stats:", err);
  }
}

export async function loadAccountInfo() {
  try {
    const data = await api.fetchAccountInfo();
    if (data.email) {
      $.accountEmail.textContent = data.email;
      $.accountPlan.textContent = data.plan ? `[${data.plan}]` : "";
    } else {
      $.accountEmail.textContent = "---";
      $.accountPlan.textContent = "";
    }
  } catch (err) {
    console.error("Failed to load account info:", err);
  }
}

async function openCostDashboard() {
  $.costDashboardModal.classList.remove("hidden");
  const cwd = $.projectSelect.value;
  try {
    const data = await api.fetchDashboard(cwd || undefined);
    renderCostDashboard(data);
  } catch (err) {
    console.error("Failed to load cost dashboard:", err);
  }
}

function renderCostDashboard(data) {
  const cardsEl = document.getElementById("cost-summary-cards");
  const todayCost = data.timeline
    .filter((t) => t.date === new Date().toISOString().slice(0, 10))
    .reduce((sum, t) => sum + t.cost, 0);

  const tokens = data.totalTokens || { input_tokens: 0, output_tokens: 0 };
  const totalTok = tokens.input_tokens + tokens.output_tokens;

  cardsEl.innerHTML = `
    <div class="cost-card">
      <div class="cost-card-label">Total</div>
      <div class="cost-card-value">$${data.totalCost.toFixed(2)}</div>
    </div>
    <div class="cost-card">
      <div class="cost-card-label">Project</div>
      <div class="cost-card-value">$${(data.projectCost ?? data.totalCost).toFixed(2)}</div>
    </div>
    <div class="cost-card">
      <div class="cost-card-label">Today</div>
      <div class="cost-card-value">$${todayCost.toFixed(4)}</div>
    </div>
    <div class="cost-card">
      <div class="cost-card-label">Tokens</div>
      <div class="cost-card-value">${formatTokenCount(totalTok)}</div>
      <div class="cost-card-sub">${formatTokenCount(tokens.input_tokens)} in / ${formatTokenCount(tokens.output_tokens)} out</div>
    </div>
  `;

  const tbody = document.getElementById("cost-table-body");
  tbody.innerHTML = "";
  for (const s of data.sessions) {
    if (s.total_cost === 0) continue;
    const tr = document.createElement("tr");
    const sTok = (s.input_tokens || 0) + (s.output_tokens || 0);
    tr.innerHTML = `
      <td title="${escapeHtml(s.id)}">${escapeHtml(s.title || s.project_name || "Session")}</td>
      <td>${s.turns}</td>
      <td>${formatTokenCount(sTok)}</td>
      <td>$${s.total_cost.toFixed(4)}</td>
    `;
    tbody.appendChild(tr);
  }

  const colIndex = { title: 0, turns: 1, tokens: 2, cost: 3 };
  document.querySelectorAll(".cost-table th[data-sort]").forEach((th) => {
    th.onclick = () => {
      const key = th.dataset.sort;
      const idx = colIndex[key] ?? 0;
      const rows = [...tbody.querySelectorAll("tr")];
      rows.sort((a, b) => {
        const aVal = a.children[idx].textContent;
        const bVal = b.children[idx].textContent;
        if (key === "title") return aVal.localeCompare(bVal);
        return parseFloat(bVal.replace(/[$,k]/g, "")) - parseFloat(aVal.replace(/[$,k]/g, ""));
      });
      tbody.innerHTML = "";
      rows.forEach((r) => tbody.appendChild(r));
    };
  });

  const chartEl = document.getElementById("cost-chart");
  chartEl.innerHTML = "";
  if (data.timeline.length === 0) {
    chartEl.innerHTML = '<div style="color: var(--text-dim); font-size: 12px; padding: 8px;">No cost data yet</div>';
    return;
  }
  const maxCost = Math.max(...data.timeline.map((t) => t.cost), 0.001);
  for (const day of data.timeline) {
    const pct = Math.round((day.cost / maxCost) * 100);
    const row = document.createElement("div");
    row.className = "cost-chart-row";
    row.innerHTML = `
      <span class="cost-chart-label">${day.date.slice(5)}</span>
      <div class="cost-chart-bar-bg"><div class="cost-chart-bar" style="width: ${pct}%"></div></div>
      <span class="cost-chart-value">$${day.cost.toFixed(2)}</span>
    `;
    chartEl.appendChild(row);
  }
}

// Event listeners
document.querySelector(".term-costs").addEventListener("click", openCostDashboard);
$.costModalClose.addEventListener("click", () => {
  $.costDashboardModal.classList.add("hidden");
});
$.costDashboardModal.addEventListener("click", (e) => {
  if (e.target === $.costDashboardModal) $.costDashboardModal.classList.add("hidden");
});

registerCommand("costs", {
  category: "app",
  description: "Open cost dashboard",
  execute() {
    openCostDashboard();
  },
});
