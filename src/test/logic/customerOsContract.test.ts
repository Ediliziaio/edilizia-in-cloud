import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dataLayerSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20270526200000_customer_os_data_layer.sql"),
  "utf8",
);
const workflowsSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20270526210000_customer_os_workflows.sql"),
  "utf8",
);
const trackEventSrc = readFileSync(
  resolve(process.cwd(), "src/lib/customer-os/trackEvent.ts"),
  "utf8",
);
const profileSrc = readFileSync(
  resolve(process.cwd(), "src/lib/customer-os/customerProfile.ts"),
  "utf8",
);
const healthScoreSrc = readFileSync(
  resolve(process.cwd(), "src/lib/customer-os/healthScore.ts"),
  "utf8",
);
const interactionLogSrc = readFileSync(
  resolve(process.cwd(), "src/lib/customer-os/interactionLog.ts"),
  "utf8",
);
const workflowRunnerSrc = readFileSync(
  resolve(process.cwd(), "src/lib/customer-os/workflowRunner.ts"),
  "utf8",
);
const sofiaEdge = readFileSync(
  resolve(process.cwd(), "supabase/functions/sofia-onboarding/index.ts"),
  "utf8",
);
const giorgioEdge = readFileSync(
  resolve(process.cwd(), "supabase/functions/giorgio-support-triage/index.ts"),
  "utf8",
);
const elenaEdge = readFileSync(
  resolve(process.cwd(), "supabase/functions/elena-cs-health-daily/index.ts"),
  "utf8",
);
const tommasoEdge = readFileSync(
  resolve(process.cwd(), "supabase/functions/tommaso-insight-daily/index.ts"),
  "utf8",
);
const beatriceEdge = readFileSync(
  resolve(process.cwd(), "supabase/functions/beatrice-cfo-daily/index.ts"),
  "utf8",
);
const marcoEdge = readFileSync(
  resolve(process.cwd(), "supabase/functions/marco-sales-postdemo/index.ts"),
  "utf8",
);
const sharedEdge = readFileSync(
  resolve(process.cwd(), "supabase/functions/_customer_os_shared/index.ts"),
  "utf8",
);
const cockpitTabSrc = readFileSync(
  resolve(process.cwd(), "src/pages/admin/cs/CockpitTab.tsx"),
  "utf8",
);
const companyCockpitSrc = readFileSync(
  resolve(process.cwd(), "src/components/admin/company/CompanyAICockpit.tsx"),
  "utf8",
);
const csHubSrc = readFileSync(
  resolve(process.cwd(), "src/pages/admin/cs/AdminCustomerSuccessHub.tsx"),
  "utf8",
);

describe("Customer OS — contract tests", () => {
  describe("Data layer SQL", () => {
    it("crea tutte le tabelle previste", () => {
      expect(dataLayerSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.product_events/);
      expect(dataLayerSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.customer_interactions/);
      expect(dataLayerSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.customer_health_history/);
      expect(dataLayerSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.customer_onboarding/);
      expect(dataLayerSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.customer_usage_daily/);
      expect(dataLayerSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.nps_responses/);
    });

    it("crea customer_profile view con 50+ campi", () => {
      expect(dataLayerSql).toContain("CREATE OR REPLACE VIEW public.customer_profile");
      // Verifica campi chiave
      expect(dataLayerSql).toContain("health_score_latest");
      expect(dataLayerSql).toContain("onboarding_phase");
      expect(dataLayerSql).toContain("is_at_risk");
      expect(dataLayerSql).toContain("is_upsell_candidate");
      expect(dataLayerSql).toContain("login_count_30d");
      expect(dataLayerSql).toContain("sentiment_avg_30d");
    });

    it("get_customer_context RPC esiste con auth check", () => {
      expect(dataLayerSql).toContain("CREATE OR REPLACE FUNCTION public.get_customer_context");
      expect(dataLayerSql).toContain("SECURITY DEFINER");
      expect(dataLayerSql).toContain("public.has_role(auth.uid(), 'super_admin'");
    });

    it("RLS attivata su tutte le tabelle nuove", () => {
      const tables = ["product_events", "customer_interactions", "customer_health_history",
                      "customer_onboarding", "customer_usage_daily", "nps_responses"];
      tables.forEach((t) => {
        expect(dataLayerSql).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
      });
    });

    it("trigger bootstrap onboarding su nuova company", () => {
      expect(dataLayerSql).toContain("bootstrap_customer_onboarding");
      expect(dataLayerSql).toContain("trg_bootstrap_customer_onboarding");
    });

    it("backfill onboarding per aziende esistenti", () => {
      expect(dataLayerSql).toMatch(/INSERT INTO public\.customer_onboarding[\s\S]+?ON CONFLICT[\s\S]+?DO NOTHING/);
    });
  });

  describe("Workflow registry SQL", () => {
    it("crea tabelle customer_workflows + customer_workflow_runs", () => {
      expect(workflowsSql).toContain("CREATE TABLE IF NOT EXISTS public.customer_workflows");
      expect(workflowsSql).toContain("CREATE TABLE IF NOT EXISTS public.customer_workflow_runs");
    });

    it("bootstrap 14 workflow iniziali (le 6 personas × 2-4 workflow)", () => {
      const workflowKeys = [
        "onboarding.kickoff_email",
        "onboarding.day_3_check",
        "onboarding.day_7_first_value",
        "onboarding.day_21_call_offer",
        "support.ticket_triage",
        "support.ticket_auto_reply_faq",
        "cs.daily_health_scoring",
        "cs.at_risk_alert",
        "insight.daily_usage_report",
        "insight.upsell_signal",
        "cfo.daily_kpi_brief",
        "cfo.payment_failed_alert",
        "sales.post_demo_followup",
        "sales.proposal_generator",
      ];
      workflowKeys.forEach((k) => {
        expect(workflowsSql).toContain(`'${k}'`);
      });
    });

    it("enqueue_customer_workflow RPC con cost guard", () => {
      expect(workflowsSql).toContain("CREATE OR REPLACE FUNCTION public.enqueue_customer_workflow");
      expect(workflowsSql).toContain("max_runs_per_day");
      expect(workflowsSql).toContain("max_runs_per_day_exceeded");
    });

    it("complete_workflow_run RPC con cost tracking", () => {
      expect(workflowsSql).toContain("CREATE OR REPLACE FUNCTION public.complete_workflow_run");
      expect(workflowsSql).toContain("tokens_input");
      expect(workflowsSql).toContain("cost_usd");
    });

    it("view customer_workflow_daily_stats per dashboard", () => {
      expect(workflowsSql).toContain("CREATE OR REPLACE VIEW public.customer_workflow_daily_stats");
    });
  });

  describe("Client helpers TS", () => {
    it("trackEvent espone fire-and-forget API + throttling + sanitization", () => {
      expect(trackEventSrc).toContain("export function trackEvent");
      expect(trackEventSrc).toContain("export function trackEventBulk");
      // Throttle anti-spam
      expect(trackEventSrc).toContain("THROTTLE_MS = 500");
      // Sanitize sensitive keys
      expect(trackEventSrc).toContain("FORBIDDEN_PROPERTY_KEYS");
      expect(trackEventSrc).toContain('"password"');
      expect(trackEventSrc).toContain('"iban"');
    });

    it("customerProfile hooks query React Query", () => {
      expect(profileSrc).toContain("export function useCustomerProfile");
      expect(profileSrc).toContain("export function useCustomerProfiles");
      expect(profileSrc).toContain("export function useCustomerContext");
      // Filtri health/onboarding/atRisk
      expect(profileSrc).toContain("healthLabel?: HealthLabel");
      expect(profileSrc).toContain("atRisk?: boolean");
      expect(profileSrc).toContain("upsellCandidate?: boolean");
    });

    it("healthScore formula deterministica + label", () => {
      expect(healthScoreSrc).toContain("export function computeHealthScore");
      expect(healthScoreSrc).toContain("labelFromScore");
      // Max 100 → champion, ≥70 engaged, ≥40 sleeping, ≥20 at_risk, else churned
      expect(healthScoreSrc).toContain('"champion"');
      expect(healthScoreSrc).toContain('"engaged"');
      expect(healthScoreSrc).toContain('"at_risk"');
      expect(healthScoreSrc).toContain('"churned"');
    });

    it("interactionLog supporta tutti i 14 channel + sentiment optional", () => {
      const channels = [
        "email_inbound", "email_outbound",
        "chat_inbound", "chat_outbound",
        "whatsapp_inbound", "whatsapp_outbound",
        "phone_call_inbound", "phone_call_outbound",
        "ticket_created", "ticket_replied", "ticket_resolved",
        "nps_submitted", "demo_completed",
      ];
      channels.forEach((c) => expect(interactionLogSrc).toContain(`"${c}"`));
    });

    it("workflowRunner espone tutte le WorkflowKey", () => {
      const keys = [
        "onboarding.kickoff_email",
        "support.ticket_triage",
        "cs.daily_health_scoring",
        "insight.upsell_signal",
        "cfo.daily_kpi_brief",
        "sales.post_demo_followup",
      ];
      keys.forEach((k) => expect(workflowRunnerSrc).toContain(`"${k}"`));
    });
  });

  describe("Edge functions agenti", () => {
    it("_customer_os_shared esporta utilities core", () => {
      expect(sharedEdge).toContain("export function createAdminClient");
      expect(sharedEdge).toContain("export async function callLLM");
      expect(sharedEdge).toContain("export async function getCustomerContext");
      expect(sharedEdge).toContain("export async function completeWorkflowRun");
      expect(sharedEdge).toContain("export async function verifyServiceRoleOrSuperAdmin");
    });

    it("LLM wrapper supporta routing modelli con cost calc", () => {
      expect(sharedEdge).toContain("MODEL_COSTS");
      expect(sharedEdge).toContain("anthropic/claude-sonnet-4-5");
      expect(sharedEdge).toContain("openai/gpt-4o-mini");
      // Cost calc formula
      expect(sharedEdge).toContain("tokensInput * pricing.in + tokensOutput * pricing.out");
    });

    it("Sofia onboarding system prompt incluso tone Florin + KB ref", () => {
      expect(sofiaEdge).toContain("SOFIA_SYSTEM_PROMPT");
      expect(sofiaEdge).toMatch(/Florin/);
      expect(sofiaEdge).toContain("Niente jargon");
      // Gestisce 4 workflow_key onboarding
      expect(sofiaEdge).toContain("onboarding.kickoff_email");
      expect(sofiaEdge).toContain("onboarding.day_3_check");
      expect(sofiaEdge).toContain("onboarding.day_7_first_value");
      expect(sofiaEdge).toContain("onboarding.day_21_call_offer");
    });

    it("Giorgio support classifica intent + sentiment + severity + FAQ match", () => {
      expect(giorgioEdge).toContain("GIORGIO_SYSTEM_PROMPT");
      expect(giorgioEdge).toContain("faq_match_confidence");
      expect(giorgioEdge).toContain("needs_florin_escalation");
      // Auto-reply solo se faq ≥ 0.9 + sentiment non angry + severity low
      expect(giorgioEdge).toMatch(/faq_match_confidence >= 0\.9[\s\S]+?severity === "low"[\s\S]+?sentiment !== "angry"/);
      // Escalation angry/critical
      expect(giorgioEdge).toMatch(/sentiment === "angry"[\s\S]+?severity === "critical"/);
    });

    it("Elena CS calcola health score deterministico + LLM solo per label change", () => {
      expect(elenaEdge).toContain("computeHealthScore");
      expect(elenaEdge).toContain("labelChanges");
      // LLM solo per critical label change
      expect(elenaEdge).toContain('isCritical');
      // Notifica Florin per at_risk/churned
      expect(elenaEdge).toContain('type: "cs_at_risk"');
    });

    it("Tommaso insight aggrega events + upsell signal weekly", () => {
      expect(tommasoEdge).toContain("insight.daily_usage_report");
      expect(tommasoEdge).toContain("insight.upsell_signal");
      // Aggregazione product_events
      expect(tommasoEdge).toContain("customer_usage_daily");
      // Upsell notification se confidence ≥ 0.6
      expect(tommasoEdge).toContain("parsed.confidence >= 0.6");
    });

    it("Beatrice CFO daily brief + payment failed event handler", () => {
      expect(beatriceEdge).toContain("BEATRICE_SYSTEM_PROMPT");
      expect(beatriceEdge).toContain("cfo.payment_failed_alert");
      // MRR delta 24h / 7d
      expect(beatriceEdge).toContain("delta_7d_pct");
      expect(beatriceEdge).toContain("anomalies");
    });

    it("Marco sales-enable usa KB capabilities per evitare hallucination", () => {
      expect(marcoEdge).toContain("MARCO_SYSTEM_PROMPT");
      expect(marcoEdge).toContain("eic-features-current");
      expect(marcoEdge).toContain("case-studies");
      // Mai promettere feature non in KB
      expect(marcoEdge).toContain("CAPABILITIES_KB");
      // Sempre approval_required (no auto execution)
      expect(marcoEdge).toContain("sales.proposal");
    });
  });

  describe("UI Founder Cockpit", () => {
    it("CockpitTab integra 6 sezioni chiave", () => {
      expect(cockpitTabSrc).toContain("Daily Brief");
      expect(cockpitTabSrc).toContain("at-risk");
      expect(cockpitTabSrc).toContain("Upsell");
      expect(cockpitTabSrc).toContain("Onboarding stalled");
      expect(cockpitTabSrc).toContain("Approva");
      expect(cockpitTabSrc).toContain("Sistema agentico");
    });

    it("CompanyAICockpit drawer mostra 4 tab interne", () => {
      expect(companyCockpitSrc).toContain('value="signals"');
      expect(companyCockpitSrc).toContain('value="interactions"');
      expect(companyCockpitSrc).toContain('value="events"');
      expect(companyCockpitSrc).toContain('value="workflows"');
    });

    it("QuickActions in CompanyAICockpit trigger manuali", () => {
      expect(companyCockpitSrc).toContain("onboarding.day_7_first_value");
      expect(companyCockpitSrc).toContain("cs.daily_health_scoring");
      expect(companyCockpitSrc).toContain("insight.upsell_signal");
      expect(companyCockpitSrc).toContain("sales.proposal_generator");
    });

    it("AdminCustomerSuccessHub include nuova tab Cockpit AI come default", () => {
      expect(csHubSrc).toContain('id: "cockpit"');
      expect(csHubSrc).toContain('"Cockpit AI"');
      // Default attivo
      expect(csHubSrc).toContain('isValidTab(tabParam) ? tabParam : "cockpit"');
    });
  });
});
