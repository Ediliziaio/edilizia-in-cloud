// v8.6.59 — Restituisce il metodo di pagamento default (brand + last4 + exp)
// del customer Stripe associato alla company corrente. Usato dalla card
// "Metodo di pagamento" nel tab Pagamenti della dashboard abbonamento.
//
// Risposta:
//   { hasMethod: false }                                     → nessuna carta
//   { hasMethod: true, brand: "visa", last4: "1374",
//     expMonth: 12, expYear: 2027, funding: "credit" }       → carta presente
//
// Mai esporre token o chiavi: solo dati safe-to-show.

import Stripe from "https://esm.sh/stripe@18.5.0";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

interface PaymentMethodResponse {
  hasMethod: boolean;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
  funding?: string;
  type?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const stripeKey = await getPlatformSetting("stripe_secret_key", "STRIPE_SECRET_KEY");
    if (!stripeKey) return errorResponse("Stripe non configurato");

    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (!profile?.company_id) return errorResponse("Azienda non trovata", 404);

    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("stripe_customer_id")
      .eq("id", profile.company_id)
      .single();

    if (!company?.stripe_customer_id) {
      const payload: PaymentMethodResponse = { hasMethod: false };
      return jsonResponse(payload);
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // 1) Recupera customer per leggere invoice_settings.default_payment_method
    const customer = await stripe.customers.retrieve(company.stripe_customer_id);
    if (customer.deleted) {
      return jsonResponse({ hasMethod: false } as PaymentMethodResponse);
    }

    let defaultPmId: string | null = null;
    const invSettings = (customer as Stripe.Customer).invoice_settings;
    if (invSettings?.default_payment_method) {
      defaultPmId =
        typeof invSettings.default_payment_method === "string"
          ? invSettings.default_payment_method
          : invSettings.default_payment_method.id;
    }

    // 2) Se nessun default, prendi il primo PaymentMethod tipo card disponibile
    if (!defaultPmId) {
      const methods = await stripe.paymentMethods.list({
        customer: company.stripe_customer_id,
        type: "card",
        limit: 1,
      });
      if (methods.data.length > 0) {
        defaultPmId = methods.data[0].id;
      }
    }

    if (!defaultPmId) {
      return jsonResponse({ hasMethod: false } as PaymentMethodResponse);
    }

    const pm = await stripe.paymentMethods.retrieve(defaultPmId);
    if (pm.type !== "card" || !pm.card) {
      return jsonResponse({ hasMethod: false } as PaymentMethodResponse);
    }

    const response: PaymentMethodResponse = {
      hasMethod: true,
      brand: pm.card.brand,
      last4: pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year,
      funding: pm.card.funding,
      type: pm.type,
    };
    return jsonResponse(response);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("stripe-payment-method error:", err);
    return errorResponse((err as Error).message, 500);
  }
});
