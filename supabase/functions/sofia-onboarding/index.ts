/**
 * sofia-onboarding — agente Sofia per onboarding nuovi clienti.
 *
 * Workflows gestiti:
 *   - onboarding.kickoff_email    (event: company.signed)
 *   - onboarding.day_3_check       (cron daily)
 *   - onboarding.day_7_first_value (cron daily)
 *   - onboarding.day_21_call_offer (cron daily)
 *
 * Input body:
 *   {
 *     run_id: UUID,           // workflow run da completare
 *     workflow_key: string,
 *     company_id: UUID,
 *     payload?: object
 *   }
 *
 * Per scelta, NON manda email direttamente. Genera la bozza + enqueue su
 * silvio_action_queue con mode determinato dal workflow registry.
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

const SOFIA_SYSTEM_PROMPT = `Sei Sofia, AI specialist Onboarding di EdiliziaInCloud (EiC), gestionale per imprese edili italiane.

Il tuo job: portare ogni nuovo cliente da "ho appena firmato" a "uso EiC ogni giorno con valore" in 30 giorni.

Tone: diretto, amichevole-professionale, scrivi come Florin (founder EiC) parlerebbe.
- Niente jargon SaaS ("scopri", "rivoluzionario", "soluzione innovativa")
- Esempi concreti dal cantiere / ufficio edile
- Max 150 parole per email
- Firmate "Sofia del team EiC, in nome di Florin"

Conosci il cliente: leggi il CUSTOMER_CONTEXT per personalizzare ogni email.

Output: SEMPRE in JSON valido:
{
  "subject": "string max 80 char",
  "body": "string HTML",
  "rationale": "perché questa email, 1 frase",
  "next_workflow_trigger": null | "onboarding.day_3_check" | "..."
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

    if (!run_id || !workflow_key || !company_id) {
      return errorResponse("Missing run_id / workflow_key / company_id", 400);
    }

    const context = await getCustomerContext(supabase, company_id);
    if (!context) {
      await completeWorkflowRun(supabase, run_id, "failed", null, null, "customer_context_not_found");
      return errorResponse("customer_context_not_found", 404);
    }

    const userPrompt = buildSofiaPrompt(workflow_key, context, payload);

    const llm = await callLLM({
      model: "anthropic/claude-haiku-4.5",
      systemPrompt: SOFIA_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 1000,
      temperature: 0.7,
    });

    // Parse JSON output
    let parsed: { subject: string; body: string; rationale: string; next_workflow_trigger: string | null };
    try {
      // Trova JSON nel content (Claude a volte mette ```json ... ```)
      const jsonMatch = llm.content.match(/\{[\s\S]+\}/);
      if (!jsonMatch) throw new Error("no_json_in_output");
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      await completeWorkflowRun(supabase, run_id, "failed", { raw_llm_output: llm.content }, llm, "parse_failed: " + (parseErr as Error).message);
      return errorResponse("LLM output not valid JSON", 500);
    }

    // Enqueue email su silvio_action_queue (Florin la approverà o auto se workflow=auto)
    const { data: actionId, error: enqueueErr } = await supabase.rpc("silvio_admin_enqueue_action", {
      p_action_type: "email.outbound.onboarding",
      p_target_company_id: company_id,
      p_payload: {
        workflow_key,
        subject: parsed.subject,
        body: parsed.body,
        rationale: parsed.rationale,
        from_persona: "sofia_onboarding",
      },
    }).single();

    // Log interaction (pending)
    await supabase.from("customer_interactions").insert({
      company_id,
      channel: "email_outbound",
      direction: "outbound",
      ai_persona_key: "sofia_onboarding",
      subject: parsed.subject,
      body: parsed.body,
      metadata: { workflow_key, workflow_run_id: run_id, action_id: actionId },
    });

    await completeWorkflowRun(supabase, run_id, "completed", {
      email_drafted: true,
      subject: parsed.subject,
      next_trigger: parsed.next_workflow_trigger,
      action_id: actionId,
    }, llm);

    return jsonResponse({
      ok: true,
      workflow_key,
      company_id,
      subject: parsed.subject,
      cost_usd: llm.costUsd,
    });
  } catch (err) {
    return errorResponse((err as Error).message);
  }
});

function buildSofiaPrompt(workflowKey: string, context: Record<string, unknown>, payload: unknown): string {
  const profile = (context.profile ?? {}) as Record<string, unknown>;
  const recentEvents = (context.recent_events ?? []) as Array<Record<string, unknown>>;

  const baseInfo = `
CUSTOMER_CONTEXT:
- Nome azienda: ${profile.name ?? "?"}
- Plan: ${profile.plan_name ?? "?"} (${profile.plan_price_monthly ?? 0}€/mese)
- Giorni da signup: ${profile.days_since_signup ?? 0}
- Onboarding phase: ${profile.onboarding_phase ?? "?"}
- Login ultimi 30gg: ${profile.login_count_30d ?? 0}
- Feature usate distinte: ${profile.features_used_30d_count ?? 0}
- Team size: ${profile.team_size ?? 0}
- Ultimi 5 eventi: ${recentEvents.slice(0, 5).map((e) => e.event_name).join(", ")}

EXTRA_PAYLOAD: ${JSON.stringify(payload ?? {})}
`;

  switch (workflowKey) {
    case "onboarding.kickoff_email":
      return baseInfo + `\nTASK: Scrivi email di BENVENUTO. Il cliente ha appena firmato. Obiettivo: rendere il primo login facile. Includi link login + 1 frase su cosa fare per primo. NON pitch features. NON markdown lungo. Firma "Sofia + Florin".`;

    case "onboarding.day_3_check":
      return baseInfo + `\nTASK: Sono passati 3gg. Se login_count_30d=0 → email check-in gentile "tutto ok? serve aiuto?". Se ha già loggato → email "primo step concreto" (es. crea prima commessa). Decidi tu in base ai dati.`;

    case "onboarding.day_7_first_value":
      return baseInfo + `\nTASK: 7gg. Aiutalo a raggiungere FIRST VALUE. Se features_used >= 3 → email "Hai usato X Y Z, ora prova T per chiudere il loop". Se features_used <= 1 → email che propone 1 caso d'uso concreto + tutorial link.`;

    case "onboarding.day_21_call_offer":
      return baseInfo + `\nTASK: 21gg. Se NON in 'graduated' phase → offri call gratuita 15 min con Florin per sbloccarlo. Includi Calendly link placeholder "[CALENDLY_LINK]" che Florin sostituirà.`;

    default:
      return baseInfo + `\nTASK: Workflow ${workflowKey} non riconosciuto. Genera email generica di check-in.`;
  }
}
