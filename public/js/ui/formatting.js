// Markdown rendering + code highlighting + mermaid
import { escapeHtml } from '../core/utils.js';
import { getState, setState } from '../core/store.js';

// Language display names for the code block header
const LANG_LABELS = {
  js: "JavaScript", javascript: "JavaScript", ts: "TypeScript", typescript: "TypeScript",
  py: "Python", python: "Python", rb: "Ruby", ruby: "Ruby",
  go: "Go", rust: "Rust", rs: "Rust", java: "Java", c: "C", cpp: "C++",
  cs: "C#", csharp: "C#", swift: "Swift", kt: "Kotlin", kotlin: "Kotlin",
  php: "PHP", sh: "Shell", bash: "Bash", zsh: "Zsh", fish: "Fish",
  sql: "SQL", html: "HTML", css: "CSS", scss: "SCSS", less: "LESS",
  json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML", xml: "XML",
  md: "Markdown", markdown: "Markdown", txt: "Text", plaintext: "Text",
  jsx: "JSX", tsx: "TSX", vue: "Vue", svelte: "Svelte",
  dockerfile: "Dockerfile", docker: "Dockerfile", makefile: "Makefile",
  graphql: "GraphQL", gql: "GraphQL", lua: "Lua", r: "R",
  perl: "Perl", scala: "Scala", elixir: "Elixir", ex: "Elixir",
  clojure: "Clojure", clj: "Clojure", haskell: "Haskell", hs: "Haskell",
  ocaml: "OCaml", ml: "OCaml", erlang: "Erlang", dart: "Dart",
  powershell: "PowerShell", ps1: "PowerShell", ini: "INI", conf: "Config",
  diff: "Diff", patch: "Diff", mermaid: "Mermaid", proto: "Protobuf",
  terraform: "Terraform", tf: "Terraform", hcl: "HCL", nginx: "Nginx",
};

function getLangLabel(lang) {
  if (!lang) return "";
  return LANG_LABELS[lang.toLowerCase()] || lang.toUpperCase();
}

export function renderMarkdown(text) {
  let html = escapeHtml(text);

  // ── Placeholder system ──
  // Extract code blocks and inline code into placeholders FIRST to protect
  // their content from text-level regex passes (bold, italic, links, etc.)
  const placeholders = [];
  function placeholder(content) {
    placeholders.push(content);
    return `\x00PH${placeholders.length - 1}\x00`;
  }

  // ── Code blocks — extract to placeholders ──
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, lang, code) => {
      const langClass = lang ? `language-${lang}` : "";
      const label = getLangLabel(lang);
      const headerHtml = label
        ? `<div class="code-block-header"><span class="code-lang-label">${label}</span></div>`
        : "";
      const wrappedCode = code
        .replace(/\n$/, "")
        .split("\n")
        .map(line => `<span class="code-line">${line}</span>`)
        .join("\n");
      return placeholder(`<div class="code-block-wrapper">${headerHtml}<pre><code class="${langClass}" data-lang="${lang}">${wrappedCode}</code></pre></div>`);
    }
  );

  // ── Inline code — extract to placeholders ──
  html = html.replace(/`([^`]+)`/g, (_, code) => {
    return placeholder(`<code class="inline-code">${code}</code>`);
  });

  // ── Bold + Italic combined ──
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");

  // ── Bold ──
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // ── Italic ──
  html = html.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, "<em>$1</em>");

  // ── Strikethrough ──
  html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // ── Headers ──
  html = html.replace(/^#### (.+)$/gm, '<h4 class="md-h4">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');

  // ── Horizontal rules ──
  html = html.replace(/^---+$/gm, '<hr class="md-hr">');

  // ── Blockquotes ──
  html = html.replace(/(?:^&gt; (.*)$\n?)+/gm, (match) => {
    const lines = match.trim().split("\n").map(l => l.replace(/^&gt; ?/, "")).join("<br>");
    return `<blockquote class="md-blockquote">${lines}</blockquote>\n`;
  });

  // ── Links ──
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="md-link" target="_blank" rel="noopener">$1</a>');

  // ── Auto-link bare URLs (not already inside an <a> tag or href attribute) ──
  html = html.replace(
    /(?<!href="|">)(https?:\/\/[^\s<>"'`)\]]+)/g,
    '<a href="$1" class="md-link" target="_blank" rel="noopener">$1</a>'
  );

  // ── Tables ──
  html = html.replace(
    /(?:^\|(.+)\|$\n^\|[-| :]+\|$\n(?:^\|(.+)\|$\n?)*)/gm,
    (match) => {
      const rows = match.trim().split("\n");
      if (rows.length < 2) return match;

      const parseRow = (row) =>
        row.split("|").filter((_, i, arr) => i > 0 && i < arr.length - 1).map(c => c.trim());

      const sepCells = parseRow(rows[1]);
      const aligns = sepCells.map(c => {
        if (c.startsWith(":") && c.endsWith(":")) return "center";
        if (c.endsWith(":")) return "right";
        return "left";
      });

      const headerCells = parseRow(rows[0]);
      let tableHtml = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
      headerCells.forEach((cell, i) => {
        tableHtml += `<th style="text-align:${aligns[i] || "left"}">${cell}</th>`;
      });
      tableHtml += "</tr></thead><tbody>";

      for (let r = 2; r < rows.length; r++) {
        const cells = parseRow(rows[r]);
        tableHtml += "<tr>";
        cells.forEach((cell, i) => {
          tableHtml += `<td style="text-align:${aligns[i] || "left"}">${cell}</td>`;
        });
        tableHtml += "</tr>";
      }

      tableHtml += "</tbody></table></div>";
      return tableHtml;
    }
  );

  // ── Ordered lists ──
  html = html.replace(/(?:^\d+[.)]\s+.+$\n?)+/gm, (match) => {
    const items = match.trim().split("\n").map(l => l.replace(/^\d+[.)]\s+/, ""));
    return '<ol class="md-list md-ol">' + items.map(i => `<li>${i}</li>`).join("") + "</ol>\n";
  });

  // ── Task lists (before general unordered lists) ──
  html = html.replace(/(?:^[-*+]\s+\[[ xX]\]\s+.+$\n?)+/gm, (match) => {
    const items = match.trim().split("\n").map(l => {
      const checked = /^[-*+]\s+\[x\]/i.test(l);
      const text = l.replace(/^[-*+]\s+\[[ xX]\]\s+/, "");
      const checkbox = `<input type="checkbox" class="md-checkbox" ${checked ? "checked" : ""} disabled>`;
      const spanClass = checked ? ' class="task-text-done"' : "";
      return `<li>${checkbox}<span${spanClass}>${text}</span></li>`;
    });
    return '<ul class="md-list md-task-list">' + items.join("") + "</ul>\n";
  });

  // ── Unordered lists ──
  html = html.replace(/(?:^[-*+]\s+.+$\n?)+/gm, (match) => {
    const items = match.trim().split("\n").map(l => l.replace(/^[-*+]\s+/, ""));
    return '<ul class="md-list md-ul">' + items.map(i => `<li>${i}</li>`).join("") + "</ul>\n";
  });

  // ── Line breaks ──
  html = html.replace(/\n{3,}/g, "\n\n");
  html = html.replace(/\n/g, "<br>");

  // Remove redundant <br> around block elements that already have CSS margins
  html = html.replace(/(<br>)+(<(?:h[1-4]|ul|ol|div|table|blockquote|hr)[\s>])/g, "$2");
  html = html.replace(/(<\/(?:h[1-4]|ul|ol|div|table|blockquote|hr)>)(<br>)+/g, "$1");
  // Also clean <br> around placeholder tokens (code blocks are block-level)
  html = html.replace(/(<br>)+(\x00PH\d+\x00)/g, "$2");
  html = html.replace(/(\x00PH\d+\x00)(<br>)+/g, "$1");

  // ── Restore placeholders ──
  html = html.replace(/\x00PH(\d+)\x00/g, (_, i) => placeholders[parseInt(i)]);

  return html;
}

export function highlightCodeBlocks(container) {
  if (typeof hljs === "undefined") return;
  container.querySelectorAll("pre code").forEach((block) => {
    if (block.dataset.highlighted === "yes") return;
    try {
      hljs.highlightElement(block);
    } catch { /* ignore unsupported languages */ }
    // Re-wrap lines for CSS line numbering after highlight.js processes the block
    wrapCodeLinesInBlock(block);
  });
}

function wrapCodeLinesInBlock(block) {
  if (block.querySelector(".code-line")) return;
  const html = block.innerHTML;
  const lines = html.split("\n");
  block.innerHTML = lines.map(l => `<span class="code-line">${l}</span>`).join("\n");
}

export function wrapCodeLines(container) {
  container.querySelectorAll("pre code").forEach((block) => {
    wrapCodeLinesInBlock(block);
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
    // Place copy button inside the header if it exists, otherwise in wrapper
    const header = wrapper.querySelector(".code-block-header");
    if (header) {
      header.appendChild(btn);
    } else {
      wrapper.appendChild(btn);
    }
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
