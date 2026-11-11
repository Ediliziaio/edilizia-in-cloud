import { render, screen, within } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { expect, it, vi } from "vitest";
import WarehouseKanbanView from "@/components/warehouse/WarehouseKanbanView";
import type { WarehouseItem } from "@/types/warehouse";

vi.mock("@/components/warehouse/WarehouseItemDetailDialog", () => ({
  default: (): null => null,
}));

it("mostra una consegna diretta nella colonna In Cantiere senza confonderla con il magazzino", () => {
  const item: WarehouseItem = {
    id: "materiale-cantiere",
    name: "Rete consegnata direttamente",
    description: null,
    quantity: 2.5,
    status: "in_cantiere",
    supplier_id: null,
    purchase_price: null,
    notes: null,
    order: {
      id: "commessa",
      order_code: "SIM-01",
      expected_date: null,
      work_start_date: null,
      company_id: "azienda",
      current_status_id: null,
      customer: { first_name: "Cliente", last_name: "Demo" },
    },
  };
  render(
    <DndContext>
      <WarehouseKanbanView
        items={[item]}
        onStatusChange={vi.fn()}
        getSupplierName={() => null}
        readOnly
      />
    </DndContext>,
  );
  expect(
    within(
      screen.getByRole("region", { name: "Articoli In Cantiere" }),
    ).getByText(item.name),
  ).toBeInTheDocument();
  expect(
    within(
      screen.getByRole("region", { name: "Articoli In Magazzino" }),
    ).queryByText(item.name),
  ).not.toBeInTheDocument();
});
