/**
 * Silvio nel popup delle fasi (05/11/2026): cosa gli si fa vedere della commessa e la chiamata
 * a `silvio-commessa` (modo «fasi»). Le proposte che tornano si controllano qui, contro lo
 * stesso contesto mandato: id che esistono, date vere, niente doppioni.
 */
import { supabase } from "@/integrations/supabase/client";
import { erroreLeggibile } from "@/lib/silvio-commessa/testoErrore";
import { segnalaCreditoEsaurito } from "@/lib/creditoEsaurito";
import {
  acquistiCompatti, contestoCompatto, proposteDaStrumenti, type ContestoAcquisti, type ChiamataStrumentoFasi, type ContestoFasi, type PropostaFasi,
} from "../../../shared/silvio-commessa/chatFasi";
import type { AllegatoSilvio, RispostaSilvio } from "@/components/silvio/SilvioConversazione";

/** Come nomePerLoStorage di leggiDocumento, senza portarsi dietro i lettori dei computi. */
function nomePerLoStorage(nome: string): string {
  const pulito = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_").replace(/^[._]+/, "");
  return (pulito || "documento").slice(-80);
}

/** Carica un allegato nella cartella che la policy di silvio-uploads concede: <azienda>/<utente>/… */
export async function caricaAllegatoFasi(orderId: string, file: File): Promise<AllegatoSilvio> {
  const [{ data: ordine, error: e1 }, { data: utente }] = await Promise.all([
    supabase.from("orders").select("company_id").eq("id", orderId).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const companyId = (ordine as { company_id?: string } | null)?.company_id;
  const userId = utente?.user?.id;
  if (e1 || !companyId || !userId) throw new Error("Non riesco a caricare il file: ricarica la pagina.");
  const path = `${companyId}/${userId}/commessa-${Date.now()}-${nomePerLoStorage(file.name)}`;
  const { error } = await supabase.storage.from("silvio-uploads").upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error(erroreLeggibile(error, "File non caricato: riprova."));
  return { path, nome: file.name };
}

interface FaseIn {
  id: string; name: string; status: string; percentuale: number;
  start_date: string | null; end_date: string | null;
  assignments: ReadonlyArray<{ executor_label?: string | null }>;
}
interface SottofaseIn {
  id: string; name: string; fatta: boolean; percentuale?: number;
  data_inizio?: string | null; data_fine?: string | null; giorni?: number | null;
}

export function contestoFasiPerSilvio(a: {
  oggi: string;
  commessa: string;
  fasi: ReadonlyArray<FaseIn>;
  sottofasiDi: ReadonlyMap<string, ReadonlyArray<SottofaseIn>>;
  quantita?: ReadonlyMap<string, { quantita: number; unita: string | null }>;
  chiDi?: (sottofaseId: string) => string[];
  persone: ReadonlyArray<{ id: string; nome: string }>;
  squadre: ReadonlyArray<{ id: string; nome: string }>;
  ditte: ReadonlyArray<{ id: string; nome: string }>;
}): ContestoFasi {
  return {
    oggi: a.oggi,
    commessa: a.commessa,
    fasi: a.fasi.map((f) => ({
      id: f.id, nome: f.name, stato: f.status, percentuale: f.percentuale ?? 0,
      dal: f.start_date, al: f.end_date,
      chi: [...new Set(f.assignments.map((x) => x.executor_label).filter((x): x is string => !!x))],
      sottofasi: (a.sottofasiDi.get(f.id) ?? []).map((s) => {
        const q = a.quantita?.get(s.id);
        const chi = a.chiDi?.(s.id) ?? [];
        return {
          id: s.id, nome: s.name, fatta: s.fatta, percentuale: s.fatta ? 100 : s.percentuale ?? 0,
          dal: s.data_inizio ?? null, al: s.data_fine ?? null, giorni: s.giorni ?? null,
          ...(q?.quantita ? { quantita: `${q.quantita} ${q.unita ?? ""}`.trim() } : {}),
          ...(chi.length ? { chi } : {}),
        };
      }),
    })),
    persone: [...a.persone],
    squadre: [...a.squadre],
    ditte: [...a.ditte],
  };
}

const GIORNO = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const giornoLungo = (d: string) => GIORNO.format(new Date(`${d}T12:00:00Z`));

/**
 * Quando il modello propone senza spiegare (succede con gli strumenti), la spiegazione la scrive il codice:
 * da quando a quando, quante fasi e sottofasi, e quali sottofasi da fare restano senza date.
 */
export function riassuntoProposte(ctx: ContestoFasi, proposte: ReadonlyArray<PropostaFasi>): string {
  if (!proposte.length) return "Non ho trovato niente da cambiare.";
  const righe: string[] = [];
  const date = proposte.filter((p): p is Extract<PropostaFasi, { tipo: "date" }> => p.tipo === "date");
  if (date.length) {
    const dal = date.reduce((m, p) => (p.dal < m ? p.dal : m), date[0].dal);
    const al = date.reduce((m, p) => (p.al > m ? p.al : m), date[0].al);
    const fasi = date.filter((p) => p.livello === "fase").length;
    const sotto = date.filter((p) => p.livello === "sottofase");
    righe.push(`Lavori da ${giornoLungo(dal)} a ${giornoLungo(al)}: ${fasi} ${fasi === 1 ? "fase" : "fasi"} e ${sotto.length} ${sotto.length === 1 ? "sottofase" : "sottofasi"}, solo giorni di lavoro.`);
    const datate = new Set(sotto.map((p) => p.id));
    const senza = ctx.fasi.flatMap((f) => f.sottofasi.filter((x) => !x.fatta && !x.dal && !datate.has(x.id)).map((x) => x.nome));
    if (senza.length) righe.push(`Restano senza date: ${senza.slice(0, 5).join(", ")}${senza.length > 5 ? ` e altre ${senza.length - 5}` : ""}. Chiedimele, o mettile dalla tabella.`);
  }
  const nuove = proposte.filter((p) => p.tipo === "sottofasi").reduce((n, p) => n + (p.tipo === "sottofasi" ? p.nomi.length : 0), 0);
  if (nuove) righe.push(`${nuove} ${nuove === 1 ? "sottofase nuova" : "sottofasi nuove"}.`);
  const chi = proposte.filter((p) => p.tipo === "chi").length;
  if (chi) righe.push(`${chi} ${chi === 1 ? "assegnazione" : "assegnazioni"} di chi fa le sottofasi.`);
  righe.push("Togli la spunta a quello che non vuoi, poi «Applica».");
  return righe.join(" ");
}

/** Silvio in Materiali e acquisti: risponde soltanto, nel popup. */
export async function chiediSilvioAcquisti(
  orderId: string,
  messaggio: string,
  contesto: ContestoAcquisti,
  storia: ReadonlyArray<{ ruolo: "persona" | "silvio"; testo: string }>,
  allegati: ReadonlyArray<AllegatoSilvio> = [],
): Promise<RispostaSilvio> {
  const data = await invocaPopup({ ambito: "acquisti", order_id: orderId, messaggio, contesto: acquistiCompatti(contesto), storia, allegati });
  const testo = typeof (data as { testo?: unknown }).testo === "string" ? (data as { testo: string }).testo : "";
  return { testo: testo || "Non ho una risposta su questo: prova a chiederlo in un altro modo.", proposte: [], scartate: [], note: [] };
}

async function invocaPopup(corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke("silvio-commessa", {
    body: { modo: "fasi", richiesta_id: crypto.randomUUID(), ...corpo },
  });
  if (error) {
    const { status, testo } = await messaggioDellaFunzione(error);
    if (status === 402) segnalaCreditoEsaurito({ portafoglio: "ai" });
    throw new Error(testo ? erroreLeggibile(testo) : erroreLeggibile(error, "Silvio non risponde: riprova tra poco."));
  }
  return (data ?? {}) as Record<string, unknown>;
}

/** Dal corpo di una risposta d'errore della funzione, la frase in italiano che ha scritto. */
async function messaggioDellaFunzione(error: unknown): Promise<{ status: number | null; testo: string | null }> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (!ctx || typeof ctx.json !== "function") return { status: null, testo: null };
  try {
    const corpo = await ctx.clone().json() as { error?: unknown; message?: unknown };
    const t = typeof corpo.error === "string" ? corpo.error : typeof corpo.message === "string" ? corpo.message : null;
    return { status: ctx.status ?? null, testo: t };
  } catch {
    return { status: ctx.status ?? null, testo: null };
  }
}

export async function chiediSilvioFasi(
  orderId: string,
  messaggio: string,
  contesto: ContestoFasi,
  storia: ReadonlyArray<{ ruolo: "persona" | "silvio"; testo: string }>,
  allegati: ReadonlyArray<AllegatoSilvio> = [],
  lavorativo?: (giorno: string) => boolean,
): Promise<RispostaSilvio> {
  contesto = contestoCompatto(contesto);
  const r = await invocaPopup({ ambito: "fasi", order_id: orderId, messaggio, contesto, storia, allegati }) as { testo?: unknown; strumenti?: unknown };
  const strumenti = (Array.isArray(r.strumenti) ? r.strumenti : []) as ChiamataStrumentoFasi[];
  const { proposte, scartate, note } = proposteDaStrumenti(strumenti, contesto, lavorativo);
  const testo = typeof r.testo === "string" ? r.testo : "";
  return { testo: testo || riassuntoProposte(contesto, proposte), proposte, scartate, note };
}

export interface AzioniFasi {
  aggiungiSottofasi: (a: { phaseId: string; nomi: string[] }) => Promise<unknown>;
  dateSottofasi: (passi: Array<{ id: string; data_inizio: string; data_fine: string; giorni: null }>) => Promise<unknown>;
  dateFase: (a: { id: string; start_date: string; end_date: string }) => Promise<unknown>;
  chiFa: (a: { sottofaseIds: string[]; persona?: string; ditta?: string }) => Promise<unknown>;
}

/**
 * Applica le proposte scelte, con le stesse funzioni della tabella: prima le sottofasi nuove,
 * poi le date delle sottofasi (in un colpo), poi quelle delle fasi, poi chi le fa (una
 * chiamata per persona, squadra o ditta). Se un passo fallisce, i successivi non partono.
 */
export async function applicaProposte(proposte: ReadonlyArray<PropostaFasi>, az: AzioniFasi): Promise<void> {
  for (const p of proposte) if (p.tipo === "sottofasi") await az.aggiungiSottofasi({ phaseId: p.faseId, nomi: p.nomi });
  const dateSottofasi = proposte.flatMap((p) => (p.tipo === "date" && p.livello === "sottofase" ? [{ id: p.id, data_inizio: p.dal, data_fine: p.al, giorni: null as null }] : []));
  if (dateSottofasi.length) await az.dateSottofasi(dateSottofasi);
  for (const p of proposte) if (p.tipo === "date" && p.livello === "fase") await az.dateFase({ id: p.id, start_date: p.dal, end_date: p.al });
  const gruppi = new Map<string, { persona: boolean; ids: string[] }>();
  for (const p of proposte) {
    if (p.tipo !== "chi") continue;
    const g = gruppi.get(p.chiId) ?? { persona: p.genere === "persona", ids: [] };
    g.ids.push(p.sottofaseId);
    gruppi.set(p.chiId, g);
  }
  for (const [chi, g] of gruppi) await az.chiFa({ sottofaseIds: g.ids, ...(g.persona ? { persona: chi } : { ditta: chi }) });
}
