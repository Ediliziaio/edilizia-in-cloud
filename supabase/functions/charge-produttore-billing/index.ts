import Stripe from "https://esm.sh/stripe@18.5.0";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { wholesaleQuote, wholesalePreviewKey } from "../_shared/produttoreWholesale.ts";
import { settleWholesaleInvoice, type WholesaleAccount } from "../_shared/produttoreInvoice.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);
  const reply = (data: Record<string, unknown>) => jsonResponse({ success: true, ...data }, 200, corsH);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    const { data: roles, error: rolesError } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
    if (rolesError) throw rolesError;
    if (!(roles ?? []).some((role: { role: string }) => role.role === "super_admin")) {
      return errorResponse("Richiesto il ruolo super admin", 403, corsH);
    }
    const body = await req.json();
    const produttoreId = typeof body?.produttore_id === "string" ? body.produttore_id : "";
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(produttoreId)) {
      return errorResponse("Produttore non valido", 400, corsH);
    }

    const { data: prod, error: prodError } = await supabaseAdmin.from("companies")
      .select("id, stripe_customer_id, reseller_wholesale_pct").eq("id", produttoreId).maybeSingle();
    if (prodError) throw prodError;
    if (!prod) return errorResponse("Produttore non trovato", 404, corsH);
    const { data: brand, error: brandError } = await supabaseAdmin.from("company_branding")
      .select("whitelabel_tier").eq("company_id", produttoreId).maybeSingle();
    if (brandError) throw brandError;
    if (brand?.whitelabel_tier !== "agency") return errorResponse("L’azienda non è un produttore", 400, corsH);

    const period = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" }).format(new Date());
    async function readAccount(): Promise<WholesaleAccount | null> {
      const { data, error } = await supabaseAdmin.from("produttori_conti_wholesale")
        .select("*").eq("produttore_id", produttoreId).eq("period", period).maybeSingle();
      if (error) throw error;
      return data as WholesaleAccount | null;
    }

    let account = await readAccount();
    const snapshot = account;
    const customerId = account?.stripe_customer_id ?? prod.stripe_customer_id;
    let quote;
    if (account) {
      quote = { items: account.items, total: account.amount_cents, pct: account.wholesale_pct };
    } else {
      const { data: retailers, error } = await supabaseAdmin.from("companies")
        .select("id, name, status, billing_comped, subscription_plans:subscription_plan_id(name, price_monthly)")
        .eq("parent_company_id", produttoreId).eq("billing_comped", true).eq("status", "active");
      if (error) throw error;
      quote = wholesaleQuote(retailers ?? [], Number(prod.reseller_wholesale_pct ?? 0));
    }
    const previewKey = await wholesalePreviewKey(period, quote.pct, quote.items);
    if (body.preview === true) {
      return reply({
        preview: true, preview_key: previewKey, period, amount: quote.total / 100,
        count: quote.items.filter((item) => item.amount_cents > 0).length, wholesale_pct: quote.pct,
        has_customer: !!customerId, status: account?.stripe_status ?? null,
      });
    }
    if (body.preview_key !== previewKey) return reply({ charged: false, reason: "preview_changed", period });
    if (quote.total <= 0) return reply({ charged: false, reason: "no_amount", period });
    if (!customerId) return reply({ charged: false, reason: "no_customer", period });

    const stripeKey = await getPlatformSetting("stripe_secret_key", "STRIPE_SECRET_KEY");
    if (!stripeKey) return errorResponse("Stripe non configurato", 400, corsH);
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    let paymentMethod: string | undefined;
    if (!account || account.stripe_status === "open") {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) return reply({ charged: false, reason: "no_customer", period });
      const preferred = customer.invoice_settings.default_payment_method;
      const defaultMethod = typeof preferred === "string" ? preferred : preferred?.id;
      paymentMethod = defaultMethod ?? (await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 1 })).data[0]?.id;
      if (!paymentMethod) return reply({ charged: false, reason: "no_card", period });
    }

    if (!account) {
      const { error } = await supabaseAdmin.from("produttori_conti_wholesale").upsert({
        produttore_id: produttoreId, period, stripe_customer_id: customerId, stripe_payment_method_id: paymentMethod,
        amount_cents: quote.total, wholesale_pct: quote.pct, items: quote.items,
      }, { onConflict: "produttore_id,period", ignoreDuplicates: true });
      if (error) throw error;
      account = await readAccount();
      if (!account) throw new Error("Conto wholesale non trovato");
      if (previewKey !== await wholesalePreviewKey(period, account.wholesale_pct, account.items)) {
        return reply({ charged: false, reason: "preview_changed", period });
      }
    }

    const { invoice, reason } = await settleWholesaleInvoice(stripe, account, async (current) => {
      let update = supabaseAdmin.from("produttori_conti_wholesale").update({
        stripe_invoice_id: current.id, stripe_status: current.status, updated_at: new Date().toISOString(),
      }).eq("produttore_id", produttoreId).eq("period", period)
        .or(`stripe_invoice_id.is.null,stripe_invoice_id.eq.${current.id}`);
      if (current.status !== "paid") update = update.or("stripe_status.is.null,stripe_status.neq.paid");
      const { error } = await update;
      if (error) throw error;
    }, paymentMethod);
    if (invoice?.status === "paid" && snapshot?.stripe_status !== "paid") {
      const { error } = await supabaseAdmin.from("companies").update({ payment_method: "stripe" }).eq("id", produttoreId);
      if (error) throw error;
    }
    return reply({
      charged: invoice?.status === "paid", reason, period, invoice_id: invoice?.id,
      status: invoice?.status, amount: invoice ? Number(invoice.total) / 100 : quote.total / 100,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("charge-produttore-billing", error);
    return errorResponse("Impossibile completare la verifica o l’addebito del conto", 500, corsH);
  }
});
