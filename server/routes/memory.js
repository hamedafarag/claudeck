import { Router } from "express";
import {
  createMemory, listMemories, searchMemories, getTopMemories,
  updateMemory, touchMemory, deleteMemory,
  getMemoryCounts, getMemoryStats, maintainMemories,
} from "../../db.js";
import { optimizeMemories, applyOptimization } from "../memory-optimizer.js";

const router = Router();

const CATEGORIES = ["convention", "decision", "discovery", "warning"];

// List memories for a project
router.get("/", async (req, res) => {
  try {
    const { project, category } = req.query;
    if (!project) return res.status(400).json({ error: "project query param required" });
    const memories = await listMemories(project, category || null);
    res.json(memories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search memories
router.get("/search", async (req, res) => {
  try {
    const { project, q, limit } = req.query;
    if (!project || !q) return res.status(400).json({ error: "project and q required" });
    const results = await searchMemories(project, q, Number(limit) || 20);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get top relevant memories (used for prompt injection)
router.get("/top", async (req, res) => {
  try {
    const { project, limit } = req.query;
    if (!project) return res.status(400).json({ error: "project required" });
    const memories = await getTopMemories(project, Number(limit) || 10);
    // Touch each memory to boost relevance
    for (const m of memories) await touchMemory(m.id);
    res.json(memories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get stats
router.get("/stats", async (req, res) => {
  try {
    const { project } = req.query;
    if (!project) return res.status(400).json({ error: "project required" });
    const stats = await getMemoryStats(project);
    const counts = await getMemoryCounts(project);
    res.json({ ...stats, categories: counts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a memory
router.post("/", async (req, res) => {
  try {
    const { project, category, content, sessionId, agentId } = req.body;
    if (!project || !content) {
      return res.status(400).json({ error: "project and content required" });
    }
    const cat = CATEGORIES.includes(category) ? category : "discovery";
    const info = await createMemory(project, cat, content.trim(), sessionId || null, agentId || null);
    res.json({ id: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a memory
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { content, category } = req.body;
    if (!content) return res.status(400).json({ error: "content required" });
    const cat = CATEGORIES.includes(category) ? category : "discovery";
    await updateMemory(id, content.trim(), cat);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a memory
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await deleteMemory(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Decay old memories and clean expired
router.post("/maintain", async (req, res) => {
  try {
    const { project } = req.body;
    if (!project) return res.status(400).json({ error: "project required" });
    await maintainMemories(project);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Optimize memories — generates a preview
router.post("/optimize", async (req, res) => {
  try {
    const { project } = req.body;
    if (!project) return res.status(400).json({ error: "project required" });
    const result = await optimizeMemories(project, (progress) => {
      console.log(`Memory optimize [${project}]:`, progress);
    });
    res.json(result);
  } catch (err) {
    console.error("Optimize error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Apply optimization — replace memories with optimized set
router.post("/optimize/apply", async (req, res) => {
  try {
    const { project, optimized } = req.body;
    if (!project || !Array.isArray(optimized)) {
      return res.status(400).json({ error: "project and optimized array required" });
    }
    const result = await applyOptimization(project, optimized);
    res.json(result);
  } catch (err) {
    console.error("Apply optimization error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
