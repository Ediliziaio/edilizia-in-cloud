/**
 * workflowRunner — client helper per enqueue di workflow agentici.
 *
 * Usato da UI quando un evento utente deve triggerare un workflow:
 *   - "new_ticket" → enqueue support.ticket_triage
 *   - "company.signed" → enqueue onboarding.kickoff_email
 *   - "demo.completed" → enqueue sales.post_demo_followup
 *
 * Il runner backend (cron silvio-action-runner) processa la coda.
 */
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

export type WorkflowKey =
  | "onboarding.kickoff_email"
  | "onboarding.day_3_check"
  | "onboarding.day_7_first_value"
  | "onboarding.day_21_call_offer"
  | "support.ticket_triage"
  | "support.ticket_auto_reply_faq"
  | "cs.daily_health_scoring"
  | "cs.at_risk_alert"
  | "insight.daily_usage_report"
  | "insight.upsell_signal"
  | "cfo.daily_kpi_brief"
  | "cfo.payment_failed_alert"
  | "sales.post_demo_followup"
  | "sales.proposal_generator";

export async function enqueueWorkflow(
  workflowKey: WorkflowKey,
  companyId: string,
  payload?: Record<string, unknown>,
): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sp = supabase as any;
    const { data, error } = await sp.rpc("enqueue_customer_workflow", {
      p_workflow_key: workflowKey,
      p_company_id: companyId,
      p_trigger_payload: payload ?? null,
      p_triggered_by: "manual",
    });
    if (error) {
      logger.warn(`[workflowRunner] enqueue ${workflowKey} failed:`, error.message);
      return null;
    }
    return data as string;
  } catch (err) {
    logger.warn(`[workflowRunner] enqueue threw:`, (err as Error).message);
    return null;
  }
}
