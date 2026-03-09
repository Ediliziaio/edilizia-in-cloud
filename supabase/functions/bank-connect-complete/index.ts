import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

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

    // Find connection
    const { data: connection } = await supabase
      .from("bank_connections")
      .select("*")
      .eq("company_id", profile.company_id)
      .eq("requisition_id", requisition_id)
      .single();

    if (!connection) return errorResponse("Connessione non trovata", 404);

    const secretId = await getPlatformSetting("bank_gocardless_secret_id");
    const secretKey = await getPlatformSetting("bank_gocardless_secret_key");

    // Get token
    const tokenRes = await fetch("https://bankaccountdata.gocardless.com/api/v2/token/new/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret_id: secretId, secret_key: secretKey }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) return errorResponse("Token GoCardless fallito", 500);

    const accessToken = tokenData.access;

    // Fetch requisition to get accounts
    const reqRes = await fetch(`https://bankaccountdata.gocardless.com/api/v2/requisitions/${requisition_id}/`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const reqData = await reqRes.json();

    if (!reqRes.ok || !reqData.accounts) {
      await supabase.from("bank_connections").update({ status: "error", error_message: reqData?.detail || "Nessun account trovato" }).eq("id", connection.id);
      return errorResponse("Nessun account trovato nella requisition", 400);
    }

    let accountsSynced = 0;

    for (const accountId of reqData.accounts) {
      try {
        // Fetch account details
        const detailsRes = await fetch(`https://bankaccountdata.gocardless.com/api/v2/accounts/${accountId}/details/`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const detailsData = await detailsRes.json();
        const details = detailsData?.account || {};

        // Fetch balances
        const balancesRes = await fetch(`https://bankaccountdata.gocardless.com/api/v2/accounts/${accountId}/balances/`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const balancesData = await balancesRes.json();
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

        accountsSynced++;
      } catch (accErr) {
        console.error(`Error syncing account ${accountId}:`, accErr);
      }
    }

    // Update connection
    await supabase.from("bank_connections").update({
      status: "active",
      accounts_count: accountsSynced,
      last_sync_at: new Date().toISOString(),
      error_message: null,
    }).eq("id", connection.id);

    // Log sync
    await supabase.from("bank_sync_logs").insert({
      company_id: profile.company_id,
      connection_id: connection.id,
      sync_type: "reconnect",
      status: "success",
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
