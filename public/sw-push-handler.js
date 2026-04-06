/**
 * sw-push-handler.js
 * Gestisce gli eventi push Web Push API nel Service Worker.
 * Incluso via importScripts nel SW generato da Vite PWA.
 *
 * Formato payload atteso (JSON):
 * {
 *   title: string,
 *   body: string,
 *   icon?: string,
 *   url?: string,
 *   tag?: string
 * }
 */

/* global self */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: "Edilizia in Cloud",
      body: event.data.text() || "Hai una nuova notifica",
    };
  }

  const title = payload.title ?? "Edilizia in Cloud";
  const options = {
    body: payload.body ?? "",
    icon: payload.icon ?? "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag ?? "eic-notification",
    data: { url: payload.url ?? "/azienda/personale?tab=documenti" },
    vibrate: [100, 50, 100],
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/azienda/personale?tab=documenti";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Se c'è una finestra già aperta, portala in primo piano
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Altrimenti apri una nuova finestra
        if (clients.openWindow) return clients.openWindow(url);
      }),
  );
});
