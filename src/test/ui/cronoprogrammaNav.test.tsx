import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CantiereViewNav } from "@/components/orders/CantiereViewNav";
import { resolveCantiereView } from "@/lib/orders/detailNavigation";

/** La vista «Cronoprogramma» del cantiere (06/10/2026): da computer sì, da telefono no. */

const schermo = vi.hoisted(() => ({ telefono: false }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => schermo.telefono }));

afterEach(() => {
  cleanup();
  schermo.telefono = false;
});

describe("vista Cronoprogramma", () => {
  it("da computer è una scheda del cantiere, dopo Lavorazioni", () => {
    const cambia = vi.fn();
    render(<CantiereViewNav value="lavorazioni" onChange={cambia} />);
    const schede = screen.getAllByRole("button").map((b) => b.textContent);
    expect(schede.slice(0, 2)).toEqual(["Lavorazioni", "Cronoprogramma"]);
    fireEvent.click(screen.getByRole("button", { name: "Cronoprogramma" }));
    expect(cambia).toHaveBeenCalledWith("cronoprogramma");
  });

  it("da telefono non c'è nel menu delle viste", () => {
    schermo.telefono = true;
    render(<CantiereViewNav value="lavorazioni" onChange={vi.fn()} />);
    const voci = Array.from(screen.getByRole("combobox").querySelectorAll("option")).map((o) => o.textContent);
    expect(voci).toContain("Lavorazioni");
    expect(voci).not.toContain("Cronoprogramma");
  });

  it("i collegamenti diretti la aprono", () => {
    expect(resolveCantiereView("?vista_cantiere=cronoprogramma")).toBe("cronoprogramma");
    expect(resolveCantiereView("", "section-cronoprogramma")).toBe("cronoprogramma");
  });
});
