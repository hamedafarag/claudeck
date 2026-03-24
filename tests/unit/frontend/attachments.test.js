// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetState = vi.fn();
const mockSetState = vi.fn();

// We need a shared mock $ object that persists across re-imports
const mock$ = {
  attachBtn: { addEventListener: vi.fn() },
  attachBadge: {
    textContent: "",
    classList: { add: vi.fn(), remove: vi.fn() },
  },
  fpModal: {
    addEventListener: vi.fn(),
    classList: { add: vi.fn(), remove: vi.fn() },
  },
  fpSearch: {
    value: "",
    focus: vi.fn(),
    addEventListener: vi.fn(),
  },
  fpList: {
    innerHTML: "",
    style: { display: "" },
    querySelectorAll: vi.fn(() => []),
    appendChild: vi.fn(),
  },
  fpCount: { textContent: "" },
  fpSelected: {
    innerHTML: "",
    classList: { add: vi.fn(), remove: vi.fn() },
    appendChild: vi.fn(),
  },
  fpEmpty: {
    classList: { add: vi.fn(), remove: vi.fn() },
  },
  imageBtn: { addEventListener: vi.fn() },
  imageFileInput: {
    click: vi.fn(),
    addEventListener: vi.fn(),
    files: [],
    value: "",
  },
  imagePreviewStrip: {
    innerHTML: "",
    classList: { add: vi.fn(), remove: vi.fn() },
    appendChild: vi.fn(),
  },
  projectSelect: { value: "/test/project" },
  messageInput: {
    addEventListener: vi.fn(),
    contains: vi.fn(() => false),
    classList: { add: vi.fn(), remove: vi.fn() },
  },
  toolboxPanel: { classList: { add: vi.fn() } },
  toolboxBtn: { classList: { remove: vi.fn() } },
};

vi.mock("../../../public/js/core/dom.js", () => ({ $: mock$ }));
vi.mock("../../../public/js/core/store.js", () => ({
  getState: (...args) => mockGetState(...args),
  setState: (...args) => mockSetState(...args),
}));
vi.mock("../../../public/js/core/api.js", () => ({
  fetchFiles: vi.fn(),
  fetchFileContent: vi.fn(),
}));
vi.mock("../../../public/js/ui/commands.js", () => ({
  registerCommand: vi.fn(),
}));

let updateAttachmentBadge, addImageAttachment, removeImageAttachment, getImageAttachments, clearImageAttachments;

beforeEach(async () => {
  vi.resetModules();
  mockGetState.mockReset();
  mockSetState.mockReset();
  mock$.attachBadge.textContent = "";
  mock$.attachBadge.classList.add.mockClear();
  mock$.attachBadge.classList.remove.mockClear();
  mock$.imagePreviewStrip.innerHTML = "";
  mock$.imagePreviewStrip.classList.add.mockClear();
  mock$.imagePreviewStrip.classList.remove.mockClear();

  // Create DOM elements the module accesses via document.getElementById at load time
  document.body.innerHTML = `
    <button id="fp-modal-close"></button>
    <button id="fp-done-btn"></button>
    <div id="toast-container"></div>
  `;

  vi.doMock("../../../public/js/core/dom.js", () => ({ $: mock$ }));
  vi.doMock("../../../public/js/core/store.js", () => ({
    getState: (...args) => mockGetState(...args),
    setState: (...args) => mockSetState(...args),
  }));
  vi.doMock("../../../public/js/core/api.js", () => ({
    fetchFiles: vi.fn(),
    fetchFileContent: vi.fn(),
  }));
  vi.doMock("../../../public/js/ui/commands.js", () => ({
    registerCommand: vi.fn(),
  }));

  const mod = await import("../../../public/js/features/attachments.js");
  updateAttachmentBadge = mod.updateAttachmentBadge;
  addImageAttachment = mod.addImageAttachment;
  removeImageAttachment = mod.removeImageAttachment;
  getImageAttachments = mod.getImageAttachments;
  clearImageAttachments = mod.clearImageAttachments;
});

describe("updateAttachmentBadge", () => {
  it("shows badge with count when files are attached", () => {
    mockGetState.mockImplementation((key) => {
      if (key === "attachedFiles") return [{ path: "a.js", content: "x" }];
      if (key === "imageAttachments") return [];
      return [];
    });

    updateAttachmentBadge();

    expect(mock$.attachBadge.textContent).toBe(1);
    expect(mock$.attachBadge.classList.remove).toHaveBeenCalledWith("hidden");
  });

  it("shows badge with total of files and images", () => {
    mockGetState.mockImplementation((key) => {
      if (key === "attachedFiles") return [{ path: "a.js" }, { path: "b.js" }];
      if (key === "imageAttachments") return [{ name: "img.png" }];
      return [];
    });

    updateAttachmentBadge();

    expect(mock$.attachBadge.textContent).toBe(3);
    expect(mock$.attachBadge.classList.remove).toHaveBeenCalledWith("hidden");
  });

  it("hides badge when no attachments", () => {
    mockGetState.mockImplementation((key) => {
      if (key === "attachedFiles") return [];
      if (key === "imageAttachments") return [];
      return [];
    });

    updateAttachmentBadge();

    expect(mock$.attachBadge.classList.add).toHaveBeenCalledWith("hidden");
  });
});

describe("addImageAttachment", () => {
  it("rejects unsupported file types", () => {
    const file = { type: "application/pdf", size: 1000, name: "doc.pdf" };

    addImageAttachment(file);

    expect(mockSetState).not.toHaveBeenCalled();
  });

  it("rejects files larger than 5MB", () => {
    const file = { type: "image/png", size: 10 * 1024 * 1024, name: "huge.png" };

    addImageAttachment(file);

    expect(mockSetState).not.toHaveBeenCalled();
  });

  it("reads valid image and adds to state", () => {
    mockGetState.mockImplementation((key) => {
      if (key === "imageAttachments") return [];
      if (key === "attachedFiles") return [];
      return [];
    });

    const mockFileReader = {
      readAsDataURL: vi.fn(),
      onload: null,
      result: "data:image/png;base64,abc123",
    };
    const OrigFileReader = globalThis.FileReader;
    globalThis.FileReader = function () { return mockFileReader; };

    const file = { type: "image/png", size: 1000, name: "test.png" };
    addImageAttachment(file);

    expect(mockFileReader.readAsDataURL).toHaveBeenCalledWith(file);

    // Trigger onload callback
    mockFileReader.onload();

    expect(mockSetState).toHaveBeenCalledWith("imageAttachments", [
      { name: "test.png", data: "abc123", mimeType: "image/png" },
    ]);

    globalThis.FileReader = OrigFileReader;
  });

  it("accepts jpeg images", () => {
    mockGetState.mockImplementation((key) => {
      if (key === "imageAttachments") return [];
      if (key === "attachedFiles") return [];
      return [];
    });

    const mockFileReader = {
      readAsDataURL: vi.fn(),
      onload: null,
      result: "data:image/jpeg;base64,xyz",
    };
    const OrigFileReader = globalThis.FileReader;
    globalThis.FileReader = function () { return mockFileReader; };

    const file = { type: "image/jpeg", size: 500, name: "photo.jpg" };
    addImageAttachment(file);

    expect(mockFileReader.readAsDataURL).toHaveBeenCalled();

    globalThis.FileReader = OrigFileReader;
  });

  it("accepts gif images", () => {
    const mockFileReader = {
      readAsDataURL: vi.fn(),
      onload: null,
      result: "data:image/gif;base64,gifdata",
    };
    const OrigFileReader = globalThis.FileReader;
    globalThis.FileReader = function () { return mockFileReader; };

    const file = { type: "image/gif", size: 200, name: "anim.gif" };
    addImageAttachment(file);

    expect(mockFileReader.readAsDataURL).toHaveBeenCalled();

    globalThis.FileReader = OrigFileReader;
  });

  it("accepts webp images", () => {
    const mockFileReader = {
      readAsDataURL: vi.fn(),
      onload: null,
      result: "data:image/webp;base64,webpdata",
    };
    const OrigFileReader = globalThis.FileReader;
    globalThis.FileReader = function () { return mockFileReader; };

    const file = { type: "image/webp", size: 300, name: "pic.webp" };
    addImageAttachment(file);

    expect(mockFileReader.readAsDataURL).toHaveBeenCalled();

    globalThis.FileReader = OrigFileReader;
  });
});

describe("removeImageAttachment", () => {
  it("removes image at given index", () => {
    const images = [
      { name: "a.png", data: "aa", mimeType: "image/png" },
      { name: "b.png", data: "bb", mimeType: "image/png" },
    ];
    mockGetState.mockImplementation((key) => {
      if (key === "imageAttachments") return images;
      if (key === "attachedFiles") return [];
      return [];
    });

    removeImageAttachment(0);

    expect(mockSetState).toHaveBeenCalledWith("imageAttachments", [
      { name: "b.png", data: "bb", mimeType: "image/png" },
    ]);
  });
});

describe("getImageAttachments", () => {
  it("returns current image attachments from state", () => {
    const images = [{ name: "test.png", data: "x", mimeType: "image/png" }];
    mockGetState.mockImplementation((key) => {
      if (key === "imageAttachments") return images;
      return [];
    });

    const result = getImageAttachments();
    expect(result).toEqual(images);
  });

  it("returns empty array when no images attached", () => {
    mockGetState.mockImplementation((key) => {
      if (key === "imageAttachments") return [];
      return [];
    });

    const result = getImageAttachments();
    expect(result).toEqual([]);
  });
});

describe("clearImageAttachments", () => {
  it("sets imageAttachments to empty array", () => {
    mockGetState.mockImplementation((key) => {
      if (key === "imageAttachments") return [];
      if (key === "attachedFiles") return [];
      return [];
    });

    clearImageAttachments();

    expect(mockSetState).toHaveBeenCalledWith("imageAttachments", []);
  });

  it("updates badge after clearing", () => {
    mockGetState.mockImplementation((key) => {
      if (key === "imageAttachments") return [];
      if (key === "attachedFiles") return [];
      return [];
    });

    clearImageAttachments();

    // Badge should be hidden since total is 0
    expect(mock$.attachBadge.classList.add).toHaveBeenCalledWith("hidden");
  });
});
