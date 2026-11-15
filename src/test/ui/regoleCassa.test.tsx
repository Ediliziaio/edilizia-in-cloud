/**
 * Regole della Tesoreria che assegnano una voce del cash flow (15/11/2026).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { VoceCatalogo } from "@/lib/finance/cassaVoci";

const m = vi.hoisted(() => ({
  rpc: vi.fn(), insert: vi.fn(), regole: [] as Record<string, unknown>[],
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: m.toast }));
vi.mock("@/integrations/supabase/client", () => {
  const catena = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    c.select = (): Record<string, unknown> => c;
    c.eq = (): Record<string, unknown> => c;
    c.order = async (): Promise<{ data: unknown; error: null }> => ({ data: m.regole, error: null });
    c.insert = async (p: unknown): Promise<{ error: null }> => { m.insert(p); return { error: null }; };
    return c;
  };
  return { supabase: { from: catena, rpc: async (n: string, a: unknown): Promise<{ data: unknown; error: null }> => ({ data: await m.rpc(n, a), error: null }) } };
});
const voce = (p: Partial<VoceCatalogo> & { id: string; codice: string; nome: string }): VoceCatalogo => ({
  parent_id: null, livello: "voce", descrizione: null, esempio: null, flusso: "uscita", sezione: "operativa",
  voce_cassa_in: null, voce_cassa_out: "usc_generali", richiede_commessa: false, attiva: true, archiviata_il: null,
  ordine: 0, origine: "catalogo", ...p,
});
const catalogo = [
  voce({ id: "c08", codice: "08", nome: "Immobili e struttura", livello: "categoria" }),
  voce({ id: "v0805", codice: "08.05", nome: "Energia elettrica", parent_id: "c08" }),
];
vi.mock("@/lib/finance/cassaVoci", async (orig): Promise<Record<string, unknown>> => ({
  ...(await orig<typeof import("@/lib/finance/cassaVoci")>()),
  useCatalogoCassa: () => ({ data: catalogo, isError: false }),
}));
import CategorizationRules from "@/components/tesoreria/CategorizationRules";

beforeEach(() => {
  vi.clearAllMocks();
  m.regole = [];
  m.rpc.mockImplementation(async (nome: string, args: { p_anteprima?: boolean }) => {
    if (nome === "cassa_regole_applica")
      return { movimenti: 3, regole: [{ regola: "r1", testo: "enel", voce: "Energia elettrica", codice: "08.05", movimenti: 3, cents: -45000 }], ...(args.p_anteprima ? {} : { aggiornati: 3 }) };
    return 0;
  });
});
afterEach(cleanup);

describe("regole che assegnano una voce", () => {
  it("una regola nuova sceglie la voce del catalogo e il verso", async () => {
    render(<CategorizationRules companyId="az" />);
    fireEvent.click(await screen.findByRole("button", { name: /Nuova Regola/ }));
    fireEvent.change(screen.getByPlaceholderText(/ENEL ENERGIA/), { target: { value: "ENEL" } });
    fireEvent.click(screen.getByRole("button", { name: /Voce del cash flow: da scegliere/ }));
    fireEvent.click(screen.getByRole("option", { name: /Energia elettrica/ }));
    fireEvent.click(screen.getByRole("button", { name: "Crea" }));
    await waitFor(() =>
      expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ match_value: "ENEL", cassa_voce_id: "v0805", verso: "uscita", category: "Energia elettrica" })),
    );
  });

  it("«Applica ora» mostra prima l'anteprima, poi applica", async () => {
    m.regole = [{ id: "r1", match_value: "enel", match_field: "any", match_type: "contains", category: "Energia elettrica", cassa_voce_id: "v0805", verso: "uscita", priority: 10, auto_apply: true }];
    render(<CategorizationRules companyId="az" />);
    expect(await screen.findByText("Energia elettrica")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Applica ora/ }));
    expect(await screen.findByText(/3 movimenti ancora senza categoria/)).toBeInTheDocument();
    expect(m.rpc).toHaveBeenCalledWith("cassa_regole_applica", { p_company: "az", p_anteprima: true });
    expect(m.rpc).not.toHaveBeenCalledWith("cassa_regole_applica", expect.objectContaining({ p_anteprima: false }));
    fireEvent.click(screen.getByRole("button", { name: "Applica a 3" }));
    await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("cassa_regole_applica", { p_company: "az", p_anteprima: false }));
    await waitFor(() => expect(m.toast.success).toHaveBeenCalledWith("3 movimenti classificati con le regole"));
  });
});
