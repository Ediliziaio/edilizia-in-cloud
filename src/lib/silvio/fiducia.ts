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
