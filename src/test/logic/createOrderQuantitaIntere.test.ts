import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { rigaConQuantitaIntera } from "@/pages/azienda/CreateOrder";
import type { OrderItem } from "@/components/orders/OrderItemsList";

const riga = (patch: Partial<OrderItem>): OrderItem =>
  ({ name: "Massetto", quantity: 1, status: "da_ordinare", position: 0, ...patch } as OrderItem);

describe("nuova commessa: quantità non intere dal contratto", () => {
  it("«massetto 12,5 mq» diventa 1 × il totale di riga, con la quantità vera nella descrizione", () => {
    const r = rigaConQuantitaIntera(riga({ quantity: 12.5, unit_price: 34, purchase_price: 20, standard_cost: 18 }));
    expect(r).toMatchObject({ quantity: 1, unit_price: 425, purchase_price: 250, standard_cost: 225 });
    expect(r.description).toBe("Quantità 12,5 × 34,00 €");
    expect(Number.isInteger(r.quantity)).toBe(true);
  });

  it("il totale di riga non cambia e la descrizione esistente resta", () => {
    const prima = riga({ quantity: 3.333, unit_price: 10.01, description: "Cappotto" });
    const dopo = rigaConQuantitaIntera(prima);
    expect(dopo.unit_price! * dopo.quantity).toBeCloseTo(Math.round(3.333 * 10.01 * 100) / 100, 2);
    expect(dopo.description).toMatch(/^Cappotto · Quantità 3,333/);
  });

  it("le quantità intere restano come sono", () => {
    const r = riga({ quantity: 4, unit_price: 50 });
    expect(rigaConQuantitaIntera(r)).toBe(r);
  });

  it("vale per l'import del contratto e per ogni riga del salvataggio", () => {
    const src = readFileSync(resolve(process.cwd(), "src/pages/azienda/CreateOrder.tsx"), "utf8");
    expect(src).toContain("return rigaConQuantitaIntera<OrderItem>({");
    expect(src).toContain("orderItems.map(rigaConQuantitaIntera).map((item, index) => ({");
  });
});
