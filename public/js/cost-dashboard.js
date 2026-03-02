// Cost dashboard
import { $ } from './dom.js';
import { escapeHtml } from './utils.js';
import * as api from './api.js';
import { registerCommand } from './commands.js';

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
  `;

  const tbody = document.getElementById("cost-table-body");
  tbody.innerHTML = "";
  for (const s of data.sessions) {
    if (s.total_cost === 0) continue;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td title="${escapeHtml(s.id)}">${escapeHtml(s.title || s.project_name || "Session")}</td>
      <td>${s.turns}</td>
      <td>$${s.total_cost.toFixed(4)}</td>
    `;
    tbody.appendChild(tr);
  }

  document.querySelectorAll(".cost-table th[data-sort]").forEach((th) => {
    th.onclick = () => {
      const key = th.dataset.sort;
      const rows = [...tbody.querySelectorAll("tr")];
      rows.sort((a, b) => {
        const aVal = a.children[key === "title" ? 0 : key === "turns" ? 1 : 2].textContent;
        const bVal = b.children[key === "title" ? 0 : key === "turns" ? 1 : 2].textContent;
        if (key === "title") return aVal.localeCompare(bVal);
        return parseFloat(bVal.replace("$", "")) - parseFloat(aVal.replace("$", ""));
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
