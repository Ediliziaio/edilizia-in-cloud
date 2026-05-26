/**
 * giorgio-support-triage — agente Giorgio per ticket support.
 *
 * Workflows:
 *   - support.ticket_triage         (event: ticket.created)
 *     → classifica intent, sentiment, severity
 *     → cerca FAQ match nel KB
 *     → genera bozza risposta
 *   - support.ticket_auto_reply_faq (event: ticket.classified)
 *     → se FAQ match con confidence > 0.9, risponde da solo
 *
 * Input:
 *   { run_id, workflow_key, company_id, payload: { ticket_id, message, sender_name } }
 */
import {
  createAdminClient,
  callLLM,
  getCustomerContext,
  completeWorkflowRun,
  jsonResponse,
  errorResponse,
  corsResponse,
  verifyServiceRoleOrSuperAdmin,
} from "../_customer_os_shared/index.ts";

const GIORGIO_SYSTEM_PROMPT = `Sei Giorgio, AI specialist Support di EdiliziaInCloud (EiC).

Il tuo job:
1. Classifica ogni nuovo ticket (intent + sentiment + severity)
2. Cerca matching FAQ nel KB (verrà fornita una lista candidate)
3. Genera bozza risposta in italiano

Tone Florin: diretto, empatia se cliente è frustrato, esempi concreti.
- Mai promettere feature che non sai esistono
- Mai inventare procedure
- Se non sai → dichiara "Non sono certo, ti rispondo dopo che ho chiesto a Florin"

Severity:
- low: domanda generica, configurazione, "come si fa X"
- medium: bug riproducibile, blocker workflow
- high: down totale, dato perso, pagamento bloccato
- critical: leggere/scrivere dati altri clienti (security), GDPR

Output JSON valido:
{
  "intent": "string slug es. 'configurazione_email' / 'bug_oda' / 'feature_richiesta'",
  "sentiment": "positive|neutral|frustrated|angry",
  "sentiment_confidence": 0.0-1.0,
  "severity": "low|medium|high|critical",
  "faq_match_confidence": 0.0-1.0,  // 0 se nessun match plausibile
  "reply_draft": "string HTML risposta in italiano",
  "needs_florin_escalation": boolean,
  "escalation_reason": "string|null"
}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const supabase = createAdminClient();
  const auth = await verifyServiceRoleOrSuperAdmin(supabase, req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { run_id, workflow_key, company_id, payload } = body;
    if (!run_id || !company_id || !payload?.ticket_id || !payload?.message) {
      return errorResponse("Missing required fields", 400);
    }

    const context = await getCustomerContext(supabase, company_id);
    const ticketMessage = String(payload.message);

    // ─── Carica FAQ dal KB (semplificato: full text per ora; futuro: embeddings) ──
    const { data: faqDocs } = await supabase
      .from("kb_documents")
      .select("title, content")
      .eq("kind", "faq")
      .limit(20);
    const faqList = (faqDocs ?? [])
      .map((f: { title: string; content: string }) => `- ${f.title}: ${f.content.slice(0, 200)}`)
      .join("\n");

    const userPrompt = `
TICKET INBOUND:
Da: ${payload.sender_name ?? "Cliente"}
Messaggio: """${ticketMessage}"""

CUSTOMER_CONTEXT (sintesi):
- Plan: ${(context?.profile as Record<string, unknown>)?.plan_name ?? "?"}
- Giorni da signup: ${(context?.profile as Record<string, unknown>)?.days_since_signup ?? 0}
- Tickets aperti: ${(context?.profile as Record<string, unknown>)?.tickets_opened_30d ?? 0}
- Health label: ${(context?.profile as Record<string, unknown>)?.health_label_latest ?? "?"}

FAQ CANDIDATI:
${faqList || "(nessuna FAQ disponibile)"}

TASK: Classifica + genera reply_draft seguendo il formato JSON.
`;

    const llm = await callLLM({
      model: "anthropic/claude-sonnet-4-5",
      systemPrompt: GIORGIO_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 1200,
      temperature: 0.4,
    });

    let parsed: {
      intent: string;
      sentiment: string;
      sentiment_confidence: number;
      severity: string;
      faq_match_confidence: number;
      reply_draft: string;
      needs_florin_escalation: boolean;
      escalation_reason: string | null;
    };
    try {
      const jsonMatch = llm.content.match(/\{[\s\S]+\}/);
      if (!jsonMatch) throw new Error("no_json");
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      await completeWorkflowRun(supabase, run_id, "failed", { raw: llm.content }, llm, "parse_failed");
      return errorResponse("Parse failed", 500);
    }

    // Logga interazione inbound (ticket arrivato)
    const { data: interactionRow } = await supabase
      .from("customer_interactions")
      .insert({
        company_id,
        channel: "ticket_created",
        direction: "inbound",
        subject: ticketMessage.slice(0, 200),
        body: ticketMessage,
        sentiment: parsed.sentiment,
        sentiment_confidence: parsed.sentiment_confidence,
        related_ticket_id: payload.ticket_id,
        metadata: {
          intent: parsed.intent,
          severity: parsed.severity,
          ai_classified_by: "giorgio_support",
        },
      })
      .select("id")
      .single();

    // Decide: auto-reply o escalation
    const shouldAutoReply =
      workflow_key === "support.ticket_auto_reply_faq"
      && parsed.faq_match_confidence >= 0.9
      && parsed.severity === "low"
      && parsed.sentiment !== "angry"
      && !parsed.needs_florin_escalation;

    if (shouldAutoReply) {
      await supabase.rpc("silvio_admin_enqueue_action", {
        p_action_type: "ticket.auto_reply",
        p_target_company_id: company_id,
        p_payload: {
          ticket_id: payload.ticket_id,
          reply: parsed.reply_draft,
          rationale: `FAQ match ${(parsed.faq_match_confidence * 100).toFixed(0)}%`,
          from_persona: "giorgio_support",
        },
      });
    } else {
      // Bozza per Florin: enqueue con mode approval_required
      await supabase.rpc("silvio_admin_enqueue_action", {
        p_action_type: "ticket.reply_draft",
        p_target_company_id: company_id,
        p_payload: {
          ticket_id: payload.ticket_id,
          draft: parsed.reply_draft,
          intent: parsed.intent,
          severity: parsed.severity,
          sentiment: parsed.sentiment,
          needs_escalation: parsed.needs_florin_escalation,
          escalation_reason: parsed.escalation_reason,
          from_persona: "giorgio_support",
        },
      });
    }

    // Se angry o critical → ping Florin immediato (notifica separata)
    if (parsed.sentiment === "angry" || parsed.severity === "critical") {
      await supabase.from("notifications").insert({
        recipient_role: "super_admin",
        type: "ticket_critical",
        title: `🚨 Ticket ${parsed.severity}: ${(context?.profile as Record<string, unknown>)?.name}`,
        body: ticketMessage.slice(0, 300),
        metadata: { company_id, ticket_id: payload.ticket_id, sentiment: parsed.sentiment },
      });
    }

    await completeWorkflowRun(supabase, run_id, "completed", {
      intent: parsed.intent,
      severity: parsed.severity,
      sentiment: parsed.sentiment,
      auto_reply_sent: shouldAutoReply,
      interaction_id: interactionRow?.id,
    }, llm);

    return jsonResponse({
      ok: true,
      classification: parsed,
      auto_reply_sent: shouldAutoReply,
      cost_usd: llm.costUsd,
    });
  } catch (err) {
    return errorResponse((err as Error).message);
  }
});
