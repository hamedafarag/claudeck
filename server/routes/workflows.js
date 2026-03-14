import { Router } from "express";
import { readFile, writeFile } from "fs/promises";
import { configPath } from "../paths.js";

const router = Router();

async function readWorkflows() {
  try {
    const data = await readFile(configPath("workflows.json"), "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeWorkflows(workflows) {
  await writeFile(configPath("workflows.json"), JSON.stringify(workflows, null, 2) + "\n");
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

router.get("/", async (req, res) => {
  try {
    res.json(await readWorkflows());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { title, description, steps } = req.body;
    if (!title || !steps?.length) {
      return res.status(400).json({ error: "title and steps are required" });
    }
    const workflows = await readWorkflows();
    const id = slugify(title);
    if (workflows.find((w) => w.id === id)) {
      return res.status(409).json({ error: `Workflow "${id}" already exists` });
    }
    const wf = { id, title, description: description || "", steps };
    workflows.push(wf);
    await writeWorkflows(workflows);
    res.json(wf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const workflows = await readWorkflows();
    const idx = workflows.findIndex((w) => w.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Workflow not found" });
    const { title, description, steps } = req.body;
    if (title !== undefined) workflows[idx].title = title;
    if (description !== undefined) workflows[idx].description = description;
    if (steps !== undefined) workflows[idx].steps = steps;
    await writeWorkflows(workflows);
    res.json(workflows[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const workflows = await readWorkflows();
    const idx = workflows.findIndex((w) => w.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Workflow not found" });
    workflows.splice(idx, 1);
    await writeWorkflows(workflows);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
