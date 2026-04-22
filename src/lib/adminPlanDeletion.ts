import { supabase } from "@/integrations/supabase/client";

export interface PlanDeleteImpact {
  companies: number;
  subscriptions: number;
  logs: number;
  featureDefaults: number;
  blockingReferences: number;
  canDelete: boolean;
}

export async function fetchPlanDeleteImpact(planId: string): Promise<PlanDeleteImpact> {
  const [companiesRes, subscriptionsRes, logsRes, featureDefaultsRes] = await Promise.all([
    supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .eq("subscription_plan_id", planId),
    supabase
      .from("company_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", planId),
    supabase
      .from("subscription_logs")
      .select("id", { count: "exact", head: true })
      .or(`plan_id.eq.${planId},previous_plan_id.eq.${planId}`),
    supabase
      .from("plan_feature_defaults")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", planId),
  ]);

  const firstError =
    companiesRes.error ||
    subscriptionsRes.error ||
    logsRes.error ||
    featureDefaultsRes.error;

  if (firstError) throw firstError;

  const companies = companiesRes.count ?? 0;
  const subscriptions = subscriptionsRes.count ?? 0;
  const logs = logsRes.count ?? 0;
  const featureDefaults = featureDefaultsRes.count ?? 0;
  const blockingReferences = companies + subscriptions + logs;

  return {
    companies,
    subscriptions,
    logs,
    featureDefaults,
    blockingReferences,
    canDelete: blockingReferences === 0,
  };
}

export async function deleteUnusedPlan(planId: string): Promise<void> {
  const impact = await fetchPlanDeleteImpact(planId);

  if (!impact.canDelete) {
    throw new Error(
      "Il piano ha aziende, abbonamenti o storico collegati. Disattivalo e sposta prima i collegamenti."
    );
  }

  const { error } = await supabase
    .from("subscription_plans")
    .delete()
    .eq("id", planId);

  if (error) throw error;
}
