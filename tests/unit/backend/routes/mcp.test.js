import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn(async () => {});

vi.mock("fs/promises", () => ({
  readFile: (...args) => mockReadFile(...args),
  writeFile: (...args) => mockWriteFile(...args),
  mkdir: (...args) => mockMkdir(...args),
}));

vi.mock("os", () => ({
  homedir: () => "/mock/home",
}));

const routerModule = await import("../../../../server/routes/mcp.js");
const router = routerModule.default;

// ── App setup ────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/", router);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("mcp routes", () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  // ── GET /servers ─────────────────────────────────────────────────────────
  describe("GET /servers", () => {
    it("returns MCP servers from global settings", async () => {
      const settings = {
        mcpServers: {
          myServer: { command: "node", args: ["server.js"] },
        },
      };
      mockReadFile.mockResolvedValue(JSON.stringify(settings));

      const res = await request(app).get("/servers");

      expect(res.status).toBe(200);
      expect(res.body.servers).toEqual(settings.mcpServers);
      expect(mockReadFile).toHaveBeenCalledWith(
        "/mock/home/.claude/settings.json",
        "utf-8",
      );
    });

    it("returns empty servers when settings file does not exist", async () => {
      const err = new Error("Not found");
      err.code = "ENOENT";
      mockReadFile.mockRejectedValue(err);

      const res = await request(app).get("/servers");

      expect(res.status).toBe(200);
      expect(res.body.servers).toEqual({});
    });

    it("returns project-scoped servers when project query param is provided", async () => {
      const settings = {
        mcpServers: {
          projServer: { command: "python", args: ["mcp.py"] },
        },
      };
      mockReadFile.mockResolvedValue(JSON.stringify(settings));

      const res = await request(app).get(
        "/servers?project=/home/user/myproject",
      );

      expect(res.status).toBe(200);
      expect(res.body.servers).toEqual(settings.mcpServers);
      expect(mockReadFile).toHaveBeenCalledWith(
        "/home/user/myproject/.claude/settings.json",
        "utf-8",
      );
    });

    it("returns 500 for non-ENOENT read errors", async () => {
      const err = new Error("Permission denied");
      err.code = "EACCES";
      mockReadFile.mockRejectedValue(err);

      const res = await request(app).get("/servers");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Permission denied");
    });

    it("returns 500 when project path is relative", async () => {
      const res = await request(app).get("/servers?project=relative/path");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Invalid project path");
    });

    it("returns 500 when project path contains ..", async () => {
      const res = await request(app).get(
        "/servers?project=/home/user/../etc",
      );

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Invalid project path");
    });
  });

  // ── PUT /servers/:name ───────────────────────────────────────────────────
  describe("PUT /servers/:name", () => {
    it("creates a new MCP server entry", async () => {
      const err = new Error("Not found");
      err.code = "ENOENT";
      mockReadFile.mockRejectedValue(err);
      mockWriteFile.mockResolvedValue(undefined);

      const serverConfig = { command: "node", args: ["server.js"] };
      const res = await request(app)
        .put("/servers/myServer")
        .send(serverConfig);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(mockMkdir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalledWith(
        "/mock/home/.claude/settings.json",
        expect.any(String),
        "utf-8",
      );

      const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(written.mcpServers.myServer).toEqual(serverConfig);
    });

    it("updates an existing MCP server entry", async () => {
      const existingSettings = {
        mcpServers: {
          existing: { command: "old" },
          myServer: { command: "oldcmd" },
        },
        otherSetting: true,
      };
      mockReadFile.mockResolvedValue(JSON.stringify(existingSettings));
      mockWriteFile.mockResolvedValue(undefined);

      const newConfig = { command: "newcmd", args: ["--port", "3000"] };
      const res = await request(app)
        .put("/servers/myServer")
        .send(newConfig);

      expect(res.status).toBe(200);
      const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(written.mcpServers.myServer).toEqual(newConfig);
      expect(written.mcpServers.existing).toEqual({ command: "old" });
      expect(written.otherSetting).toBe(true);
    });

    it("creates mcpServers key when it does not exist", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({ otherSetting: true }));
      mockWriteFile.mockResolvedValue(undefined);

      const serverConfig = { command: "node" };
      const res = await request(app)
        .put("/servers/newServer")
        .send(serverConfig);

      expect(res.status).toBe(200);
      const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(written.mcpServers.newServer).toEqual(serverConfig);
    });

    it("returns 400 for invalid config body (non-object)", async () => {
      const res = await request(app)
        .put("/servers/myServer")
        .send("not-json")
        .set("Content-Type", "application/json");

      // Express will parse the string as JSON, which results in a string not an object
      // The route checks typeof config !== "object", a plain string "not-json" is not valid JSON
      // so this will either fail to parse or be a string value
      expect(res.status).toBe(400);
    });

    it("saves to project-scoped settings when project param provided", async () => {
      const err = new Error("Not found");
      err.code = "ENOENT";
      mockReadFile.mockRejectedValue(err);
      mockWriteFile.mockResolvedValue(undefined);

      const res = await request(app)
        .put("/servers/test?project=/home/user/proj")
        .send({ command: "node" });

      expect(res.status).toBe(200);
      expect(mockWriteFile).toHaveBeenCalledWith(
        "/home/user/proj/.claude/settings.json",
        expect.any(String),
        "utf-8",
      );
    });

    it("returns 500 when writeFile fails", async () => {
      const enoent = new Error("Not found");
      enoent.code = "ENOENT";
      mockReadFile.mockRejectedValue(enoent);
      mockWriteFile.mockRejectedValue(new Error("Write failed"));

      const res = await request(app)
        .put("/servers/test")
        .send({ command: "node" });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Write failed");
    });
  });

  // ── DELETE /servers/:name ────────────────────────────────────────────────
  describe("DELETE /servers/:name", () => {
    it("deletes an existing MCP server", async () => {
      const settings = {
        mcpServers: {
          toDelete: { command: "old" },
          toKeep: { command: "keep" },
        },
      };
      mockReadFile.mockResolvedValue(JSON.stringify(settings));
      mockWriteFile.mockResolvedValue(undefined);

      const res = await request(app).delete("/servers/toDelete");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(written.mcpServers.toDelete).toBeUndefined();
      expect(written.mcpServers.toKeep).toEqual({ command: "keep" });
    });

    it("succeeds even when server name does not exist", async () => {
      const settings = { mcpServers: { other: { command: "x" } } };
      mockReadFile.mockResolvedValue(JSON.stringify(settings));
      mockWriteFile.mockResolvedValue(undefined);

      const res = await request(app).delete("/servers/nonexistent");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });

    it("succeeds when settings has no mcpServers key", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({ otherSetting: true }));

      const res = await request(app).delete("/servers/anything");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      // writeFile should not be called since there's no mcpServers key
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it("succeeds when settings file does not exist (empty settings)", async () => {
      const err = new Error("Not found");
      err.code = "ENOENT";
      mockReadFile.mockRejectedValue(err);

      const res = await request(app).delete("/servers/anything");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it("deletes from project-scoped settings", async () => {
      const settings = {
        mcpServers: { myServer: { command: "x" } },
      };
      mockReadFile.mockResolvedValue(JSON.stringify(settings));
      mockWriteFile.mockResolvedValue(undefined);

      const res = await request(app).delete(
        "/servers/myServer?project=/home/user/proj",
      );

      expect(res.status).toBe(200);
      expect(mockReadFile).toHaveBeenCalledWith(
        "/home/user/proj/.claude/settings.json",
        "utf-8",
      );
    });

    it("returns 500 on read error (non-ENOENT)", async () => {
      const err = new Error("Disk error");
      err.code = "EIO";
      mockReadFile.mockRejectedValue(err);

      const res = await request(app).delete("/servers/test");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Disk error");
    });
  });
});
