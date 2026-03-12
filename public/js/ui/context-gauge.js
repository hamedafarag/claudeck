// Context Window Indicator — cumulative session token gauge (status bar)
import { getState, setState } from '../core/store.js';
import { $ } from '../core/dom.js';

const sbGaugeSep = document.getElementById("sb-gauge-sep");

const MODEL_LIMITS = {
  default: 200_000,
};

function getLimit() {
  return MODEL_LIMITS.default;
}

function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function renderGauge(tokens) {
  if (!$.contextGauge) return;

  const total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheCreation;
  const limit = getLimit();
  const pct = Math.min((total / limit) * 100, 100);

  // Show gauge
  $.contextGauge.classList.remove('hidden');
  if (sbGaugeSep) sbGaugeSep.classList.remove('hidden');

  // Fill width
  $.contextGaugeFill.style.width = pct + '%';

  // Color class
  $.contextGaugeFill.classList.remove('warning', 'critical');
  $.contextGauge.classList.remove('warning', 'critical');
  if (pct >= 80) {
    $.contextGaugeFill.classList.add('critical');
    $.contextGauge.classList.add('critical');
  } else if (pct >= 50) {
    $.contextGaugeFill.classList.add('warning');
    $.contextGauge.classList.add('warning');
  }

  // Label
  $.contextGaugeLabel.textContent = `${formatTokens(total)}/${formatTokens(limit)}`;

  // Tooltip breakdown
  $.contextGauge.title = [
    `Input: ${formatTokens(tokens.input)}`,
    `Output: ${formatTokens(tokens.output)}`,
    `Cache Read: ${formatTokens(tokens.cacheRead)}`,
    `Cache Create: ${formatTokens(tokens.cacheCreation)}`,
    `Total: ${formatTokens(total)} / ${formatTokens(limit)}`,
  ].join('\n');
}

export function updateContextGauge(input, output, cacheRead, cacheCreation) {
  const tokens = getState('sessionTokens');
  tokens.input += (input || 0);
  tokens.output += (output || 0);
  tokens.cacheRead += (cacheRead || 0);
  tokens.cacheCreation += (cacheCreation || 0);
  setState('sessionTokens', { ...tokens });
  renderGauge(tokens);
}

export function resetContextGauge() {
  const fresh = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
  setState('sessionTokens', fresh);
  if ($.contextGauge) $.contextGauge.classList.add('hidden');
  if (sbGaugeSep) sbGaugeSep.classList.add('hidden');
}

export async function loadContextGauge(sessionId) {
  if (!sessionId) return;
  try {
    const messages = await (await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages-single`)).json();
    const tokens = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
    for (const msg of messages) {
      if (msg.role === 'result') {
        const data = JSON.parse(msg.content);
        tokens.input += (data.input_tokens || 0);
        tokens.output += (data.output_tokens || 0);
        tokens.cacheRead += (data.cache_read_tokens || 0);
        tokens.cacheCreation += (data.cache_creation_tokens || 0);
      }
    }
    setState('sessionTokens', tokens);
    const total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheCreation;
    if (total > 0) {
      renderGauge(tokens);
    } else if ($.contextGauge) {
      $.contextGauge.classList.add('hidden');
    }
  } catch (err) {
    console.error('Failed to load context gauge:', err);
  }
}
