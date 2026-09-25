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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";
import { chiamataInternaValida, rispostaNonAutorizzata } from "../_shared/chiamataInterna.ts";
import { callOpenAI, type ChatMessage } from "../whatsapp-ai-processor/openai.ts";
import { InsufficientCreditsError } from "../_shared/ai-provider/index.ts";
import { checkBudget, consumeBudget, estimateCostEur } from "../whatsapp-ai-processor/budget.ts";
import { logToolCall } from "../whatsapp-ai-processor/observability.ts";
import { sanitizeAnswer } from "../_shared/structuredOutput.ts";
import { leggiConfigAgenteLead } from "../_shared/agenteLeadConfig.ts";
import { turniPerLlm, type RigaMessaggio } from "../_shared/storiaWhatsApp.ts";
import { promptAgenteLead } from "../_shared/promptAgenteLead.ts";
import { specificheStrumenti, trovaStrumento, type CtxAgente } from "./strumenti.ts";

interface Richiesta {
  message_id?: string;
  contact_id: string;
  wa_number_id: string;
}

const MAX_GIRI = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // Solo whatsapp-webhook, con la chiave di servizio: nessun altro può far
  // parlare l'agente a nome dell'azienda e a spese del suo credito.
  if (!chiamataInternaValida(req)) return rispostaNonAutorizzata(corsHeaders);
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: Richiesta;
  try { body = await req.json() as Richiesta; } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.wa_number_id || !body.contact_id) return json({ error: "missing_fields" }, 400);

  // ── Numero, agente, configurazione ──────────────────────────────────────
  const { data: numero } = await admin
    .from("ai_whatsapp_numbers")
    .select("id, company_id, agent_id, stato")
    .eq("id", body.wa_number_id).is("deleted_at", null).maybeSingle();
  if (!numero?.agent_id || (numero.stato && numero.stato !== "active")) return json({ ok: true, skipped: "nessun_agente" });

  const { data: agente } = await admin
    .from("ai_agents_v2")
    .select("id, company_id, nome, tipo, stato, system_prompt, tools_config")
    .eq("id", numero.agent_id).eq("company_id", numero.company_id).maybeSingle();
  if (!agente || agente.tipo !== "whatsapp" || (agente.stato && agente.stato !== "attivo")) {
    return json({ ok: true, skipped: "agente_non_attivo" });
  }
  const conf = leggiConfigAgenteLead(agente.tools_config);
  if (!conf.ok) {
    console.warn(JSON.stringify({ fn: "lead-agente-whatsapp", msg: "configurazione incompleta", agente: agente.id, mancano: conf.mancano }));
    return json({ ok: true, skipped: "configurazione_incompleta", mancano: conf.mancano });
  }
  const companyId = numero.company_id as string;

  // ── Contatto e pausa ────────────────────────────────────────────────────
  const { data: contatto } = await admin
    .from("marketing_contacts")
    .select("id, company_id, first_name, last_name, phone, qualificazione_json, optout_whatsapp, opt_out")
    .eq("id", body.contact_id).eq("company_id", companyId).maybeSingle();
  if (!contatto?.phone) return json({ ok: true, skipped: "contatto_senza_numero" });
  if (contatto.optout_whatsapp || contatto.opt_out) return json({ ok: true, skipped: "opt_out" });

  const { data: conversazione } = await admin
    .from("conversazioni")
    .select("bot_in_pausa")
    .eq("company_id", companyId).eq("entita_tipo", "contatto").eq("entita_id", contatto.id)
    .maybeSingle();
  if (conversazione?.bot_in_pausa) return json({ ok: true, skipped: "in_pausa" });

  // Due messaggi di fila ricevono una sola risposta: se ne è arrivato uno più
  // recente, risponde il giro di quello (che vede anche questo nella storia).
  if (body.message_id) {
    const { data: questo } = await admin.from("whatsapp_messages").select("created_at").eq("id", body.message_id).maybeSingle();
    if (questo?.created_at) {
      const { count } = await admin
        .from("whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", contatto.id).eq("direction", "inbound").gt("created_at", questo.created_at);
      if ((count ?? 0) > 0) return json({ ok: true, skipped: "messaggio_piu_recente" });
    }
  }

  // ── Storia e prompt ─────────────────────────────────────────────────────
  const { data: righe } = await admin
    .from("whatsapp_messages")
    .select("direction, message_type, content_text, created_at")
    .eq("company_id", companyId).eq("contact_id", contatto.id)
    .order("created_at", { ascending: false })
    .limit(40);
  const turni = turniPerLlm((righe ?? []) as RigaMessaggio[], 24);
  if (!turni.length || turni[turni.length - 1].role !== "user") return json({ ok: true, skipped: "niente_da_rispondere" });

  const [{ data: azienda }, { data: calendario }, { data: opp }] = await Promise.all([
    admin.from("companies").select("name").eq("id", companyId).maybeSingle(),
    admin.from("marketing_calendars").select("name").eq("id", conf.config.calendarioId).maybeSingle(),
    admin.from("marketing_opportunities")
      .select("stage_id, marketing_pipeline_stages(name)")
      .eq("company_id", companyId).eq("contact_id", contatto.id).eq("status", "open").is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(1),
  ]);
  // deno-lint-ignore no-explicit-any
  const faseAttuale = ((opp?.[0] as any)?.marketing_pipeline_stages?.name as string | undefined) ?? null;
  const adesso = new Date();
  const sistema = promptAgenteLead({
    promptAzienda: String(agente.system_prompt ?? ""),
    nomeAzienda: String(azienda?.name ?? "l'azienda"),
    adesso,
    contatto: { nome: contatto.first_name, cognome: contatto.last_name },
    qualificazione: (contatto.qualificazione_json ?? {}) as Record<string, unknown>,
    faseAttuale,
    calendarioNome: String(calendario?.name ?? "calendario delle chiamate"),
  });

  const budget = await checkBudget(admin, companyId);
  if (!budget.ok) {
    await avvisaTeam(admin, companyId, conf.config.utentiDaAvvisare, "Assistente WhatsApp fermo", "Il budget AI del giorno è finito: un lead ha scritto e non ha ricevuto risposta.", contatto.id);
    return json({ ok: true, skipped: "budget" });
  }

  const ctx: CtxAgente = {
    admin, companyId, contactId: contatto.id,
    contatto: { first_name: contatto.first_name, last_name: contatto.last_name, phone: contatto.phone },
    config: conf.config,
    adesso,
  };
  const conv: ChatMessage[] = [{ role: "system", content: sistema }, ...turni.map((t) => ({ role: t.role, content: t.content }))];
  const strumenti = specificheStrumenti();
  let testoFinale: string | null = null;
  let tokIn = 0, tokOut = 0, modello = budget.model_override ?? "routing";

  try {
    for (let giro = 0; giro < MAX_GIRI; giro++) {
      const r = await callOpenAI({
        task_kind: "lead_qualificazione",
        company_id: companyId,
        wa_message_id: body.message_id ?? null,
        model: budget.model_override ?? undefined,
        messages: conv, tools: strumenti, tool_choice: "auto",
        temperature: 0.4, max_tokens: 600,
      });
      tokIn += r.usage?.prompt_tokens ?? 0;
      tokOut += r.usage?.completion_tokens ?? 0;
      modello = r.model || modello;
      const msg = r.choices[0].message;
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
          company_id: companyId,
          wa_message_id: body.message_id ?? null,
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
    if (!testoFinale) {
      const r = await callOpenAI({
        task_kind: "lead_qualificazione",
        company_id: companyId,
        wa_message_id: body.message_id ?? null,
        model: budget.model_override ?? undefined,
        messages: conv, tools: strumenti, tool_choice: "none",
        temperature: 0.4, max_tokens: 400,
      });
      tokIn += r.usage?.prompt_tokens ?? 0;
      tokOut += r.usage?.completion_tokens ?? 0;
      testoFinale = r.choices[0].message.content ?? null;
    }

    const pulito = sanitizeAnswer(testoFinale ?? "");
    const risposta = pulito.isFullyChainOfThought ? "" : (pulito.cleaned || testoFinale || "").trim();
    if (risposta) await inviaRisposta(numero.id, companyId, contatto.phone, contatto.id, risposta);
    await consumeBudget(admin, companyId, estimateCostEur(modello, tokIn, tokOut));
    return json({ ok: true, risposto: Boolean(risposta), tokens_in: tokIn, tokens_out: tokOut });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      // Al lead non si scrive dei crediti: si avvisa il team.
      await avvisaTeam(admin, companyId, conf.config.utentiDaAvvisare, "Assistente WhatsApp fermo", "I crediti AI sono finiti: un lead ha scritto e non ha ricevuto risposta.", contatto.id);
      return json({ ok: false, reason: "crediti" }, 402);
    }
    console.error(JSON.stringify({ level: "error", fn: "lead-agente-whatsapp", error: String(err) }));
    // Il lead non resta senza risposta in silenzio: lo sa il team.
    await avvisaTeam(admin, companyId, conf.config.utentiDaAvvisare, "Assistente WhatsApp: risposta non inviata", `Un lead ha scritto ma l'assistente non è riuscito a rispondere (${String(err).slice(0, 120)}). Rispondi tu da Conversazioni.`, contatto.id);
    return json({ error: "errore_interno" }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function inviaRisposta(waNumberId: string, companyId: string, to: string, contactId: string, text: string): Promise<void> {
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({ wa_number_id: waNumberId, company_id: companyId, to, text, contact_id: contactId }),
  }).catch((e) => { console.error("[lead-agente] invio fallito:", String(e)); return null; });
  if (res && !res.ok) console.error("[lead-agente] whatsapp-send:", res.status, (await res.text()).slice(0, 300));
}

// deno-lint-ignore no-explicit-any
async function avvisaTeam(admin: any, companyId: string, utenti: string[], titolo: string, testo: string, contactId: string): Promise<void> {
  for (const userId of utenti) {
    await admin.rpc("create_notification", {
      p_company_id: companyId,
      p_user_id: userId,
      p_type: "lead_whatsapp_agente",
      p_title: titolo,
      p_body: testo,
      p_entity_type: "marketing_contact",
      p_entity_id: contactId,
      p_action_url: "/azienda/conversazioni",
    }).then(({ error }: { error: { message: string } | null }) => {
      if (error) console.warn("[lead-agente] notifica:", error.message);
    });
  }
}
