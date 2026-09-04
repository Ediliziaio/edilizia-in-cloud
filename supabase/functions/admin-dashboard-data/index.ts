/**
 * admin-dashboard-data — Aggregated admin dashboard API
 *
 * Returns all dashboard data in a single request from the
 * admin_dashboard_summary materialized view + recent data.
 *
 * Protected: requires super_admin role.
 * Cache-Control: max-age=300 (5 min) to reduce DB load.
 */

import { getCorsHeaders, secureHeaders, errorResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const corsH = getCorsHeaders(req);
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    // Verify super_admin role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["super_admin", "platform_admin"])
      .maybeSingle();

    if (!roleData) {
      return errorResponse("Accesso riservato ai super admin", 403, corsH);
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const { refresh = false } = body;

    // Optionally force refresh of the materialized view
    if (refresh) {
      await supabaseAdmin.rpc("refresh_admin_dashboard" as never).catch(() => null);
    }

    // Run all queries in parallel for maximum performance
    const [
      summaryRes,
      recentCompaniesRes,
      trialExpiringSoonRes,
      mrrChartRes,
      recentActivityOrdersRes,
      recentActivityTicketsRes,
      dacRes,
      wacRes,
    ] = await Promise.all([
      // Materialized view aggregate
      supabaseAdmin
        .from("admin_dashboard_summary" as never)
        .select("*")
        .limit(1)
        .maybeSingle(),

      // Recent 5 companies
      supabaseAdmin
        .from("companies")
        .select("id, name, email, sector, logo_url, created_at, status")
        .order("created_at", { ascending: false })
        .limit(5),

      // Trials expiring in next 7 days
      supabaseAdmin
        .from("companies")
        .select("id, name, trial_ends_at")
        .eq("status", "trial")
        .not("trial_ends_at", "is", null)
        .lte("trial_ends_at", new Date(Date.now() + 7 * 86400000).toISOString())
        .gte("trial_ends_at", new Date().toISOString())
        .order("trial_ends_at")
        .limit(10),

      // MRR by month (last 12 months) — uses existing RPC
      supabaseAdmin
        .rpc("get_mrr_chart_data" as never)
        .catch(() => ({ data: null, error: null })),

      // Recent orders
      supabaseAdmin
        .from("orders")
        .select("id, titolo, created_at, companies:company_id(name)")
        .order("created_at", { ascending: false })
        .limit(5),

      // Recent tickets
      supabaseAdmin
        .from("tickets")
        .select("id, subject, created_at, companies:company_id(name)")
        .order("created_at", { ascending: false })
        .limit(5),

      // Daily / Weekly Active Companies.
      // Prima leggevano `audit_log`, tabella inesistente: l'errore veniva
      // assorbito dalla Promise.all e i due contatori restavano a 0 per sempre
      // (engagement sempre 0%). La sorgente reale dell'attività è
      // `user_sessions.last_active_at`.
      supabaseAdmin
        .rpc("get_active_companies_count", { p_hours: 24 }),

      // Weekly Active Companies (last 7 days)
      supabaseAdmin
        .rpc("get_active_companies_count", { p_hours: 168 }),
    ]);

    const summary = (summaryRes.data as any) || {};
    const recentCompanies = recentCompaniesRes.data || [];
    const trialExpiringSoon = trialExpiringSoonRes.data || [];

    // Build recent activity array
    const recentActivity = [
      ...(recentActivityOrdersRes.data || []).map((o: any) => ({
        id: o.id,
        type: "order" as const,
        title: o.titolo || "Commessa",
        subtitle: (o.companies as any)?.name || "",
        created_at: o.created_at,
      })),
      ...(recentActivityTicketsRes.data || []).map((t: any) => ({
        id: t.id,
        type: "ticket" as const,
        title: t.subject || "Ticket",
        subtitle: (t.companies as any)?.name || "",
        created_at: t.created_at,
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10);

    // Churn: uscite reali del mese (passaggi di stato registrati), rapportate
    // alla base attiva. La vista non inventa più il numero quando non ci sono
    // eventi di stato.
    const churnRate = summary.total_companies > 0
      ? Math.round((summary.churned_companies_30d / Math.max(summary.active_companies, 1)) * 100 * 10) / 10
      : 0;

    const response = {
      // Summary aggregates
      stats: {
        totalCompanies: summary.total_companies || 0,
        activeCompanies: summary.active_companies || 0,
        trialCompanies: summary.trial_companies || 0,
        suspendedCompanies: summary.suspended_companies || 0,
        newCompanies30d: summary.new_companies_30d || 0,
        totalOrders: 0, // Kept for backward compat - not in materialized view for perf
        totalCustomers: summary.total_users || 0,
        openSupportConversations: summary.open_support_tickets || 0,
        dac: Number(dacRes.data ?? 0),
        wac: Number(wacRes.data ?? 0),
        engagementRate: summary.active_companies > 0
          ? Math.round((Number(dacRes.data ?? 0) / summary.active_companies) * 100)
          : 0,
      },
      mrrStats: {
        // mrr = incassato reale da Stripe (mrr_snapshots), non la somma dei
        // piani assegnati. I due numeri che prima erano confusi in uno solo
        // ora viaggiano separati e la dashboard li mostra affiancati.
        mrr: Number(summary.mrr_eur ?? 0),
        arr: Number(summary.arr_eur ?? 0),
        mrrContrattualizzato: Number(summary.mrr_contrattualizzato_eur ?? 0),
        mrrRegalato: Number(summary.mrr_regalato_eur ?? 0),
        mrrSnapshotDate: summary.mrr_snapshot_date ?? null,
        trialCount: summary.trial_companies || 0,
        trialExpiringSoon: trialExpiringSoon.length,
        trialScadutiNonGestiti: summary.trial_scaduti_non_gestiti || 0,
        churnRate,
        trialConversionRate: summary.trial_conversion_rate === null
          ? null
          : Number(summary.trial_conversion_rate),
        activeCount: summary.active_companies || 0,
        expiredCount: summary.expired_companies || 0,
      },
      mrrChartData: mrrChartRes.data || [],
      recentCompanies,
      recentActivity,
      trialExpiringSoon,
      calculatedAt: summary.calculated_at || new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      headers: {
        ...secureHeaders,
        ...corsH,
        "Content-Type": "application/json",
        "Cache-Control": "max-age=300, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("admin-dashboard-data error:", err);
    const corsH = getCorsHeaders(req);
    return errorResponse((err as Error).message, 500, corsH);
  }
});
