import type { PreparedVariation } from "./variationDraft";

/** Whitelist public terms: never copy the token, private notes or signature into a proposal. */
export function pendingVariationDocument(row: {
  order_id: string; company_id: string; status: string; numero_odv: number;
  titolo: string; descrizione: string; motivazione?: string | null;
  impatto_economico: number; impatto_giorni: number; richiesto_da?: string | null;
}, orderId: string, companyId: string): Omit<PreparedVariation, "note_interne"> {
  if (!orderId || !companyId || row.order_id !== orderId || row.company_id !== companyId)
    throw new Error("La variante non appartiene a questa commessa.");
  if (row.status !== "in_attesa") throw new Error("La variante non è più in attesa: aggiorna l'elenco.");
  if (!Number.isSafeInteger(row.numero_odv) || row.numero_odv < 1 ||
      !row.titolo.trim() || !row.descrizione.trim() || !Number.isFinite(row.impatto_economico) ||
      !Number.isSafeInteger(row.impatto_giorni) || row.impatto_giorni < 0 || row.impatto_giorni > 3650)
    throw new Error("Dati della variante incompleti: verifica prima di preparare il documento.");
  return { titolo: row.titolo, descrizione: row.descrizione, motivazione: row.motivazione ?? null,
    impatto_economico: row.impatto_economico, impatto_giorni: row.impatto_giorni,
    richiesto_da: row.richiesto_da ?? null };
}

/** Invalid timestamps must not crash the entire order or become invented signing dates. */
export function variationEventDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return null;
  const day = value.slice(0, 10);
  const calendarDate = new Date(`${day}T12:00:00Z`);
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== day) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) : null;
}
