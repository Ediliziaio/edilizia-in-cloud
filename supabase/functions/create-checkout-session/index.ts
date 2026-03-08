import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { corsHeaders, secureHeaders } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: "Stripe non configurato. Aggiungi STRIPE_SECRET_KEY nei secrets." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = userData.user.id;
    }

    const body = await req.json();
    const { company_id, type } = body;

    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id è obbligatorio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for DB reads
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

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
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get AI subscription price from platform_settings
      const { data: priceSetting } = await supabaseAdmin
        .from("platform_settings")
        .select("value")
        .eq("key", "ai_subscription_price_eur")
        .maybeSingle();
      const priceEur = parseFloat(priceSetting?.value || "49");

      let stripeCustomerId = company.stripe_customer_id;
      if (!stripeCustomerId) {
        const customerRes = await fetch("https://api.stripe.com/v1/customers", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ name: company.name, email: company.email, "metadata[company_id]": company.id }),
        });
        const customer = await customerRes.json();
        if (customer.error) {
          return new Response(JSON.stringify({ error: customer.error.message }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        stripeCustomerId = customer.id;
        await supabaseAdmin.from("companies").update({ stripe_customer_id: stripeCustomerId }).eq("id", company_id);
      }

      const appUrl = supabaseUrl.replace(".supabase.co", ".lovable.app");

      const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          customer: stripeCustomerId!,
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
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ url: session.url, session_id: session.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── EMAIL CREDITS (one-time payment) ───
    if (type === "email_credits") {
      const amountEur = body.amount_eur;
      if (!amountEur || amountEur < 5) {
        return new Response(JSON.stringify({ error: "Importo minimo: €5" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create or get Stripe customer
      let stripeCustomerId = company.stripe_customer_id;
      if (!stripeCustomerId) {
        const customerRes = await fetch("https://api.stripe.com/v1/customers", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            name: company.name,
            email: company.email,
            "metadata[company_id]": company.id,
          }),
        });
        const customer = await customerRes.json();
        if (customer.error) {
          return new Response(JSON.stringify({ error: customer.error.message }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        stripeCustomerId = customer.id;
        await supabaseAdmin
          .from("companies")
          .update({ stripe_customer_id: stripeCustomerId })
          .eq("id", company_id);
      }

      // Build app URL from supabaseUrl
      const appUrl = supabaseUrl.replace(".supabase.co", ".lovable.app");

      // Create Checkout Session (one-time payment)
      const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          customer: stripeCustomerId!,
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
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ url: session.url, session_id: session.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── SUBSCRIPTION CHECKOUT (existing flow) ───
    const { plan_id, billing_period } = body;

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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!plan_id) {
      return new Response(JSON.stringify({ error: "plan_id è obbligatorio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get plan
    const priceField = billing_period === "yearly" ? "stripe_price_yearly_id" : "stripe_price_monthly_id";
    const { data: plan, error: planError } = await supabaseAdmin
      .from("subscription_plans")
      .select(`id, name, ${priceField}`)
      .eq("id", plan_id)
      .single();

    if (planError || !plan) {
      return new Response(JSON.stringify({ error: "Piano non trovato" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripePriceId = (plan as any)[priceField];
    if (!stripePriceId) {
      return new Response(
        JSON.stringify({ error: `Nessun prezzo Stripe configurato per questo piano (${priceField})` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create or get Stripe customer
    let stripeCustomerId = company.stripe_customer_id;

    if (!stripeCustomerId) {
      const customerRes = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          name: company.name,
          email: company.email,
          "metadata[company_id]": company.id,
        }),
      });
      const customer = await customerRes.json();
      if (customer.error) {
        return new Response(JSON.stringify({ error: customer.error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      stripeCustomerId = customer.id;

      await supabaseAdmin
        .from("companies")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", company_id);
    }

    const appUrl = supabaseUrl.replace(".supabase.co", ".lovable.app");

    // Create Checkout Session
    const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        customer: stripeCustomerId!,
        mode: "subscription",
        "line_items[0][price]": stripePriceId,
        "line_items[0][quantity]": "1",
        success_url: `${appUrl}/admin/aziende/${company_id}?payment=success`,
        cancel_url: `${appUrl}/admin/aziende/${company_id}?payment=cancelled`,
        "metadata[company_id]": company_id,
        "metadata[plan_id]": plan_id,
      }),
    });
    const session = await sessionRes.json();

    if (session.error) {
      return new Response(JSON.stringify({ error: session.error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
