import { Router } from "express";
import { readFile } from "fs/promises";
import { configPath } from "../paths.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const data = await readFile(configPath("agents.json"), "utf-8");
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const data = await readFile(configPath("agents.json"), "utf-8");
    const agents = JSON.parse(data);
    const agent = agents.find((a) => a.id === req.params.id);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
