import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { getGoCardlessToken, gcFetch, sleep } from "../_shared/goCardless.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing authorization", 401);
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return errorResponse("Unauthorized", 401);

    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
    if (!profile?.company_id) return errorResponse("No company", 400);

    const { requisition_id } = await req.json();
    if (!requisition_id) return errorResponse("requisition_id richiesto", 400);

    const { data: connection } = await supabase
      .from("bank_connections")
      .select("*")
      .eq("company_id", profile.company_id)
      .eq("requisition_id", requisition_id)
      .single();

    if (!connection) return errorResponse("Connessione non trovata", 404);

    let token = await getGoCardlessToken();

    // Fetch requisition to get accounts
    const { data: reqData, token: t2 } = await gcFetch(`/requisitions/${requisition_id}/`, token);
    token = t2;

    if (!reqData.accounts || reqData.accounts.length === 0) {
      await supabase.from("bank_connections").update({ status: "error", error_message: reqData?.detail || "Nessun account trovato" }).eq("id", connection.id);
      return errorResponse("Nessun account trovato nella requisition", 400);
    }

    // Process accounts with Promise.allSettled for resilience
    const results = await Promise.allSettled(
      reqData.accounts.map(async (accountId: string, idx: number) => {
        // 500ms delay between accounts
        if (idx > 0) await sleep(500);

        const { data: detailsData, token: t3 } = await gcFetch(`/accounts/${accountId}/details/`, token);
        const details = detailsData?.account || {};

        const { data: balancesData } = await gcFetch(`/accounts/${accountId}/balances/`, t3);
        const balances = balancesData?.balances || [];

        const available = balances.find((b: any) => b.balanceType === "interimAvailable");
        const booked = balances.find((b: any) => b.balanceType === "closingBooked" || b.balanceType === "interimBooked");

        await supabase.from("bank_accounts").upsert({
          company_id: profile.company_id,
          connection_id: connection.id,
          external_account_id: accountId,
          iban: details.iban || null,
          account_name: details.name || details.product || null,
          account_owner_name: details.ownerName || null,
          currency: details.currency || "EUR",
          current_balance: booked ? parseFloat(booked.balanceAmount.amount) : null,
          available_balance: available ? parseFloat(available.balanceAmount.amount) : null,
          balance_updated_at: new Date().toISOString(),
        }, { onConflict: "company_id,external_account_id" });
      }),
    );

    const accountsSynced = results.filter((r) => r.status === "fulfilled").length;
    const errors = results.filter((r) => r.status === "rejected").map((r: any) => r.reason?.message);

    await supabase.from("bank_connections").update({
      status: "active",
      accounts_count: accountsSynced,
      last_sync_at: new Date().toISOString(),
      error_message: errors.length > 0 ? errors.join("; ") : null,
    }).eq("id", connection.id);

    await supabase.from("bank_sync_logs").insert({
      company_id: profile.company_id,
      connection_id: connection.id,
      sync_type: "reconnect",
      status: errors.length > 0 ? "partial" : "success",
      accounts_synced: accountsSynced,
      completed_at: new Date().toISOString(),
      triggered_by: user.id,
    });

    return jsonResponse({ success: true, accounts_count: accountsSynced });
  } catch (e) {
    console.error("bank-connect-complete error:", e);
    return errorResponse(e.message, 500);
  }
});
