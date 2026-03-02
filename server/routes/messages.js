import { Router } from "express";
import { getMessages, getMessagesByChatId, getMessagesNoChatId } from "../../db.js";

const router = Router();

// Get all messages for a session
router.get("/:id/messages", (req, res) => {
  try {
    const messages = getMessages(req.params.id);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages filtered by chatId
router.get("/:id/messages/:chatId", (req, res) => {
  try {
    const messages = getMessagesByChatId(req.params.id, req.params.chatId);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages where chat_id IS NULL (single-mode)
router.get("/:id/messages-single", (req, res) => {
  try {
    const messages = getMessagesNoChatId(req.params.id);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
