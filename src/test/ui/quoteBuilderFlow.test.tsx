import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CatalogCategory, ConfiguredItem } from "@/types/catalogItem";

vi.mock("@/hooks/useCatalogCategories", () => ({ useCatalogCategories: () => ({ data: [] as CatalogCategory[] }) }));
vi.mock("@/hooks/useCatalogItems", () => ({
  useCatalogItems: () => ({ items: [{ source: "article", id: "window", nome: "Finestra PVC", prezzo_base_vendita: 100, modalita_prezzo: "pz" }], isLoading: false }),
}));
vi.mock("@/components/marketing/preventivi/configurators/ProductConfigurator", () => ({
  ProductConfigurator: ({ currentSortOrder, onAddItems, confirmLabel }: { currentSortOrder: number; onAddItems: (items: ConfiguredItem[], next: number) => void; confirmLabel: string }) => (
    <button onClick={() => onAddItems([
      { quote_item: { name: "Finestra PVC", sort_order: currentSortOrder, client_temp_id: `product-${currentSortOrder}` } },
      { quote_item: { name: "Posa", sort_order: currentSortOrder + 1, parent_temp_id: `product-${currentSortOrder}` } },
    ] as ConfiguredItem[], currentSortOrder + 2)}>{confirmLabel}</button>
  ),
}));

import { AddItemDialog } from "@/components/marketing/preventivi/AddItemDialog";
import { QuoteStepper } from "@/components/marketing/preventivi/ui/builderUI";

afterEach(cleanup);

describe("preventivo classico: inserimento continuo", () => {
  it("cerca subito nel catalogo e conserva la ricerca dopo ogni aggiunta con posa", () => {
    const receive = vi.fn();
    const close = vi.fn();
    function Harness() {
      const [count, setCount] = useState(0);
      return <AddItemDialog open onClose={close} tariffe={[]} currentSortOrder={count} onAddItems={(items, next) => { receive(items, next); setCount(next); }} />;
    }
    render(<Harness />);
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca nel catalogo prodotti" }), { target: { value: "PVC" } });
    fireEvent.click(screen.getByRole("button", { name: /Finestra PVC/ }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi e continua" }));
    expect(screen.getByRole("textbox", { name: "Cerca nel catalogo prodotti" })).toHaveValue("PVC");
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Finestra PVC/ }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi e continua" }));
    expect(receive).toHaveBeenCalledTimes(2);
    expect(receive.mock.calls[1][1]).toBe(4);
    expect(receive.mock.calls[1][0][1].quote_item.parent_temp_id).toBe(receive.mock.calls[1][0][0].quote_item.client_temp_id);
    expect(screen.getByRole("status")).toHaveTextContent("2 prodotti inseriti");
    fireEvent.click(screen.getByRole("button", { name: "Fatto, torna al preventivo" }));
    expect(close).toHaveBeenCalledOnce();
  });

  it("consente di aggiungere un solo prodotto e chiudere", () => {
    const close = vi.fn();
    const receive = vi.fn();
    render(<AddItemDialog open onClose={close} tariffe={[]} currentSortOrder={0} onAddItems={receive} />);
    fireEvent.click(screen.getByRole("button", { name: /Finestra PVC/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Continua ad aggiungere prodotti" }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi e chiudi" }));
    expect(receive).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});

describe("completamento reale delle sezioni", () => {
  it("non segna il cliente completato soltanto perché si sta guardando l'anteprima", () => {
    render(<QuoteStepper steps={[{ key: "client", label: "Cliente" }, { key: "items", label: "Prodotti" }, { key: "preview", label: "Anteprima" }]} current={2} completedSteps={[false, true, false]} />);
    expect(screen.getByRole("button", { name: /Cliente/ })).not.toHaveTextContent("✓");
    expect(screen.getByRole("button", { name: /Prodotti/ })).toHaveTextContent("✓");
    expect(screen.getByText("1 di 3 sezioni compilate")).toBeInTheDocument();
  });
});
