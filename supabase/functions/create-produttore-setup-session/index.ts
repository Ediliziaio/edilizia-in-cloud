import Stripe from "https://esm.sh/stripe@18.5.0";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { resolveProduttore } from "../_shared/produttore.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

/**
 * create-produttore-setup-session — avvia l'inserimento della carta del PRODUTTORE
 * via Stripe Checkout in modalità "setup" (flusso hosted: nessun addebito, nessun
 * dato carta passa dal server). Prerequisito per la riscossione del conto wholesale
 * (l'addebito vero è lo Step 2b). Crea/recupera il customer Stripe del produttore.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const stripeKey = await getPlatformSetting("stripe_secret_key", "STRIPE_SECRET_KEY");
    if (!stripeKey) return errorResponse("Stripe non configurato", 400, corsH);

    const ctx = await resolveProduttore(req, corsH);
    const { data: company } = await ctx.supabaseAdmin
      .from("companies").select("id, name, email, stripe_customer_id").eq("id", ctx.produttoreId).single();
    if (!company) return errorResponse("Azienda non trovata", 404, corsH);

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Crea/recupera il customer Stripe del produttore (idempotente sull'id salvato).
    let customerId = (company.stripe_customer_id as string | null) ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: (company.name as string) ?? "Produttore",
        email: (company.email as string) || undefined,
        metadata: { company_id: company.id as string },
      });
      customerId = customer.id;
      await ctx.supabaseAdmin.from("companies").update({ stripe_customer_id: customerId }).eq("id", company.id);
    }

    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://app.ediliziaincloud.com";
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: customerId,
      payment_method_types: ["card"],
      success_url: `${origin}/produttore/fatturazione?setup=success`,
      cancel_url: `${origin}/produttore/fatturazione?setup=cancel`,
    });

    return jsonResponse({ url: session.url }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("create-produttore-setup-session error:", e);
    return errorResponse((e as Error).message ?? "Errore interno del server", 500, corsH);
  }
});
