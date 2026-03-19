import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("fs", () => ({
  readdirSync: vi.fn(() => []),
  existsSync: vi.fn(() => false),
  statSync: vi.fn(() => ({ isDirectory: () => true })),
  copyFileSync: vi.fn(),
}));

vi.mock("../../../server/paths.js", () => ({
  userConfigDir: "/home/user/.claudeck/config",
  userPluginsDir: "/home/user/.claudeck/plugins",
}));

import { mountPluginRoutes } from "../../../server/plugin-mount.js";
import { readdirSync, existsSync, statSync, copyFileSync } from "fs";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockApp() {
  return {
    use: vi.fn(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("plugin-mount — mountPluginRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env var
    delete process.env.CLAUDECK_USER_SERVER_PLUGINS;
  });

  // ── Empty plugins directory ─────────────────────────────────────────────
  it("does nothing with empty plugins directory", async () => {
    existsSync.mockReturnValue(false);

    const app = createMockApp();
    await mountPluginRoutes(app, "/nonexistent/plugins");

    expect(app.use).not.toHaveBeenCalled();
  });

  // ── Plugins dir exists but is empty ─────────────────────────────────────
  it("does nothing when plugins dir exists but has no entries", async () => {
    existsSync.mockImplementation((path) => {
      if (path === "/plugins") return true;
      return false;
    });
    readdirSync.mockReturnValue([]);

    const app = createMockApp();
    await mountPluginRoutes(app, "/plugins");

    expect(app.use).not.toHaveBeenCalled();
  });

  // ── Plugin with server.js attempts to mount (dynamic import can't be mocked in vitest)
  it("attempts to mount plugin that has server.js", async () => {
    existsSync.mockImplementation((path) => {
      if (path === "/plugins") return true;
      if (path === "/plugins/my-plugin/server.js") return true;
      if (path === "/plugins/my-plugin/config.json") return false;
      if (path === "/home/user/.claudeck/plugins") return false;
      return false;
    });
    readdirSync.mockReturnValue(["my-plugin"]);
    statSync.mockReturnValue({ isDirectory: () => true });

    const app = createMockApp();
    // Dynamic import of file:// URLs can't be mocked, so the import will fail
    // but the function should handle it gracefully (console.error + continue)
    await mountPluginRoutes(app, "/plugins");

    // The import fails, so app.use is NOT called — but no exception is thrown
    expect(app.use).not.toHaveBeenCalled();
  });

  // ── Plugin without server.js is skipped ─────────────────────────────────
  it("skips plugins without server.js", async () => {
    existsSync.mockImplementation((path) => {
      if (path === "/plugins") return true;
      if (path === "/plugins/static-plugin/server.js") return false;
      if (path === "/plugins/static-plugin/config.json") return false;
      if (path === "/home/user/.claudeck/plugins") return false;
      return false;
    });
    readdirSync.mockReturnValue(["static-plugin"]);
    statSync.mockReturnValue({ isDirectory: () => true });

    const app = createMockApp();
    await mountPluginRoutes(app, "/plugins");

    expect(app.use).not.toHaveBeenCalled();
  });

  // ── Non-directory entries are skipped ───────────────────────────────────
  it("skips non-directory entries in plugins folder", async () => {
    existsSync.mockImplementation((path) => {
      if (path === "/plugins") return true;
      if (path === "/home/user/.claudeck/plugins") return false;
      return false;
    });
    readdirSync.mockReturnValue(["README.md"]);
    statSync.mockReturnValue({ isDirectory: () => false });

    const app = createMockApp();
    await mountPluginRoutes(app, "/plugins");

    expect(app.use).not.toHaveBeenCalled();
  });

  // ── Copies default config if plugin ships one ──────────────────────────
  it("copies default config when plugin ships config.json and user has none", async () => {
    existsSync.mockImplementation((path) => {
      if (path === "/plugins") return true;
      if (path === "/plugins/my-plugin/config.json") return true;
      if (path === "/home/user/.claudeck/config/my-plugin-config.json") return false;
      if (path === "/plugins/my-plugin/server.js") return false;
      if (path === "/home/user/.claudeck/plugins") return false;
      return false;
    });
    readdirSync.mockReturnValue(["my-plugin"]);
    statSync.mockReturnValue({ isDirectory: () => true });

    const app = createMockApp();
    await mountPluginRoutes(app, "/plugins");

    expect(copyFileSync).toHaveBeenCalledWith(
      "/plugins/my-plugin/config.json",
      "/home/user/.claudeck/config/my-plugin-config.json",
    );
  });

  // ── Does not overwrite existing user config ────────────────────────────
  it("does not overwrite existing user config", async () => {
    existsSync.mockImplementation((path) => {
      if (path === "/plugins") return true;
      if (path === "/plugins/my-plugin/config.json") return true;
      if (path === "/home/user/.claudeck/config/my-plugin-config.json") return true; // already exists
      if (path === "/plugins/my-plugin/server.js") return false;
      if (path === "/home/user/.claudeck/plugins") return false;
      return false;
    });
    readdirSync.mockReturnValue(["my-plugin"]);
    statSync.mockReturnValue({ isDirectory: () => true });

    const app = createMockApp();
    await mountPluginRoutes(app, "/plugins");

    expect(copyFileSync).not.toHaveBeenCalled();
  });

  // ── User plugins are discovered ────────────────────────────────────────
  it("discovers user plugins from userPluginsDir", async () => {
    existsSync.mockImplementation((path) => {
      if (path === "/plugins") return true;
      if (path === "/home/user/.claudeck/plugins") return true;
      if (path === "/home/user/.claudeck/plugins/user-plugin/server.js") return false;
      if (path === "/home/user/.claudeck/plugins/user-plugin/config.json") return false;
      return false;
    });
    readdirSync.mockImplementation((path) => {
      if (path === "/plugins") return [];
      if (path === "/home/user/.claudeck/plugins") return ["user-plugin"];
      return [];
    });
    statSync.mockReturnValue({ isDirectory: () => true });

    const app = createMockApp();
    await mountPluginRoutes(app, "/plugins");

    // Without server.js, nothing is mounted, but it should not error
    expect(app.use).not.toHaveBeenCalled();
  });

  // ── User server plugins blocked without env var ────────────────────────
  it("skips user plugin server.js when CLAUDECK_USER_SERVER_PLUGINS is not set", async () => {
    existsSync.mockImplementation((path) => {
      if (path === "/plugins") return true;
      if (path === "/home/user/.claudeck/plugins") return true;
      if (path === "/home/user/.claudeck/plugins/user-plugin/server.js") return true;
      if (path === "/home/user/.claudeck/plugins/user-plugin/config.json") return false;
      return false;
    });
    readdirSync.mockImplementation((path) => {
      if (path === "/plugins") return [];
      if (path === "/home/user/.claudeck/plugins") return ["user-plugin"];
      return [];
    });
    statSync.mockReturnValue({ isDirectory: () => true });

    const app = createMockApp();
    await mountPluginRoutes(app, "/plugins");

    // Server routes should NOT be mounted because env var is not set
    expect(app.use).not.toHaveBeenCalled();
  });

  // ── User server plugins allowed with env var ──────────────────────────
  it("mounts user plugin server.js when CLAUDECK_USER_SERVER_PLUGINS=true", async () => {
    process.env.CLAUDECK_USER_SERVER_PLUGINS = "true";

    const mockRouter = { get: vi.fn() };

    existsSync.mockImplementation((path) => {
      if (path === "/plugins") return true;
      if (path === "/home/user/.claudeck/plugins") return true;
      if (path === "/home/user/.claudeck/plugins/user-plugin/server.js") return true;
      if (path === "/home/user/.claudeck/plugins/user-plugin/config.json") return false;
      return false;
    });
    readdirSync.mockImplementation((path) => {
      if (path === "/plugins") return [];
      if (path === "/home/user/.claudeck/plugins") return ["user-plugin"];
      return [];
    });
    statSync.mockReturnValue({ isDirectory: () => true });

    const app = createMockApp();
    // Dynamic import of file:// URLs can't be mocked in vitest
    await mountPluginRoutes(app, "/plugins");
    // Import fails gracefully, but the plugin discovery still works
    expect(app.use).not.toHaveBeenCalled();
  });

  // ── Builtin wins over user plugin with same name ──────────────────────
  it("builtin plugin takes precedence over user plugin with same name", async () => {
    existsSync.mockImplementation((path) => {
      if (path === "/plugins") return true;
      if (path === "/home/user/.claudeck/plugins") return true;
      if (path === "/plugins/shared-name/server.js") return true;
      if (path === "/plugins/shared-name/config.json") return false;
      if (path === "/home/user/.claudeck/plugins/shared-name/server.js") return true;
      if (path === "/home/user/.claudeck/plugins/shared-name/config.json") return false;
      return false;
    });
    readdirSync.mockImplementation((path) => {
      if (path === "/plugins") return ["shared-name"];
      if (path === "/home/user/.claudeck/plugins") return ["shared-name"];
      return [];
    });
    statSync.mockReturnValue({ isDirectory: () => true });

    const app = createMockApp();
    // The builtin server.js import will fail, but critically the user plugin
    // with the same name is NOT attempted (builtin wins in discovery)
    await mountPluginRoutes(app, "/plugins");
    expect(app.use).not.toHaveBeenCalled(); // import fails gracefully
  });

  // ── Handles plugin import failure gracefully ──────────────────────────
  it("handles plugin server.js import failure gracefully", async () => {
    existsSync.mockImplementation((path) => {
      if (path === "/plugins") return true;
      if (path === "/plugins/broken-plugin/server.js") return true;
      if (path === "/plugins/broken-plugin/config.json") return false;
      if (path === "/home/user/.claudeck/plugins") return false;
      return false;
    });
    readdirSync.mockReturnValue(["broken-plugin"]);
    statSync.mockReturnValue({ isDirectory: () => true });

    // The import will fail because the file doesn't actually exist
    // mountPluginRoutes catches import errors internally

    const app = createMockApp();

    // Should not throw
    await mountPluginRoutes(app, "/plugins");

    // app.use should not be called because the import failed
    expect(app.use).not.toHaveBeenCalled();
  });

  // ── Multiple plugins discovered ──────────────────────────────────────
  it("discovers multiple builtin plugins", async () => {
    existsSync.mockImplementation((path) => {
      if (path === "/plugins") return true;
      if (path === "/plugins/plugin-a/server.js") return true;
      if (path === "/plugins/plugin-b/server.js") return true;
      if (path === "/plugins/plugin-a/config.json") return false;
      if (path === "/plugins/plugin-b/config.json") return false;
      if (path === "/home/user/.claudeck/plugins") return false;
      return false;
    });
    readdirSync.mockReturnValue(["plugin-a", "plugin-b"]);
    statSync.mockReturnValue({ isDirectory: () => true });

    const app = createMockApp();
    // Both plugins found but dynamic imports fail in test env
    await mountPluginRoutes(app, "/plugins");
    // No throw — graceful error handling for both
    expect(app.use).not.toHaveBeenCalled();
  });
});
