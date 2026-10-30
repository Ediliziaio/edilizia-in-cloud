// src/lib/orders/generali/fatture.ts
// Le fatture che nascono dalla commessa generale: dal SAL di contratto al committente,
// dalla caparra, dall'acconto o dal saldo di un'unità all'acquirente.
//
// Qui solo trasformazioni: i dati arrivano da `generale_fattura_dati` (il database ha già
// calcolato netto, ritenuta e recupero dell'anticipazione) ed escono come bozza per
// `generale_fattura_crea`, che la scrive con `documento_crea` — la stessa strada dell'editor.
// Totali e riepilogo IVA li fa `calcolaTotaliDocumento`, come l'editor: due conti diversi
// della stessa fattura sarebbero un errore che nessuno vede.
import { calcolaRiga, calcolaTotaliDocumento } from "@/lib/fatturazione/calcoli";
import { normalizzaCliente } from "@/lib/fatturazione/clienteSnapshot";
import type { ClienteSnapshot, DocumentoFiscale, RigaDocumento } from "@/types/fatturazione";

type Riga = Record<string, unknown>;

const testo = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const numero = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numeroONull = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : numero(v));
const oggetto = (v: unknown): Riga | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Riga) : null);
const arrotonda = (n: number) => Math.round(n * 100) / 100;

const euro = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
const giornoIT = (iso: string | null): string => {
  if (!iso) return "";
  const [a, m, g] = iso.slice(0, 10).split("-");
  return g && m && a ? `${g}/${m}/${a}` : iso;
};
const percentoIT = (n: number) => `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(n)}%`;

/* ─── Ciò che arriva dal database ─────────────────────────────────────── */

export type OrigineFattura = "sal" | "movimento";

export interface ClienteFattura {
  anagraficaId: string | null;
  tipo: ClienteSnapshot["tipo_cliente"];
  ragioneSociale: string | null;
  nome: string | null;
  cognome: string | null;
  partitaIva: string | null;
  codiceFiscale: string | null;
  codiceSdi: string | null;
  pec: string | null;
  via: string | null;
  cap: string | null;
  comune: string | null;
  provincia: string | null;
  nazione: string;
}

export interface FatturaLegata {
  id: string;
  numero: string | null;
  stato: string;
}

export interface SalDaFatturare {
  id: string;
  numero: number;
  stato: string;
  data: string | null;
  dal: string | null;
  al: string | null;
  lordo: number;
  ritenutaPct: number;
  ritenuta: number;
  recuperoPct: number;
  recupero: number;
  netto: number;
  riferimentoContratto: string | null;
  cig: string | null;
  cup: string | null;
  splitPayment: boolean;
  reverseCharge: boolean;
  generale: string;
}

export type TipoPagamentoUnita = "caparra" | "acconto" | "saldo";

export interface PagamentoDaFatturare {
  id: string;
  tipo: TipoPagamentoUnita;
  importo: number;
  data: string | null;
  nota: string | null;
  unita: string;
  edificio: string | null;
  piano: string | null;
  tipologia: string | null;
  mq: number | null;
  generale: string;
  indirizzo: string | null;
}

export interface DatiFatturaSal { origine: "sal"; sal: SalDaFatturare; cliente: ClienteFattura | null; esistente: FatturaLegata | null }
export interface DatiFatturaPagamento { origine: "movimento"; pagamento: PagamentoDaFatturare; cliente: ClienteFattura | null; esistente: FatturaLegata | null }
export type DatiFattura = DatiFatturaSal | DatiFatturaPagamento;

const TIPI_CLIENTE = new Set(["B2B", "B2C", "PA", "Estero"]);

function leggiCliente(v: unknown): ClienteFattura | null {
  const c = oggetto(v);
  if (!c) return null;
  const tipo = testo(c.tipo_cliente);
  return {
    anagraficaId: testo(c.anagrafica_id),
    tipo: (tipo && TIPI_CLIENTE.has(tipo) ? tipo : testo(c.partita_iva) ? "B2B" : "B2C") as ClienteFattura["tipo"],
    ragioneSociale: testo(c.ragione_sociale),
    nome: testo(c.nome),
    cognome: testo(c.cognome),
    partitaIva: testo(c.partita_iva),
    codiceFiscale: testo(c.codice_fiscale),
    codiceSdi: testo(c.codice_sdi),
    pec: testo(c.pec),
    via: testo(c.indirizzo_via),
    cap: testo(c.indirizzo_cap),
    comune: testo(c.indirizzo_comune),
    provincia: testo(c.indirizzo_provincia),
    nazione: testo(c.indirizzo_nazione)?.toUpperCase() ?? "IT",
  };
}

function leggiEsistente(v: unknown): FatturaLegata | null {
  const e = oggetto(v);
  const id = testo(e?.id);
  return e && id ? { id, numero: testo(e.numero), stato: testo(e.stato) ?? "bozza" } : null;
}

const nomeGenerale = (o: Riga) =>
  [testo(o.generale_codice), testo(o.generale_nome)].filter(Boolean).join(" — ") || "Commessa generale";

/** Il JSON di `generale_fattura_dati`, con i tipi giusti. */
export function leggiDatiFattura(raw: unknown): DatiFattura {
  const r = oggetto(raw) ?? {};
  const cliente = leggiCliente(r.cliente);
  const esistente = leggiEsistente(r.esistente);
  const s = oggetto(r.sal);
  if (s) {
    return {
      origine: "sal",
      cliente,
      esistente,
      sal: {
        id: String(s.id),
        numero: numero(s.numero),
        stato: testo(s.stato) ?? "emesso",
        data: testo(s.data),
        dal: testo(s.dal),
        al: testo(s.al),
        lordo: numero(s.lordo),
        ritenutaPct: numero(s.ritenuta_pct),
        ritenuta: numero(s.ritenuta),
        recuperoPct: numero(s.recupero_pct),
        recupero: numero(s.recupero),
        netto: numero(s.netto),
        riferimentoContratto: testo(s.riferimento_contratto),
        cig: testo(s.cig),
        cup: testo(s.cup),
        splitPayment: s.split_payment === true,
        reverseCharge: s.reverse_charge === true,
        generale: nomeGenerale(s),
      },
    };
  }
  const m = oggetto(r.movimento) ?? {};
  return {
    origine: "movimento",
    cliente,
    esistente,
    pagamento: {
      id: String(m.id ?? ""),
      tipo: (["caparra", "acconto", "saldo"].includes(String(m.tipo)) ? m.tipo : "acconto") as TipoPagamentoUnita,
      importo: numero(m.importo),
      data: testo(m.data),
      nota: testo(m.descrizione),
      unita: testo(m.unita_sigla) ?? "Unità",
      edificio: testo(m.edificio),
      piano: testo(m.piano),
      tipologia: testo(m.tipologia),
      mq: numeroONull(m.mq),
      generale: nomeGenerale(m),
      indirizzo: testo(m.indirizzo),
    },
  };
}

/* ─── Il cliente sulla fattura ───────────────────────────────────────── */

export function snapshotCliente(c: ClienteFattura | null): ClienteSnapshot | undefined {
  if (!c) return undefined;
  const nome = c.ragioneSociale ?? ([c.nome, c.cognome].filter(Boolean).join(" ") || "Cliente");
  return normalizzaCliente({
    ragione_sociale: nome,
    ...(c.nome ? { nome: c.nome } : {}),
    ...(c.cognome ? { cognome: c.cognome } : {}),
    ...(c.partitaIva ? { partita_iva: c.partitaIva } : {}),
    ...(c.codiceFiscale ? { codice_fiscale: c.codiceFiscale } : {}),
    ...(c.codiceSdi ? { codice_sdi: c.codiceSdi } : {}),
    ...(c.pec ? { pec: c.pec } : {}),
    ...(c.via ? { indirizzo_via: c.via } : {}),
    ...(c.cap ? { indirizzo_cap: c.cap } : {}),
    ...(c.comune ? { indirizzo_comune: c.comune } : {}),
    ...(c.provincia ? { indirizzo_provincia: c.provincia } : {}),
    indirizzo_nazione: c.nazione,
    tipo_cliente: c.tipo,
  });
}

/* ─── La bozza dal SAL di contratto ──────────────────────────────────── */

export type AliquotaSal = "22" | "10" | "4";

export const ALIQUOTE_SAL: Array<{ valore: AliquotaSal; etichetta: string }> = [
  { valore: "22", etichetta: "22% — ordinaria" },
  { valore: "10", etichetta: "10% — es. manutenzione o costruzione di abitazioni" },
  { valore: "4", etichetta: "4% — es. prima casa, barriere architettoniche" },
];

export const CAUSALE_REVERSE_CHARGE =
  "Inversione contabile — prestazioni rese nel settore edile in regime di subappalto, art. 17 comma 6 lettera a) del DPR 633/72";
export const CAUSALE_SPLIT_PAYMENT = "Scissione dei pagamenti — art. 17-ter del DPR 633/72";

/** Il riferimento d'ordine dell'XML (IdDocumento) ha al massimo 20 caratteri. */
const idDocumento = (s: string) => s.slice(0, 20);

/**
 * La bozza di fattura di un SAL di contratto.
 *
 * L'imponibile è il **netto** del SAL (lordo − ritenuta di garanzia − recupero
 * dell'anticipazione): è quanto il committente paga per questo stato di avanzamento.
 * La ritenuta si fattura allo svincolo, l'anticipazione è già stata fatturata quando
 * è stata data. Il conto sta nella descrizione, così chi riceve la fattura lo ritrova.
 *
 * Reverse charge (dal contratto) → aliquota 0 con natura N6.3 e dicitura di legge;
 * split payment → esigibilità «S», il committente paga solo l'imponibile.
 */
export function bozzaFatturaSal(d: DatiFatturaSal, aliquota: AliquotaSal = "22"): Partial<DocumentoFiscale> {
  const s = d.sal;
  const reverse = s.reverseCharge;
  const split = !reverse && s.splitPayment;
  const periodo = s.al ? ` · lavori ${s.dal ? `dal ${giornoIT(s.dal)} ` : ""}al ${giornoIT(s.al)}` : "";
  const conto = [
    `lavori del SAL ${euro(s.lordo)}`,
    s.ritenuta ? `ritenuta di garanzia ${percentoIT(s.ritenutaPct)} −${euro(s.ritenuta)}` : null,
    s.recupero ? `recupero anticipazione ${percentoIT(s.recuperoPct)} −${euro(s.recupero)}` : null,
  ].filter(Boolean).join("; ");

  const riga: RigaDocumento = calcolaRiga({
    id: `sal-${s.id}`,
    numero_linea: 1,
    descrizione: `SAL n. ${s.numero} — ${s.generale}${periodo} (${conto})`,
    quantita: 1,
    unita_misura: "corpo",
    prezzo_unitario: arrotonda(s.netto),
    imponibile: 0,
    aliquota_iva: reverse ? "0" : aliquota,
    ...(reverse ? { natura_iva: "N6_3" as const } : {}),
    imposta: 0,
    totale_riga: 0,
  });
  const totali = calcolaTotaliDocumento([riga], {
    splitPayment: split,
    esigibilitaDefault: split ? "S" : "I",
  });

  const causale = [
    `SAL n. ${s.numero} del contratto ${s.riferimentoContratto ?? s.generale}`,
    ...(s.cig || s.cup ? [[s.cig ? `CIG ${s.cig}` : null, s.cup ? `CUP ${s.cup}` : null].filter(Boolean).join(" — ")] : []),
    ...(reverse ? [CAUSALE_REVERSE_CHARGE] : []),
    ...(split ? [CAUSALE_SPLIT_PAYMENT] : []),
  ];
  const cliente = snapshotCliente(d.cliente);

  return {
    tipo: cliente?.tipo_cliente === "PA" ? "fattura_pa" : "fattura",
    ...(cliente ? { cliente_snapshot: { ...cliente, ...(s.cig ? { cig: s.cig } : {}), ...(s.cup ? { cup: s.cup } : {}) } } : {}),
    righe: [riga],
    riepilogo_iva: totali.riepilogo_iva,
    subtotale: totali.subtotale,
    imponibile_totale: totali.imponibile_totale,
    iva_totale: totali.iva_totale,
    totale_documento: totali.totale_documento,
    totale_da_pagare: totali.totale_da_pagare,
    ...(split ? { esigibilita_iva: "S" as const } : {}),
    ...(s.cig ? { cig: s.cig } : {}),
    ...(s.cup ? { cup: s.cup } : {}),
    ...(s.riferimentoContratto
      ? { riferimenti_ordine: [{ IdDocumento: idDocumento(s.riferimentoContratto) }], codice_commessa_convenzione: s.riferimentoContratto }
      : {}),
    causale,
    note_documento: causale[0],
  };
}

/* ─── La bozza dal pagamento di un'unità ─────────────────────────────── */

export type IvaVendita = "10" | "4" | "22" | "esente";

export const IVA_VENDITA: Array<{ valore: IvaVendita; etichetta: string; aiuto: string }> = [
  { valore: "10", etichetta: "10%", aiuto: "Abitazione non di lusso venduta dall'impresa che l'ha costruita o ristrutturata." },
  { valore: "4", etichetta: "4% — prima casa", aiuto: "Solo se l'acquirente ha dichiarato i requisiti «prima casa»." },
  { valore: "22", etichetta: "22%", aiuto: "Abitazione di lusso (A/1, A/8, A/9) o immobile non abitativo." },
  { valore: "esente", etichetta: "Esente", aiuto: "Art. 10 n. 8-bis DPR 633/72: vendita dopo 5 anni dalla fine dei lavori, senza opzione per l'IVA." },
];

const CAUSALE_IVA_VENDITA: Record<IvaVendita, string> = {
  "10": "IVA 10% — Tabella A, parte III, n. 127-undecies, DPR 633/72",
  "4": "IVA 4% — agevolazione «prima casa», Tabella A, parte II, n. 21, DPR 633/72",
  "22": "IVA ordinaria 22%",
  esente: "Operazione esente IVA — art. 10, comma 1, n. 8-bis, DPR 633/72",
};

export const NOMI_PAGAMENTO: Record<TipoPagamentoUnita, string> = {
  caparra: "Caparra confirmatoria",
  acconto: "Acconto prezzo",
  saldo: "Saldo prezzo",
};

/**
 * La caparra confirmatoria è un risarcimento anticipato, non un corrispettivo:
 * di norma non si fattura finché, al rogito, non diventa acconto sul prezzo.
 */
export const AVVISO_CAPARRA =
  "La caparra confirmatoria di norma non si fattura: è fuori campo IVA finché al rogito non diventa acconto sul prezzo. Se il compromesso la chiama «acconto» o «caparra in conto prezzo», allora sì: in quel caso registrala come acconto.";

/** Come si chiama l'unità nella fattura: sigla, edificio, piano, m², dove. */
export function descrizioneUnita(p: PagamentoDaFatturare): string {
  const mq = p.mq ? `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(p.mq)} m² commerciali` : null;
  return [
    `unità ${p.unita}`,
    p.tipologia,
    p.edificio ? `edificio ${p.edificio}` : null,
    p.piano ? `piano ${p.piano}` : null,
    mq,
  ].filter(Boolean).join(", ") + ` — ${p.generale}${p.indirizzo ? `, ${p.indirizzo}` : ""}`;
}

/**
 * La bozza di fattura di un pagamento dell'acquirente.
 *
 * `ivaInclusa`: l'importo registrato è quello versato, quindi comprende già l'IVA
 * (è il caso normale di acconti e saldo). Si scorpora: imponibile = importo / (1 + aliquota).
 */
export function bozzaFatturaPagamento(
  d: DatiFatturaPagamento,
  iva: IvaVendita = "10",
  ivaInclusa = true,
): Partial<DocumentoFiscale> {
  const p = d.pagamento;
  const esente = iva === "esente";
  const aliquota = esente ? 0 : Number(iva);
  const imponibile = ivaInclusa && !esente ? arrotonda(p.importo / (1 + aliquota / 100)) : arrotonda(p.importo);
  const riga = calcolaRiga({
    id: `pagamento-${p.id}`,
    numero_linea: 1,
    descrizione: `${NOMI_PAGAMENTO[p.tipo]}${p.data ? ` del ${giornoIT(p.data)}` : ""} — cessione ${descrizioneUnita(p)}`,
    quantita: 1,
    unita_misura: "corpo",
    prezzo_unitario: imponibile,
    imponibile: 0,
    aliquota_iva: esente ? "0" : String(aliquota),
    ...(esente ? { natura_iva: "N4" as const } : {}),
    imposta: 0,
    totale_riga: 0,
  });
  // Lo scorporo può lasciare un centesimo di differenza: la riga si corregge perché il totale
  // della fattura sia esattamente l'importo versato.
  if (ivaInclusa && !esente && riga.totale_riga !== arrotonda(p.importo)) {
    const scarto = arrotonda(p.importo - riga.totale_riga);
    riga.prezzo_unitario = arrotonda(riga.prezzo_unitario + scarto);
    Object.assign(riga, calcolaRiga(riga));
  }
  const totali = calcolaTotaliDocumento([riga]);
  const causale = [
    `${NOMI_PAGAMENTO[p.tipo]} per la cessione ${descrizioneUnita(p)}`,
    CAUSALE_IVA_VENDITA[iva],
  ];
  const cliente = snapshotCliente(d.cliente);
  return {
    tipo: "fattura",
    ...(cliente ? { cliente_snapshot: cliente } : {}),
    righe: [riga],
    riepilogo_iva: totali.riepilogo_iva,
    subtotale: totali.subtotale,
    imponibile_totale: totali.imponibile_totale,
    iva_totale: totali.iva_totale,
    totale_documento: totali.totale_documento,
    totale_da_pagare: totali.totale_da_pagare,
    causale,
    note_documento: causale[0],
  };
}

/* ─── Le fatture già legate ──────────────────────────────────────────── */

export interface FatturaGenerale {
  documentoId: string;
  salId: string | null;
  movimentoId: string | null;
  numero: string | null;
  stato: string;
  data: string | null;
  totale: number;
  pagato: number;
}

export interface ElencoFattureGenerale {
  fatture: FatturaGenerale[];
  puoFatturare: boolean;
}

/** Il JSON di `generale_fatture_elenco`. */
export function leggiElencoFatture(raw: unknown): ElencoFattureGenerale {
  const r = oggetto(raw) ?? {};
  const lista = Array.isArray(r.fatture) ? r.fatture : [];
  return {
    puoFatturare: r.puo_fatturare === true,
    fatture: lista.map(oggetto).filter((f): f is Riga => !!f && !!testo(f.documento_id)).map((f) => ({
      documentoId: String(f.documento_id),
      salId: testo(f.sal_id),
      movimentoId: testo(f.movimento_id),
      numero: testo(f.numero),
      stato: testo(f.stato) ?? "bozza",
      data: testo(f.data),
      totale: numero(f.totale),
      pagato: numero(f.pagato),
    })),
  };
}

export const STATI_FATTURA: Record<string, string> = {
  bozza: "bozza",
  emessa: "emessa",
  in_invio: "in invio",
  inviata_sdi: "inviata allo SDI",
  consegnata: "consegnata",
  accettata: "accettata",
  rifiutata: "scartata",
  pagata: "pagata",
  parzialmente_pagata: "pagata in parte",
};

/** Come si chiama la fattura in un bottone o in un avviso: «Fattura FT-2026-0012 (emessa)». */
export function etichettaFattura(f: { numero: string | null; stato: string }): string {
  const numero = f.numero && !f.numero.startsWith("Bozza ") ? ` ${f.numero}` : "";
  return `Fattura${numero} (${STATI_FATTURA[f.stato] ?? f.stato})`;
}

/** La fattura viva già nata da questo SAL o pagamento, se c'è. */
export function fatturaDi(elenco: FatturaGenerale[] | undefined, chi: { salId?: string; movimentoId?: string }): FatturaGenerale | null {
  if (!elenco) return null;
  return elenco.find((f) => (chi.salId && f.salId === chi.salId) || (chi.movimentoId && f.movimentoId === chi.movimentoId)) ?? null;
}

/** L'errore della fattura in parole: i messaggi del database sono già scritti per chi legge. */
export function messaggioFattura(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  if (err?.message && ["42501", "22023", "P0001", "23505"].includes(err.code ?? "")) return err.message;
  return "La bozza di fattura non è stata preparata. Riprova tra poco.";
}
