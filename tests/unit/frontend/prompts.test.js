// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const mock$ = {
  promptForm: { addEventListener: vi.fn(), reset: vi.fn() },
  promptModal: { addEventListener: vi.fn(), classList: { add: vi.fn(), remove: vi.fn() } },
  modalCloseBtn: { addEventListener: vi.fn() },
  modalCancelBtn: { addEventListener: vi.fn() },
  toolboxBtn: {
    addEventListener: vi.fn(),
    classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn() },
  },
  toolboxPanel: {
    innerHTML: "",
    classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn(() => false) },
    appendChild: vi.fn(),
    parentElement: { appendChild: vi.fn() },
  },
  workflowPanel: { classList: { add: vi.fn() } },
  workflowBtn: { classList: { remove: vi.fn() } },
  agentSidebar: { classList: { add: vi.fn() } },
  agentBtn: { classList: { remove: vi.fn() } },
  messageInput: {
    value: "",
    style: { height: "" },
    scrollHeight: 100,
    focus: vi.fn(),
  },
};

vi.mock("../../../public/js/core/dom.js", () => ({ $: mock$ }));
vi.mock("../../../public/js/core/store.js", () => ({
  getState: vi.fn(() => []),
  setState: vi.fn(),
}));
vi.mock("../../../public/js/core/utils.js", () => ({
  escapeHtml: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  slugify: (s) => s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
}));
vi.mock("../../../public/js/core/api.js", () => ({
  fetchPrompts: vi.fn(),
  createPrompt: vi.fn(),
  deletePromptApi: vi.fn(),
}));
vi.mock("../../../public/js/ui/commands.js", () => ({
  commandRegistry: {},
  registerCommand: vi.fn(),
}));
vi.mock("../../../public/js/ui/parallel.js", () => ({
  getPane: vi.fn(),
}));

let extractVariables, renderVariablesForm;

beforeEach(async () => {
  vi.resetModules();

  vi.doMock("../../../public/js/core/dom.js", () => ({ $: mock$ }));
  vi.doMock("../../../public/js/core/store.js", () => ({
    getState: vi.fn(() => []),
    setState: vi.fn(),
  }));
  vi.doMock("../../../public/js/core/utils.js", () => ({
    escapeHtml: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
    slugify: (s) => s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
  }));
  vi.doMock("../../../public/js/core/api.js", () => ({
    fetchPrompts: vi.fn(),
    createPrompt: vi.fn(),
    deletePromptApi: vi.fn(),
  }));
  vi.doMock("../../../public/js/ui/commands.js", () => ({
    commandRegistry: {},
    registerCommand: vi.fn(),
  }));
  vi.doMock("../../../public/js/ui/parallel.js", () => ({
    getPane: vi.fn(),
  }));

  const mod = await import("../../../public/js/features/prompts.js");
  extractVariables = mod.extractVariables;
  renderVariablesForm = mod.renderVariablesForm;
});

describe("extractVariables", () => {
  it("returns empty array when no variables are present", () => {
    expect(extractVariables("Hello world")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(extractVariables("")).toEqual([]);
  });

  it("extracts a single variable", () => {
    expect(extractVariables("Hello {{name}}")).toEqual(["name"]);
  });

  it("extracts multiple variables", () => {
    const result = extractVariables("{{greeting}} {{name}}, welcome to {{place}}");
    expect(result).toEqual(["greeting", "name", "place"]);
  });

  it("deduplicates repeated variables", () => {
    const result = extractVariables("{{name}} said hello to {{name}} and {{other}}");
    expect(result).toEqual(["name", "other"]);
  });

  it("does not match single-brace patterns", () => {
    expect(extractVariables("{notavar}")).toEqual([]);
  });

  it("handles variables with underscores", () => {
    expect(extractVariables("{{first_name}} {{last_name}}")).toEqual(["first_name", "last_name"]);
  });
});

describe("renderVariablesForm", () => {
  it("returns a DOM element", () => {
    const form = renderVariablesForm("Hello {{name}}", ["name"], vi.fn());
    expect(form).toBeInstanceOf(HTMLElement);
    expect(form.className).toBe("prompt-variables-form");
  });

  it("contains a title element", () => {
    const form = renderVariablesForm("{{x}}", ["x"], vi.fn());
    const h4 = form.querySelector("h4");
    expect(h4).not.toBeNull();
    expect(h4.textContent).toBe("Fill in template variables");
  });

  it("creates input fields for each variable", () => {
    const form = renderVariablesForm("{{a}} {{b}} {{c}}", ["a", "b", "c"], vi.fn());
    const inputs = form.querySelectorAll("input");
    expect(inputs.length).toBe(3);
    expect(inputs[0].placeholder).toBe("a");
    expect(inputs[1].placeholder).toBe("b");
    expect(inputs[2].placeholder).toBe("c");
  });

  it("creates labels matching the variable names", () => {
    const form = renderVariablesForm("{{user}}", ["user"], vi.fn());
    const labels = form.querySelectorAll("label");
    expect(labels.length).toBe(1);
    expect(labels[0].textContent).toBe("{{user}}");
  });

  it("has a Send button", () => {
    const form = renderVariablesForm("{{x}}", ["x"], vi.fn());
    const btn = form.querySelector("button.prompt-var-send");
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe("Send");
  });

  it("replaces variables with input values on submit", () => {
    const onSubmit = vi.fn();
    const form = renderVariablesForm("Hello {{name}}, welcome to {{place}}", ["name", "place"], onSubmit);

    const inputs = form.querySelectorAll("input");
    inputs[0].value = "Alice";
    inputs[1].value = "Wonderland";

    const sendBtn = form.querySelector("button.prompt-var-send");
    sendBtn.click();

    expect(onSubmit).toHaveBeenCalledWith("Hello Alice, welcome to Wonderland");
  });

  it("uses variable name as default when input is empty", () => {
    const onSubmit = vi.fn();
    const form = renderVariablesForm("Hi {{name}}", ["name"], onSubmit);

    const sendBtn = form.querySelector("button.prompt-var-send");
    sendBtn.click();

    expect(onSubmit).toHaveBeenCalledWith("Hi name");
  });

  it("removes the form element on submit", () => {
    const parent = document.createElement("div");
    const onSubmit = vi.fn();
    const form = renderVariablesForm("{{x}}", ["x"], onSubmit);
    parent.appendChild(form);

    expect(parent.children.length).toBe(1);

    const sendBtn = form.querySelector("button.prompt-var-send");
    sendBtn.click();

    expect(parent.children.length).toBe(0);
  });

  it("replaces all occurrences of the same variable", () => {
    const onSubmit = vi.fn();
    const form = renderVariablesForm("{{x}} and {{x}} again", ["x"], onSubmit);

    const inputs = form.querySelectorAll("input");
    inputs[0].value = "YES";

    form.querySelector("button.prompt-var-send").click();

    expect(onSubmit).toHaveBeenCalledWith("YES and YES again");
  });

  it("Enter key on last input triggers submit", () => {
    const onSubmit = vi.fn();
    const form = renderVariablesForm("{{a}} and {{b}}", ["a", "b"], onSubmit);

    const inputs = form.querySelectorAll("input");
    inputs[0].value = "x";
    inputs[1].value = "y";

    // Simulate Enter keydown on last input
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
    Object.defineProperty(event, "preventDefault", { value: vi.fn() });
    inputs[1].dispatchEvent(event);

    expect(onSubmit).toHaveBeenCalledWith("x and y");
  });
});
