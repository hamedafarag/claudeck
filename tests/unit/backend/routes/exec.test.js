import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockExec = vi.fn();
const mockExecFile = vi.fn();

vi.mock("child_process", () => ({
  exec: (...args) => mockExec(...args),
  execFile: (...args) => mockExecFile(...args),
}));

vi.mock("os", () => ({
  homedir: () => "/mock/home",
}));

const routerModule = await import("../../../../server/routes/exec.js");
const router = routerModule.default;

// ── App setup ────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/", router);
  return app;
}

// Helper to save/restore process.platform
function withPlatform(platform, fn) {
  const original = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", {
    value: platform,
    writable: true,
    configurable: true,
  });
  const restore = () => {
    if (original) {
      Object.defineProperty(process, "platform", original);
    }
  };
  return { restore };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("exec routes", () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  // ── POST / ───────────────────────────────────────────────────────────────
  describe("POST /", () => {
    it("returns 400 when command is missing", async () => {
      const res = await request(app).post("/").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("command is required");
    });

    it("returns 400 when command is empty string", async () => {
      const res = await request(app).post("/").send({ command: "" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("command is required");
    });

    it("executes a simple one-word command via execFile on non-Windows", async () => {
      const { restore } = withPlatform("linux");

      mockExecFile.mockImplementation((cmd, args, opts, cb) => {
        cb(null, "hello world\n", "");
      });

      const res = await request(app).post("/").send({ command: "ls" });
      restore();

      expect(res.status).toBe(200);
      expect(res.body.command).toBe("ls");
      expect(res.body.stdout).toBe("hello world\n");
      expect(res.body.stderr).toBe("");
      expect(res.body.exitCode).toBe(0);
      expect(mockExecFile).toHaveBeenCalledWith(
        "ls",
        [],
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("executes a simple two-part command via execFile on non-Windows", async () => {
      const { restore } = withPlatform("linux");

      mockExecFile.mockImplementation((cmd, args, opts, cb) => {
        cb(null, "output", "");
      });

      const res = await request(app).post("/").send({ command: "ls -la" });
      restore();

      expect(res.status).toBe(200);
      expect(res.body.stdout).toBe("output");
      expect(mockExecFile).toHaveBeenCalledWith(
        "ls",
        ["-la"],
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("uses exec for commands with more than 2 parts (not simple)", async () => {
      const { restore } = withPlatform("linux");

      mockExec.mockImplementation((cmd, opts, cb) => {
        cb(null, "output", "");
      });

      const res = await request(app)
        .post("/")
        .send({ command: "ls -la /tmp" });
      restore();

      expect(res.status).toBe(200);
      expect(mockExec).toHaveBeenCalled();
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it("uses exec for commands containing pipes", async () => {
      mockExec.mockImplementation((cmd, opts, cb) => {
        cb(null, "result", "");
      });

      const res = await request(app)
        .post("/")
        .send({ command: "cat file.txt | grep pattern" });

      expect(res.status).toBe(200);
      expect(res.body.stdout).toBe("result");
      expect(res.body.exitCode).toBe(0);
      expect(mockExec).toHaveBeenCalled();
    });

    it("uses exec for commands containing redirect (>)", async () => {
      mockExec.mockImplementation((cmd, opts, cb) => {
        cb(null, "", "");
      });

      const res = await request(app)
        .post("/")
        .send({ command: "echo hello > out.txt" });

      expect(res.status).toBe(200);
      expect(mockExec).toHaveBeenCalled();
    });

    it("uses exec for commands containing ampersand (&)", async () => {
      mockExec.mockImplementation((cmd, opts, cb) => {
        cb(null, "", "");
      });

      const res = await request(app)
        .post("/")
        .send({ command: "sleep 1 & echo done" });

      expect(res.status).toBe(200);
      expect(mockExec).toHaveBeenCalled();
    });

    it("always uses exec on Windows regardless of command simplicity", async () => {
      const { restore } = withPlatform("win32");

      mockExec.mockImplementation((cmd, opts, cb) => {
        cb(null, "win output", "");
      });

      const res = await request(app).post("/").send({ command: "dir" });
      restore();

      expect(res.status).toBe(200);
      expect(res.body.stdout).toBe("win output");
      expect(mockExec).toHaveBeenCalled();
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it("handles command errors and returns the exit code", async () => {
      mockExec.mockImplementation((cmd, opts, cb) => {
        cb({ code: 127 }, "", "command not found");
      });

      const res = await request(app)
        .post("/")
        .send({ command: "nonexistent | grep foo" });

      expect(res.status).toBe(200);
      expect(res.body.exitCode).toBe(127);
      expect(res.body.stderr).toBe("command not found");
    });

    it("defaults exitCode to 1 when err.code is undefined", async () => {
      const { restore } = withPlatform("linux");

      mockExecFile.mockImplementation((cmd, args, opts, cb) => {
        cb({ code: undefined }, "", "unknown error");
      });

      const res = await request(app).post("/").send({ command: "badcmd" });
      restore();

      expect(res.status).toBe(200);
      expect(res.body.exitCode).toBe(1);
    });

    it("defaults exitCode to 1 when err.code is null", async () => {
      mockExec.mockImplementation((cmd, opts, cb) => {
        cb({ code: null }, "", "some error");
      });

      const res = await request(app)
        .post("/")
        .send({ command: "bad | cmd" });

      expect(res.status).toBe(200);
      // err.code ?? 1 => null ?? 1 => null (null is not undefined/null for ??)
      // Actually: null ?? 1 => 1 (nullish coalescing treats null as nullish)
      expect(res.body.exitCode).toBe(1);
    });

    it("uses custom cwd when provided", async () => {
      mockExec.mockImplementation((cmd, opts, cb) => {
        cb(null, "", "");
      });

      const res = await request(app)
        .post("/")
        .send({ command: "ls | cat", cwd: "/custom/dir" });

      expect(res.status).toBe(200);
      expect(mockExec).toHaveBeenCalledWith(
        "ls | cat",
        expect.objectContaining({ cwd: "/custom/dir" }),
        expect.any(Function),
      );
    });

    it("defaults cwd to homedir when not provided", async () => {
      mockExec.mockImplementation((cmd, opts, cb) => {
        cb(null, "", "");
      });

      await request(app).post("/").send({ command: "echo hi | cat" });

      expect(mockExec).toHaveBeenCalledWith(
        "echo hi | cat",
        expect.objectContaining({ cwd: "/mock/home" }),
        expect.any(Function),
      );
    });

    it("sets timeout and maxBuffer execution options", async () => {
      mockExec.mockImplementation((cmd, opts, cb) => {
        cb(null, "", "");
      });

      await request(app).post("/").send({ command: "echo hi | cat" });

      expect(mockExec).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          timeout: 30000,
          maxBuffer: 512 * 1024,
        }),
        expect.any(Function),
      );
    });

    it("returns empty strings for null stdout/stderr", async () => {
      mockExec.mockImplementation((cmd, opts, cb) => {
        cb(null, null, null);
      });

      const res = await request(app)
        .post("/")
        .send({ command: "true | cat" });

      expect(res.status).toBe(200);
      expect(res.body.stdout).toBe("");
      expect(res.body.stderr).toBe("");
    });

    it("includes the original command in the response", async () => {
      mockExec.mockImplementation((cmd, opts, cb) => {
        cb(null, "ok", "");
      });

      const res = await request(app)
        .post("/")
        .send({ command: "echo hello | cat" });

      expect(res.status).toBe(200);
      expect(res.body.command).toBe("echo hello | cat");
    });
  });
});
