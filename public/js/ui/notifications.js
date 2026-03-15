// Browser push notifications
import { getState, setState } from '../core/store.js';
import { registerCommand } from './commands.js';

const STORAGE_KEY = 'claudeck-notifications';
const SOUND_KEY = 'claudeck-notifications-sound';

// ── Audio ──
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
// Unlock AudioContext on first user interaction (browser autoplay policy)
document.addEventListener('click', () => getAudioCtx(), { once: true });
document.addEventListener('keydown', () => getAudioCtx(), { once: true });

function playNotificationSound() {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    // Two-tone chime: C5 → E5
    [[523, 0], [659, 0.15]].forEach(([freq, offset]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.25, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.3);
      osc.start(now + offset);
      osc.stop(now + offset + 0.3);
    });
  } catch { /* audio unavailable */ }
}

export function isNotificationSoundEnabled() {
  return localStorage.getItem(SOUND_KEY) !== '0';
}

/**
 * Request notification permission from the browser.
 * Returns true if granted.
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/**
 * Check if notifications are supported and enabled by user preference.
 */
export function isNotificationsEnabled() {
  if (!('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  return getState('notificationsEnabled');
}

/**
 * Send a browser notification (only when tab/app is not focused).
 * Uses ServiceWorker.showNotification() for PWA support — works in
 * standalone mode, background tabs, and regular browser tabs.
 * Falls back to `new Notification()` if SW is unavailable.
 * @param {string} title
 * @param {string} body
 * @param {string} [tag] - dedup tag (same tag replaces previous)
 */
export async function sendNotification(title, body, tag) {
  if (!isNotificationsEnabled()) return;
  if (document.hasFocus()) return;

  // Play sound (works even when tab is unfocused, as long as page is loaded)
  if (isNotificationSoundEnabled()) playNotificationSound();

  const opts = {
    body,
    tag: tag || undefined,
    icon: '/icons/icon-192.png',
    silent: true, // suppress OS sound — we play our own
  };

  // Prefer SW-based notification (works in PWA standalone + background)
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, opts);
      return;
    } catch { /* fall through to basic Notification */ }
  }

  // Fallback for browsers without active SW
  const notification = new Notification(title, opts);
  notification.addEventListener('click', () => {
    window.focus();
    notification.close();
  });
}

// ── Web Push helpers ──

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const res = await fetch('/api/notifications/vapid-public-key');
    if (!res.ok) return;
    const { key } = await res.json();

    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });

    const sub = subscription.toJSON();
    await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.keys }),
    });
  } catch (err) {
    console.warn('Push subscription failed:', err);
  }
}

async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (!subscription) return;

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();

    await fetch('/api/notifications/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    });
  } catch (err) {
    console.warn('Push unsubscribe failed:', err);
  }
}

/**
 * Toggle notifications on/off. Requests permission if enabling for the first time.
 */
export async function toggleNotifications() {
  const current = getState('notificationsEnabled');
  if (!current) {
    if (!('Notification' in window)) {
      alert('Notifications are not supported in this browser.');
      return false;
    }
    if (Notification.permission === 'denied') {
      alert('Notifications are blocked. Please enable them in your browser settings for this site.');
      return false;
    }
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      alert('Notifications require HTTPS or localhost. Please access Claudeck via https:// or http://localhost.');
      return false;
    }
    const granted = await requestNotificationPermission();
    if (!granted) return false;
    setState('notificationsEnabled', true);
    localStorage.setItem(STORAGE_KEY, '1');
    await subscribeToPush();
    return true;
  } else {
    setState('notificationsEnabled', false);
    localStorage.setItem(STORAGE_KEY, '0');
    await unsubscribeFromPush();
    return false;
  }
}

function updateLabel() {
  const label = document.getElementById('notifications-label');
  if (label) {
    label.textContent = getState('notificationsEnabled') ? 'Notifications (on)' : 'Notifications';
  }
}

// ── Listen for SW messages (push-triggered sound) ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'play-notification-sound' && isNotificationSoundEnabled()) {
      playNotificationSound();
    }
  });
}

// ── Init ──
function init() {
  // Restore preference
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === '1' && Notification.permission === 'granted') {
    setState('notificationsEnabled', true);
    // Re-subscribe to push on load (ensures server has current subscription)
    subscribeToPush();
  }

  // Wire up toggle button
  const btn = document.getElementById('notifications-toggle-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      await toggleNotifications();
      updateLabel();
    });
  }

  updateLabel();
}

// ── Commands ──
registerCommand('notifications', {
  category: 'app',
  description: 'Toggle browser notifications',
  async execute(args, pane) {
    const { addStatus } = await import('./messages.js');
    const enabled = await toggleNotifications();
    addStatus(
      enabled ? 'Notifications enabled' : 'Notifications disabled',
      false,
      pane
    );
  },
});

init();
