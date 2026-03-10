import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { getGoCardlessToken, gcFetch, categorizeTransaction, sleep } from "../_shared/goCardless.ts";

/** Build a deterministic external_transaction_id fallback when provider doesn't supply one */
function buildDeterministicTxId(
  accountId: string,
  tx: any,
): string {
  const parts = [
    accountId,
    tx.bookingDate || tx.valueDate || "nodate",
    tx.transactionAmount?.amount || "0",
    tx.transactionAmount?.currency || "EUR",
    tx.creditorName || tx.debtorName || "",
    (tx.remittanceInformationUnstructured || "").slice(0, 60),
  ];
  // Simple but deterministic hash
  const str = parts.join("|");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `${accountId}_${tx.bookingDate || "nodate"}_${Math.abs(hash).toString(36)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let syncLogId: string | null = null;
  let supabase: any = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing authorization", 401);
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return errorResponse("Unauthorized", 401);

    const body = await req.json().catch(() => ({}));
    let companyId = body.company_id;
    const connectionId = body.connection_id || null; // Fix 1: accept connection_id

    if (!companyId) {
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
      companyId = profile?.company_id;
    }
    if (!companyId) return errorResponse("No company", 400);

    // Create sync log
    const { data: syncLog } = await supabase.from("bank_sync_logs").insert({
      company_id: companyId,
      sync_type: connectionId ? "single" : "manual",
      status: "running",
      triggered_by: user.id,
    }).select("id").single();
    syncLogId = syncLog?.id || null;

    let token = await getGoCardlessToken();
    let totalAccountsSynced = 0;
    let totalTransactionsFetched = 0;
    const errors: string[] = [];

    // Fix 1: filter by connection_id if provided
    let connectionsQuery = supabase
      .from("bank_connections")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", "active");

    if (connectionId) {
      connectionsQuery = connectionsQuery.eq("id", connectionId);
    }

    const { data: connections } = await connectionsQuery;

    for (const conn of connections || []) {
      const { data: accounts } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("connection_id", conn.id)
        .eq("is_active", true);

      for (let i = 0; i < (accounts || []).length; i++) {
        const account = accounts![i];
        if (i > 0) await sleep(500);

        try {
          // Sync balances
          let balResult;
          try {
            balResult = await gcFetch(`/accounts/${account.external_account_id}/balances/`, token);
            token = balResult.token;
          } catch (e: any) {
            if (e.message?.includes("401") || e.message?.includes("expired")) {
              await supabase.from("bank_connections").update({ status: "expired", error_message: "Accesso scaduto" }).eq("id", conn.id);
              errors.push(`Connessione ${conn.institution_name} scaduta`);
              break;
            }
            throw e;
          }

          const balances = balResult.data?.balances || [];
          const available = balances.find((b: any) => b.balanceType === "interimAvailable");
          const booked = balances.find((b: any) => b.balanceType === "closingBooked" || b.balanceType === "interimBooked");

          await supabase.from("bank_accounts").update({
            current_balance: booked ? parseFloat(booked.balanceAmount.amount) : account.current_balance,
            available_balance: available ? parseFloat(available.balanceAmount.amount) : account.available_balance,
            balance_updated_at: new Date().toISOString(),
          }).eq("id", account.id);

          // Sync transactions — dynamic date_from
          const dateFrom = new Date();
          if (conn.last_sync_at) {
            const lastSync = new Date(conn.last_sync_at);
            lastSync.setDate(lastSync.getDate() - 1);
            dateFrom.setTime(lastSync.getTime());
          } else {
            dateFrom.setDate(dateFrom.getDate() - 90);
          }
          const dateTo = new Date();

          const { data: txData, token: t2 } = await gcFetch(
            `/accounts/${account.external_account_id}/transactions/?date_from=${dateFrom.toISOString().split("T")[0]}&date_to=${dateTo.toISOString().split("T")[0]}`,
            token,
          );
          token = t2;

          const allTxGroups = [
            { txs: txData?.transactions?.booked || [], status: "booked" },
            { txs: txData?.transactions?.pending || [], status: "pending" },
          ];

          for (const group of allTxGroups) {
            for (const tx of group.txs) {
              const amount = parseFloat(tx.transactionAmount?.amount || "0");
              const txType = amount >= 0 ? "credit" : "debit";
              const desc = tx.remittanceInformationUnstructured || tx.remittanceInformationUnstructuredArray?.join(" ") || "";
              const { category, icon } = categorizeTransaction(desc, tx.creditorName || "", amount);

              // Fix 3: deterministic external_transaction_id
              const externalTxId = tx.transactionId
                || tx.internalTransactionId
                || buildDeterministicTxId(account.external_account_id, tx);

              // Fix 2: remove ignoreDuplicates to allow updates (pending→booked, etc.)
              await supabase.from("bank_transactions").upsert({
                company_id: companyId,
                account_id: account.id,
                external_transaction_id: externalTxId,
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
                status: group.status,
                category,
                category_icon: icon,
                reference: tx.endToEndId || null,
                metadata: tx,
              }, { onConflict: "company_id,external_transaction_id" });

              totalTransactionsFetched++;
            }
          }

          totalAccountsSynced++;
        } catch (accErr: any) {
          console.error(`Error syncing account ${account.id}:`, accErr);
          errors.push(`Account ${account.iban || account.id}: ${accErr.message}`);
        }
      }

      await supabase.from("bank_connections").update({ last_sync_at: new Date().toISOString() }).eq("id", conn.id);
    }

    if (syncLogId) {
      await supabase.from("bank_sync_logs").update({
        status: errors.length > 0 ? "partial" : "success",
        accounts_synced: totalAccountsSynced,
        transactions_fetched: totalTransactionsFetched,
        error_message: errors.length > 0 ? errors.join("; ") : null,
        completed_at: new Date().toISOString(),
      }).eq("id", syncLogId);
    }

    return jsonResponse({ success: true, accounts_synced: totalAccountsSynced, transactions_fetched: totalTransactionsFetched });
  } catch (e) {
    console.error("bank-sync error:", e);

    // Fix 4: update sync log on crash
    if (syncLogId && supabase) {
      try {
        await supabase.from("bank_sync_logs").update({
          status: "error",
          error_message: e.message || "Errore sconosciuto",
          completed_at: new Date().toISOString(),
        }).eq("id", syncLogId);
      } catch (_) { /* best effort */ }
    }

    return errorResponse(e.message, 500);
  }
});
