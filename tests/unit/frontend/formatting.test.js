// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../public/js/core/store.js", () => {
  let counter = 0;
  return {
    getState: vi.fn((key) => {
      if (key === "mermaidCounter") return counter;
      return undefined;
    }),
    setState: vi.fn((key, val) => {
      if (key === "mermaidCounter") counter = val;
    }),
  };
});

import {
  renderMarkdown,
  highlightCodeBlocks,
  addCopyButtons,
} from "../../../public/js/ui/formatting.js";

describe("renderMarkdown", () => {
  describe("code blocks", () => {
    it("renders a fenced code block with language label", () => {
      const input = "```js\nconsole.log('hi');\n```";
      const result = renderMarkdown(input);
      expect(result).toContain("code-block-wrapper");
      expect(result).toContain("code-block-header");
      expect(result).toContain("code-lang-label");
      expect(result).toContain("JavaScript");
      expect(result).toContain('class="language-js"');
      expect(result).toContain('data-lang="js"');
      expect(result).toContain("console.log(");
    });

    it("renders a fenced code block without language", () => {
      const input = "```\nsome code\n```";
      const result = renderMarkdown(input);
      expect(result).toContain("code-block-wrapper");
      // No header when no language
      expect(result).not.toContain("code-block-header");
      expect(result).toContain("some code");
    });

    it("renders python language label", () => {
      const input = "```python\nprint('hello')\n```";
      const result = renderMarkdown(input);
      expect(result).toContain("Python");
      expect(result).toContain('class="language-python"');
    });

    it("renders unknown language as uppercase", () => {
      const input = "```mylang\ncode here\n```";
      const result = renderMarkdown(input);
      expect(result).toContain("MYLANG");
    });

    it("preserves code content inside code blocks", () => {
      const input = "```js\nconst x = 1;\nconst y = 2;\n```";
      const result = renderMarkdown(input);
      expect(result).toContain("const x = 1;");
      expect(result).toContain("const y = 2;");
    });
  });

  describe("inline code", () => {
    it("renders inline code with backticks", () => {
      const result = renderMarkdown("Use `npm install` to install");
      expect(result).toContain('<code class="inline-code">npm install</code>');
    });

    it("handles multiple inline code segments", () => {
      const result = renderMarkdown("`a` and `b`");
      expect(result).toContain('<code class="inline-code">a</code>');
      expect(result).toContain('<code class="inline-code">b</code>');
    });
  });

  describe("bold", () => {
    it("renders bold text", () => {
      const result = renderMarkdown("This is **bold** text");
      expect(result).toContain("<strong>bold</strong>");
    });

    it("renders multiple bold segments", () => {
      const result = renderMarkdown("**one** and **two**");
      expect(result).toContain("<strong>one</strong>");
      expect(result).toContain("<strong>two</strong>");
    });
  });

  describe("italic", () => {
    it("renders italic text", () => {
      const result = renderMarkdown("This is *italic* text");
      expect(result).toContain("<em>italic</em>");
    });
  });

  describe("bold + italic combined", () => {
    it("renders bold+italic with triple asterisks", () => {
      const result = renderMarkdown("***bold and italic***");
      expect(result).toContain("<strong><em>bold and italic</em></strong>");
    });
  });

  describe("strikethrough", () => {
    it("renders strikethrough text", () => {
      const result = renderMarkdown("This is ~~deleted~~ text");
      expect(result).toContain("<del>deleted</del>");
    });
  });

  describe("headers", () => {
    it("renders h1", () => {
      const result = renderMarkdown("# Heading 1");
      expect(result).toContain('<h1 class="md-h1">Heading 1</h1>');
    });

    it("renders h2", () => {
      const result = renderMarkdown("## Heading 2");
      expect(result).toContain('<h2 class="md-h2">Heading 2</h2>');
    });

    it("renders h3", () => {
      const result = renderMarkdown("### Heading 3");
      expect(result).toContain('<h3 class="md-h3">Heading 3</h3>');
    });

    it("renders h4", () => {
      const result = renderMarkdown("#### Heading 4");
      expect(result).toContain('<h4 class="md-h4">Heading 4</h4>');
    });

    it("renders h4 before h3 (specificity)", () => {
      const result = renderMarkdown("#### Deep\n### Shallow");
      expect(result).toContain('<h4 class="md-h4">Deep</h4>');
      expect(result).toContain('<h3 class="md-h3">Shallow</h3>');
    });
  });

  describe("horizontal rules", () => {
    it("renders --- as hr", () => {
      const result = renderMarkdown("above\n---\nbelow");
      expect(result).toContain('<hr class="md-hr">');
    });

    it("renders long dashes as hr", () => {
      const result = renderMarkdown("------");
      expect(result).toContain('<hr class="md-hr">');
    });
  });

  describe("blockquotes", () => {
    it("renders a blockquote", () => {
      const result = renderMarkdown("> This is a quote");
      expect(result).toContain('<blockquote class="md-blockquote">');
      expect(result).toContain("This is a quote");
    });

    it("renders multi-line blockquote", () => {
      const result = renderMarkdown("> Line 1\n> Line 2");
      expect(result).toContain('<blockquote class="md-blockquote">');
      expect(result).toContain("Line 1");
      expect(result).toContain("Line 2");
    });
  });

  describe("links", () => {
    it("renders a markdown link", () => {
      const result = renderMarkdown("[Click here](https://example.com)");
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('class="md-link"');
      expect(result).toContain('target="_blank"');
      expect(result).toContain('rel="noopener"');
      expect(result).toContain("Click here");
    });

    it("renders multiple links", () => {
      const result = renderMarkdown("[a](http://a.com) and [b](http://b.com)");
      expect(result).toContain('href="http://a.com"');
      expect(result).toContain('href="http://b.com"');
    });
  });

  describe("tables", () => {
    it("renders a basic table", () => {
      const input = "| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |";
      const result = renderMarkdown(input);
      expect(result).toContain('<table class="md-table">');
      expect(result).toContain("<thead>");
      expect(result).toContain("<tbody>");
      expect(result).toContain("<th");
      expect(result).toContain("Name");
      expect(result).toContain("Age");
      expect(result).toContain("Alice");
      expect(result).toContain("30");
      expect(result).toContain("Bob");
      expect(result).toContain("25");
    });

    it("respects right alignment", () => {
      const input = "| Col |\n| ---: |\n| val |";
      const result = renderMarkdown(input);
      expect(result).toContain('text-align:right');
    });

    it("respects center alignment", () => {
      const input = "| Col |\n| :---: |\n| val |";
      const result = renderMarkdown(input);
      expect(result).toContain('text-align:center');
    });

    it("defaults to left alignment", () => {
      const input = "| Col |\n| --- |\n| val |";
      const result = renderMarkdown(input);
      expect(result).toContain('text-align:left');
    });
  });

  describe("ordered lists", () => {
    it("renders an ordered list", () => {
      const result = renderMarkdown("1. First\n2. Second\n3. Third");
      expect(result).toContain('<ol class="md-list md-ol">');
      expect(result).toContain("<li>First</li>");
      expect(result).toContain("<li>Second</li>");
      expect(result).toContain("<li>Third</li>");
    });

    it("handles ) style numbering", () => {
      const result = renderMarkdown("1) Alpha\n2) Beta");
      expect(result).toContain('<ol class="md-list md-ol">');
      expect(result).toContain("<li>Alpha</li>");
      expect(result).toContain("<li>Beta</li>");
    });
  });

  describe("unordered lists", () => {
    it("renders an unordered list with dashes", () => {
      const result = renderMarkdown("- Apple\n- Banana\n- Cherry");
      expect(result).toContain('<ul class="md-list md-ul">');
      expect(result).toContain("<li>Apple</li>");
      expect(result).toContain("<li>Banana</li>");
      expect(result).toContain("<li>Cherry</li>");
    });

    it("renders an unordered list with asterisks", () => {
      const result = renderMarkdown("* One\n* Two");
      expect(result).toContain('<ul class="md-list md-ul">');
      expect(result).toContain("<li>One</li>");
    });

    it("renders an unordered list with plus signs", () => {
      const result = renderMarkdown("+ Foo\n+ Bar");
      expect(result).toContain('<ul class="md-list md-ul">');
      expect(result).toContain("<li>Foo</li>");
    });
  });

  describe("line breaks", () => {
    it("converts newlines to <br>", () => {
      const result = renderMarkdown("Line 1\nLine 2");
      expect(result).toContain("<br>");
    });
  });

  describe("empty and edge-case input", () => {
    it("handles empty string", () => {
      const result = renderMarkdown("");
      expect(result).toBe("");
    });

    it("handles plain text without markdown", () => {
      const result = renderMarkdown("Just plain text");
      expect(result).toBe("Just plain text");
    });
  });

  describe("HTML escaping", () => {
    it("escapes HTML in input text", () => {
      const result = renderMarkdown("<script>alert('xss')</script>");
      expect(result).not.toContain("<script>");
      expect(result).toContain("&lt;script&gt;");
    });
  });
});

describe("highlightCodeBlocks", () => {
  it("does nothing when hljs is undefined", () => {
    const container = document.createElement("div");
    container.innerHTML = '<pre><code class="language-js">const x = 1;</code></pre>';
    // hljs is not defined globally, should not throw
    highlightCodeBlocks(container);
  });

  it("calls hljs.highlightElement when hljs is available", () => {
    const mockHighlight = vi.fn();
    globalThis.hljs = { highlightElement: mockHighlight };

    const container = document.createElement("div");
    container.innerHTML = '<pre><code class="language-js">const x = 1;</code></pre>';
    highlightCodeBlocks(container);

    expect(mockHighlight).toHaveBeenCalledTimes(1);
    delete globalThis.hljs;
  });

  it("skips already highlighted blocks", () => {
    const mockHighlight = vi.fn();
    globalThis.hljs = { highlightElement: mockHighlight };

    const container = document.createElement("div");
    container.innerHTML = '<pre><code class="language-js" data-highlighted="yes">const x = 1;</code></pre>';
    highlightCodeBlocks(container);

    expect(mockHighlight).not.toHaveBeenCalled();
    delete globalThis.hljs;
  });
});

describe("addCopyButtons", () => {
  it("adds a copy button to code block wrappers", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="code-block-wrapper">
        <div class="code-block-header"><span class="code-lang-label">JS</span></div>
        <pre><code>const x = 1;</code></pre>
      </div>
    `;
    addCopyButtons(container);

    const btn = container.querySelector(".code-copy-btn");
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe("Copy");
  });

  it("places button in header if header exists", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="code-block-wrapper">
        <div class="code-block-header"><span>JS</span></div>
        <pre><code>code</code></pre>
      </div>
    `;
    addCopyButtons(container);

    const header = container.querySelector(".code-block-header");
    const btn = header.querySelector(".code-copy-btn");
    expect(btn).not.toBeNull();
  });

  it("places button in wrapper if no header exists", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="code-block-wrapper">
        <pre><code>code</code></pre>
      </div>
    `;
    addCopyButtons(container);

    const wrapper = container.querySelector(".code-block-wrapper");
    const btn = wrapper.querySelector(".code-copy-btn");
    expect(btn).not.toBeNull();
  });

  it("does not add duplicate copy buttons", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="code-block-wrapper">
        <pre><code>code</code></pre>
      </div>
    `;
    addCopyButtons(container);
    addCopyButtons(container);

    const buttons = container.querySelectorAll(".code-copy-btn");
    expect(buttons.length).toBe(1);
  });

  it("copies code text to clipboard and shows 'Copied!' on click", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    const container = document.createElement("div");
    container.innerHTML = `
      <div class="code-block-wrapper">
        <pre><code>const x = 42;</code></pre>
      </div>
    `;
    addCopyButtons(container);

    const btn = container.querySelector(".code-copy-btn");
    btn.click();

    // Wait for the clipboard promise to resolve
    await vi.waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("const x = 42;");
    });

    expect(btn.textContent).toBe("Copied!");
    expect(btn.classList.contains("copied")).toBe(true);
  });

  it("resets button text back to 'Copy' after timeout", async () => {
    vi.useFakeTimers();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    const container = document.createElement("div");
    container.innerHTML = `
      <div class="code-block-wrapper">
        <pre><code>hello</code></pre>
      </div>
    `;
    addCopyButtons(container);

    const btn = container.querySelector(".code-copy-btn");
    btn.click();

    // Flush the microtask (clipboard promise)
    await vi.waitFor(() => {
      expect(btn.textContent).toBe("Copied!");
    });

    // Advance the timer to trigger the setTimeout reset
    vi.advanceTimersByTime(2000);

    expect(btn.textContent).toBe("Copy");
    expect(btn.classList.contains("copied")).toBe(false);
    vi.useRealTimers();
  });

  it("does nothing when code element is missing inside wrapper", () => {
    const writeTextMock = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    const container = document.createElement("div");
    // Wrapper with no <code> element
    container.innerHTML = `
      <div class="code-block-wrapper">
        <pre>just text, no code element</pre>
      </div>
    `;
    addCopyButtons(container);

    const btn = container.querySelector(".code-copy-btn");
    // Should not throw
    btn.click();

    expect(writeTextMock).not.toHaveBeenCalled();
  });

  it("stops event propagation when copy button is clicked", () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    const container = document.createElement("div");
    container.innerHTML = `
      <div class="code-block-wrapper">
        <pre><code>test</code></pre>
      </div>
    `;
    addCopyButtons(container);

    const btn = container.querySelector(".code-copy-btn");
    const parentClickSpy = vi.fn();
    container.addEventListener("click", parentClickSpy);

    // Create and dispatch a click event
    const event = new Event("click", { bubbles: true });
    const stopSpy = vi.spyOn(event, "stopPropagation");
    btn.dispatchEvent(event);

    expect(stopSpy).toHaveBeenCalled();
  });
});

// ── renderMermaidBlocks ──────────────────────────────────────────────
import { renderMermaidBlocks } from "../../../public/js/ui/formatting.js";

describe("renderMermaidBlocks", () => {
  it("does nothing when mermaid is undefined", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="code-block-wrapper">
        <pre><code data-lang="mermaid">graph TD; A-->B;</code></pre>
      </div>
    `;
    // mermaid is not defined globally, should not throw
    renderMermaidBlocks(container);
    // The wrapper should remain unchanged
    expect(container.querySelector(".code-block-wrapper")).not.toBeNull();
  });

  it("calls mermaid.render when mermaid is available", async () => {
    const svgOutput = '<svg>mermaid diagram</svg>';
    const mockRender = vi.fn().mockResolvedValue({ svg: svgOutput });
    globalThis.mermaid = { render: mockRender };

    // Build DOM programmatically to avoid happy-dom innerHTML quirks
    const container = document.createElement("div");
    const wrapper = document.createElement("div");
    wrapper.className = "code-block-wrapper";
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.setAttribute("data-lang", "mermaid");
    code.textContent = "graph TD; A-->B;";
    pre.appendChild(code);
    wrapper.appendChild(pre);
    container.appendChild(wrapper);

    renderMermaidBlocks(container);

    expect(mockRender).toHaveBeenCalledTimes(1);
    expect(mockRender).toHaveBeenCalledWith(
      expect.stringMatching(/^mermaid-/),
      "graph TD; A-->B;",
    );

    delete globalThis.mermaid;
  });

  it("skips already rendered mermaid blocks", () => {
    const mockRender = vi.fn().mockResolvedValue({ svg: "<svg></svg>" });
    globalThis.mermaid = { render: mockRender };

    const container = document.createElement("div");
    container.innerHTML = `
      <div class="code-block-wrapper" data-mermaid-rendered="true">
        <pre><code data-lang="mermaid">graph TD; A-->B;</code></pre>
      </div>
    `;

    renderMermaidBlocks(container);

    expect(mockRender).not.toHaveBeenCalled();
    delete globalThis.mermaid;
  });

  it("leaves code block intact when mermaid.render rejects", async () => {
    const mockRender = vi.fn().mockRejectedValue(new Error("Parse error"));
    globalThis.mermaid = { render: mockRender };

    const container = document.createElement("div");
    container.innerHTML = `
      <div class="code-block-wrapper">
        <pre><code data-lang="mermaid">invalid diagram</code></pre>
      </div>
    `;

    renderMermaidBlocks(container);

    // After the rejection, the wrapper should still exist
    expect(container.querySelector(".code-block-wrapper")).not.toBeNull();
    delete globalThis.mermaid;
  });

  it("leaves code block intact when mermaid.render throws synchronously", () => {
    const mockRender = vi.fn().mockImplementation(() => {
      throw new Error("Sync error");
    });
    globalThis.mermaid = { render: mockRender };

    const container = document.createElement("div");
    container.innerHTML = `
      <div class="code-block-wrapper">
        <pre><code data-lang="mermaid">broken</code></pre>
      </div>
    `;

    // Should not throw
    renderMermaidBlocks(container);
    expect(container.querySelector(".code-block-wrapper")).not.toBeNull();
    delete globalThis.mermaid;
  });

  it("does not render non-mermaid code blocks", () => {
    const mockRender = vi.fn().mockResolvedValue({ svg: "<svg></svg>" });
    globalThis.mermaid = { render: mockRender };

    const container = document.createElement("div");
    container.innerHTML = `
      <div class="code-block-wrapper">
        <pre><code data-lang="js">const x = 1;</code></pre>
      </div>
    `;

    renderMermaidBlocks(container);
    expect(mockRender).not.toHaveBeenCalled();
    delete globalThis.mermaid;
  });
});

// ── renderMarkdown — tables with alignment ──────────────────────────
describe("renderMarkdown — table alignment edge cases", () => {
  it("renders table with mixed alignments", () => {
    const input = "| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |";
    const result = renderMarkdown(input);
    expect(result).toContain('text-align:left');
    expect(result).toContain('text-align:center');
    expect(result).toContain('text-align:right');
    expect(result).toContain("Left");
    expect(result).toContain("Center");
    expect(result).toContain("Right");
    expect(result).toContain("a");
    expect(result).toContain("b");
    expect(result).toContain("c");
  });

  it("renders table with more header columns than separator columns (fallback alignment)", () => {
    // Extra header column that has no corresponding alignment separator
    const input = "| A | B | C |\n| --- | --- |\n| 1 | 2 | 3 |";
    const result = renderMarkdown(input);
    // The third column should still render with fallback "left" alignment
    expect(result).toContain("A");
    expect(result).toContain("C");
    expect(result).toContain("3");
  });

  it("renders table with multiple data rows", () => {
    const input = "| Name | Score |\n| --- | --- |\n| Alice | 95 |\n| Bob | 87 |\n| Carol | 92 |";
    const result = renderMarkdown(input);
    expect(result).toContain("Alice");
    expect(result).toContain("95");
    expect(result).toContain("Bob");
    expect(result).toContain("87");
    expect(result).toContain("Carol");
    expect(result).toContain("92");
  });
});

// ── renderMarkdown — nested formatting ─────────────────────────────
describe("renderMarkdown — nested formatting", () => {
  it("renders bold inside a list item", () => {
    const result = renderMarkdown("- This is **bold** in a list");
    expect(result).toContain("<li>");
    expect(result).toContain("<strong>bold</strong>");
  });

  it("renders inline code inside a list item", () => {
    const result = renderMarkdown("- Use `npm install` here");
    expect(result).toContain("<li>");
    expect(result).toContain('<code class="inline-code">npm install</code>');
  });

  it("renders bold inside a blockquote", () => {
    const result = renderMarkdown("> This is **important**");
    expect(result).toContain('<blockquote class="md-blockquote">');
    expect(result).toContain("<strong>important</strong>");
  });

  it("renders a link inside bold", () => {
    const result = renderMarkdown("**[Click](https://example.com)**");
    expect(result).toContain("<strong>");
    expect(result).toContain('href="https://example.com"');
  });

  it("renders strikethrough with bold text", () => {
    const result = renderMarkdown("~~**deleted bold**~~");
    expect(result).toContain("<del>");
    expect(result).toContain("<strong>deleted bold</strong>");
  });
});

// ── renderMarkdown — code block detection edge cases ────────────────
describe("renderMarkdown — code block edge cases", () => {
  it("renders mermaid code block with language label", () => {
    const input = "```mermaid\ngraph TD\n  A-->B\n```";
    const result = renderMarkdown(input);
    expect(result).toContain("code-block-wrapper");
    expect(result).toContain("Mermaid");
    expect(result).toContain('data-lang="mermaid"');
  });

  it("renders multiple code blocks independently", () => {
    const input = "```js\nconst a = 1;\n```\nSome text\n```python\nprint('hi')\n```";
    const result = renderMarkdown(input);
    expect(result).toContain("JavaScript");
    expect(result).toContain("Python");
    expect(result).toContain("const a = 1;");
    expect(result).toContain("print(");
  });

  it("renders language labels for many supported languages", () => {
    const langs = {
      ts: "TypeScript", rb: "Ruby", go: "Go", rust: "Rust",
      java: "Java", swift: "Swift", php: "PHP", sql: "SQL",
      html: "HTML", css: "CSS", json: "JSON", yaml: "YAML",
      dockerfile: "Dockerfile", graphql: "GraphQL", diff: "Diff",
    };
    for (const [short, label] of Object.entries(langs)) {
      const result = renderMarkdown(`\`\`\`${short}\ncode\n\`\`\``);
      expect(result).toContain(label);
    }
  });

  it("handles getLangLabel with empty string", () => {
    // No language -> no header
    const result = renderMarkdown("```\nplain code\n```");
    expect(result).not.toContain("code-block-header");
    expect(result).toContain("plain code");
  });
});

// ── highlightCodeBlocks — hljs error handling ───────────────────────
describe("highlightCodeBlocks — error handling", () => {
  it("does not throw when hljs.highlightElement throws", () => {
    globalThis.hljs = {
      highlightElement: vi.fn(() => {
        throw new Error("Unsupported language");
      }),
    };

    const container = document.createElement("div");
    container.innerHTML = '<pre><code class="language-xyz">code</code></pre>';

    // Should not throw
    expect(() => highlightCodeBlocks(container)).not.toThrow();
    delete globalThis.hljs;
  });
});
