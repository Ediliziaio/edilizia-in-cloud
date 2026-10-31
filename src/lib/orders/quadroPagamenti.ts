/**
 * Quadro incassi e pagamenti della commessa (Economia → Incassi e pagamenti).
 * I dati li calcola commessa_quadro_pagamenti() nel database; qui solo totali,
 * etichette e filtri, senza regole nuove sui soldi.
 */

export type CategoriaUscita = "materiali" | "subappalti" | "professionisti" | "noleggi" | "extra";
export type StatoUscita = "scaduto" | "da_pagare" | "parziale" | "fattura_da_arrivare" | "da_maturare" | "pagato";

export interface RataCliente {
  id: string;
  label: string | null;
  type: string | null;
  amount: number;
  is_paid: boolean;
  paid_date: string | null;
  expected_date: string | null;
  fattura: string | null;
  scaduta: boolean;
}

export interface SalCliente {
  id: string;
  numero_sal: number | null;
  data_emissione: string | null;
  stato: string | null;
  importo_totale: number | null;
  rata: string | null;
  incassato: boolean | null;
}

export interface Uscita {
  chiave: string;
  categoria: CategoriaUscita;
  controparte: string | null;
  descrizione: string | null;
  riferimento: string | null;
  importo: number;
  fatture: string | null;
  senza_fattura: boolean;
  ha_ricevuta: boolean;
  pagato: number;
  pagato_il: string | null;
  residuo: number;
  scadenza: string | null;
  stato: StatoUscita;
  ripartito: boolean;
  quota_pct: number;
  origine_tipo: "costo" | "oda" | "subappalto" | "ditta";
  origine_id: string;
  contratto: number | null;
  maturato_lordo: number | null;
  ritenute: number | null;
}

export interface QuadroPagamenti {
  oggi: string;
  rate: RataCliente[];
  sal_cliente: SalCliente[];
  uscite: Uscita[];
  mezzi_stimati: { costo: number | null; mezzi: number | null; giorni: number | null } | null;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const tondo = (v: number) => Math.round(v * 100) / 100;

/** Numeri dal JSON del database (numeric arriva come numero o stringa). */
export function normalizzaQuadro(raw: unknown): QuadroPagamenti | null {
  if (!raw || typeof raw !== "object") return null;
  const q = raw as Partial<QuadroPagamenti>;
  return {
    oggi: String(q.oggi ?? ""),
    rate: (q.rate ?? []).map((r) => ({ ...r, amount: n(r.amount), is_paid: !!r.is_paid, scaduta: !!r.scaduta })),
    sal_cliente: (q.sal_cliente ?? []).map((s) => ({ ...s, importo_totale: s.importo_totale == null ? null : n(s.importo_totale) })),
    uscite: (q.uscite ?? []).map((u) => ({
      ...u,
      importo: n(u.importo), pagato: n(u.pagato), residuo: n(u.residuo), quota_pct: n(u.quota_pct),
      contratto: u.contratto == null ? null : n(u.contratto),
      maturato_lordo: u.maturato_lordo == null ? null : n(u.maturato_lordo),
      ritenute: u.ritenute == null ? null : n(u.ritenute),
    })),
    mezzi_stimati: q.mezzi_stimati ?? null,
  };
}

export interface TotaliQuadro {
  incassato: number;
  daIncassare: number;
  incassoScaduto: number;
  pagato: number;
  daPagare: number;
  pagamentoScaduto: number;
  /** Ordini d'acquisto senza fattura: soldi impegnati che non sono ancora un debito. */
  impegnato: number;
  /** Incassato − pagato: quanto la commessa ha messo (o tolto) in cassa finora. */
  cassa: number;
}

export function totaliQuadro(q: Pick<QuadroPagamenti, "rate" | "uscite">): TotaliQuadro {
  const t = { incassato: 0, daIncassare: 0, incassoScaduto: 0, pagato: 0, daPagare: 0, pagamentoScaduto: 0, impegnato: 0 };
  for (const r of q.rate) {
    if (r.is_paid) t.incassato += r.amount;
    else {
      t.daIncassare += r.amount;
      if (r.scaduta) t.incassoScaduto += r.amount;
    }
  }
  for (const u of q.uscite) {
    if (u.stato === "fattura_da_arrivare") { t.impegnato += u.importo; continue; }
    t.pagato += u.pagato;
    t.daPagare += u.residuo;
    if (u.stato === "scaduto") t.pagamentoScaduto += u.residuo;
  }
  const r = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, tondo(v)])) as Omit<TotaliQuadro, "cassa">;
  return { ...r, cassa: tondo(r.incassato - r.pagato) };
}

export const CATEGORIE: Array<{ value: CategoriaUscita; label: string }> = [
  { value: "materiali", label: "Materiali e fornitori" },
  { value: "subappalti", label: "Subappalti e ditte" },
  { value: "professionisti", label: "Professionisti" },
  { value: "noleggi", label: "Noleggi e mezzi" },
  { value: "extra", label: "Costi extra" },
];

export const STATO_USCITA: Record<StatoUscita, { label: string; classe: string }> = {
  scaduto: { label: "Scaduto", classe: "bg-red-100 text-red-800" },
  da_pagare: { label: "Da pagare", classe: "bg-amber-100 text-amber-800" },
  parziale: { label: "Pagato in parte", classe: "bg-amber-50 text-amber-800" },
  fattura_da_arrivare: { label: "Fattura da arrivare", classe: "bg-blue-50 text-blue-800" },
  da_maturare: { label: "Da maturare", classe: "bg-slate-100 text-slate-700" },
  pagato: { label: "Pagato", classe: "bg-green-50 text-green-800" },
};

export type FiltroUscite = "aperte" | "scadute" | "tutte" | CategoriaUscita;

export function filtraUscite(uscite: Uscita[], filtro: FiltroUscite): Uscita[] {
  if (filtro === "tutte") return uscite;
  if (filtro === "aperte") return uscite.filter((u) => u.stato !== "pagato");
  if (filtro === "scadute") return uscite.filter((u) => u.stato === "scaduto");
  return uscite.filter((u) => u.categoria === filtro);
}

/** Quante voci per categoria e quanto resta da pagare: per i pulsanti del filtro. */
export function riepilogoCategorie(uscite: Uscita[]) {
  return CATEGORIE.map((c) => {
    const righe = uscite.filter((u) => u.categoria === c.value);
    return { ...c, voci: righe.length, residuo: tondo(righe.reduce((s, u) => s + (u.stato === "fattura_da_arrivare" ? 0 : u.residuo), 0)) };
  }).filter((c) => c.voci > 0);
}

/** Che documento c'è dietro la riga, in parole. */
export function documentoUscita(u: Uscita): string {
  if (u.origine_tipo === "oda") return "Fattura da arrivare";
  if (u.origine_tipo === "subappalto") return u.fatture ?? "Nessun SAL";
  if (u.fatture) return `Fattura ${u.fatture}`;
  if (u.senza_fattura) return u.ha_ricevuta ? "Senza fattura · ricevuta allegata" : "Senza fattura";
  return "Fattura non collegata";
}

export function statoRata(r: RataCliente): { label: string; classe: string } {
  if (r.is_paid) return { label: "Incassata", classe: "bg-green-50 text-green-800" };
  if (r.scaduta) return { label: "Scaduta", classe: "bg-red-100 text-red-800" };
  return { label: "Da incassare", classe: "bg-amber-100 text-amber-800" };
}
