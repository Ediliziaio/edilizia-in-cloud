import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: undefined as unknown, effectiveCompany: undefined as unknown }) }));

import { CAMPI_CHE_SEGUONO_LA_DIVISIONE, MESSAGGIO_SCARICO_NON_SPOSTATO, creaPartiDivise, parteDivisa } from "@/hooks/useOrderWorkPhases";

const originale = {
  id: "riga-1", order_id: "o1", name: "Cemento", description: "Sacchi 25 kg", natura_riga: "materiale",
  quantity: 100, phase_id: "fase-1", purchase_price: 4.5, vat_rate: 22, supplier_id: "s1", stock_item_id: "st1",
  status: "in_magazzino", fulfillment_status: "received", auto_deducted: true, delivery_date: "2026-10-20",
  article_template_id: "lst-1", product_code: "CEM-25", categoria: "Leganti", standard_cost: 4.2,
  unit_price: 6, discount_percent: 5, destination_warehouse_id: "w1",
  quantity_received: 100, quantity_reserved: 10, deposit_amount: 200, balance_amount: 250,
  posizioni: [{ id: "p1" }],
};

describe("dividere un articolo tra le fasi", () => {
  it("la nuova parte porta stato, consegna, scarico e aggancio al listino", () => {
    const riga = parteDivisa(originale, { phaseId: "fase-2", quantity: 40 });
    expect(riga).toMatchObject({
      order_id: "o1", name: "Cemento", description: "Sacchi 25 kg", natura_riga: "materiale",
      quantity: 40, phase_id: "fase-2",
      status: "in_magazzino", fulfillment_status: "received", auto_deducted: true, delivery_date: "2026-10-20",
      article_template_id: "lst-1", product_code: "CEM-25", categoria: "Leganti", standard_cost: 4.2,
      unit_price: 6, discount_percent: 5, destination_warehouse_id: "w1",
    });
  });
  it("id, quantità ricevute e riservate, acconti, saldi e distinta restano sulla riga originale", () => {
    const riga = parteDivisa(originale, { phaseId: null, quantity: 60 });
    for (const campo of ["id", "quantity_received", "quantity_reserved", "deposit_amount", "balance_amount", "posizioni"]) {
      expect(riga).not.toHaveProperty(campo);
    }
    expect(riga.phase_id).toBeNull();
  });
  it("legge dal database ogni campo che copia", () => {
    expect(CAMPI_CHE_SEGUONO_LA_DIVISIONE).toEqual(expect.arrayContaining([
      "status", "fulfillment_status", "article_template_id", "product_code", "categoria", "standard_cost", "delivery_date", "auto_deducted",
    ]));
  });
});

/** Client finto: registra inserimenti e chiamate RPC. */
function clientFinto(rpcError: { message: string } | null = null) {
  const inseriti: Record<string, unknown>[] = [];
  const rpc: Array<{ nome: string; args: Record<string, unknown> }> = [];
  const client = {
    from: (tabella: string) => ({
      insert: (riga: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            inseriti.push({ tabella, ...riga });
            return { data: { id: `nuova-${inseriti.length}` }, error: null as unknown };
          },
        }),
      }),
    }),
    rpc: async (nome: string, args: Record<string, unknown>) => {
      rpc.push({ nome, args });
      return { data: 0, error: rpcError };
    },
  };
  return { client: client as never, inseriti, rpc };
}

describe("dividere un articolo da magazzino: la quota di scarico segue la riga nuova", () => {
  it("dopo ogni riga nuova sposta la sua quota con dividi_scarico_magazzino", async () => {
    const { client, inseriti, rpc } = clientFinto();
    await creaPartiDivise(client, originale, [{ phaseId: "fase-2", quantity: 30 }, { phaseId: "fase-3", quantity: 10 }]);
    expect(inseriti.map(r => [r.tabella, r.quantity, r.phase_id])).toEqual([["order_items", 30, "fase-2"], ["order_items", 10, "fase-3"]]);
    expect(rpc).toEqual([
      { nome: "dividi_scarico_magazzino", args: { p_originale: "riga-1", p_nuova: "nuova-1", p_quantita: 30 } },
      { nome: "dividi_scarico_magazzino", args: { p_originale: "riga-1", p_nuova: "nuova-2", p_quantita: 10 } },
    ]);
  });

  it("un articolo senza magazzino chiama comunque la RPC: divide la riga dell'ordine d'acquisto", async () => {
    const { client, rpc } = clientFinto();
    await creaPartiDivise(client, { ...originale, stock_item_id: null }, [{ phaseId: "fase-2", quantity: 40 }]);
    expect(rpc.map((r) => r.nome)).toEqual(["dividi_scarico_magazzino"]);
    expect(rpc[0].args).toMatchObject({ p_quantita: 40 });
  });

  it("senza magazzino, se la divisione dell'ordine non riesce lo dice in chiaro", async () => {
    const { client } = clientFinto({ message: "permission denied" });
    await expect(creaPartiDivise(client, { ...originale, stock_item_id: null }, [{ phaseId: "fase-2", quantity: 40 }]))
      .rejects.toThrow(/ordine d'acquisto copre ancora solo la riga originale/);
  });

  it("se lo spostamento non riesce lo dice in chiaro", async () => {
    const { client } = clientFinto({ message: "permission denied" });
    await expect(creaPartiDivise(client, originale, [{ phaseId: "fase-2", quantity: 40 }]))
      .rejects.toThrow(MESSAGGIO_SCARICO_NON_SPOSTATO);
  });
});
