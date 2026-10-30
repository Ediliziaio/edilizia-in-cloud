// Incassi della fattura e abbinamento al bonifico (30/10/2026).
//
// Dalla fattura si abbina un accredito della banca collegata: l'elenco viene da
// movimenti_banca_per_fattura (gli accrediti ancora liberi) e qui si ordina,
// prima i più probabili. L'abbinamento lo fa riconcilia_bonifico_fattura: un
// incasso nuovo, oppure il legame con un incasso già registrato a mano
// (p_movimento_id), così lo stesso pagamento non si conta due volte.

/** Un accredito ancora da abbinare (movimenti_banca_per_fattura). */
export interface MovimentoBanca {
  id: string;
  data: string | null;
  importo: number;
  descrizione: string | null;
  controparte: string | null;
  riferimento: string | null;
  conto: string | null;
}

/** Una riga dello storico (incassi_fattura). */
export interface IncassoFattura {
  id: string;
  data_movimento: string;
  importo: number;
  metodo: string | null;
  riferimento: string | null;
  note: string | null;
  created_at: string;
  /** Bonifico parlante con ritenuta: si annulla solo dal registro ritenute. */
  parlante: boolean;
  riconciliazione_id: string | null;
  /** match_type della riconciliazione: 'manual', 'auto', 'incasso_esistente'… */
  abbinamento: string | null;
  bonifico_id: string | null;
  bonifico_data: string | null;
  bonifico_importo: number | null;
  bonifico_descrizione: string | null;
}

/** Quanto della fattura serve per riconoscere il bonifico giusto. */
export interface FatturaPerAbbinamento {
  numero: string | null;
  numero_progressivo?: number | null;
  anno?: number | null;
  cliente: string;
  residuo: number;
  data_emissione?: string | null;
}

export interface Proposta {
  movimento: MovimentoBanca;
  punteggio: number;
  /** Perché è in cima, in parole: «Importo uguale al residuo», «Numero fattura nella causale»… */
  motivi: string[];
  /** L'incasso già registrato a cui questo bonifico corrisponde, se c'è. */
  incassoUguale: IncassoFattura | null;
}

const centesimi = (n: number) => Math.round(n * 100);
const uguali = (a: number, b: number) => Math.abs(centesimi(a) - centesimi(b)) <= 1;

function normalizza(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9/]+/g, " ")
    .trim();
}

/** Le forme del numero che chi paga scrive nella causale: «FT-2026-0037», «37/2026». */
export function formeNumero(f: Pick<FatturaPerAbbinamento, "numero" | "numero_progressivo" | "anno">): string[] {
  const forme = new Set<string>();
  const pieno = normalizza(f.numero);
  if (pieno.replace(/\s/g, "").length >= 3) forme.add(pieno);
  if (f.numero_progressivo && f.anno) {
    forme.add(`${f.numero_progressivo}/${f.anno}`);
    forme.add(`${f.numero_progressivo}/${String(f.anno).slice(2)}`);
  }
  return [...forme];
}

/** Il numero della fattura compare nella causale (come parola, non dentro un altro numero). */
export function causaleCitaNumero(causale: string, f: Pick<FatturaPerAbbinamento, "numero" | "numero_progressivo" | "anno">): boolean {
  const testo = ` ${normalizza(causale)} `;
  const compatto = testo.replace(/\s/g, "");
  return formeNumero(f).some((forma) => {
    const escape = forma.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    if (new RegExp(`(^|[^0-9])${escape}([^0-9]|$)`).test(testo)) return true;
    // «FT 2026 0037» scritto senza trattini né spazi
    const senzaSpazi = forma.replace(/\s/g, "");
    return senzaSpazi.length >= 6 && /[a-z]/.test(senzaSpazi) && compatto.includes(senzaSpazi);
  });
}

const PAROLE_VUOTE = new Set(["srl", "spa", "snc", "sas", "srls", "societa", "ditta", "impresa", "di", "del", "della", "e", "c"]);

/** Il cliente è riconoscibile nella causale o nell'ordinante: metà delle parole del nome, almeno una. */
export function causaleCitaCliente(testo: string, cliente: string): boolean {
  const parole = normalizza(cliente).split(" ").filter((p) => p.length >= 3 && !PAROLE_VUOTE.has(p));
  if (parole.length === 0) return false;
  const dove = ` ${normalizza(testo)} `;
  const trovate = parole.filter((p) => dove.includes(` ${p} `)).length;
  return trovate >= Math.max(1, Math.ceil(parole.length / 2));
}

function giorniTra(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const ms = Date.parse(`${a.slice(0, 10)}T12:00:00Z`) - Date.parse(`${b.slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
}

/** Gli incassi registrati a mano che non hanno ancora un bonifico. */
export function incassiSenzaBonifico(incassi: IncassoFattura[]): IncassoFattura[] {
  return incassi.filter((i) => !i.bonifico_id && !i.parlante);
}

/**
 * Gli accrediti, prima i più probabili: importo uguale al residuo (o a un
 * incasso già registrato senza bonifico), numero della fattura nella causale,
 * nome del cliente nella causale o nell'ordinante. A parità, il più vicino
 * alla data della fattura.
 */
export function ordinaMovimentiPerFattura(
  movimenti: MovimentoBanca[],
  fattura: FatturaPerAbbinamento,
  incassi: IncassoFattura[] = [],
): Proposta[] {
  const liberi = incassiSenzaBonifico(incassi);
  const proposte = movimenti.map((m): Proposta => {
    const motivi: string[] = [];
    let punteggio = 0;
    const importo = Number(m.importo) || 0;
    const incassoUguale = liberi.find((i) => uguali(Number(i.importo), importo)) ?? null;

    if (fattura.residuo > 0 && uguali(importo, fattura.residuo)) {
      punteggio += 50;
      motivi.push("Importo uguale al residuo");
    } else if (incassoUguale) {
      punteggio += 45;
      motivi.push("Importo uguale all'incasso già registrato");
    } else if (fattura.residuo > 0 && importo < fattura.residuo) {
      punteggio += 5;
    }

    const testo = `${m.descrizione ?? ""} ${m.riferimento ?? ""}`;
    if (causaleCitaNumero(testo, fattura)) {
      punteggio += 30;
      motivi.push("Numero fattura nella causale");
    }
    if (fattura.cliente && causaleCitaCliente(`${testo} ${m.controparte ?? ""}`, fattura.cliente)) {
      punteggio += 20;
      motivi.push("Nome del cliente");
    }
    return { movimento: m, punteggio, motivi, incassoUguale };
  });

  const distanza = (p: Proposta) => {
    const g = giorniTra(p.movimento.data, fattura.data_emissione);
    return g === null ? 9999 : g < 0 ? -g * 2 : g;
  };
  return proposte.sort((a, b) => b.punteggio - a.punteggio || distanza(a) - distanza(b));
}

/** «12/10» */
export function giornoMese(data: string | null | undefined): string {
  if (!data) return "";
  const [, mese, giorno] = data.slice(0, 10).split("-");
  return giorno && mese ? `${giorno}/${mese}` : data;
}

/**
 * Lo stato del pagamento in una riga: «Pagata · abbinata al bonifico del 12/10»,
 * «Pagata in parte · 1 bonifico abbinato», oppure null se non c'è un bonifico.
 */
export function descriviPagamentoBanca(stato: string, incassi: IncassoFattura[]): string | null {
  const conBonifico = incassi.filter((i) => i.bonifico_id);
  if (conBonifico.length === 0) return null;
  const etichetta = stato === "pagata" ? "Pagata" : stato === "parzialmente_pagata" ? "Pagata in parte" : null;
  if (!etichetta) return null;
  if (conBonifico.length === 1) return `${etichetta} · abbinata al bonifico del ${giornoMese(conBonifico[0].bonifico_data)}`;
  return `${etichetta} · ${conBonifico.length} bonifici abbinati`;
}
