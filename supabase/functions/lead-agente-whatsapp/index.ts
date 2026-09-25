// lead-agente-whatsapp — l'agente WhatsApp dei lead con il prompt dell'azienda
// (25/09/2026).
//
// Lo chiama whatsapp-webhook (handlers/lead.ts) quando il numero «lead» ha un
// agente collegato (ai_whatsapp_numbers.agent_id → ai_agents_v2, tipo
// whatsapp). A differenza di lead-ai-processor, che ha un prompt fisso uguale
// per tutti e per gli appuntamenti apre solo un ticket:
// - il prompt è quello dell'azienda (ai_agents_v2.system_prompt) più regole
//   fisse (promptAgenteLead.ts);
// - la storia della chat si legge per contatto nei due versi;
// - gli orari e la prenotazione sono quelli veri del calendario scelto
//   (calendarioPrenotazione.ts), e l'opportunità si sposta nelle fasi scelte;
// - se una persona ha preso la conversazione (conversazioni.bot_in_pausa)
//   l'agente tace.
//
// Un turno per contatto (conversazioni.bot_occupato_fino): due messaggi a
// pochi secondi non fanno partire due giri in parallelo. Chi ha il turno, se
// intanto arrivano altri messaggi, butta la risposta preparata e rifà il giro
// con la storia nuova; prima di lasciare il turno ricontrolla.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";
import { chiamataInternaValida, rispostaNonAutorizzata } from "../_shared/chiamataInterna.ts";
import { callOpenAI, type ChatMessage } from "../whatsapp-ai-processor/openai.ts";
import { InsufficientCreditsError } from "../_shared/ai-provider/index.ts";
import { checkBudget, consumeBudget, estimateCostEur } from "../whatsapp-ai-processor/budget.ts";
import { logToolCall } from "../whatsapp-ai-processor/observability.ts";
import { sanitizeAnswer } from "../_shared/structuredOutput.ts";
import { leggiConfigAgenteLead, type ConfigAgenteLead } from "../_shared/agenteLeadConfig.ts";
import { turniPerLlm, type RigaMessaggio } from "../_shared/storiaWhatsApp.ts";
import { promptAgenteLead } from "../_shared/promptAgenteLead.ts";
import { avvisaUtenti, specificheStrumenti, trovaStrumento, type CtxAgente } from "./strumenti.ts";

interface Richiesta {
  message_id?: string;
  contact_id: string;
  wa_number_id: string;
  /** Il numero da cui ha scritto il lead, come lo manda Meta (solo cifre, col prefisso). */
  from_phone?: string;
}

const MAX_GIRI_STRUMENTI = 5;
const MAX_RIPRESE = 3;
const DURATA_TURNO_MS = 120_000;

// deno-lint-ignore no-explicit-any
type Admin = any;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // Solo whatsapp-webhook, con la chiave di servizio: nessun altro può far
  // parlare l'agente a nome dell'azienda e a spese del suo credito.
  if (!chiamataInternaValida(req)) return rispostaNonAutorizzata(corsHeaders);
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin: Admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: Richiesta;
  try { body = await req.json() as Richiesta; } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.wa_number_id || !body.contact_id) return json({ error: "missing_fields" }, 400);

  // ── Numero, agente, configurazione ──────────────────────────────────────
  const { data: numero } = await admin
    .from("ai_whatsapp_numbers")
    .select("id, company_id, agent_id, stato")
    .eq("id", body.wa_number_id).is("deleted_at", null).maybeSingle();
  if (!numero?.agent_id || (numero.stato && numero.stato !== "active")) return json({ ok: true, skipped: "nessun_agente" });
  const companyId = numero.company_id as string;

  const { data: agente } = await admin
    .from("ai_agents_v2")
    .select("id, company_id, nome, tipo, stato, system_prompt, tools_config")
    .eq("id", numero.agent_id).eq("company_id", companyId).maybeSingle();
  if (!agente || agente.tipo !== "whatsapp" || (agente.stato && agente.stato !== "attivo")) {
    console.warn(JSON.stringify({ fn: "lead-agente-whatsapp", msg: "agente non attivo: il lead non riceve risposta", agente: numero.agent_id }));
    return json({ ok: true, skipped: "agente_non_attivo" });
  }
  const conf = leggiConfigAgenteLead(agente.tools_config);
  if (!conf.ok) {
    console.warn(JSON.stringify({ fn: "lead-agente-whatsapp", msg: "configurazione incompleta", agente: agente.id, mancano: conf.mancano }));
    return json({ ok: true, skipped: "configurazione_incompleta", mancano: conf.mancano });
  }
  const config = conf.config;

  // ── Messaggio, contatto, pausa ──────────────────────────────────────────
  const { data: questo } = body.message_id
    ? await admin.from("whatsapp_messages").select("created_at, message_type, from_phone").eq("id", body.message_id).maybeSingle()
    : { data: null };
  // Una reazione (👍) non è un messaggio a cui rispondere.
  if (questo?.message_type === "reaction") return json({ ok: true, skipped: "reazione" });

  const { data: contatto } = await admin
    .from("marketing_contacts")
    .select("id, company_id, first_name, last_name, phone, qualificazione_json, optout_whatsapp, opt_out")
    .eq("id", body.contact_id).eq("company_id", companyId).maybeSingle();
  if (!contatto) return json({ ok: true, skipped: "contatto_non_trovato" });
  if (contatto.optout_whatsapp || contatto.opt_out) return json({ ok: true, skipped: "opt_out" });
  // Si risponde al numero da cui ha scritto (quello di Meta, col prefisso), non a
  // quello salvato in scheda, che può essere senza +39.
  const destinatario = String(body.from_phone || questo?.from_phone || contatto.phone || "").replace(/[^0-9]/g, "");
  if (!destinatario) return json({ ok: true, skipped: "contatto_senza_numero" });

  const filtroConv = { company_id: companyId, entita_tipo: "contatto", entita_id: contatto.id };
  await admin.from("conversazioni").upsert(filtroConv, { onConflict: "company_id,entita_tipo,entita_id", ignoreDuplicates: true });
  const { data: conversazione } = await admin
    .from("conversazioni").select("bot_in_pausa").match(filtroConv).maybeSingle();
  if (conversazione?.bot_in_pausa) return json({ ok: true, skipped: "in_pausa" });

  // ── Turno ───────────────────────────────────────────────────────────────
  if (!(await prendiTurno(admin, filtroConv))) return json({ ok: true, skipped: "turno_occupato" });

  try {
    let risposte = 0;
    for (let ripresa = 0; ripresa < MAX_RIPRESE; ripresa++) {
      const esito = await unGiro(admin, { companyId, numeroId: numero.id, agente, config, contatto, destinatario, messageId: body.message_id ?? null });
      if (esito === "inviata") risposte++;
      if (esito === "fermo") break;
      // Prima di lasciare il turno: è arrivato altro mentre si rispondeva?
      if (!(await ciSonoMessaggiSenzaRisposta(admin, companyId, numero.id, contatto.id))) break;
    }
    return json({ ok: true, risposte });
  } finally {
    await admin.from("conversazioni").update({ bot_occupato_fino: null }).match(filtroConv);
  }
});

// ── Un giro: storia → LLM con strumenti → risposta ──────────────────────────

type EsitoGiro = "inviata" | "rifare" | "niente" | "fermo";

async function unGiro(admin: Admin, g: {
  companyId: string;
  numeroId: string;
  // deno-lint-ignore no-explicit-any
  agente: any;
  config: ConfigAgenteLead;
  // deno-lint-ignore no-explicit-any
  contatto: any;
  destinatario: string;
  messageId: string | null;
}): Promise<EsitoGiro> {
  const { data: righe, error: eStoria } = await admin
    .from("whatsapp_messages")
    .select("id, direction, message_type, content_text, created_at")
    .eq("company_id", g.companyId).eq("contact_id", g.contatto.id)
    .order("created_at", { ascending: false })
    .limit(40);
  if (eStoria) throw new Error(`storia: ${eStoria.message}`);
  const utili = ((righe ?? []) as Array<RigaMessaggio & { id: string }>).filter((r) => r.message_type !== "reaction");
  const ultimoEntrata = utili.find((r) => r.direction === "inbound");
  const turni = turniPerLlm(utili, 24);
  if (!ultimoEntrata || !turni.length || turni[turni.length - 1].role !== "user") return "niente";

  const [{ data: azienda }, { data: calendario }, { data: opp }, { data: qualifica }] = await Promise.all([
    admin.from("companies").select("name").eq("id", g.companyId).maybeSingle(),
    admin.from("marketing_calendars").select("name").eq("id", g.config.calendarioId).maybeSingle(),
    admin.from("marketing_opportunities")
      .select("stage_id, marketing_pipeline_stages(name)")
      .eq("company_id", g.companyId).eq("contact_id", g.contatto.id).eq("status", "open").is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(1),
    admin.from("marketing_contacts").select("qualificazione_json").eq("id", g.contatto.id).maybeSingle(),
  ]);
  // deno-lint-ignore no-explicit-any
  const faseAttuale = ((opp?.[0] as any)?.marketing_pipeline_stages?.name as string | undefined) ?? null;
  const adesso = new Date();
  const sistema = promptAgenteLead({
    promptAzienda: String(g.agente.system_prompt ?? ""),
    nomeAzienda: String(azienda?.name ?? "l'azienda"),
    adesso,
    contatto: { nome: g.contatto.first_name, cognome: g.contatto.last_name },
    qualificazione: (qualifica?.qualificazione_json ?? {}) as Record<string, unknown>,
    faseAttuale,
    calendarioNome: String(calendario?.name ?? "calendario delle chiamate"),
  });

  const ctx: CtxAgente = {
    admin, companyId: g.companyId, contactId: g.contatto.id,
    contatto: { first_name: g.contatto.first_name, last_name: g.contatto.last_name, phone: g.contatto.phone },
    config: g.config,
    adesso,
    prenotazioniNelGiro: 0,
  };

  const budget = await checkBudget(admin, g.companyId);
  if (!budget.ok) {
    await avvisaUtenti(ctx, "Assistente WhatsApp fermo", "Il budget AI del giorno è finito: un lead ha scritto e non ha ricevuto risposta.");
    return "fermo";
  }

  const conv: ChatMessage[] = [{ role: "system", content: sistema }, ...turni.map((t) => ({ role: t.role, content: t.content }))];
  const strumenti = specificheStrumenti();
  let testoFinale: string | null = null;
  let tokIn = 0, tokOut = 0, modello = budget.model_override ?? "routing";
  const chiedi = async (toolChoice: "auto" | "none", maxTokens: number) => {
    const r = await callOpenAI({
      task_kind: "lead_qualificazione",
      company_id: g.companyId,
      wa_message_id: g.messageId,
      model: budget.model_override ?? undefined,
      messages: conv, tools: strumenti, tool_choice: toolChoice,
      temperature: 0.4, max_tokens: maxTokens,
    });
    tokIn += r.usage?.prompt_tokens ?? 0;
    tokOut += r.usage?.completion_tokens ?? 0;
    modello = r.model || modello;
    return r.choices[0].message;
  };

  try {
    for (let giro = 0; giro < MAX_GIRI_STRUMENTI; giro++) {
      const msg = await chiedi("auto", 600);
      if (!msg.tool_calls?.length) { testoFinale = msg.content ?? null; break; }
      conv.push(msg);
      // In ordine, non in parallelo: una prenotazione e lo spostamento di fase
      // non devono pestarsi.
      for (const tc of msg.tool_calls) {
        const strumento = trovaStrumento(tc.function.name);
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* argomenti vuoti */ }
        const t0 = Date.now();
        let esito: { ok: boolean; [k: string]: unknown };
        try {
          esito = strumento ? await strumento.handler(ctx, args) : { ok: false, errore: "strumento_sconosciuto" };
        } catch (e) {
          esito = { ok: false, errore: "errore_interno", dettaglio: String(e).slice(0, 200) };
        }
        await logToolCall(admin, {
          company_id: g.companyId,
          wa_message_id: g.messageId,
          tool_name: tc.function.name,
          role_kind: "lead",
          args, result: esito,
          duration_ms: Date.now() - t0,
          model_used: modello,
          tokens_prompt: 0,
          tokens_completion: 0,
        });
        conv.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(esito) });
      }
    }
    // Finiti i giri con gli strumenti senza un testo: un ultimo giro senza
    // strumenti, così il lead riceve comunque una risposta.
    if (!testoFinale) testoFinale = (await chiedi("none", 400)).content ?? null;
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      // Al lead non si scrive dei crediti: si avvisa il team.
      await avvisaUtenti(ctx, "Assistente WhatsApp fermo", "I crediti AI sono finiti: un lead ha scritto e non ha ricevuto risposta.");
      return "fermo";
    }
    console.error(JSON.stringify({ level: "error", fn: "lead-agente-whatsapp", error: String(err) }));
    await avvisaUtenti(ctx, "Assistente WhatsApp: risposta non inviata", `Un lead ha scritto ma l'assistente non è riuscito a rispondere (${String(err).slice(0, 120)}). Rispondi tu da Conversazioni.`);
    return "fermo";
  } finally {
    await consumeBudget(admin, g.companyId, estimateCostEur(modello, tokIn, tokOut));
  }

  // Arrivato altro mentre si preparava la risposta: si rifà il giro con tutto.
  // (Le azioni fatte dagli strumenti restano: il giro nuovo le vede nella scheda.)
  if (await entrataPiuRecente(admin, g.companyId, g.numeroId, g.contatto.id, ultimoEntrata.created_at)) return "rifare";

  const pulito = sanitizeAnswer(testoFinale ?? "");
  const risposta = pulito.isFullyChainOfThought ? "" : (pulito.cleaned || testoFinale || "").trim();
  if (!risposta) {
    await avvisaUtenti(ctx, "Assistente WhatsApp: risposta vuota", "Un lead ha scritto ma l'assistente non ha prodotto una risposta. Rispondi tu da Conversazioni.");
    return "fermo";
  }
  const inviata = await inviaRisposta(g.numeroId, g.companyId, g.destinatario, g.contatto.id, risposta);
  if (!inviata) {
    await avvisaUtenti(ctx, "Assistente WhatsApp: invio non riuscito", "La risposta dell'assistente non è partita (WhatsApp l'ha rifiutata). Rispondi tu da Conversazioni.");
    return "fermo";
  }
  return "inviata";
}

// ── Turno e messaggi nuovi ──────────────────────────────────────────────────

async function prendiTurno(admin: Admin, filtro: Record<string, string>): Promise<boolean> {
  const ora = new Date();
  const { data, error } = await admin
    .from("conversazioni")
    .update({ bot_occupato_fino: new Date(ora.getTime() + DURATA_TURNO_MS).toISOString() })
    .match(filtro)
    .or(`bot_occupato_fino.is.null,bot_occupato_fino.lt."${ora.toISOString()}"`)
    .select("id");
  if (error) {
    console.error("[lead-agente] turno:", error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

async function entrataPiuRecente(admin: Admin, companyId: string, numeroId: string, contactId: string, dopo: string): Promise<boolean> {
  const { count } = await admin
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId).eq("wa_number_id", numeroId).eq("contact_id", contactId)
    .eq("direction", "inbound").neq("message_type", "reaction")
    .gt("created_at", dopo);
  return (count ?? 0) > 0;
}

/** L'ultimo messaggio della chat (su questo numero) è del cliente? */
async function ciSonoMessaggiSenzaRisposta(admin: Admin, companyId: string, numeroId: string, contactId: string): Promise<boolean> {
  const { data } = await admin
    .from("whatsapp_messages")
    .select("direction, message_type")
    .eq("company_id", companyId).eq("wa_number_id", numeroId).eq("contact_id", contactId)
    .neq("message_type", "reaction")
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0]?.direction === "inbound";
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function inviaRisposta(waNumberId: string, companyId: string, to: string, contactId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ wa_number_id: waNumberId, company_id: companyId, to, text, contact_id: contactId }),
    });
    if (!res.ok) {
      console.error("[lead-agente] whatsapp-send:", res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[lead-agente] invio fallito:", String(e));
    return false;
  }
}
