import Stripe from "https://esm.sh/stripe@18.5.0";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { resolveProduttore } from "../_shared/produttore.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

/**
 * confirm-produttore-card — al ritorno dal Checkout (setup) conferma che la carta
 * del produttore è a sistema: imposta la payment method di DEFAULT sul customer
 * (così le fatture la addebitano) e setta companies.payment_method='stripe'.
 * Idempotente. Alternativa leggera al webhook, senza toccare il webhook condiviso.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const stripeKey = await getPlatformSetting("stripe_secret_key", "STRIPE_SECRET_KEY");
    if (!stripeKey) return errorResponse("Stripe non configurato", 400, corsH);

    const ctx = await resolveProduttore(req, corsH);
    const { data: company } = await ctx.supabaseAdmin
      .from("companies").select("id, stripe_customer_id, payment_method").eq("id", ctx.produttoreId).maybeSingle();
    const customerId = (company?.stripe_customer_id as string | null) ?? null;
    if (!customerId) return jsonResponse({ success: true, confirmed: false, reason: "no_customer" }, 200, corsH);

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    let defaultPm: string | null = null;
    const cust = await stripe.customers.retrieve(customerId);
    if (!(cust as Stripe.DeletedCustomer).deleted) {
      const dpm = (cust as Stripe.Customer).invoice_settings?.default_payment_method;
      defaultPm = typeof dpm === "string" ? dpm : (dpm?.id ?? null);
    }

    let last4: string | null = null;
    if (!defaultPm) {
      const pms = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
      if (pms.data.length > 0) {
        defaultPm = pms.data[0].id;
        last4 = pms.data[0].card?.last4 ?? null;
        await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: defaultPm } });
      }
    } else {
      try {
        const pm = await stripe.paymentMethods.retrieve(defaultPm);
        last4 = pm.card?.last4 ?? null;
      } catch (_e) { /* last4 non essenziale */ }
    }

    if (!defaultPm) return jsonResponse({ success: true, confirmed: false, reason: "no_card" }, 200, corsH);

    if (company?.payment_method !== "stripe") {
      await ctx.supabaseAdmin.from("companies").update({ payment_method: "stripe" }).eq("id", ctx.produttoreId);
    }

    return jsonResponse({ success: true, confirmed: true, last4 }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("confirm-produttore-card error:", e);
    return errorResponse((e as Error).message ?? "Errore interno del server", 500, corsH);
  }
});
