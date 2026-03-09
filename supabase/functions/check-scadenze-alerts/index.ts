import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get all companies with alert prefs enabled
    const { data: prefs, error: prefsErr } = await supabase
      .from("scadenza_alert_prefs")
      .select("*")
      .eq("alert_enabled", true);

    if (prefsErr) throw prefsErr;

    const results: { company_id: string; overdue: number; upcoming: number; alerts_sent: number }[] = [];

    for (const pref of (prefs || [])) {
      // Get overdue and upcoming scadenze
      const { data: checkResult, error: checkErr } = await supabase.rpc(
        "check_overdue_and_upcoming_scadenze",
        { p_company_id: pref.company_id }
      );

      if (checkErr) {
        console.error(`Error checking scadenze for ${pref.company_id}:`, checkErr);
        continue;
      }

      const result = checkResult as any;
      let alertsSent = 0;

      // Mark upcoming scadenze as alerted
      if (result.upcoming && result.upcoming.length > 0) {
        const ids = result.upcoming.map((s: any) => s.id);
        await supabase
          .from("scadenze")
          .update({ alert_sent_at: new Date().toISOString() })
          .in("id", ids);
        alertsSent = ids.length;
      }

      // If there's an alert email configured, we could send notifications
      // For now, we just log and update alert_sent_at
      if (pref.alert_email && (result.overdue_count > 0 || alertsSent > 0)) {
        console.log(
          `Company ${pref.company_id}: ${result.overdue_count} overdue, ${alertsSent} upcoming alerts`
        );
      }

      results.push({
        company_id: pref.company_id,
        overdue: result.overdue_count || 0,
        upcoming: alertsSent,
        alerts_sent: alertsSent,
      });
    }

    return jsonResponse({
      message: "Scadenze alerts check completed",
      companies_checked: results.length,
      results,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("check-scadenze-alerts error:", err);
    return errorResponse(err instanceof Error ? err.message : String(err), 500);
  }
});
