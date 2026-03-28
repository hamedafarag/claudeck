import { Router } from "express";
import {
  getMessages, getMessagesByChatId, getMessagesNoChatId,
  getRecentMessages, getRecentMessagesByChatId, getRecentMessagesNoChatId,
  getOlderMessages, getOlderMessagesByChatId, getOlderMessagesNoChatId,
} from "../../db.js";

const router = Router();

// Get all messages for a session (supports ?limit=N&before=ID)
router.get("/:id/messages", (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 0;
    const before = req.query.before ? parseInt(req.query.before, 10) : 0;
    let messages;
    if (limit > 0 && before > 0) {
      messages = getOlderMessages(req.params.id, before, limit);
    } else if (limit > 0) {
      messages = getRecentMessages(req.params.id, limit);
    } else {
      messages = getMessages(req.params.id);
    }
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages filtered by chatId (supports ?limit=N&before=ID)
router.get("/:id/messages/:chatId", (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 0;
    const before = req.query.before ? parseInt(req.query.before, 10) : 0;
    let messages;
    if (limit > 0 && before > 0) {
      messages = getOlderMessagesByChatId(req.params.id, req.params.chatId, before, limit);
    } else if (limit > 0) {
      messages = getRecentMessagesByChatId(req.params.id, req.params.chatId, limit);
    } else {
      messages = getMessagesByChatId(req.params.id, req.params.chatId);
    }
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages where chat_id IS NULL (supports ?limit=N&before=ID)
router.get("/:id/messages-single", (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 0;
    const before = req.query.before ? parseInt(req.query.before, 10) : 0;
    let messages;
    if (limit > 0 && before > 0) {
      messages = getOlderMessagesNoChatId(req.params.id, before, limit);
    } else if (limit > 0) {
      messages = getRecentMessagesNoChatId(req.params.id, limit);
    } else {
      messages = getMessagesNoChatId(req.params.id);
    }
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
