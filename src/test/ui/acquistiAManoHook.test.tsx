import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useAcquistiAMano } from "@/hooks/warehouse/useAcquistiAMano";

const db = vi.hoisted(() => ({ righe: [] as Record<string, unknown>[], scritture: [] as Array<[string, unknown]> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const lettura = {
        select: () => lettura,
        eq: () => lettura,
        order: () => Promise.resolve({ data: db.righe, error: null }),
      };
      return {
        ...lettura,
        insert: (r: unknown) => { db.scritture.push(["insert", r]); return Promise.resolve({ error: null }); },
        // Come il database: la rilettura dopo il salvataggio vede la modifica.
        update: (r: Record<string, unknown>) => ({ eq: (_c: string, id: unknown) => ({ eq: () => {
          db.scritture.push(["update", r]);
          const riga = db.righe.find((x) => x.id === id);
          if (riga) Object.assign(riga, r);
          return Promise.resolve({ error: null });
        } }) }),
        delete: () => ({ in: (_c: string, ids: unknown) => ({ eq: () => { db.scritture.push(["delete", ids]); return Promise.resolve({ error: null }); } }) }),
      };
    },
  },
}));

const avvolgi = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  db.righe = [];
  db.scritture = [];
  window.localStorage.clear();
});

describe("Lista acquisti: dal browser al database", () => {
  it("le voci rimaste nel browser entrano nella tabella e il browser le dimentica", async () => {
    window.localStorage.setItem("warehouse-purchase-list:az1", JSON.stringify([{ id: "manual-1", name: "Guarnizioni", quantity: 3 }]));
    renderHook(() => useAcquistiAMano("az1", false), { wrapper: avvolgi() });
    await waitFor(() => expect(db.scritture.some(([tipo]) => tipo === "insert")).toBe(true));
    const [, righe] = db.scritture.find(([tipo]) => tipo === "insert")!;
    expect((righe as Array<{ nome: string; company_id: string }>)[0]).toMatchObject({ nome: "Guarnizioni", company_id: "az1" });
    await waitFor(() => expect(window.localStorage.getItem("warehouse-purchase-list:az1")).toBeNull());
  });

  it("chi legge e basta non sposta niente e non scrive", async () => {
    window.localStorage.setItem("warehouse-purchase-list:az1", JSON.stringify([{ name: "Guarnizioni" }]));
    const { result } = renderHook(() => useAcquistiAMano("az1", true), { wrapper: avvolgi() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.setVoci([]));
    expect(db.scritture).toEqual([]);
    expect(window.localStorage.getItem("warehouse-purchase-list:az1")).not.toBeNull();
  });

  it("un cambio di stato diventa un update della sola voce", async () => {
    db.righe = [{
      id: "6f1c0e0a-8a51-4c84-9a0c-0b3a3d4e5f61", company_id: "az1", nome: "Silicone", quantita: 12, costo_unitario: 4.5,
      aliquota_iva: 22, supplier_id: null, warehouse_id: null, metodo_pagamento: null, termine_pagamento: "consegna",
      pagamento_previsto_il: null, pagato: false, pagato_il: null, acconto_pagato: false, acconto_previsto_il: null,
      saldo_pagato: false, saldo_previsto_il: null, stato: "da_ordinare", ordinato_il: null, arrivo_il: null,
      priorita: "media", entro_il: null, note: "", completato: false,
    }];
    const { result } = renderHook(() => useAcquistiAMano("az1", false), { wrapper: avvolgi() });
    await waitFor(() => expect(result.current.voci).toHaveLength(1));
    act(() => result.current.setVoci((v) => v.map((x) => ({ ...x, status: "ordinato" as const, orderDate: "2026-10-29" }))));
    await waitFor(() => expect(result.current.voci[0].status).toBe("ordinato"));
    await waitFor(() => expect(db.scritture).toHaveLength(1));
    expect(db.scritture[0][0]).toBe("update");
    expect(db.scritture[0][1]).toMatchObject({ stato: "ordinato", ordinato_il: "2026-10-29" });
  });
});
