/**
 * marco-sales-postdemo — agente Marco per sales enablement post-demo.
 *
 * Workflows:
 *   - sales.post_demo_followup   (event: demo.completed)
 *     → riassume demo + email follow-up + CRM update
 *   - sales.proposal_generator   (manual trigger)
 *     → genera bozza proposta commerciale con pricing + case study
 *
 * Marco è il SOLO che PUÒ promettere features → deve essere
 * super-conservativo (consulta kb/eic-features-current.md).
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

const MARCO_SYSTEM_PROMPT = `Sei Marco, AI specialist Sales-Enable di EdiliziaInCloud (EiC).

Il tuo job:
1. Dopo una demo, riassumere insights chiave + suggerire next action
2. Generare bozze email follow-up nel tone di Florin
3. Generare bozze proposte commerciali se richiesto

REGOLE CRITICHE:
- Mai promettere feature che non sono in CAPABILITIES_KB (verrai fornito)
- Mai inventare integrazioni
- Mai sparare numeri ROI inventati — usa solo i case study reali in CASE_STUDIES_KB
- Se cliente richiede feature non in KB → flag come "feature_request" + escalate Florin

Tone Florin: diretto, niente "rivoluzionario" / "scopri" / "trasforma".
Esempio buono: "Massimo, dopo la chiamata di ieri mi sembra che il tuo blocco principale sia tracking ODA su cantieri multipli. Su EiC lo risolvi in 3 step: ..."

Output JSON:
{
  "demo_summary": "string max 500 char",
  "key_objections": ["string", ...],
  "pricing_signals": "string (es. 'da 200€/mese pronto', 'price sensitivity alta')",
  "followup_email": {
    "subject": "string max 80 char",
    "body": "string HTML"
  },
  "crm_update": {
    "deal_stage": "lead|qualified|proposal|negotiation|won|lost",
    "estimated_mrr": number,
    "close_probability": 0.0-1.0,
    "next_action": "string max 200 char",
    "next_action_due": "ISO datetime"
  },
  "needs_florin_input": boolean,
  "florin_input_reason": "string|null"
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
    if (!run_id || !company_id) return errorResponse("Missing fields", 400);

    // Carica context cliente + KB capabilities
    const [context, capsKb, caseStudiesKb] = await Promise.all([
      getCustomerContext(supabase, company_id),
      supabase.from("kb_documents").select("title, content").eq("slug", "eic-features-current").maybeSingle(),
      supabase.from("kb_documents").select("title, content").eq("slug", "case-studies").maybeSingle(),
    ]);

    const profile = (context?.profile ?? {}) as Record<string, unknown>;
    const capabilitiesContent = capsKb.data?.content ?? "(KB capabilities mancante — solo basics: gestionale edilizia, commesse, fatturazione, magazzino, dipendenti, AI assistant)";
    const caseStudiesContent = caseStudiesKb.data?.content ?? "(nessun case study disponibile)";

    const demoNotes = (payload?.demo_notes as string) ?? "(no notes provided)";
    const demoDuration = payload?.duration_minutes ?? "?";
    const attendees = payload?.attendees ?? [];

    const userPrompt = `
CUSTOMER:
- Azienda: ${profile.name ?? "?"}
- Plan attuale: ${profile.plan_name ?? "nessuno (lead)"}
- Team size: ${profile.team_size ?? "?"}

DEMO COMPLETED:
- Durata: ${demoDuration} min
- Presenti: ${JSON.stringify(attendees)}
- Note Florin durante demo: """${demoNotes}"""

CAPABILITIES_KB (cosa EiC FA OGGI):
${capabilitiesContent.slice(0, 3000)}

CASE_STUDIES_KB:
${caseStudiesContent.slice(0, 2000)}

TASK ${workflow_key === "sales.proposal_generator" ? "→ GENERA PROPOSTA" : "→ FOLLOWUP POST-DEMO"}:
${workflow_key === "sales.proposal_generator"
  ? "Genera proposta commerciale completa con pricing tier consigliato + 3 features rilevanti + 1 case study + termini."
  : "Genera follow-up email + CRM update per Florin."}

Risposta SOLO JSON.
`;

    const llm = await callLLM({
      model: "anthropic/claude-sonnet-4-5",
      systemPrompt: MARCO_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 1800,
      temperature: 0.4,
    });

    let parsed: Record<string, unknown>;
    try {
      const m = llm.content.match(/\{[\s\S]+\}/);
      if (!m) throw new Error("no_json");
      parsed = JSON.parse(m[0]);
    } catch (e) {
      await completeWorkflowRun(supabase, run_id, "failed", { raw: llm.content }, llm, "parse_failed");
      return errorResponse("Parse failed", 500);
    }

    // ─── Enqueue azione (sempre approval_required per sales — high risk) ──
    await supabase.rpc("silvio_admin_enqueue_action", {
      p_action_type: workflow_key === "sales.proposal_generator" ? "sales.proposal" : "sales.followup_email",
      p_target_company_id: company_id,
      p_payload: {
        workflow_key,
        ...parsed,
        from_persona: "marco_sales",
      },
    });

    // ─── Logga interazione demo_completed ─────────────────────────────
    await supabase.from("customer_interactions").insert({
      company_id,
      channel: "demo_completed",
      direction: "inbound",  // demo è cliente che mostra interesse
      ai_persona_key: "marco_sales",
      subject: `Demo ${profile.name ?? "?"}`,
      body: demoNotes,
      metadata: { workflow_run_id: run_id, ai_summary: parsed.demo_summary, crm: parsed.crm_update },
    });

    await completeWorkflowRun(supabase, run_id, "completed", {
      demo_summary: parsed.demo_summary,
      next_action: (parsed.crm_update as Record<string, unknown>)?.next_action,
      close_probability: (parsed.crm_update as Record<string, unknown>)?.close_probability,
    }, llm);

    return jsonResponse({
      ok: true,
      summary: parsed.demo_summary,
      close_probability: (parsed.crm_update as Record<string, unknown>)?.close_probability,
      cost_usd: llm.costUsd,
    });
  } catch (err) {
    return errorResponse((err as Error).message);
  }
});
