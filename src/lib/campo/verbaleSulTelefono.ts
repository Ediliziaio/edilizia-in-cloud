/**
 * Il verbale di collaudo compilato resta sul telefono finché il server non l'ha salvato (26/11/2026, piano campo
 * completo 1.7). In cantiere la rete va e viene: prima, se mancava al momento di «Salva bozza», il capocantiere
 * perdeva tutto quello che aveva scritto col cliente davanti.
 *
 * Qui si tiene solo il CONTENUTO della bozza. PDF e firma restano al server: il cliente firma il documento che ha
 * visto, con la sua impronta, e quello senza rete non esiste.
 */
import type { AcceptanceContent } from "../../../supabase/functions/collaudo-commessa/model";

export interface VerbaleSulTelefono {
  content: AcceptanceContent;
  valori: Record<string, unknown>;
  /** La bozza sul server da cui si era partiti (null = verbale nuovo, ancora mai salvato). */
  reportId: string | null;
  version: number | null;
  salvatoIl: string;
}

const chiave = (utente: string, commessa: string) => `campo-verbale-bozza:${utente}:${commessa}`;

export function leggiVerbaleSulTelefono(utente: string | undefined, commessa: string | undefined): VerbaleSulTelefono | null {
  if (!utente || !commessa) return null;
  try {
    const grezzo = localStorage.getItem(chiave(utente, commessa));
    if (!grezzo) return null;
    const v = JSON.parse(grezzo) as Partial<VerbaleSulTelefono>;
    if (!v || typeof v !== "object" || !v.content || typeof v.content !== "object") return null;
    return {
      content: v.content as AcceptanceContent,
      valori: v.valori && typeof v.valori === "object" ? v.valori : {},
      reportId: typeof v.reportId === "string" ? v.reportId : null,
      version: typeof v.version === "number" ? v.version : null,
      salvatoIl: typeof v.salvatoIl === "string" ? v.salvatoIl : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function scriviVerbaleSulTelefono(utente: string | undefined, commessa: string | undefined, v: Omit<VerbaleSulTelefono, "salvatoIl">): void {
  if (!utente || !commessa) return;
  try {
    localStorage.setItem(chiave(utente, commessa), JSON.stringify({ ...v, salvatoIl: new Date().toISOString() }));
  } catch { /* memoria piena o bloccata: resta la bozza in pagina */ }
}

export function cancellaVerbaleSulTelefono(utente: string | undefined, commessa: string | undefined): void {
  if (!utente || !commessa) return;
  try { localStorage.removeItem(chiave(utente, commessa)); } catch { /* niente da fare */ }
}

/** L'errore è la rete che manca (non un rifiuto del server)? Il client di Supabase la chiama FunctionsFetchError. */
export function erroreDiRete(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const nome = e && typeof e === "object" && "name" in e ? String((e as { name: unknown }).name) : "";
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return nome === "FunctionsFetchError" || /failed to fetch|network|load failed|failed to send a request/i.test(msg);
}
