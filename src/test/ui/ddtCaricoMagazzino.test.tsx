// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const finto = vi.hoisted(() => ({
  rpc: vi.fn(async (): Promise<{ data: unknown; error: null }> => ({ data: { caricate: 1, restano: 1 }, error: null })),
  righe: [] as unknown[],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: finto.rpc,
    from: (t: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit"]) q[m] = (): unknown => q;
      q.then = (ok: (v: unknown) => unknown): unknown => ok({
        data: t === "ddt_righe" ? finto.righe : [{ id: "a1", name: "Cemento 32.5", internal_code: "CEM", barcode: null }],
        error: null,
      });
      return q;
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DDTCaricoMagazzinoCard } from "@/components/ddt/DDTCaricoMagazzinoCard";

const riga = (patch: Record<string, unknown>) => ({ id: "r1", codice_articolo: "CEM", descrizione: "Cemento 32.5", unita_misura: "pz", quantita: 10, movimento_id: null as string | null, ...patch });
const monta = (puoCaricare = true) => render(
  <QueryClientProvider client={new QueryClient()}><DDTCaricoMagazzinoCard ddtId="d" companyId="c" warehouseId="w" puoCaricare={puoCaricare} /></QueryClientProvider>,
);
afterEach(() => { cleanup(); finto.rpc.mockClear(); });

describe("carico della bolla in magazzino", () => {
  it("propone l'articolo, e parte solo la riga scelta", async () => {
    finto.righe = [riga({}), riga({ id: "r2", codice_articolo: null, descrizione: "Mattoni" })];
    monta();
    const bottone = await screen.findByRole("button", { name: "Carica 1 riga" });
    fireEvent.click(bottone);
    await waitFor(() => expect(finto.rpc).toHaveBeenCalled());
    expect(finto.rpc).toHaveBeenCalledWith("bolla_carica_magazzino", { p_ddt: "d", p_scelte: [{ riga_id: "r1", stock_item_id: "a1" }] });
  });

  it("una quantità decimale non si può caricare e lo dice", async () => {
    finto.righe = [riga({ quantita: 12.5 })];
    monta();
    expect(await screen.findByText(/pezzi interi/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Carica 0/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("una riga in kg avvisa che entra come pezzi", async () => {
    finto.righe = [riga({ unita_misura: "kg", quantita: 4 })];
    monta();
    expect(await screen.findByText(/entrerà come 4 pezzi/)).toBeTruthy();
  });

  it("tutto caricato: lo dice, senza pulsanti", async () => {
    finto.righe = [riga({ movimento_id: "m" })];
    monta();
    expect(await screen.findByText(/Tutte le righe sono in giacenza/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("in sola lettura non si carica", async () => {
    finto.righe = [riga({})];
    monta(false);
    await screen.findByText("Cemento 32.5");
    expect(screen.queryByRole("button", { name: /Carica/ })).toBeNull();
  });
});
