import Stripe from "https://esm.sh/stripe@18.5.0";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

/**
 * charge-produttore-billing — addebita al PRODUTTORE il suo conto wholesale del mese
 * (rivenditori comped × prezzo di listino scontato della % wholesale).
 *
 * SICUREZZA (denaro reale):
 *  - solo super_admin (nessun auto-cron, nessun self-service del produttore);
 *  - `preview: true` → calcola e RITORNA l'importo SENZA addebitare;
 *  - idempotente per mese (metadata produttore_id + period: una sola invoice/mese);
 *  - se manca carta/importo → no-op con `reason`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
interface LineItem { name: string; plan: string | null; amount: number }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const stripeKey = await getPlatformSetting("stripe_secret_key", "STRIPE_SECRET_KEY");
    if (!stripeKey) return errorResponse("Stripe non configurato", 400, corsH);

    const body = await req.json();
    const produttoreId = String(body?.produttore_id ?? "");
    const preview = body?.preview === true;
    if (!produttoreId) return errorResponse("produttore_id richiesto", 400, corsH);

    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r: { role: string }) => r.role === "super_admin")) {
      return errorResponse("Non autorizzato: richiesto super admin", 403, corsH);
    }

    const { data: prod } = await supabaseAdmin
      .from("companies").select("id, name, email, stripe_customer_id, reseller_wholesale_pct")
      .eq("id", produttoreId).maybeSingle();
    if (!prod) return errorResponse("Produttore non trovato", 404, corsH);
    const { data: brand } = await supabaseAdmin
      .from("company_branding").select("whitelabel_tier").eq("company_id", produttoreId).maybeSingle();
    if (!brand || brand.whitelabel_tier !== "agency") return errorResponse("L'azienda non è un produttore (agency)", 400, corsH);

    const pct = Math.min(100, Math.max(0, Number(prod.reseller_wholesale_pct ?? 0)));
    const factor = 1 - pct / 100;

    const { data: rivs } = await supabaseAdmin
      .from("companies")
      .select("id, name, billing_comped, subscription_plans:subscription_plan_id(name, price_monthly)")
      .eq("parent_company_id", produttoreId).eq("billing_comped", true);
    const items: LineItem[] = (rivs ?? [])
      .map((r: Row): LineItem => ({
        name: r.name as string,
        plan: (r.subscription_plans?.name as string | undefined) ?? null,
        amount: Math.round(Number(r.subscription_plans?.price_monthly ?? 0) * factor * 100),
      }))
      .filter((it: LineItem) => it.amount > 0);
    const totalCents = items.reduce((s: number, it: LineItem) => s + it.amount, 0);

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const customerId = (prod.stripe_customer_id as string | null) ?? null;

    if (preview) {
      return jsonResponse({
        success: true, preview: true, period, amount: totalCents / 100,
        count: items.length, wholesale_pct: pct, has_customer: !!customerId,
      }, 200, corsH);
    }

    if (totalCents <= 0) return jsonResponse({ success: true, charged: false, reason: "no_amount", period }, 200, corsH);
    if (!customerId) return jsonResponse({ success: true, charged: false, reason: "no_customer", period }, 200, corsH);

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Metodo di pagamento default (impostane uno se mancante).
    let defaultPm: string | null = null;
    const cust = await stripe.customers.retrieve(customerId);
    if (!(cust as Stripe.DeletedCustomer).deleted) {
      const dpm = (cust as Stripe.Customer).invoice_settings?.default_payment_method;
      defaultPm = typeof dpm === "string" ? dpm : (dpm?.id ?? null);
    }
    if (!defaultPm) {
      const pms = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
      if (pms.data.length > 0) {
        defaultPm = pms.data[0].id;
        await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: defaultPm } });
      }
    }
    if (!defaultPm) return jsonResponse({ success: true, charged: false, reason: "no_card", period }, 200, corsH);

    // Idempotenza: una sola fattura per produttore+mese.
    const existing = await stripe.invoices.search({
      query: `metadata['produttore_id']:'${produttoreId}' AND metadata['period']:'${period}'`,
      limit: 1,
    });
    if (existing.data.length > 0) {
      const inv = existing.data[0];
      return jsonResponse({ success: true, charged: inv.status === "paid", reason: "already_billed", period, invoice_id: inv.id, status: inv.status }, 200, corsH);
    }

    for (const it of items) {
      await stripe.invoiceItems.create({
        customer: customerId, currency: "eur", amount: it.amount,
        description: `Wholesale ${it.plan ?? "piano"} — ${it.name} (${period})`,
        metadata: { produttore_id: produttoreId, period },
      });
    }
    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: "charge_automatically",
      auto_advance: false,
      default_payment_method: defaultPm,
      description: `Conto wholesale rivenditori — ${period}`,
      metadata: { produttore_id: produttoreId, period },
    });
    const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
    let result = finalized;
    if (finalized.status !== "paid") {
      try { result = await stripe.invoices.pay(finalized.id); } catch (_e) { /* resta open/uncollectible */ }
    }

    await supabaseAdmin.from("companies")
      .update({ payment_method: "stripe", stripe_subscription_status: result.status }).eq("id", produttoreId);

    return jsonResponse({
      success: true, charged: result.status === "paid", period,
      invoice_id: result.id, status: result.status, amount: totalCents / 100,
    }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("charge-produttore-billing error:", e);
    return errorResponse((e as Error).message ?? "Errore interno del server", 500, corsH);
  }
});
