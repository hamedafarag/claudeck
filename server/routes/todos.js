import { Router } from "express";
import { listTodos, createTodo, updateTodo, archiveTodo, deleteTodo } from "../../db.js";

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
    const { text, done } = req.body;
    updateTodo(id, text ?? null, done ?? null);
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

export default router;
