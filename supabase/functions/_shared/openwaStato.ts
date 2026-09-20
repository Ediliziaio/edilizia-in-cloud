// Stato di una sessione WhatsApp Locale: una sola mappatura per tutti.
//
// Era duplicata in openwa-webhook e openwa-gateway, con lo stesso difetto in
// entrambi: uno stato non riconosciuto diventava "connecting". Il 12/09/2026
// i quattro numeri risultavano scollegati ("In attesa QR") mentre il gateway
// li dava tutti `ready`: il gateway manda il payload dentro `data`, il webhook
// leggeva lo stato solo al primo livello, trovava stringa vuota e degradava il
// numero. Le campagne si fermavano in silenzio a ogni riconnessione notturna.
//
// Regola: se non riconosco lo stato NON tocco il numero (ritorno null). Un
// numero che lavora non si spegne per un evento che non so leggere.

export type StatoOpenWa = "connected" | "disconnected" | "banned" | "connecting";

/** Stato grezzo dal payload del gateway, ovunque lo metta. */
export function statoGrezzoDaPayload(payload: unknown): string {
  const p = (payload ?? {}) as Record<string, any>;
  const candidati = [
    p.status, p.state,
    p.data?.status, p.data?.state,
    p.payload?.status, p.payload?.state,
    p.session?.status, p.session?.state,
  ];
  for (const c of candidati) {
    if (typeof c === "string" && c.trim()) return c.trim().toLowerCase();
  }
  return "";
}

/**
 * Mappa lo stato del gateway sul nostro. `null` = sconosciuto: chi chiama non
 * deve scrivere nulla.
 *
 * ORDINE E UGUAGLIANZA CONTANO: "disconnected" contiene "connect", e un
 * includes() valutato per primo marcava CONNESSO un numero caduto.
 */
export function mappaStatoOpenWa(raw: string): StatoOpenWa | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s.includes("ban")) return "banned";
  if (/disconnect|unpaired|logout|logged_out|close|timeout|conflict|unlaunched|destroyed|failed/.test(s)) return "disconnected";
  if (/^(connected|ready|authenticated|open|inchat|online|working)$/.test(s)) return "connected";
  // «qr_ready» è come il gateway dice «aspetto che qualcuno inquadri il QR»:
  // mancava, e dal 19/09 il numero …2744 fermo sul QR ha scritto un avviso di
  // «stato non riconosciuto» a ogni evento (quasi 500 al giorno nei log).
  if (/^(connecting|opening|pairing|starting|initializing|reconnecting|syncing|qr|qr_ready|qr_code|qrcode|scan_qr|scan_qr_code|waiting_qr|unpaired_idle)$/.test(s)) return "connecting";
  return null;
}

/** Stato leggibile del payload, per il log quando non si riconosce nulla. */
export function riassuntoPayload(payload: unknown, max = 300): string {
  try { return JSON.stringify(payload).slice(0, max); } catch { return String(payload).slice(0, max); }
}
