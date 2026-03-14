// Telegram notification sender — fire-and-forget, mirrors push-sender.js
import { readFile, writeFile } from "fs/promises";
import { configPath } from "./paths.js";

const configFile = configPath("telegram-config.json");

let config = { enabled: false, botToken: "", chatId: "" };

async function readConfig() {
  try {
    const raw = await readFile(configFile, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { enabled: false, botToken: "", chatId: "" };
  }
}

export async function initTelegramSender() {
  config = await readConfig();
}

export async function saveTelegramConfig(newConfig) {
  await writeFile(configFile, JSON.stringify(newConfig, null, 2) + "\n");
  config = newConfig;
}

export function getTelegramConfig() {
  return {
    enabled: config.enabled,
    botToken: config.botToken ? maskToken(config.botToken) : "",
    chatId: config.chatId || "",
  };
}

function maskToken(token) {
  if (!token || token.length < 8) return "****";
  return "****:" + token.slice(-6);
}

export async function sendTelegramNotification(title, body, tag) {
  if (!config.enabled || !config.botToken || !config.chatId) return;

  const text = `<b>${escapeHtml(title)}</b>\n${escapeHtml(body)}`;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${config.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.chatId,
          text,
          parse_mode: "HTML",
          disable_notification: false,
        }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      console.error("Telegram send failed:", res.status, err);
    }
  } catch (err) {
    console.error("Telegram send error:", err.message);
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
