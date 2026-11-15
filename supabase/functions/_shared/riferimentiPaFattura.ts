// supabase/functions/_shared/riferimentiPaFattura.ts
// Riferimenti PA sulla fattura (lotti 4 e 5 del piano docs/piano-clienti-pa-commessa-fattura.md).
//
// Sulla fattura i riferimenti dell'appalto stanno in `documenti_fiscali.riferimenti_pa`
// (jsonb, una riga per riferimento). Ogni riga diventa un blocco dell'XML FatturaPA:
//   ordine_acquisto → DatiOrdineAcquisto, contratto → DatiContratto, convenzione → DatiConvenzione
// con, nell'ordine dello schema 1.2.2: RiferimentoNumeroLinea*, IdDocumento, Data, NumItem,
// CodiceCommessaConvenzione, CodiceCUP, CodiceCIG.
//
// Ogni riga sa da dove viene (anagrafica, commessa, scritta qui) e se è stata cambiata sulla
// fattura: cambiarla qui non tocca né la commessa né l'anagrafica, e «Aggiorna dalla commessa»
// non sovrascrive ciò che è stato cambiato a mano.
//
// Logica deterministica, niente AI, niente import Deno: la usano il generatore XML, i controlli
// prima dell'invio (invia-sdi), «Crea fattura» dalla commessa e l'editor del modulo Fatturazione.
//
// Le vecchie colonne (cig, cup, codice_commessa_convenzione, riferimenti_ordine) restano: i
// documenti che non hanno righe in riferimenti_pa continuano a usarle, e per quelli nuovi
// `colonneCompatibili` le tiene allineate al primo CIG/CUP (le leggono elenchi e PDF).

type Dati = Record<string, any>;

export type TipoRiferimentoFattura = "ordine_acquisto" | "contratto" | "convenzione";
export type OrigineDato = "anagrafica" | "commessa" | "manuale";

/** Campi che arrivano dalla fonte e che si confrontano per sapere cosa è cambiato. */
export const CAMPI_RIFERIMENTO = [
  "tipo", "numero", "data", "num_item", "codice_commessa_convenzione",
  "cig", "cig_non_dovuto", "cup", "cup_non_dovuto",
] as const;
export type CampoRiferimento = typeof CAMPI_RIFERIMENTO[number];

export interface ValoriRiferimento {
  tipo: TipoRiferimentoFattura;
  /** IdDocumento: numero del contratto / ordine / convenzione. */
  numero: string | null;
  /** Data del documento, AAAA-MM-GG. */
  data: string | null;
  /** NumItem: il lotto o la voce del documento. */
  num_item: string | null;
  codice_commessa_convenzione: string | null;
  cig: string | null;
  /** CIG dichiarato «non dovuto»: nessun CIG nell'XML, e nessun valore finto. */
  cig_non_dovuto: boolean;
  cig_motivo_esclusione?: string | null;
  cup: string | null;
  cup_non_dovuto: boolean;
}

export interface RiferimentoPaFattura extends ValoriRiferimento {
  /** Identifica la riga dentro la fattura. */
  chiave: string;
  /** Righe a cui si applica (id delle righe della fattura). Vuoto = tutta la fattura. */
  righe_id: string[];
  /** Le stesse, come numero di riga (1, 2, …): si ricalcolano da righe_id. */
  numeri_linea: number[];
  origine: OrigineDato;
  /** Cambiato sulla fattura rispetto alla fonte. */
  modificato: boolean;
  /** Commessa da cui viene (anche per l'origine «anagrafica», se proposto scegliendo la commessa). */
  order_id: string | null;
  order_code: string | null;
  /** Riga della fonte: id di order_riferimenti_pa, «contratto_generale:<id>», «computo:<id>», «anagrafica:<id>». */
  sorgente_id: string | null;
  /** I valori come sono arrivati dalla fonte. */
  originale: ValoriRiferimento | null;
}

export const ETICHETTA_TIPO_RIFERIMENTO: Record<TipoRiferimentoFattura, string> = {
  contratto: "Contratto",
  ordine_acquisto: "Ordine d'acquisto",
  convenzione: "Convenzione",
};
export const TAG_XML_RIFERIMENTO: Record<TipoRiferimentoFattura, string> = {
  ordine_acquisto: "DatiOrdineAcquisto",
  contratto: "DatiContratto",
  convenzione: "DatiConvenzione",
};
/** Ordine dei blocchi nello schema (DatiGenerali): ordini, poi contratti, poi convenzioni. */
const ORDINE_BLOCCHI: TipoRiferimentoFattura[] = ["ordine_acquisto", "contratto", "convenzione"];

// ─── Formati ────────────────────────────────────────────────────────────────

export const codice = (v: unknown): string => String(v ?? "").replace(/\s+/g, "").toUpperCase();
/** CIG: 10 caratteri alfanumerici, compresi i vecchi SmartCIG (iniziano per X, Y o Z). */
export const cigValido = (v: unknown): boolean => /^[A-Z0-9]{10}$/.test(codice(v));
/** CUP: 15 caratteri, il primo è una lettera. */
export const cupValido = (v: unknown): boolean => /^[A-Z][A-Z0-9]{14}$/.test(codice(v));
/** Codice Univoco Ufficio della PA: 6 caratteri. */
export const codiceUfficioValido = (v: unknown): boolean => /^[A-Z0-9]{6}$/.test(codice(v));

const testo = (v: unknown): string | null => {
  const t = String(v ?? "").trim();
  return t ? t : null;
};
const dataIso = (v: unknown): string | null => {
  const t = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
};
const TIPI: TipoRiferimentoFattura[] = ["ordine_acquisto", "contratto", "convenzione"];
const ORIGINI: OrigineDato[] = ["anagrafica", "commessa", "manuale"];

let contatore = 0;
export function nuovaChiave(): string {
  contatore += 1;
  const casuale = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `rif-${casuale}-${contatore}`;
}

function valori(r: Dati): ValoriRiferimento {
  const cig = codice(r.cig) || null;
  const cup = codice(r.cup) || null;
  return {
    tipo: TIPI.includes(r.tipo) ? r.tipo : "contratto",
    numero: testo(r.numero ?? r.IdDocumento ?? r.id_documento),
    data: dataIso(r.data ?? r.Data),
    num_item: testo(r.num_item ?? r.lotto ?? r.NumItem),
    codice_commessa_convenzione: testo(r.codice_commessa_convenzione),
    cig,
    // «non dovuto» e il codice non stanno mai insieme.
    cig_non_dovuto: !cig && r.cig_non_dovuto === true,
    cig_motivo_esclusione: !cig && r.cig_non_dovuto === true ? testo(r.cig_motivo_esclusione) : null,
    cup,
    cup_non_dovuto: !cup && r.cup_non_dovuto === true,
  };
}

/** Legge `riferimenti_pa` com'è salvato (jsonb) in righe pulite. Tutto ciò che non è una riga cade. */
export function normalizzaRiferimenti(raw: unknown): RiferimentoPaFattura[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Dati => !!r && typeof r === "object")
    .map((r) => ({
      ...valori(r),
      chiave: testo(r.chiave) ?? nuovaChiave(),
      righe_id: Array.isArray(r.righe_id) ? r.righe_id.map(String).filter(Boolean) : [],
      numeri_linea: Array.isArray(r.numeri_linea)
        ? [...new Set<number>(r.numeri_linea.map(Number).filter((n: number) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b)
        : [],
      origine: ORIGINI.includes(r.origine) ? r.origine : "manuale",
      modificato: r.modificato === true,
      order_id: testo(r.order_id),
      order_code: testo(r.order_code),
      sorgente_id: testo(r.sorgente_id),
      originale: r.originale && typeof r.originale === "object" ? valori(r.originale) : null,
    }));
}

/** Una riga «vuota»: nessun numero, nessun codice. Non va nell'XML. */
export function riferimentoVuoto(r: ValoriRiferimento): boolean {
  return !r.numero && !r.cig && !r.cup && !r.codice_commessa_convenzione && !r.num_item && !r.data;
}

// ─── Righe della fattura ────────────────────────────────────────────────────

/**
 * Numeri di riga (1, 2, …) a cui il riferimento si applica, nell'ordine in cui le righe stanno
 * nella fattura (è l'ordine dell'XML: NumeroLinea = posizione). Gli id delle righe vincono sui
 * numeri: spostare una riga non sposta il riferimento su un'altra.
 */
export function numeriLineaDi(r: Pick<RiferimentoPaFattura, "righe_id" | "numeri_linea">, righe: Dati[]): number[] {
  if (r.righe_id.length) {
    const pos = new Map(righe.map((x, i) => [String(x?.id ?? ""), i + 1]));
    return [...new Set(r.righe_id.map((id) => pos.get(id)).filter((n): n is number => !!n))].sort((a, b) => a - b);
  }
  return r.numeri_linea;
}

/** Ricalcola numeri_linea dagli id e toglie gli id delle righe che non ci sono più. */
export function allineaRighe(riferimenti: RiferimentoPaFattura[], righe: Dati[]): RiferimentoPaFattura[] {
  const ids = new Set(righe.map((x) => String(x?.id ?? "")));
  return riferimenti.map((r) => {
    const righe_id = r.righe_id.filter((id) => ids.has(id));
    const numeri_linea = numeriLineaDi({ righe_id, numeri_linea: righe_id.length ? [] : r.numeri_linea }, righe);
    return { ...r, righe_id, numeri_linea };
  });
}

// ─── Da dove vengono ────────────────────────────────────────────────────────

/** Una riga di order_riferimenti_pa (lotto 3), come la legge il browser. */
export interface RigaRiferimentoCommessa {
  id: string;
  tipo: string;
  numero: string | null;
  data: string | null;
  cig: string | null;
  cig_non_dovuto?: boolean | null;
  cig_motivo_esclusione?: string | null;
  cup: string | null;
  cup_non_dovuto?: boolean | null;
  lotto?: string | null;
  ufficio_id?: string | null;
  codice_univoco_ufficio?: string | null;
}

/** CIG/CUP scritti sul contratto della commessa generale o sul computo (fonti vecchie). */
export interface FonteVecchia {
  fonte: "contratto_generale" | "computo";
  fonte_id: string;
  cig: string | null;
  cup: string | null;
  numero: string | null;
  data: string | null;
}

export interface CommessaDiRiferimento {
  id: string;
  codice?: string | null;
}

function riga(v: ValoriRiferimento, extra: Partial<RiferimentoPaFattura>): RiferimentoPaFattura {
  return {
    ...v,
    chiave: nuovaChiave(),
    righe_id: [],
    numeri_linea: [],
    origine: "commessa",
    modificato: false,
    order_id: null,
    order_code: null,
    sorgente_id: null,
    originale: { ...v },
    ...extra,
  };
}

export function daRigaCommessa(r: RigaRiferimentoCommessa, commessa: CommessaDiRiferimento): RiferimentoPaFattura {
  const v = valori({
    tipo: r.tipo, numero: r.numero, data: r.data, num_item: r.lotto,
    cig: r.cig, cig_non_dovuto: r.cig_non_dovuto, cig_motivo_esclusione: r.cig_motivo_esclusione,
    cup: r.cup, cup_non_dovuto: r.cup_non_dovuto,
  });
  return riga(v, { origine: "commessa", order_id: commessa.id, order_code: commessa.codice ?? null, sorgente_id: r.id });
}

/**
 * I riferimenti che la commessa propone alla fattura. In ordine di fonte, la prima che c'è:
 * 1. le righe di order_riferimenti_pa (lotto 3), nel loro ordine;
 * 2. CIG/CUP del contratto della commessa generale e del computo;
 * 3. CIG/CUP dell'anagrafica del cliente (origine «anagrafica»).
 * Una riga senza niente dentro non si propone.
 */
export function proponiDallaCommessa(
  commessa: CommessaDiRiferimento,
  righeCommessa: RigaRiferimentoCommessa[],
  fonti: FonteVecchia[] = [],
  anagrafica?: { id?: string | null; cig?: string | null; cup?: string | null } | null,
): RiferimentoPaFattura[] {
  const dalleRighe = righeCommessa.map((r) => daRigaCommessa(r, commessa)).filter((r) => !riferimentoVuoto(r) || r.cig_non_dovuto || r.cup_non_dovuto);
  if (dalleRighe.length) return dalleRighe;
  const dalleFonti = fonti
    .map((f) => riga(valori({ tipo: "contratto", numero: f.numero, data: f.data, cig: cigValido(f.cig) ? f.cig : null, cup: cupValido(f.cup) ? f.cup : null }), {
      origine: "commessa", order_id: commessa.id, order_code: commessa.codice ?? null, sorgente_id: `${f.fonte}:${f.fonte_id}`,
    }))
    .filter((r) => !riferimentoVuoto(r));
  // Due fonti con gli stessi codici (contratto e computo dello stesso appalto): una sola riga.
  const uniche = dalleFonti.filter((r, i) => dalleFonti.findIndex((s) => s.cig === r.cig && s.cup === r.cup && s.numero === r.numero) === i);
  if (uniche.length) return uniche;
  if (anagrafica && (cigValido(anagrafica.cig) || cupValido(anagrafica.cup))) {
    return [riga(valori({ tipo: "contratto", cig: cigValido(anagrafica.cig) ? anagrafica.cig : null, cup: cupValido(anagrafica.cup) ? anagrafica.cup : null }), {
      origine: "anagrafica", order_id: commessa.id, order_code: commessa.codice ?? null, sorgente_id: `anagrafica:${anagrafica.id ?? ""}`,
    })];
  }
  return [];
}

/** Riga scritta a mano sulla fattura. */
export function riferimentoManuale(tipo: TipoRiferimentoFattura = "ordine_acquisto"): RiferimentoPaFattura {
  return {
    tipo, numero: null, data: null, num_item: null, codice_commessa_convenzione: null,
    cig: null, cig_non_dovuto: false, cig_motivo_esclusione: null, cup: null, cup_non_dovuto: false,
    chiave: nuovaChiave(), righe_id: [], numeri_linea: [],
    origine: "manuale", modificato: false, order_id: null, order_code: null, sorgente_id: null, originale: null,
  };
}

/** Ufficio destinatario indicato sulle righe della commessa (il primo che ne ha uno). */
export function ufficioDallaCommessa(righeCommessa: RigaRiferimentoCommessa[]): { id: string | null; codice: string | null } | null {
  for (const r of righeCommessa) {
    const c = codice(r.codice_univoco_ufficio);
    if (r.ufficio_id || codiceUfficioValido(c)) return { id: r.ufficio_id ?? null, codice: codiceUfficioValido(c) ? c : null };
  }
  return null;
}

// ─── Modifiche sulla fattura ────────────────────────────────────────────────

const uguale = (a: unknown, b: unknown) => (a ?? null) === (b ?? null) || (a === false && b == null) || (a == null && b === false);

export function campiDiversi(a: ValoriRiferimento, b: ValoriRiferimento): CampoRiferimento[] {
  return CAMPI_RIFERIMENTO.filter((k) => !uguale(a[k], b[k]));
}

/**
 * Cambia una riga sulla fattura. Normalizza i codici, tiene «non dovuto» e codice mai insieme e
 * segna `modificato` se la riga non è più come è arrivata dalla fonte.
 */
export function modificaRiferimento(r: RiferimentoPaFattura, patch: Partial<RiferimentoPaFattura>): RiferimentoPaFattura {
  const unito = { ...r, ...patch };
  const v = valori({ ...unito, cig_non_dovuto: unito.cig_non_dovuto, cup_non_dovuto: unito.cup_non_dovuto });
  // Scrivere un codice toglie «non dovuto»; spuntare «non dovuto» toglie il codice.
  if (patch.cig_non_dovuto === true) { v.cig = null; v.cig_non_dovuto = true; v.cig_motivo_esclusione = testo(unito.cig_motivo_esclusione); }
  if (patch.cup_non_dovuto === true) { v.cup = null; v.cup_non_dovuto = true; }
  const out: RiferimentoPaFattura = { ...unito, ...v };
  out.modificato = out.origine !== "manuale" && !!out.originale && campiDiversi(out, out.originale).length > 0;
  return out;
}

/** Riporta la riga ai valori della fonte (toglie «modificato qui»). */
export function ripristinaRiferimento(r: RiferimentoPaFattura): RiferimentoPaFattura {
  if (!r.originale) return r;
  return { ...r, ...r.originale, modificato: false };
}

export interface CambioRiferimento {
  esito: "aggiunto" | "aggiornato" | "tolto" | "tenuto_modificato";
  chiave: string;
  etichetta: string;
  differenze: Array<{ campo: CampoRiferimento; fattura: unknown; commessa: unknown }>;
}

export function etichettaRiferimento(r: Pick<ValoriRiferimento, "tipo" | "numero" | "cig" | "cup">): string {
  const parti = [ETICHETTA_TIPO_RIFERIMENTO[r.tipo] ?? r.tipo, r.numero ? `n. ${r.numero}` : null, r.cig ? `CIG ${r.cig}` : null, r.cup ? `CUP ${r.cup}` : null];
  return parti.filter(Boolean).join(" · ");
}

const stessaFonte = (a: RiferimentoPaFattura, b: RiferimentoPaFattura) =>
  !!a.sorgente_id && a.sorgente_id === b.sorgente_id && (a.order_id ?? null) === (b.order_id ?? null);

/**
 * «Aggiorna dalla commessa» su una bozza: le righe di quella commessa si riallineano a ciò che
 * dice ora la commessa, tranne quelle cambiate a mano sulla fattura (restano, e la differenza si
 * mostra). Le righe scritte qui e quelle di altre commesse non si toccano. Le righe a cui si
 * applica ogni riferimento restano quelle scelte sulla fattura.
 */
export function aggiornaDallaCommessa(
  attuali: RiferimentoPaFattura[],
  proposti: RiferimentoPaFattura[],
  orderId: string,
): { risultato: RiferimentoPaFattura[]; cambi: CambioRiferimento[] } {
  const cambi: CambioRiferimento[] = [];
  const usati = new Set<string>();
  const risultato: RiferimentoPaFattura[] = [];
  for (const a of attuali) {
    const dellaCommessa = a.order_id === orderId && a.origine !== "manuale";
    if (!dellaCommessa) { risultato.push(a); continue; }
    const p = proposti.find((x) => !usati.has(x.chiave) && stessaFonte(a, x));
    if (!p) {
      if (a.modificato) {
        risultato.push(a);
        cambi.push({ esito: "tenuto_modificato", chiave: a.chiave, etichetta: etichettaRiferimento(a), differenze: [] });
      } else {
        cambi.push({ esito: "tolto", chiave: a.chiave, etichetta: etichettaRiferimento(a), differenze: [] });
      }
      continue;
    }
    usati.add(p.chiave);
    const differenze = campiDiversi(a, p).map((campo) => ({ campo, fattura: a[campo], commessa: p[campo] }));
    if (a.modificato) {
      risultato.push({ ...a, originale: p.originale });
      if (differenze.length) cambi.push({ esito: "tenuto_modificato", chiave: a.chiave, etichetta: etichettaRiferimento(a), differenze });
    } else {
      risultato.push({ ...p, chiave: a.chiave, righe_id: a.righe_id, numeri_linea: a.numeri_linea });
      if (differenze.length) cambi.push({ esito: "aggiornato", chiave: a.chiave, etichetta: etichettaRiferimento(p), differenze });
    }
  }
  for (const p of proposti) {
    if (usati.has(p.chiave)) continue;
    risultato.push(p);
    cambi.push({ esito: "aggiunto", chiave: p.chiave, etichetta: etichettaRiferimento(p), differenze: [] });
  }
  return { risultato, cambi };
}

/** Cambiando commessa: via le righe venute dalla commessa precedente (anche quelle cambiate qui). */
export function togliCommessa(attuali: RiferimentoPaFattura[], orderId: string | null | undefined): { risultato: RiferimentoPaFattura[]; tolti: RiferimentoPaFattura[] } {
  if (!orderId) return { risultato: attuali, tolti: [] };
  const tolti = attuali.filter((r) => r.order_id === orderId && r.origine !== "manuale");
  return { risultato: attuali.filter((r) => !tolti.includes(r)), tolti };
}

const equivalenti = (a: ValoriRiferimento, p: ValoriRiferimento) =>
  a.tipo === p.tipo && (a.numero ?? null) === (p.numero ?? null) && (a.cig ?? null) === (p.cig ?? null) && (a.cup ?? null) === (p.cup ?? null);

export interface ConflittoRiferimento {
  /** Riga già sulla fattura (scritta qui, dall'anagrafica o da un'altra commessa). */
  fattura: RiferimentoPaFattura;
  /** Riga che propone la commessa. */
  commessa: RiferimentoPaFattura;
  campi: Array<"cig" | "cup" | "numero">;
}

/**
 * Collegando una commessa: le righe già sulla fattura che dicono una cosa diversa dalla commessa
 * (un altro CIG, un altro CUP, un altro numero per lo stesso tipo di documento). Si mostrano, e
 * si sceglie quale tenere: niente si sostituisce da solo.
 */
export function conflittiCollegamento(attuali: RiferimentoPaFattura[], proposti: RiferimentoPaFattura[], orderId: string): ConflittoRiferimento[] {
  const out: ConflittoRiferimento[] = [];
  const altre = attuali.filter((a) => a.order_id !== orderId || a.origine === "manuale");
  for (const a of altre) {
    if (a.righe_id.length || a.numeri_linea.length) continue; // vale solo per alcune righe: non è in conflitto con tutta la fattura
    // Uguale a una proposta (stesso documento e codici): nessun conflitto, non si raddoppia.
    if (proposti.some((p) => equivalenti(a, p))) continue;
    // Si confronta con le proposte dello stesso tipo di documento; se non ce ne sono, con tutte.
    const stessoTipo = proposti.filter((p) => p.tipo === a.tipo);
    for (const p of stessoTipo.length ? stessoTipo : proposti) {
      const campi: ConflittoRiferimento["campi"] = [];
      if (a.cig && p.cig && a.cig !== p.cig) campi.push("cig");
      if (a.cup && p.cup && a.cup !== p.cup) campi.push("cup");
      if (a.tipo === p.tipo && a.numero && p.numero && a.numero !== p.numero) campi.push("numero");
      if (campi.length) { out.push({ fattura: a, commessa: p, campi }); break; }
    }
  }
  return out;
}

/**
 * Unisce i proposti della commessa ai riferimenti della fattura dopo la scelta sui conflitti:
 * `tieni` = le chiavi delle righe della fattura in conflitto da tenere (le altre in conflitto si
 * tolgono). Le righe della fattura uguali a una proposta (stessi codici) non si raddoppiano.
 */
export function collegaCommessa(
  attuali: RiferimentoPaFattura[],
  proposti: RiferimentoPaFattura[],
  orderId: string,
  tieni: string[] = [],
): RiferimentoPaFattura[] {
  const conflitti = conflittiCollegamento(attuali, proposti, orderId);
  const daTogliere = new Set(conflitti.map((c) => c.fattura.chiave).filter((k) => !tieni.includes(k)));
  const restano = attuali.filter((a) => !daTogliere.has(a.chiave) && !(a.order_id === orderId && a.origine !== "manuale"));
  const nuovi = proposti.filter((p) => !restano.some((a) => equivalenti(a, p)));
  return [...restano, ...nuovi];
}

// ─── Colonne vecchie ────────────────────────────────────────────────────────

/**
 * cig, cup e codice_commessa_convenzione dei documenti che hanno riferimenti_pa: il primo
 * valore che c'è. Li leggono elenchi, PDF e ricerche; l'XML legge solo riferimenti_pa.
 */
export function colonneCompatibili(riferimenti: RiferimentoPaFattura[]): { cig: string | null; cup: string | null; codice_commessa_convenzione: string | null } {
  const pieni = riferimenti.filter((r) => !riferimentoVuoto(r));
  return {
    cig: pieni.find((r) => r.cig)?.cig ?? null,
    cup: pieni.find((r) => r.cup)?.cup ?? null,
    codice_commessa_convenzione: pieni.find((r) => r.codice_commessa_convenzione)?.codice_commessa_convenzione ?? null,
  };
}

/** I riferimenti che il documento porta nel formato nuovo (vuoto = documento vecchio: valgono le colonne vecchie). */
export function riferimentiPaDelDocumento(doc: Dati): RiferimentoPaFattura[] {
  return normalizzaRiferimenti(doc?.riferimenti_pa);
}

// ─── XML ────────────────────────────────────────────────────────────────────

/**
 * I blocchi DatiOrdineAcquisto / DatiContratto / DatiConvenzione, nell'ordine dello schema.
 * `t(valore, max)` è il testo come lo vuole lo schema, già pronto per l'XML (testoSdi + escape);
 * `ascii` lo stesso per i campi Basic Latin (IdDocumento, NumItem, CUP, CIG).
 * Un riferimento senza numero esce con IdDocumento «0» (lo schema lo vuole, lo SDI lo accetta):
 * i controlli lo segnalano prima dell'invio.
 */
export function xmlRiferimentiPa(
  riferimenti: RiferimentoPaFattura[],
  righe: Dati[],
  t: (v: unknown, max: number) => string,
  ascii: (v: unknown, max: number) => string = t,
): string {
  const nRighe = righe.length;
  const blocchi: string[] = [];
  for (const tipo of ORDINE_BLOCCHI) {
    for (const r of riferimenti.filter((x) => x.tipo === tipo && !riferimentoVuoto(x))) {
      const linee = numeriLineaDi(r, righe).filter((n) => n >= 1 && n <= nRighe);
      const id = r.numero ?? "0";
      const conv = r.codice_commessa_convenzione && r.codice_commessa_convenzione !== r.numero ? r.codice_commessa_convenzione : null;
      const tag = TAG_XML_RIFERIMENTO[tipo];
      blocchi.push(`<${tag}>` +
        linee.map((n) => `<RiferimentoNumeroLinea>${n}</RiferimentoNumeroLinea>`).join("") +
        `<IdDocumento>${ascii(id, 20)}</IdDocumento>` +
        (r.data ? `<Data>${r.data}</Data>` : "") +
        (r.num_item ? `<NumItem>${ascii(r.num_item, 20)}</NumItem>` : "") +
        (conv ? `<CodiceCommessaConvenzione>${t(conv, 100)}</CodiceCommessaConvenzione>` : "") +
        (r.cup ? `<CodiceCUP>${ascii(r.cup, 15)}</CodiceCUP>` : "") +
        (r.cig ? `<CodiceCIG>${ascii(r.cig, 15)}</CodiceCIG>` : "") +
        `</${tag}>`);
    }
  }
  return blocchi.join("\n      ");
}

// ─── Parole per l'interfaccia ───────────────────────────────────────────────

export function etichettaOrigine(r: Pick<RiferimentoPaFattura, "origine" | "modificato" | "order_code">): string {
  if (r.origine === "manuale") return "scritto qui";
  const da = r.origine === "anagrafica" ? "dall'anagrafica" : `dalla commessa${r.order_code ? ` ${r.order_code}` : ""}`;
  return r.modificato ? `${da}, modificato qui` : da;
}
