// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const STORAGE_KEY = "claudeck-notifications";
const SOUND_KEY = "claudeck-notifications-sound";

const mockGetState = vi.fn();
const mockSetState = vi.fn();

vi.mock("../../../public/js/core/store.js", () => ({
  getState: (...args) => mockGetState(...args),
  setState: (...args) => mockSetState(...args),
}));

vi.mock("../../../public/js/ui/commands.js", () => ({
  registerCommand: vi.fn(),
}));

vi.mock("../../../public/js/ui/messages.js", () => ({
  addStatus: vi.fn(),
}));

let isNotificationSoundEnabled, isNotificationsEnabled, requestNotificationPermission, toggleNotifications;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  mockGetState.mockReset();
  mockSetState.mockReset();

  // Stub Notification API
  globalThis.Notification = {
    permission: "default",
    requestPermission: vi.fn().mockResolvedValue("granted"),
  };

  // Stub AudioContext
  globalThis.AudioContext = vi.fn().mockImplementation(() => ({
    state: "running",
    resume: vi.fn(),
    currentTime: 0,
    destination: {},
    createOscillator: vi.fn(() => ({
      connect: vi.fn(),
      frequency: { value: 0 },
      type: "sine",
      start: vi.fn(),
      stop: vi.fn(),
    })),
    createGain: vi.fn(() => ({
      connect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    })),
  }));

  vi.doMock("../../../public/js/core/store.js", () => ({
    getState: (...args) => mockGetState(...args),
    setState: (...args) => mockSetState(...args),
  }));
  vi.doMock("../../../public/js/ui/commands.js", () => ({
    registerCommand: vi.fn(),
  }));
  vi.doMock("../../../public/js/ui/messages.js", () => ({
    addStatus: vi.fn(),
  }));

  const mod = await import("../../../public/js/ui/notifications.js");
  isNotificationSoundEnabled = mod.isNotificationSoundEnabled;
  isNotificationsEnabled = mod.isNotificationsEnabled;
  requestNotificationPermission = mod.requestNotificationPermission;
  toggleNotifications = mod.toggleNotifications;
});

describe("notifications", () => {
  describe("isNotificationSoundEnabled", () => {
    it("returns true by default when nothing stored", () => {
      expect(isNotificationSoundEnabled()).toBe(true);
    });

    it("returns false when sound key is '0'", () => {
      localStorage.setItem(SOUND_KEY, "0");
      expect(isNotificationSoundEnabled()).toBe(false);
    });

    it("returns true when sound key is '1'", () => {
      localStorage.setItem(SOUND_KEY, "1");
      expect(isNotificationSoundEnabled()).toBe(true);
    });
  });

  describe("isNotificationsEnabled", () => {
    it("returns false when Notification not in window", () => {
      delete globalThis.Notification;
      expect(isNotificationsEnabled()).toBe(false);
    });

    it("returns false when permission is not granted", () => {
      globalThis.Notification = { permission: "denied" };
      expect(isNotificationsEnabled()).toBe(false);
    });

    it("returns store value when permission is granted", () => {
      globalThis.Notification = { permission: "granted" };
      mockGetState.mockReturnValue(true);
      expect(isNotificationsEnabled()).toBe(true);
    });

    it("returns false when permission granted but store is false", () => {
      globalThis.Notification = { permission: "granted" };
      mockGetState.mockReturnValue(false);
      expect(isNotificationsEnabled()).toBe(false);
    });
  });

  describe("requestNotificationPermission", () => {
    it("returns true when already granted", async () => {
      globalThis.Notification = { permission: "granted" };
      expect(await requestNotificationPermission()).toBe(true);
    });

    it("returns false when denied", async () => {
      globalThis.Notification = { permission: "denied" };
      expect(await requestNotificationPermission()).toBe(false);
    });

    it("returns false when Notification not available", async () => {
      delete globalThis.Notification;
      expect(await requestNotificationPermission()).toBe(false);
    });

    it("requests permission and returns result", async () => {
      globalThis.Notification = {
        permission: "default",
        requestPermission: vi.fn().mockResolvedValue("granted"),
      };
      expect(await requestNotificationPermission()).toBe(true);
      expect(globalThis.Notification.requestPermission).toHaveBeenCalled();
    });

    it("returns false when permission request is denied", async () => {
      globalThis.Notification = {
        permission: "default",
        requestPermission: vi.fn().mockResolvedValue("denied"),
      };
      expect(await requestNotificationPermission()).toBe(false);
    });
  });

  describe("toggleNotifications", () => {
    it("disables when currently enabled", async () => {
      mockGetState.mockReturnValue(true);
      const result = await toggleNotifications();
      expect(result).toBe(false);
      expect(mockSetState).toHaveBeenCalledWith("notificationsEnabled", false);
      expect(localStorage.getItem(STORAGE_KEY)).toBe("0");
    });

    it("enables when permission is granted", async () => {
      mockGetState.mockReturnValue(false);
      globalThis.Notification = {
        permission: "default",
        requestPermission: vi.fn().mockResolvedValue("granted"),
      };
      Object.defineProperty(window, "location", {
        value: { protocol: "https:", hostname: "example.com" },
        writable: true,
        configurable: true,
      });
      const result = await toggleNotifications();
      expect(result).toBe(true);
      expect(mockSetState).toHaveBeenCalledWith("notificationsEnabled", true);
      expect(localStorage.getItem(STORAGE_KEY)).toBe("1");
    });

    it("returns false when Notification not supported", async () => {
      mockGetState.mockReturnValue(false);
      delete globalThis.Notification;
      // alert may not exist in happy-dom — define it
      globalThis.alert = vi.fn();
      const result = await toggleNotifications();
      expect(result).toBe(false);
      delete globalThis.alert;
    });
  });
});
