/**
 * Uscita senza fattura: il fornitore si cerca, si sceglie con le frecce, e se non c'è si crea (12/11/2026).
 *
 * Era una tendina con tutti i fornitori dell'azienda (490 in un'impresa), senza ricerca: si scorreva
 * solo passando sulle frecce, la lista saltava oltre, e il Comune di Magnago non si raggiungeva.
 * Se un fornitore non c'era, non si poteva aggiungere.
 * Lo stesso nella finestra del costo della commessa, che cercava ma non lasciava creare.
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" } }) }));
vi.mock("@/lib/listino/loadCatalogPages", () => ({
  loadCatalogPages: async () => [
    { id: "s1", name: "Edil Rossi Srl", vat_rate: 22, is_active: true },
    { id: "s2", name: "COMUNE DI MAGNAGO", vat_rate: 0, is_active: true },
    { id: "s3", name: "Ferramenta Città", vat_rate: 22, is_active: true },
    { id: "s4", name: "COMUNE DI MILANO", vat_rate: 0, is_active: true },
    { id: "s5", name: "COMUNE DI LEGNANO", vat_rate: 0, is_active: true },
  ],
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));

import { SupplierSelect } from "@/components/orders/SupplierSelect";

const ROOT = join(__dirname, "../../..");
const leggi = (f: string) => readFileSync(join(ROOT, f), "utf8");

class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver ??= RO;
Element.prototype.scrollIntoView ??= () => {};

afterEach(cleanup);

function apri(onValueChange = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SupplierSelect value="" onValueChange={onValueChange} searchable allowCreate />
    </QueryClientProvider>,
  );
  return onValueChange;
}

describe("Il fornitore nell'uscita senza fattura", () => {
  it("si cerca anche senza accenti e con più parole", async () => {
    apri();
    const tendina = screen.getByRole("combobox", { name: "Fornitore" });
    await waitFor(() => expect(tendina).not.toBeDisabled());
    fireEvent.click(tendina);
    fireEvent.change(screen.getByRole("combobox", { name: "Cerca Fornitore" }), { target: { value: "comune magn" } });
    expect(screen.getByRole("option", { name: "COMUNE DI MAGNAGO" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Edil Rossi Srl" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Cerca Fornitore" }), { target: { value: "citta" } });
    expect(screen.getByRole("option", { name: "Ferramenta Città" })).toBeInTheDocument();
  });

  it("si sceglie con le frecce e Invio", async () => {
    const scelto = apri();
    const tendina = screen.getByRole("combobox", { name: "Fornitore" });
    await waitFor(() => expect(tendina).not.toBeDisabled());
    fireEvent.keyDown(tendina, { key: "ArrowDown" });
    const cerca = screen.getByRole("combobox", { name: "Cerca Fornitore" });
    fireEvent.change(cerca, { target: { value: "magnago" } });
    fireEvent.keyDown(cerca, { key: "Enter" });
    expect(scelto).toHaveBeenCalledWith("s2", 0, undefined);
  });

  it("se non c'è, dice di aggiungerlo col «+», che è lì accanto", async () => {
    apri();
    const tendina = screen.getByRole("combobox", { name: "Fornitore" });
    await waitFor(() => expect(tendina).not.toBeDisabled());
    expect(screen.getByRole("button", { name: "Aggiungi nuovo fornitore" })).toBeEnabled();
    fireEvent.click(tendina);
    fireEvent.change(screen.getByRole("combobox", { name: "Cerca Fornitore" }), { target: { value: "comune di vasto" } });
    expect(screen.getByText("Fornitore non trovato. Usa + per registrarlo.")).toBeInTheDocument();
  });
});

describe("Le due finestre usano la tendina con ricerca e creazione", () => {
  it("uscita senza fattura: niente più tendina semplice", () => {
    const f = leggi("src/components/fatturazione/UsciteSenzaFattura.tsx");
    expect(f).toContain("<SupplierSelect value={form.fornitoreId}");
    expect(f).toContain("fallbackCompanyId={companyId} searchable allowCreate />");
    expect(f).not.toContain('from "@/components/ui/select"');
    expect(f).toContain("<ViaggioSelect");
  });

  it("costo della commessa: il fornitore nuovo si crea da lì", () => {
    const f = leggi("src/components/orders/OrderCostiCommessa.tsx");
    expect(f).toContain('placeholder="Nessuno" searchable allowCreate />');
    expect(f).not.toContain("allowCreate={false}");
  });
});
