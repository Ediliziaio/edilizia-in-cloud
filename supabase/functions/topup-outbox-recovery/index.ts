// ============================================================================
// topup-outbox-recovery — cron recovery per accrediti auto-topup falliti
// ============================================================================
// P0-4: se in auto-topup-check l'accredito via add_email_credits_with_log
// fallisce (Postgres down transitorio, connection pool esaurito, RLS policy
// errata), la riga in topup_outbox resta con status='failed' e retry_count
// incrementato. Questo cron gira ogni 5 minuti:
//
//   1. Prende fino a 50 righe failed con retry_count < 10 non ancora alertate.
//   2. Per ognuna: ritenta add_email_credits_with_log. Se ok → 'credited'.
//   3. Se retry_count supera 10: invia alert email ai super_admin e marca
//      alerted_at. Non cancella la riga: resta visibile nell'UI admin.
//
// Niente retry-loop interno nella singola esecuzione: ogni turno del cron
// fa UN tentativo per riga. Se un singolo turno retry-loopasse 10 volte
// e tutto Postgres fosse down, la funzione appenderebbe tempo inutilmente.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";

const MAX_BATCH = 50;          // processa max 50 righe per turno
const MAX_RETRIES = 10;         // dopo 10 tentativi: alert super_admin

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  // Auth: accetta x-cron-secret oppure JWT (compat con chiamate manuali admin)
  const cronSecret = Deno.env.get("CRON_SECRET");
  const requestCronSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization");
  if (cronSecret && requestCronSecret !== cronSecret && !authHeader?.startsWith("Bearer ")) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Cerca righe failed che ha senso ri-processare
    const { data: pending, error: fetchErr } = await supabase
      .from("topup_outbox")
      .select("id, company_id, amount_eur, stripe_payment_intent_id, retry_count")
      .eq("status", "failed")
      .lt("retry_count", MAX_RETRIES)
      .order("created_at", { ascending: true })
      .limit(MAX_BATCH);

    if (fetchErr) {
      console.error("topup-outbox-recovery fetch failed:", fetchErr);
      return errorResponse(fetchErr.message, 500);
    }

    let recovered = 0;
    let stillFailed = 0;
    let alerted = 0;

    for (const row of pending ?? []) {
      const { error: rpcErr } = await supabase.rpc("add_email_credits_with_log", {
        p_company_id: row.company_id,
        p_amount: row.amount_eur,
        p_type: "topup",
        p_description: `Auto top-up recovery Stripe PI=${row.stripe_payment_intent_id}`,
        p_metadata: {
          stripe_payment_intent: row.stripe_payment_intent_id,
          auto_topup: true,
          recovered: true,
        },
      });

      if (!rpcErr) {
        await supabase
          .from("topup_outbox")
          .update({ status: "credited", credited_at: new Date().toISOString() })
          .eq("id", row.id);
        recovered++;
        console.log(`Recovered topup ${row.stripe_payment_intent_id} for ${row.company_id}`);
        continue;
      }

      // Ancora fallito: incrementa retry_count e aggiorna last_error.
      const nextRetry = row.retry_count + 1;
      await supabase
        .from("topup_outbox")
        .update({
          retry_count: nextRetry,
          last_error: rpcErr.message ?? String(rpcErr),
        })
        .eq("id", row.id);
      stillFailed++;
      console.warn(`Still failing ${row.stripe_payment_intent_id} attempt ${nextRetry}: ${rpcErr.message}`);
    }

    // Separatamente: righe che hanno raggiunto MAX_RETRIES e non sono ancora
    // state alertate → invia alert ai super_admin.
    const { data: toAlert } = await supabase
      .from("topup_outbox")
      .select("id, company_id, amount_eur, stripe_payment_intent_id, retry_count, last_error")
      .eq("status", "failed")
      .gte("retry_count", MAX_RETRIES)
      .is("alerted_at", null)
      .limit(20);

    if (toAlert && toAlert.length > 0) {
      // Raccogli email dei super_admin via user_roles + auth.users.
      // La view `admin_users_with_roles` non è presente ovunque: usiamo
      // la join manuale su user_roles + auth.admin API (service_role).
      const { data: superAdmins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "super_admin");

      const adminEmails: string[] = [];
      for (const sa of superAdmins ?? []) {
        const { data: u } = await supabase.auth.admin.getUserById(sa.user_id);
        if (u?.user?.email) adminEmails.push(u.user.email);
      }

      if (adminEmails.length > 0) {
        for (const row of toAlert) {
          const html = `
            <h2>⚠️ Auto top-up non accreditato</h2>
            <p>Il pagamento Stripe è riuscito ma l'accredito crediti email
            è fallito dopo ${MAX_RETRIES} tentativi automatici.</p>
            <ul>
              <li><strong>Company:</strong> ${row.company_id}</li>
              <li><strong>Importo:</strong> €${row.amount_eur}</li>
              <li><strong>PaymentIntent:</strong> ${row.stripe_payment_intent_id}</li>
              <li><strong>Ultimo errore:</strong> ${row.last_error ?? "n/a"}</li>
            </ul>
            <p>Intervento manuale richiesto in Supabase → topup_outbox.</p>
          `;
          try {
            await sendEmailUnified({
              companyId: null,
              stream: "transactional",
              to: adminEmails,
              subject: `[ALERT] Auto-topup non accreditato — ${row.company_id.slice(0, 8)}`,
              html,
              templateName: "alert_topup_failed",
              skipCredits: true,
            });
          } catch (alertErr) {
            console.error(`Failed to send topup alert for ${row.id}:`, alertErr);
          }
        }
      } else {
        console.warn("No super_admin emails found — alert skipped");
      }

      // Marca alerted_at per non rimandare lo stesso alert a ogni turno.
      await supabase
        .from("topup_outbox")
        .update({ alerted_at: new Date().toISOString() })
        .in("id", toAlert.map((r) => r.id));
      alerted = toAlert.length;
    }

    return jsonResponse({
      recovered,
      stillFailed,
      alerted,
      scanned: pending?.length ?? 0,
    });
  } catch (err) {
    console.error("topup-outbox-recovery error:", err);
    return errorResponse((err as Error).message, 500);
  }
});
