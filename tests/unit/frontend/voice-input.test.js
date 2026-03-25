// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ── Element stubs ── */
function makeEl(tag = "div") {
  return document.createElement(tag);
}

function makeInputEl() {
  const el = document.createElement("textarea");
  el.id = "message-input";
  return el;
}

const mockMicBtn = makeEl("button");
const mockMessageInput = makeInputEl();
const mockSendBtn = makeEl("button");
const mockNewSessionBtn = makeEl("button");
const mockSessionList = makeEl("ul");
const mockToggleParallelBtn = (() => {
  const el = document.createElement("input");
  el.type = "checkbox";
  return el;
})();

// messageInput needs to be inside an .input-bar for the module to find it
const inputBar = makeEl();
inputBar.className = "input-bar";
inputBar.appendChild(mockMessageInput);
document.body.appendChild(inputBar);

const mockDom = {
  micBtn: mockMicBtn,
  messageInput: mockMessageInput,
  sendBtn: mockSendBtn,
  newSessionBtn: mockNewSessionBtn,
  sessionList: mockSessionList,
  toggleParallelBtn: mockToggleParallelBtn,
};

const mockGetState = vi.fn(() => false);
const mockAddStatus = vi.fn();
const mockGetPane = vi.fn(() => ({}));

vi.mock("../../../public/js/core/dom.js", () => ({
  $: mockDom,
}));

vi.mock("../../../public/js/core/store.js", () => ({
  getState: (...args) => mockGetState(...args),
}));

vi.mock("../../../public/js/ui/messages.js", () => ({
  addStatus: (...args) => mockAddStatus(...args),
}));

vi.mock("../../../public/js/ui/parallel.js", () => ({
  getPane: (...args) => mockGetPane(...args),
}));

beforeEach(() => {
  vi.resetModules();
  mockGetState.mockClear();
  mockAddStatus.mockClear();
  mockGetPane.mockClear();

  // Ensure SpeechRecognition is NOT available (default in happy-dom)
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;

  // Remove the class if it was added in a previous test
  document.body.classList.remove("no-speech-api");

  vi.doMock("../../../public/js/core/dom.js", () => ({
    $: mockDom,
  }));
  vi.doMock("../../../public/js/core/store.js", () => ({
    getState: (...args) => mockGetState(...args),
  }));
  vi.doMock("../../../public/js/ui/messages.js", () => ({
    addStatus: (...args) => mockAddStatus(...args),
  }));
  vi.doMock("../../../public/js/ui/parallel.js", () => ({
    getPane: (...args) => mockGetPane(...args),
  }));
});

describe("voice-input", () => {
  it("adds no-speech-api class when SpeechRecognition is not available", async () => {
    await import("../../../public/js/features/voice-input.js");
    expect(document.body.classList.contains("no-speech-api")).toBe(true);
  });

  it("loads without error", async () => {
    await expect(
      import("../../../public/js/features/voice-input.js")
    ).resolves.not.toThrow();
  });

  it("does not add no-speech-api class when SpeechRecognition is available", async () => {
    vi.resetModules();
    document.body.classList.remove("no-speech-api");

    // Provide a mock SpeechRecognition constructor
    window.SpeechRecognition = vi.fn().mockImplementation(() => ({
      start: vi.fn(),
      stop: vi.fn(),
      addEventListener: vi.fn(),
      lang: "",
      continuous: false,
      interimResults: false,
      onresult: null,
      onend: null,
      onerror: null,
    }));

    vi.doMock("../../../public/js/core/dom.js", () => ({
      $: mockDom,
    }));
    vi.doMock("../../../public/js/core/store.js", () => ({
      getState: (...args) => mockGetState(...args),
    }));
    vi.doMock("../../../public/js/ui/messages.js", () => ({
      addStatus: (...args) => mockAddStatus(...args),
    }));
    vi.doMock("../../../public/js/ui/parallel.js", () => ({
      getPane: (...args) => mockGetPane(...args),
    }));

    await import("../../../public/js/features/voice-input.js");
    expect(document.body.classList.contains("no-speech-api")).toBe(false);

    delete window.SpeechRecognition;
  });

  it("adds no-speech-api class when running on Edge", async () => {
    vi.resetModules();
    document.body.classList.remove("no-speech-api");

    // Simulate Edge browser user agent
    const originalUA = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 Edg/120.0.0.0",
      configurable: true,
    });

    // Even if SpeechRecognition exists, Edge should be blocked
    window.SpeechRecognition = vi.fn();

    vi.doMock("../../../public/js/core/dom.js", () => ({
      $: mockDom,
    }));
    vi.doMock("../../../public/js/core/store.js", () => ({
      getState: (...args) => mockGetState(...args),
    }));
    vi.doMock("../../../public/js/ui/messages.js", () => ({
      addStatus: (...args) => mockAddStatus(...args),
    }));
    vi.doMock("../../../public/js/ui/parallel.js", () => ({
      getPane: (...args) => mockGetPane(...args),
    }));

    await import("../../../public/js/features/voice-input.js");
    expect(document.body.classList.contains("no-speech-api")).toBe(true);

    // Restore
    Object.defineProperty(navigator, "userAgent", {
      value: originalUA,
      configurable: true,
    });
    delete window.SpeechRecognition;
  });
});
