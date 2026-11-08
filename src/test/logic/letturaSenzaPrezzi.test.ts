import { describe, expect, it } from "vitest";
import { selectSenzaPrezzi, urlSenzaPrezzi } from "@/lib/acquisti/letturaSenzaPrezzi";

const base = "https://x.supabase.co/rest/v1/";

describe("lettura senza prezzi", () => {
  it("le tabelle degli acquisti passano alla vista", () => {
    expect(urlSenzaPrezzi(`${base}purchase_orders?select=*&id=eq.1`, "GET")).toContain("/rest/v1/purchase_orders_senza_prezzi?");
    expect(urlSenzaPrezzi(`${base}supplier_rfq_quotes?select=*`, "HEAD")).toContain("supplier_rfq_quotes_senza_prezzi");
  });
  it("gli embed tengono il nome di prima e i modificatori", () => {
    expect(selectSenzaPrezzi("*,purchase_orders(id,oda_number)")).toBe("*,purchase_orders:purchase_orders_senza_prezzi(id,oda_number)");
    expect(selectSenzaPrezzi("id,purchase_orders!inner(status)")).toBe("id,purchase_orders:purchase_orders_senza_prezzi!inner(status)");
    expect(selectSenzaPrezzi("x:purchase_order_items(id)")).toBe("x:purchase_order_items_senza_prezzi(id)");
    expect(selectSenzaPrezzi("*,a(b,purchase_order_items(id))")).toBe("*,a(b,purchase_order_items:purchase_order_items_senza_prezzi(id))");
  });
  it("non tocca colonne dai nomi simili, scritture, RPC e altre tabelle", () => {
    expect(selectSenzaPrezzi("purchase_order_id,purchase_orders_count")).toBe("purchase_order_id,purchase_orders_count");
    for (const m of ["POST", "PATCH", "DELETE"]) expect(urlSenzaPrezzi(`${base}purchase_orders?id=eq.1`, m)).toBe(`${base}purchase_orders?id=eq.1`);
    expect(urlSenzaPrezzi(`${base}rpc/purchase_orders`, "GET")).toBe(`${base}rpc/purchase_orders`);
    expect(urlSenzaPrezzi(`${base}orders?id=eq.1`, "GET")).toContain("/rest/v1/orders?");
    expect(urlSenzaPrezzi("https://x.supabase.co/functions/v1/purchase_orders", "GET")).toBe("https://x.supabase.co/functions/v1/purchase_orders");
  });
  it("il filtro sull'embed resta valido perché il nome non cambia", () => {
    const u = urlSenzaPrezzi(`${base}ddt_righe?select=id,purchase_order_items!inner(purchase_order_id)&purchase_order_items.purchase_order_id=eq.7`, "GET");
    expect(decodeURIComponent(u)).toContain("purchase_order_items:purchase_order_items_senza_prezzi!inner(");
    expect(u).toContain("purchase_order_items.purchase_order_id=eq.7");
  });
});
