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

// Senza un link valido si apre la home: l'app porta ognuno alla sua area
// (/azienda, /campo…). Il vecchio «/azienda/personale» era chiuso a operai e
// subappaltatori, cioè proprio a chi riceve più push.
const HOME = "/";

/**
 * Solo indirizzi di questo sito (26/09/2026): una notifica non deve poter aprire
 * una pagina esterna, qualunque cosa contenga il suo payload.
 */
function indirizzoSicuro(url) {
  try {
    const u = new URL(url || HOME, self.location.origin);
    return u.origin === self.location.origin ? u.pathname + u.search + u.hash : HOME;
  } catch {
    return HOME;
  }
}

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
  const tag = payload.tag ?? "eic-notification";
  const options = {
    body: payload.body ?? "",
    icon: payload.icon ?? "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag,
    // Stessa etichetta (es. i messaggi della chat di cantiere): la notifica nuova
    // sostituisce la vecchia ma suona di nuovo, invece di cambiare in silenzio.
    renotify: true,
    data: { url: indirizzoSicuro(payload.url) },
    vibrate: [100, 50, 100],
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = indirizzoSicuro(event.notification.data?.url);

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
