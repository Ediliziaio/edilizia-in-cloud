import { corsHeaders, getCorsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsHeaders);
    await requireRole(supabaseAdmin, userId, ["super_admin"], corsHeaders);

    // Query pg_class for public tables without RLS
    const { data: tables, error: queryError } = await supabaseAdmin.rpc("get_tables_without_rls");

    if (queryError) {
      // Fallback: create the RPC if it doesn't exist yet
      console.error("RPC not found, using direct query fallback:", queryError.message);
      return errorResponse("RPC get_tables_without_rls not available. Run the migration first.", 500);
    }

    const tablesWithoutRls = (tables || []) as Array<{ table_name: string }>;

    // Record each missing RLS table as a metric
    if (tablesWithoutRls.length > 0) {
      const metrics = tablesWithoutRls.map((t) => ({
        metric_type: "rls_missing",
        function_name: "check-rls-status",
        error_message: `Tabella senza RLS: public.${t.table_name}`,
        metadata: { table_name: `public.${t.table_name}`, event: "manual_scan" },
      }));

      await supabaseAdmin.from("system_health_metrics").insert(metrics);
    }

    return jsonResponse({
      tables_without_rls: tablesWithoutRls.map((t) => t.table_name),
      count: tablesWithoutRls.length,
      scanned_at: new Date().toISOString(),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("check-rls-status error:", e);
    return errorResponse("Internal server error", 500);
  }
});
