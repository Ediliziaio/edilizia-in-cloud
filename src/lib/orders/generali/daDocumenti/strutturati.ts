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
  /** Voce della sicurezza (PriMus la segna): non si ribassa e va nella fase a parte. */
  sicurezza?: boolean;
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
  // Più file dello stesso tipo sono parti dello stesso totale: si sommano, non sono un conflitto.
  // L'elenco prezzi non ha totale (sono prezzi unitari): resta fuori.
  const somme: Record<"totale_computo" | "totale_sicurezza", { totale: number; voci: number; file: string[]; nomi: string[] }> = {
    totale_computo: { totale: 0, voci: 0, file: [], nomi: [] }, totale_sicurezza: { totale: 0, voci: 0, file: [], nomi: [] },
  };
  for (const [id, s] of Object.entries(strutturati as Record<string, Strutturato>)) {
    if (!s || s.documento === "elenco_prezzi" || typeof s.totale !== "number" || !Number.isFinite(s.totale)) continue;
    const nome = nomi.get(id) ?? id;
    const k = s.documento === "sicurezza" ? "totale_sicurezza" : "totale_computo";
    somme[k].totale += s.totale; somme[k].voci += s.voci?.length ?? 0; somme[k].file.push(`${nome} (${FORMATO[s.formato] ?? "file"})`); somme[k].nomi.push(nome);
    if (s.oggetto) metti("oggetto", { valore: s.oggetto, file: nome, pagina: 1, certezza: "letto", citazione: "Intestazione del computo" });
  }
  for (const k of ["totale_computo", "totale_sicurezza"] as const) {
    const x = somme[k];
    if (x.file.length === 0) continue;
    metti(k, {
      valore: Math.round(x.totale * 100) / 100, file: x.nomi.length === 1 ? x.nomi[0] : `${x.nomi.length} file`, pagina: 1, certezza: "calcolato",
      citazione: `Somma di ${x.voci} voci: ${x.file.join(", ")}`,
    });
  }
  return dati;
}
