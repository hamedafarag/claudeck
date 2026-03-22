import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockReadFile = vi.fn();
const mockReaddir = vi.fn();
const mockStat = vi.fn();
const mockWriteFile = vi.fn();

vi.mock("fs/promises", () => ({
  readFile: (...args) => mockReadFile(...args),
  readdir: (...args) => mockReaddir(...args),
  stat: (...args) => mockStat(...args),
  writeFile: (...args) => mockWriteFile(...args),
}));

vi.mock("../../../../server/paths.js", () => ({
  configPath: vi.fn((name) => `/mock/config/${name}`),
}));

vi.mock("os", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, homedir: vi.fn(() => "/mock/home") };
});

const projectsModule = await import("../../../../server/routes/projects.js");
const projectsRouter = projectsModule.default;

// ── App setup ────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/projects", projectsRouter);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("projects routes", () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    mockWriteFile.mockResolvedValue(undefined);
  });

  // ── GET / (list projects) ───────────────────────────────────────────────

  describe("GET /projects", () => {
    it("returns project list from config", async () => {
      const projects = [
        { name: "My App", path: "/home/user/my-app" },
        { name: "Backend", path: "/home/user/backend" },
      ];
      mockReadFile.mockResolvedValue(JSON.stringify(projects));

      const res = await request(app).get("/projects");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(projects);
      expect(mockReadFile).toHaveBeenCalledWith("/mock/config/folders.json", "utf-8");
    });

    it("returns 500 when config file read fails", async () => {
      mockReadFile.mockRejectedValue(new Error("Read failed"));

      const res = await request(app).get("/projects");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Read failed");
    });
  });

  // ── POST / (add project) ───────────────────────────────────────────────

  describe("POST /projects", () => {
    it("adds a new project", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));
      mockStat.mockResolvedValue({ isDirectory: () => true });

      const res = await request(app).post("/projects").send({
        name: "New Project",
        path: "/home/user/new-project",
      });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.project.name).toBe("New Project");
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it("returns 400 when name is missing", async () => {
      const res = await request(app).post("/projects").send({
        path: "/some/path",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("name and path are required");
    });

    it("returns 400 when path is missing", async () => {
      const res = await request(app).post("/projects").send({
        name: "Project",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("name and path are required");
    });

    it("returns 400 when path is not a directory", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => false });

      const res = await request(app).post("/projects").send({
        name: "Project",
        path: "/home/user/file.txt",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Path is not a directory");
    });

    it("returns 409 when project with same path already exists", async () => {
      const existingPath = "/home/user/existing";
      mockReadFile.mockResolvedValue(
        JSON.stringify([{ name: "Existing", path: existingPath }]),
      );
      mockStat.mockResolvedValue({ isDirectory: () => true });

      const res = await request(app).post("/projects").send({
        name: "Duplicate",
        path: existingPath,
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("already exists");
    });
  });

  // ── DELETE / (remove project) ───────────────────────────────────────────

  describe("DELETE /projects", () => {
    it("removes a project by path", async () => {
      const projects = [
        { name: "Keep", path: "/keep" },
        { name: "Remove", path: "/remove" },
      ];
      mockReadFile.mockResolvedValue(JSON.stringify(projects));

      const res = await request(app).delete("/projects").send({ path: "/remove" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      // Verify only "Keep" remains in written data
      const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(written).toHaveLength(1);
      expect(written[0].name).toBe("Keep");
    });

    it("returns 400 when path is missing", async () => {
      const res = await request(app).delete("/projects").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("path is required");
    });

    it("returns 404 when project is not found", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).delete("/projects").send({ path: "/nonexistent" });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Project not found");
    });
  });

  // ── GET /browse (directory browser) ─────────────────────────────────────

  describe("GET /projects/browse", () => {
    it("returns directory listing with parent", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockReaddir.mockResolvedValue([
        { name: "src", isDirectory: () => true },
        { name: "docs", isDirectory: () => true },
        { name: ".hidden", isDirectory: () => true },
        { name: "file.txt", isDirectory: () => false },
      ]);

      const res = await request(app).get("/projects/browse?dir=/home/user");

      expect(res.status).toBe(200);
      // Should only include visible directories (not hidden, not files)
      expect(res.body.dirs).toHaveLength(2);
      expect(res.body.dirs[0].name).toBe("docs");
      expect(res.body.dirs[1].name).toBe("src");
      expect(res.body.current).toBeTruthy();
      expect(res.body.parent).toBeTruthy();
    });

    it("returns 400 when path is not a directory", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => false });

      const res = await request(app).get("/projects/browse?dir=/home/user/file.txt");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Not a directory");
    });

    it("returns 500 on stat error", async () => {
      mockStat.mockRejectedValue(new Error("Permission denied"));

      const res = await request(app).get("/projects/browse?dir=/root");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Permission denied");
    });
  });

  // ── PUT /system-prompt ──────────────────────────────────────────────────

  describe("PUT /projects/system-prompt", () => {
    it("saves system prompt for a project", async () => {
      const projects = [{ name: "App", path: "/app", systemPrompt: "" }];
      mockReadFile.mockResolvedValue(JSON.stringify(projects));

      const res = await request(app).put("/projects/system-prompt").send({
        path: "/app",
        systemPrompt: "You are a helpful assistant.",
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it("returns 400 when path is missing", async () => {
      const res = await request(app).put("/projects/system-prompt").send({
        systemPrompt: "test",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("path is required");
    });

    it("returns 404 when project is not found", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).put("/projects/system-prompt").send({
        path: "/nonexistent",
        systemPrompt: "test",
      });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Project not found");
    });
  });

  // ── GET /commands ───────────────────────────────────────────────────────

  describe("GET /projects/commands", () => {
    it("returns 400 when path is missing", async () => {
      const res = await request(app).get("/projects/commands");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("path is required");
    });

    it("returns commands from .claude/commands directory", async () => {
      // readdir for commands dir
      mockReaddir.mockResolvedValueOnce(["deploy.md"]);
      mockStat.mockResolvedValueOnce({ isDirectory: () => false });
      mockReadFile.mockResolvedValueOnce("# Deploy App\nRun the deployment");
      // readdir for skills dir - empty/error
      mockReaddir.mockRejectedValueOnce(new Error("ENOENT"));

      const res = await request(app).get("/projects/commands?path=/project");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].command).toBe("deploy");
      expect(res.body[0].description).toBe("Deploy App");
      expect(res.body[0].source).toBe("command");
    });

    it("returns empty array when no commands or skills exist", async () => {
      mockReaddir.mockRejectedValue(new Error("ENOENT"));

      const res = await request(app).get("/projects/commands?path=/project");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("reads commands from subdirectories with prefix", async () => {
      // readdir for commands dir — has a subfolder
      mockReaddir.mockResolvedValueOnce(["infra"]);
      // stat for "infra" — it is a directory
      mockStat.mockResolvedValueOnce({ isDirectory: () => true });
      // readdir for the subfolder
      mockReaddir.mockResolvedValueOnce(["deploy.md"]);
      // stat for "deploy.md" — it is a file
      mockStat.mockResolvedValueOnce({ isDirectory: () => false });
      // readFile for the md file
      mockReadFile.mockResolvedValueOnce("# Deploy Infrastructure\nDeploy to prod");
      // readdir for skills dir - empty/error
      mockReaddir.mockRejectedValueOnce(new Error("ENOENT"));

      const res = await request(app).get("/projects/commands?path=/project");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].command).toBe("infra:deploy");
      expect(res.body[0].description).toBe("Deploy Infrastructure");
      expect(res.body[0].source).toBe("command");
    });

    it("reads skills from .claude/skills/*/SKILL.md with frontmatter", async () => {
      // readdir for commands dir — empty
      mockReaddir.mockRejectedValueOnce(new Error("ENOENT"));
      // readdir for skills dir
      mockReaddir.mockResolvedValueOnce(["my-skill"]);
      // stat for "my-skill" — it is a directory
      mockStat.mockResolvedValueOnce({ isDirectory: () => true });
      // readFile for SKILL.md
      mockReadFile.mockResolvedValueOnce(
        '---\nname: Code Review\ndescription: Reviews code quality\nargument-hint: "path to review"\n---\n\nDo a code review',
      );

      const res = await request(app).get("/projects/commands?path=/project");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].command).toBe("Code Review");
      expect(res.body[0].description).toBe("Reviews code quality");
      expect(res.body[0].argumentHint).toBe("path to review");
      expect(res.body[0].source).toBe("skill");
    });

    it("reads skills without frontmatter — uses directory name", async () => {
      // readdir for commands dir — empty
      mockReaddir.mockRejectedValueOnce(new Error("ENOENT"));
      // readdir for skills dir
      mockReaddir.mockResolvedValueOnce(["simple-skill"]);
      // stat for "simple-skill" — it is a directory
      mockStat.mockResolvedValueOnce({ isDirectory: () => true });
      // readFile for SKILL.md — no frontmatter
      mockReadFile.mockResolvedValueOnce("Just a simple skill without frontmatter");

      const res = await request(app).get("/projects/commands?path=/project");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].command).toBe("simple-skill");
      expect(res.body[0].description).toBe("simple-skill");
      expect(res.body[0].source).toBe("skill");
    });

    it("skips non-directory entries in skills dir", async () => {
      // readdir for commands dir — empty
      mockReaddir.mockRejectedValueOnce(new Error("ENOENT"));
      // readdir for skills dir
      mockReaddir.mockResolvedValueOnce(["not-a-dir"]);
      // stat for "not-a-dir" — it is a file
      mockStat.mockResolvedValueOnce({ isDirectory: () => false });

      const res = await request(app).get("/projects/commands?path=/project");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("uses command file name as description when no title in content", async () => {
      // readdir for commands dir
      mockReaddir.mockResolvedValueOnce(["test.md"]);
      // stat for "test.md" — file
      mockStat.mockResolvedValueOnce({ isDirectory: () => false });
      // readFile — no # heading in content
      mockReadFile.mockResolvedValueOnce("Run all unit tests in the project");
      // readdir for skills dir — error
      mockReaddir.mockRejectedValueOnce(new Error("ENOENT"));

      const res = await request(app).get("/projects/commands?path=/project");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].command).toBe("test");
      // description falls back to the command name when no title match
      expect(res.body[0].description).toBe("test");
    });

    it("skips unreadable command entries gracefully", async () => {
      // readdir for commands dir
      mockReaddir.mockResolvedValueOnce(["good.md", "bad.md"]);
      // stat for "good.md"
      mockStat.mockResolvedValueOnce({ isDirectory: () => false });
      mockReadFile.mockResolvedValueOnce("# Good\nContent");
      // stat for "bad.md" — throws
      mockStat.mockRejectedValueOnce(new Error("Permission denied"));
      // readdir for skills dir — error
      mockReaddir.mockRejectedValueOnce(new Error("ENOENT"));

      const res = await request(app).get("/projects/commands?path=/project");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].command).toBe("good");
    });
  });

  // ── GET /browse — additional edge cases ──────────────────────────────
  describe("GET /projects/browse — additional edge cases", () => {
    it("uses homedir as default when no dir is provided", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockReaddir.mockResolvedValue([]);

      const res = await request(app).get("/projects/browse");

      expect(res.status).toBe(200);
      // The default is homedir() which is mocked to "/mock/home"
      expect(res.body.current).toBe("/mock/home");
    });

    it("returns parent as null for root directory", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockReaddir.mockResolvedValue([]);

      const res = await request(app).get("/projects/browse?dir=/");

      expect(res.status).toBe(200);
      expect(res.body.current).toBe("/");
      expect(res.body.parent).toBeNull();
    });

    it("filters out hidden directories (starting with dot)", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockReaddir.mockResolvedValue([
        { name: ".git", isDirectory: () => true },
        { name: ".config", isDirectory: () => true },
        { name: "src", isDirectory: () => true },
        { name: "node_modules", isDirectory: () => true },
      ]);

      const res = await request(app).get("/projects/browse?dir=/project");

      expect(res.status).toBe(200);
      expect(res.body.dirs).toHaveLength(2);
      expect(res.body.dirs.map((d) => d.name)).toEqual(["node_modules", "src"]);
    });

    it("sorts directories alphabetically", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockReaddir.mockResolvedValue([
        { name: "zebra", isDirectory: () => true },
        { name: "alpha", isDirectory: () => true },
        { name: "middle", isDirectory: () => true },
      ]);

      const res = await request(app).get("/projects/browse?dir=/project");

      expect(res.status).toBe(200);
      expect(res.body.dirs.map((d) => d.name)).toEqual(["alpha", "middle", "zebra"]);
    });
  });

  // ── PUT /system-prompt — additional edge cases ──────────────────────
  describe("PUT /projects/system-prompt — additional edge cases", () => {
    it("clears system prompt when empty string is passed", async () => {
      const projects = [{ name: "App", path: "/app", systemPrompt: "Old prompt" }];
      mockReadFile.mockResolvedValue(JSON.stringify(projects));

      const res = await request(app).put("/projects/system-prompt").send({
        path: "/app",
        systemPrompt: "",
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      // Verify the written data has empty systemPrompt
      const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(written[0].systemPrompt).toBe("");
    });

    it("sets systemPrompt to empty string when systemPrompt is undefined", async () => {
      const projects = [{ name: "App", path: "/app", systemPrompt: "Old" }];
      mockReadFile.mockResolvedValue(JSON.stringify(projects));

      const res = await request(app).put("/projects/system-prompt").send({
        path: "/app",
        // no systemPrompt field
      });

      expect(res.status).toBe(200);
      const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
      // systemPrompt || "" => ""
      expect(written[0].systemPrompt).toBe("");
    });

    it("returns 500 when readFile throws", async () => {
      mockReadFile.mockRejectedValue(new Error("Disk error"));

      const res = await request(app).put("/projects/system-prompt").send({
        path: "/app",
        systemPrompt: "test",
      });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Disk error");
    });
  });

  // ── POST / — additional edge cases ─────────────────────────────────
  describe("POST /projects — additional edge cases", () => {
    it("returns 500 when stat throws (path does not exist)", async () => {
      mockStat.mockRejectedValue(new Error("ENOENT: no such file or directory"));

      const res = await request(app).post("/projects").send({
        name: "Ghost",
        path: "/nonexistent/path",
      });

      expect(res.status).toBe(500);
      expect(res.body.error).toContain("ENOENT");
    });

    it("returns 500 when readFile fails after stat succeeds", async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockReadFile.mockRejectedValue(new Error("Read error"));

      const res = await request(app).post("/projects").send({
        name: "Project",
        path: "/some/path",
      });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Read error");
    });
  });

  // ── DELETE / — additional edge cases ────────────────────────────────
  describe("DELETE /projects — additional edge cases", () => {
    it("returns 500 when readFile fails", async () => {
      mockReadFile.mockRejectedValue(new Error("IO error"));

      const res = await request(app).delete("/projects").send({ path: "/test" });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("IO error");
    });
  });

  // ── getProjectSystemPrompt — branch coverage ──────────────────────────
  describe("getProjectSystemPrompt", () => {
    it("returns empty string when project is not found", () => {
      const { getProjectSystemPrompt } = projectsModule;
      // projectConfigs is loaded at module level; since mockReadFile may have
      // failed during initial load, configs might be empty.
      const result = getProjectSystemPrompt("/nonexistent/path");
      expect(result).toBe("");
    });

    it("returns empty string when project has no systemPrompt", async () => {
      const { getProjectSystemPrompt, loadProjectConfigs } = projectsModule;
      // Load configs with a project that has no systemPrompt field
      mockReadFile.mockResolvedValue(JSON.stringify([
        { name: "NoPrompt", path: "/no-prompt-project" },
      ]));
      await loadProjectConfigs();

      const result = getProjectSystemPrompt("/no-prompt-project");
      expect(result).toBe("");
    });

    it("returns systemPrompt when project has one", async () => {
      const { getProjectSystemPrompt, loadProjectConfigs } = projectsModule;
      mockReadFile.mockResolvedValue(JSON.stringify([
        { name: "WithPrompt", path: "/with-prompt", systemPrompt: "Always use TS" },
      ]));
      await loadProjectConfigs();

      const result = getProjectSystemPrompt("/with-prompt");
      expect(result).toBe("Always use TS");
    });

    it("returns empty string when systemPrompt is empty string", async () => {
      const { getProjectSystemPrompt, loadProjectConfigs } = projectsModule;
      mockReadFile.mockResolvedValue(JSON.stringify([
        { name: "EmptyPrompt", path: "/empty-prompt", systemPrompt: "" },
      ]));
      await loadProjectConfigs();

      const result = getProjectSystemPrompt("/empty-prompt");
      expect(result).toBe("");
    });
  });

  // ── loadProjectConfigs — error branch ──────────────────────────────────
  describe("loadProjectConfigs — error handling", () => {
    it("sets projectConfigs to empty array when readFile fails", async () => {
      const { getProjectSystemPrompt, loadProjectConfigs } = projectsModule;
      mockReadFile.mockRejectedValue(new Error("File not found"));
      await loadProjectConfigs();

      // After error, getProjectSystemPrompt should return empty for any path
      const result = getProjectSystemPrompt("/any/path");
      expect(result).toBe("");
    });
  });

  // ── GET /browse — line 64 branch: non-absolute path ────────────────────
  describe("GET /projects/browse — invalid path branch", () => {
    it("returns 500 when stat fails on the provided directory", async () => {
      mockStat.mockRejectedValue(new Error("ENOENT"));

      const res = await request(app).get("/projects/browse?dir=/nonexistent");

      expect(res.status).toBe(500);
    });
  });

  // ── POST / — additional branch: both name and path missing ─────────────
  describe("POST /projects — name/path validation", () => {
    it("returns 400 when both name and path are missing", async () => {
      const res = await request(app).post("/projects").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("name and path are required");
    });
  });
});
