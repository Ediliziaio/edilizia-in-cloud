import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { getGoCardlessToken, gcFetch, categorizeTransaction, sleep } from "../_shared/goCardless.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Auth: either service role key in header or authenticated super_admin
    const authHeader = req.headers.get("Authorization");
    const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;

    if (!isServiceRole) {
      if (!authHeader) return errorResponse("Missing authorization", 401);
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (!user) return errorResponse("Unauthorized", 401);
      const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "super_admin").maybeSingle();
      if (!role) return errorResponse("Forbidden", 403);
    }

    // Get all companies with active bank connections
    const { data: activeCompanies } = await supabase
      .from("bank_connections")
      .select("company_id")
      .eq("status", "active");

    const companyIds = [...new Set((activeCompanies || []).map((c: any) => c.company_id))];

    let totalCompanies = 0;
    let totalAccounts = 0;
    let totalTransactions = 0;
    const companyErrors: string[] = [];

    let token = await getGoCardlessToken();

    for (const companyId of companyIds) {
      try {
        // Create sync log
        const { data: syncLog } = await supabase.from("bank_sync_logs").insert({
          company_id: companyId,
          sync_type: "scheduled",
          status: "running",
        }).select("id").single();

        let companySynced = 0;
        let companyTxs = 0;
        const errors: string[] = [];

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

          for (let i = 0; i < (accounts || []).length; i++) {
            const account = accounts![i];
            if (i > 0) await sleep(500);

            try {
              // Balances
              let balResult;
              try {
                balResult = await gcFetch(`/accounts/${account.external_account_id}/balances/`, token);
                token = balResult.token;
              } catch (e: any) {
                if (e.message?.includes("401") || e.message?.includes("expired")) {
                  await supabase.from("bank_connections").update({ status: "expired", error_message: "Accesso scaduto" }).eq("id", conn.id);
                  errors.push(`${conn.institution_name} scaduta`);
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

              // Transactions
              const dateFrom = new Date();
              dateFrom.setDate(dateFrom.getDate() - 30);
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
                    status: group.status,
                    category,
                    category_icon: icon,
                    reference: tx.endToEndId || null,
                    metadata: tx,
                  }, { onConflict: "company_id,external_transaction_id", ignoreDuplicates: true });

                  companyTxs++;
                }
              }

              companySynced++;
            } catch (accErr: any) {
              console.error(`Error syncing account ${account.id}:`, accErr);
              errors.push(`${account.iban || account.id}: ${accErr.message}`);
            }
          }

          await supabase.from("bank_connections").update({ last_sync_at: new Date().toISOString() }).eq("id", conn.id);
        }

        if (syncLog) {
          await supabase.from("bank_sync_logs").update({
            status: errors.length > 0 ? "partial" : "success",
            accounts_synced: companySynced,
            transactions_fetched: companyTxs,
            error_message: errors.length > 0 ? errors.join("; ") : null,
            completed_at: new Date().toISOString(),
          }).eq("id", syncLog.id);
        }

        totalCompanies++;
        totalAccounts += companySynced;
        totalTransactions += companyTxs;
      } catch (compErr: any) {
        console.error(`Error syncing company ${companyId}:`, compErr);
        companyErrors.push(`${companyId}: ${compErr.message}`);
      }
    }

    return jsonResponse({
      success: true,
      companies_synced: totalCompanies,
      accounts_synced: totalAccounts,
      transactions_fetched: totalTransactions,
      errors: companyErrors.length > 0 ? companyErrors : undefined,
    });
  } catch (e) {
    console.error("bank-sync-all-companies error:", e);
    return errorResponse(e.message, 500);
  }
});
