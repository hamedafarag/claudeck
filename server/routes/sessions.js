import { Router } from "express";
import {
  listSessions,
  deleteSession as dbDeleteSession,
  updateSessionTitle,
  toggleSessionPin,
  searchSessions,
  forkSession as dbForkSession,
  getSession,
  getSessionBranches,
  getSessionLineage,
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
router.get("/", async (req, res) => {
  try {
    const projectPath = req.query.project_path || undefined;
    const sessions = await listSessions(20, projectPath);
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search sessions
router.get("/search", async (req, res) => {
  try {
    const q = req.query.q || "";
    const projectPath = req.query.project_path || undefined;
    const sessions = await searchSessions(q, 20, projectPath);
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
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await dbDeleteSession(id);
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
router.put("/:id/title", async (req, res) => {
  try {
    const { title } = req.body;
    if (typeof title !== "string") {
      return res.status(400).json({ error: "title is required" });
    }
    await updateSessionTitle(req.params.id, title.slice(0, 200));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle session pin
router.put("/:id/pin", async (req, res) => {
  try {
    await toggleSessionPin(req.params.id);
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

// ── Session Branching / Forking ─────────────────────────

// Fork a session at a given message
router.post("/:id/fork", async (req, res) => {
  try {
    const { messageId } = req.body || {};
    const session = await getSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (messageId != null && (typeof messageId !== "number" || messageId < 1)) {
      return res.status(400).json({ error: "Invalid messageId" });
    }
    const forked = await dbForkSession(req.params.id, messageId || null);
    res.json(forked);
  } catch (err) {
    const status = err.message === "No messages to fork" || err.message === "Session not found" ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// List direct child forks of a session
router.get("/:id/branches", async (req, res) => {
  try {
    res.json(await getSessionBranches(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get full ancestor chain + siblings
router.get("/:id/lineage", async (req, res) => {
  try {
    res.json(await getSessionLineage(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
