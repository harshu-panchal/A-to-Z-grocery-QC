/* eslint-disable no-restricted-globals */

// Open the notification's page on THIS site (live or localhost). Older
// notifications carry a full https://<live site>/... address: only its path is
// used, so a local app never jumps to the live site.
const toThisSite = (raw) => {
  try {
    const u = new URL(String(raw || "/"), self.location.origin);
    return `${self.location.origin}${u.pathname}${u.search}${u.hash}`;
  } catch {
    return `${self.location.origin}/`;
  }
};

self.addEventListener("notificationclick", (event) => {
  const data = event?.notification?.data || {};
  const link = toThisSite(data.link || data.FCM_MSG?.data?.link || "/");
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const own = clients.filter((c) => String(c.url || "").startsWith(self.location.origin));
      for (const client of own) {
        if ("focus" in client) {
          client.focus();
          return client.navigate ? client.navigate(link) : undefined;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(link);
      }
      return undefined;
    }),
  );
});

importScripts("https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "__VITE_FIREBASE_API_KEY__",
  authDomain: "__VITE_FIREBASE_AUTH_DOMAIN__",
  databaseURL: "__VITE_FIREBASE_DATABASE_URL__",
  projectId: "__VITE_FIREBASE_PROJECT_ID__",
  storageBucket: "__VITE_FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__VITE_FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__VITE_FIREBASE_APP_ID__",
  measurementId: "__VITE_FIREBASE_MEASUREMENT_ID__",
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId || firebaseConfig.apiKey.startsWith("__")) {
  console.warn("[firebase-messaging-sw] Missing Firebase web config; background messaging is disabled.");
} else {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const messaging = firebase.messaging();

  function buildNotificationOptions(payload = {}) {
    const notification = payload?.notification || {};
    const data = payload?.data || {};
    const title = notification.title || data.title || "Notification";
    const body = notification.body || data.body || "";
    const link = data.link || "/";
    const tag = notification.tag || data.orderId || data.eventType || "quick-commerce";
    const image = String(notification.image || data.image || data.imageUrl || "").trim();

    return {
      title,
      options: {
        body,
        tag,
        requireInteraction: true,
        renotify: true,
        ...(image ? { image } : {}),
        data: {
          link,
          orderId: data.orderId || "",
          eventType: data.eventType || "",
          image,
        },
      },
    };
  }

  self.addEventListener("install", () => {
    self.skipWaiting();
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
  });

  messaging.onBackgroundMessage((payload) => {
    const { title, options } = buildNotificationOptions(payload);
    self.registration.showNotification(title, options);
  });
}
