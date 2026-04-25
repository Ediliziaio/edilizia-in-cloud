/**
 * Calcolo finanziamento via lookup su tabella + interpolazione lineare.
 *
 * Strategia:
 *   1. Match esatto su (importo, numero_rate) → ritorna riga.
 *   2. Importo intermedio (non in tabella) ma durata disponibile →
 *      interpolazione lineare tra le 2 righe più vicine sopra e sotto.
 *   3. Durata non in tabella → errore "durata_non_disponibile" con suggerimenti.
 *   4. Importo fuori range min-max → errore "importo_fuori_range".
 *
 * Niente formula francese in fallback: nel modello attuale la tabella è la
 * source of truth. Se i dati mancano, l'utente deve ampliare la tabella o
 * scegliere parametri compresi nel range.
 */

import type { RigaTabellaFinanziamento, RisultatoCalcolo } from "./types";

interface InputCalcolo {
  importo: number;
  numero_rate: number;
  righe: RigaTabellaFinanziamento[];
}

export function calcolaFinanziamento({
  importo,
  numero_rate,
  righe,
}: InputCalcolo): RisultatoCalcolo {
  // Validazioni input
  if (!righe || righe.length === 0) {
    return {
      importo_richiesto: importo,
      numero_rate,
      modalita: "errore",
      errore: "tabella_vuota",
      messaggio: "La tabella selezionata non ha righe caricate.",
    };
  }

  // Filtra righe per durata richiesta
  const righeDurata = righe.filter((r) => r.numero_rate === numero_rate);
  if (righeDurata.length === 0) {
    const durate_disponibili = Array.from(
      new Set(righe.map((r) => r.numero_rate))
    ).sort((a, b) => a - b);
    return {
      importo_richiesto: importo,
      numero_rate,
      modalita: "errore",
      errore: "durata_non_disponibile",
      messaggio: `Durata di ${numero_rate} rate non disponibile in tabella.`,
      durate_disponibili,
    };
  }

  // Ordina per importo crescente
  const ordinate = [...righeDurata].sort(
    (a, b) => a.importo_erogato - b.importo_erogato
  );
  const importo_min = ordinate[0].importo_erogato;
  const importo_max = ordinate[ordinate.length - 1].importo_erogato;

  if (importo < importo_min || importo > importo_max) {
    return {
      importo_richiesto: importo,
      numero_rate,
      modalita: "errore",
      errore: "importo_fuori_range",
      messaggio: `Importo €${formatEuro(importo)} fuori range. La tabella copre da €${formatEuro(importo_min)} a €${formatEuro(importo_max)} per durata di ${numero_rate} rate.`,
      importo_min,
      importo_max,
    };
  }

  // Match esatto?
  const esatto = ordinate.find((r) => r.importo_erogato === importo);
  if (esatto) {
    return rigaToRisultato(importo, numero_rate, esatto);
  }

  // Interpolazione lineare tra sotto e sopra
  const sotto = [...ordinate].reverse().find((r) => r.importo_erogato < importo)!;
  const sopra = ordinate.find((r) => r.importo_erogato > importo)!;
  const range = sopra.importo_erogato - sotto.importo_erogato;
  const fattore = range === 0 ? 0 : (importo - sotto.importo_erogato) / range;

  const interp = (a: number, b: number) => a + (b - a) * fattore;

  return {
    importo_richiesto: importo,
    numero_rate,
    modalita: "interpolato",
    importo_rata: round2(interp(sotto.importo_rata, sopra.importo_rata)),
    spese_incasso_rata: round2(
      interp(sotto.spese_incasso_rata, sopra.spese_incasso_rata)
    ),
    rata_completa: round2(
      interp(sotto.importo_rata, sopra.importo_rata) +
        interp(sotto.spese_incasso_rata, sopra.spese_incasso_rata)
    ),
    spese_istruttoria: round2(
      interp(sotto.spese_istruttoria, sopra.spese_istruttoria)
    ),
    importo_totale_credito: round2(
      interp(sotto.importo_totale_credito, sopra.importo_totale_credito)
    ),
    interessi_cliente: round2(
      interp(sotto.interessi_cliente, sopra.interessi_cliente)
    ),
    importo_totale_dovuto: round2(
      interp(sotto.importo_totale_dovuto, sopra.importo_totale_dovuto)
    ),
    tan: round3(interp(sotto.tan, sopra.tan)),
    taeg: round3(interp(sotto.taeg, sopra.taeg)),
    icc:
      sotto.icc != null && sopra.icc != null
        ? round3(interp(sotto.icc, sopra.icc))
        : null,
    provvigione_dealer: round2(
      interp(sotto.provvigione_dealer, sopra.provvigione_dealer)
    ),
    righe_interpolazione: { sotto, sopra, fattore },
  };
}

function rigaToRisultato(
  importo: number,
  numero_rate: number,
  r: RigaTabellaFinanziamento
): RisultatoCalcolo {
  return {
    importo_richiesto: importo,
    numero_rate,
    modalita: "esatto",
    importo_rata: r.importo_rata,
    spese_incasso_rata: r.spese_incasso_rata,
    rata_completa: round2(r.importo_rata + r.spese_incasso_rata),
    spese_istruttoria: r.spese_istruttoria,
    importo_totale_credito: r.importo_totale_credito,
    interessi_cliente: r.interessi_cliente,
    importo_totale_dovuto: r.importo_totale_dovuto,
    tan: r.tan,
    taeg: r.taeg,
    icc: r.icc,
    provvigione_dealer: r.provvigione_dealer,
    riga_base: r,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function formatEuro(n: number): string {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
