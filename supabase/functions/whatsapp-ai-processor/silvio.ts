// Il ponte fra il bot operativo e gli strumenti di Silvio (27/09/2026).
//
// Chi lavora in ufficio o amministra l'azienda, da WhatsApp, fa quello che
// fa con Silvio nell'app: stessi strumenti (_shared/silvioTools.ts), stesso
// ruolo, stessi permessi. Si eseguono come fa il bot di Telegram, col client
// di servizio e l'utente riconosciuto dal numero. Il catalogo parte dalle
// aree di base più quelle iniziali (cantieri, o quelle della scheda agente)
// e si allarga con carica_strumenti, come nella chat dell'app.
// Le azioni «gialle» diventano una proposta: qui si conferma coi bottoni
// Sì/No invece che solo nell'app. Le «rosse» restano da approvare nell'app.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  CORE_TOOL_DOMAINS,
  dominiPerAree,
  getToolsForChannel,
  indiceAreeCaricabili,
  TOOL_CONTRACT_LEGEND,
  toolsToOpenAISpec,
  type ToolContext,
  type ToolDomain,
} from "../_shared/silvioTools.ts";
import { executeToolWithRouting } from "../_shared/silvioToolExecution.ts";
import { frozenConfirmationValid, canonicalJson } from "./frozenConfirmation.ts";
import type { ConfermaAttesa } from "../_shared/botOperativoConferme.ts";
import { usaPermessiStaff } from "../_shared/ruoloSilvio.ts";
import { unisciCatalogo } from "../_shared/botOperativoCatalogo.ts";
import type { ToolResult } from "./tools/shared/types.ts";

/** Le aree che il bot operativo ha sempre a bordo: è un bot di cantiere. */
export const AREE_INIZIALI_BOT = ["cantieri"];

export interface PonteSilvio {
  ctx: ToolContext;
  /** Strumenti di Silvio a bordo adesso. */
  nomi: Set<string>;
  /** Schemi per il modello (formato OpenAI). */
  spec: unknown[];
  /** Aree caricate oltre a quelle di base: si ricordano nella sessione. */
  domini: Set<ToolDomain>;
  ricostruisci(): void;
  /** Legenda dei contratti + aree che si possono ancora caricare. */
  promptExtra(): string;
}

export interface PropostaDelGiro {
  id: string;
  rischio: string;
  strumento: string;
}

export async function apriPonteSilvio(
  supabase: SupabaseClient,
  opts: {
    companyId: string;
    userId: string;
    ruolo: string;
    sessionId: string | null;
    /** Aree da avere subito (chiavi di carica_strumenti, es. "cantieri"). */
    areeIniziali: string[];
    /** Domini già caricati nei messaggi precedenti (dalla sessione). */
    dominiSalvati: string[];
    /** Strumenti del bot già a bordo: Silvio non li duplica. */
    nomiBot: string[];
    /** Strumenti vietati dalla scheda agente. */
    vietati: string[];
  },
): Promise<PonteSilvio> {
  let staffPermissions: Record<string, unknown> | null = null;
  if (usaPermessiStaff(opts.ruolo)) {
    const { data } = await supabase
      .from("staff_permissions")
      .select("*")
      .eq("user_id", opts.userId)
      .eq("company_id", opts.companyId)
      .maybeSingle();
    staffPermissions = (data as Record<string, unknown> | null) ?? null;
  }

  const domini = new Set<ToolDomain>([
    ...dominiPerAree(opts.areeIniziali),
    ...(opts.dominiSalvati as ToolDomain[]),
  ]);
  const aBordo = () => [...new Set<ToolDomain>([...CORE_TOOL_DOMAINS, ...domini])].sort();
  const vietati = new Set(opts.vietati);

  const ponte: PonteSilvio = {
    ctx: {
      supabase,
      companyId: opts.companyId,
      userId: opts.userId,
      primaryRole: opts.ruolo,
      staffPermissions,
      channel: "whatsapp",
      personaKey: "silvio",
      sessionId: opts.sessionId ?? undefined,
    },
    nomi: new Set(),
    spec: [],
    domini,
    ricostruisci() {
      const tutti = getToolsForChannel({
        channel: "whatsapp",
        role: opts.ruolo,
        personaKey: "silvio",
        domains: aBordo(),
        staffPermissions,
      }).filter((t) => !vietati.has(t.schema?.function?.name));
      const { silvio } = unisciCatalogo(opts.nomiBot, tutti.map((t) => String(t.schema?.function?.name ?? "")));
      const tenuti = new Set(silvio);
      ponte.nomi = tenuti;
      ponte.spec = toolsToOpenAISpec(tutti.filter((t) => tenuti.has(String(t.schema?.function?.name ?? ""))));
    },
    promptExtra() {
      return TOOL_CONTRACT_LEGEND + indiceAreeCaricabili(aBordo());
    },
  };
  ponte.ricostruisci();
  return ponte;
}

/** Esegue uno strumento di Silvio e lo traduce nel formato dei risultati del bot. */
export async function eseguiStrumentoSilvio(
  ponte: PonteSilvio,
  nome: string,
  args: Record<string, unknown>,
): Promise<{ risultato: ToolResult; proposta: PropostaDelGiro | null }> {
  const r = await executeToolWithRouting(nome, args, ponte.ctx);
  if (nome === "carica_strumenti" && r.success) {
    for (const d of dominiPerAree(args.aree)) ponte.domini.add(d);
    ponte.ricostruisci();
  }
  if (!r.success) {
    return {
      risultato: { ok: false, error: r.error?.code ?? "errore", user_message: "Operazione non confermata. Verifica nell’app prima di riprovare." },
      proposta: null,
    };
  }
  if (r.proposalId) {
    return {
      risultato: {
        ok: true,
        data: {
          in_attesa_di_conferma: true,
          nota: "Azione preparata. All'utente arriva la richiesta di conferma con i bottoni: non aggiungere altro testo.",
        },
      },
      proposta: { id: r.proposalId, rischio: r.riskLevel ?? "yellow", strumento: nome },
    };
  }
  return { risultato: { ok: true, data: r.data }, proposta: null };
}

/**
 * Il Sì o il No a una proposta di Silvio arrivato in chat. Torna il testo da
 * rispondere. La proposta si prende in carico con un update condizionato:
 * se nel frattempo l'hanno gestita dall'app, qui non parte due volte.
 */
export async function chiudiPropostaDaChat(
  supabase: SupabaseClient,
  ponte: PonteSilvio,
  propostaId: string,
  confermata: boolean,
  expected?: ConfermaAttesa,
): Promise<string> {
  const { data: prop } = await supabase
    .from("ai_action_proposals")
    .select("id, action_type, payload, status, risk_level, company_id, user_id")
    .eq("id", propostaId)
    .maybeSingle();
  if (!prop || prop.status !== "pending" || prop.company_id !== ponte.ctx.companyId || prop.user_id !== ponte.ctx.userId) {
    return "Questa richiesta non è più in attesa: dimmi di nuovo cosa vuoi fare.";
  }
  const adesso = new Date().toISOString();
  if (!confermata) {
    const { data: rejected, error: rejectError } = await supabase
      .from("ai_action_proposals")
      .update({ status: "rejected", resolved_by: ponte.ctx.userId, resolved_at: adesso, resolution_note: "Rifiutata su WhatsApp" })
      .eq("id", prop.id)
      .eq("status", "pending").eq("company_id", ponte.ctx.companyId).eq("user_id", ponte.ctx.userId).select("id");
    if (rejectError || rejected?.length !== 1) return "Non riesco a confermare il rifiuto: verifica la proposta nell’app.";
    return "Ok, lascio stare.";
  }
  if (prop.risk_level === "red") {
    return "Questa azione va approvata dall'app: la trovi in Silvio, tra le azioni da approvare.";
  }
  if (!expected || !await frozenConfirmationValid(expected) || expected.azione !== prop.action_type ||
    canonicalJson(expected.parametri) !== canonicalJson(prop.payload ?? {})) {
    return "I dati della proposta sono cambiati: richiedi una nuova anteprima prima di approvare.";
  }
  const { data: presa, error: claimError } = await supabase
    .from("ai_action_proposals")
    .update({ status: "confirmed", resolved_by: ponte.ctx.userId, resolved_at: adesso, resolution_note: "Confermata su WhatsApp" })
    .eq("id", prop.id)
    .eq("status", "pending")
    .eq("company_id", ponte.ctx.companyId)
    .eq("user_id", ponte.ctx.userId)
    .eq("payload", JSON.stringify(prop.payload))
    .eq("action_type", prop.action_type)
    .select("id");
  if (claimError) return "Non riesco a verificare la presa in carico: nessuna nuova esecuzione avviata.";
  if (!presa || presa.length === 0) return "Questa richiesta è già stata gestita dall'app o è cambiata: verifica la proposta.";

  const payload = (prop.payload ?? {}) as Record<string, unknown>;
  const input = payload.input && typeof payload.input === "object" ? payload.input : payload;
  const r = await executeToolWithRouting(String(prop.action_type), input, { ...ponte.ctx, preApproved: true });
  const dati = r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : null;
  const errore = !r.success
    ? "Operazione non confermata. Verifica nell’app prima di riprovare."
    : typeof dati?.error === "string"
    ? dati.error
    : null;

  const { data: saved, error: saveError } = await supabase
    .from("ai_action_proposals")
    .update({
      status: errore ? "failed" : "applied",
      applied_at: errore ? null : new Date().toISOString(),
      applied_result: (r.data ?? r.error ?? null) as unknown,
    })
    .eq("id", prop.id).eq("company_id", ponte.ctx.companyId).eq("user_id", ponte.ctx.userId).eq("status", "confirmed").select("id");
  if (saveError || saved?.length !== 1) return "L’azione è stata avviata ma l’esito non è registrato. Verifica nell’app prima di riprovare.";

  if (errore) return errore;
  return typeof dati?.nota === "string" && dati.nota.trim() ? `✅ ${dati.nota}` : "✅ Fatto.";
}
