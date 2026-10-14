import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CantiereViewNav } from "@/components/orders/CantiereViewNav";
import { resolveCantiereView } from "@/lib/orders/detailNavigation";

/** Desktop Gantt and mobile phase agenda share the same route. */

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

  it("da telefono è disponibile e mantiene la selezione nel menu delle viste", () => {
    schermo.telefono = true;
    const cambia = vi.fn();
    render(<CantiereViewNav value="cronoprogramma" onChange={cambia} />);
    const voci = Array.from(screen.getByRole("combobox").querySelectorAll("option")).map((o) => o.textContent);
    expect(voci).toContain("Lavorazioni");
    expect(voci).toContain("Cronoprogramma");
    expect(screen.getByRole("combobox")).toHaveValue("cronoprogramma");
    fireEvent.change(screen.getByRole("combobox"), {target: {value: "diario"}});
    expect(cambia).toHaveBeenCalledWith("diario");
  });

  it("i collegamenti diretti la aprono", () => {
    expect(resolveCantiereView("?vista_cantiere=cronoprogramma")).toBe("cronoprogramma");
    expect(resolveCantiereView("", "section-cronoprogramma")).toBe("cronoprogramma");
  });
});
