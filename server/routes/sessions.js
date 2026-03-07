import { Router } from "express";
import {
  listSessions,
  deleteSession as dbDeleteSession,
  updateSessionTitle,
  toggleSessionPin,
  searchSessions,
} from "../../db.js";
import { getActiveSessionIds } from "../ws-handler.js";
import { generateSessionSummary } from "../summarizer.js";

const router = Router();

// sessionIds map is passed in from the parent
let sessionIds;
export function setSessionIds(map) {
  sessionIds = map;
}

// List sessions (optionally filtered by project_path)
router.get("/", (req, res) => {
  try {
    const projectPath = req.query.project_path || undefined;
    const sessions = listSessions(20, projectPath);
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search sessions
router.get("/search", (req, res) => {
  try {
    const q = req.query.q || "";
    const projectPath = req.query.project_path || undefined;
    const sessions = searchSessions(q, 20, projectPath);
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List session IDs with active (in-flight) queries
router.get("/active", (req, res) => {
  try {
    res.json({ activeSessionIds: getActiveSessionIds() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a session
router.delete("/:id", (req, res) => {
  try {
    const id = req.params.id;
    dbDeleteSession(id);
    // Clean up sessionIds map entries for this session
    for (const [key] of sessionIds) {
      if (key === id || key.startsWith(id + "::")) {
        sessionIds.delete(key);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update session title
router.put("/:id/title", (req, res) => {
  try {
    const { title } = req.body;
    if (typeof title !== "string") {
      return res.status(400).json({ error: "title is required" });
    }
    updateSessionTitle(req.params.id, title.slice(0, 200));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle session pin
router.put("/:id/pin", (req, res) => {
  try {
    toggleSessionPin(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate/regenerate summary on demand
router.post("/:id/summary", async (req, res) => {
  try {
    const summary = await generateSessionSummary(req.params.id);
    res.json({ ok: true, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
