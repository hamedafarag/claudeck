import { createNotification, getUnreadNotificationCount } from "../db.js";

let wss = null;

export function setWss(wssInstance) {
  wss = wssInstance;
}

function broadcast(payload) {
  if (!wss) return;
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

export async function logNotification(type, title, body = null, metadata = null, sourceSessionId = null, sourceAgentId = null) {
  const notification = await createNotification(type, title, body, metadata, sourceSessionId, sourceAgentId);
  const unreadCount = await getUnreadNotificationCount();
  broadcast({ type: "notification:new", notification, unreadCount });
  return notification;
}

export async function broadcastReadUpdate(ids) {
  const unreadCount = await getUnreadNotificationCount();
  broadcast({ type: "notification:read", ids, unreadCount });
}
