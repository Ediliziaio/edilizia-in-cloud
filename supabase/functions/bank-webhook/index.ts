import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { getGoCardlessToken, gcFetch, categorizeTransaction, sleep, computeAmountEur, buildDeterministicTxId } from "../_shared/goCardless.ts";
import { verifyHmacSha256 } from "../_shared/webhookSecurity.ts";

/**
 * bank-webhook: Riceve eventi real-time da GoCardless
 * - Nuove transazioni → sync incrementale
 * - Stato account cambiato → aggiorna bank_connections
 * - Connessione revocata → marca come disconnessa
 * Valida firma HMAC-SHA256 via X-GoCardless-Signature (timing-safe, P2-1).
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const rawBody = await req.text();

    // Validazione firma HMAC-SHA256
    const webhookSecret = Deno.env.get("GOCARDLESS_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("GOCARDLESS_WEBHOOK_SECRET non configurato");
      return errorResponse("Webhook secret not configured", 500);
    }

    const signature = req.headers.get("X-GoCardless-Signature");
    const isValid = await verifyHmacSha256(rawBody, signature, webhookSecret);
    if (!isValid) {
      console.error("Invalid webhook signature");
      return errorResponse("Invalid signature", 401);
    }

    const payload = JSON.parse(rawBody);
    const eventType: string = payload.type || '';
    const eventData: Record<string, unknown> = (payload.data as Record<string, unknown>) || {};
    let processedEvents = 0;

    // Inserisci log webhook (Module 8: Webhook Alerts)
    const { data: logEntry } = await supabase
      .from("webhook_logs")
      .insert({
        provider: "gocardless",
        event_type: eventType,
        payload,
        status: "received",
      })
      .select("id")
      .single();
    const logId: string | null = logEntry?.id ?? null;

    // Nuove transazioni disponibili
    if (eventType === 'ACCOUNT_TRANSACTIONS_CREATED') {
      const accountExternalId = eventData.account_id as string | undefined;
      if (accountExternalId) {
        // Trova l'account nel DB
        const { data: account } = await supabase
          .from("bank_accounts")
          .select("id, company_id, connection_id, external_account_id")
          .eq("external_account_id", accountExternalId)
          .eq("is_active", true)
          .maybeSingle();

        if (account) {
          // Sync transazioni per questo account
          try {
            let token = await getGoCardlessToken();
            await sleep(500);

            // Recupera ultime transazioni (ultimi 7 giorni)
            const dateFrom = new Date();
            dateFrom.setDate(dateFrom.getDate() - 7);
            const dateTo = new Date();

            const { data: txData, token: t2 } = await gcFetch(
              `/accounts/${accountExternalId}/transactions/?date_from=${dateFrom.toISOString().split("T")[0]}&date_to=${dateTo.toISOString().split("T")[0]}`,
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

                const externalTxId = tx.transactionId
                  || tx.internalTransactionId
                  || buildDeterministicTxId(accountExternalId, tx);

                const currency = tx.transactionAmount?.currency || "EUR";
                const amount_eur = computeAmountEur(amount, currency);

                await supabase.from("bank_transactions").upsert({
                  company_id: account.company_id,
                  account_id: account.id,
                  external_transaction_id: externalTxId,
                  booking_date: tx.bookingDate || null,
                  value_date: tx.valueDate || null,
                  amount,
                  currency,
                  amount_eur,
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
              }
            }

            // Aggiorna saldi
            const { data: balResult } = await gcFetch(`/accounts/${accountExternalId}/balances/`, token);
            const balances = balResult?.balances || [];
            const available = balances.find((b: any) => b.balanceType === "interimAvailable");
            const booked = balances.find((b: any) => b.balanceType === "closingBooked" || b.balanceType === "interimBooked");

            await supabase.from("bank_accounts").update({
              current_balance: booked ? parseFloat(booked.balanceAmount.amount) : undefined,
              available_balance: available ? parseFloat(available.balanceAmount.amount) : undefined,
              balance_updated_at: new Date().toISOString(),
            }).eq("id", account.id);

            processedEvents++;
          } catch (syncErr: unknown) {
            const syncErrMsg = syncErr instanceof Error ? syncErr.message : String(syncErr);
            console.error(`Webhook sync error for account ${accountExternalId}:`, syncErrMsg);
            // Aggiorna log a 'failed'
            if (logId) {
              await supabase
                .from("webhook_logs")
                .update({ status: "failed", error_message: syncErrMsg })
                .eq("id", logId);
            }
          }
        }
      }
    }

    // Stato account cambiato
    if (eventType === 'ACCOUNT_STATUS_CHANGED') {
      const accountExternalId = eventData.account_id as string | undefined;
      const newStatus = eventData.status as string | undefined;
      if (accountExternalId && newStatus) {
        const { data: account } = await supabase
          .from("bank_accounts")
          .select("id, connection_id")
          .eq("external_account_id", accountExternalId)
          .maybeSingle();

        if (account) {
          if (newStatus === "REVOKED" || newStatus === "SUSPENDED") {
            await supabase
              .from("bank_connections")
              .update({
                status: newStatus === "REVOKED" ? "disconnected" : "expired",
                error_message: `Account ${newStatus.toLowerCase()} da GoCardless`,
              })
              .eq("id", account.connection_id);
          }
          processedEvents++;
        }
      }
    }

    // Requisition revocata o scaduta
    if (eventType === 'REQUISITION_REVOKED' || eventType === 'REQUISITION_EXPIRED') {
      const requisitionId = (eventData.id || eventData.requisition_id) as string | undefined;
      if (requisitionId) {
        await supabase
          .from('bank_connections')
          .update({ status: 'disconnected', error_message: 'Revocato da GoCardless' })
          .eq('requisition_id', requisitionId);
        processedEvents++;
      }
    }

    if (processedEvents === 0) {
      console.log('Unhandled webhook type:', eventType, JSON.stringify(eventData).slice(0, 200));
    }

    // Aggiorna log webhook a 'processed'
    if (logId) {
      await supabase
        .from("webhook_logs")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("id", logId);
    }

    // Rispondi entro 5s (requisito GoCardless)
    return jsonResponse({ success: true, processed: processedEvents });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("bank-webhook error:", errMsg);
    return errorResponse(errMsg, 500);
  }
});
