/**
 * Le fasi della commessa prendono i tempi dal cronoprogramma del preventivo firmato (31/10/2026).
 *
 * Il preventivo da cui nasce la commessa ha le fasi del cantiere e quanto durano, in due forme:
 *   - preventivo classico e preventivatori edili: { fase, durata: «3 giorni», «2 settimane», «un mese» },
 *     una dopo l'altra;
 *   - computo: { nome, inizio: giorno lavorativo, durata: giorni lavorativi }, anche in parallelo.
 * Qui le si porta a una forma sola (giorno lavorativo d'inizio e giorni lavorativi), si calcolano le
 * date da un giorno d'inizio saltando sabati e domeniche, e `commessa_pianifica_fasi` le scrive sulle
 * fasi della commessa.
 */
import { supabase } from "@/integrations/supabase/client";
import { leggiCronoprogramma, type FaseCrono } from "@/lib/preventivi/cronoprogramma";

/** Una fase pianificabile: dal giorno lavorativo `giornoInizio` (da 1), per `giorni` giorni lavorativi. */
export interface FasePiano { nome: string; giornoInizio: number; giorni: number }

export interface PianoDellaCommessa {
  /** Da dove viene: «preventivo», «computo», «preventivo di ristrutturazione»… */
  origine: string;
  piano: FasePiano[];
  /** Fasi senza una durata leggibile: contano un giorno, e si dice. */
  senzaDurata: string[];
  /** La data d'inizio scritta nel computo (aaaa-mm-gg), se c'è. */
  inizioSuggerito: string | null;
}

/** «3 giorni» → 3, «2 settimane» → 10, «un mese» → 22: giorni LAVORATIVI. Null se non si legge. */
export function giorniLavorativiDellaDurata(durata: string | null | undefined): number | null {
  const s = String(durata ?? "").toLowerCase().replace(",", ".").replace(/\bun[oa]?\s+(?=(giorn|settiman|mes))/, "1 ");
  const m = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|a)\s*(\d+(?:\.\d+)?))?\s*(giorn|gg|g\b|settiman|sett|mes)/.exec(s);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  const medio = (a + b) / 2;
  if (!Number.isFinite(medio) || medio <= 0) return null;
  const giorni = m[3].startsWith("sett") ? medio * 5 : m[3].startsWith("mes") ? medio * 22 : medio;
  return Math.max(1, Math.round(giorni));
}

/** Preventivo classico e preventivatori edili: le fasi una dopo l'altra. */
export function pianoDaFasiDelPreventivo(fasi: FaseCrono[]): { piano: FasePiano[]; senzaDurata: string[] } {
  const piano: FasePiano[] = [];
  const senzaDurata: string[] = [];
  let giorno = 1;
  for (const f of fasi) {
    const nome = f.fase.trim();
    if (!nome) continue;
    const giorni = giorniLavorativiDellaDurata(f.durata);
    if (giorni == null) senzaDurata.push(nome);
    piano.push({ nome, giornoInizio: giorno, giorni: giorni ?? 1 });
    giorno += giorni ?? 1;
  }
  return { piano, senzaDurata };
}

/** Computo: le fasi hanno già giorno d'inizio e durata in giorni lavorativi. */
export function pianoDaCronoprogrammaComputo(raw: unknown): { piano: FasePiano[]; inizioSuggerito: string | null } {
  const c = (raw && typeof raw === "object" ? raw : {}) as { fasi?: unknown; dataInizio?: unknown };
  const fasi = Array.isArray(c.fasi) ? c.fasi : [];
  const piano = fasi
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map(f => ({ nome: String(f.nome ?? "").trim().slice(0, 160), giornoInizio: Math.max(1, Math.round(Number(f.inizio) || 1)), giorni: Math.max(1, Math.round(Number(f.durata) || 1)) }))
    .filter(f => f.nome)
    .sort((a, b) => a.giornoInizio - b.giornoInizio)
    .slice(0, 60);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(c.dataInizio ?? "").trim());
  const inizioSuggerito = m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
  return { piano, inizioSuggerito };
}

// Le date si contano in UTC: «aaaa-mm-gg» resta lo stesso giorno in ogni fuso.
const daTesto = (iso: string) => { const [a, m, g] = iso.split("-").map(Number); return new Date(Date.UTC(a, m - 1, g)); };
const aTesto = (d: Date) => d.toISOString().slice(0, 10);
const lavorativo = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;

/** Il primo giorno lavorativo da `iso` in poi (se è sabato o domenica, il lunedì dopo). */
export function primoGiornoLavorativo(iso: string): string {
  const d = daTesto(iso);
  while (!lavorativo(d)) d.setUTCDate(d.getUTCDate() + 1);
  return aTesto(d);
}

/** `iso` più `n` giorni lavorativi (n = 0 → lo stesso giorno, che deve essere lavorativo). */
export function piuGiorniLavorativi(iso: string, n: number): string {
  const d = daTesto(primoGiornoLavorativo(iso));
  let restanti = n;
  while (restanti > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (lavorativo(d)) restanti--;
  }
  return aTesto(d);
}

/** Le date di ogni fase, con il cantiere che parte il giorno `inizio` (aaaa-mm-gg). */
export function datePerFasi(piano: FasePiano[], inizio: string): Array<{ nome: string; inizio: string; fine: string }> {
  const giorno1 = primoGiornoLavorativo(inizio);
  return piano.map(f => {
    const da = piuGiorniLavorativi(giorno1, f.giornoInizio - 1);
    return { nome: f.nome, inizio: da, fine: piuGiorniLavorativi(da, f.giorni - 1) };
  });
}

/** Giorni lavorativi del cantiere intero: dal primo giorno all'ultimo di tutte le fasi. */
export const giorniDelPiano = (piano: FasePiano[]) => piano.reduce((max, f) => Math.max(max, f.giornoInizio + f.giorni - 1), 0);

const TABELLE_MODULI: Record<string, { tabella: string; nome: string }> = {
  rst: { tabella: "rst_progetti", nome: "ristrutturazione" }, bagni: { tabella: "bgn_progetti", nome: "bagno" },
  tetti: { tabella: "tet_progetti", nome: "tetto" }, clm: { tabella: "clm_progetti", nome: "climatizzazione" },
  ele: { tabella: "ele_progetti", nome: "impianto elettrico" }, idr: { tabella: "idr_progetti", nome: "termoidraulica" },
  pav: { tabella: "pav_progetti", nome: "pavimenti" }, pis: { tabella: "pis_progetti", nome: "piscina" },
};

/**
 * Il cronoprogramma del preventivo da cui nasce la commessa. Null se la commessa non viene da un
 * preventivo o il preventivo non ha fasi.
 */
export async function leggiPianoDellaCommessa(orderId: string): Promise<PianoDellaCommessa | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: ordine, error } = await db.from("orders").select("quote_id, rst_progetto_id").eq("id", orderId).maybeSingle();
  if (error) throw new Error("Non riesco a leggere la commessa.");
  if (!ordine) return null;
  const daFasi = (raw: unknown, origine: string): PianoDellaCommessa | null => {
    const fasi = leggiCronoprogramma(raw);
    if (!fasi) return null;
    const { piano, senzaDurata } = pianoDaFasiDelPreventivo(fasi);
    return piano.length ? { origine, piano, senzaDurata, inizioSuggerito: null } : null;
  };
  if (ordine.quote_id) {
    const { data: q } = await db.from("quotes").select("cronoprogramma, source").eq("id", ordine.quote_id).maybeSingle();
    const m = /^modulo:([a-z]+):([0-9a-f-]{36})$/.exec(String(q?.source ?? ""));
    if (m?.[1] === "computo") {
      const { data: c } = await db.from("computo_preventivo_drafts").select("cronoprogramma:payload->cronoprogramma").eq("id", m[2]).maybeSingle();
      const { piano, inizioSuggerito } = pianoDaCronoprogrammaComputo(c?.cronoprogramma);
      if (piano.length) return { origine: "computo", piano, senzaDurata: [], inizioSuggerito };
    } else if (m && TABELLE_MODULI[m[1]]) {
      const { tabella, nome } = TABELLE_MODULI[m[1]];
      const { data: p } = await db.from(tabella).select("cronoprogramma").eq("id", m[2]).maybeSingle();
      const dalModulo = daFasi(p?.cronoprogramma, `preventivo di ${nome}`);
      if (dalModulo) return dalModulo;
    }
    const dalPreventivo = daFasi(q?.cronoprogramma, "preventivo");
    if (dalPreventivo) return dalPreventivo;
  }
  if (ordine.rst_progetto_id) {
    const { data: p } = await db.from("rst_progetti").select("cronoprogramma").eq("id", ordine.rst_progetto_id).maybeSingle();
    return daFasi(p?.cronoprogramma, "preventivo di ristrutturazione");
  }
  return null;
}

export interface EsitoPianificazione { datate: number; aggiunte: number; saltate: number; inizio: string | null; fine: string | null }

/** Scrive le date sulle fasi della commessa, in una volta sola (vedi commessa_pianifica_fasi). */
export async function pianificaFasiDellaCommessa(orderId: string, piano: FasePiano[], inizio: string, sovrascrivi = false): Promise<EsitoPianificazione> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("commessa_pianifica_fasi", { p_order_id: orderId, p_piano: datePerFasi(piano, inizio), p_sovrascrivi: sovrascrivi });
  if (error) throw new Error(error.message || "Pianificazione non riuscita: riprova.");
  return data as EsitoPianificazione;
}
