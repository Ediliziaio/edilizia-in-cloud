/**
 * sw-fleet-track.js — GPS FleetTrack Service Worker
 *
 * Responsabilità:
 *  - watchPosition continuo (enableHighAccuracy: true)
 *  - Buffer locale delle posizioni
 *  - Flush verso edge function batch-gps-positions ogni GPS_FLUSH_INTERVAL_MS
 *    oppure quando il buffer raggiunge GPS_BATCH_SIZE
 *  - Retry automatico con backoff esponenziale in caso di errore rete
 *  - Risponde ai messaggi START_TRACKING / STOP_TRACKING / GET_STATUS
 *    inviati dal main thread
 *
 * ⚠️  iOS Safari: il SW va in background suspension dopo ~30s se l'app non
 *     è in primo piano. Non è possibile garantire il tracciamento continuo
 *     su iOS senza uso di native API (capacitor/cordova). In produzione
 *     mostrare un disclaimer all'utente iOS.
 */

const GPS_BATCH_SIZE = 10;
const GPS_FLUSH_INTERVAL_MS = 30_000;
const RETRY_MAX = 4;
const RETRY_BASE_DELAY_MS = 2_000;

let watchId = null;
let flushTimer = null;
let positionBuffer = [];
let config = null; // { supabaseUrl, anonKey, jwtToken, companyId, userId }
let retryCount = 0;
let isTracking = false;

// ── Message handler ──────────────────────────────────────────────────────────
self.addEventListener("message", (event) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case "START_TRACKING":
      startTracking(payload);
      break;
    case "STOP_TRACKING":
      stopTracking();
      break;
    case "UPDATE_TOKEN":
      if (config && payload?.jwtToken) {
        config.jwtToken = payload.jwtToken;
      }
      break;
    case "GET_STATUS":
      event.source?.postMessage({
        type: "TRACKING_STATUS",
        payload: {
          isTracking,
          buffered: positionBuffer.length,
          watchId,
        },
      });
      break;
    default:
      break;
  }
});

// ── Start ────────────────────────────────────────────────────────────────────
function startTracking(cfg) {
  if (!cfg?.supabaseUrl || !cfg?.anonKey || !cfg?.jwtToken || !cfg?.companyId || !cfg?.userId) {
    broadcastStatus("error", "Configurazione incompleta per il tracciamento GPS");
    return;
  }

  if (isTracking) {
    // Aggiorna solo il token se già in tracking
    config = { ...config, ...cfg };
    return;
  }

  config = cfg;
  isTracking = true;
  positionBuffer = [];
  retryCount = 0;

  if (!("geolocation" in self)) {
    broadcastStatus("error", "Geolocation API non disponibile nel Service Worker");
    isTracking = false;
    return;
  }

  watchId = self.registration?.geolocation
    ? self.registration.geolocation.watchPosition(onPosition, onGpsError, {
        enableHighAccuracy: true,
        maximumAge: 5_000,
      })
    : null;

  // Fallback: usa geolocation API del worker scope se disponibile
  if (watchId === null && "geolocation" in self) {
    watchId = self.geolocation.watchPosition(onPosition, onGpsError, {
      enableHighAccuracy: true,
      maximumAge: 5_000,
    });
  }

  // Flush periodico
  flushTimer = setInterval(flushBuffer, GPS_FLUSH_INTERVAL_MS);

  broadcastStatus("active", null);
}

// ── Stop ─────────────────────────────────────────────────────────────────────
function stopTracking() {
  isTracking = false;

  if (watchId !== null) {
    try { self.geolocation.clearWatch(watchId); } catch (_) {}
    watchId = null;
  }

  if (flushTimer !== null) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  // Flush finale
  if (positionBuffer.length > 0) {
    flushBuffer();
  }

  config = null;
  broadcastStatus("idle", null);
}

// ── Position callback ────────────────────────────────────────────────────────
function onPosition(pos) {
  if (!isTracking) return;

  const point = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? null,
    speed: pos.coords.speed ?? null,
    heading: pos.coords.heading ?? null,
    battery_level: null,              // non disponibile via SW
    recorded_at: new Date(pos.timestamp).toISOString(),
  };

  positionBuffer.push(point);

  // Broadcast last known position to main thread
  broadcastPosition(point);

  if (positionBuffer.length >= GPS_BATCH_SIZE) {
    flushBuffer();
  }
}

function onGpsError(err) {
  const msg = err.code === 1
    ? "Permesso GPS negato"
    : err.code === 2
    ? "Posizione non disponibile"
    : "Timeout GPS";

  broadcastStatus(err.code === 1 ? "denied" : "error", msg);

  if (err.code === 1) {
    // Permesso negato: stop definitivo
    stopTracking();
  }
}

// ── Flush ────────────────────────────────────────────────────────────────────
async function flushBuffer() {
  if (!config || positionBuffer.length === 0) return;

  const toSend = [...positionBuffer];
  positionBuffer = [];

  try {
    const res = await fetch(
      `${config.supabaseUrl}/functions/v1/batch-gps-positions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.jwtToken}`,
          "apikey": config.anonKey,
        },
        body: JSON.stringify({
          company_id: config.companyId,
          positions: toSend,
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    retryCount = 0; // reset on success
  } catch (err) {
    // Re-queue posizioni non inviate
    positionBuffer = [...toSend, ...positionBuffer].slice(0, 100); // max 100 buffered

    retryCount++;
    if (retryCount <= RETRY_MAX) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, retryCount - 1);
      setTimeout(flushBuffer, delay);
    } else {
      broadcastStatus("error", `Impossibile inviare posizioni GPS dopo ${RETRY_MAX} tentativi`);
    }
  }
}

// ── Broadcast helpers ────────────────────────────────────────────────────────
async function broadcastStatus(status, message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach((c) => c.postMessage({ type: "TRACKING_STATUS", payload: { status, message } }));
}

async function broadcastPosition(point) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach((c) => c.postMessage({ type: "GPS_POSITION", payload: point }));
}

// ── Fetch passthrough (non intercettare richieste app) ────────────────────────
self.addEventListener("fetch", () => {});
