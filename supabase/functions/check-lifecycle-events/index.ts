import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

      if (daysLeft === 3 || (daysLeft > 0 && daysLeft <= 3)) {
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
      const companyIds = activeCompanies.map((c) => c.id);
      
      // Get last order date per company
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

    return new Response(
      JSON.stringify({ success: true, checked: (trialCompanies?.length || 0) + (activeCompanies?.length || 0), notifications_created: inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Lifecycle check error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
