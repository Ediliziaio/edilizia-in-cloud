import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { getGoCardlessToken, gcFetch, categorizeTransaction, sleep, computeAmountEur } from "../_shared/goCardless.ts";

/**
 * bank-webhook: Riceve eventi real-time da GoCardless
 * - Nuove transazioni → sync incrementale
 * - Stato account cambiato → aggiorna bank_connections
 * - Connessione revocata → marca come disconnessa
 * Valida firma HMAC-SHA256 via X-GoCardless-Signature
 */

function buildDeterministicTxId(accountId: string, tx: any): string {
  const parts = [
    accountId,
    tx.bookingDate || tx.valueDate || "nodate",
    tx.transactionAmount?.amount || "0",
    tx.transactionAmount?.currency || "EUR",
    tx.creditorName || tx.debtorName || "",
    (tx.remittanceInformationUnstructured || "").slice(0, 60),
  ];
  const str = parts.join("|");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `${accountId}_${tx.bookingDate || "nodate"}_${Math.abs(hash).toString(36)}`;
}

async function verifySignature(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return expected === signature;
}

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
    const isValid = await verifySignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      console.error("Invalid webhook signature");
      return errorResponse("Invalid signature", 401);
    }

    const payload = JSON.parse(rawBody);
    let processedEvents = 0;

    // Evento: nuove transazioni disponibili
    if (payload.transactions) {
      for (const event of payload.transactions) {
        const accountExternalId = event.account_id;
        if (!accountExternalId) continue;

        // Trova l'account nel DB
        const { data: account } = await supabase
          .from("bank_accounts")
          .select("id, company_id, connection_id, external_account_id")
          .eq("external_account_id", accountExternalId)
          .eq("is_active", true)
          .maybeSingle();

        if (!account) continue;

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
        } catch (syncErr: any) {
          console.error(`Webhook sync error for account ${accountExternalId}:`, syncErr);
        }
      }
    }

    // Evento: stato account cambiato
    if (payload.accounts_status_updated) {
      for (const event of payload.accounts_status_updated) {
        const { account_id, status: newStatus } = event;
        if (!account_id) continue;

        const { data: account } = await supabase
          .from("bank_accounts")
          .select("id, connection_id")
          .eq("external_account_id", account_id)
          .maybeSingle();

        if (!account) continue;

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

    // Rispondi entro 5s (requisito GoCardless)
    return jsonResponse({ success: true, processed: processedEvents });
  } catch (e) {
    console.error("bank-webhook error:", e);
    return errorResponse(e.message, 500);
  }
});
