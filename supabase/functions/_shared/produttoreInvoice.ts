import type { WholesaleItem } from "./produttoreWholesale.ts";

type WholesaleInvoice = {
  id: string;
  status: string | null;
  currency: string;
  total: number;
  amount_remaining: number;
  metadata?: Record<string, string | undefined> | null;
};

type Idempotency = { idempotencyKey: string };
type WholesaleInvoiceProvider = {
  invoices: {
    retrieve: (id: string) => PromiseLike<WholesaleInvoice>;
    list: (params: { customer: string; limit: number; created: { gte: number } }) => AsyncIterable<WholesaleInvoice>;
    create: (params: {
      customer: string; collection_method: "charge_automatically"; auto_advance: false;
      pending_invoice_items_behavior: "exclude"; default_payment_method: string;
      description: string; metadata: Record<string, string>;
    }, options: Idempotency) => PromiseLike<WholesaleInvoice>;
    listLineItems: (id: string, params: { limit: number }) => AsyncIterable<{
      amount: number; metadata?: Record<string, string | undefined> | null;
    }>;
    finalizeInvoice: (id: string, params: { auto_advance: false }, options: Idempotency) => PromiseLike<WholesaleInvoice>;
    pay: (id: string, params: { payment_method: string }, options: Idempotency) => PromiseLike<WholesaleInvoice>;
  };
  invoiceItems: {
    create: (params: {
      customer: string; invoice: string; currency: "eur"; amount: number;
      description: string; metadata: Record<string, string>; discountable: false;
    }, options: Idempotency) => PromiseLike<unknown>;
  };
};

export type WholesaleAccount = {
  produttore_id: string;
  period: string;
  stripe_customer_id: string;
  stripe_payment_method_id: string;
  stripe_invoice_id: string | null;
  stripe_status: string | null;
  amount_cents: number;
  wholesale_pct: number;
  items: WholesaleItem[];
  created_at: string;
};

export async function settleWholesaleInvoice(
  stripe: WholesaleInvoiceProvider,
  account: WholesaleAccount,
  saveInvoice: (invoice: WholesaleInvoice) => Promise<void>,
  retryPaymentMethod?: string,
) {
  const { produttore_id, period, stripe_customer_id } = account;
  const key = `wholesale:${produttore_id}:${period}`;
  let invoice: WholesaleInvoice | undefined;
  if (account.stripe_invoice_id) {
    invoice = await stripe.invoices.retrieve(account.stripe_invoice_id);
  } else {
    // List is scoped to the billing customer. This also recovers invoices created
    // by the previous implementation and requests interrupted after Stripe wrote.
    for await (const candidate of stripe.invoices.list({
      customer: stripe_customer_id, limit: 100,
      created: { gte: Math.floor(Date.parse(`${period}-01T00:00:00Z`) / 1000) - 86400 },
    })) {
      if (candidate.metadata?.produttore_id !== produttore_id || candidate.metadata?.period !== period) continue;
      if (invoice && invoice.id !== candidate.id) return { invoice, reason: "needs_review" };
      invoice = candidate;
    }
    if (!invoice) {
      // The provider may discard an idempotency key after 24h. Require an operator
      // to investigate before issuing another invoice if the first outcome is unknown.
      if (Date.now() - Date.parse(account.created_at) >= 23 * 3600_000) {
        return { invoice: undefined, reason: "needs_review" };
      }
      invoice = await stripe.invoices.create({
        customer: stripe_customer_id, collection_method: "charge_automatically", auto_advance: false,
        pending_invoice_items_behavior: "exclude", default_payment_method: account.stripe_payment_method_id,
        description: `Conto wholesale rivenditori — ${period}`,
        metadata: { produttore_id, period, wholesale_key: key },
      }, { idempotencyKey: `${key}:invoice` });
    }
    await saveInvoice(invoice);
  }

  if (invoice.metadata?.wholesale_key !== key) {
    return { invoice, reason: invoice.status === "draft" ? "needs_review" : "already_billed" };
  }
  if (invoice.status === "paid") return { invoice, reason: "already_billed" };
  if (invoice.status === "draft") {
    const existing = new Map<string, number>();
    for await (const line of stripe.invoices.listLineItems(invoice.id, { limit: 100 })) {
      const retailer = line.metadata?.rivenditore_id;
      if (!retailer || existing.has(retailer)) return { invoice, reason: "needs_review" };
      existing.set(retailer, line.amount);
    }

    const expected = new Map(account.items.filter((item) => item.amount_cents > 0).map((item) => [item.id, item]));
    for (const [id, amount] of existing) {
      if (expected.get(id)?.amount_cents !== amount) return { invoice, reason: "needs_review" };
    }
    for (const item of expected.values()) {
      if (existing.has(item.id)) continue;
      await stripe.invoiceItems.create({
        customer: stripe_customer_id, invoice: invoice.id, currency: "eur", amount: item.amount_cents,
        description: `Wholesale ${item.plan ?? "piano"} — ${item.name} (${period})`,
        metadata: { produttore_id, period, rivenditore_id: item.id },
        discountable: false,
      }, { idempotencyKey: `${key}:retailer:${item.id}` });
    }
    invoice = await stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: false }, { idempotencyKey: `${key}:finalize` });
    await saveInvoice(invoice);
  }
  if (invoice.status !== "open") return { invoice };

  if (invoice.currency !== "eur" || invoice.total !== account.amount_cents
    || invoice.amount_remaining !== account.amount_cents) {
    return { invoice, reason: "needs_review" };
  }
  const paymentMethod = retryPaymentMethod ?? account.stripe_payment_method_id;
  try {
    invoice = await stripe.invoices.pay(invoice.id, { payment_method: paymentMethod }, {
      idempotencyKey: `${key}:pay:${paymentMethod}`,
    });
  } catch (error) {
    if ((error as { type?: string }).type !== "StripeCardError") throw error;
    invoice = await stripe.invoices.retrieve(invoice.id);
  }
  await saveInvoice(invoice);
  return { invoice };
}
