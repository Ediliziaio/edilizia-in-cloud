/**
 * Le voci che partono per create_order_atomic (nuova commessa) e commessa_salva
 * (modifica): guardie sul testo, perché le due pagine sono troppo grandi per un
 * test di comportamento. Il ritorno dei dati nel modulo è provato sul mapper.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { mapDbItemToOrderItem, type OrderItemData } from "@/lib/orderUtils";

const leggi = (f: string) => readFileSync(join(__dirname, "../../pages/azienda", f), "utf8");
const tra = (s: string, da: string, a: string) => s.slice(s.indexOf(da), s.indexOf(a, s.indexOf(da)));

const CREA = tra(leggi("CreateOrder.tsx"), "const itemsPayload = orderItems.map", "}));");
const MODIFICA = tra(leggi("EditOrder.tsx"), "const voci = orderItems.map", "}));");

describe("le voci della commessa portano listino, arrivo previsto e distinta", () => {
  it.each([["nuova commessa", CREA], ["modifica commessa", MODIFICA]])("%s", (_nome, payload) => {
    expect(payload.length).toBeGreaterThan(100);
    expect(payload).toContain("article_template_id: item.article_template_id || null");
    expect(payload).toContain("categoria: item.categoria || null");
    expect(payload).toContain("product_code: item.product_code || null");
    expect(payload).toContain("delivery_date: item.delivery_date || null");
    expect(payload).toMatch(/posizioni: \(?item\.posizioni\?\.length \? item\.posizioni : null/);
  });

  it("in modifica la riga del database torna nel modulo con arrivo previsto e distinta", () => {
    const posizioni = [{ id: "p1", label: "Finestra cucina", quantity: 1 }];
    const riga = { id: "r1", name: "Finestra", description: null, quantity: 1, status: "da_ordinare", position: 0,
      supplier_id: null, purchase_price: null, vat_rate: 22, stock_item_id: null, is_paid: false, paid_date: null,
      payment_method: null, unit_price: null, discount_percent: null, standard_cost: 300, article_template_id: "lst-1",
      product_code: "FIN-1", categoria: "Serramenti", deposit_amount: null, deposit_paid: null, deposit_paid_date: null,
      balance_amount: null, balance_paid: null, balance_paid_date: null, balance_expected_date: null, deposit_expected_date: null,
      delivery_date: "2026-11-03", posizioni } as unknown as OrderItemData;
    expect(mapDbItemToOrderItem(riga)).toMatchObject({
      article_template_id: "lst-1", product_code: "FIN-1", categoria: "Serramenti", delivery_date: "2026-11-03", posizioni,
    });
    expect(mapDbItemToOrderItem({ ...riga, delivery_date: null, posizioni: null } as OrderItemData))
      .toMatchObject({ delivery_date: undefined, posizioni: null });
  });
});

describe("dettaglio commessa: gli importi di costo seguono il permesso", () => {
  const DETTAGLIO = leggi("OrderDetail.tsx");
  it("le uscite di magazzino ricevono canViewCosts come i consumi", () => {
    expect(DETTAGLIO).toContain("<OrderMaterialUsageCard orderId={id!} showCosts={permissions.canViewCosts} />");
    expect(DETTAGLIO).toContain("<OrderUsciteCard orderId={id!} canViewCosts={permissions.canViewCosts} />");
  });
  it("l'elenco degli articoli del dettaglio riceve canViewCosts", () => {
    const articoli = readFileSync(join(__dirname, "../../components/orders/OrdineArticoli.tsx"), "utf8");
    expect(articoli).toContain("canViewCosts={canViewCosts}");
  });
});
