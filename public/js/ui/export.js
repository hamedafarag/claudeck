// Export functionality
import { escapeHtml } from '../core/utils.js';
import { renderMarkdown } from './formatting.js';

export function exportAsMarkdown(msgs) {
  let md = "# Chat Export\n\n";
  msgs.forEach((m) => {
    if (m.querySelector(".msg-user")) {
      md += "## User\n" + m.textContent.trim() + "\n\n";
    } else if (m.querySelector(".text-content")) {
      md += "## Assistant\n" + (m.querySelector(".text-content").dataset.raw || m.textContent.trim()) + "\n\n";
    } else if (m.querySelector(".tool-indicator")) {
      const name = m.querySelector(".tool-name")?.textContent || "";
      md += "> Tool: " + name + "\n\n";
    }
  });
  const blob = new Blob([md], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `chat-export-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function exportAsHtml(msgs) {
  let body = "";
  msgs.forEach((m) => {
    if (m.querySelector(".msg-user")) {
      body += `<div class="msg msg-user">${escapeHtml(m.textContent.trim())}</div>\n`;
    } else if (m.querySelector(".text-content")) {
      const raw = m.querySelector(".text-content").dataset.raw || m.textContent.trim();
      body += `<div class="msg msg-assistant"><div class="text-content">${renderMarkdown(raw)}</div></div>\n`;
    } else if (m.querySelector(".tool-indicator")) {
      const name = m.querySelector(".tool-name")?.textContent || "";
      body += `<div class="msg tool-use">Tool: ${escapeHtml(name)}</div>\n`;
    }
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Chat Export — Claudeck</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; background: #0d1117; color: #e6edf3; max-width: 820px; margin: 0 auto; padding: 24px; }
  .msg { margin-bottom: 14px; }
  .msg-user { background: rgba(31, 111, 235, 0.13); border: 1px solid rgba(31, 111, 235, 0.27); border-radius: 8px; padding: 12px 16px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
  .msg-assistant { font-size: 14px; line-height: 1.7; }
  .text-content { white-space: pre-wrap; word-wrap: break-word; }
  .text-content code { font-family: "SF Mono", "Fira Code", monospace; font-size: 13px; background: #1c2128; padding: 2px 6px; border-radius: 4px; }
  .text-content pre { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 12px 16px; overflow-x: auto; margin: 8px 0; }
  .text-content pre code { background: none; padding: 0; }
  .tool-use { font-family: "SF Mono", monospace; font-size: 12px; color: #8b949e; padding: 4px 0; }
  h1, h2, h3 { color: #e6edf3; }
  strong { font-weight: 600; }
</style>
</head>
<body>
<h1>Chat Export</h1>
${body}
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"><\/script>
<script>hljs.highlightAll();<\/script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `chat-export-${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}
