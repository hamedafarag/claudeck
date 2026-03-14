import { Router } from "express";
import { readFile, writeFile } from "fs/promises";
import { configPath } from "../paths.js";

const dataFile = configPath("bot-prompt.json");

const DEFAULT_PROMPT = "You are an expert prompt engineer and AI assistant. Help users craft effective prompts, improve existing ones, and explain prompt engineering techniques. Be concise and actionable.";

const router = Router();

async function readPromptData() {
  try {
    const raw = await readFile(dataFile, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { systemPrompt: DEFAULT_PROMPT };
  }
}

// GET /prompt — return bot system prompt
router.get("/prompt", async (req, res) => {
  try {
    const data = await readPromptData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /prompt — update bot system prompt
router.put("/prompt", async (req, res) => {
  try {
    const { systemPrompt } = req.body;
    if (typeof systemPrompt !== "string") {
      return res.status(400).json({ error: "systemPrompt must be a string" });
    }
    const data = { systemPrompt };
    await writeFile(dataFile, JSON.stringify(data, null, 2) + "\n");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
