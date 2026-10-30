import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const state = vi.hoisted(() => ({
  inserti: [] as Array<{ tabella: string; righe: unknown }>,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "co" }, user: { id: "u" } }) }));
vi.mock("@/hooks/useOperationalSuppliers", () => ({
  useOperationalSuppliers: () => ({ suppliers: [
    { id: "s1", name: "Edil Forniture", is_active: true },
    { id: "s2", name: "Colorificio Rossi", is_active: true },
  ] }),
}));
vi.mock("@/hooks/useMaterialProcurement", () => ({ useMaterialProcurement: () => ({ data: [] as unknown[], isPending: false, isError: false }) }));
vi.mock("@/lib/orders/refreshMaterialQueries", () => ({ refreshMaterialQueries: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => ({
      insert: (righe: unknown) => {
        state.inserti.push({ tabella, righe });
        const fine = Promise.resolve({ data: tabella === "purchase_orders" ? { id: "po1", oda_number: "ODA-2026-050" } : null, error: null });
        return { select: () => ({ single: () => fine }), then: (r: (v: unknown) => unknown) => fine.then(r) };
      },
    }),
  },
}));
import { NuovoOdaCommessaDialog } from "@/components/orders/NuovoOdaCommessaDialog";

const items = [
  { id: "a1", name: "Mattoni forati", quantity: 200, purchase_price: 0.8, vat_rate: 22, supplier_id: "s1", unita_misura: "pz" },
  { id: "a2", name: "Pittura lavabile", quantity: 4, purchase_price: 30, vat_rate: 22, supplier_id: "s2", unita_misura: "secchi" },
];

function disegna(onOpenChange = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <NuovoOdaCommessaDialog open onOpenChange={onOpenChange} orderId="o1" orderCode="C-001" items={items} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return onOpenChange;
}

beforeEach(() => { state.inserti = []; });

describe("Nuovo ordine d'acquisto dalla commessa", () => {
  it("mostra gli articoli da comprare e non crea finché mancano come e a chi", () => {
    disegna();
    expect(screen.getByText("Mattoni forati")).toBeInTheDocument();
    expect(screen.getByText("Pittura lavabile")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crea la bozza" })).toBeDisabled();
  });

  it("scelti come e a chi, spunta gli articoli di quel fornitore e crea la bozza con righe libere", async () => {
    const onOpenChange = disegna();
    fireEvent.click(screen.getByRole("button", { name: /A voce/ }));
    fireEvent.click(screen.getByRole("combobox", { name: "Fornitore" }));
    fireEvent.click(screen.getByRole("option", { name: "Edil Forniture" }));

    expect(screen.getByRole("checkbox", { name: "Ordina Mattoni forati" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Ordina Pittura lavabile" })).not.toBeChecked();
    expect(screen.getByText("di solito da Colorificio Rossi")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Aggiungi riga/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Descrizione" }), { target: { value: "Noleggio betoniera" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Prezzo di Noleggio betoniera" }), { target: { value: "50,00" } });

    expect(screen.getByText(/2 righe/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Crea la bozza" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const ordine = state.inserti.find((i) => i.tabella === "purchase_orders")!.righe as Record<string, unknown>;
    expect(ordine).toMatchObject({ company_id: "co", supplier_id: "s1", order_id: "o1", status: "bozza", origine: "telefono" });
    const righe = state.inserti.find((i) => i.tabella === "purchase_order_items")!.righe as Array<Record<string, unknown>>;
    expect(righe.map((r) => [r.order_item_id, r.description, r.quantity, r.unit_price])).toEqual([
      ["a1", "Mattoni forati", 200, 0.8],
      [null, "Noleggio betoniera", 1, 50],
    ]);
  });
});
