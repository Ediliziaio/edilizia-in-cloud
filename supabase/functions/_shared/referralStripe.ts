import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type ProviderRef = string | { id: string } | null | undefined;
type InvoiceSnapshot = {
  id: string;
  status: string | null;
  paid_out_of_band?: boolean;
  customer: ProviderRef;
  subscription: ProviderRef;
  charge: ProviderRef;
  metadata?: Record<string, string | undefined> | null;
  currency: string;
  amount_paid: number;
  total: number;
  total_excluding_tax?: number | null;
  total_tax_amounts?: Array<{ amount: number }>;
  status_transitions: { paid_at: number | null };
};

type CollectedCharge = {
  id: string;
  status: string;
  paid: boolean;
  captured: boolean;
  amount_captured: number;
  currency: string;
  customer: ProviderRef;
  invoice?: ProviderRef;
};
type StripeRefund = { id: string; amount: number; currency: string; status: string | null; created: number };
type StripeEvent = { type: string; data: { object: unknown } };

type StripeReferralGateway = {
  invoices: { retrieve: (id: string) => PromiseLike<unknown> };
  charges: { retrieve: (id: string) => PromiseLike<CollectedCharge> };
  subscriptions: { retrieve: (id: string) => PromiseLike<{ metadata?: Record<string, string> | null }> };
  refunds: { list: (params: { charge: string; limit: number }) => AsyncIterable<StripeRefund> };
  events: { list: (params: { types: string[]; created: { gte: number; lt: number }; limit: number }) => AsyncIterable<StripeEvent> };
};
type CashEvent =
  | { kind: "invoice"; id: string }
  | { kind: "charge"; id: string }
  | null;

export class ReferralStripeSchemaUnavailable extends Error {}

const refundEvents = new Set(["refund.created", "refund.updated", "refund.failed", "charge.refund.updated"]);
const addOnTypes = new Set(["whatsapp_addon", "ai_subscription"]);

function reference(value: ProviderRef): string | undefined {
  return typeof value === "string" ? value : value?.id;
}

function eventReference(event: StripeEvent): CashEvent {
  const obj = event.data.object;
  if (!obj || typeof obj !== "object" || !("id" in obj) || typeof obj.id !== "string") return null;
  if (event.type === "invoice.paid") return { kind: "invoice", id: obj.id };
  if (event.type === "charge.refunded") return { kind: "charge", id: obj.id };
  if (refundEvents.has(event.type) && "charge" in obj) {
    const id = reference(obj.charge as ProviderRef);
    return id ? { kind: "charge", id } : null;
  }
  return null;
}

/** Captured cash, allocated between net and tax using the discounted invoice totals. */
export function stripeReferralBase(invoice: InvoiceSnapshot, charge: CollectedCharge) {
  const paidAt = invoice.status_transitions.paid_at;
  if (invoice.status !== "paid" || invoice.paid_out_of_band || !paidAt || invoice.currency !== "eur"
    || !reference(invoice.subscription) || invoice.metadata?.produttore_id || invoice.total <= 0
    || charge.currency !== invoice.currency || !charge.paid || !charge.captured || charge.status !== "succeeded"
    || reference(charge.customer) !== reference(invoice.customer)
    || reference(charge.invoice) !== invoice.id || reference(invoice.charge) !== charge.id) {
    return null;
  }

  const gross = Math.min(charge.amount_captured, invoice.amount_paid, invoice.total);
  if (!Number.isSafeInteger(gross) || !Number.isSafeInteger(invoice.total) || gross <= 0) return null;
  const subtotal = invoice.total_excluding_tax ?? (Array.isArray(invoice.total_tax_amounts)
    ? invoice.total - invoice.total_tax_amounts.reduce((sum, tax) => sum + tax.amount, 0) : null);
  if (subtotal === null || !Number.isSafeInteger(subtotal) || subtotal < 0 || subtotal > invoice.total) {
    throw new Error(`Totale al netto delle imposte non verificabile per ${invoice.id}`);
  }
  const denominator = BigInt(invoice.total);
  const net = Number((BigInt(gross) * BigInt(subtotal) + denominator / 2n) / denominator);
  return { gross, net, paidAt };
}

function refundMovement(refund: StripeRefund, currency: string) {
  if (refund.currency !== currency) throw new Error(`Valuta rimborso non coerente per ${refund.id}`);
  if (refund.status !== "succeeded" && refund.status !== "failed" && refund.status !== "canceled") return null;
  return {
    refund_id: refund.id, amount_cents: refund.amount, status: refund.status,
    occurred_at: new Date(refund.created * 1000).toISOString(),
  };
}

/** Both webhook delivery and the read-only Stripe catch-up call this path. */
async function syncStripeInvoice(
  stripe: StripeReferralGateway, supabase: SupabaseClient, invoiceId: string, knownCharge?: CollectedCharge,
) {
  const invoice = await stripe.invoices.retrieve(invoiceId) as InvoiceSnapshot;
  const customer = reference(invoice.customer);
  const subscription = reference(invoice.subscription);
  const chargeId = reference(invoice.charge);
  if (!customer || !subscription || !chargeId || invoice.status !== "paid" || invoice.paid_out_of_band
    || invoice.metadata?.produttore_id || invoice.currency !== "eur") return;

  const { data: company, error: companyError } = await supabase.from("companies")
    .select("id, referred_by").eq("stripe_customer_id", customer).maybeSingle();
  if (companyError) throw new Error(companyError.message);
  // A refund follows its original receipt even if the Stripe customer is no
  // longer associated with the company. The RPC will not create a new credit without it.
  if (!company && !knownCharge) return;
  if (company && !knownCharge && !company.referred_by) {
    const { data: referral, error } = await supabase.from("referral_companies")
      .select("id").eq("company_id", company.id).eq("is_active", true).limit(1);
    if (error) throw new Error(error.message);
    if (!referral?.length) return;
  }

  const charge = knownCharge ?? await stripe.charges.retrieve(chargeId);
  const base = stripeReferralBase(invoice, charge);
  if (!base) return;

  const sub = company ? await stripe.subscriptions.retrieve(subscription) : null;
  const kind = addOnTypes.has(sub?.metadata?.type ?? "") ? "addon" : "plan";
  const refunds: NonNullable<ReturnType<typeof refundMovement>>[] = [];
  for await (const refund of stripe.refunds.list({ charge: charge.id, limit: 100 })) {
    const movement = refundMovement(refund, charge.currency);
    if (movement) refunds.push(movement);
  }

  const { error } = await supabase.rpc("referral_record_stripe_receipt", {
    p_invoice_id: invoice.id, p_charge_id: charge.id, p_company_id: company?.id ?? null,
    p_paid_at: new Date(base.paidAt * 1000).toISOString(), p_kind: kind, p_gross_cents: base.gross,
    p_net_cents: base.net, p_refunds: refunds,
  });
  if (error?.code === "PGRST202") throw new ReferralStripeSchemaUnavailable(error.message);
  if (error) throw new Error(`Commissioni referral per ${invoice.id}: ${error.message}`);
}

async function syncReference(stripe: StripeReferralGateway, supabase: SupabaseClient, receipt: NonNullable<CashEvent>) {
  if (receipt.kind === "invoice") return syncStripeInvoice(stripe, supabase, receipt.id);
  const charge: CollectedCharge = await stripe.charges.retrieve(receipt.id);
  const invoiceId = reference(charge.invoice);
  if (invoiceId) await syncStripeInvoice(stripe, supabase, invoiceId, charge);
}

export async function syncReferralStripeEvent(stripe: StripeReferralGateway, supabase: SupabaseClient, event: StripeEvent) {
  const receipt = eventReference(event);
  if (receipt) await syncReference(stripe, supabase, receipt);
}

export async function catchUpReferralStripe(stripe: StripeReferralGateway, supabase: SupabaseClient) {
  const { data: since, error } = await supabase.rpc("referral_stripe_sync_cursor");
  if (error) throw new Error(error.message);
  const now = Math.floor(Date.now() / 1000);
  // The Events API only keeps 30 days. Never silently close an unreconciled gap.
  const earliest = Math.floor(Date.parse(since) / 1000);
  if (!Number.isFinite(earliest) || earliest < now - 29 * 86400) {
    throw new Error("La finestra Stripe non copre più il periodo da riconciliare");
  }
  const end = now - 120;
  if (end <= earliest) return;
  const seen = new Set<string>();
  for await (const event of stripe.events.list({
    types: ["invoice.paid", "charge.refunded", ...refundEvents],
    created: { gte: Math.max(earliest - 3600, now - 29 * 86400), lt: end }, limit: 100,
  })) {
    const receipt = eventReference(event);
    if (!receipt || seen.has(receipt.id)) continue;
    await syncReference(stripe, supabase, receipt);
    seen.add(receipt.id);
  }
  const { error: saveError } = await supabase.rpc("referral_stripe_sync_cursor", {
    p_synced_through: new Date(end * 1000).toISOString(),
  });
  if (saveError) throw new Error(saveError.message);
}
