import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "path";
import { homedir } from "os";

// paths.js has side effects at import time (mkdirSync, copyFileSync, etc.).
// We mock the fs module to prevent actual filesystem operations and to
// control what the module "sees" on disk.
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    mkdirSync: vi.fn(),
    existsSync: vi.fn(() => false),
    copyFileSync: vi.fn(),
    readdirSync: vi.fn(() => []),
  };
});

describe("paths module", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  // ── CLAUDECK_HOME env var ──────────────────────────────────────────────
  it("userDir uses CLAUDECK_HOME env var when set", async () => {
    // The test setup.js already sets CLAUDECK_HOME to a temp dir.
    // Verify the module respects it.
    const testHome = process.env.CLAUDECK_HOME;
    const mod = await import("../../../server/paths.js");

    expect(mod.userDir).toBe(testHome);
    expect(mod.userConfigDir).toBe(join(testHome, "config"));
    expect(mod.dbPath).toBe(join(testHome, "data.db"));
  });

  it("userDir defaults to ~/.claudeck when CLAUDECK_HOME is unset", async () => {
    // Temporarily unset CLAUDECK_HOME
    const original = process.env.CLAUDECK_HOME;
    delete process.env.CLAUDECK_HOME;

    try {
      const mod = await import("../../../server/paths.js");
      expect(mod.userDir).toBe(join(homedir(), ".claudeck"));
    } finally {
      // Restore for other tests
      process.env.CLAUDECK_HOME = original;
    }
  });

  // ── configPath helper ──────────────────────────────────────────────────
  it("configPath returns correct path inside userConfigDir", async () => {
    const mod = await import("../../../server/paths.js");

    const result = mod.configPath("agents.json");
    expect(result).toBe(join(mod.userConfigDir, "agents.json"));
  });

  it("configPath works with nested filenames", async () => {
    const mod = await import("../../../server/paths.js");

    const result = mod.configPath("sub/file.json");
    expect(result).toBe(join(mod.userConfigDir, "sub/file.json"));
  });

  // ── packageRoot ────────────────────────────────────────────────────────
  it("packageRoot resolves to the project root directory", async () => {
    const mod = await import("../../../server/paths.js");

    // packageRoot should be one level up from server/ (the directory of paths.js)
    // It should contain package.json
    expect(mod.packageRoot).toBeDefined();
    // packageRoot is join(__dirname, "..") where __dirname is the server/ folder
    // So it should end at the project root
    expect(mod.packageRoot).not.toContain("server");
  });

  // ── Exported paths are consistent ─────────────────────────────────────
  it("defaultConfigDir is inside packageRoot", async () => {
    const mod = await import("../../../server/paths.js");

    expect(mod.defaultConfigDir).toBe(join(mod.packageRoot, "config"));
  });

  it("userPluginsDir is inside userDir", async () => {
    const mod = await import("../../../server/paths.js");

    expect(mod.userPluginsDir).toBe(join(mod.userDir, "plugins"));
  });

  // ── Bootstrap side effects ─────────────────────────────────────────────
  it("creates userConfigDir and userPluginsDir on import", async () => {
    const { mkdirSync } = await import("fs");

    await import("../../../server/paths.js");

    // mkdirSync should have been called with recursive: true
    expect(mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining("config"),
      { recursive: true },
    );
    expect(mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining("plugins"),
      { recursive: true },
    );
  });
});
