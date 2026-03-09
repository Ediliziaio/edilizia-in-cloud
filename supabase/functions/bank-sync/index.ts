import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

function categorize(description: string, creditorName: string): { category: string; icon: string } {
  const text = `${description || ""} ${creditorName || ""}`.toUpperCase();
  if (text.includes("STIPEND")) return { category: "Stipendi", icon: "Users" };
  if (text.includes("AFFITT")) return { category: "Affitti", icon: "Home" };
  if (text.includes("FORNI") || text.includes("SUPPLIER")) return { category: "Fornitori", icon: "Package" };
  if (text.includes("F24") || text.includes("TRIBUT")) return { category: "Tasse & Tributi", icon: "FileText" };
  if (text.includes("UTENZ") || text.includes("ENEL") || text.includes("ENI") || text.includes("LUCE") || text.includes("GAS")) return { category: "Utenze", icon: "Zap" };
  if (text.includes("BANCOMAT") || text.includes("COMMISSIONI")) return { category: "Bancario", icon: "Landmark" };
  return { category: "Non categorizzata", icon: "HelpCircle" };
}

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

    const body = await req.json().catch(() => ({}));
    let companyId = body.company_id;

    if (!companyId) {
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
      companyId = profile?.company_id;
    }
    if (!companyId) return errorResponse("No company", 400);

    // Create sync log
    const { data: syncLog } = await supabase.from("bank_sync_logs").insert({
      company_id: companyId,
      sync_type: "manual",
      status: "running",
      triggered_by: user.id,
    }).select("id").single();

    const secretId = await getPlatformSetting("bank_gocardless_secret_id");
    const secretKey = await getPlatformSetting("bank_gocardless_secret_key");

    const tokenRes = await fetch("https://bankaccountdata.gocardless.com/api/v2/token/new/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret_id: secretId, secret_key: secretKey }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      if (syncLog) await supabase.from("bank_sync_logs").update({ status: "error", error_message: "Token fallito", completed_at: new Date().toISOString() }).eq("id", syncLog.id);
      return errorResponse("Token GoCardless fallito", 500);
    }

    const accessToken = tokenData.access;
    let totalAccountsSynced = 0;
    let totalTransactionsFetched = 0;
    const errors: string[] = [];

    // Get active connections
    const { data: connections } = await supabase
      .from("bank_connections")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", "active");

    for (const conn of connections || []) {
      const { data: accounts } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("connection_id", conn.id)
        .eq("is_active", true);

      for (const account of accounts || []) {
        try {
          // Sync balances
          const balRes = await fetch(`https://bankaccountdata.gocardless.com/api/v2/accounts/${account.external_account_id}/balances/`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (balRes.status === 401) {
            await supabase.from("bank_connections").update({ status: "expired", error_message: "Accesso scaduto" }).eq("id", conn.id);
            errors.push(`Connessione ${conn.institution_name} scaduta`);
            break;
          }

          const balData = await balRes.json();
          const balances = balData?.balances || [];
          const available = balances.find((b: any) => b.balanceType === "interimAvailable");
          const booked = balances.find((b: any) => b.balanceType === "closingBooked" || b.balanceType === "interimBooked");

          await supabase.from("bank_accounts").update({
            current_balance: booked ? parseFloat(booked.balanceAmount.amount) : account.current_balance,
            available_balance: available ? parseFloat(available.balanceAmount.amount) : account.available_balance,
            balance_updated_at: new Date().toISOString(),
          }).eq("id", account.id);

          // Sync transactions
          const dateFrom = new Date();
          dateFrom.setDate(dateFrom.getDate() - 30);
          const dateTo = new Date();

          const txRes = await fetch(
            `https://bankaccountdata.gocardless.com/api/v2/accounts/${account.external_account_id}/transactions/?date_from=${dateFrom.toISOString().split("T")[0]}&date_to=${dateTo.toISOString().split("T")[0]}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const txData = await txRes.json();
          const bookedTxs = txData?.transactions?.booked || [];

          for (const tx of bookedTxs) {
            const amount = parseFloat(tx.transactionAmount?.amount || "0");
            const txType = amount >= 0 ? "credit" : "debit";
            const desc = tx.remittanceInformationUnstructured || tx.remittanceInformationUnstructuredArray?.join(" ") || "";
            const { category, icon } = categorize(desc, tx.creditorName || "");

            await supabase.from("bank_transactions").upsert({
              company_id: companyId,
              account_id: account.id,
              external_transaction_id: tx.transactionId || tx.internalTransactionId || crypto.randomUUID(),
              booking_date: tx.bookingDate || null,
              value_date: tx.valueDate || null,
              amount,
              currency: tx.transactionAmount?.currency || "EUR",
              description: desc,
              creditor_name: tx.creditorName || null,
              debtor_name: tx.debtorName || null,
              creditor_iban: tx.creditorAccount?.iban || null,
              debtor_iban: tx.debtorAccount?.iban || null,
              transaction_type: txType,
              status: "booked",
              category,
              category_icon: icon,
              reference: tx.endToEndId || null,
              metadata: tx,
            }, { onConflict: "company_id,external_transaction_id", ignoreDuplicates: true });

            totalTransactionsFetched++;
          }

          totalAccountsSynced++;
        } catch (accErr) {
          console.error(`Error syncing account ${account.id}:`, accErr);
          errors.push(`Account ${account.iban || account.id}: ${accErr.message}`);
        }
      }

      await supabase.from("bank_connections").update({ last_sync_at: new Date().toISOString() }).eq("id", conn.id);
    }

    // Update sync log
    if (syncLog) {
      await supabase.from("bank_sync_logs").update({
        status: errors.length > 0 ? "partial" : "success",
        accounts_synced: totalAccountsSynced,
        transactions_fetched: totalTransactionsFetched,
        error_message: errors.length > 0 ? errors.join("; ") : null,
        completed_at: new Date().toISOString(),
      }).eq("id", syncLog.id);
    }

    return jsonResponse({ success: true, accounts_synced: totalAccountsSynced, transactions_fetched: totalTransactionsFetched });
  } catch (e) {
    console.error("bank-sync error:", e);
    return errorResponse(e.message, 500);
  }
});
