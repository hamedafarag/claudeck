import { Router } from "express";
import { readFile } from "fs/promises";
import { configPath } from "../paths.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const data = await readFile(configPath("workflows.json"), "utf-8");
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
