import { query } from "@anthropic-ai/claude-code";
import { execPath } from "process";
import { getMessagesNoChatId, updateSessionSummary, getSession } from "../db.js";

export async function generateSessionSummary(sessionId) {
  const session = getSession(sessionId);
  if (!session) return null;

  const messages = getMessagesNoChatId(sessionId);
  const conversation = [];
  for (const msg of messages) {
    try {
      const data = JSON.parse(msg.content);
      if (msg.role === "user" && data.text) {
        conversation.push(`User: ${data.text.slice(0, 500)}`);
      } else if (msg.role === "assistant" && data.text) {
        conversation.push(`Assistant: ${data.text.slice(0, 500)}`);
      }
    } catch {
      // skip unparseable messages
    }
  }

  if (conversation.length < 2) return null;

  const transcript = conversation.join("\n").slice(-4000);
  const prompt = `Summarize this coding session in 1 short sentence (max 120 chars). Focus on what was accomplished or discussed. No quotes, no prefixes like "Summary:". Just the sentence.\n\n${transcript}`;

  let summary = null;

  const q = query({
    prompt,
    options: {
      maxTurns: 1,
      model: "claude-haiku-4-5-20251001",
      permissionMode: "bypassPermissions",
      executable: execPath,
    },
  });

  for await (const msg of q) {
    if (msg.type === "assistant" && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === "text" && block.text) {
          summary = block.text.trim().slice(0, 200);
        }
      }
    }
  }

  if (summary) {
    updateSessionSummary(sessionId, summary);
  }
  return summary;
}
