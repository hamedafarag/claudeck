import { getAllPushSubscriptions, deletePushSubscription } from "../db.js";

let webpushInstance = null;

export function initPushSender(webpush) {
  webpushInstance = webpush;
}

export async function sendPushNotification(title, body, tag) {
  if (!webpushInstance) return;

  const subs = await getAllPushSubscriptions();
  if (!subs.length) return;

  const payload = JSON.stringify({ title, body, tag });

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpushInstance.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } },
          payload
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await deletePushSubscription(sub.endpoint);
        }
      }
    })
  );
}
