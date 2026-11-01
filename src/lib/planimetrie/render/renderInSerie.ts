/**
 * Render in serie dalla pianta: più stanze, o più stili per la stessa stanza, con un clic.
 *
 * Ogni render è una normale `render_stanza_sessions` come quella della pagina della stanza
 * (`RenderPlanimetriaStanza`): stessa partenza dalla vista 3D dentro la stanza, stessa pianta
 * della stanza allegata, stessi crediti (uno per render) e rimborsi se fallisce. Qui si sceglie
 * da soli l'inquadratura (`vistaDentroLocale`) e la configurazione nasce da un'idea pronta.
 */
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_STANZA_CONFIG } from "@/components/render-stanza/StanzaConfigForm";
import { caricaFotogramma } from "@/components/planimetrie/Vista3DPigra";
import { pianteDaPlanimetria, vistaDentroLocale } from "@/lib/planimetrie/tred";
import { uploadRenderOriginal } from "@/lib/render/renderStorage";
import { getEdgeFunctionAuthHeaders, resolveEdgeFunctionErrorMessage } from "@/modules/render/lib/edgeFunctionClient";
import { applicaIdea, type IdeaPronta } from "@/modules/render-stanza/lib/ideePronte";
import type { ConfigurazioneStanza } from "@/modules/render-stanza/lib/types";
import type { Planimetria } from "../../../../shared/planimetrie/modello.ts";
import { svgPiantaStanza } from "../../../../shared/render-planimetria/piantaStanza.ts";
import { vincoliDellaStanza } from "../../../../shared/render-planimetria/vincoli.ts";
import { pngDaSvg, tipoStanzaDaDestinazione, type PlanimetriaNelRender } from "./renderDallaPianta";

export interface LavoroRender {
  chiave: string;
  localeId: string;
  localeNome: string;
  idea: IdeaPronta;
}

/** Stanze × idee, nell'ordine: prima tutte le stanze con la prima idea, poi la seconda… */
export function lavoriDaFare(stanze: Array<{ id: string; nome: string }>, idee: IdeaPronta[]): LavoroRender[] {
  return idee.flatMap((idea) => stanze.map((s) => ({ chiave: `${s.id}:${idea.id}`, localeId: s.id, localeNome: s.nome, idea })));
}

/** La configurazione del render: quella predefinita, il tipo di stanza dalla destinazione, poi l'idea. */
export function configPerStanza(destinazione: string, idea: IdeaPronta, nota?: string): ConfigurazioneStanza {
  const base: ConfigurazioneStanza = { ...structuredClone(DEFAULT_STANZA_CONFIG), tipo_stanza: tipoStanzaDaDestinazione(destinazione) };
  const c = applicaIdea(base, idea);
  const extra = nota?.trim();
  return extra ? { ...c, note_libere: `${c.note_libere}\n${extra}` } : c;
}

export interface ContestoSerie {
  companyId: string;
  userId: string;
  planimetriaId: string;
  versione: number;
  documento: Planimetria;
  livelloId: string;
  /** «fatto» oppure «progetto:<id proposta>». */
  ambito: string;
  nota?: string;
}

/**
 * Avvia un render e ritorna l'id della sessione appena la funzione l'ha preso in carico (o ha
 * superato il tempo del gateway: allora il render va avanti e si controlla dalla sessione).
 */
export async function avviaRenderStanza(ctx: ContestoSerie, lavoro: LavoroRender): Promise<string> {
  const vincoli = vincoliDellaStanza(ctx.documento, { livello_id: ctx.livelloId, ambito: ctx.ambito, locale_id: lavoro.localeId });
  if (!vincoli) throw new Error("Stanza non trovata nella pianta.");
  const propostaId = ctx.ambito.startsWith("progetto:") ? ctx.ambito.slice("progetto:".length) : undefined;
  const piante = pianteDaPlanimetria(ctx.documento, { livelloId: ctx.livelloId, propostaId });
  const pianta = ctx.ambito === "fatto" ? piante.fatto : piante.progetto;
  const locale3D = pianta.locali.find((l) => l.id === lavoro.localeId);
  if (!locale3D) throw new Error("Stanza non trovata nel 3D.");

  const cattura = await caricaFotogramma();
  const f = await cattura({ pianta, localeId: lavoro.localeId, telecamera: vistaDentroLocale(locale3D), vista: ctx.ambito === "fatto" ? "fatto" : "progetto" });

  const ora = Date.now();
  const casuale = Math.random().toString(36).slice(2, 7);
  const { storagePath } = await uploadRenderOriginal({
    bucket: "stanza-originals",
    path: `${ctx.companyId}/${ora}_${casuale}_original.png`,
    file: new File([f.png], "vista-3d.png", { type: "image/png" }),
  });
  const rif: PlanimetriaNelRender = {
    planimetria_id: ctx.planimetriaId,
    versione: ctx.versione,
    livello_id: ctx.livelloId,
    ambito: ctx.ambito,
    locale_id: lavoro.localeId,
    locale_nome: vincoli.locale.nome,
    partenza: "vista_3d",
    inquadrate: f.metadati.aperture_visibili.map((a) => ({ id: a.id, posizione: a.posizione, riquadro: a.riquadro })),
    pianta_path: null,
  };
  try {
    const png = await pngDaSvg(svgPiantaStanza(vincoli, { lingua: "en" }));
    const percorso = `${ctx.companyId}/${ora}_${casuale}_pianta.png`;
    const { error } = await supabase.storage.from("stanza-originals").upload(percorso, png, { contentType: "image/png", upsert: true });
    if (!error) rif.pianta_path = percorso;
  } catch { /* si va avanti con misure e aperture scritte */ }

  const config = configPerStanza(vincoli.locale.destinazione, lavoro.idea, ctx.nota);
  const { data: nuova, error: errSessione } = await supabase
    .from("render_stanza_sessions")
    .insert({ company_id: ctx.companyId, created_by: ctx.userId, status: "pending", original_photo_url: storagePath, config: { ...config, planimetria: rif } as never })
    .select("id")
    .single();
  if (errSessione || !nuova) throw new Error("Render non avviato: riprova.");
  const sid = (nuova as { id: string }).id;

  const headers = await getEdgeFunctionAuthHeaders();
  const { data: risposta, error: errFn } = await supabase.functions.invoke("generate-room-render", {
    body: { session_id: sid, config: { ...config, planimetria: rif }, target_width: 1024, target_height: 768 },
    headers,
  });
  if (errFn || risposta?.error) {
    const msg = await resolveEdgeFunctionErrorMessage({ error: errFn, data: risposta, fallback: "Render non avviato" });
    if (!/idle timeout|timeout limit|150s/i.test(msg)) throw new Error(msg.includes("insufficient_credits") ? "Crediti render finiti." : msg);
  }
  return sid;
}

export type StatoLavoro = "in_coda" | "preparo" | "in_corso" | "pronto" | "fallito";

export async function statoSessioni(ids: string[]): Promise<Map<string, { stato: StatoLavoro; url?: string; errore?: string }>> {
  const out = new Map<string, { stato: StatoLavoro; url?: string; errore?: string }>();
  if (!ids.length) return out;
  const { data } = await supabase.from("render_stanza_sessions").select("id, status, result_urls, error_message").in("id", ids);
  for (const r of (data ?? []) as Array<{ id: string; status: string; result_urls: string[] | null; error_message: string | null }>) {
    if (r.status === "completed" && r.result_urls?.[0]) out.set(r.id, { stato: "pronto", url: r.result_urls[0] });
    else if (r.status === "failed") out.set(r.id, { stato: "fallito", errore: r.error_message?.includes("insufficient_credits") ? "Crediti finiti" : "Non riuscito (credito restituito)" });
    else out.set(r.id, { stato: "in_corso" });
  }
  return out;
}
