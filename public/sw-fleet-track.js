/**
 * sw-fleet-track.js — GPS FleetTrack Service Worker
 *
 * Responsabilità:
 *  - Riceve le posizioni GPS dal main thread via postMessage GPS_POSITION_FROM_MAIN
 *    (la Geolocation API NON è disponibile nel contesto Service Worker)
 *  - Buffer locale delle posizioni
 *  - Flush verso edge function batch-gps-positions ogni GPS_FLUSH_INTERVAL_MS
 *    oppure quando il buffer raggiunge GPS_BATCH_SIZE
 *  - Retry automatico con backoff esponenziale in caso di errore rete
 *  - Risponde ai messaggi START_TRACKING / STOP_TRACKING / GET_STATUS /
 *    GPS_POSITION_FROM_MAIN / UPDATE_TOKEN inviati dal main thread
 *
 * ⚠️  navigator.geolocation NON esiste nel Service Worker scope.
 *     Il watchPosition è gestito dal main thread in useGpsContinuo.ts,
 *     che invia ogni posizione a questo SW via GPS_POSITION_FROM_MAIN.
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
    case "GPS_POSITION_FROM_MAIN":
      // Posizione inviata dal main thread (watchPosition gira nel main thread)
      if (isTracking && payload) {
        onPosition(payload);
      }
      break;
    case "GET_STATUS":
      event.source?.postMessage({
        type: "TRACKING_STATUS",
        payload: {
          isTracking,
          buffered: positionBuffer.length,
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

  // Flush periodico
  flushTimer = setInterval(flushBuffer, GPS_FLUSH_INTERVAL_MS);

  broadcastStatus("active", null);
}

// ── Stop ─────────────────────────────────────────────────────────────────────
function stopTracking() {
  isTracking = false;

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

// ── Position handler ─────────────────────────────────────────────────────────
// payload ha la struttura inviata da useGpsContinuo:
//   { coords: { latitude, longitude, accuracy, speed, heading }, timestamp }
function onPosition(payload) {
  if (!isTracking) return;

  const point = {
    lat: payload.coords.latitude,
    lng: payload.coords.longitude,
    accuracy: payload.coords.accuracy ?? null,
    speed: payload.coords.speed ?? null,
    heading: payload.coords.heading ?? null,
    battery_level: null,
    recorded_at: new Date(payload.timestamp).toISOString(),
  };

  positionBuffer.push(point);

  // Broadcast last known position to main thread
  broadcastPosition(point);

  if (positionBuffer.length >= GPS_BATCH_SIZE) {
    flushBuffer();
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
