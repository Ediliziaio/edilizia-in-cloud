import { describe, expect, it, vi } from "vitest";
import { confermaConsegneFattura, eServizio, righeDaConfermare } from "@/lib/ddt/consegneFattura";

const riga = (id: string, descrizione: string, quantita: number | null, unita_misura: string | null = "mc", extra = {}) =>
  ({ id, descrizione, quantita, unita_misura, order_item_id: null as string | null, ...extra });

describe("consegne della fattura in un clic (23/11/2026)", () => {
  it("materiali come nuovi articoli della commessa, servizi come servizi, solo la quantità aperta", () => {
    const invio = righeDaConfermare({ destinazione: "cantiere", order_id: "o", purchase_order_id: null }, [
      riga("a", "CLS RCK 37 S4 XC1 XC2", 8),
      riga("b", "POMPAGGIO AL MC AUTOPOMPA", 13),
      riga("c", "DIR. CHIAMATA AUTOPOMPA", 1, "nr"),
      riga("d", "CUBIERE PVC", 2, "nr"),
      riga("e", "Riga senza quantità", null),
      riga("f", "Già consegnata", 4),
    ], new Map([["f", 4], ["a", 3]]));
    expect(invio.map((r) => [r.riga_id, r.tipo, r.quantita, r.crea_articolo])).toEqual([
      ["a", "ingresso", 5, true],
      ["b", "servizio", 13, false],
      ["c", "servizio", 1, false],
      ["d", "ingresso", 2, true],
    ]);
  });
  it("magazzino, senza commessa o con ordine d'acquisto: niente in automatico", () => {
    const righe = [riga("a", "Cls", 4)];
    expect(righeDaConfermare({ destinazione: "magazzino", order_id: null, purchase_order_id: null }, righe, new Map())).toEqual([]);
    expect(righeDaConfermare({ destinazione: "cantiere", order_id: "o", purchase_order_id: "po" }, righe, new Map())).toEqual([]);
  });
  it("«214 INTEGRAZIONE VIAGGIO» è un servizio; il calcestruzzo no", () => {
    expect(eServizio("214 INTEGRAZIONE VIAGGIO")).toBe(true);
    expect(eServizio("Cls C 28-35 S4 XC1XC2")).toBe(false);
  });
  it("una bolla che non va non ferma le altre", async () => {
    const bolle: Record<string, unknown> = {
      b1: { id: "b1", numero_ddt: "1", destinazione: "cantiere", order_id: "o", purchase_order_id: null },
      b2: { id: "b2", numero_ddt: "2", destinazione: "cantiere", order_id: "o", purchase_order_id: "po" },
      b3: { id: "b3", numero_ddt: "3", destinazione: "cantiere", order_id: "o", purchase_order_id: null },
    };
    const rpc = vi.fn(async (_n: string, a: { p_ddt: string }) => ({ data: null, error: a.p_ddt === "b3" ? { message: "unità da confermare" } : null }));
    const db = {
      rpc,
      from: (t: string) => {
        let id = "";
        const q: Record<string, unknown> = {};
        Object.assign(q, {
          select: () => q, order: () => Promise.resolve({ data: [riga(`r-${id}`, "Cls", 4)], error: null }),
          eq: (_k: string, v: string) => { id = v; return t === "ddt_consegne" ? Promise.resolve({ data: [], error: null }) : q; },
          single: () => Promise.resolve({ data: bolle[id], error: null }),
        });
        return q;
      },
    };
    const esito = await confermaConsegneFattura(["b1", "b2", "b3"], db as never);
    expect(esito.confermate).toBe(1);
    expect(esito.saltate.map((s) => s.numero)).toEqual(["2", "3"]);
  });
});
