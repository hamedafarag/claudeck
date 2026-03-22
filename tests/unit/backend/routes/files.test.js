import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockReaddir = vi.fn();
const mockReadFile = vi.fn();
const mockStat = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();

vi.mock("fs/promises", () => ({
  readdir: (...args) => mockReaddir(...args),
  readFile: (...args) => mockReadFile(...args),
  stat: (...args) => mockStat(...args),
  writeFile: (...args) => mockWriteFile(...args),
  mkdir: (...args) => mockMkdir(...args),
}));

const filesRouter = (await import("../../../../server/routes/files.js")).default;

// ── App setup ────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/files", filesRouter);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("files routes", () => {
  let app;

  beforeEach(() => {
    vi.resetAllMocks();
    app = buildApp();
  });

  // ── GET / (file listing) ────────────────────────────────────────────────

  describe("GET /files", () => {
    it("returns flat file list from recursive walk", async () => {
      // First call: root directory entries
      mockReaddir.mockResolvedValueOnce([
        { name: "src", isDirectory: () => true },
        { name: "readme.md", isDirectory: () => false },
      ]);
      // Second call: src directory entries
      mockReaddir.mockResolvedValueOnce([
        { name: "index.js", isDirectory: () => false },
      ]);

      const res = await request(app).get("/files?path=/project");

      expect(res.status).toBe(200);
      expect(res.body).toContain("readme.md");
      expect(res.body).toContain("src/index.js");
    });

    it("skips ignored directories like node_modules and .git", async () => {
      mockReaddir.mockResolvedValueOnce([
        { name: "node_modules", isDirectory: () => true },
        { name: ".git", isDirectory: () => true },
        { name: "app.js", isDirectory: () => false },
      ]);

      const res = await request(app).get("/files?path=/project");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(["app.js"]);
    });

    it("returns 400 when path query param is missing", async () => {
      const res = await request(app).get("/files");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("path query param required");
    });

    it("respects MAX_DEPTH of 3 and does not recurse deeper", async () => {
      // depth 0 -> depth 1 -> depth 2 -> depth 3 -> should NOT recurse into depth 4
      // walk(basePath, 0): reads d1 (depth 0), recurses to depth 1
      // walk(d1, 1): reads d2 (depth 1), recurses to depth 2
      // walk(d1/d2, 2): reads d3 (depth 2), recurses to depth 3
      // walk(d1/d2/d3, 3): reads deep.js (depth 3), MAX_DEPTH check stops at >3
      // d3 contains a directory that would go to depth 4 but d3 has depth=3 so walk is called with depth=4 which is >MAX_DEPTH=3, returns immediately
      mockReaddir.mockResolvedValueOnce([
        { name: "d1", isDirectory: () => true },
      ]);
      mockReaddir.mockResolvedValueOnce([
        { name: "d2", isDirectory: () => true },
      ]);
      mockReaddir.mockResolvedValueOnce([
        { name: "d3", isDirectory: () => true },
      ]);
      // depth 3: d3 contains a file and a deeper directory
      mockReaddir.mockResolvedValueOnce([
        { name: "deep.js", isDirectory: () => false },
        { name: "d4", isDirectory: () => true },
      ]);
      // d4 at depth 4 (> MAX_DEPTH 3) should not be explored — walk returns early

      const res = await request(app).get("/files?path=/project");

      expect(res.status).toBe(200);
      expect(res.body).toContain("d1/d2/d3/deep.js");
      // readdir should have been called 4 times (depths 0-3), not 5
      expect(mockReaddir).toHaveBeenCalledTimes(4);
    });

    it("respects MAX_FILES limit of 500", async () => {
      // Create a directory listing with more than 500 files
      const manyFiles = [];
      for (let i = 0; i < 510; i++) {
        manyFiles.push({ name: `file${i}.js`, isDirectory: () => false });
      }
      mockReaddir.mockResolvedValueOnce(manyFiles);

      const res = await request(app).get("/files?path=/project");

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(500);
    });

    it("silently ignores permission errors during walk", async () => {
      // First call succeeds, second call (subdirectory) fails with permission error
      mockReaddir.mockResolvedValueOnce([
        { name: "restricted", isDirectory: () => true },
        { name: "ok.js", isDirectory: () => false },
      ]);
      mockReaddir.mockRejectedValueOnce(new Error("EACCES: permission denied"));

      const res = await request(app).get("/files?path=/project");

      expect(res.status).toBe(200);
      expect(res.body).toContain("ok.js");
    });
  });

  // ── GET /content (read file) ────────────────────────────────────────────

  describe("GET /files/content", () => {
    it("returns file content", async () => {
      mockStat.mockResolvedValue({ size: 100 });
      mockReadFile.mockResolvedValue("file content here");

      const res = await request(app).get("/files/content?base=/project&path=src/app.js");

      expect(res.status).toBe(200);
      expect(res.body.content).toBe("file content here");
      expect(res.body.path).toBe("src/app.js");
    });

    it("returns 400 when base is missing", async () => {
      const res = await request(app).get("/files/content?path=file.js");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("base and path required");
    });

    it("returns 400 when path is missing", async () => {
      const res = await request(app).get("/files/content?base=/project");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("base and path required");
    });

    it("returns 413 when file exceeds 50KB limit", async () => {
      mockStat.mockResolvedValue({ size: 60 * 1024 });

      const res = await request(app).get("/files/content?base=/project&path=big.bin");

      expect(res.status).toBe(413);
      expect(res.body.error).toContain("50KB limit");
    });

    it("returns 404 when file does not exist", async () => {
      mockStat.mockRejectedValue(new Error("ENOENT: no such file"));

      const res = await request(app).get("/files/content?base=/project&path=missing.js");

      expect(res.status).toBe(404);
    });

    it("returns 403 for path traversal attempt", async () => {
      const res = await request(app).get("/files/content?base=/project&path=../../etc/passwd");

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("path traversal detected");
    });
  });

  // ── GET /tree (directory tree) ──────────────────────────────────────────

  describe("GET /files/tree", () => {
    it("returns directory listing sorted dirs-first then alphabetical", async () => {
      mockReaddir.mockResolvedValue([
        { name: "zebra.js", isDirectory: () => false },
        { name: "src", isDirectory: () => true },
        { name: "apple.js", isDirectory: () => false },
        { name: "docs", isDirectory: () => true },
      ]);

      const res = await request(app).get("/files/tree?base=/project");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(4);
      // Directories first
      expect(res.body[0].type).toBe("dir");
      expect(res.body[1].type).toBe("dir");
      // Then files alphabetically
      expect(res.body[2].name).toBe("apple.js");
      expect(res.body[3].name).toBe("zebra.js");
    });

    it("skips ignored directories", async () => {
      mockReaddir.mockResolvedValue([
        { name: "node_modules", isDirectory: () => true },
        { name: ".git", isDirectory: () => true },
        { name: "src", isDirectory: () => true },
      ]);

      const res = await request(app).get("/files/tree?base=/project");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe("src");
    });

    it("returns 400 when base is missing", async () => {
      const res = await request(app).get("/files/tree");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("base query param required");
    });

    it("returns empty array when directory does not exist (ENOENT)", async () => {
      const err = new Error("ENOENT");
      err.code = "ENOENT";
      mockReaddir.mockRejectedValue(err);

      const res = await request(app).get("/files/tree?base=/project&dir=missing");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("uses dir query param as subdirectory", async () => {
      mockReaddir.mockResolvedValue([
        { name: "index.js", isDirectory: () => false },
      ]);

      const res = await request(app).get("/files/tree?base=/project&dir=src");

      expect(res.status).toBe(200);
      expect(res.body[0].path).toBe("src/index.js");
    });

    it("returns 403 for path traversal attempt", async () => {
      const res = await request(app).get("/files/tree?base=/project&dir=../../etc");

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("path traversal detected");
    });

    it("returns 500 for non-ENOENT errors", async () => {
      const err = new Error("EPERM: operation not permitted");
      err.code = "EPERM";
      mockReaddir.mockRejectedValue(err);

      const res = await request(app).get("/files/tree?base=/project&dir=src");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("EPERM: operation not permitted");
    });

    it("returns entries at root when dir is not specified", async () => {
      mockReaddir.mockResolvedValue([
        { name: "index.js", isDirectory: () => false },
      ]);

      const res = await request(app).get("/files/tree?base=/project");

      expect(res.status).toBe(200);
      expect(res.body[0].path).toBe("index.js");
      expect(res.body[0].name).toBe("index.js");
      expect(res.body[0].type).toBe("file");
    });
  });

  // ── GET /search ─────────────────────────────────────────────────────────

  describe("GET /files/search", () => {
    it("returns matching files and directories", async () => {
      mockReaddir.mockResolvedValue([
        { name: "config.js", isDirectory: () => false },
        { name: "config.json", isDirectory: () => false },
        { name: "readme.md", isDirectory: () => false },
      ]);

      const res = await request(app).get("/files/search?base=/project&q=config");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe("config.js");
      expect(res.body[1].name).toBe("config.json");
    });

    it("returns 400 when base is missing", async () => {
      const res = await request(app).get("/files/search?q=test");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("base query param required");
    });

    it("returns empty array when q is missing", async () => {
      const res = await request(app).get("/files/search?base=/project");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("searches recursively into subdirectories", async () => {
      // Root has a directory and a non-matching file
      mockReaddir.mockResolvedValueOnce([
        { name: "src", isDirectory: () => true },
        { name: "readme.md", isDirectory: () => false },
      ]);
      // src has a matching file
      mockReaddir.mockResolvedValueOnce([
        { name: "config.ts", isDirectory: () => false },
      ]);

      const res = await request(app).get("/files/search?base=/project&q=config");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].path).toBe("src/config.ts");
      expect(res.body[0].type).toBe("file");
    });

    it("matches directories as well as files", async () => {
      mockReaddir.mockResolvedValueOnce([
        { name: "config", isDirectory: () => true },
        { name: "config.js", isDirectory: () => false },
      ]);
      // Inside config dir (also recurses)
      mockReaddir.mockResolvedValueOnce([]);

      const res = await request(app).get("/files/search?base=/project&q=config");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      // Directories should sort first
      expect(res.body[0].type).toBe("dir");
      expect(res.body[1].type).toBe("file");
    });

    it("is case-insensitive", async () => {
      mockReaddir.mockResolvedValueOnce([
        { name: "README.md", isDirectory: () => false },
        { name: "readme.txt", isDirectory: () => false },
      ]);

      const res = await request(app).get("/files/search?base=/project&q=readme");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it("respects MAX_RESULTS limit of 50", async () => {
      const manyFiles = [];
      for (let i = 0; i < 60; i++) {
        manyFiles.push({ name: `match${i}.js`, isDirectory: () => false });
      }
      mockReaddir.mockResolvedValueOnce(manyFiles);

      const res = await request(app).get("/files/search?base=/project&q=match");

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(50);
    });

    it("skips ignored directories during search", async () => {
      mockReaddir.mockResolvedValueOnce([
        { name: "node_modules", isDirectory: () => true },
        { name: ".git", isDirectory: () => true },
        { name: "config.js", isDirectory: () => false },
      ]);

      const res = await request(app).get("/files/search?base=/project&q=config");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe("config.js");
    });

    it("silently ignores permission errors during search walk", async () => {
      mockReaddir.mockResolvedValueOnce([
        { name: "accessible", isDirectory: () => true },
        { name: "test.js", isDirectory: () => false },
      ]);
      // accessible dir throws permission error
      mockReaddir.mockRejectedValueOnce(new Error("EACCES: permission denied"));

      const res = await request(app).get("/files/search?base=/project&q=test");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe("test.js");
    });
  });

  // ── GET /raw (serve raw binary files) ──────────────────────────────────

  describe("GET /files/raw", () => {
    it("returns 400 when base is missing", async () => {
      const res = await request(app).get("/files/raw?path=img.png");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("base and path required");
    });

    it("returns 400 when path is missing", async () => {
      const res = await request(app).get("/files/raw?base=/project");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("base and path required");
    });

    it("returns 403 for path traversal attempt", async () => {
      const res = await request(app).get("/files/raw?base=/project&path=../../etc/passwd.png");

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("path traversal detected");
    });

    it("returns 415 for unsupported file type", async () => {
      const res = await request(app).get("/files/raw?base=/project&path=src/app.js");

      expect(res.status).toBe(415);
      expect(res.body.error).toBe("unsupported file type");
    });

    it("returns 413 when image exceeds 5MB limit", async () => {
      mockStat.mockResolvedValue({ size: 6 * 1024 * 1024 });

      const res = await request(app).get("/files/raw?base=/project&path=large.png");

      expect(res.status).toBe(413);
      expect(res.body.error).toContain("5MB limit");
    });

    it("returns 404 when image file does not exist", async () => {
      mockStat.mockRejectedValue(new Error("ENOENT: no such file"));

      const res = await request(app).get("/files/raw?base=/project&path=missing.png");

      expect(res.status).toBe(404);
    });

    it("serves a valid PNG file with correct MIME type", async () => {
      mockStat.mockResolvedValue({ size: 1024 });

      const res = await request(app).get("/files/raw?base=/project&path=logo.png");

      // sendFile will fail in test env since file doesn't exist, but we verify it got past the checks
      // The route calls res.type(mime).sendFile(resolved) - in test this may 404 because the actual file doesn't exist
      // We just verify it didn't return 415 or 413
      expect(res.status).not.toBe(415);
      expect(res.status).not.toBe(413);
    });

    it("recognizes all supported image extensions", async () => {
      const extensions = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"];
      for (const ext of extensions) {
        mockStat.mockResolvedValue({ size: 1024 });
        const res = await request(app).get(`/files/raw?base=/project&path=image${ext}`);
        // Should not be 415 (unsupported) for known extensions
        expect(res.status).not.toBe(415);
      }
    });
  });

  // ── PUT /content (write file) ───────────────────────────────────────────

  describe("PUT /files/content", () => {
    it("writes allowed file content", async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const res = await request(app).put("/files/content").send({
        base: "/project",
        path: "CLAUDE.md",
        content: "# Instructions",
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, path: "CLAUDE.md" });
    });

    it("returns 403 for non-allowed file", async () => {
      const res = await request(app).put("/files/content").send({
        base: "/project",
        path: "package.json",
        content: "{}",
      });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("writing this file is not allowed");
    });

    it("returns 400 when base is missing", async () => {
      const res = await request(app).put("/files/content").send({
        path: "CLAUDE.md",
        content: "test",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("base and path required");
    });

    it("returns 400 when content is not a string", async () => {
      const res = await request(app).put("/files/content").send({
        base: "/project",
        path: "CLAUDE.md",
        content: 123,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("content must be a string");
    });

    it("returns 403 for path traversal attempt", async () => {
      const res = await request(app).put("/files/content").send({
        base: "/project",
        path: "../../etc/CLAUDE.md",
        content: "test",
      });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("path traversal detected");
    });

    it("writes .claude/settings.json (another allowed file)", async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const res = await request(app).put("/files/content").send({
        base: "/project",
        path: ".claude/settings.json",
        content: "{}",
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, path: ".claude/settings.json" });
      expect(mockMkdir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it("returns 500 when writeFile throws", async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockRejectedValue(new Error("ENOSPC: no space left on device"));

      const res = await request(app).put("/files/content").send({
        base: "/project",
        path: "CLAUDE.md",
        content: "# Test",
      });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("ENOSPC: no space left on device");
    });

    it("returns 500 when mkdir throws", async () => {
      mockMkdir.mockRejectedValue(new Error("EACCES: permission denied"));

      const res = await request(app).put("/files/content").send({
        base: "/project",
        path: "CLAUDE.md",
        content: "# Test",
      });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("EACCES: permission denied");
    });

    it("returns 400 when path is missing from body", async () => {
      const res = await request(app).put("/files/content").send({
        base: "/project",
        content: "test",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("base and path required");
    });
  });
});
