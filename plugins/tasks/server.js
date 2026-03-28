import { Router } from "express";
import { listTodos, createTodo, updateTodo, archiveTodo, deleteTodo, createBrag, listBrags, deleteBrag, getTodoCounts } from "../../db.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const archived = req.query.archived === "1";
    const todos = await listTodos(archived);
    res.json(todos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/counts", async (req, res) => {
  try {
    res.json(await getTodoCounts());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text is required" });
    }
    const info = await createTodo(text.trim());
    res.json({ id: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { text, done, priority } = req.body;
    await updateTodo(id, text ?? null, done ?? null, priority ?? null);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id/archive", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { archived } = req.body;
    await archiveTodo(id, archived ?? true);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await deleteTodo(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Brags ──────────────────────────────────────────────
router.get("/brags", async (req, res) => {
  try {
    res.json(await listBrags());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/brag", async (req, res) => {
  try {
    const todoId = Number(req.params.id);
    const { summary } = req.body;
    if (!summary || typeof summary !== "string" || summary.trim().length === 0) {
      return res.status(400).json({ error: "summary is required" });
    }
    if (summary.length > 500) {
      return res.status(400).json({ error: "summary must be 500 chars or less" });
    }
    // Get the todo text before archiving
    const todos = await listTodos(false);
    const todo = todos.find(t => t.id === todoId);
    const archivedTodos = await listTodos(true);
    const archivedTodo = archivedTodos.find(t => t.id === todoId);
    const foundTodo = todo || archivedTodo;
    if (!foundTodo) {
      return res.status(404).json({ error: "Todo not found" });
    }
    const info = await createBrag(todoId, foundTodo.text, summary.trim());
    // Archive the todo
    await archiveTodo(todoId, true);
    res.json({ id: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/brags/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await deleteBrag(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
