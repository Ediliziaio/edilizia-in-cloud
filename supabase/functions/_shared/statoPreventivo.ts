/**
 * Vocabolario unico degli stati preventivo (quotes.status), lo stesso della
 * funzione SQL public.normalizza_stato_preventivo e del CHECK in tabella:
 *   bozza | inviata | accettata | rifiutata | scaduta | convertita | annullata
 *
 * Il DB normalizza da solo ogni scrittura (trigger aa_quotes_normalizza_stato);
 * qui serve per validare input umani (Silvio a voce dice "accettato") e per
 * filtrare in lettura senza dimenticare le forme legacy.
 */
export const STATI_PREVENTIVO = [
  "bozza",
  "inviata",
  "accettata",
  "rifiutata",
  "scaduta",
  "convertita",
  "annullata",
] as const;

export type StatoPreventivo = (typeof STATI_PREVENTIVO)[number];

const MAPPA: Record<string, StatoPreventivo> = {
  bozza: "bozza", draft: "bozza",
  inviata: "inviata", inviato: "inviata", sent: "inviata", sent_to_client: "inviata", pending: "inviata",
  aperto: "inviata", aperta: "inviata", visto: "inviata", vista: "inviata", viewed: "inviata",
  visualizzata: "inviata", visualizzato: "inviata",
  accettata: "accettata", accettato: "accettata", accepted: "accettata", firmata: "accettata", firmato: "accettata",
  signed: "accettata", approvata: "accettata", approvato: "accettata", approved: "accettata",
  vinta: "accettata", vinto: "accettata", won: "accettata",
  rifiutata: "rifiutata", rifiutato: "rifiutata", rejected: "rifiutata", refused: "rifiutata", declined: "rifiutata",
  persa: "rifiutata", perso: "rifiutata", lost: "rifiutata",
  scaduta: "scaduta", scaduto: "scaduta", expired: "scaduta",
  convertita: "convertita", convertito: "convertita", converted: "convertita",
  annullata: "annullata", annullato: "annullata", cancelled: "annullata", canceled: "annullata",
};

/** Riporta qualsiasi forma (maschile, inglese, varianti) al canonico; le sconosciute restano com'erano, minuscole. */
export function normalizzaStatoPreventivo(stato: string | null | undefined): string {
  const chiave = (stato ?? "").trim().toLowerCase();
  return MAPPA[chiave] ?? chiave;
}

export function isStatoPreventivoCanonico(stato: string): stato is StatoPreventivo {
  return (STATI_PREVENTIVO as readonly string[]).includes(stato);
}

/** Stati "vivi": il preventivo aspetta ancora una risposta del cliente. */
export const STATI_PREVENTIVO_APERTI: readonly StatoPreventivo[] = ["bozza", "inviata"];
