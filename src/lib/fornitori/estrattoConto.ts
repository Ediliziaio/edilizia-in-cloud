/**
 * Fatture, debiti ed estratto conto di un fornitore (01/11/2026, lotto 4 di docs/piano-costi-commessa.md).
 *
 * Prima la scheda fornitore mostrava anagrafica, ordini e scadenze, ma non le fatture ricevute né i
 * debiti veri (le rate e le RiBa di rate_fornitori): per sapere quanto si doveva a un fornitore bisognava
 * sommarlo a mano. Qui si costruisce il partitario: in AVERE le fatture (il nostro debito), in DARE i
 * pagamenti e le note di credito; il saldo progressivo è quanto resta da pagare.
 *
 * Lo stato di ogni fattura viene dalle sue rate quando ci sono, dal costo pagato altrimenti; una fattura
 * non ancora registrata come costo è «da registrare»: il debito c'è, ma nessuno l'ha ancora messo a piano.
 */

export interface FatturaFornitore {
  id: string;
  numero_fattura: string | null;
  data_fattura: string | null;
  tipo_documento: string | null;
  totale_documento: number | string | null;
  netto_a_pagare: number | string | null;
  stato: string | null;
  company_cost_id: string | null;
  storico_esterno?: boolean | null;
  costo?: { is_paid: boolean | null; paid_date: string | null; order_id?: string | null } | null;
}

export interface RataFornitore {
  id: string;
  fattura_ricevuta_id: string | null;
  company_cost_id: string | null;
  numero: number | null;
  scadenza: string | null;
  importo: number | string | null;
  metodo: string | null;
  stato: string | null;
  pagata_il: string | null;
}

export type StatoPagamento = "pagata" | "parziale" | "scaduta" | "da_pagare" | "da_registrare" | "nota_credito" | "stornata";

export const ETICHETTA_STATO_PAGAMENTO: Record<StatoPagamento, string> = {
  pagata: "Pagata",
  parziale: "Pagata in parte",
  scaduta: "Scaduta",
  da_pagare: "Da pagare",
  da_registrare: "Da registrare",
  nota_credito: "Nota di credito",
  stornata: "Stornata",
};

const NOTE_CREDITO = ["TD04", "TD08", "passive_credit_note"];
const cent = (v: number | string | null | undefined) => Math.round((Number(v) || 0) * 100);

export const eNotaCredito = (f: Pick<FatturaFornitore, "tipo_documento">) => NOTE_CREDITO.includes(f.tipo_documento ?? "");
/** Quanto si deve per la fattura: il netto a pagare (dopo ritenute e trattenute) se c'è, altrimenti il totale. */
export const importoFattura = (f: FatturaFornitore) => cent(f.netto_a_pagare ?? f.totale_documento) / 100;
/**
 * Quanto vale una nota di credito: il totale in valore assoluto. Lo SDI ammette TD04 con importi di entrambi i
 * segni, e il netto a pagare di una nota può essere negativo o zero: nel partitario una nota scende sempre.
 */
const importoNota = (f: FatturaFornitore) => Math.abs(cent(f.totale_documento ?? f.netto_a_pagare)) / 100;

export interface RigaFattura {
  fattura: FatturaFornitore;
  stato: StatoPagamento;
  importo: number;
  pagato: number;
  residuo: number;
  prossimaScadenza: string | null;
  rate: RataFornitore[];
}

export function statoFatture(fatture: FatturaFornitore[], rate: RataFornitore[], oggi: string): RigaFattura[] {
  const perFattura = new Map<string, RataFornitore[]>();
  const perCosto = new Map<string, RataFornitore[]>();
  for (const r of rate) {
    if (r.fattura_ricevuta_id) perFattura.set(r.fattura_ricevuta_id, [...(perFattura.get(r.fattura_ricevuta_id) ?? []), r]);
    else if (r.company_cost_id) perCosto.set(r.company_cost_id, [...(perCosto.get(r.company_cost_id) ?? []), r]);
  }
  return fatture.map((f): RigaFattura => {
    const importo = eNotaCredito(f) ? importoNota(f) : importoFattura(f);
    const proprie = (perFattura.get(f.id) ?? (f.company_cost_id ? perCosto.get(f.company_cost_id) : undefined) ?? [])
      .slice()
      .sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0));
    if (eNotaCredito(f)) {
      return { fattura: f, stato: "nota_credito", importo, pagato: 0, residuo: 0, prossimaScadenza: null, rate: proprie };
    }
    if (proprie.length) {
      const pagato = proprie.filter((r) => r.stato === "pagata").reduce((s, r) => s + cent(r.importo), 0) / 100;
      // Una rata stornata non è stata pagata e non è più da pagare: l'ha chiusa una nota di credito.
      const aperte = proprie.filter((r) => r.stato !== "pagata" && r.stato !== "stornata");
      const prossima = aperte.map((r) => r.scadenza).filter((d): d is string => !!d).sort()[0] ?? null;
      const ridotte = proprie.some((r) => r.stato === "stornata");
      const stato: StatoPagamento = !aperte.length
        ? pagato > 0 || !ridotte ? "pagata" : "stornata"
        : aperte.some((r) => r.scadenza && r.scadenza < oggi)
          ? "scaduta"
          : pagato > 0
            ? "parziale"
            : "da_pagare";
      // Le rate aperte dicono quanto resta, note di credito comprese. Se a una manca l'importo si torna al conto col totale.
      const residuo = !aperte.length
        ? 0
        : aperte.every((r) => r.importo != null)
          ? aperte.reduce((s, r) => s + cent(r.importo), 0) / 100
          : Math.max(0, cent(importo) - cent(pagato)) / 100;
      return { fattura: f, stato, importo, pagato, residuo, prossimaScadenza: prossima, rate: proprie };
    }
    if (f.costo?.is_paid) return { fattura: f, stato: "pagata", importo, pagato: importo, residuo: 0, prossimaScadenza: null, rate: [] };
    if (!f.company_cost_id) {
      return { fattura: f, stato: f.storico_esterno ? "pagata" : "da_registrare", importo, pagato: f.storico_esterno ? importo : 0, residuo: f.storico_esterno ? 0 : importo, prossimaScadenza: null, rate: [] };
    }
    return { fattura: f, stato: "da_pagare", importo, pagato: 0, residuo: importo, prossimaScadenza: null, rate: [] };
  });
}

export interface MovimentoConto {
  data: string | null;
  descrizione: string;
  /** Pagamenti e note di credito: il debito scende. */
  dare: number;
  /** Fatture: il debito sale. */
  avere: number;
  saldo: number;
  fatturaId: string | null;
}

/**
 * Il partitario del fornitore in ordine di data. Le fatture storiche importate (pagate fuori dal
 * gestionale) entrano con il loro pagamento, così il saldo non resta gonfiato dallo storico.
 */
export function estrattoConto(righe: RigaFattura[]): MovimentoConto[] {
  const mov: Omit<MovimentoConto, "saldo">[] = [];
  for (const r of righe) {
    const f = r.fattura;
    const nome = `${eNotaCredito(f) ? "Nota di credito" : "Fattura"} ${f.numero_fattura ?? ""}`.trim();
    if (eNotaCredito(f)) {
      mov.push({ data: f.data_fattura, descrizione: nome, dare: r.importo, avere: 0, fatturaId: f.id });
      continue;
    }
    mov.push({ data: f.data_fattura, descrizione: nome, dare: 0, avere: r.importo, fatturaId: f.id });
    const pagate = r.rate.filter((x) => x.stato === "pagata");
    for (const x of pagate) {
      mov.push({
        data: x.pagata_il ?? x.scadenza,
        descrizione: `Pagamento ${nome}${r.rate.length > 1 ? ` · rata ${x.numero ?? ""}` : ""}`,
        dare: cent(x.importo) / 100,
        avere: 0,
        fatturaId: f.id,
      });
    }
    if (!pagate.length && r.stato === "pagata") {
      mov.push({
        data: f.costo?.paid_date ?? f.data_fattura,
        descrizione: `Pagamento ${nome}${f.storico_esterno ? " (storico)" : ""}`,
        dare: r.importo,
        avere: 0,
        fatturaId: f.id,
      });
    }
  }
  mov.sort((a, b) => (a.data ?? "9999").localeCompare(b.data ?? "9999") || b.avere - a.avere);
  let saldo = 0;
  return mov.map((m) => {
    saldo = (Math.round(saldo * 100) + Math.round(m.avere * 100) - Math.round(m.dare * 100)) / 100;
    return { ...m, saldo };
  });
}

export interface TotaliFornitore {
  fatturato: number;
  pagato: number;
  daPagare: number;
  scaduto: number;
  daRegistrare: number;
  noteCredito: number;
}

export function totaliFornitore(righe: RigaFattura[], oggi: string): TotaliFornitore {
  const t = { fatturato: 0, pagato: 0, daPagare: 0, scaduto: 0, daRegistrare: 0, noteCredito: 0 };
  for (const r of righe) {
    if (r.stato === "nota_credito") { t.noteCredito += cent(r.importo); continue; }
    t.fatturato += cent(r.importo);
    t.pagato += cent(r.pagato);
    if (r.stato === "da_registrare") t.daRegistrare += cent(r.residuo);
    else t.daPagare += cent(r.residuo);
    t.scaduto += r.rate
      .filter((x) => x.stato !== "pagata" && x.stato !== "stornata" && x.scadenza && x.scadenza < oggi)
      .reduce((s, x) => s + cent(x.importo), 0);
  }
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v / 100])) as unknown as TotaliFornitore;
}

/** Le forme in cui la P.IVA del fornitore può comparire nell'XML (con o senza IT davanti). */
export function variantiPartitaIva(piva: string | null | undefined): string[] {
  const cifre = (piva ?? "").replace(/^IT/i, "").replace(/\s/g, "");
  if (cifre.length < 8) return [];
  return [cifre, `IT${cifre}`];
}
