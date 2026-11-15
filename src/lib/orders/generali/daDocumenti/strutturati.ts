/**
 * Commessa generale dai documenti — i file letti senza AI (lotti 1 e 6 del piano
 * docs/piano-commessa-generale-da-documenti.md, §3.2 punto 1). Computo, elenco prezzi e stima
 * della sicurezza in XPWE, Excel o PDF di PriMus li legge il browser con `leggiFileComputo`; nella
 * lettura resta un riassunto per file. Da qui escono i dati che servono ai controlli (totali) e
 * le voci che diventeranno elenco prezzi e fasi alla conferma.
 */
import type { DatiLetti, Occorrenza } from "./controlli.ts";

export interface VoceStrutturata {
  codice: string | null;
  descrizione: string;
  unita: string;
  quantita: number;
  prezzo: number;
  importo: number;
  capitolo: string | null;
}

export interface Strutturato {
  formato: "xpwe" | "excel" | "primus_pdf";
  /** Quale documento è nella lettura: decide in quale totale va. */
  documento: string;
  totale: number;
  oggetto: string | null;
  committente: string | null;
  voci: VoceStrutturata[];
}

export type Strutturati = Record<string, Strutturato>;

const FORMATO: Record<Strutturato["formato"], string> = { xpwe: "file XPWE", excel: "foglio Excel", primus_pdf: "PDF di PriMus" };

export function datiDaStrutturati(strutturati: unknown, file: { id: string; nome: string }[]): DatiLetti {
  const dati: DatiLetti = {};
  if (!strutturati || typeof strutturati !== "object") return dati;
  const nomi = new Map(file.map((f) => [f.id, f.nome]));
  const metti = (k: string, o: Occorrenza) => { (dati[k] ??= []).push(o); };
  for (const [id, s] of Object.entries(strutturati as Record<string, Strutturato>)) {
    if (!s || typeof s.totale !== "number" || !Number.isFinite(s.totale)) continue;
    const nome = nomi.get(id) ?? id;
    const chiave = s.documento === "sicurezza" ? "totale_sicurezza" : "totale_computo";
    metti(chiave, {
      valore: Math.round(s.totale * 100) / 100, file: nome, pagina: 1, certezza: "calcolato",
      citazione: `Somma di ${s.voci?.length ?? 0} voci del ${FORMATO[s.formato] ?? "file"}`,
    });
    if (s.oggetto) metti("oggetto", { valore: s.oggetto, file: nome, pagina: 1, certezza: "letto", citazione: "Intestazione del computo" });
  }
  return dati;
}
