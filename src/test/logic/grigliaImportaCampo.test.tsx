/**
 * «Importa AI» della griglia: i valori vanno nel campo che il prodotto usa
 * (05/10/2026).
 *
 * Il dialog partiva sempre da «Prezzo di acquisto» e non sapeva come il
 * prodotto calcola il prezzo: in un prodotto a prezzo di vendita le celle
 * nuove restavano a vendita 0; in uno con ricarico sul fornitore una tabella
 * importata come vendita si perdeva al salvataggio.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { GridBulkImportDialog } from "@/components/listino/GridBulkImportDialog";

afterEach(cleanup);

const MATRICE = "L/H\t1000\t1200\n1000\t300\t350\n1200\t320\t380";

function importa(modo: "vendita" | "acquisto_markup") {
  const onApply = vi.fn();
  render(<GridBulkImportDialog open onOpenChange={vi.fn()} onApply={onApply} prezzoBaseMode={modo} />);
  return onApply;
}

function applica() {
  fireEvent.change(screen.getByLabelText("Incolla la matrice qui:"), { target: { value: MATRICE } });
  fireEvent.click(screen.getByRole("button", { name: /Applica alla matrice/ }));
}

describe("import della matrice: il campo giusto", () => {
  it("prodotto a prezzo di vendita: parte dalla vendita e la scrive lì", () => {
    const onApply = importa("vendita");
    expect(screen.getByRole("radio", { name: /Prezzo di vendita/ })).toHaveAttribute("aria-checked", "true");
    applica();
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ targetField: "prezzo_vendita" }));
    expect(onApply.mock.calls[0][0].values.get("1000_1000")).toBe(300);
  });

  it("…e il costo del fornitore resta una scelta esplicita", () => {
    const onApply = importa("vendita");
    fireEvent.click(screen.getByRole("radio", { name: /Prezzo di acquisto/ }));
    applica();
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ targetField: "prezzo_acquisto" }));
  });

  it("prodotto con ricarico sul fornitore: solo l'acquisto, la vendita non si sceglie", () => {
    const onApply = importa("acquisto_markup");
    expect(screen.getByRole("radio", { name: /Prezzo di acquisto/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Prezzo di vendita/ })).toBeDisabled();
    applica();
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ targetField: "prezzo_acquisto" }));
  });
});
