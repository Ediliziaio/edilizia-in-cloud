// src/lib/orders/modelliPagamento.ts
/**
 * Modelli di pagamento (07/10/2026): il piano rate di un'azienda in percentuali e momenti
 * d'incasso (la firma, l'inizio lavori, un SAL, la fine lavori…). Modulo puro: nessun React,
 * nessun Supabase. Gli stessi conti stanno in SQL (`rate_da_modello`): se cambi una regola qui,
 * cambiala anche là (la prova a secco della migrazione usa gli stessi numeri dei test).
 */
import type { Installment } from "@/lib/orderUtils";
import { EVENTI_RATA, type EventoRata } from "@/lib/orders/rateEventi";

/** «Quando la commessa arriva a…» dipende da uno stato scelto sulla singola rata: non è un evento da modello. */
export type EventoModello = Exclude<EventoRata, "stato_commessa">;
export const EVENTI_MODELLO: readonly EventoModello[] = EVENTI_RATA
  .map((e) => e.value)
  .filter((v): v is EventoModello => v !== "stato_commessa");

export type TipoRataModello = "deposit" | "balance";

export interface RataModello {
  nome: string;
  /** Percentuale sul totale IVA inclusa: da 0 (esclusa) a 100, al massimo due decimali. */
  percent: number;
  tipo: TipoRataModello;
  evento: EventoModello;
  /** Solo per l'evento «al SAL n°»: il numero del SAL. */
  numero: number | null;
  /** Giorni di anticipo dell'avviso «non hai ancora incassato». */
  preavviso: number;
}

export type OrigineModelloPagamento = "azienda" | "partenza";

export interface ModelloPagamento {
  /** uuid del modello dell'azienda; quelli di partenza non ancora suoi hanno «partenza:<chiave>». */
  id: string;
  origine: OrigineModelloPagamento;
  nome: string;
  descrizione: string;
  righe: RataModello[];
}

export const PREFISSO_PARTENZA_PAGAMENTO = "partenza:";
export const MAX_RATE_MODELLO = 12;
export const MAX_NOME_MODELLO_PAGAMENTO = 80;
export const MAX_NOME_RATA = 80;

export const eModelloPagamentoDiPartenza = (id: string): boolean => id.startsWith(PREFISSO_PARTENZA_PAGAMENTO);

const rata = (nome: string, percent: number, tipo: TipoRataModello, evento: EventoModello, numero: number | null = null): RataModello => ({
  nome, percent, tipo, evento, numero, preavviso: 7,
});

export interface ModelloPagamentoDiPartenza { chiave: string; nome: string; descrizione: string; righe: RataModello[] }

/** I modelli che un'azienda trova la prima volta: li fa suoi, e da lì li cambia, li toglie, ne aggiunge. */
export const MODELLI_PAGAMENTO_DI_PARTENZA: readonly ModelloPagamentoDiPartenza[] = [
  {
    chiave: "acconto-saldo", nome: "Acconto e saldo (30/70)", descrizione: "30% alla firma, il resto a fine lavori.",
    righe: [rata("Acconto alla firma", 30, "deposit", "firma_contratto"), rata("Saldo a fine lavori", 70, "balance", "fine_lavori")],
  },
  {
    chiave: "meta-meta", nome: "Metà e metà (50/50)", descrizione: "Metà alla firma, metà a fine lavori.",
    righe: [rata("Acconto alla firma", 50, "deposit", "firma_contratto"), rata("Saldo a fine lavori", 50, "balance", "fine_lavori")],
  },
  {
    chiave: "tre-rate", nome: "Tre rate con un SAL (30/40/30)", descrizione: "Acconto alla firma, un SAL a metà lavori, saldo a fine lavori.",
    righe: [
      rata("Acconto alla firma", 30, "deposit", "firma_contratto"),
      rata("SAL 1", 40, "deposit", "sal_numero", 1),
      rata("Saldo a fine lavori", 30, "balance", "fine_lavori"),
    ],
  },
  {
    chiave: "ristrutturazione-sal", nome: "Ristrutturazione a SAL", descrizione: "20% alla firma, tre SAL, saldo a fine lavori.",
    righe: [
      rata("Acconto alla firma", 20, "deposit", "firma_contratto"),
      rata("SAL 1", 25, "deposit", "sal_numero", 1),
      rata("SAL 2", 25, "deposit", "sal_numero", 2),
      rata("SAL 3", 20, "deposit", "sal_numero", 3),
      rata("Saldo a fine lavori", 10, "balance", "fine_lavori"),
    ],
  },
  {
    chiave: "serramenti", nome: "Serramenti: ordine, merce, posa", descrizione: "40% all'ordine, 40% all'arrivo della merce, il resto alla posa.",
    righe: [
      rata("Acconto all'ordine", 40, "deposit", "firma_contratto"),
      rata("All'arrivo della merce", 40, "deposit", "merce_magazzino"),
      rata("Saldo alla posa", 20, "balance", "data_posa"),
    ],
  },
  {
    chiave: "tutto-a-fine-lavori", nome: "Tutto a fine lavori", descrizione: "Un'unica rata, a fine lavori.",
    righe: [rata("Saldo a fine lavori", 100, "balance", "fine_lavori")],
  },
];

export function modelloPagamentoDiPartenza(m: ModelloPagamentoDiPartenza): ModelloPagamento {
  return {
    id: `${PREFISSO_PARTENZA_PAGAMENTO}${m.chiave}`, origine: "partenza", nome: m.nome, descrizione: m.descrizione,
    righe: m.righe.map((r) => ({ ...r })),
  };
}

/**
 * I modelli che si offrono: quelli dell'azienda se li ha già fatti suoi (anche se li ha tolti
 * tutti); finché non lo ha fatto, quelli di partenza, dopo gli eventuali modelli che ha già
 * salvato lei (senza ripetere quelli con lo stesso nome).
 */
export function modelliPagamentoDaOffrire(
  inizializzati: boolean,
  azienda: ReadonlyArray<ModelloPagamento>,
  partenza: ReadonlyArray<ModelloPagamentoDiPartenza> = MODELLI_PAGAMENTO_DI_PARTENZA,
): ModelloPagamento[] {
  if (inizializzati) return [...azienda];
  const nomi = new Set(azienda.map((m) => m.nome.trim().toLowerCase()));
  return [...azienda, ...partenza.filter((m) => !nomi.has(m.nome.trim().toLowerCase())).map(modelloPagamentoDiPartenza)];
}

/** Cosa si manda a inizializza_modelli_pagamento per darli all'azienda. */
export interface ModelloPagamentoPerServer { nome: string; descrizione: string; righe: RataModello[] }
export function modelliPagamentoPerInizializzare(
  partenza: ReadonlyArray<ModelloPagamentoDiPartenza> = MODELLI_PAGAMENTO_DI_PARTENZA,
): ModelloPagamentoPerServer[] {
  return partenza.map((m) => ({ nome: m.nome, descrizione: m.descrizione, righe: m.righe.map((r) => ({ ...r })) }));
}

/** Quanti modelli di partenza l'azienda non ha (più), per nome: serve a «Ripristina i predefiniti». */
export function modelliPagamentoMancanti(
  azienda: ReadonlyArray<ModelloPagamento>,
  partenza: ReadonlyArray<ModelloPagamentoDiPartenza> = MODELLI_PAGAMENTO_DI_PARTENZA,
): number {
  const nomi = new Set(azienda.map((m) => m.nome.trim().toLowerCase()));
  return partenza.filter((m) => !nomi.has(m.nome.trim().toLowerCase())).length;
}

// ── dalle due tabelle ai modelli ────────────────────────────────────────────
export interface RigaModelloPagamento { id: string; name: string; hint: string | null; position: number }
export interface RigaRataModelloPagamento {
  id: string; template_id: string; position: number; label: string; type: string;
  percent: number | string; trigger_evento: string; trigger_numero: number | null; giorni_preavviso: number;
}

const eventoModello = (v: string): EventoModello => (EVENTI_MODELLO as readonly string[]).includes(v) ? (v as EventoModello) : "data_fissa";

export function assemblaModelliPagamento(
  modelli: ReadonlyArray<RigaModelloPagamento>,
  righe: ReadonlyArray<RigaRataModelloPagamento>,
): ModelloPagamento[] {
  const perPosizione = <T extends { position: number }>(a: T, b: T) => a.position - b.position;
  const perModello = new Map<string, RigaRataModelloPagamento[]>();
  for (const r of righe) perModello.set(r.template_id, [...(perModello.get(r.template_id) ?? []), r]);
  return [...modelli].sort(perPosizione).map((m): ModelloPagamento => ({
    id: m.id, origine: "azienda", nome: m.name, descrizione: m.hint ?? "",
    righe: [...(perModello.get(m.id) ?? [])].sort(perPosizione).map((r): RataModello => ({
      nome: r.label,
      percent: Number(r.percent) || 0,
      tipo: r.type === "balance" ? "balance" : "deposit",
      evento: eventoModello(r.trigger_evento),
      numero: r.trigger_numero ?? null,
      preavviso: Number.isFinite(Number(r.giorni_preavviso)) ? Number(r.giorni_preavviso) : 7,
    })),
  }));
}

// ── come si legge ───────────────────────────────────────────────────────────
const QUANDO: Record<EventoModello, string> = {
  data_fissa: "a una data da scegliere",
  firma_contratto: "alla firma del contratto",
  accettazione_preventivo: "all'accettazione del preventivo",
  merce_magazzino: "all'arrivo della merce",
  consegna_cantiere: "alla consegna in cantiere",
  inizio_lavori: "all'inizio dei lavori",
  data_posa: "alla posa",
  sal_numero: "al SAL",
  fine_lavori: "a fine lavori",
  fattura_acconto: "alla fattura di acconto",
  fattura_saldo: "alla fattura di saldo",
};

/** «alla firma del contratto» · «al SAL n. 2». */
export function quandoRata(evento: EventoModello, numero: number | null): string {
  if (evento === "sal_numero") return numero ? `al SAL n. ${numero}` : "al SAL";
  return QUANDO[evento];
}

/** Come si legge il momento d'incasso di una rata qualsiasi, anche quelle che nei modelli non ci sono (lo stato della commessa). */
export function quandoSiIncassa(evento: string | null | undefined, numero: number | null | undefined): string {
  if (!evento || evento === "data_fissa") return "a una data precisa";
  if (evento === "stato_commessa") return "quando la commessa arriva allo stato scelto";
  if ((EVENTI_MODELLO as readonly string[]).includes(evento)) return quandoRata(evento as EventoModello, numero ?? null);
  return "a una data precisa";
}

const percentuale = (p: number): string => `${Number.isInteger(p) ? p : String(p).replace(".", ",")}%`;

/** «30% alla firma del contratto · 40% al SAL n. 1 · 30% a fine lavori». */
export function riepilogoModello(righe: ReadonlyArray<Pick<RataModello, "percent" | "evento" | "numero">>): string {
  return righe.map((r) => `${percentuale(r.percent)} ${quandoRata(r.evento, r.numero)}`).join(" · ");
}

// ── bozza e validazione (l'editor lavora su una bozza) ──────────────────────
export interface BozzaModelloPagamento { id: string | null; nome: string; descrizione: string; righe: RataModello[] }
export interface PayloadModelloPagamento { id: string | null; nome: string; descrizione: string | null; righe: RataModello[] }
export type EsitoBozzaPagamento = { ok: true; payload: PayloadModelloPagamento } | { ok: false; errore: string };

const arrotonda2 = (n: number): number => Math.round(n * 100) / 100;

export const bozzaPagamentoVuota = (): BozzaModelloPagamento => ({
  id: null, nome: "", descrizione: "",
  righe: [rata("Acconto", 30, "deposit", "firma_contratto"), rata("Saldo", 70, "balance", "fine_lavori")],
});

/** Duplicare un modello dà una bozza nuova, «Copia di …»; modificarlo ne tiene l'id. */
export function bozzaPagamentoDaModello(m: ModelloPagamento, comeCopia: boolean): BozzaModelloPagamento {
  return {
    id: comeCopia ? null : m.id,
    nome: comeCopia ? `Copia di ${m.nome}`.slice(0, MAX_NOME_MODELLO_PAGAMENTO) : m.nome,
    descrizione: m.descrizione,
    righe: m.righe.map((r) => ({ ...r })),
  };
}

/** Tutte le rate sono acconti, tranne l'ultima: è il saldo. */
export function normalizzaTipi(righe: ReadonlyArray<RataModello>): RataModello[] {
  return righe.map((r, i) => ({ ...r, tipo: i === righe.length - 1 ? "balance" : "deposit" }));
}

export function sommaPercentuali(righe: ReadonlyArray<Pick<RataModello, "percent">>): number {
  return arrotonda2(righe.reduce((s, r) => s + (Number.isFinite(r.percent) ? r.percent : 0), 0));
}

/** Mette sull'ultima rata quello che manca per arrivare a 100 (se si può: resta tra 0 e 100). */
export function mettiIlResto(righe: ReadonlyArray<RataModello>): RataModello[] {
  if (righe.length === 0) return [];
  const altre = sommaPercentuali(righe.slice(0, -1));
  const resto = arrotonda2(100 - altre);
  if (resto <= 0 || resto > 100) return [...righe];
  return righe.map((r, i) => (i === righe.length - 1 ? { ...r, percent: resto } : r));
}

/** Una rata «al SAL» senza numero prende il primo libero. */
export function numeraSal(righe: ReadonlyArray<RataModello>): RataModello[] {
  const usati = new Set(righe.filter((r) => r.evento === "sal_numero" && r.numero).map((r) => r.numero));
  let prossimo = 1;
  return righe.map((r) => {
    if (r.evento !== "sal_numero" || r.numero) return r;
    while (usati.has(prossimo)) prossimo += 1;
    usati.add(prossimo);
    return { ...r, numero: prossimo };
  });
}

export function validaBozzaPagamento(b: BozzaModelloPagamento): EsitoBozzaPagamento {
  const nome = b.nome.trim();
  if (!nome) return { ok: false, errore: "Dai un nome al modello." };
  if (nome.length > MAX_NOME_MODELLO_PAGAMENTO) return { ok: false, errore: `Il nome è troppo lungo (massimo ${MAX_NOME_MODELLO_PAGAMENTO} caratteri).` };
  if (b.righe.length === 0) return { ok: false, errore: "Un modello ha almeno una rata." };
  if (b.righe.length > MAX_RATE_MODELLO) return { ok: false, errore: `Troppe rate: al massimo ${MAX_RATE_MODELLO}.` };
  const righe = normalizzaTipi(b.righe).map((r) => ({
    ...r, nome: r.nome.trim(), percent: arrotonda2(r.percent), numero: r.evento === "sal_numero" ? r.numero : null,
  }));
  for (const [i, r] of righe.entries()) {
    const n = i + 1;
    if (!r.nome || r.nome.length > MAX_NOME_RATA) return { ok: false, errore: `Dai un nome alla rata ${n} (massimo ${MAX_NOME_RATA} caratteri).` };
    if (!(r.percent > 0 && r.percent <= 100)) return { ok: false, errore: `La percentuale della rata ${n} va da 0 a 100.` };
    if (!Number.isInteger(r.preavviso) || r.preavviso < 0 || r.preavviso > 90) return { ok: false, errore: `Il preavviso della rata ${n} va da 0 a 90 giorni.` };
    if (r.evento === "sal_numero" && !(r.numero && Number.isInteger(r.numero) && r.numero >= 1 && r.numero <= 99)) {
      return { ok: false, errore: `Scrivi quale SAL è la rata ${n} (da 1 a 99).` };
    }
  }
  const sal = righe.filter((r) => r.evento === "sal_numero").map((r) => r.numero);
  if (new Set(sal).size !== sal.length) return { ok: false, errore: "Due rate sono lo stesso SAL: ogni SAL ha la sua rata." };
  const somma = sommaPercentuali(righe);
  if (Math.abs(somma - 100) > 0.01) return { ok: false, errore: `Le percentuali devono sommare 100: ora fanno ${String(somma).replace(".", ",")}.` };
  return { ok: true, payload: { id: b.id, nome, descrizione: b.descrizione.trim() || null, righe } };
}

// ── dal modello alle rate ───────────────────────────────────────────────────
const centesimi = (euro: number): number => Math.round((Number.isFinite(euro) ? euro : 0) * 100);

/** La quota di un totale (in centesimi) per una percentuale con al massimo due decimali, in centesimi interi. */
function quotaCentesimi(totaleCentesimi: number, percent: number): number {
  return Math.round((totaleCentesimi * Math.round(percent * 100)) / 10000);
}

/**
 * Dal modello e dal totale IVA inclusa alle rate della commessa. Ogni rata è la sua percentuale
 * arrotondata al centesimo; l'ultima prende il resto, così la somma torna sempre al totale
 * (stesso conto di `rate_da_modello` in SQL). La percentuale resta sulla rata: serve al modulo
 * di nuova commessa per ricalcolare gli importi se cambia il totale.
 */
export function rateDaModello(modello: Pick<ModelloPagamento, "righe">, totaleLordo: number): Installment[] {
  const totaleC = Math.max(0, centesimi(totaleLordo));
  let restoC = totaleC;
  return modello.righe.map((r, i): Installment => {
    const ultima = i === modello.righe.length - 1;
    const importoC = ultima ? Math.max(0, restoC) : quotaCentesimi(totaleC, r.percent);
    if (!ultima) restoC -= importoC;
    return {
      position: i,
      label: r.nome,
      type: r.tipo,
      amount: importoC / 100,
      is_paid: false,
      trigger_evento: r.evento,
      trigger_numero: r.evento === "sal_numero" ? r.numero : null,
      giorni_preavviso: r.preavviso,
      percent: r.percent,
    };
  });
}

/**
 * Cambia il totale: le rate che vengono da un modello (hanno una percentuale) seguono. Quelle
 * scritte a mano non si toccano, e il saldo lo ricalcola già il modulo (totale meno le altre).
 */
export function ricalcolaRatePercentuali(rate: ReadonlyArray<Installment>, totaleLordo: number): Installment[] {
  const totaleC = Math.max(0, centesimi(totaleLordo));
  return rate.map((r) => {
    if (r.type === "balance" || r.percent == null || r.is_paid) return r;
    const amount = quotaCentesimi(totaleC, r.percent) / 100;
    return amount === r.amount ? r : { ...r, amount };
  });
}

// ── «Cambia il piano» dalla commessa ────────────────────────────────────────
export interface EsitoCambioPiano { ok: boolean; motivo: string | null }

/**
 * Il piano di una commessa si può rifare da un modello solo finché non ha incassi, fatture o SAL
 * legati alle rate: sostituirlo li perderebbe. (Per tutto il resto c'è «Modifica» sulla commessa.)
 */
export function puoCambiarePiano(
  rate: ReadonlyArray<Pick<Installment, "id" | "is_paid" | "documento_fiscale_id">>,
  rateConSal: ReadonlySet<string>,
): EsitoCambioPiano {
  if (rate.some((r) => r.is_paid)) return { ok: false, motivo: "Ci sono rate già incassate: il piano non si rifà." };
  if (rate.some((r) => r.documento_fiscale_id)) return { ok: false, motivo: "Una rata ha già la sua fattura: il piano non si rifà." };
  if (rate.some((r) => r.id && rateConSal.has(r.id))) return { ok: false, motivo: "Un SAL è già legato a una rata: il piano non si rifà." };
  return { ok: true, motivo: null };
}

export interface SaldoDaAllineare { id: string; label: string; salvato: number; calcolato: number }

/**
 * Il saldo mostrato è sempre «totale con IVA meno le altre rate» (e meno il costo della finanziaria),
 * ma nel database resta l'importo salvato: le previsioni di cassa e gli avvisi leggono quello. Se
 * non coincidono (62 commesse su 82 il 07/10/2026, quando questo piano è stato scritto), si propone di allinearlo.
 */
export function saldoDaAllineare(
  rate: ReadonlyArray<Installment>,
  totaleLordo: number,
  costoFinanziaria = 0,
): SaldoDaAllineare | null {
  const saldi = rate.filter((r) => r.type === "balance");
  if (saldi.length === 0 || totaleLordo <= 0) return null;
  const finale = saldi.reduce((a, b) => (b.position > a.position ? b : a));
  if (!finale.id || finale.is_paid) return null;
  const altre = rate.filter((r) => r !== finale).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const calcolato = Math.max(0, arrotonda2(totaleLordo - altre - costoFinanziaria));
  const salvato = arrotonda2(Number(finale.amount) || 0);
  if (Math.abs(salvato - calcolato) <= 1) return null;
  return { id: finale.id, label: finale.label, salvato, calcolato };
}

/** La rata nel formato di order_rate_sostituisci. */
export function rataPerServer(r: Installment): Record<string, unknown> {
  return {
    // Con l'id la rata esistente si aggiorna al suo posto e tiene i suoi legami (fattura, SAL); senza, il piano si riscrive.
    ...(r.id ? { id: r.id } : {}),
    position: r.position, label: r.label, type: r.type, amount: r.amount, is_paid: r.is_paid,
    paid_date: r.paid_date ?? null, expected_date: r.expected_date ?? null,
    trigger_evento: r.trigger_evento || "data_fissa", trigger_status_id: r.trigger_status_id ?? null,
    trigger_numero: r.trigger_numero ?? null, giorni_preavviso: r.giorni_preavviso ?? 7,
  };
}
