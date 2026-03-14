import { Router } from "express";
import { readFile } from "fs/promises";
import { configPath } from "../paths.js";

const router = Router();

// Serve prompt toolbox
router.get("/", async (req, res) => {
  try {
    const data = await readFile(configPath("prompts.json"), "utf-8");
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a new prompt
router.post("/", async (req, res) => {
  try {
    const { title, description, prompt } = req.body;
    if (!title || !description || !prompt) {
      return res.status(400).json({ error: "title, description, and prompt are required" });
    }
    const filePath = configPath("prompts.json");
    const data = JSON.parse(await readFile(filePath, "utf-8"));
    data.push({ title, description, prompt });
    const { writeFile } = await import("fs/promises");
    await writeFile(filePath, JSON.stringify(data, null, 2) + "\n");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a prompt by index
router.delete("/:index", async (req, res) => {
  try {
    const idx = parseInt(req.params.index, 10);
    const filePath = configPath("prompts.json");
    const data = JSON.parse(await readFile(filePath, "utf-8"));
    if (idx < 0 || idx >= data.length) {
      return res.status(404).json({ error: "Prompt not found" });
    }
    data.splice(idx, 1);
    const { writeFile } = await import("fs/promises");
    await writeFile(filePath, JSON.stringify(data, null, 2) + "\n");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
