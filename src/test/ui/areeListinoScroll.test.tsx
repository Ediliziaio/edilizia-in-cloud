import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CappelloAree } from "@/components/listino/ListinoNavigatore";
import type { AreaListino } from "@/lib/listino/lineeListino";

const aree: AreaListino[] = Array.from({ length: 12 }, (_, index): AreaListino => ({
  chiave: `area-${index}`, nome: `Area ${index}`, articoli: index + 1,
  standard: null as null, tipologie: [], mancanti: [],
}));

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Navigazione di tutte le aree del listino", () => {
  it("espone tutte le aree nel selettore, anche quelle fuori dalla barra", () => {
    const onScegli = vi.fn();
    render(<CappelloAree aree={aree} attiva={aree[0]} cercando={false} onScegli={onScegli} />);
    expect(screen.getAllByRole("option")).toHaveLength(12);
    fireEvent.change(screen.getByRole("combobox", { name: "Scegli area del listino" }), { target: { value: "area-11" } });
    expect(onScegli).toHaveBeenCalledWith("area-11");
  });

  it("scorre con le frecce e le disabilita ai bordi", () => {
    render(<CappelloAree aree={aree} attiva={aree[0]} cercando={false} onScegli={vi.fn()} />);
    const barra = screen.getByRole("tablist", { name: "Aree del listino" });
    Object.defineProperties(barra, { clientWidth: { value: 400 }, scrollWidth: { value: 2400 } });
    barra.scrollBy = vi.fn();
    fireEvent.scroll(barra);
    expect(screen.getByRole("button", { name: "Scorri aree a sinistra" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Scorri aree a destra" }));
    expect(barra.scrollBy).toHaveBeenCalledWith({ left: 300, behavior: "smooth" });
    barra.scrollLeft = 2000;
    fireEvent.scroll(barra);
    expect(screen.getByRole("button", { name: "Scorri aree a destra" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Scorri aree a sinistra" }));
    expect(barra.scrollBy).toHaveBeenCalledWith({ left: -300, behavior: "smooth" });
  });

  it("permette di raggiungere l'ultima area anche da tastiera", () => {
    const onScegli = vi.fn();
    render(<CappelloAree aree={aree} attiva={aree[0]} cercando={false} onScegli={onScegli} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    expect(tabs[11]).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(tabs[0], { key: "End" });
    expect(onScegli).toHaveBeenCalledWith("area-11");
    expect(tabs[11]).toHaveFocus();
  });

  it("mantiene separata l'azione per aggiungere un'area", () => {
    const onNuovaArea = vi.fn();
    render(<CappelloAree aree={aree} attiva={aree[0]} cercando={false} onScegli={vi.fn()} onNuovaArea={onNuovaArea} />);
    fireEvent.click(screen.getByRole("button", { name: "Area" }));
    expect(onNuovaArea).toHaveBeenCalledOnce();
  });
});
