import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, getCorsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

/** Verify that the caller is either a cron job (with x-cron-secret) or an authenticated user. */
function verifyCronOrAuth(req: Request): void {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const reqSecret = req.headers.get("x-cron-secret");
  if (cronSecret && reqSecret === cronSecret) return;

  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) return;

  throw new Response(JSON.stringify({ error: "Unauthorized: missing cron secret or JWT" }), {
    status: 401,
    headers: secureHeaders,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    verifyCronOrAuth(req);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const today = now.toISOString().split("T")[0];

    // Fetch all trial companies with their trial end dates
    const { data: trialCompanies, error: trialErr } = await supabase
      .from("companies")
      .select("id, name, trial_ends_at, status")
      .eq("status", "trial")
      .not("trial_ends_at", "is", null);

    if (trialErr) throw trialErr;

    const notifications: Array<{
      company_id: string;
      notification_type: string;
      title: string;
      message: string;
      notification_date: string;
    }> = [];

    for (const company of trialCompanies || []) {
      const trialEnd = new Date(company.trial_ends_at);
      const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000);

      if (daysLeft > 1 && daysLeft <= 3) {
        notifications.push({
          company_id: company.id,
          notification_type: "trial_expiring_3d",
          title: "Il tuo trial scade tra poco",
          message: `Il periodo di prova scade tra ${daysLeft} giorn${daysLeft === 1 ? 'o' : 'i'}. Attiva il tuo abbonamento per continuare.`,
          notification_date: today,
        });
      }

      if (daysLeft === 1) {
        notifications.push({
          company_id: company.id,
          notification_type: "trial_expiring_1d",
          title: "Ultimo giorno di trial!",
          message: "Il tuo periodo di prova scade domani. Attiva subito per non perdere i tuoi dati.",
          notification_date: today,
        });
      }
    }

    // Check for inactive companies (no orders in last 14 days)
    const { data: activeCompanies, error: activeErr } = await supabase
      .from("companies")
      .select("id, name")
      .eq("status", "active");

    if (activeErr) throw activeErr;

    if (activeCompanies && activeCompanies.length > 0) {
      const { data: orderStats } = await supabase
        .rpc("get_company_order_stats");

      const orderMap = new Map<string, string>();
      (orderStats || []).forEach((os: any) => {
        orderMap.set(os.company_id, os.last_order_date);
      });

      for (const company of activeCompanies) {
        const lastOrder = orderMap.get(company.id);
        if (!lastOrder) continue;

        const daysSince = Math.floor((now.getTime() - new Date(lastOrder).getTime()) / 86400000);

        if (daysSince >= 14 && daysSince < 30) {
          notifications.push({
            company_id: company.id,
            notification_type: "inactivity_14d",
            title: "Ti manchiamo!",
            message: "Non hai creato commesse da 2 settimane. Hai bisogno di aiuto?",
            notification_date: today,
          });
        } else if (daysSince >= 30) {
          notifications.push({
            company_id: company.id,
            notification_type: "inactivity_30d",
            title: "Torna a usare la piattaforma",
            message: "Sono passati 30+ giorni dalla tua ultima commessa. Il tuo team ti aspetta!",
            notification_date: today,
          });
        }
      }
    }

    // Upsert notifications (unique on company_id + type + date)
    let inserted = 0;
    for (const n of notifications) {
      const { error } = await supabase
        .from("lifecycle_notifications")
        .upsert(n, { onConflict: "company_id,notification_type,notification_date" });
      if (!error) inserted++;
    }

    // ── Additional lifecycle events with dedup via lifecycle_events_log ──────
    const allCompanies = await supabase
      .from("companies")
      .select("id, name, status, created_at, trial_ends_at, subscription_plan_id")
      .in("status", ["active", "trial"]);

    if (!allCompanies.error && allCompanies.data) {
      // Fetch already-sent events to deduplicate
      const { data: sentEvents } = await supabase
        .from("lifecycle_events_log")
        .select("company_id, event, sent_at")
        .in("company_id", allCompanies.data.map((c) => c.id));

      // Build set of already-sent events (company_id:event)
      const sentSet = new Set(
        (sentEvents || []).map((e: any) => `${e.company_id}:${e.event}`)
      );

      // Get order counts for high_usage check
      const { data: orderCountData } = await supabase
        .rpc("get_company_order_stats");
      const orderCountMap = new Map<string, number>();
      (orderCountData || []).forEach((r: any) => {
        orderCountMap.set(r.company_id, Number(r.total_orders || 0));
      });

      // Get last audit_log for inactive_7d check
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
      const { data: recentActivity } = await supabase
        .from("audit_log")
        .select("company_id, created_at")
        .gte("created_at", sevenDaysAgo)
        .not("company_id", "is", null);
      const activeCompanyIds = new Set((recentActivity || []).map((r: any) => r.company_id));

      const eventsToLog: Array<{ company_id: string; event: string; metadata?: object }> = [];

      for (const company of allCompanies.data) {
        const createdAt = new Date(company.created_at);
        const daysSinceCreation = Math.floor((now.getTime() - createdAt.getTime()) / 86400000);

        // first_week: 7 days after creation
        if (daysSinceCreation >= 7 && daysSinceCreation < 14) {
          const key = `${company.id}:first_week`;
          if (!sentSet.has(key)) {
            eventsToLog.push({ company_id: company.id, event: "first_week" });
            sentSet.add(key);
          }
        }

        // first_month: 30 days after creation
        if (daysSinceCreation >= 30 && daysSinceCreation < 35) {
          const key = `${company.id}:first_month`;
          if (!sentSet.has(key)) {
            eventsToLog.push({ company_id: company.id, event: "first_month" });
            sentSet.add(key);
          }
        }

        // renewal_upcoming: 7 days before trial ends (for trial companies)
        if (company.status === "trial" && company.trial_ends_at) {
          const trialEnd = new Date(company.trial_ends_at);
          const daysToRenewal = Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000);
          if (daysToRenewal === 7) {
            const key = `${company.id}:renewal_upcoming`;
            if (!sentSet.has(key)) {
              eventsToLog.push({
                company_id: company.id, event: "renewal_upcoming",
                metadata: { days_remaining: daysToRenewal },
              });
              sentSet.add(key);
            }
          }
        }

        // high_usage: >200 orders
        const totalOrders = orderCountMap.get(company.id) || 0;
        if (totalOrders > 200) {
          const key = `${company.id}:high_usage`;
          if (!sentSet.has(key)) {
            eventsToLog.push({
              company_id: company.id, event: "high_usage",
              metadata: { total_orders: totalOrders },
            });
            sentSet.add(key);
          }
        }

        // inactive_7d: no activity in last 7 days (active companies only)
        if (company.status === "active" && !activeCompanyIds.has(company.id) && daysSinceCreation > 7) {
          const key = `${company.id}:inactive_7d`;
          // For inactive_7d, use a weekly cooldown by checking current week
          const weekKey = `${company.id}:inactive_7d`;
          const thisWeekSent = (sentEvents || []).some((e: any) => {
            return e.company_id === company.id &&
              e.event === "inactive_7d" &&
              new Date(e.sent_at) > new Date(now.getTime() - 7 * 86400000);
          });
          if (!thisWeekSent) {
            eventsToLog.push({ company_id: company.id, event: "inactive_7d" });
          }
        }
      }

      // Persist new lifecycle events (upsert with dedup index)
      let lifecycleInserted = 0;
      for (const ev of eventsToLog) {
        const { error } = await supabase
          .from("lifecycle_events_log")
          .insert({
            company_id: ev.company_id,
            event: ev.event,
            sent_at: now.toISOString(),
            metadata: ev.metadata || null,
          });
        if (!error) lifecycleInserted++;
      }

      inserted += lifecycleInserted;
    }

    return jsonResponse({
      success: true,
      checked: (trialCompanies?.length || 0) + (activeCompanies?.length || 0),
      notifications_created: inserted,
    });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    console.error("Lifecycle check error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(message, 500);
  }
});
