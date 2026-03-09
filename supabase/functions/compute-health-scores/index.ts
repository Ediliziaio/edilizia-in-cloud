import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch all active companies
    const { data: companies, error: compErr } = await supabase
      .from("companies")
      .select("id, name, status, trial_ends_at, created_at, subscription_plan_id")
      .in("status", ["active", "trial"]);

    if (compErr) throw compErr;
    if (!companies?.length) return jsonResponse({ processed: 0 });

    // Fetch health data using existing function
    const { data: healthData } = await supabase.rpc("get_company_health_data");
    const healthMap = new Map((healthData || []).map((h: any) => [h.company_id, h]));

    // Fetch last access data
    const { data: accessData } = await supabase.rpc("get_company_last_access");
    const accessMap = new Map((accessData || []).map((a: any) => [a.company_id, a.last_access]));

    // Fetch user counts
    const { data: userCounts } = await supabase.rpc("get_company_user_counts");
    const userCountMap = new Map((userCounts || []).map((u: any) => [u.company_id, Number(u.user_count)]));

    const now = new Date();
    const scores: any[] = [];

    for (const company of companies) {
      const hd = healthMap.get(company.id);
      const lastAccess = accessMap.get(company.id);
      const userCount = userCountMap.get(company.id) || 0;
      const orderCount = Number(hd?.order_count || 0);
      const ordersLast30d = Number(hd?.orders_last_30d || 0);
      const hasStaff = hd?.has_staff || false;
      const hasCustomers = hd?.has_customers || false;

      // Login score (0-25): based on last access recency
      let loginScore = 0;
      if (lastAccess) {
        const daysSinceAccess = Math.floor((now.getTime() - new Date(lastAccess).getTime()) / 86400000);
        if (daysSinceAccess <= 1) loginScore = 25;
        else if (daysSinceAccess <= 3) loginScore = 20;
        else if (daysSinceAccess <= 7) loginScore = 15;
        else if (daysSinceAccess <= 14) loginScore = 10;
        else if (daysSinceAccess <= 30) loginScore = 5;
      }

      // Orders score (0-25): recent order activity
      let ordersScore = 0;
      if (ordersLast30d >= 5) ordersScore = 25;
      else if (ordersLast30d >= 3) ordersScore = 20;
      else if (ordersLast30d >= 1) ordersScore = 15;
      else if (orderCount > 0) ordersScore = 5;

      // Features score (0-20): usage of platform features
      let featuresScore = 0;
      if (hasCustomers) featuresScore += 10;
      if (hasStaff) featuresScore += 10;

      // Team score (0-15): team size
      let teamScore = 0;
      if (userCount >= 5) teamScore = 15;
      else if (userCount >= 3) teamScore = 12;
      else if (userCount >= 2) teamScore = 8;
      else if (userCount >= 1) teamScore = 4;

      // Engagement score (0-15): overall engagement signals
      let engagementScore = 0;
      if (ordersLast30d > 0 && lastAccess) {
        const recentAccess = (now.getTime() - new Date(lastAccess).getTime()) < 7 * 86400000;
        if (recentAccess && ordersLast30d >= 2) engagementScore = 15;
        else if (recentAccess) engagementScore = 10;
        else engagementScore = 5;
      }

      const totalScore = loginScore + ordersScore + featuresScore + teamScore + engagementScore;
      const health = totalScore >= 60 ? "healthy" : totalScore >= 30 ? "at_risk" : "critical";

      // Churn risk: inverse of score, weighted
      const churnRisk = Math.max(0, Math.min(100, 100 - totalScore));

      // Signals
      const signals: string[] = [];
      if (loginScore === 0) signals.push("no_recent_login");
      if (ordersScore <= 5 && orderCount > 0) signals.push("declining_orders");
      if (ordersScore === 0 && orderCount === 0) signals.push("no_orders_ever");
      if (!hasStaff) signals.push("no_staff_added");
      if (!hasCustomers) signals.push("no_customers_added");
      if (company.status === "trial") {
        const trialEnd = company.trial_ends_at ? new Date(company.trial_ends_at) : null;
        if (trialEnd && (trialEnd.getTime() - now.getTime()) < 3 * 86400000) {
          signals.push("trial_expiring_soon");
        }
      }
      if (churnRisk >= 70) signals.push("high_churn_risk");

      scores.push({
        company_id: company.id,
        score: totalScore,
        health,
        login_score: loginScore,
        orders_score: ordersScore,
        features_score: featuresScore,
        team_score: teamScore,
        engagement_score: engagementScore,
        churn_risk: churnRisk,
        signals,
        calculated_at: now.toISOString(),
      });
    }

    // Upsert all scores
    if (scores.length > 0) {
      const { error: upsertErr } = await supabase
        .from("company_health_scores")
        .upsert(scores, { onConflict: "company_id" });
      if (upsertErr) throw upsertErr;
    }

    return jsonResponse({ processed: scores.length, timestamp: now.toISOString() });
  } catch (err) {
    console.error("compute-health-scores error:", err);
    return errorResponse(err.message || "Internal error", 500);
  }
});
