import { Router } from "express";
import { listTodos, createTodo, updateTodo, archiveTodo, deleteTodo, createBrag, listBrags, deleteBrag, getTodoCounts } from "../../db.js";

const router = Router();

router.get("/", (req, res) => {
  try {
    const archived = req.query.archived === "1";
    const todos = listTodos(archived);
    res.json(todos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/counts", (req, res) => {
  try {
    res.json(getTodoCounts());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text is required" });
    }
    const info = createTodo(text.trim());
    res.json({ id: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    const { text, done, priority } = req.body;
    updateTodo(id, text ?? null, done ?? null, priority ?? null);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id/archive", (req, res) => {
  try {
    const id = Number(req.params.id);
    const { archived } = req.body;
    archiveTodo(id, archived ?? true);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    deleteTodo(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Brags ──────────────────────────────────────────────
router.get("/brags", (req, res) => {
  try {
    res.json(listBrags());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/brag", (req, res) => {
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
    const todos = listTodos(false);
    const todo = todos.find(t => t.id === todoId);
    const archivedTodos = listTodos(true);
    const archivedTodo = archivedTodos.find(t => t.id === todoId);
    const foundTodo = todo || archivedTodo;
    if (!foundTodo) {
      return res.status(404).json({ error: "Todo not found" });
    }
    const info = createBrag(todoId, foundTodo.text, summary.trim());
    // Archive the todo
    archiveTodo(todoId, true);
    res.json({ id: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/brags/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    deleteBrag(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
