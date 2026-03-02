import { Router } from "express";
import { exec } from "child_process";

const router = Router();

router.post("/", (req, res) => {
  const { command, cwd } = req.body;
  if (!command) return res.status(400).json({ error: "command is required" });

  exec(command, {
    cwd: cwd || process.env.HOME,
    timeout: 30000,
    maxBuffer: 512 * 1024,
  }, (err, stdout, stderr) => {
    res.json({
      command,
      stdout: stdout || "",
      stderr: stderr || "",
      exitCode: err ? (err.code ?? 1) : 0,
    });
  });
});

export default router;
