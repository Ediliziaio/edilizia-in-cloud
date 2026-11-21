type Plan = { name: string | null; price_monthly: number | null };

type Retailer = {
  id: string;
  name: string;
  status: string | null;
  billing_comped: boolean | null;
  subscription_plans: Plan | Plan[] | null;
};

export type WholesaleItem = {
  id: string;
  name: string;
  plan: string | null;
  list_cents: number;
  amount_cents: number;
};

export function wholesaleQuote(retailers: Retailer[], discount: number) {
  const pct = Number.isFinite(discount) ? Math.min(100, Math.max(0, discount)) : 0;
  const items: WholesaleItem[] = [];
  for (const retailer of retailers) {
    if (!retailer.billing_comped || retailer.status !== "active") continue;
    const plan = Array.isArray(retailer.subscription_plans) ? retailer.subscription_plans[0] : retailer.subscription_plans;
    const listCents = Math.max(0, Math.round(Number(plan?.price_monthly ?? 0) * 100));
    if (!listCents) continue;
    items.push({
      id: retailer.id, name: retailer.name, plan: plan?.name ?? null,
      list_cents: listCents, amount_cents: Math.round(listCents * (100 - pct) / 100),
    });
  }
  items.sort((a, b) => a.id.localeCompare(b.id));
  return { pct, items, total: items.reduce((sum, item) => sum + item.amount_cents, 0) };
}

export async function wholesalePreviewKey(period: string, pct: number, items: WholesaleItem[]) {
  const lines = items.map((item) => [item.id, item.name, item.plan, item.list_cents, item.amount_cents]);
  const bytes = new TextEncoder().encode(JSON.stringify([period, pct, lines]));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
