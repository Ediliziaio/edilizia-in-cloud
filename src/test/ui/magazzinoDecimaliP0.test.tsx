import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StockMovementDialog } from "@/components/warehouse/StockMovementDialog";
import { StockItemDialog } from "@/components/warehouse/StockItemDialog";
import type { StockItem } from "@/types/warehouse";

vi.mock("@/components/orders/CommessaCombobox", () => ({ CommessaCombobox: (): null => null }));
vi.mock("@/components/orders/SupplierSelect", () => ({ SupplierSelect: (): null => null }));
vi.mock("@/components/shared/EntityCustomFieldsSection", () => ({ EntityCustomFieldsSection: (): null => null }));
vi.mock("@/hooks/useWarehouseSections", () => ({ useWarehouseSections: () => ({ sections: [] as never[] }) }));

describe("Quantità decimali nei moduli magazzino", () => {
  it("scarica una frazione intera del valore digitato e rifiuta il superamento del disponibile", () => {
    const save = vi.fn();
    render(<StockMovementDialog open onOpenChange={vi.fn()} onSave={save} type="scarico" itemName="Guaina" maxQuantity={0.75} canViewCosts={false} />);
    const quantity = screen.getByRole("spinbutton");
    fireEvent.change(quantity, { target: { value: "0.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Scarica" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ quantity: 0.5 }));
    fireEvent.change(quantity, { target: { value: "0.76" } });
    fireEvent.click(screen.getByRole("button", { name: "Scarica" }));
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("rifiuta frazioni per articoli tracciati per singolo seriale", () => {
    const save = vi.fn();
    render(<StockMovementDialog open onOpenChange={vi.fn()} onSave={save} type="carico" itemName="Motore serializzato" serialized />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "0.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Carica" }));
    expect(save).not.toHaveBeenCalled();
  });
  it("salva giacenza e minimo senza troncarli e nasconde il costo senza permesso", () => {
    const save = vi.fn();
    render(<StockItemDialog open onOpenChange={vi.fn()} onSave={save} canViewCosts={false} editingItem={{ id: "i", name: "Guaina", quantity: 12.75, min_stock_level: 1.5, unit_cost: 25, vat_rate: 22, tracking_mode: "fungible" } as StockItem} />);
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ quantity: 12.75, min_stock_level: 1.5 }));
    expect(screen.queryByText("Costo Unitario (€)")).toBeNull();
    expect(screen.queryByText(/Registra costo/)).toBeNull();
  });
});

it("un articolo misurabile conserva l’unità scelta e rifiuta costi negativi", () => {
  const save = vi.fn();
  render(<StockItemDialog open onOpenChange={vi.fn()} onSave={save} />);
  fireEvent.change(screen.getByPlaceholderText("Es: Motore tapparella"), { target: { value: "Cavo" } });
  fireEvent.change(screen.getByLabelText("Unità di misura"), { target: { value: "m" } });
  const numbers = screen.getAllByRole("spinbutton");
  fireEvent.change(numbers[0], { target: { value: "2.75" } });
  fireEvent.change(numbers[1], { target: { value: "-3" } });
  expect(screen.getByRole("button", { name: "Aggiungi" })).toBeDisabled();
  fireEvent.change(numbers[1], { target: { value: "12.5" } });
  fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ quantity: 2.75, unit_cost: 12.5, unita_misura: "m" }));
});

it("la garanzia obbligatoria mantiene il tracking serializzato e impedisce il ritorno a fungibile", async () => {
  Object.defineProperty(HTMLElement.prototype,"scrollIntoView",{configurable:true,value:vi.fn()});
  const save=vi.fn();render(<StockItemDialog open onOpenChange={vi.fn()} onSave={save} />);
  fireEvent.change(screen.getByPlaceholderText("Es: Motore tapparella"),{target:{value:"Motore garantito"}});
  fireEvent.click(screen.getByRole("button",{name:/QR & Tracking/}));
  fireEvent.click(screen.getByRole("checkbox",{name:"Garanzia obbligatoria"}));
  const label=screen.getByText("Modalità tracking");const trigger=label.parentElement!.querySelector('[role="combobox"]')!;
  fireEvent.keyDown(trigger,{key:"Enter"});
  expect(await screen.findByRole("option",{name:/Fungibile/})).toHaveAttribute("aria-disabled","true");
  fireEvent.keyDown(trigger,{key:"Escape"});
  fireEvent.click(screen.getByRole("button",{name:"Aggiungi"}));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({requires_warranty:true,tracking_mode:"serialized"}));
});
