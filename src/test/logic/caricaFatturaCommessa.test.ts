import { beforeEach, describe, expect, it, vi } from "vitest";
import { collegaFatturaACommessa, tipoFileFattura } from "@/components/orders/CaricaFatturaCommessa";

const m = vi.hoisted(() => ({
  fattura: { company_id: "demo", purchase_order_id: null as string | null },
  ordine: { order_id: "generale", orders: null as { commessa_generale_id: string } | null },
  errore: null as { message: string } | null,
  filtri: [] as Array<[string, string, unknown]>,
  rpc: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: m.rpc,
  from: (table: string) => {
    const q = {
      select: () => q,
      eq: (campo: string, valore: unknown) => { m.filtri.push([table, campo, valore]); return q; },
      single: async () => ({ data: table === "fatture_ricevute" ? m.fattura : m.ordine, error: m.errore }),
    };
    return q;
  },
} }));
beforeEach(() => {
  m.fattura = { company_id: "demo", purchase_order_id: null };
  m.ordine = { order_id: "generale", orders: null };
  m.errore = null;
  m.filtri = [];
  m.rpc.mockReset().mockResolvedValue({ data: { esito: "collegata" }, error: null });
});

describe("fattura caricata dalla commessa", () => {
  it("XML e P7M vanno allo SDI, PDF e foto alla lettura AI", () => {
    expect(tipoFileFattura({ name: "IT01234567890_abc.xml", type: "" })).toBe("xml");
    expect(tipoFileFattura({ name: "IT01234567890_abc.XML.P7M", type: "application/pkcs7-mime" })).toBe("xml");
    expect(tipoFileFattura({ name: "fattura.pdf", type: "application/pdf" })).toBe("documento");
    expect(tipoFileFattura({ name: "foto.jpg", type: "image/jpeg" })).toBe("documento");
    expect(tipoFileFattura({ name: "scansione", type: "image/heic" })).toBe("documento");
  });

  it("il resto si rifiuta prima di caricare", () => {
    expect(tipoFileFattura({ name: "fatture.zip", type: "application/zip" })).toBe("non_valido");
    expect(tipoFileFattura({ name: "tabella.xlsx", type: "application/vnd.ms-excel" })).toBe("non_valido");
  });

  it("usa il collegamento nativo diretto quando manca un ordine d'acquisto", async () => {
    await expect(collegaFatturaACommessa("fattura", "generale")).resolves.toBe("collegata");
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith("commessa_collega_fattura_ricevuta", {
      p_fattura_id: "fattura", p_order_id: "generale",
    });
  });

  it("contabilizza sul costo dell'OdA riconosciuto dall'XML senza creare un costo diretto aggiuntivo", async () => {
    m.fattura.purchase_order_id = "oda";
    await expect(collegaFatturaACommessa("fattura", "generale")).resolves.toBe("contabilizzata_su_ordine");
    expect(m.filtri).toContainEqual(["purchase_orders", "company_id", "demo"]);
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith("contabilizza_fattura_ricevuta", { p_fattura_id: "fattura" });
  });

  it("non sposta una fattura già attribuita a un'altra commessa", async () => {
    m.fattura.purchase_order_id = "oda";
    m.ordine.order_id = "altra-commessa";
    await expect(collegaFatturaACommessa("fattura", "generale")).rejects.toThrow("un'altra commessa");
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("conserva l'unità già collegata quando si importa dal suo riepilogo generale", async () => {
    m.fattura.purchase_order_id = "oda";
    m.ordine = { order_id: "unita", orders: { commessa_generale_id: "generale" } };
    await expect(collegaFatturaACommessa("fattura", "generale")).resolves.toBe("contabilizzata_su_ordine");
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith("contabilizza_fattura_ricevuta", { p_fattura_id: "fattura" });
  });

  it("non prosegue se non riesce a verificare il documento", async () => {
    m.errore = { message: "Documento non accessibile" };
    await expect(collegaFatturaACommessa("fattura", "generale")).rejects.toThrow("Documento non accessibile");
    expect(m.rpc).not.toHaveBeenCalled();
  });
});
