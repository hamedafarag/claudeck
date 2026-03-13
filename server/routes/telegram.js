import { Router } from "express";
import {
  getTelegramConfig,
  saveTelegramConfig,
  sendTelegramNotification,
} from "../telegram-sender.js";

const router = Router();

// GET /config — return current config (token masked)
router.get("/config", (req, res) => {
  res.json(getTelegramConfig());
});

// PUT /config — save new config
router.put("/config", async (req, res) => {
  try {
    const { enabled, botToken, chatId } = req.body;

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled must be a boolean" });
    }

    // If botToken looks masked (starts with ****), keep the old one
    const currentConfig = getTelegramConfig();
    const resolvedToken =
      botToken && !botToken.startsWith("****") ? botToken : req.body._keepToken ? "" : botToken;

    // Read the raw config to preserve the real token if masked
    const { readFile } = await import("fs/promises");
    const { join, dirname } = await import("path");
    const { fileURLToPath } = await import("url");
    const __filename = fileURLToPath(import.meta.url);
    const configFile = join(dirname(__filename), "../../telegram-config.json");

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
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /test — send a test message
router.post("/test", async (req, res) => {
  try {
    await sendTelegramNotification(
      "CodeDeck",
      "Telegram notifications are working!",
      "test"
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
