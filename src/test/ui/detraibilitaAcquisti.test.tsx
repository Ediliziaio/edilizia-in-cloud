import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { FiscalDocument } from "@/lib/fatturazione/fiscalWorkspace";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
const s = vi.hoisted(() => ({ rpc: [] as { fn: string; args: Record<string, unknown> }[], admin: true }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: s.admin, solaLettura: false }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => { s.rpc.push({ fn, args }); return Promise.resolve({ data: { aggiornate: 2 }, error: null }); } },
}));
import { DetraibilitaAcquisti } from "@/components/fatturazione/DetraibilitaAcquisti";
import { fiscalRows } from "@/lib/fatturazione/fiscalWorkspace";

const doc = (id: string, nome: string, p: number | null = null): FiscalDocument => ({
  id, numero_fattura: `F-${id}`, cedente_ragione_sociale: nome, data_fattura: "2026-10-05", imponibile_totale: 100, iva_totale: 22, totale_documento: 122,
  riepilogo_iva: [{ aliquota: "22", imponibile: "100", imposta: "22" }], ricezione_origine: "sdi", detraibilita_percentuale: p,
});
const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
beforeEach(() => { s.rpc = []; s.admin = true; });
afterEach(cleanup);

describe("IVA detraibile sugli acquisti", () => {
  it("dice quante fatture sono ridotte", () => {
    wrap(<DetraibilitaAcquisti company="c" acquisti={[doc("a", "Telecom", 50), doc("b", "Edilmat")]} />);
    expect(screen.getByText(/1 fattura ridotta/)).toBeInTheDocument();
  });

  it("cerca il fornitore, seleziona i visibili e applica", async () => {
    wrap(<DetraibilitaAcquisti company="c" acquisti={[doc("a", "Telecom"), doc("b", "Telecom"), doc("c", "Edilmat")]} />);
    fireEvent.click(screen.getByRole("button", { name: "Imposta IVA non detraibile" }));
    fireEvent.change(screen.getByLabelText("Cerca fattura"), { target: { value: "telecom" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona tutte le fatture visibili" }));
    fireEvent.click(screen.getByRole("button", { name: "50% telefonia" }));
    fireEvent.click(screen.getByRole("button", { name: "Applica a 2 fatture" }));
    await waitFor(() => expect(s.rpc[0]).toEqual({ fn: "fiscalita_imposta_detraibilita", args: { p_company: "c", p_ids: ["a", "b"], p_percentuale: 50 } }));
  });

  it("percentuale fuori scala: non si applica", () => {
    wrap(<DetraibilitaAcquisti company="c" acquisti={[doc("a", "Telecom")]} />);
    fireEvent.click(screen.getByRole("button", { name: "Imposta IVA non detraibile" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Scegli F-a" }));
    fireEvent.change(screen.getByLabelText("Percentuale detraibile"), { target: { value: "150" } });
    expect(screen.getByRole("button", { name: "Applica a 1 fattura" })).toBeDisabled();
  });

  it("senza permesso si vede lo stato ma non l'azione", () => {
    s.admin = false;
    wrap(<DetraibilitaAcquisti company="c" acquisti={[doc("a", "Telecom")]} />);
    expect(screen.queryByRole("button", { name: "Imposta IVA non detraibile" })).toBeNull();
  });

  it("nel registro la riga dice la percentuale", () => {
    const [ridotta] = fiscalRows([], [doc("a", "Telecom", 40)]);
    const [piena] = fiscalRows([], [doc("b", "Edilmat")]);
    expect(ridotta.deductible).toBe(40);
    expect(piena.deductible).toBeUndefined();
  });
});
