import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from "../_shared/headers.ts";
import { getCompanyBillingConfig } from "../_shared/billingConfig.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { createOrGetStripeCustomer } from "../_shared/stripeHelpers.ts";

Deno.serve(async (req) => {
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

    // ─── SUBSCRIPTION CHECKOUT (existing flow) ───
    const { plan_id, billing_period, promo_code } = body;

    // Verify super_admin for subscription management
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Solo i super admin possono eseguire questa azione" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (!plan_id) {
      return new Response(JSON.stringify({ error: "plan_id è obbligatorio" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Get company
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("id, name, email, stripe_customer_id")
      .eq("id", company_id)
      .single();

    if (companyError || !company) {
      return new Response(JSON.stringify({ error: "Azienda non trovata" }), {
        status: 404,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Get plan
    const priceField = billing_period === "yearly" ? "stripe_price_yearly_id" : "stripe_price_monthly_id";
    const { data: plan, error: planError } = await supabaseAdmin
      .from("subscription_plans")
      .select(`id, name, trial_days, ${priceField}`)
      .eq("id", plan_id)
      .single();

    if (planError || !plan) {
      return new Response(JSON.stringify({ error: "Piano non trovato" }), {
        status: 404,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const stripePriceId = (plan as any)[priceField];
    if (!stripePriceId) {
      return new Response(
        JSON.stringify({ error: `Nessun prezzo Stripe configurato per questo piano (${priceField})` }),
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

    // Build checkout params
    const checkoutParams: Record<string, string> = {
      customer: stripeCustomerId,
      mode: "subscription",
      "payment_method_types[0]": "card",
      "payment_method_types[1]": "sepa_debit",
      "line_items[0][price]": stripePriceId,
      "line_items[0][quantity]": "1",
      // Forza la raccolta della carta anche quando l'importo è €0 (piano demo):
      // così il cliente lascia comunque la carta e il futuro upgrade a pagamento
      // parte in automatico senza doverla richiedere di nuovo.
      payment_method_collection: "always",
      success_url: `${appUrl}/admin/aziende/${company_id}?payment=success`,
      cancel_url: `${appUrl}/admin/aziende/${company_id}?payment=cancelled`,
      "metadata[company_id]": company_id,
      "metadata[plan_id]": plan_id,
    };
    // Periodo di prova gratuito (preso dal piano): il cliente non paga per N
    // giorni, ma la carta è già raccolta (payment_method_collection:always) e
    // Stripe addebita automaticamente alla fine del trial.
    const trialDays = Number((plan as Record<string, unknown>).trial_days ?? 0);
    if (trialDays > 0) {
      checkoutParams["subscription_data[trial_period_days]"] = String(trialDays);
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
});
