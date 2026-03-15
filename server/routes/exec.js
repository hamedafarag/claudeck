import { Router } from "express";
import { exec, execFile } from "child_process";
import { homedir } from "os";

const router = Router();

router.post("/", (req, res) => {
  const { command, cwd } = req.body;
  if (!command) return res.status(400).json({ error: "command is required" });

  const execOpts = {
    cwd: cwd || homedir(),
    timeout: 30000,
    maxBuffer: 512 * 1024,
  };

  const callback = (err, stdout, stderr) => {
    res.json({
      command,
      stdout: stdout || "",
      stderr: stderr || "",
      exitCode: err ? (err.code ?? 1) : 0,
    });
  };

  // On Windows, always use exec (shell) so PATH-resolved commands like "code" work
  // On Unix, use execFile for simple commands to avoid shell escaping issues
  const parts = command.split(/\s+/);
  const isSimple = parts.length <= 2 && !command.includes("|") && !command.includes(">") && !command.includes("&");
  if (isSimple && process.platform !== "win32") {
    execFile(parts[0], parts.slice(1), execOpts, callback);
  } else {
    exec(command, execOpts, callback);
  }
});

export default router;
