/**
 * Percentile calculator and table formatter for WebSocket performance tests.
 */

export function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

export function computeStats(latencies) {
  if (latencies.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0, stddev: 0 };
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;
  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / sorted.length;

  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    stddev: Math.sqrt(variance),
  };
}

function fmt(ms) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 1) return `${ms.toFixed(2)} ms`;
  return `${(ms * 1000).toFixed(1)} us`;
}

export function formatTable(label, stats) {
  const lines = [
    "",
    ` ${label}`,
    ` ${"─".repeat(36)}`,
    `  count   ${stats.count}`,
    `  min     ${fmt(stats.min)}`,
    `  p50     ${fmt(stats.p50)}`,
    `  p95     ${fmt(stats.p95)}`,
    `  p99     ${fmt(stats.p99)}`,
    `  max     ${fmt(stats.max)}`,
    `  mean    ${fmt(stats.mean)}`,
    `  stddev  ${fmt(stats.stddev)}`,
    "",
  ];
  return lines.join("\n");
}

export function formatSummary(results) {
  const header = ` ${"Scenario".padEnd(32)} ${"N".padStart(4)}  ${"p50".padStart(10)}  ${"p95".padStart(10)}  ${"p99".padStart(10)}`;
  const sep = ` ${"─".repeat(32)} ${"─".repeat(4)}  ${"─".repeat(10)}  ${"─".repeat(10)}  ${"─".repeat(10)}`;

  const rows = results.map((r) => {
    const p50 = r.unit === "msg/s" ? `${Math.round(r.stats.p50)} msg/s` : fmt(r.stats.p50);
    const p95 = r.unit === "msg/s" ? "-" : fmt(r.stats.p95);
    const p99 = r.unit === "msg/s" ? "-" : fmt(r.stats.p99);
    return ` ${r.label.padEnd(32)} ${String(r.n).padStart(4)}  ${p50.padStart(10)}  ${p95.padStart(10)}  ${p99.padStart(10)}`;
  });

  const lines = [
    "",
    " ══════════════════════════════════════════════════════════════════════════════",
    "                      Claudeck WebSocket Performance",
    " ══════════════════════════════════════════════════════════════════════════════",
    header,
    sep,
    ...rows,
    " ══════════════════════════════════════════════════════════════════════════════",
    "",
  ];
  return lines.join("\n");
}
