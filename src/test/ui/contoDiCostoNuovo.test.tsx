/**
 * Un conto di costo che non c'è si scrive dalla fattura (16/11/2026).
 *
 * «Si possono aggiungere voci ai conti di costo, per esempio leasing?»: prima no, bisognava
 * andare in Impostazioni → Categorie costi, e chi stava controllando la fattura non lo sapeva.
 * Adesso il menu ha «+ Nuovo conto di costo…»; e il primo conto proprio si salva insieme a
 * quelli di base, se no il menu restava con quella sola voce.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ insert: vi.fn(), update: vi.fn(), proprie: [] as Array<{ name: string }> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => {
  const catena: Record<string, unknown> = {};
  catena.select = () => catena;
  catena.eq = () => catena;
  catena.order = async () => ({ data: m.proprie, error: null as unknown });
  catena.insert = async (v: unknown) => { m.insert(v); return { error: null as unknown }; };
  catena.update = (v: unknown) => { m.update(v); return { eq: () => ({ eq: async () => ({ error: null as unknown }) }) }; };
  return { supabase: { from: () => catena, rpc: async () => ({ data: { stornate: 0 }, error: null as unknown }) } };
});

import { CATEGORIE_DI_BASE } from "@/lib/fatturazione/contoPerRiga";
import { ContoDiCosto } from "@/components/fatturazione/ContoDiCosto";

class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver ??= RO;
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
beforeEach(() => { m.insert.mockClear(); m.update.mockClear(); });
afterEach(cleanup);

const apri = () => {
  render(<QueryClientProvider client={new QueryClient()}><ContoDiCosto companyId="c1" fatturaId="f1" costoId={null} attuale="materiali" onCambiato={vi.fn()} /></QueryClientProvider>);
  const menu = screen.getByRole("combobox", { name: "Conto di costo" });
  fireEvent.keyDown(menu, { key: "ArrowDown" });
};

describe("Un conto di costo nuovo dalla fattura", () => {
  it("l'azienda senza conti suoi: il conto nuovo si salva insieme a quelli di base", async () => {
    m.proprie = [];
    apri();
    fireEvent.click(await screen.findByRole("option", { name: "+ Nuovo conto di costo…" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nome del conto di costo nuovo" }), { target: { value: "Leasing auto" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await waitFor(() => expect(m.insert).toHaveBeenCalled());
    const righe = m.insert.mock.calls[0][0] as Array<{ company_id: string; name: string }>;
    expect(righe).toHaveLength(CATEGORIE_DI_BASE.length + 1);
    expect(righe.every((r) => r.company_id === "c1")).toBe(true);
    expect(righe.map((r) => r.name)).toContain("materiali");
    expect(righe[righe.length - 1].name).toBe("Leasing auto");
    // Appena creato, il conto si mette sulla fattura: nessun secondo passaggio.
    await waitFor(() => expect(m.update).toHaveBeenCalledWith({ categoria_ai: "Leasing auto", conto_costo_origine: "manuale" }));
  });

  it("un conto che c'è già non si duplica: si usa quello", async () => {
    m.proprie = [];
    apri();
    fireEvent.click(await screen.findByRole("option", { name: "+ Nuovo conto di costo…" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nome del conto di costo nuovo" }), { target: { value: " Leasing " } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await waitFor(() => expect(m.update).toHaveBeenCalledWith({ categoria_ai: "leasing", conto_costo_origine: "manuale" }));
    const righe = m.insert.mock.calls[0][0] as Array<{ name: string }>;
    expect(righe.map((r) => r.name)).toEqual(CATEGORIE_DI_BASE);
  });

  it("l'azienda che ha già i suoi conti ne aggiunge uno solo", async () => {
    m.proprie = [{ name: "Materiali" }, { name: "Trasporti" }];
    apri();
    fireEvent.click(await screen.findByRole("option", { name: "+ Nuovo conto di costo…" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nome del conto di costo nuovo" }), { target: { value: "Leasing" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await waitFor(() => expect(m.insert).toHaveBeenCalledWith([{ company_id: "c1", name: "Leasing" }]));
  });
});
