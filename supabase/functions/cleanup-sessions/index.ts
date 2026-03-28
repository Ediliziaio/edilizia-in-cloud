import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Protezione cron: solo chiamate interne con INTERNAL_CRON_SECRET (SEC-013)
  const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
  const requestCronSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || requestCronSecret !== cronSecret) {
    console.error("cleanup-sessions: accesso non autorizzato");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Delete sessions older than 30 days
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from("user_sessions")
      .delete()
      .lt("last_active_at", cutoff)
      .select("id");

    if (error) throw error;

    const deletedCount = data?.length || 0;
    console.log(`Cleaned up ${deletedCount} expired sessions`);

    return new Response(
      JSON.stringify({ success: true, deleted: deletedCount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("cleanup-sessions error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
