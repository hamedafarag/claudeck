import { Router } from "express";
import {
  upsertPushSubscription,
  deletePushSubscription,
  getNotificationHistory,
  getUnreadNotificationCount,
  markNotificationsRead,
  markAllNotificationsRead,
  markNotificationsReadBefore,
  purgeOldNotifications,
} from "../../db.js";
import { logNotification, broadcastReadUpdate } from "../notification-logger.js";

const router = Router();

let vapidPublicKey = null;

export function setVapidPublicKey(key) {
  vapidPublicKey = key;
}

router.get("/vapid-public-key", (req, res) => {
  if (!vapidPublicKey) {
    return res.status(404).json({ error: "Push notifications not configured" });
  }
  res.json({ key: vapidPublicKey });
});

router.post("/subscribe", (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: "Invalid subscription" });
  }
  upsertPushSubscription(endpoint, keys.p256dh, keys.auth);
  res.json({ ok: true });
});

router.post("/unsubscribe", (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: "Missing endpoint" });
  }
  deletePushSubscription(endpoint);
  res.json({ ok: true });
});

// ── Create notification (from frontend) ───────────────────
router.post("/create", (req, res) => {
  const { type, title, body, metadata, sourceSessionId, sourceAgentId } = req.body;
  if (!type || !title) {
    return res.status(400).json({ error: "type and title are required" });
  }
  const notification = logNotification(type, title, body || null, metadata || null, sourceSessionId || null, sourceAgentId || null);
  res.json(notification);
});

// ── Notification history & management ─────────────────────
router.get("/history", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = parseInt(req.query.offset) || 0;
  const unreadOnly = req.query.unread_only === "true";
  const type = req.query.type || null;
  const items = getNotificationHistory(limit, offset, unreadOnly, type);
  res.json(items);
});

router.get("/unread-count", (_req, res) => {
  res.json({ count: getUnreadNotificationCount() });
});

router.post("/read", (req, res) => {
  const { ids, all, before } = req.body;
  if (all) {
    markAllNotificationsRead();
    broadcastReadUpdate([]);
  } else if (before) {
    markNotificationsReadBefore(before);
    broadcastReadUpdate([]);
  } else if (Array.isArray(ids) && ids.length > 0) {
    markNotificationsRead(ids);
    broadcastReadUpdate(ids);
  } else {
    return res.status(400).json({ error: "Provide ids, all, or before" });
  }
  res.json({ ok: true, unreadCount: getUnreadNotificationCount() });
});

router.delete("/old", (_req, res) => {
  purgeOldNotifications(90);
  res.json({ ok: true });
});

export default router;
