import { Router } from "express";
import { readFile } from "fs/promises";
import {
  getTelegramConfig,
  saveTelegramConfig,
  sendTelegramNotification,
} from "../telegram-sender.js";
import { restartTelegramPoller } from "../telegram-poller.js";
import { configPath } from "../paths.js";

const router = Router();

// GET /config — return current config (token masked)
router.get("/config", (req, res) => {
  res.json(getTelegramConfig());
});

// PUT /config — save new config
router.put("/config", async (req, res) => {
  try {
    const { enabled, botToken, chatId, afkTimeoutMinutes, notify } = req.body;

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled must be a boolean" });
    }

    // If botToken looks masked (starts with ****), keep the old one
    const configFile = configPath("telegram-config.json");

    let existingToken = "";
    try {
      const raw = await readFile(configFile, "utf-8");
      existingToken = JSON.parse(raw).botToken || "";
    } catch {}

    const finalToken =
      botToken && !botToken.startsWith("****") ? botToken : existingToken;

    await saveTelegramConfig({
      enabled,
      botToken: finalToken,
      chatId: chatId || "",
      afkTimeoutMinutes: afkTimeoutMinutes || 15,
      notify: notify || {},
    });

    // Restart poller if config changed
    restartTelegramPoller();

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /test — send a test message
router.post("/test", async (req, res) => {
  try {
    await sendTelegramNotification(
      "session",
      "Claudeck Test",
      "Telegram notifications are working!",
      { durationMs: 1234, costUsd: 0.0042, inputTokens: 1500, outputTokens: 800, model: "claude-sonnet-4-6", turns: 3 }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
