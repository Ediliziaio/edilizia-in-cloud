/**
 * Cambiato il conto di costo, si vede che è cambiato (12/11/2026).
 *
 * Una collaboratrice ha cambiato tre volte il conto di una fattura: tutte e tre salvate, ma il
 * menu mostrava ancora il conto di prima e compariva «Contabilità generale non aggiornata» (la
 * sua azienda la contabilità generale non la usa). Chiedeva: «ma ho modificato il conto?».
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ update: vi.fn(), ok: vi.fn(), avviso: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: m.ok, warning: m.avviso, error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => {
  const catena: Record<string, unknown> = {};
  catena.select = () => catena; catena.eq = () => catena;
  catena.order = async () => ({ data: [{ name: "materiali" }, { name: "consulenze_professionali" }], error: null as unknown });
  catena.update = (v: unknown) => { m.update(v); return { eq: () => ({ eq: async () => ({ error: null as unknown }) }) }; };
  return { supabase: { from: () => catena, rpc: async () => ({ data: null as unknown, error: { message: "Accesso negato" } }) } };
});

import { ContoDiCosto } from "@/components/fatturazione/ContoDiCosto";

class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver ??= RO;
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
afterEach(cleanup);

describe("Conto di costo", () => {
  it("dopo il cambio mostra il conto nuovo e dice che è salvato", async () => {
    render(<QueryClientProvider client={new QueryClient()}><ContoDiCosto companyId="c1" fatturaId="f1" costoId={null} attuale="materiali" onCambiato={vi.fn()} /></QueryClientProvider>);
    const menu = screen.getByRole("combobox", { name: "Conto di costo" });
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "consulenze_professionali" }));
    await waitFor(() => expect(m.update).toHaveBeenCalledWith({ categoria_ai: "consulenze_professionali" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Conto di costo" })).toHaveTextContent("consulenze_professionali"));
    expect(m.ok.mock.calls[0][0]).toMatch(/«consulenze_professionali»/);
    expect(m.avviso.mock.calls[0][0]).toBe("Conto salvato · contabilità generale da aggiornare");
    expect(m.avviso.mock.calls[0][1].description).toMatch(/^Il conto è salvato sulla fattura/);
  });
});
