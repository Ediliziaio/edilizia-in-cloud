import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from "../_shared/headers.ts";
import { getCompanyBillingConfig } from "../_shared/billingConfig.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { createOrGetStripeCustomer } from "../_shared/stripeHelpers.ts";
import { assertMetaCompanyAdminAccess, getErrorMessage, getErrorStatus } from "../_shared/metaAuth.ts";
import { conMetriche } from "../_shared/withMetrics.ts";

Deno.serve(conMetriche("create-checkout-session", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const stripeSecretKey = await getPlatformSetting("stripe_secret_key", "STRIPE_SECRET_KEY");

    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: "Stripe non configurato. Aggiungi STRIPE_SECRET_KEY nei secrets." }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Extract user ID
    let userId: string;
    try {
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsError } = await (supabase.auth as any).getClaims(token);
      if (!claimsError && claimsData?.claims?.sub) {
        userId = claimsData.claims.sub;
      } else {
        throw new Error("getClaims failed");
      }
    } catch {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user?.id) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      userId = userData.user.id;
    }

    const body = await req.json();
    const { company_id, type } = body;

    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id è obbligatorio" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Use service role for DB reads
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // ─── SETUP CARD (aggiungi carta senza addebito: sblocca gli strumenti a costo) ───
    // Funziona anche per aziende FREE senza stripe_customer_id: lo crea al volo.
    if (type === "setup_card") {
      const { data: company } = await supabaseAdmin
        .from("companies")
        .select("id, name, email, stripe_customer_id")
        .eq("id", company_id)
        .single();
      if (!company) {
        return new Response(JSON.stringify({ error: "Azienda non trovata" }), {
          status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      let stripeCustomerId: string;
      try {
        stripeCustomerId = await createOrGetStripeCustomer(supabaseAdmin, stripeSecretKey, company);
      } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const appUrl = Deno.env.get("SITE_URL") ?? "https://app.ediliziaincloud.com";
      const returnTo = typeof body.return_to === "string" && body.return_to.startsWith("/")
        ? body.return_to
        : "/azienda/impostazioni/abbonamento";

      const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          customer: stripeCustomerId,
          mode: "setup",
          "payment_method_types[0]": "card",
          // 3D Secure FORZATO, non "quando lo chiede la banca" (default
          // automatic). Questa carta servira' per addebiti off-session
          // (rinnovi e ricariche automatiche): se la si salva senza che il
          // titolare abbia autenticato, l'addebito successivo puo' tornare
          // indietro come authentication_required, e a quel punto non c'e'
          // nessuno davanti allo schermo che possa confermare. Meglio la
          // verifica adesso, mentre l'utente sta guardando.
          "payment_method_options[card][request_three_d_secure]": "any",
          // Dichiara a Stripe che la carta verra' usata a cliente assente:
          // fa raccogliere il mandato giusto insieme all'autenticazione.
          "setup_intent_data[usage]": "off_session",
          success_url: `${appUrl}${returnTo}?card=success`,
          cancel_url: `${appUrl}${returnTo}?card=cancelled`,
          "metadata[company_id]": company_id,
          "metadata[type]": "setup_card",
        }),
      });
      const session = await sessionRes.json();
      if (session.error) {
        return new Response(JSON.stringify({ error: session.error.message }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ url: session.url, session_id: session.id }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // ─── AI SUBSCRIPTION ───
    if (type === "ai_subscription") {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .single();

      if (!profile || profile.company_id !== company_id) {
        const { data: roleData } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "super_admin")
          .maybeSingle();
        if (!roleData) {
          return new Response(JSON.stringify({ error: "Non autorizzato" }), {
            status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }
      }

      const { data: company } = await supabaseAdmin
        .from("companies")
        .select("id, name, email, stripe_customer_id")
        .eq("id", company_id)
        .single();

      if (!company) {
        return new Response(JSON.stringify({ error: "Azienda non trovata" }), {
          status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // Get AI subscription price from platform_settings
      const { data: priceSetting } = await supabaseAdmin
        .from("platform_settings")
        .select("value")
        .eq("key", "ai_subscription_price_eur")
        .maybeSingle();
      let priceEur = parseFloat(priceSetting?.value || "49");

      // Check billing override for monthly fee
      const billingConfig = await getCompanyBillingConfig(supabaseAdmin, company_id, "ai_agents");
      if (billingConfig.isFree) {
        // Service is free — activate subscription directly without Stripe
        await supabaseAdmin.from("ai_subscriptions").upsert({
          company_id,
          status: "active",
          price_eur: 0,
          current_period_end: new Date(Date.now() + 365 * 86400000).toISOString(),
        }, { onConflict: "company_id" });

        return new Response(
          JSON.stringify({ success: true, free: true, message: "Servizio AI attivato gratuitamente" }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      if (billingConfig.monthlyFeeEur != null) {
        priceEur = billingConfig.monthlyFeeEur;
      }

      let stripeCustomerId: string;
      try {
        stripeCustomerId = await createOrGetStripeCustomer(supabaseAdmin, stripeSecretKey, company);
      } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const appUrl = Deno.env.get("SITE_URL") ?? "https://app.ediliziaincloud.com";

      const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          customer: stripeCustomerId,
          mode: "subscription",
          "line_items[0][price_data][currency]": "eur",
          "line_items[0][price_data][unit_amount]": String(Math.round(priceEur * 100)),
          "line_items[0][price_data][recurring][interval]": "month",
          "line_items[0][price_data][product_data][name]": "Agenti AI - Abbonamento Mensile",
          "line_items[0][quantity]": "1",
          success_url: `${appUrl}/azienda/marketing/agente-ai?payment=success`,
          cancel_url: `${appUrl}/azienda/marketing/agente-ai?payment=cancelled`,
          "metadata[company_id]": company_id,
          "metadata[type]": "ai_subscription",
          "metadata[price_eur]": String(priceEur),
        }),
      });
      const session = await sessionRes.json();
      if (session.error) {
        return new Response(JSON.stringify({ error: session.error.message }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ url: session.url, session_id: session.id }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // ─── ADD-ON WHATSAPP BUSINESS (abbonamento mensile a parte dal piano) ───
    // Incluso nei piani da 247 €/mese; gli altri lo pagano qui, al prezzo di
    // platform_feature_flags (chiave "whatsapp"). Lo accende stripe-webhook con
    // un override "addon_stripe:<abbonamento>". Lo compra chi può collegare i
    // numeri: l'amministratore dell'azienda (o il super admin).
    if (type === "whatsapp_addon") {
      const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };
      try {
        await assertMetaCompanyAdminAccess(supabaseAdmin, userId, company_id);
      } catch (err) {
        return new Response(JSON.stringify({ error: getErrorMessage(err) }), { status: getErrorStatus(err), headers });
      }

      // Già attivo (piano, sblocco del super admin, add-on pagato): niente secondo addebito.
      const { data: stato, error: statoErr } = await supabaseAdmin.rpc("resolve_company_feature", {
        p_company_id: company_id,
        p_feature_key: "whatsapp",
      });
      if (statoErr) {
        return new Response(
          JSON.stringify({ error: "Non riesco a verificare WhatsApp per questa azienda: riprova tra poco." }),
          { status: 503, headers },
        );
      }
      const statoRiga = (Array.isArray(stato) ? stato[0] : stato) as { is_enabled?: boolean } | null;
      if (statoRiga?.is_enabled === true) {
        return new Response(JSON.stringify({ already_active: true }), { headers });
      }

      // Spento a mano dal super admin: non si riaccende comprandolo.
      const { data: override } = await supabaseAdmin
        .from("company_feature_overrides")
        .select("access_level, override_reason, expires_at")
        .eq("company_id", company_id)
        .eq("feature_key", "whatsapp")
        .maybeSingle();
      if (
        override?.access_level === "disabled" &&
        !String(override.override_reason ?? "").startsWith("addon_stripe:") &&
        (!override.expires_at || new Date(override.expires_at) > new Date())
      ) {
        return new Response(
          JSON.stringify({ error: "WhatsApp Business è stato disattivato per la tua azienda dall'amministrazione: scrivi all'assistenza per riattivarlo." }),
          { status: 403, headers },
        );
      }

      const { data: company } = await supabaseAdmin
        .from("companies")
        .select("id, name, email, stripe_customer_id")
        .eq("id", company_id)
        .single();
      if (!company) {
        return new Response(JSON.stringify({ error: "Azienda non trovata" }), { status: 404, headers });
      }

      const { data: flag } = await supabaseAdmin
        .from("platform_feature_flags")
        .select("price_per_month")
        .eq("key", "whatsapp")
        .maybeSingle();
      const prezzoEur = Number(flag?.price_per_month ?? 0);
      if (!(prezzoEur > 0)) {
        return new Response(JSON.stringify({ error: "Prezzo dell'add-on WhatsApp non configurato" }), { status: 400, headers });
      }

      let stripeCustomerId: string;
      try {
        stripeCustomerId = await createOrGetStripeCustomer(supabaseAdmin, stripeSecretKey, company);
      } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), { status: 400, headers });
      }

      // Add-on già pagato ma non registrato (webhook in ritardo o fallito): lo
      // si registra adesso invece di aprire un secondo abbonamento.
      const abbonamentiRes = await fetch(
        `https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(stripeCustomerId)}&status=all&limit=100`,
        { headers: { Authorization: `Bearer ${stripeSecretKey}` } },
      );
      const abbonamenti = await abbonamentiRes.json();
      const giaPagato = (abbonamenti?.data ?? []).find(
        (s: { status?: string; metadata?: Record<string, string> }) =>
          s?.metadata?.type === "whatsapp_addon" && ["active", "trialing", "past_due"].includes(String(s.status)),
      ) as { id: string } | undefined;
      if (giaPagato) {
        const { error: registraErr } = await supabaseAdmin.from("company_feature_overrides").upsert(
          {
            company_id,
            feature_key: "whatsapp",
            access_level: "enabled",
            is_enabled: true,
            expires_at: null,
            override_reason: `addon_stripe:${giaPagato.id}`,
            notes: "Add-on WhatsApp Business pagato con Stripe (registrato dal checkout)",
          },
          { onConflict: "company_id,feature_key" },
        );
        if (registraErr) {
          return new Response(JSON.stringify({ error: registraErr.message }), { status: 500, headers });
        }
        return new Response(JSON.stringify({ already_active: true }), { headers });
      }

      const appUrl = Deno.env.get("SITE_URL") ?? "https://app.ediliziaincloud.com";
      const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          customer: stripeCustomerId,
          mode: "subscription",
          "payment_method_types[0]": "card",
          "line_items[0][price_data][currency]": "eur",
          "line_items[0][price_data][unit_amount]": String(Math.round(prezzoEur * 100)),
          "line_items[0][price_data][recurring][interval]": "month",
          "line_items[0][price_data][product_data][name]": "WhatsApp Business (Meta) — add-on mensile",
          "line_items[0][quantity]": "1",
          // Al ritorno la pagina aspetta che il webhook accenda l'add-on.
          success_url: `${appUrl}/azienda/upgrade?addon=whatsapp&pagamento=ok`,
          cancel_url: `${appUrl}/azienda/upgrade?addon=whatsapp&pagamento=annullato`,
          "metadata[company_id]": company_id,
          "metadata[type]": "whatsapp_addon",
          "metadata[price_eur]": String(prezzoEur),
          // Anche sull'abbonamento: disdetta, rinnovi e fatture si riconoscono
          // come add-on e non toccano il piano dell'azienda.
          "subscription_data[metadata][company_id]": company_id,
          "subscription_data[metadata][type]": "whatsapp_addon",
        }),
      });
      const session = await sessionRes.json();
      if (session.error) {
        return new Response(JSON.stringify({ error: session.error.message }), { status: 400, headers });
      }
      return new Response(JSON.stringify({ url: session.url, session_id: session.id }), { headers });
    }

    // ─── EMAIL CREDITS (one-time payment) ───
    if (type === "email_credits") {
      const amountEur = body.amount_eur;
      if (!amountEur || amountEur < 5) {
        return new Response(JSON.stringify({ error: "Importo minimo: €5" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // Verify user belongs to company
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .single();

      if (!profile || profile.company_id !== company_id) {
        // Also allow super_admin
        const { data: roleData } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "super_admin")
          .maybeSingle();
        if (!roleData) {
          return new Response(JSON.stringify({ error: "Non autorizzato" }), {
            status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }
      }

      // Get company
      const { data: company } = await supabaseAdmin
        .from("companies")
        .select("id, name, email, stripe_customer_id")
        .eq("id", company_id)
        .single();

      if (!company) {
        return new Response(JSON.stringify({ error: "Azienda non trovata" }), {
          status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // Create or get Stripe customer
      let stripeCustomerId: string;
      try {
        stripeCustomerId = await createOrGetStripeCustomer(supabaseAdmin, stripeSecretKey, company);
      } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // Build app URL from supabaseUrl
      const appUrl = Deno.env.get("SITE_URL") ?? "https://app.ediliziaincloud.com";

      // Create Checkout Session (one-time payment)
      const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          customer: stripeCustomerId,
          mode: "payment",
          "payment_method_types[0]": "card",
          "line_items[0][price_data][currency]": "eur",
          "line_items[0][price_data][unit_amount]": String(Math.round(amountEur * 100)),
          "line_items[0][price_data][product_data][name]": `Crediti Email - €${amountEur}`,
          "line_items[0][quantity]": "1",
          "payment_intent_data[setup_future_usage]": "off_session",
          success_url: `${appUrl}/azienda/impostazioni/crediti?payment=success`,
          cancel_url: `${appUrl}/azienda/impostazioni/crediti?payment=cancelled`,
          "metadata[company_id]": company_id,
          "metadata[type]": "email_credits",
          "metadata[amount_eur]": String(amountEur),
        }),
      });
      const session = await sessionRes.json();

      if (session.error) {
        return new Response(JSON.stringify({ error: session.error.message }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ url: session.url, session_id: session.id }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // ─── WHATSAPP CREDITS (one-time payment) ───
    if (type === "whatsapp_credits") {
      const amountEur = body.amount_eur;
      if (!amountEur || amountEur < 5) {
        return new Response(JSON.stringify({ error: "Importo minimo: €5" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // Verify user belongs to company
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .single();

      if (!profile || profile.company_id !== company_id) {
        const { data: roleData } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "super_admin")
          .maybeSingle();
        if (!roleData) {
          return new Response(JSON.stringify({ error: "Non autorizzato" }), {
            status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }
      }

      const { data: company } = await supabaseAdmin
        .from("companies")
        .select("id, name, email, stripe_customer_id")
        .eq("id", company_id)
        .single();

      if (!company) {
        return new Response(JSON.stringify({ error: "Azienda non trovata" }), {
          status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      let stripeCustomerId: string;
      try {
        stripeCustomerId = await createOrGetStripeCustomer(supabaseAdmin, stripeSecretKey, company);
      } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const appUrl = Deno.env.get("SITE_URL") ?? "https://app.ediliziaincloud.com";

      const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          customer: stripeCustomerId,
          mode: "payment",
          "payment_method_types[0]": "card",
          "line_items[0][price_data][currency]": "eur",
          "line_items[0][price_data][unit_amount]": String(Math.round(amountEur * 100)),
          "line_items[0][price_data][product_data][name]": `Crediti WhatsApp - €${amountEur}`,
          "line_items[0][quantity]": "1",
          "payment_intent_data[setup_future_usage]": "off_session",
          success_url: `${appUrl}/azienda/impostazioni/crediti?payment=success`,
          cancel_url: `${appUrl}/azienda/impostazioni/crediti?payment=cancelled`,
          "metadata[company_id]": company_id,
          "metadata[type]": "whatsapp_credits",
          "metadata[amount_eur]": String(amountEur),
        }),
      });
      const session = await sessionRes.json();

      if (session.error) {
        return new Response(JSON.stringify({ error: session.error.message }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ url: session.url, session_id: session.id }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // ─── AI CREDITS (one-time payment) ─────────────────────────
    // Stessa struttura di email_credits/whatsapp_credits.
    if (type === "ai_credits") {
      const amountEur = body.amount_eur;
      if (!amountEur || amountEur < 5) {
        return new Response(JSON.stringify({ error: "Importo minimo: €5" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .single();

      if (!profile || profile.company_id !== company_id) {
        const { data: roleData } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "super_admin")
          .maybeSingle();
        if (!roleData) {
          return new Response(JSON.stringify({ error: "Non autorizzato" }), {
            status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }
      }

      const { data: company } = await supabaseAdmin
        .from("companies")
        .select("id, name, email, stripe_customer_id")
        .eq("id", company_id)
        .single();

      if (!company) {
        return new Response(JSON.stringify({ error: "Azienda non trovata" }), {
          status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      let stripeCustomerId: string;
      try {
        stripeCustomerId = await createOrGetStripeCustomer(supabaseAdmin, stripeSecretKey, company);
      } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const appUrl = Deno.env.get("SITE_URL") ?? "https://app.ediliziaincloud.com";

      const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          customer: stripeCustomerId,
          mode: "payment",
          "payment_method_types[0]": "card",
          "line_items[0][price_data][currency]": "eur",
          "line_items[0][price_data][unit_amount]": String(Math.round(amountEur * 100)),
          "line_items[0][price_data][product_data][name]": `Crediti Agenti AI - €${amountEur}`,
          "line_items[0][quantity]": "1",
          "payment_intent_data[setup_future_usage]": "off_session",
          success_url: `${appUrl}/azienda/impostazioni/crediti?payment=success`,
          cancel_url: `${appUrl}/azienda/impostazioni/crediti?payment=cancelled`,
          "metadata[company_id]": company_id,
          "metadata[type]": "ai_credits",
          "metadata[amount_eur]": String(amountEur),
        }),
      });
      const session = await sessionRes.json();

      if (session.error) {
        return new Response(JSON.stringify({ error: session.error.message }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ url: session.url, session_id: session.id }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // ─── RENDER CREDITS (one-time payment, prezzi fissi per pacchetto) ───
    // A differenza degli altri wallet, i render sono "count" non "eur":
    // l'utente sceglie un pacchetto a prezzo fisso scontato. La fonte di
    // verità è render_credit_packs (la stessa da cui la UI legge i tagli):
    // la vecchia mappa hardcoded {10,50,100} rifiutava con 400 i pacchetti
    // attivi da 30 ("Top-up mensile") e 300 ("Render Studio") mostrati nel
    // RechargeDialog — checkout impossibile proprio sui tagli in vendita.
    if (type === "render_credits") {
      const qty = Number(body.qty);
      const { data: packRow } = await supabaseAdmin
        .from("render_credit_packs")
        .select("credits_amount, price_eur, label")
        .eq("is_active", true)
        .eq("credits_amount", Number.isFinite(qty) ? qty : -1)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!packRow) {
        const { data: activePacks } = await supabaseAdmin
          .from("render_credit_packs")
          .select("credits_amount")
          .eq("is_active", true)
          .order("sort_order", { ascending: true });
        const validQty = (activePacks ?? []).map((p: { credits_amount: number }) => p.credits_amount).join(", ");
        return new Response(JSON.stringify({ error: `Pacchetto non valido. Tagli disponibili: ${validQty || "nessuno"}.` }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const pkg = {
        price: Number(packRow.price_eur),
        name: `${packRow.label} — ${packRow.credits_amount} render`,
      };

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .single();

      if (!profile || profile.company_id !== company_id) {
        const { data: roleData } = await supabaseAdmin
          .from("user_roles").select("role")
          .eq("user_id", userId).eq("role", "super_admin").maybeSingle();
        if (!roleData) {
          return new Response(JSON.stringify({ error: "Non autorizzato" }), {
            status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }
      }

      const { data: company } = await supabaseAdmin
        .from("companies")
        .select("id, name, email, stripe_customer_id")
        .eq("id", company_id).single();

      if (!company) {
        return new Response(JSON.stringify({ error: "Azienda non trovata" }), {
          status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      let stripeCustomerId: string;
      try {
        stripeCustomerId = await createOrGetStripeCustomer(supabaseAdmin, stripeSecretKey, company);
      } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const appUrl = Deno.env.get("SITE_URL") ?? "https://app.ediliziaincloud.com";

      const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          customer: stripeCustomerId,
          mode: "payment",
          "payment_method_types[0]": "card",
          "line_items[0][price_data][currency]": "eur",
          "line_items[0][price_data][unit_amount]": String(Math.round(pkg.price * 100)),
          "line_items[0][price_data][product_data][name]": pkg.name,
          "line_items[0][quantity]": "1",
          "payment_intent_data[setup_future_usage]": "off_session",
          success_url: `${appUrl}/azienda/impostazioni/crediti?payment=success`,
          cancel_url: `${appUrl}/azienda/impostazioni/crediti?payment=cancelled`,
          "metadata[company_id]": company_id,
          "metadata[type]": "render_credits",
          "metadata[qty]": String(qty),
          "metadata[price_eur]": String(pkg.price),
        }),
      });
      const session = await sessionRes.json();

      if (session.error) {
        return new Response(JSON.stringify({ error: session.error.message }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ url: session.url, session_id: session.id }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // ─── SUBSCRIPTION CHECKOUT ───
    // Il link lo genera il super admin dalla scheda azienda. L'amministratore
    // dell'azienda può aprirlo da Impostazioni → Abbonamento, ma solo per il piano
    // che gli è stato assegnato e solo se non ha già un abbonamento Stripe in corso.
    const { plan_id, billing_period, promo_code } = body;

    if (!plan_id) {
      return new Response(JSON.stringify({ error: "plan_id è obbligatorio" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Get company
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("id, name, email, stripe_customer_id, subscription_plan_id, stripe_subscription_status, trial_ends_at")
      .eq("id", company_id)
      .single();

    if (companyError || !company) {
      return new Response(JSON.stringify({ error: "Azienda non trovata" }), {
        status: 404,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    const isSuperAdmin = !!roleData;

    if (!isSuperAdmin) {
      // Amministratore dell'azienda: company_admin con il profilo in questa azienda,
      // oppure accesso multi-azienda attivo come company_admin. Lo staff no.
      const [{ data: profilo }, { data: ruoloAdmin }, { data: accesso }] = await Promise.all([
        supabaseAdmin.from("profiles").select("company_id").eq("id", userId).maybeSingle(),
        supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "company_admin").maybeSingle(),
        supabaseAdmin.from("multi_company_access").select("expires_at")
          .eq("user_id", userId).eq("company_id", company_id)
          .eq("status", "active").eq("access_role", "company_admin")
          .maybeSingle(),
      ]);
      const adminDellAzienda =
        (!!ruoloAdmin && profilo?.company_id === company_id) ||
        (!!accesso && (!accesso.expires_at || new Date(accesso.expires_at) > new Date()));

      if (!adminDellAzienda) {
        return new Response(JSON.stringify({ error: "Solo l'amministratore dell'azienda può attivare l'abbonamento" }), {
          status: 403,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      if (company.subscription_plan_id !== plan_id) {
        return new Response(JSON.stringify({ error: "Puoi attivare solo il piano assegnato alla tua azienda" }), {
          status: 403,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      if (["active", "trialing", "past_due"].includes(company.stripe_subscription_status ?? "")) {
        return new Response(JSON.stringify({ error: "L'abbonamento è già attivo: lo gestisci dal portale di fatturazione" }), {
          status: 409,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
    }

    // Get plan
    const priceField = billing_period === "yearly" ? "stripe_price_yearly_id" : "stripe_price_monthly_id";
    const { data: plan, error: planError } = await supabaseAdmin
      .from("subscription_plans")
      .select(`id, name, trial_days, price_monthly, price_yearly, ${priceField}`)
      .eq("id", plan_id)
      .single();

    if (planError || !plan) {
      return new Response(JSON.stringify({ error: "Piano non trovato" }), {
        status: 404,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const stripePriceId = (plan as any)[priceField];
    // Un piano senza prezzo su Stripe (per esempio quello riservato a una sola
    // azienda) si paga col suo importo passato in linea, come fa public-checkout.
    const importoPiano = Number((plan as Record<string, unknown>)[billing_period === "yearly" ? "price_yearly" : "price_monthly"] ?? 0);
    if (!stripePriceId && !(importoPiano > 0)) {
      return new Response(
        JSON.stringify({ error: `Nessun prezzo Stripe configurato per questo piano (${priceField}) e nessun importo nel piano` }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Create or get Stripe customer
    let stripeCustomerId: string;
    try {
      stripeCustomerId = await createOrGetStripeCustomer(supabaseAdmin, stripeSecretKey, company);
    } catch (err) {
      return new Response(JSON.stringify({ error: (err as Error).message }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const appUrl = Deno.env.get("SITE_URL") ?? "https://app.ediliziaincloud.com";

    // Validate promo code if provided
    let stripeCouponId: string | null = null;
    let promoToConsume: { id: unknown; used: number } | null = null;
    if (promo_code) {
      const { data: promoRow } = await supabaseAdmin
        .from("promo_codes" as never)
        .select("id, stripe_coupon_id, discount_type, discount_value, max_uses, used_count, expires_at, is_active")
        .eq("code", (promo_code as string).toUpperCase().trim())
        .eq("is_active", true)
        .maybeSingle() as { data: Record<string, unknown> | null };

      if (promoRow) {
        const now = new Date();
        const expired = promoRow.expires_at ? new Date(promoRow.expires_at as string) < now : false;
        const exhausted = promoRow.max_uses != null && (promoRow.used_count as number) >= (promoRow.max_uses as number);
        if (!expired && !exhausted) {
          stripeCouponId = (promoRow.stripe_coupon_id as string | null) ?? null;
          // Consuma l'uso SOLO dopo che la sessione Stripe è creata (sotto): così
          // un errore di creazione sessione non "brucia" il codice senza sconto.
          promoToConsume = { id: promoRow.id, used: promoRow.used_count as number };
          console.log(`[checkout] Promo code ${promo_code} valid (coupon: ${stripeCouponId})`);
        } else {
          console.warn(`[checkout] Promo code ${promo_code} invalid: expired=${expired} exhausted=${exhausted}`);
        }
      }
    }

    // Chi paga è il cliente: dopo il pagamento torna alla sua pagina Abbonamento
    // (il link generato dall'admin riportava a /admin/aziende/…, che al cliente non si apre).
    const paginaDiRitorno = typeof body.return_to === "string" && /^\/(?!\/)[\w/-]*$/.test(body.return_to)
      ? body.return_to
      : "/azienda/impostazioni/abbonamento";

    // Build checkout params
    const checkoutParams: Record<string, string> = {
      customer: stripeCustomerId,
      mode: "subscription",
      "payment_method_types[0]": "card",
      "payment_method_types[1]": "sepa_debit",
      "line_items[0][quantity]": "1",
      // Forza la raccolta della carta anche quando l'importo è €0 (piano demo):
      // così il cliente lascia comunque la carta e il futuro upgrade a pagamento
      // parte in automatico senza doverla richiedere di nuovo.
      payment_method_collection: "always",
      success_url: `${appUrl}${paginaDiRitorno}?payment=success`,
      cancel_url: `${appUrl}${paginaDiRitorno}?payment=cancelled`,
      "metadata[company_id]": company_id,
      "metadata[plan_id]": plan_id,
    };
    if (stripePriceId) {
      checkoutParams["line_items[0][price]"] = stripePriceId;
    } else {
      checkoutParams["line_items[0][price_data][currency]"] = "eur";
      checkoutParams["line_items[0][price_data][unit_amount]"] = String(Math.round(importoPiano * 100));
      checkoutParams["line_items[0][price_data][recurring][interval]"] = billing_period === "yearly" ? "year" : "month";
      checkoutParams["line_items[0][price_data][product_data][name]"] = `${(plan as Record<string, unknown>).name} — Edilizia in Cloud`;
    }
    // Periodo di prova gratuito (preso dal piano): il cliente non paga per N
    // giorni, ma la carta è già raccolta (payment_method_collection:always) e
    // Stripe addebita automaticamente alla fine del trial.
    const trialDays = Number((plan as Record<string, unknown>).trial_days ?? 0);
    if (isSuperAdmin) {
      if (trialDays > 0) {
        checkoutParams["subscription_data[trial_period_days]"] = String(trialDays);
      }
    } else {
      // Chi attiva da solo il piano assegnato non riceve una prova nuova: se è ancora
      // in prova, il primo addebito parte a fine prova (Stripe vuole almeno 48 ore).
      const fineProva = company.trial_ends_at ? new Date(company.trial_ends_at).getTime() : 0;
      if (fineProva > Date.now() + 48 * 60 * 60 * 1000) {
        checkoutParams["subscription_data[trial_end]"] = String(Math.floor(fineProva / 1000));
      }
    }
    if (stripeCouponId) {
      checkoutParams["discounts[0][coupon]"] = stripeCouponId;
    } else {
      // Allow customers to enter promo codes themselves at checkout
      checkoutParams["allow_promotion_codes"] = "true";
    }
    if (promo_code && !stripeCouponId) {
      checkoutParams["metadata[promo_code_attempted]"] = promo_code;
    }

    // Create Checkout Session
    const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(checkoutParams),
    });
    const session = await sessionRes.json();

    if (session.error) {
      return new Response(JSON.stringify({ error: session.error.message }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Sessione creata con successo: ora è sicuro consumare l'uso del codice promo.
    if (promoToConsume) {
      await supabaseAdmin
        .from("promo_codes" as never)
        .update({ used_count: promoToConsume.used + 1 } as never)
        .eq("id", promoToConsume.id);
    }

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
}));
