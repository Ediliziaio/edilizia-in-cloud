/**
 * Squadre di posa e calendari lavori.
 *
 * La squadra è UNA cosa (interna o esterna, con o senza login, con o senza
 * calendario Google): vive in `external_teams`, che si chiama così per storia.
 */
export type SquadraKind = "interna" | "esterna";

export const SQUADRA_KIND_LABEL: Record<SquadraKind, string> = {
  interna: "Interna",
  esterna: "Esterna",
};

export type StatoSyncSquadra = "non_collegata" | "disattivata" | "errore" | "attiva";

export const STATO_SYNC_LABEL: Record<StatoSyncSquadra, string> = {
  non_collegata: "Nessun calendario",
  disattivata: "Collegato, spento",
  errore: "Errore",
  attiva: "Attivo",
};

/** Lo stato letto a colpo d'occhio nella tabella: l'errore batte tutto. */
export function statoSyncSquadra(s: {
  google_calendar_id: string | null;
  google_sync_enabled: boolean;
  google_last_error: string | null;
}): StatoSyncSquadra {
  if (!s.google_calendar_id) return "non_collegata";
  if (s.google_last_error) return "errore";
  return s.google_sync_enabled ? "attiva" : "disattivata";
}

/** I calendari standard del calendario lavori. Per ora uno: si aggiungono quando hanno un invio. */
export type CalendarioStandardKind = "posa";

export const CALENDARIO_STANDARD: Array<{ kind: CalendarioStandardKind; label: string; descrizione: string }> = [
  { kind: "posa", label: "Posa", descrizione: "Tutte le pose dell'azienda, di qualunque squadra." },
];

export interface CompanyCalendarLink {
  id: string;
  company_id: string;
  kind: CalendarioStandardKind;
  google_connection_id: string | null;
  google_calendar_id: string | null;
  enabled: boolean;
  last_sync_at: string | null;
  last_error: string | null;
}

/** Una connessione Google dell'azienda, come la vede l'admin. */
export interface ConnessioneGoogleAzienda {
  id: string;
  user_id: string;
  google_account_email: string | null;
  status: string;
}

export interface CalendarioGoogle {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
  accessRole?: string;
}
