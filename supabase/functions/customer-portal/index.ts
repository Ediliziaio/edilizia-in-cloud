import Stripe from "https://esm.sh/stripe@18.5.0";
import { corsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return errorResponse("Stripe non configurato");

    const { userId, supabaseAdmin } = await requireAuth(req, corsHeaders);

    // Get user's company
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (!profile?.company_id) return errorResponse("Azienda non trovata", 404);

    // Get company's Stripe customer ID
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("stripe_customer_id")
      .eq("id", profile.company_id)
      .single();

    if (!company?.stripe_customer_id) {
      return errorResponse("Nessun account Stripe associato. Effettua prima un pagamento.", 404);
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const origin = req.headers.get("origin") || "https://edilizia-in-cloud.lovable.app";

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: company.stripe_customer_id,
      return_url: `${origin}/impostazioni`,
    });

    return jsonResponse({ url: portalSession.url });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("Customer portal error:", err);
    return errorResponse((err as Error).message, 500);
  }
});
