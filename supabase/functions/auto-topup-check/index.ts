import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  // Cron/internal auth: require x-cron-secret or valid JWT
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

    // Accept optional company_id to check a specific company, otherwise check all
    let targetCompanyId: string | null = null;
    try {
      const body = await req.json();
      targetCompanyId = body?.company_id || null;
    } catch { /* no body */ }

    // Get all enabled auto-topup configs
    let query = supabase
      .from("company_auto_topup")
      .select("*")
      .eq("enabled", true)
      .eq("wallet_type", "email")
      .not("stripe_payment_method_id", "is", null);

    if (targetCompanyId) {
      query = query.eq("company_id", targetCompanyId);
    }

    const { data: configs, error: configError } = await query;
    if (configError || !configs?.length) {
      return jsonResponse({ processed: 0 });
    }

    let processed = 0;

    for (const config of configs) {
      // P0-3: pre-check anti-race. Se un top-up è stato fatto negli ultimi
      // 10 minuti, salta. Previene la finestra di race tra la chiamata
      // Stripe (2-3s latency) e l'update di last_topup_at quando il cron
      // riparte a 60s di distanza.
      if (config.last_topup_at) {
        const ageMs = Date.now() - new Date(config.last_topup_at).getTime();
        if (ageMs < 10 * 60 * 1000) {
          console.log(`Skip topup for ${config.company_id}: recent topup ${ageMs}ms ago`);
          continue;
        }
      }

      // Get current balance
      const { data: credits } = await supabase
        .from("email_credits")
        .select("balance_eur")
        .eq("company_id", config.company_id)
        .maybeSingle();

      const balance = credits?.balance_eur ?? 0;

      // Check threshold
      if (balance > config.threshold_eur) continue;

      // Get stripe_customer_id
      const { data: company } = await supabase
        .from("companies")
        .select("stripe_customer_id")
        .eq("id", config.company_id)
        .single();

      if (!company?.stripe_customer_id) continue;

      // P0-3: Idempotency-Key Stripe. Stessa chiave → Stripe restituisce
      // lo stesso PaymentIntent invece di crearne uno nuovo, quindi anche
      // se la funzione viene richiamata (cron accavallato, retry) NON si
      // produce un doppio addebito sulla carta del cliente.
      // Granularità oraria: `autotopup_<company_id>_<YYYYMMDDHH>`.
      const now = new Date();
      const idempotencyKey = `autotopup_${config.company_id}_${
        now.getUTCFullYear()
      }${String(now.getUTCMonth() + 1).padStart(2, "0")}${
        String(now.getUTCDate()).padStart(2, "0")
      }${String(now.getUTCHours()).padStart(2, "0")}`;

      // Create PaymentIntent off-session
      try {
        const piRes = await fetch("https://api.stripe.com/v1/payment_intents", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
            "Idempotency-Key": idempotencyKey,
          },
          body: new URLSearchParams({
            amount: String(Math.round(config.topup_amount_eur * 100)),
            currency: "eur",
            customer: company.stripe_customer_id,
            payment_method: config.stripe_payment_method_id,
            off_session: "true",
            confirm: "true",
            "metadata[company_id]": config.company_id,
            "metadata[type]": "auto_topup_email",
          }),
        });

        const pi = await piRes.json();

        if (pi.status === "succeeded") {
          // P0-4: outbox pattern per accredito atomico.
          // Step A: registra il pagamento nell'outbox. La UNIQUE su
          // stripe_payment_intent_id rende l'insert idempotente: se il cron
          // venisse richiamato con lo stesso PI (stessa Idempotency-Key),
          // l'insert fallisce con duplicate ed è atteso.
          const { error: outboxErr } = await supabase
            .from("topup_outbox")
            .insert({
              company_id: config.company_id,
              amount_eur: config.topup_amount_eur,
              stripe_payment_intent_id: pi.id,
              wallet_type: "email",
              status: "pending",
            });

          if (outboxErr && !outboxErr.message.toLowerCase().includes("duplicate")) {
            console.error(`Outbox insert failed for ${config.company_id}:`, outboxErr);
            continue;
          }

          // Step B: tenta l'accredito con retry (3 tentativi, backoff lineare).
          // Il Postgres potrebbe avere connection pool pieno o RLS temporaneamente
          // sbagliata: in entrambi i casi un retry veloce risolve.
          let lastErr: unknown = null;
          for (let attempt = 1; attempt <= 3; attempt++) {
            const { error: rpcErr } = await supabase.rpc("add_email_credits_with_log", {
              p_company_id: config.company_id,
              p_amount: config.topup_amount_eur,
              p_type: "topup",
              p_description: `Auto top-up Stripe PI=${pi.id}`,
              p_metadata: { stripe_payment_intent: pi.id, auto_topup: true },
            });

            if (!rpcErr) {
              // Success path: segna outbox credited + bump last_topup_at.
              await supabase
                .from("topup_outbox")
                .update({ status: "credited", credited_at: new Date().toISOString() })
                .eq("stripe_payment_intent_id", pi.id);
              await supabase
                .from("company_auto_topup")
                .update({ last_topup_at: new Date().toISOString() })
                .eq("id", config.id);
              processed++;
              console.log(`Auto-topup OK for ${config.company_id}: €${config.topup_amount_eur} (attempt ${attempt})`);
              lastErr = null;
              break;
            }

            lastErr = rpcErr;
            // Backoff: 500ms, 1s, 1.5s.
            await new Promise((r) => setTimeout(r, 500 * attempt));
          }

          // Tutti i retry falliti: il cron topup-outbox-recovery riproverà
          // sulla base di status=failed, retry_count incrementato.
          if (lastErr) {
            const errMsg = (lastErr as { message?: string }).message ?? String(lastErr);
            await supabase
              .from("topup_outbox")
              .update({
                status: "failed",
                retry_count: 3,
                last_error: errMsg,
              })
              .eq("stripe_payment_intent_id", pi.id);
            console.error(
              `Topup CREDITING FAILED for ${config.company_id} — outbox marked failed: ${errMsg}`,
            );
          }
        } else {
          console.error(`Auto-topup failed for company ${config.company_id}:`, pi.error?.message || pi.status);
        }
      } catch (e) {
        console.error(`Auto-topup error for company ${config.company_id}:`, e);
      }
    }

    return jsonResponse({ processed });
  } catch (err) {
    console.error("auto-topup-check error:", err);
    return errorResponse((err as Error).message, 500);
  }
});
