import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockReaddir = vi.fn();
const mockStat = vi.fn();
const mockMkdir = vi.fn();
const mockRm = vi.fn();
const mockRename = vi.fn();

vi.mock("fs/promises", () => ({
  readFile: (...args) => mockReadFile(...args),
  writeFile: (...args) => mockWriteFile(...args),
  readdir: (...args) => mockReaddir(...args),
  stat: (...args) => mockStat(...args),
  mkdir: (...args) => mockMkdir(...args),
  rm: (...args) => mockRm(...args),
  rename: (...args) => mockRename(...args),
}));

const mockExistsSync = vi.fn();
vi.mock("fs", () => ({
  existsSync: (...args) => mockExistsSync(...args),
}));

vi.mock("../../../../server/paths.js", () => ({
  configPath: vi.fn((name) => `/mock/config/${name}`),
}));

vi.mock("os", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, homedir: vi.fn(() => "/mock/home") };
});

// Mock global fetch for SkillsMP API calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const skillsModule = await import("../../../../server/routes/skills.js");
const skillsRouter = skillsModule.default;

// ── App setup ────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/skills", skillsRouter);
  return app;
}

const VALID_KEY = "sk_live_skillsmp_test1234abcd";
const VALID_CONFIG = JSON.stringify({ apiKey: VALID_KEY, defaultScope: "project", searchMode: "keyword" });
const EMPTY_CONFIG = JSON.stringify({ apiKey: "", defaultScope: "project", searchMode: "keyword" });

// ── Tests ────────────────────────────────────────────────────────────────────

describe("skills routes", () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockRm.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);
  });

  // ── GET /config ───────────────────────────────────────────────────────────

  describe("GET /skills/config", () => {
    it("returns activated: false when no key set", async () => {
      mockReadFile.mockResolvedValue(EMPTY_CONFIG);
      const res = await request(app).get("/skills/config");
      expect(res.status).toBe(200);
      expect(res.body.activated).toBe(false);
      expect(res.body.apiKey).toBe("");
    });

    it("returns activated: true with masked key when key is set", async () => {
      mockReadFile.mockResolvedValue(VALID_CONFIG);
      const res = await request(app).get("/skills/config");
      expect(res.status).toBe(200);
      expect(res.body.activated).toBe(true);
      expect(res.body.apiKey).toMatch(/^sk_live_skillsmp_\.\.\..*$/);
      expect(res.body.apiKey).not.toContain("test1234");
    });

    it("returns defaults when config file is missing", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      const res = await request(app).get("/skills/config");
      expect(res.status).toBe(200);
      expect(res.body.activated).toBe(false);
    });
  });

  // ── PUT /config ───────────────────────────────────────────────────────────

  describe("PUT /skills/config", () => {
    it("rejects invalid key format", async () => {
      mockReadFile.mockResolvedValue(EMPTY_CONFIG);
      const res = await request(app)
        .put("/skills/config")
        .send({ apiKey: "invalid-key" });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_KEY");
    });

    it("validates key with SkillsMP API before saving", async () => {
      mockReadFile.mockResolvedValue(EMPTY_CONFIG);
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

      const res = await request(app)
        .put("/skills/config")
        .send({ apiKey: VALID_KEY });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.activated).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("skillsmp.com/api/v1/skills/search"),
        expect.objectContaining({ headers: { Authorization: `Bearer ${VALID_KEY}` } })
      );
    });

    it("rejects key that fails SkillsMP validation", async () => {
      mockReadFile.mockResolvedValue(EMPTY_CONFIG);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { code: "INVALID_API_KEY" } }),
      });

      const res = await request(app)
        .put("/skills/config")
        .send({ apiKey: VALID_KEY });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_KEY");
    });

    it("deactivates with empty string", async () => {
      mockReadFile.mockResolvedValue(VALID_CONFIG);
      const res = await request(app)
        .put("/skills/config")
        .send({ apiKey: "" });
      expect(res.status).toBe(200);
      expect(res.body.activated).toBe(false);
    });
  });

  // ── requireApiKey middleware ───────────────────────────────────────────────

  describe("requireApiKey middleware", () => {
    it("returns 403 on gated routes when no key", async () => {
      mockReadFile.mockResolvedValue(EMPTY_CONFIG);

      const routes = [
        { method: "get", path: "/skills/search?q=test" },
        { method: "get", path: "/skills/ai-search?q=test" },
        { method: "get", path: "/skills/installed" },
        { method: "post", path: "/skills/install" },
        { method: "delete", path: "/skills/test-skill?scope=global" },
        { method: "put", path: "/skills/test-skill/toggle?scope=global" },
      ];

      for (const r of routes) {
        const res = await request(app)[r.method](r.path);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe("NO_API_KEY");
      }
    });

    it("allows GET /config and PUT /config without key", async () => {
      mockReadFile.mockResolvedValue(EMPTY_CONFIG);

      const getRes = await request(app).get("/skills/config");
      expect(getRes.status).toBe(200);

      const putRes = await request(app).put("/skills/config").send({ apiKey: "" });
      expect(putRes.status).toBe(200);
    });
  });

  // ── GET /search ───────────────────────────────────────────────────────────

  describe("GET /skills/search", () => {
    it("proxies search to SkillsMP", async () => {
      mockReadFile.mockResolvedValue(VALID_CONFIG);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          data: { skills: [{ name: "test-skill", author: "user1" }], pagination: { page: 1 } },
        }),
        headers: new Map([["X-RateLimit-Daily-Remaining", "499"]]),
      });

      const res = await request(app).get("/skills/search?q=test");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("requires q parameter", async () => {
      mockReadFile.mockResolvedValue(VALID_CONFIG);
      const res = await request(app).get("/skills/search");
      expect(res.status).toBe(400);
    });
  });

  // ── GET /ai-search ─────────────────────────────────────────────────────────

  describe("GET /skills/ai-search", () => {
    it("proxies AI search to SkillsMP and returns results with scores", async () => {
      mockReadFile.mockResolvedValue(VALID_CONFIG);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          data: {
            object: "vector_store.search_results.page",
            search_query: "expanded query",
            data: [
              {
                file_id: "f1",
                score: 0.9966,
                skill: { id: "s1", name: "code-review", author: "user1", description: "Review code" },
              },
            ],
            has_more: false,
          },
        }),
        headers: new Map([["X-RateLimit-Daily-Remaining", "498"]]),
      });

      const res = await request(app).get("/skills/ai-search?q=review%20my%20code");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.data[0].score).toBe(0.9966);
      expect(res.body.data.data[0].skill.name).toBe("code-review");
    });

    it("requires q parameter", async () => {
      mockReadFile.mockResolvedValue(VALID_CONFIG);
      const res = await request(app).get("/skills/ai-search");
      expect(res.status).toBe(400);
    });
  });

  // ── PUT /config edge cases ──────────────────────────────────────────────

  describe("PUT /skills/config edge cases", () => {
    it("updates defaultScope and searchMode without changing apiKey", async () => {
      mockReadFile.mockResolvedValue(VALID_CONFIG);
      const res = await request(app)
        .put("/skills/config")
        .send({ defaultScope: "global", searchMode: "ai" });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockWriteFile).toHaveBeenCalled();
      const saved = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(saved.defaultScope).toBe("global");
      expect(saved.searchMode).toBe("ai");
    });

    it("handles network error during key validation", async () => {
      mockReadFile.mockResolvedValue(EMPTY_CONFIG);
      mockFetch.mockRejectedValue(new Error("Network unreachable"));

      const res = await request(app)
        .put("/skills/config")
        .send({ apiKey: VALID_KEY });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("NETWORK_ERROR");
    });

    it("handles non-401 SkillsMP error during validation", async () => {
      mockReadFile.mockResolvedValue(EMPTY_CONFIG);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: { message: "Internal server error" } }),
      });

      const res = await request(app)
        .put("/skills/config")
        .send({ apiKey: VALID_KEY });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
    });
  });

  // ── GET /search edge cases ────────────────────────────────────────────────

  describe("GET /skills/search error forwarding", () => {
    it("forwards SkillsMP error status codes transparently", async () => {
      mockReadFile.mockResolvedValue(VALID_CONFIG);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({
          success: false,
          error: { code: "DAILY_QUOTA_EXCEEDED", message: "Quota exceeded" },
        }),
        headers: new Map(),
      });

      const res = await request(app).get("/skills/search?q=test");
      expect(res.status).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("DAILY_QUOTA_EXCEEDED");
    });
  });

  // ── POST /install edge cases ──────────────────────────────────────────────

  describe("POST /skills/install edge cases", () => {
    it("falls back to raw URL when GitHub API fails", async () => {
      mockReadFile.mockResolvedValue(VALID_CONFIG);

      // GitHub API fails (rate limited)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ message: "rate limit exceeded" }),
      });
      // Fallback raw SKILL.md fetch succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("# My skill"),
      });

      const res = await request(app)
        .post("/skills/install")
        .send({
          githubUrl: "https://github.com/o/r/tree/main/.claude/skills/test",
          name: "test",
          scope: "global",
          description: "A test skill",
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.filesCount).toBe(1);
    });

    it("injects frontmatter with description when SKILL.md has none", async () => {
      mockReadFile.mockResolvedValue(VALID_CONFIG);

      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve([
          { name: "SKILL.md", download_url: "https://raw.githubusercontent.com/o/r/main/s/SKILL.md", type: "file" },
        ]),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true, text: () => Promise.resolve("Just content, no frontmatter"),
      });

      const res = await request(app)
        .post("/skills/install")
        .send({
          githubUrl: "https://github.com/o/r/tree/main/.claude/skills/test",
          name: "test",
          description: "My description",
          scope: "global",
        });
      expect(res.status).toBe(200);

      // Verify the written content has frontmatter
      const writtenContent = mockWriteFile.mock.calls[0][1];
      expect(writtenContent).toContain("---");
      expect(writtenContent).toContain("name: test");
      expect(writtenContent).toContain("description: My description");
    });

    it("installs to project scope with correct path", async () => {
      mockReadFile.mockResolvedValue(VALID_CONFIG);

      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve([
          { name: "SKILL.md", download_url: "https://raw.githubusercontent.com/o/r/main/s/SKILL.md", type: "file" },
        ]),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true, text: () => Promise.resolve("---\nname: test\n---\nContent"),
      });

      const res = await request(app)
        .post("/skills/install")
        .send({
          githubUrl: "https://github.com/o/r/tree/main/.claude/skills/test",
          name: "test",
          scope: "project",
          projectPath: "/home/user/my-project",
        });
      expect(res.status).toBe(200);
      expect(res.body.path).toContain("/home/user/my-project/.claude/skills/test");
    });

    it("rejects unparseable GitHub URL", async () => {
      mockReadFile.mockResolvedValue(VALID_CONFIG);
      const res = await request(app)
        .post("/skills/install")
        .send({
          githubUrl: "https://example.com/not-github",
          name: "test",
          scope: "global",
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("parse");
    });
  });

  // ── parseGithubUrl ────────────────────────────────────────────────────────

  describe("parseGithubUrl", () => {
    it("parses standard GitHub URL", () => {
      const result = skillsModule.parseGithubUrl(
        "https://github.com/owner/repo/tree/main/.claude/skills/my-skill"
      );
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
        branch: "main",
        path: ".claude/skills/my-skill",
      });
    });

    it("handles master branch", () => {
      const result = skillsModule.parseGithubUrl(
        "https://github.com/user/project/tree/master/skills/tool"
      );
      expect(result).toEqual({
        owner: "user",
        repo: "project",
        branch: "master",
        path: "skills/tool",
      });
    });

    it("handles deeply nested paths", () => {
      const result = skillsModule.parseGithubUrl(
        "https://github.com/org/mono/tree/develop/packages/ai/.claude/skills/deep-skill"
      );
      expect(result).toEqual({
        owner: "org",
        repo: "mono",
        branch: "develop",
        path: "packages/ai/.claude/skills/deep-skill",
      });
    });

    it("returns null for invalid URL", () => {
      expect(skillsModule.parseGithubUrl("https://example.com/foo")).toBeNull();
    });
  });

  // ── POST /install ─────────────────────────────────────────────────────────

  describe("POST /skills/install", () => {
    it("normalizes skill name to valid format", async () => {
      mockReadFile.mockResolvedValue(VALID_CONFIG);

      // Mock GitHub API + file download
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve([
          { name: "SKILL.md", download_url: "https://raw.githubusercontent.com/o/r/main/s/SKILL.md", type: "file" },
        ]),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true, text: () => Promise.resolve("# Skill content"),
      });

      const res = await request(app)
        .post("/skills/install")
        .send({ githubUrl: "https://github.com/o/r/tree/main/s", name: "../evil", scope: "global" });
      // "../evil" gets normalized to "evil" — should succeed
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("rejects invalid scope", async () => {
      mockReadFile.mockResolvedValue(VALID_CONFIG);
      const res = await request(app)
        .post("/skills/install")
        .send({ githubUrl: "https://github.com/o/r/tree/main/s", name: "test", scope: "invalid" });
      expect(res.status).toBe(400);
    });

    it("rejects path traversal in projectPath", async () => {
      mockReadFile.mockResolvedValue(VALID_CONFIG);
      const res = await request(app)
        .post("/skills/install")
        .send({ githubUrl: "https://github.com/o/r/tree/main/s", name: "test", scope: "project", projectPath: "/home/../etc" });
      expect(res.status).toBe(400);
    });

    it("installs skill from GitHub", async () => {
      mockReadFile.mockResolvedValue(VALID_CONFIG);

      // Mock GitHub API (directory listing)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([
          { name: "SKILL.md", download_url: "https://raw.githubusercontent.com/o/r/main/s/SKILL.md", type: "file" },
        ]),
      });
      // Mock file download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("---\nname: test\n---\nSkill content"),
      });

      const res = await request(app)
        .post("/skills/install")
        .send({
          githubUrl: "https://github.com/o/r/tree/main/.claude/skills/test",
          name: "test",
          scope: "global",
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.filesCount).toBe(1);
    });
  });

  // ── DELETE /:name ─────────────────────────────────────────────────────────

  describe("DELETE /skills/:name", () => {
    it("deletes an existing skill", async () => {
      mockReadFile.mockResolvedValue(VALID_CONFIG);
      mockExistsSync.mockImplementation((p) => p.endsWith("SKILL.md"));

      const res = await request(app)
        .delete("/skills/test-skill?scope=global");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("returns 404 for non-skill directory", async () => {
      mockReadFile.mockResolvedValue(VALID_CONFIG);
      mockExistsSync.mockReturnValue(false);

      const res = await request(app)
        .delete("/skills/test-skill?scope=global");
      expect(res.status).toBe(404);
    });
  });

  // ── PUT /:name/toggle ────────────────────────────────────────────────────

  describe("PUT /skills/:name/toggle", () => {
    it("disables an enabled skill", async () => {
      mockReadFile.mockResolvedValue(VALID_CONFIG);
      mockExistsSync.mockImplementation((p) => p.endsWith("SKILL.md") && !p.endsWith(".disabled"));

      const res = await request(app)
        .put("/skills/test-skill/toggle?scope=global");
      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(false);
      expect(mockRename).toHaveBeenCalled();
    });

    it("enables a disabled skill", async () => {
      mockReadFile.mockResolvedValue(VALID_CONFIG);
      mockExistsSync.mockImplementation((p) => p.endsWith("SKILL.md.disabled"));

      const res = await request(app)
        .put("/skills/test-skill/toggle?scope=global");
      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(true);
    });

    it("returns 404 for nonexistent skill", async () => {
      mockReadFile.mockResolvedValue(VALID_CONFIG);
      mockExistsSync.mockReturnValue(false);

      const res = await request(app)
        .put("/skills/test-skill/toggle?scope=global");
      expect(res.status).toBe(404);
    });
  });

  // ── GET /installed ────────────────────────────────────────────────────────

  describe("GET /skills/installed", () => {
    it("lists installed skills from both scopes", async () => {
      mockReadFile.mockImplementation((path) => {
        if (path.endsWith("skillsmp-config.json")) return Promise.resolve(VALID_CONFIG);
        if (path.endsWith("SKILL.md")) {
          return Promise.resolve("---\nname: test-skill\ndescription: A test skill\n---\nContent");
        }
        return Promise.reject(new Error("not found"));
      });

      // Global skills directory
      mockReaddir.mockImplementation((dir) => {
        if (dir.includes(".claude/skills")) return Promise.resolve(["my-skill"]);
        return Promise.resolve([]);
      });

      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockExistsSync.mockImplementation((p) => p.endsWith("SKILL.md") && !p.endsWith(".disabled"));

      const res = await request(app).get("/skills/installed?projectPath=/test/project");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
