import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { ContactsTable } from "@/components/marketing/ContactsTable";

afterEach(() => vi.unstubAllGlobals());

it("mostra la barra dei contatti e la aggiorna quando cambiano larghezza e posizione", () => {
  let misura = () => {};
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { misura = callback; }
    observe() {}
    disconnect() {}
  });

  render(
    <MemoryRouter>
      <ContactsTable
        contacts={[]} totalCount={0} selectedIds={new Set()} onToggleSelect={() => {}} onToggleAll={() => {}}
        onEdit={() => {}} onDelete={() => {}} page={1} pageSize={25} onPageChange={() => {}}
        onPageSizeChange={() => {}} sortField="created_at" sortDirection="desc" onSort={() => {}}
        visibleColumns={new Set(["name", "email"])}
      />
    </MemoryRouter>,
  );

  const contenitore = screen.getByRole("table").parentElement!;
  const barra = screen.getByRole("scrollbar", { name: "Scorri le colonne" });
  expect(barra).toHaveAttribute("aria-disabled", "true");
  expect(barra).toHaveStyle({ width: "100%" });

  Object.defineProperty(contenitore, "clientWidth", { configurable: true, value: 400 });
  Object.defineProperty(contenitore, "scrollWidth", { configurable: true, value: 1000 });
  act(() => misura());
  expect(barra).toHaveAttribute("aria-disabled", "false");
  expect(barra).toHaveStyle({ width: "40%" });

  contenitore.scrollLeft = 300;
  fireEvent.scroll(contenitore);
  expect(barra).toHaveStyle({ left: "30%" });
  expect(barra).toHaveAttribute("aria-valuenow", "50");
  const scorri = vi.fn();
  contenitore.scrollTo = scorri;
  fireEvent.keyDown(barra, { key: "End" });
  expect(scorri).toHaveBeenCalledWith({ left: 600 });

  Object.defineProperty(contenitore, "scrollWidth", { configurable: true, value: 400 });
  contenitore.scrollLeft = 0;
  act(() => misura());
  expect(barra).toHaveAttribute("aria-disabled", "true");
  expect(barra).toHaveStyle({ width: "100%", left: "0%" });
});
