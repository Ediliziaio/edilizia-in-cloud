/**
 * Contabilità dei lavori pubblici (D.Lgs. 36/2023, allegato II.14) sul computo
 * contrattuale della commessa: elenco prezzi, libretto delle misure, registro
 * di contabilità, stato d'avanzamento lavori (SAL), certificato di pagamento,
 * perizia di variante. Solo calcoli: niente database, così si provano coi numeri.
 *
 * Scelte (da confermare con la stazione appaltante, sono scritte nel contratto):
 *  - il ribasso d'asta si applica all'importo complessivo dei lavori a misura e a
 *    corpo al netto della sicurezza (lordo − ribasso), come nel quadro economico;
 *    il prezzo ribassato di ogni voce si mostra arrotondato al centesimo;
 *  - gli oneri della sicurezza non subiscono il ribasso e si contabilizzano
 *    «a misura» (le voci di sicurezza registrate nel libretto, a prezzo pieno) o
 *    «in proporzione» all'avanzamento dei lavori;
 *  - ritenuta di garanzia dello 0,50% sull'importo progressivo dei lavori, svincolata
 *    a collaudo / certificato di regolare esecuzione;
 *  - l'anticipazione si recupera in proporzione a ogni SAL (stessa percentuale
 *    sull'importo dei lavori), fino a recuperarla tutta.
 */
import { cent, sezioneVoce, type SezioneQuadro } from "./quadroEconomico";

export type ModoSicurezza = "a_misura" | "proporzionale";

/** Una voce del computo contrattuale, come serve alla contabilità. */
export interface VoceContratto {
  /** Identità stabile fra contratto e varianti: la voce del contratto originario. */
  radice: string;
  voce_id: string;
  numero: string;
  tariffa: string;
  descrizione: string;
  unita_misura: string;
  quantita: number;
  prezzo: number;
  importo: number;
  is_sicurezza: boolean;
  a_corpo: boolean;
  nuovo_prezzo: boolean;
  ordine: number;
}

/** Voce del computo come la legge l'app (sottoinsieme di VoceComputo + colonne nuove). */
export interface VoceComputoContabile {
  id: string;
  ordine: number;
  numero_ordine: string | null;
  codice_voce?: string | null;
  codice_tariffa: string | null;
  codice_prezzario?: string | null;
  descrizione_breve: string;
  descrizione_estesa: string | null;
  unita_misura: string | null;
  quantita: number | null;
  prezzo_unitario_computo: number | null;
  importo_computo: number | null;
  super_categoria?: string | null;
  categoria?: string | null;
  sotto_categoria?: string | null;
  is_sicurezza: boolean;
  a_corpo: boolean;
  quadro_voce?: SezioneQuadro | null;
  voce_origine_id?: string | null;
  nuovo_prezzo?: boolean | null;
}

export const radiceVoce = (v: Pick<VoceComputoContabile, "id" | "voce_origine_id">) => v.voce_origine_id || v.id;

/** Le sole voci di lavoro (le somme a disposizione restano fuori dalla contabilità). */
export function vociContratto(voci: VoceComputoContabile[]): VoceContratto[] {
  return voci
    .filter(v => sezioneVoce(v) === "lavori")
    .sort((a, b) => a.ordine - b.ordine)
    .map(v => ({
      radice: radiceVoce(v), voce_id: v.id,
      numero: v.numero_ordine || v.codice_voce || String(v.ordine),
      tariffa: v.codice_tariffa || v.codice_prezzario || "",
      descrizione: v.descrizione_estesa || v.descrizione_breve,
      unita_misura: v.unita_misura ?? "",
      quantita: Number(v.quantita) || 0,
      prezzo: Number(v.prezzo_unitario_computo) || 0,
      importo: Number(v.importo_computo) || 0,
      is_sicurezza: v.is_sicurezza, a_corpo: v.a_corpo, nuovo_prezzo: !!v.nuovo_prezzo, ordine: v.ordine,
    }));
}

/** Numero scritto all'italiana: «1.234,5», «4,50»; senza virgola il punto è il decimale («4.50»). Vuoto = null, illeggibile = NaN. */
export function numeroDigitato(s: string): number | null {
  let t = s.trim().replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

const r4 = (n: number) => Math.round((n + Math.sign(n) * Number.EPSILON) * 10000) / 10000;
const perc = (p: number | null | undefined) => Math.min(100, Math.max(0, Number(p) || 0));

/** Prezzo al netto del ribasso; la sicurezza resta piena. */
export function prezzoRibassato(prezzo: number, ribassoPercentuale: number | null | undefined, sicurezza: boolean): number {
  return sicurezza ? cent(prezzo) : cent(prezzo * (1 - perc(ribassoPercentuale) / 100));
}

// ── Elenco prezzi ────────────────────────────────────────────────────────────

export interface RigaElencoPrezzi {
  numero: string; tariffa: string; descrizione: string; unita_misura: string;
  prezzo: number; prezzo_ribassato: number; is_sicurezza: boolean; nuovo_prezzo: boolean;
}

/** Elenco prezzi contrattuale: un prezzo per tariffa (la prima voce che la usa), nuovi prezzi in fondo. */
export function elencoPrezzi(voci: VoceContratto[], ribassoPercentuale: number | null | undefined): RigaElencoPrezzi[] {
  const visti = new Set<string>();
  const righe: RigaElencoPrezzi[] = [];
  for (const v of [...voci].sort((a, b) => Number(a.nuovo_prezzo) - Number(b.nuovo_prezzo) || a.ordine - b.ordine)) {
    const chiave = `${v.tariffa || v.numero}|${v.prezzo}|${v.unita_misura}|${v.is_sicurezza}`;
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    righe.push({ numero: v.numero, tariffa: v.tariffa, descrizione: v.descrizione, unita_misura: v.unita_misura,
      prezzo: v.prezzo, prezzo_ribassato: prezzoRibassato(v.prezzo, ribassoPercentuale, v.is_sicurezza),
      is_sicurezza: v.is_sicurezza, nuovo_prezzo: v.nuovo_prezzo });
  }
  return righe;
}

// ── Libretto delle misure ────────────────────────────────────────────────────

export interface RigaMisura {
  descrizione?: string | null;
  parti_uguali?: number | null;
  lunghezza?: number | null;
  larghezza?: number | null;
  altezza_peso?: number | null;
  /** Se scritta a mano vale lei; altrimenti par.ug. × lung. × larg. × H. */
  quantita?: number | null;
}

/** Quantità di una riga di misura: i fattori presenti moltiplicati fra loro. */
export function quantitaRiga(r: RigaMisura): number {
  if (r.quantita != null && Number.isFinite(Number(r.quantita))) return r4(Number(r.quantita));
  const fattori = [r.parti_uguali, r.lunghezza, r.larghezza, r.altezza_peso].filter((f): f is number => f != null && Number.isFinite(Number(f)));
  if (!fattori.length) return 0;
  return r4(fattori.reduce((p, f) => p * Number(f), 1));
}

export const quantitaRighe = (righe: RigaMisura[]) => r4(righe.reduce((s, r) => s + quantitaRiga(r), 0));

/** Una registrazione com'era prima e com'è dopo (lp_libretto_modifiche). */
export interface StatoRegistrazione {
  data?: string | null;
  voce_id?: string | null;
  quantita?: number | string | null;
  righe?: RigaMisura[] | null;
  annotazioni?: string | null;
  firmatario?: string | null;
  firmato_at?: string | null;
  allegati?: unknown[] | null;
}

/**
 * Cosa è cambiato, in parole: «Quantità 300 → 250», «Data 10/02/2026 → 12/02/2026»…
 * `voce` traduce l'id della voce nel suo numero; senza `dopo` è una cancellazione.
 */
export function riassuntoModificaLibretto(prima: StatoRegistrazione, dopo: StatoRegistrazione | null, voce: (id: string) => string = (id) => id): string[] {
  const q = (n: unknown) => Number(n ?? 0).toLocaleString("it-IT", { maximumFractionDigits: 3 });
  const d = (s: string | null | undefined) => (s ? new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString("it-IT") : "—");
  if (!dopo) return [`Eliminata (era ${q(prima.quantita)}, voce ${voce(prima.voce_id ?? "")})`];
  const out: string[] = [];
  if (prima.voce_id !== dopo.voce_id) out.push(`Voce ${voce(prima.voce_id ?? "")} → ${voce(dopo.voce_id ?? "")}`);
  if ((prima.data ?? "") !== (dopo.data ?? "")) out.push(`Data ${d(prima.data)} → ${d(dopo.data)}`);
  if (Math.abs(Number(prima.quantita ?? 0) - Number(dopo.quantita ?? 0)) > 1e-9) out.push(`Quantità ${q(prima.quantita)} → ${q(dopo.quantita)}`);
  else if (JSON.stringify(prima.righe ?? []) !== JSON.stringify(dopo.righe ?? [])) out.push("Righe di misura riscritte (stessa quantità)");
  if ((prima.annotazioni ?? "") !== (dopo.annotazioni ?? "")) out.push(dopo.annotazioni ? `Annotazioni: «${dopo.annotazioni}»` : "Annotazioni tolte");
  if ((prima.firmatario ?? "") !== (dopo.firmatario ?? "")) out.push(`Firmatario ${prima.firmatario || "—"} → ${dopo.firmatario || "—"}`);
  if (!prima.firmato_at && dopo.firmato_at) out.push("Segnata firmata");
  const fotoPrima = prima.allegati?.length ?? 0;
  const fotoDopo = dopo.allegati?.length ?? 0;
  if (fotoPrima !== fotoDopo) out.push(`Foto ${fotoPrima} → ${fotoDopo}`);
  return out;
}

export interface RegistrazioneLibretto {
  id: string;
  numero: number;
  data: string; // yyyy-mm-dd
  voce_radice: string;
  quantita: number;
  sal_id?: string | null;
}

export interface ProgressivoRegistrazione {
  id: string;
  progressivo: number;
  quantita_contratto: number;
  /** Quanto oltre la quantità di contratto (0 se dentro). */
  eccedenza: number;
}

/** Progressivo per voce di ogni registrazione, in ordine di data e numero, con l'eccedenza sul contratto. */
export function progressiviLibretto(registrazioni: RegistrazioneLibretto[], voci: VoceContratto[]): Map<string, ProgressivoRegistrazione> {
  const contratto = new Map(voci.map(v => [v.radice, v.quantita]));
  const somme = new Map<string, number>();
  const out = new Map<string, ProgressivoRegistrazione>();
  for (const r of ordinaRegistrazioni(registrazioni)) {
    const p = r4((somme.get(r.voce_radice) ?? 0) + (Number(r.quantita) || 0));
    somme.set(r.voce_radice, p);
    const q = contratto.get(r.voce_radice) ?? 0;
    out.set(r.id, { id: r.id, progressivo: p, quantita_contratto: q, eccedenza: Math.abs(p) > Math.abs(q) + 1e-9 ? r4(Math.abs(p) - Math.abs(q)) : 0 });
  }
  return out;
}

export const ordinaRegistrazioni = <T extends Pick<RegistrazioneLibretto, "data" | "numero">>(r: T[]) =>
  [...r].sort((a, b) => a.data.localeCompare(b.data) || a.numero - b.numero);

// ── Registro di contabilità ──────────────────────────────────────────────────

export interface RigaRegistro {
  radice: string; numero: string; tariffa: string; descrizione: string; unita_misura: string;
  prezzo: number; prezzo_ribassato: number; is_sicurezza: boolean;
  quantita_contratto: number;
  /** Quantità registrate fino alla data (cumulate). */
  quantita: number;
  /** quantità × prezzo di contratto (lordo, prima del ribasso). */
  importo_lordo: number;
  percentuale_eseguita: number;
}

export interface Registro {
  righe: RigaRegistro[];
  /** Lavori a misura e a corpo, sicurezza esclusa, ai prezzi di contratto. */
  lavori_lordo: number;
  ribasso_percentuale: number;
  ribasso: number;
  lavori_netti: number;
  /** Sicurezza: a misura (voci registrate) o in proporzione ai lavori. */
  sicurezza: number;
  sicurezza_modo: ModoSicurezza;
  /** Lavori netti + sicurezza: l'importo progressivo dei lavori eseguiti. */
  totale: number;
}

export interface OpzioniRegistro {
  ribasso_percentuale: number | null | undefined;
  sicurezza_modo: ModoSicurezza;
  /** Totale degli oneri della sicurezza del contratto (serve al modo proporzionale). */
  oneri_sicurezza_contratto?: number;
  /** Registrazioni fino a questa data compresa (yyyy-mm-dd); senza, tutte. */
  fino_al?: string | null;
}

export function registroContabilita(voci: VoceContratto[], registrazioni: RegistrazioneLibretto[], o: OpzioniRegistro): Registro {
  const ribassoP = perc(o.ribasso_percentuale);
  const quantita = new Map<string, number>();
  for (const r of registrazioni) {
    if (o.fino_al && r.data > o.fino_al) continue;
    quantita.set(r.voce_radice, r4((quantita.get(r.voce_radice) ?? 0) + (Number(r.quantita) || 0)));
  }
  const righe: RigaRegistro[] = voci.map(v => {
    const q = quantita.get(v.radice) ?? 0;
    return {
      radice: v.radice, numero: v.numero, tariffa: v.tariffa, descrizione: v.descrizione, unita_misura: v.unita_misura,
      prezzo: v.prezzo, prezzo_ribassato: prezzoRibassato(v.prezzo, ribassoP, v.is_sicurezza), is_sicurezza: v.is_sicurezza,
      quantita_contratto: v.quantita, quantita: q, importo_lordo: cent(q * v.prezzo),
      percentuale_eseguita: v.quantita ? Math.round((q / v.quantita) * 10000) / 100 : 0,
    };
  });
  const lavoriLordo = cent(righe.filter(r => !r.is_sicurezza).reduce((s, r) => s + r.importo_lordo, 0));
  const ribasso = cent(lavoriLordo * ribassoP / 100);
  let sicurezza: number;
  if (o.sicurezza_modo === "a_misura") {
    sicurezza = cent(righe.filter(r => r.is_sicurezza).reduce((s, r) => s + r.importo_lordo, 0));
  } else {
    const lavoriContratto = cent(voci.filter(v => !v.is_sicurezza).reduce((s, v) => s + v.importo, 0));
    const oneri = o.oneri_sicurezza_contratto ?? cent(voci.filter(v => v.is_sicurezza).reduce((s, v) => s + v.importo, 0));
    const quota = lavoriContratto ? Math.min(1, Math.max(0, lavoriLordo / lavoriContratto)) : 0;
    sicurezza = cent(oneri * quota);
  }
  const netti = cent(lavoriLordo - ribasso);
  return { righe, lavori_lordo: lavoriLordo, ribasso_percentuale: ribassoP, ribasso, lavori_netti: netti,
    sicurezza, sicurezza_modo: o.sicurezza_modo, totale: cent(netti + sicurezza) };
}

// ── Stato d'avanzamento lavori ───────────────────────────────────────────────

export const RITENUTA_GARANZIA_DEFAULT = 0.5;

export interface ParametriSal {
  /** Importo contrattuale (lavori ribassati + sicurezza): base dell'anticipazione. */
  importo_contrattuale: number;
  ritenuta_percentuale?: number | null;
  anticipazione_percentuale?: number | null;
  /** Somma degli importi dei SAL precedenti (già al netto di ritenute e recuperi). */
  sal_precedenti: number;
}

export interface CalcoloSal {
  lavori_lordo: number;
  ribasso: number;
  lavori_netti: number;
  sicurezza: number;
  totale_a_oggi: number;
  ritenuta_percentuale: number;
  ritenuta: number;
  anticipazione_percentuale: number;
  anticipazione: number;
  recupero_anticipazione: number;
  netto_a_oggi: number;
  sal_precedenti: number;
  importo_sal: number;
}

/**
 * Importo del SAL, tutto in progressivo (come si scrive nel SAL classico):
 *   totale lavori a oggi − ritenuta 0,50% − anticipazione recuperata a oggi
 *   = netto a oggi; − SAL precedenti = importo di questo SAL.
 */
export function calcolaSal(registro: Registro, p: ParametriSal): CalcoloSal {
  const ritP = p.ritenuta_percentuale == null ? RITENUTA_GARANZIA_DEFAULT : perc(p.ritenuta_percentuale);
  const antP = perc(p.anticipazione_percentuale);
  const totale = registro.totale;
  const ritenuta = cent(totale * ritP / 100);
  const anticipazione = cent((Number(p.importo_contrattuale) || 0) * antP / 100);
  const recupero = Math.min(anticipazione, cent(totale * antP / 100));
  const netto = cent(totale - ritenuta - recupero);
  const precedenti = cent(Number(p.sal_precedenti) || 0);
  return {
    lavori_lordo: registro.lavori_lordo, ribasso: registro.ribasso, lavori_netti: registro.lavori_netti,
    sicurezza: registro.sicurezza, totale_a_oggi: totale,
    ritenuta_percentuale: ritP, ritenuta, anticipazione_percentuale: antP, anticipazione, recupero_anticipazione: recupero,
    netto_a_oggi: netto, sal_precedenti: precedenti, importo_sal: cent(netto - precedenti),
  };
}

// ── Certificato di pagamento ─────────────────────────────────────────────────

export interface CertificatoPagamento {
  imponibile: number;
  aliquota_iva: number;
  iva: number;
  totale: number;
  split_payment: boolean;
  /** Quanto la stazione appaltante paga all'impresa (con lo split payment l'IVA la versa lei all'Erario). */
  da_pagare_impresa: number;
}

export function certificatoPagamento(importoSal: number, aliquotaIva: number, splitPayment: boolean): CertificatoPagamento {
  const imponibile = cent(importoSal);
  const aliquota = perc(aliquotaIva);
  const iva = cent(imponibile * aliquota / 100);
  return { imponibile, aliquota_iva: aliquota, iva, totale: cent(imponibile + iva), split_payment: splitPayment,
    da_pagare_impresa: splitPayment ? imponibile : cent(imponibile + iva) };
}

// ── Perizia di variante ──────────────────────────────────────────────────────

export type EsitoConfronto = "invariata" | "aumentata" | "ridotta" | "nuova" | "soppressa" | "prezzo_cambiato";

export interface RigaConfronto {
  radice: string; numero: string; tariffa: string; descrizione: string; unita_misura: string; is_sicurezza: boolean; nuovo_prezzo: boolean;
  quantita_contratto: number; prezzo_contratto: number; importo_contratto: number;
  quantita_variante: number; prezzo_variante: number; importo_variante: number;
  differenza: number;
  esito: EsitoConfronto;
}

export interface ConfrontoVariante {
  righe: RigaConfronto[];
  contratto: { lavori: number; sicurezza: number; importo_contrattuale: number };
  variante: { lavori: number; sicurezza: number; importo_contrattuale: number };
  /** Differenza sull'importo contrattuale (lavori ribassati + sicurezza). */
  differenza: number;
  /** Variazione % sull'importo contrattuale originario. */
  percentuale: number;
  /** Oltre il quinto d'obbligo (20%): serve l'assenso dell'impresa / atto di sottomissione. */
  oltre_quinto: boolean;
}

const totaliContratto = (voci: VoceContratto[], ribassoP: number) => {
  const lavori = cent(voci.filter(v => !v.is_sicurezza).reduce((s, v) => s + v.importo, 0));
  const sicurezza = cent(voci.filter(v => v.is_sicurezza).reduce((s, v) => s + v.importo, 0));
  return { lavori, sicurezza, importo_contrattuale: cent(lavori - cent(lavori * ribassoP / 100) + sicurezza) };
};

export function confrontoVariante(contratto: VoceContratto[], variante: VoceContratto[], ribassoPercentuale: number | null | undefined): ConfrontoVariante {
  const ribassoP = perc(ribassoPercentuale);
  const perRadice = new Map(variante.map(v => [v.radice, v]));
  const righe: RigaConfronto[] = [];
  for (const c of contratto) {
    const v = perRadice.get(c.radice);
    perRadice.delete(c.radice);
    const qv = v?.quantita ?? 0, pv = v?.prezzo ?? c.prezzo, iv = v?.importo ?? 0;
    const differenza = cent(iv - c.importo);
    let esito: EsitoConfronto = "invariata";
    if (!v || (qv === 0 && c.quantita !== 0)) esito = "soppressa";
    else if (pv !== c.prezzo) esito = "prezzo_cambiato";
    else if (differenza > 0) esito = "aumentata";
    else if (differenza < 0) esito = "ridotta";
    righe.push({ radice: c.radice, numero: c.numero, tariffa: c.tariffa, descrizione: c.descrizione, unita_misura: c.unita_misura,
      is_sicurezza: c.is_sicurezza, nuovo_prezzo: false,
      quantita_contratto: c.quantita, prezzo_contratto: c.prezzo, importo_contratto: c.importo,
      quantita_variante: qv, prezzo_variante: pv, importo_variante: iv, differenza, esito });
  }
  for (const v of [...perRadice.values()].sort((a, b) => a.ordine - b.ordine)) {
    righe.push({ radice: v.radice, numero: v.numero, tariffa: v.tariffa, descrizione: v.descrizione, unita_misura: v.unita_misura,
      is_sicurezza: v.is_sicurezza, nuovo_prezzo: v.nuovo_prezzo,
      quantita_contratto: 0, prezzo_contratto: 0, importo_contratto: 0,
      quantita_variante: v.quantita, prezzo_variante: v.prezzo, importo_variante: v.importo, differenza: cent(v.importo), esito: "nuova" });
  }
  const tc = totaliContratto(contratto, ribassoP);
  const tv = totaliContratto(variante, ribassoP);
  const differenza = cent(tv.importo_contrattuale - tc.importo_contrattuale);
  const percentuale = tc.importo_contrattuale ? Math.round((differenza / tc.importo_contrattuale) * 1_000_000) / 10_000 : 0;
  return { righe, contratto: tc, variante: tv, differenza, percentuale, oltre_quinto: Math.abs(percentuale) > 20 };
}
