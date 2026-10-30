import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MagazzinoVisteSwitch } from "@/components/warehouse/MagazzinoVisteSwitch";
import { gruppiVisibili } from "@/lib/magazzino/vistaMagazzino";

describe("Scelta della vista del magazzino", () => {
  it("quattro gruppi, e sotto le viste del gruppo scelto", () => {
    const onVista = vi.fn();
    render(<MagazzinoVisteSwitch gruppi={gruppiVisibili(false)} gruppoAttivo="giacenze" vista="stock" onGruppo={vi.fn()} onVista={onVista} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Da preparare", "Giacenze", "Arrivi e uscite", "Movimenti"]);
    expect(screen.getByRole("button", { name: "Inventario" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Valore" }));
    expect(onVista).toHaveBeenCalledWith("valuation");
  });

  it("un gruppo con una vista sola non mostra la seconda riga", () => {
    render(<MagazzinoVisteSwitch gruppi={gruppiVisibili(false)} gruppoAttivo="movimenti" vista="movements" onGruppo={vi.fn()} onVista={vi.fn()} />);
    expect(screen.queryByRole("group", { name: "Vista" })).toBeNull();
  });
});
