import { expect, it, vi } from "vitest";
import { settleWholesaleInvoice, type WholesaleAccount } from "../../../supabase/functions/_shared/produttoreInvoice";
import { wholesalePreviewKey, wholesaleQuote } from "../../../supabase/functions/_shared/produttoreWholesale";

const period = "2026-11";
const retailers = [
  { id: "a", name: "Rivenditore attivo A", status: "active", billing_comped: true, subscription_plans: { name: "Pro", price_monthly: 110.15 } },
  { id: "b", name: "Rivenditore attivo B", status: "active", billing_comped: true, subscription_plans: { name: "Base", price_monthly: 60 } },
  { id: "c", name: "Sospeso", status: "suspended", billing_comped: true, subscription_plans: { name: "Pro", price_monthly: 110.15 } },
  { id: "d", name: "Paga da sé", status: "active", billing_comped: false, subscription_plans: { name: "Base", price_monthly: 60 } },
];

it("calcola il conto solo per i rivenditori attivi a carico del produttore e riconosce il preventivo dopo la lettura JSONB", async () => {
  const quote = wholesaleQuote(retailers, 10);
  expect(quote.items.map(({ id, amount_cents }) => ({ id, amount_cents }))).toEqual([
    { id: "a", amount_cents: 9914 }, { id: "b", amount_cents: 5400 },
  ]);
  expect(quote.total).toBe(15314);
  const restored = quote.items.map(({ plan, amount_cents, id, list_cents, name }) => ({ plan, amount_cents, id, list_cents, name }));
  expect(await wholesalePreviewKey(period, quote.pct, restored)).toBe(await wholesalePreviewKey(period, quote.pct, quote.items));
  expect(await wholesalePreviewKey("2026-12", quote.pct, restored)).not.toBe(await wholesalePreviewKey(period, quote.pct, quote.items));
});

it("riprende la fattura dopo un'interruzione e un rifiuto carta senza ricreare fattura o righe", async () => {
  const quote = wholesaleQuote(retailers, 10);
  const account: WholesaleAccount = {
    produttore_id: "prod-demo", period, stripe_customer_id: "cus_demo",
    stripe_payment_method_id: "pm_demo", stripe_invoice_id: null, stripe_status: null,
    amount_cents: quote.total, wholesale_pct: quote.pct, items: quote.items, created_at: new Date().toISOString(),
  };
  const invoice = {
    id: "in_demo", status: "draft", total: 0, amount_remaining: 0, currency: "eur",
    metadata: { produttore_id: "prod-demo", period, wholesale_key: "wholesale:prod-demo:2026-11" },
  };
  const draftLines: Array<{ amount: number; metadata: { rivenditore_id: string } }> = [];
  let created = false;
  let interrupt = true;
  let decline = true;
  const createInvoice = vi.fn(async () => { created = true; return { ...invoice }; });
  const createLine = vi.fn(async (line: { invoice: string; amount: number; metadata: { rivenditore_id: string } }) => {
    expect(line.invoice).toBe(invoice.id);
    if (interrupt && line.metadata.rivenditore_id === "b") {
      interrupt = false;
      throw new Error("Interruzione simulata");
    }
    draftLines.push(line);
  });
  const pay = vi.fn(async () => {
    if (decline) {
      decline = false;
      throw Object.assign(new Error("Carta rifiutata"), { type: "StripeCardError" });
    }
    invoice.status = "paid";
    invoice.amount_remaining = 0;
    return { ...invoice };
  });
  const stripe = {
    invoices: {
      async *list() { if (created) yield { ...invoice }; },
      async retrieve() { return { ...invoice }; },
      create: createInvoice,
      async *listLineItems() { yield* draftLines; },
      async finalizeInvoice() {
        invoice.status = "open";
        invoice.total = draftLines.reduce((sum, line) => sum + line.amount, 0);
        invoice.amount_remaining = invoice.total;
        return { ...invoice };
      },
      pay,
    },
    invoiceItems: { create: createLine },
  } as unknown as Parameters<typeof settleWholesaleInvoice>[0];
  const save: Parameters<typeof settleWholesaleInvoice>[2] = async (latest) => {
    account.stripe_invoice_id = latest.id;
    account.stripe_status = latest.status;
  };
  await expect(settleWholesaleInvoice(stripe, account, save)).rejects.toThrow("Interruzione simulata");
  expect(account.stripe_invoice_id).toBe(invoice.id);
  expect(draftLines).toHaveLength(1);
  expect((await settleWholesaleInvoice(stripe, account, save)).invoice?.status).toBe("open");
  expect((await settleWholesaleInvoice(stripe, account, save, "pm_replacement")).invoice?.status).toBe("paid");
  expect(await settleWholesaleInvoice(stripe, account, save)).toMatchObject({ reason: "already_billed" });
  expect(createInvoice).toHaveBeenCalledTimes(1);
  expect(draftLines.map((line) => line.metadata.rivenditore_id)).toEqual(["a", "b"]);
  expect(invoice.total).toBe(15314);
  expect(pay).toHaveBeenCalledTimes(2);
  expect(pay).toHaveBeenLastCalledWith("in_demo", { payment_method: "pm_replacement" },
    { idempotencyKey: "wholesale:prod-demo:2026-11:pay:pm_replacement" });
});
