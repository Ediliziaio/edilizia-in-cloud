import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { cosaManca, fatturatoOltreOrdine } from "@/components/orders/OrderDocumentiFornitore";

describe("bolle: cosa manca", () => {
  it("una foto dal cantiere da verificare è da confermare, anche con l'ordine già proposto", () => {
    expect(cosaManca("cantiere", { stato: "da_verificare" }).daFare).toBe("conferma");
    expect(cosaManca("cantiere", { stato: "da_verificare", purchase_order_id: "o" }).motivo).toContain("di questo ordine");
    expect(cosaManca("cantiere", { stato: "registrato" }).daFare).toBeNull();
  });
  it("arrivata senza ordine è da confermare; sull'ordine è solo da controllare", () => {
    expect(cosaManca("fornitore", { stato: "ricevuto" }).daFare).toBe("conferma");
    expect(cosaManca("fornitore", { stato: "ricevuto", purchase_order_id: "o" }).daFare).toBe("controllo");
  });
  it("i dubbi dell'AI chiedono di confermare l'abbinamento", () => {
    expect(cosaManca("fornitore", { stato: "ricevuto", purchase_order_id: "o", ai_avvisi: ["numero incerto"] }).daFare).toBe("conferma");
  });
  it("controllata non chiede niente; danni o non conformità sì, anche se controllata", () => {
    expect(cosaManca("fornitore", { stato: "verificato", purchase_order_id: "o" }).daFare).toBeNull();
    expect(cosaManca("fornitore", { stato: "verificato", purchase_order_id: "o", has_damages: true }).daFare).toBe("controllo");
    expect(cosaManca("fornitore", { stato: "non_conforme" }).daFare).toBe("controllo");
  });
});

describe("fatture: oltre l'ordine", () => {
  it("meno dell'ordine è normale, l'arrotondamento non conta, di più sì", () => {
    expect(fatturatoOltreOrdine(500, 1000)).toBe(false);
    expect(fatturatoOltreOrdine(1000.9, 1000)).toBe(false);
    expect(fatturatoOltreOrdine(1002, 1000)).toBe(true);
    expect(fatturatoOltreOrdine(1002, null)).toBe(false);
    expect(fatturatoOltreOrdine(1002, 0)).toBe(false);
  });
});
