// auto-topup-trigger — ricarica automatica dei wallet (cron orario/15min).
//
// FONTE DI VERITÀ: company_auto_topup (la tabella che l'UI AutoTopupConfig
// scrive). Per ogni config enabled con carta salvata legge il saldo del
// wallet corrispondente; se saldo <= threshold_eur addebita topup_amount_eur
// su Stripe off-session e accredita.
//
// Prima di questo fix il trigger leggeva enable/soglia da
// {email,whatsapp,ai}_credits.auto_recharge_* — colonne MAI scritte dall'UI:
// la configurazione dell'utente veniva ignorata e l'auto-ricarica non
// scattava mai.
//
// Sicurezza addebiti:
//   - Idempotency-Key Stripe a granularità oraria → niente doppia charge su
//     retry/cron accavallati.
//   - Debounce last_topup_at (10 min) come pre-check.
//   - Accredito via RPC con retry; outbox per email (accredito atomico).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { fetchWithTimeout, isTimeoutError } from "../_shared/fetchWithTimeout.ts";

interface WalletDef {
  /** wallet_type in company_auto_topup */
  type: string;
  /** tabella saldo */
  table: string;
  /** RPC di accredito con log (null → update diretto) */
  addFn: string | null;
}

const WALLETS: WalletDef[] = [
  { type: "email", table: "email_credits", addFn: "add_email_credits_with_log" },
  { type: "whatsapp", table: "whatsapp_credits", addFn: "add_whatsapp_credits_with_log" },
  { type: "ai", table: "ai_credits", addFn: null },
];

const DEBOUNCE_MS = 10 * 60 * 1000;

async function getBalance(
  supabase: SupabaseClient,
  table: string,
  companyId: string,
): Promise<number> {
  const { data } = await supabase
    .from(table)
    .select("balance_eur")
    .eq("company_id", companyId)
    .maybeSingle();
  return Number((data as { balance_eur?: number } | null)?.balance_eur ?? 0);
}

/** Accredita il wallet. Per i wallet con RPC usa quella (con log); per gli
 *  altri (ai) update diretto sul saldo. Ritorna true se accreditato. */
async function creditWallet(
  supabase: SupabaseClient,
  wallet: WalletDef,
  companyId: string,
  amount: number,
  piId: string,
): Promise<boolean> {
  if (wallet.addFn) {
    const { error } = await supabase.rpc(wallet.addFn, {
      p_company_id: companyId,
      p_amount: amount,
      p_type: "auto",
      p_description: `Auto top-up Stripe PI=${piId}`,
      p_metadata: { stripe_payment_intent: piId, auto_topup: true },
    });
    return !error;
  }
  // ai_credits: update diretto (nessuna RPC con log disponibile)
  const { data: cur } = await supabase
    .from(wallet.table)
    .select("balance_eur, total_recharged_eur")
    .eq("company_id", companyId)
    .maybeSingle();
  const before = Number((cur as { balance_eur?: number } | null)?.balance_eur ?? 0);
  const recharged = Number((cur as { total_recharged_eur?: number } | null)?.total_recharged_eur ?? 0);
  const { error } = await supabase
    .from(wallet.table)
    .update({
      balance_eur: Number((before + amount).toFixed(4)),
      total_recharged_eur: Number((recharged + amount).toFixed(4)),
      calls_blocked: false,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId);
  return !error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  const requestCronSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization");
  if (cronSecret && requestCronSecret !== cronSecret && !authHeader?.startsWith("Bearer ")) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = await getPlatformSetting("stripe_secret_key", "STRIPE_SECRET_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

    if (!stripeSecretKey) {
      return jsonResponse({ skipped: true, reason: "No STRIPE_SECRET_KEY" });
    }

    // Permette un check mirato su una company (es. dopo ricarica manuale)
    let targetCompanyId: string | null = null;
    try {
      const body = await req.json();
      targetCompanyId = body?.company_id || null;
    } catch { /* no body */ }

    // FONTE DI VERITÀ: company_auto_topup enabled con carta salvata
    let query = supabase
      .from("company_auto_topup")
      .select("id, company_id, wallet_type, threshold_eur, topup_amount_eur, stripe_payment_method_id, last_topup_at")
      .eq("enabled", true)
      .not("stripe_payment_method_id", "is", null);
    if (targetCompanyId) query = query.eq("company_id", targetCompanyId);

    const { data: configs, error: cfgErr } = await query;
    if (cfgErr) return errorResponse(cfgErr.message, 500);
    if (!configs?.length) return jsonResponse({ processed: 0, by_service: {} });

    const byService: Record<string, number> = {};
    let totalProcessed = 0;
    // Motivi degli addebiti non riusciti, riportati nella risposta. Servono
    // perche' questa funzione la invoca pg_cron: senza un riscontro nel corpo
    // della risposta l'unica traccia sarebbe console.error, che da un cron non
    // legge nessuno. Nessun dato sensibile: id azienda, wallet e messaggio
    // Stripe, che e' gia' quello mostrato in fattura.
    const failures: Array<{ company_id: string; wallet: string; reason: string }> = [];

    for (const config of configs as Array<Record<string, unknown>>) {
      const walletType = String(config.wallet_type);
      const wallet = WALLETS.find((w) => w.type === walletType);
      if (!wallet) continue; // render o tipi non ricaricabili

      // Debounce anti-race
      if (config.last_topup_at) {
        const age = Date.now() - new Date(String(config.last_topup_at)).getTime();
        if (age < DEBOUNCE_MS) continue;
      }

      const companyId = String(config.company_id);
      const threshold = Number(config.threshold_eur ?? 5);
      const amount = Number(config.topup_amount_eur ?? 25);

      const balance = await getBalance(supabase, wallet.table, companyId);
      if (balance > threshold) continue;

      const { data: company } = await supabase
        .from("companies")
        .select("stripe_customer_id")
        .eq("id", companyId)
        .maybeSingle();
      const customerId = (company as { stripe_customer_id?: string } | null)?.stripe_customer_id;
      if (!customerId) continue;

      // Idempotency-Key oraria per-(company,wallet): retry/cron accavallati
      // ritornano lo stesso PaymentIntent → nessun doppio addebito.
      const now = new Date();
      const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}${String(now.getUTCHours()).padStart(2, "0")}`;
      const idempotencyKey = `autotopup_${companyId}_${walletType}_${stamp}`;

      let piRes: Response;
      try {
        piRes = await fetchWithTimeout("https://api.stripe.com/v1/payment_intents", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
            "Idempotency-Key": idempotencyKey,
          },
          body: new URLSearchParams({
            amount: String(Math.round(amount * 100)),
            currency: "eur",
            customer: customerId,
            payment_method: String(config.stripe_payment_method_id),
            off_session: "true",
            confirm: "true",
            "metadata[company_id]": companyId,
            "metadata[type]": `auto_topup_${walletType}`,
          }),
          timeoutMs: 30_000,
        });
      } catch (fetchErr) {
        if (isTimeoutError(fetchErr)) {
          console.error(`[auto-topup] Stripe timeout ${companyId}/${walletType} — il prossimo cron ritenta`);
        } else {
          console.error(`[auto-topup] Stripe fetch error ${companyId}/${walletType}:`, (fetchErr as Error).message);
        }
        continue;
      }

      const pi = await piRes.json();
      if (pi.status !== "succeeded") {
        const reason = pi.error?.message || pi.status || `HTTP ${piRes.status}`;
        console.error(`[auto-topup] charge FAILED ${companyId}/${walletType}:`, reason);
        failures.push({ company_id: companyId, wallet: walletType, reason: String(reason) });
        // Il query builder di supabase-js e' un Thenable, NON una Promise: non
        // espone .catch(). Chiamarlo qui faceva esplodere la funzione con
        // "supabase.rpc(...).catch is not a function" PROPRIO sul percorso di
        // gestione dell'errore, trasformando un addebito rifiutato in un 500
        // che interrompeva il ciclo e lasciava le aziende successive
        // inevase. Va incapsulato in un try/catch vero.
        try {
          await supabase.rpc("increment_payment_failure_count", { p_company_id: companyId });
        } catch (rpcErr) {
          console.error(`[auto-topup] increment_payment_failure_count fallita ${companyId}:`, (rpcErr as Error).message);
        }
        continue;
      }

      // Email: accredito atomico via outbox (idempotente su PI). Altri wallet:
      // accredito diretto con retry.
      let credited = false;
      if (walletType === "email") {
        const { error: outboxErr } = await supabase.from("topup_outbox").insert({
          company_id: companyId,
          amount_eur: amount,
          stripe_payment_intent_id: pi.id,
          wallet_type: "email",
          status: "pending",
        });
        if (outboxErr && !outboxErr.message.toLowerCase().includes("duplicate")) {
          console.error(`[auto-topup] outbox insert failed ${companyId}:`, outboxErr.message);
          continue;
        }
      }

      for (let attempt = 1; attempt <= 3 && !credited; attempt++) {
        credited = await creditWallet(supabase, wallet, companyId, amount, pi.id);
        if (!credited) await new Promise((r) => setTimeout(r, 500 * attempt));
      }

      if (credited) {
        if (walletType === "email") {
          await supabase
            .from("topup_outbox")
            .update({ status: "credited", credited_at: new Date().toISOString() })
            .eq("stripe_payment_intent_id", pi.id);
        }
        await supabase
          .from("company_auto_topup")
          .update({ last_topup_at: new Date().toISOString() })
          .eq("id", config.id as string);
        byService[walletType] = (byService[walletType] ?? 0) + 1;
        totalProcessed++;
        console.log(`[auto-topup] OK ${companyId}/${walletType}: €${amount}`);
      } else if (walletType === "email") {
        await supabase
          .from("topup_outbox")
          .update({ status: "failed", retry_count: 3, last_error: "crediting failed after retries" })
          .eq("stripe_payment_intent_id", pi.id);
        console.error(`[auto-topup] CREDITING FAILED ${companyId}/email — outbox marked failed`);
      }
    }

    return jsonResponse({ processed: totalProcessed, by_service: byService, failures });
  } catch (err) {
    console.error("[auto-topup-trigger] error:", err);
    return errorResponse((err as Error).message, 500);
  }
});
