import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

/**
 * Customer Portal Stripe — con flussi dedicati (deep-link).
 *
 * Body opzionale (retro-compat: senza body = portale generico come prima):
 *   { flow: "change_plan", plan_id: "<uuid>", billing_period?: "monthly"|"yearly" }
 *     → pagina Stripe di CONFERMA cambio piano (subscription_update_confirm):
 *       l'utente vede il nuovo prezzo/prorata e conferma. Niente doppia subscription.
 *   { flow: "cancel" }
 *     → pagina Stripe di annullamento (subscription_cancel).
 *
 * Se l'azienda non ha una subscription Stripe attiva, fallback al portale
 * generico (mai errore bloccante lato UX).
 */

type FlowBody = {
  flow?: "change_plan" | "cancel";
  plan_id?: string;
  billing_period?: "monthly" | "yearly";
};

const ACTIVE_SUB_STATUSES = new Set(["active", "trialing", "past_due"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const stripeKey = await getPlatformSetting("stripe_secret_key", "STRIPE_SECRET_KEY");
    if (!stripeKey) return errorResponse("Stripe non configurato", 400, corsH);

    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    // Body opzionale: le chiamate legacy arrivano senza JSON.
    let body: FlowBody = {};
    try {
      body = (await req.json()) as FlowBody;
    } catch {
      body = {};
    }

    // Azienda su cui l'utente sta lavorando: quella scelta nel selettore o quella
    // impersonata dal super admin. Prima si leggeva sempre il profilo, e chi
    // impersonava un'azienda apriva il portale della propria o nessun portale.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();
    let companyId: string | null = profile?.company_id ?? null;

    const supabaseUtente = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: aziendaEffettiva } = await supabaseUtente.rpc("get_effective_company_id");
    if (typeof aziendaEffettiva === "string") companyId = aziendaEffettiva;

    if (!companyId) return errorResponse("Azienda non trovata", 404, corsH);

    // Il portale Stripe gestisce l'abbonamento dell'azienda a EiC: annullarlo o
    // cambiare piano vale per tutti. Lo apre solo il super admin o un
    // amministratore di quell'azienda (25/09/2026: prima, sull'azienda del
    // proprio profilo, bastava averci un profilo, anche da cliente del portale).
    const { data: adminAzienda } = await supabaseUtente.rpc("can_manage_company_people", { p_company_id: companyId });
    let amministra = adminAzienda === true;
    if (!amministra && companyId === profile?.company_id) {
      // L'area Produttori (ProduttoreFatturazione): il suo amministratore ha il
      // ruolo produttore_admin sull'azienda del proprio profilo.
      const { data: ruoli } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
      amministra = (ruoli ?? []).some((r: { role: string }) => r.role === "produttore_admin");
    }
    if (!amministra) {
      return errorResponse("Solo un amministratore dell'azienda può gestire l'abbonamento", 403, corsH);
    }

    // Get company's Stripe customer ID
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("stripe_customer_id")
      .eq("id", companyId)
      .single();

    if (!company?.stripe_customer_id) {
      return errorResponse("Nessun account Stripe associato. Effettua prima un pagamento.", 404, corsH);
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://app.ediliziaincloud.com";
    const billingPageUrl = `${origin}/azienda/impostazioni/abbonamento?tab=abbonamenti`;

    // ── Flusso dedicato: serve la subscription attiva su Stripe ──
    let flowData: Stripe.BillingPortal.SessionCreateParams.FlowData | undefined;

    if (body.flow === "change_plan" || body.flow === "cancel") {
      const subs = await stripe.subscriptions.list({
        customer: company.stripe_customer_id,
        status: "all",
        limit: 10,
      });
      const activeSub = subs.data.find((s) => ACTIVE_SUB_STATUSES.has(s.status));

      if (!activeSub) {
        console.warn(`[customer-portal] flow=${body.flow} richiesto ma nessuna subscription attiva per ${company.stripe_customer_id} — fallback portale generico`);
      } else if (body.flow === "cancel") {
        flowData = {
          type: "subscription_cancel",
          subscription_cancel: { subscription: activeSub.id },
          after_completion: { type: "redirect", redirect: { return_url: billingPageUrl } },
        };
      } else {
        // change_plan: il piano DEVE essere un full plan globale attivo del listino
        // (mai piani ad-hoc/produttore: il prezzo arriva dal nostro DB, non dal client).
        if (!body.plan_id) return errorResponse("plan_id è obbligatorio per il cambio piano", 400, corsH);

        const { data: plan } = await supabaseAdmin
          .from("subscription_plans")
          .select("id, name, stripe_price_monthly_id, stripe_price_yearly_id, is_active, is_full_plan, produttore_id")
          .eq("id", body.plan_id)
          .maybeSingle();

        if (!plan || !plan.is_active || !plan.is_full_plan || plan.produttore_id) {
          return errorResponse("Piano non disponibile per il cambio", 400, corsH);
        }

        // Ciclo: esplicito dal client, altrimenti mantieni quello attuale della subscription.
        const currentInterval = activeSub.items.data[0]?.price?.recurring?.interval;
        const period = body.billing_period ?? (currentInterval === "year" ? "yearly" : "monthly");
        const newPriceId = period === "yearly" ? plan.stripe_price_yearly_id : plan.stripe_price_monthly_id;

        if (!newPriceId) {
          return errorResponse(`Nessun prezzo Stripe configurato per il piano ${plan.name} (${period})`, 400, corsH);
        }

        flowData = {
          type: "subscription_update_confirm",
          subscription_update_confirm: {
            subscription: activeSub.id,
            items: [{ id: activeSub.items.data[0].id, price: newPriceId, quantity: 1 }],
          },
          after_completion: { type: "redirect", redirect: { return_url: billingPageUrl } },
        };
      }
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: company.stripe_customer_id,
      return_url: body.flow ? billingPageUrl : `${origin}/impostazioni`,
      ...(flowData ? { flow_data: flowData } : {}),
    });

    return jsonResponse({ url: portalSession.url }, 200, corsH);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("Customer portal error:", err);
    return errorResponse((err as Error).message, 500, corsH);
  }
});
