/**
 * Riferimenti dell'appalto e della fatturazione PA sulla commessa (lotto 3 del piano
 * docs/piano-clienti-pa-commessa-fattura.md).
 *
 * Una commessa può avere più righe (più affidamenti, lotti, progetti). Ogni riga diventerà, nel
 * lotto 5, un blocco DatiContratto / DatiOrdineAcquisto / DatiConvenzione dell'XML FatturaPA.
 *
 * Le regole qui valgono anche per il database (CHECK di order_riferimenti_pa):
 * - CIG: 10 caratteri alfanumerici (anche i vecchi SmartCIG, es. Z1A2B3C4D5);
 * - CUP: 15 caratteri, il primo è una lettera;
 * - Codice Univoco Ufficio: 6 caratteri;
 * - «non dovuto» e il codice non stanno mai insieme: niente valori finti.
 * Il formato giusto non dice che il codice sia quello dell'appalto: lo dice solo il documento.
 */

export type TipoRiferimentoPa = "contratto" | "ordine_acquisto" | "convenzione";
export type FonteRiferimentoPa = "manuale" | "contratto_generale" | "computo";

export const TIPI_RIFERIMENTO_PA: Array<{ valore: TipoRiferimentoPa; etichetta: string; tagXml: string }> = [
  { valore: "contratto", etichetta: "Contratto", tagXml: "DatiContratto" },
  { valore: "ordine_acquisto", etichetta: "Ordine d'acquisto", tagXml: "DatiOrdineAcquisto" },
  { valore: "convenzione", etichetta: "Convenzione", tagXml: "DatiConvenzione" },
];

export const etichettaTipoRiferimento = (tipo: string): string =>
  TIPI_RIFERIMENTO_PA.find((t) => t.valore === tipo)?.etichetta ?? tipo;

export const ETICHETTA_FONTE: Record<FonteRiferimentoPa, string> = {
  manuale: "scritto sulla commessa",
  contratto_generale: "dal contratto della commessa generale",
  computo: "dal computo (lavoro pubblico)",
};

/** Una riga di order_riferimenti_pa come la legge il browser. */
export interface RiferimentoPa {
  id: string;
  company_id: string;
  order_id: string;
  tipo: TipoRiferimentoPa;
  numero: string | null;
  data: string | null;
  cig: string | null;
  cig_non_dovuto: boolean;
  cig_motivo_esclusione: string | null;
  cup: string | null;
  cup_non_dovuto: boolean;
  lotto: string | null;
  determina: string | null;
  impegno_spesa: string | null;
  ufficio_id: string | null;
  codice_univoco_ufficio: string | null;
  note_fatturazione: string | null;
  fonte: FonteRiferimentoPa;
  fonte_id: string | null;
  ordinamento: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export const COLONNE_RIFERIMENTO_PA =
  "id, company_id, order_id, tipo, numero, data, cig, cig_non_dovuto, cig_motivo_esclusione, cup, cup_non_dovuto, lotto, determina, impegno_spesa, ufficio_id, codice_univoco_ufficio, note_fatturazione, fonte, fonte_id, ordinamento, created_at, updated_at, created_by";

/** La riga mentre la si scrive: tutto testo, `id` assente se è nuova. */
export interface BozzaRiferimentoPa {
  chiave: string;
  id?: string;
  tipo: TipoRiferimentoPa;
  numero: string;
  data: string;
  cig: string;
  cig_non_dovuto: boolean;
  cig_motivo_esclusione: string;
  cup: string;
  cup_non_dovuto: boolean;
  lotto: string;
  determina: string;
  impegno_spesa: string;
  ufficio_id: string | null;
  codice_univoco_ufficio: string;
  note_fatturazione: string;
  fonte: FonteRiferimentoPa;
  fonte_id: string | null;
}

let contatore = 0;
const nuovaChiave = () => `rif-${Date.now().toString(36)}-${(contatore++).toString(36)}`;

export function bozzaVuota(tipo: TipoRiferimentoPa = "contratto"): BozzaRiferimentoPa {
  return {
    chiave: nuovaChiave(), tipo, numero: "", data: "", cig: "", cig_non_dovuto: false, cig_motivo_esclusione: "",
    cup: "", cup_non_dovuto: false, lotto: "", determina: "", impegno_spesa: "", ufficio_id: null,
    codice_univoco_ufficio: "", note_fatturazione: "", fonte: "manuale", fonte_id: null,
  };
}

export function bozzaDaRiga(r: RiferimentoPa): BozzaRiferimentoPa {
  return {
    chiave: r.id, id: r.id, tipo: r.tipo, numero: r.numero ?? "", data: r.data ?? "",
    cig: r.cig ?? "", cig_non_dovuto: r.cig_non_dovuto, cig_motivo_esclusione: r.cig_motivo_esclusione ?? "",
    cup: r.cup ?? "", cup_non_dovuto: r.cup_non_dovuto, lotto: r.lotto ?? "", determina: r.determina ?? "",
    impegno_spesa: r.impegno_spesa ?? "", ufficio_id: r.ufficio_id, codice_univoco_ufficio: r.codice_univoco_ufficio ?? "",
    note_fatturazione: r.note_fatturazione ?? "", fonte: r.fonte, fonte_id: r.fonte_id,
  };
}

/** Maiuscolo e senza spazi: come lo salva il database. */
export const normalizzaCodice = (v: string | null | undefined): string => (v ?? "").replace(/\s+/g, "").toUpperCase();

export const cigValido = (v: string): boolean => /^[A-Z0-9]{10}$/.test(normalizzaCodice(v));
export const cupValido = (v: string): boolean => /^[A-Z][A-Z0-9]{14}$/.test(normalizzaCodice(v));
export const codiceUfficioValido = (v: string): boolean => /^[A-Z0-9]{6}$/.test(normalizzaCodice(v));
/** I vecchi SmartCIG (affidamenti sotto soglia) iniziano con Z, X o Y. */
export const eSmartCig = (v: string): boolean => cigValido(v) && /^[XYZ]/.test(normalizzaCodice(v));

export interface EsitoRiferimento {
  /** Impediscono il salvataggio: il database li rifiuterebbe. */
  errori: Partial<Record<"cig" | "cup" | "codice_univoco_ufficio" | "data", string>>;
  /** Cosa manca ancora: avvisi, non errori. La riga si salva comunque. */
  mancanze: string[];
}

export function controllaRiferimento(b: BozzaRiferimentoPa): EsitoRiferimento {
  const errori: EsitoRiferimento["errori"] = {};
  const mancanze: string[] = [];
  const cig = normalizzaCodice(b.cig);
  const cup = normalizzaCodice(b.cup);
  const ufficio = normalizzaCodice(b.codice_univoco_ufficio);

  if (b.cig_non_dovuto && cig) errori.cig = "Hai spuntato «CIG non dovuto»: togli il codice o la spunta.";
  else if (cig && !cigValido(cig)) errori.cig = `Il CIG ha 10 caratteri, lettere e numeri (ne hai scritti ${cig.length}).`;
  if (b.cup_non_dovuto && cup) errori.cup = "Hai spuntato «CUP non dovuto»: togli il codice o la spunta.";
  else if (cup && !cupValido(cup)) errori.cup = cup.length !== 15
    ? `Il CUP ha 15 caratteri (ne hai scritti ${cup.length}).`
    : "Il CUP comincia con una lettera, poi lettere e numeri.";
  if (ufficio && !codiceUfficioValido(ufficio)) errori.codice_univoco_ufficio = `Il Codice Univoco Ufficio ha 6 caratteri (ne hai scritti ${ufficio.length}).`;
  if (b.data && !/^\d{4}-\d{2}-\d{2}$/.test(b.data)) errori.data = "Data non valida.";

  const nome = etichettaTipoRiferimento(b.tipo).toLowerCase();
  if (!b.numero.trim()) mancanze.push(`Numero del ${nome}`);
  if (!b.data) mancanze.push(`Data del ${nome}`);
  if (!cig && !b.cig_non_dovuto) mancanze.push("CIG (o la spunta «non dovuto»)");
  if (b.cig_non_dovuto && !b.cig_motivo_esclusione.trim()) mancanze.push("Motivo per cui il CIG non è dovuto");
  if (!cup && !b.cup_non_dovuto) mancanze.push("CUP (o la spunta «non dovuto»)");
  return { errori, mancanze };
}

export const bozzaHaErrori = (b: BozzaRiferimentoPa): boolean => Object.keys(controllaRiferimento(b).errori).length > 0;

/** Una riga vuota (solo il tipo) non si salva: è un «Aggiungi» lasciato lì. */
export function bozzaVuotaDiContenuto(b: BozzaRiferimentoPa): boolean {
  return !b.numero.trim() && !b.data && !normalizzaCodice(b.cig) && !b.cig_non_dovuto && !normalizzaCodice(b.cup)
    && !b.cup_non_dovuto && !b.lotto.trim() && !b.determina.trim() && !b.impegno_spesa.trim()
    && !normalizzaCodice(b.codice_univoco_ufficio) && !b.note_fatturazione.trim() && !b.ufficio_id;
}

const testo = (v: string) => v.trim() || null;

/** I campi da scrivere nel database (senza id, company_id: lo mette il trigger). */
export function payloadRiferimento(b: BozzaRiferimentoPa, ordinamento: number) {
  return {
    tipo: b.tipo,
    numero: testo(b.numero),
    data: b.data || null,
    cig: b.cig_non_dovuto ? null : normalizzaCodice(b.cig) || null,
    cig_non_dovuto: b.cig_non_dovuto,
    cig_motivo_esclusione: b.cig_non_dovuto ? testo(b.cig_motivo_esclusione) : null,
    cup: b.cup_non_dovuto ? null : normalizzaCodice(b.cup) || null,
    cup_non_dovuto: b.cup_non_dovuto,
    lotto: testo(b.lotto),
    determina: testo(b.determina),
    impegno_spesa: testo(b.impegno_spesa),
    ufficio_id: b.ufficio_id,
    codice_univoco_ufficio: normalizzaCodice(b.codice_univoco_ufficio) || null,
    note_fatturazione: testo(b.note_fatturazione),
    fonte: b.fonte,
    fonte_id: b.fonte_id,
    ordinamento,
  };
}

export interface PianoSalvataggio {
  inserire: Array<ReturnType<typeof payloadRiferimento>>;
  aggiornare: Array<{ id: string; campi: ReturnType<typeof payloadRiferimento> }>;
  eliminare: string[];
}

/** Cosa cambia fra le righe salvate e le bozze: nuove, modificate, tolte. */
export function pianoSalvataggio(bozze: BozzaRiferimentoPa[], salvate: RiferimentoPa[]): PianoSalvataggio {
  const piene = bozze.filter((b) => !bozzaVuotaDiContenuto(b));
  const piano: PianoSalvataggio = { inserire: [], aggiornare: [], eliminare: [] };
  const tenute = new Set<string>();
  piene.forEach((b, i) => {
    const campi = payloadRiferimento(b, i);
    const originale = b.id ? salvate.find((s) => s.id === b.id) : undefined;
    if (!originale) { piano.inserire.push(campi); return; }
    tenute.add(originale.id);
    const prima = payloadRiferimento(bozzaDaRiga(originale), originale.ordinamento);
    if (JSON.stringify(prima) !== JSON.stringify(campi)) piano.aggiornare.push({ id: originale.id, campi });
  });
  salvate.forEach((s) => { if (!tenute.has(s.id)) piano.eliminare.push(s.id); });
  return piano;
}

/** Il cliente è una PA? Legge l'anagrafica di fatturazione (tipo_cliente PA o tipo_soggetto pa). */
export function anagraficaEPa(a: { tipo_cliente?: string | null; tipo_soggetto?: string | null } | null | undefined): boolean {
  if (!a) return false;
  return (a.tipo_cliente ?? "").toUpperCase() === "PA" || (a.tipo_soggetto ?? "").toLowerCase() === "pa";
}

/** CIG/CUP scritti altrove sulla stessa commessa, da importare con un clic. */
export interface FonteRiferimentoEsistente {
  fonte: Exclude<FonteRiferimentoPa, "manuale">;
  fonte_id: string;
  etichetta: string;
  cig: string | null;
  cup: string | null;
  numero: string | null;
  data: string | null;
  /** Già importata in una riga (stessa fonte o stessi codici): non si ripropone. */
  giaPresente: boolean;
  /** Il codice non rispetta il formato: va corretto prima di importarlo. */
  problemi: string[];
}

export function bozzaDaFonte(f: FonteRiferimentoEsistente): BozzaRiferimentoPa {
  return {
    ...bozzaVuota("contratto"),
    numero: f.numero ?? "", data: f.data ?? "",
    cig: normalizzaCodice(f.cig), cup: normalizzaCodice(f.cup),
    fonte: f.fonte, fonte_id: f.fonte_id,
  };
}

export function problemiFonte(cig: string | null, cup: string | null): string[] {
  const p: string[] = [];
  if (cig && !cigValido(cig)) p.push(`CIG «${cig}» non ha il formato di un CIG (10 caratteri)`);
  if (cup && !cupValido(cup)) p.push(`CUP «${cup}» non ha il formato di un CUP (15 caratteri)`);
  return p;
}

/** La fonte è già in una riga? Per id della fonte, oppure perché i codici sono gli stessi. */
export function fonteGiaPresente(righe: Array<Pick<RiferimentoPa, "fonte" | "fonte_id" | "cig" | "cup">>, fonte: string, fonteId: string, cig: string | null, cup: string | null): boolean {
  const c = normalizzaCodice(cig) || null;
  const u = normalizzaCodice(cup) || null;
  return righe.some((r) => (r.fonte === fonte && r.fonte_id === fonteId)
    || ((c || u) && (r.cig ?? null) === c && (r.cup ?? null) === u));
}

/** Righe in ordine: prima l'ordinamento scelto, poi la data di creazione. */
export const ordinaRiferimenti = <T extends Pick<RiferimentoPa, "ordinamento" | "created_at">>(righe: T[]): T[] =>
  [...righe].sort((a, b) => a.ordinamento - b.ordinamento || a.created_at.localeCompare(b.created_at));
