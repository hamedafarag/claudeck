// Markdown rendering + code highlighting + mermaid
import { escapeHtml } from './utils.js';
import { getState, setState } from './store.js';

export function renderMarkdown(text) {
  let html = escapeHtml(text);

  // Code blocks — wrap in .code-block-wrapper for copy button positioning
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, lang, code) => {
      const langClass = lang ? `language-${lang}` : "";
      return `<div class="code-block-wrapper"><pre><code class="${langClass}" data-lang="${lang}">${code}</code></pre></div>`;
    }
  );

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Line breaks
  html = html.replace(/\n/g, "<br>");

  return html;
}

export function highlightCodeBlocks(container) {
  if (typeof hljs === "undefined") return;
  container.querySelectorAll("pre code[class*='language-']").forEach((block) => {
    if (block.dataset.highlighted === "yes") return;
    try {
      hljs.highlightElement(block);
    } catch { /* ignore unsupported languages */ }
  });
}

export function addCopyButtons(container) {
  container.querySelectorAll(".code-block-wrapper").forEach((wrapper) => {
    if (wrapper.querySelector(".code-copy-btn")) return;
    const btn = document.createElement("button");
    btn.className = "code-copy-btn";
    btn.textContent = "Copy";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const code = wrapper.querySelector("code");
      if (code) {
        navigator.clipboard.writeText(code.textContent).then(() => {
          btn.textContent = "Copied!";
          btn.classList.add("copied");
          setTimeout(() => {
            btn.textContent = "Copy";
            btn.classList.remove("copied");
          }, 2000);
        });
      }
    });
    wrapper.appendChild(btn);
  });
}

export function renderMermaidBlocks(container) {
  if (typeof mermaid === "undefined") return;
  container.querySelectorAll('.code-block-wrapper code[data-lang="mermaid"]').forEach((block) => {
    const wrapper = block.closest(".code-block-wrapper");
    if (!wrapper || wrapper.dataset.mermaidRendered) return;
    wrapper.dataset.mermaidRendered = "true";

    const source = block.textContent;
    let counter = getState("mermaidCounter") + 1;
    setState("mermaidCounter", counter);
    const id = `mermaid-${counter}`;
    try {
      mermaid.render(id, source).then(({ svg }) => {
        const div = document.createElement("div");
        div.className = "mermaid-container";
        div.innerHTML = svg;
        wrapper.replaceWith(div);
      }).catch(() => {
        // Leave original code block on error
      });
    } catch {
      // Sync error — leave code block
    }
  });
}
