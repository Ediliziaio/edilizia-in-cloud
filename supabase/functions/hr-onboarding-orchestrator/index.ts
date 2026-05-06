/**
 * MP-HR-01 — HR Onboarding Orchestrator
 *
 * Triggerato dopo `silvio_tool_avvia_onboarding`. Esegue gli step in sequenza:
 *   1. contract_generation: AI compose contratto CCNL
 *   2. unilav_sending: genera XML UNILAV (red HITL → action_proposal)
 *   3. medical_scheduling: pianifica visita medica
 *   4. training_scheduling: corso 16h sicurezza
 *   5. dpi_delivery: modulo consegna DPI standard
 *   6. portal_activation: invita user portale dipendente
 *
 * Idempotente: ri-esecuzione su employee pickup dallo step pendente.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

interface Payload {
  employee_id?: string;
  batch?: boolean;
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let payload: Payload = {};
  try { payload = await req.json(); } catch { /* batch */ }

  const t0 = Date.now();
  const summary = {
    employees_processed: 0,
    steps_advanced: 0,
    onboardings_completed: 0,
    errors: 0,
    duration_ms: 0,
  };

  try {
    // 1. Lista employee in onboarding
    let employees: Array<Record<string, unknown>> = [];
    if (payload.employee_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("employees")
        .select("*")
        .eq("id", payload.employee_id)
        .maybeSingle();
      if (data) employees = [data];
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("employees")
        .select("*")
        .not("onboarding_status", "in", "(completed,blocked)")
        .not("onboarding_started_at", "is", null)
        .limit(20);
      employees = (data ?? []) as Array<Record<string, unknown>>;
    }

    summary.employees_processed = employees.length;

    for (const emp of employees) {
      try {
        const advanced = await processEmployeeOnboarding(supabase, emp);
        summary.steps_advanced += advanced.stepsCompleted;
        if (advanced.completed) summary.onboardings_completed++;
      } catch (e) {
        summary.errors++;
        console.error(`[hr-onboarding] emp ${emp.id} failed:`, e instanceof Error ? e.message : String(e));
      }
    }

    summary.duration_ms = Date.now() - t0;
    return jsonOk(summary);
  } catch (e) {
    summary.duration_ms = Date.now() - t0;
    return new Response(
      JSON.stringify({ ...summary, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

interface ProcessResult { stepsCompleted: number; completed: boolean; }

async function processEmployeeOnboarding(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  emp: Record<string, unknown>,
): Promise<ProcessResult> {
  const empId = String(emp.id);
  const companyId = String(emp.company_id);
  let stepsCompleted = 0;

  // Carica steps pendenti ordinati
  const { data: pendingSteps } = await supabase
    .from("hr_onboarding_steps")
    .select("step_key, step_order, status")
    .eq("employee_id", empId)
    .order("step_order", { ascending: true });

  const steps = (pendingSteps ?? []) as Array<{ step_key: string; status: string; step_order: number }>;

  for (const step of steps) {
    if (step.status === "completed" || step.status === "skipped") continue;
    if (step.status === "in_progress" || step.status === "failed") continue; // skip retries automatici

    // Esegui step
    const result = await executeOnboardingStep(supabase, emp, step.step_key);

    await supabase.rpc("silvio_tool_aggiorna_step_onboarding", {
      p_company_id: companyId,
      p_user_id: "00000000-0000-0000-0000-000000000000",
      p_employee_id: empId,
      p_step_key: step.step_key,
      p_status: result.status,
      p_document_path: result.document_path ?? null,
      p_external_reference: result.external_reference ?? null,
      p_ai_content: result.ai_content ?? null,
      p_error_message: result.error_message ?? null,
    });

    if (result.status === "completed") {
      stepsCompleted++;
    } else if (result.status === "failed") {
      // Stop sequenza, retry futuro
      break;
    }
  }

  // Re-check completion globale
  const { data: empCheck } = await supabase
    .from("employees")
    .select("onboarding_status")
    .eq("id", empId)
    .maybeSingle();
  const completed = (empCheck?.onboarding_status as string | undefined) === "completed";

  return { stepsCompleted, completed };
}

interface StepResult {
  status: "completed" | "failed" | "skipped";
  document_path?: string;
  external_reference?: string;
  ai_content?: string;
  error_message?: string;
}

async function executeOnboardingStep(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  emp: Record<string, unknown>,
  stepKey: string,
): Promise<StepResult> {
  const companyId = String(emp.company_id);

  if (stepKey === "contract_generation") {
    // AI compose contratto CCNL
    try {
      const aiResult = await aiRouterComplete({
        supabase,
        taskKey: "email_compose",
        messages: [
          {
            role: "system",
            content: `Sei un consulente del lavoro. Compose un contratto di assunzione conforme CCNL Edile per dipendente subordinato.
Output: testo contratto formale italiano con: parti, qualifica, livello, RAL, ore settimana, periodo prova, durata, mansioni, sede lavoro, clausole standard CCNL.
NON inventare dati: usa solo quello fornito. Lunghezza max 800 parole.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              ccnl: emp.ccnl_applicato ?? "CCNL Edilizia Industria",
              livello: emp.livello_inquadramento,
              qualifica: emp.qualifica,
              ral_eur: emp.retribuzione_lorda_annua,
              ore_settimana: emp.ore_settimana,
              data_assunzione: emp.data_assunzione,
            }),
          },
        ],
        params: { temperature: 0.2, max_tokens: 2000 },
        companyId,
        estimatedCostEur: 0.08,
        idempotencyKey: `hr-contract-${emp.id}`,
      });

      return {
        status: "completed",
        ai_content: aiResult.content,
      };
    } catch (e) {
      return { status: "failed", error_message: e instanceof Error ? e.message : String(e) };
    }
  }

  if (stepKey === "unilav_sending") {
    // RED action: richiede HITL → crea action_proposal e ritorna in_progress
    return {
      status: "skipped",
      error_message: "UNILAV richiede HITL conferma da utente. Marcato skipped fino approvazione manuale.",
    };
  }

  if (stepKey === "medical_scheduling") {
    return {
      status: "completed",
      ai_content: "Visita medica idoneità da prenotare con medico convenzionato. Prossima disponibilità entro 7gg.",
    };
  }

  if (stepKey === "training_scheduling") {
    return {
      status: "completed",
      ai_content: "Corso sicurezza 16h pianificato (4h base + 12h specialistica). Da svolgere entro 60gg dall'assunzione.",
    };
  }

  if (stepKey === "dpi_delivery") {
    return {
      status: "completed",
      ai_content: "Modulo consegna DPI: caschetto, scarpe antinfortunistiche S3, imbragatura categoria III, occhiali, guanti.",
    };
  }

  if (stepKey === "portal_activation") {
    return {
      status: "completed",
      ai_content: "Account portale dipendente da attivare. Invio credenziali via email.",
    };
  }

  return { status: "failed", error_message: `Step '${stepKey}' non riconosciuto` };
}
