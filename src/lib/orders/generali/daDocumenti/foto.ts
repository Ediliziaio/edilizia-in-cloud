/**
 * Commessa generale dai documenti — la fotografia della lettura VERA, dalle righe di
 * `generale_letture` e `generale_lettura_pagine` (lotto 1 del piano). Il popup la disegna come
 * quella della lettura di prova (`letturaFinta.ts`): stessa forma, stesso disegno.
 */
import type { DatiLetti } from "./controlli";
import type { FaseLettura, FileLettura, FotoLettura, StatoPagina } from "./letturaFinta";
import type { TipoDaDocumenti } from "./catalogo";

export interface RigaLettura {
  id: string;
  tipo: TipoDaDocumenti;
  forma: string | null;
  stato: "preparata" | "in_lettura" | "in_pausa" | "estrazione" | "pronta" | "errore" | "usata" | "annullata";
  file: { id: string; nome: string; documento: string; percorso: string; strutturato: boolean; pagine: number }[];
  strutturati: Record<string, unknown>;
  stima_eur: number | string;
  costo_eur: number | string;
  dati: DatiLetti;
  avvisi: string[];
  bozza: Record<string, unknown>;
  generale_id: string | null;
  errore: string | null;
  gruppi_totali: number | null;
  gruppi_fatti: number;
  avviata_at: string | null;
  finita_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RigaPagina {
  file_id: string; numero: number; stato: StatoPagina; classe: string | null; motivo: string | null; updated_at: string;
}

export const COLONNE_LETTURA = "id, tipo, forma, stato, file, strutturati, stima_eur, costo_eur, dati, avvisi, bozza, generale_id, errore, gruppi_totali, gruppi_fatti, avviata_at, finita_at, created_at, updated_at";
export const COLONNE_PAGINA = "file_id, numero, stato, classe, motivo, updated_at";

const FASE: Record<RigaLettura["stato"], FaseLettura> = {
  preparata: "caricamento", in_lettura: "pagine", in_pausa: "pagine", estrazione: "estrazione",
  pronta: "finita", usata: "finita", errore: "pagine", annullata: "finita",
};

export interface FotoVera extends FotoLettura {
  stato: RigaLettura["stato"];
  errore: string | null;
  gruppi: { fatti: number; totali: number | null };
  avvisi: string[];
}

export function fotoDaDb(l: RigaLettura, pagine: RigaPagina[], adesso = Date.now()): FotoVera {
  const perFile = new Map<string, RigaPagina[]>();
  for (const p of pagine) perFile.set(p.file_id, [...(perFile.get(p.file_id) ?? []), p]);
  const file: FileLettura[] = l.file.map((f) => ({
    id: f.id, nome: f.nome, documento: f.documento, strutturato: f.strutturato,
    pagine: (perFile.get(f.id) ?? []).sort((a, b) => a.numero - b.numero)
      .map((p) => ({ numero: p.numero, stato: p.stato, classe: p.classe ?? undefined, motivo: p.motivo ?? undefined })),
  }));
  // I dati arrivano a gruppi: l'ordine di arrivo è quello dei file e delle pagine.
  const arrivati = Object.entries(l.dati ?? {})
    .flatMap(([chiave, occ]) => occ.map((o) => ({ chiave, occorrenza: o })))
    .sort((a, b) => a.occorrenza.file.localeCompare(b.occorrenza.file) || a.occorrenza.pagina - b.occorrenza.pagina)
    .map((a, i) => ({ ...a, t: i }));
  const finita = l.stato === "pronta" || l.stato === "usata";
  const inizio = l.avviata_at ? new Date(l.avviata_at).getTime() : null;
  const trascorso = inizio ? Math.max(0, (finita && l.finita_at ? new Date(l.finita_at).getTime() : adesso) - inizio) : 0;
  const daOcr = pagine.filter((p) => p.stato === "ocr" || p.stato === "illeggibile" || p.stato === "esclusa" || p.stato === "in_lettura" || p.stato === "in_coda");
  const chiuseOra = daOcr.filter((p) => p.stato !== "in_coda" && p.stato !== "in_lettura").length;
  const restanti = daOcr.length - chiuseOra;
  const restante = finita ? 0 : !inizio || chiuseOra < 2 ? null
    : Math.round((trascorso / chiuseOra) * restanti) + (l.gruppi_totali ? (l.gruppi_totali - l.gruppi_fatti) * 15_000 : 20_000);
  return {
    fase: FASE[l.stato], file, dati: l.dati ?? {}, arrivati,
    costo: Number(l.costo_eur ?? 0), stimaCosto: Number(l.stima_eur ?? 0),
    trascorso, restante, finita,
    stato: l.stato, errore: l.errore, gruppi: { fatti: l.gruppi_fatti ?? 0, totali: l.gruppi_totali }, avvisi: l.avvisi ?? [],
  };
}

/** Un giro fermo: «in lettura» ma nessuna pagina si è mossa da più di 4 minuti. */
export function letturaFerma(l: RigaLettura, pagine: RigaPagina[], adesso = Date.now()): boolean {
  if (l.stato !== "in_lettura" && l.stato !== "estrazione") return false;
  const ultimo = Math.max(new Date(l.updated_at).getTime(), ...pagine.map((p) => new Date(p.updated_at).getTime()));
  return adesso - ultimo > 240_000;
}
