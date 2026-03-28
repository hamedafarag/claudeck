import { Router } from "express";
import {
  getMessages, getMessagesByChatId, getMessagesNoChatId,
  getRecentMessages, getRecentMessagesByChatId, getRecentMessagesNoChatId,
  getOlderMessages, getOlderMessagesByChatId, getOlderMessagesNoChatId,
} from "../../db.js";

const router = Router();

// Get all messages for a session (supports ?limit=N&before=ID)
router.get("/:id/messages", async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 0;
    const before = req.query.before ? parseInt(req.query.before, 10) : 0;
    let messages;
    if (limit > 0 && before > 0) {
      messages = await getOlderMessages(req.params.id, before, limit);
    } else if (limit > 0) {
      messages = await getRecentMessages(req.params.id, limit);
    } else {
      messages = await getMessages(req.params.id);
    }
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages filtered by chatId (supports ?limit=N&before=ID)
router.get("/:id/messages/:chatId", async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 0;
    const before = req.query.before ? parseInt(req.query.before, 10) : 0;
    let messages;
    if (limit > 0 && before > 0) {
      messages = await getOlderMessagesByChatId(req.params.id, req.params.chatId, before, limit);
    } else if (limit > 0) {
      messages = await getRecentMessagesByChatId(req.params.id, req.params.chatId, limit);
    } else {
      messages = await getMessagesByChatId(req.params.id, req.params.chatId);
    }
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages where chat_id IS NULL (supports ?limit=N&before=ID)
router.get("/:id/messages-single", async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 0;
    const before = req.query.before ? parseInt(req.query.before, 10) : 0;
    let messages;
    if (limit > 0 && before > 0) {
      messages = await getOlderMessagesNoChatId(req.params.id, before, limit);
    } else if (limit > 0) {
      messages = await getRecentMessagesNoChatId(req.params.id, limit);
    } else {
      messages = await getMessagesNoChatId(req.params.id);
    }
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
