/**
 * fiducia.ts — MP-SILVIO-06 · logica pura del livello di fiducia (audit/undo/coda)
 * Nessun I/O. Specchio delle regole DB per UI + test.
 */

export type EsitoAudit = "eseguita" | "rifiutata" | "annullata" | "errore";
export type StatoCoda = "in_attesa" | "approvata" | "rifiutata" | "modificata" | "scaduta";

/** Si può annullare SOLO un'azione reversibile effettivamente eseguita e non già annullata. */
export function puoAnnullare(reversibile: boolean, esito: string, giaAnnullata = false): boolean {
  return !!reversibile && esito === "eseguita" && !giaAnnullata;
}

/**
 * Oggetti con inverso DB sicuro e atomico (specchio di silvio_undo nel DB):
 *  - email_collegamento     → scollega (delete riga ponte)
 *  - email_documento_estratto → elimina la bozza se ancora non confermata
 * Solo per questi la UI mostra "Annulla": evita pulsanti che poi falliscono.
 */
export const OGGETTI_ANNULLABILI = new Set(["email_collegamento", "email_documento_estratto"]);

/** L'undo è offribile dalla UI solo se l'oggetto è tracciato e ha un inverso supportato. */
export function annullabileInverso(
  oggettoTipo: string | null | undefined,
  oggettoId: string | null | undefined,
  reversibile: boolean,
  esito: string,
  giaAnnullata = false,
): boolean {
  if (!oggettoId) return false;
  if (!OGGETTI_ANNULLABILI.has(oggettoTipo ?? "")) return false;
  return puoAnnullare(reversibile, esito, giaAnnullata);
}

/** Una voce in coda è gestibile solo finché è in attesa. */
export function codaGestibile(stato: string): boolean {
  return stato === "in_attesa";
}

export function etichettaEsito(e: string | null | undefined): string {
  switch (e) {
    case "eseguita": return "Eseguita";
    case "rifiutata": return "Rifiutata";
    case "annullata": return "Annullata";
    case "errore": return "Errore";
    default: return "—";
  }
}

export function etichettaOrigine(o: string | null | undefined): string {
  switch (o) {
    case "richiesta": return "Richiesta tua";
    case "trigger": return "Automatico (evento)";
    case "playbook": return "Procedura";
    case "whatsapp": return "WhatsApp";
    case "voce": return "Voce";
    case "canale": return "Canale esterno";
    default: return o ?? "—";
  }
}

/** Riassunto leggibile dei parametri di un'azione (per l'anteprima in coda/audit). */
export function anteprimaParametri(parametri: Record<string, unknown> | null | undefined, max = 4): string {
  if (!parametri || typeof parametri !== "object") return "";
  const parti = Object.entries(parametri)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .slice(0, max)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  return parti.join(" · ");
}
