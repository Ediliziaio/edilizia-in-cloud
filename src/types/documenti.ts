/**
 * Tipi per Documenti Operai + Scadenze + Notifiche Push (MP5)
 */

// ── Stato scadenza ─────────────────────────────────────────────────────────────
export type StatoScadenza = "valido" | "in_scadenza" | "scaduto" | "senza_scadenza";

// ── Tipo documento (configurabile) ────────────────────────────────────────────
export interface TipoDocumentoOperaio {
  id: string;
  company_id: string;
  nome: string;
  descrizione: string | null;
  richiede_scadenza: boolean;
  alert_giorni_prima: number;
  obbligatorio: boolean;
  is_default: boolean;
  attivo: boolean;
  ordine: number;
  created_at: string;
}

// ── Documento operaio ─────────────────────────────────────────────────────────
export interface DocumentoOperaio {
  id: string;
  company_id: string;
  operaio_id: string;
  tipo_id: string | null;
  nome_file: string;
  file_path: string;    // Storage path (privato — usa signed URL per download)
  data_emissione: string | null; // "yyyy-MM-dd"
  data_scadenza: string | null;  // "yyyy-MM-dd"
  stato: StatoScadenza;
  note: string | null;
  caricato_da: string | null;
  created_at: string;
  // Join
  tipo?: TipoDocumentoOperaio | null;
  operaio?: { first_name: string; last_name: string; email?: string } | null;
}

export interface DocumentoOperaioInsert {
  company_id: string;
  operaio_id: string;
  tipo_id?: string | null;
  nome_file: string;
  file_path: string;
  data_emissione?: string | null;
  data_scadenza?: string | null;
  stato?: StatoScadenza;
  note?: string | null;
  caricato_da?: string | null;
}

// ── Push subscription ─────────────────────────────────────────────────────────
export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  company_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  user_agent: string | null;
  created_at: string;
}

// ── KPI scadenze (per dashboard) ──────────────────────────────────────────────
export interface ScadenzeKPI {
  scaduti: number;
  in_scadenza_30: number;
  in_scadenza_60: number;
  in_scadenza_90: number;
  validi: number;
}

// ── Riga tabella scadenze ─────────────────────────────────────────────────────
export interface ScadenzaRow {
  id: string;
  operaio_id: string;
  operaio_nome: string;
  tipo_nome: string;
  data_scadenza: string | null;
  giorni_mancanti: number | null;
  stato: StatoScadenza;
  nome_file: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Calcola i giorni mancanti alla scadenza (negativo se già scaduto) */
export function giorniAllaScadenza(data_scadenza: string | null): number | null {
  if (!data_scadenza) return null;
  const scadenza = new Date(data_scadenza + "T00:00:00");
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  return Math.round((scadenza.getTime() - oggi.getTime()) / (1000 * 60 * 60 * 24));
}

/** Calcola lo stato in base alla data scadenza (client-side, per preview immediato) */
export function calcolaStato(data_scadenza: string | null): StatoScadenza {
  if (!data_scadenza) return "senza_scadenza";
  const giorni = giorniAllaScadenza(data_scadenza);
  if (giorni === null) return "senza_scadenza";
  if (giorni < 0) return "scaduto";
  if (giorni <= 30) return "in_scadenza";
  return "valido";
}

/** Colore Tailwind per lo stato */
export function statoColor(stato: StatoScadenza): string {
  switch (stato) {
    case "scaduto":      return "text-red-600 bg-red-50 border-red-300";
    case "in_scadenza":  return "text-amber-600 bg-amber-50 border-amber-300";
    case "valido":       return "text-green-600 bg-green-50 border-green-300";
    case "senza_scadenza": return "text-slate-500 bg-slate-100 border-slate-200";
  }
}

/** Label italiano per lo stato */
export function statoLabel(stato: StatoScadenza): string {
  switch (stato) {
    case "scaduto":      return "Scaduto";
    case "in_scadenza":  return "In scadenza";
    case "valido":       return "Valido";
    case "senza_scadenza": return "Senza scadenza";
  }
}
