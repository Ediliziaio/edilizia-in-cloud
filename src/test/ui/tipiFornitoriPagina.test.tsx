import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// 30/10/2026 — Tipi dei fornitori: ogni cedente col tipo proposto e il perché;
// confermare aggiorna o crea la scheda e ci collega le fatture.

const finto = vi.hoisted(() => ({ cedenti: [] as unknown[], chiamate: [] as Array<[string, string, unknown]> }));
vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string): any => {
    const c: any = {};
    for (const m of ["select", "eq", "is", "limit", "not", "order"]) c[m] = () => c;
    c.update = (v: unknown) => { finto.chiamate.push([tabella, "update", v]); return c; };
    c.insert = (v: unknown) => { finto.chiamate.push([tabella, "insert", v]); return c; };
    c.single = async () => ({ data: { id: "nuovo" }, error: null as null });
    c.then = (ok: (v: unknown) => unknown) => ok({ data: tabella === "fatture_ricevute" ? [{ id: "f1" }, { id: "f2" }] : [], error: null as null });
    return c;
  };
  return {
    supabase: {
      from: catena,
      rpc: async (nome: string, args: unknown) => {
        if (nome === "cedenti_fatture_ricevute") return { data: finto.cedenti, error: null as null };
        finto.chiamate.push(["rpc", nome, args]);
        return { data: 2, error: null as null };
      },
    },
  };
});
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "co" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import TipiFornitoriPage from "@/pages/azienda/fatturazione/TipiFornitoriPage";

const base: Record<string, unknown> = { cf: null, ultima: "2026-10-20", fornitore_nome: null, fornitore_tipo: null, fornitore_categoria: null, subappaltatore_id: null, reverse_charge_edile: false, categorie: [] as string[] };

function apri() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><TipiFornitoriPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  finto.chiamate = [];
  finto.cedenti = [
    { ...base, chiave: "00488410010", piva: "00488410010", nome: "TIM S.p.A.", fatture: 115, imponibile: 9800, fornitore_id: null },
    { ...base, chiave: "111", piva: "111", nome: "Edil di Grigoras Petru", fatture: 36, imponibile: 52000, fornitore_id: "s9", fornitore_nome: "Grigoras", subappaltatore_id: "sa1" },
    { ...base, chiave: "222", piva: "222", nome: "Rossi Srl", fatture: 3, imponibile: 1200, fornitore_id: null },
    { ...base, chiave: "333", piva: "333", nome: "Leroy Merlin Italia srl", fatture: 50, imponibile: 7000, fornitore_id: "s3", fornitore_tipo: "materiali" },
  ];
});

describe("Tipi dei fornitori", () => {
  it("propone e spiega; i già classificati non stanno tra i da fare", async () => {
    apri();
    expect(await screen.findByText("TIM S.p.A.", {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByText(/Proposta sicura: dal nome/)).toBeTruthy();
    expect(screen.getByText(/è nell'elenco dei subappaltatori/)).toBeTruthy();
    expect(screen.queryByText("Leroy Merlin Italia srl")).toBeNull();
    expect(screen.getByRole("button", { name: /Conferma le proposte sicure \(2\)/ })).toBeTruthy();
  });

  it("le proposte sicure: crea TIM come spesa generale e collega le sue fatture; il subappaltatore si collega alla sua scheda", async () => {
    apri();
    fireEvent.click(await screen.findByRole("button", { name: /Conferma le proposte sicure/ }, { timeout: 5000 }));
    await waitFor(() => expect(finto.chiamate.filter(([, op]) => op === "collega_fornitore_ricevute")).toHaveLength(2));
    expect(finto.chiamate).toContainEqual(["suppliers", "insert", expect.objectContaining({ name: "TIM S.p.A.", vat_number: "00488410010", tipo: "generali" })]);
    expect(finto.chiamate).toContainEqual(["suppliers", "update", { tipo: "subappalto", subappaltatore_id: "sa1" }]);
    expect(finto.chiamate).toContainEqual(["rpc", "collega_fornitore_ricevute", { p_company_id: "co", p_invoice_ids: ["f1", "f2"], p_supplier_id: "nuovo" }]);
  });

  it("senza indizi non propone niente: decide una persona", async () => {
    apri();
    await screen.findByText("Rossi Srl", {}, { timeout: 5000 });
    expect(screen.getByRole("combobox", { name: "Tipo di Rossi Srl" }).textContent).toContain("Scegli il tipo");
  });
});
