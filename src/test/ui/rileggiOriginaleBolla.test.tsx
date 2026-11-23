import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ invoke: vi.fn(), aggiungi: vi.fn(), update: vi.fn(), sola: false }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ solaLettura: m.sola }) }));
vi.mock("@/hooks/useDDTRicezione", () => ({
  useDDTRighe: () => ({ data: [{ codice_articolo: "rck35s4-s", descrizione: "cls c 28-35 s4 xc1xc2", posizione: 1 }], isLoading: false }),
  useDDTRigheMutations: () => ({ aggiungiRighe: { mutateAsync: m.aggiungi } }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  functions: { invoke: m.invoke },
  from: () => ({ update: (v: unknown) => { m.update(v); const q = { eq: () => q, select: async () => ({ data: [{ id: "d" }], error: null as unknown }) }; return q; } }),
} }));
import { RileggiOriginaleBolla } from "@/components/ddt/RileggiOriginaleBolla";

const ddt = { id: "d", company_id: "a", ddt_file_name: "bolla.pdf", ddt_file_mime: "application/pdf", targa_mezzo: null as string | null, autista_nome: null as string | null, corriere: null as string | null, trasporto_a_cura_di: null as string | null, porto: null as string | null };
const mostra = (url: string | null = "blob:bolla") => render(<QueryClientProvider client={new QueryClient()}><RileggiOriginaleBolla ddt={ddt} fileUrl={url} /></QueryClientProvider>);
beforeEach(() => {
  m.invoke.mockReset(); m.aggiungi.mockReset().mockResolvedValue(undefined); m.update.mockReset(); m.sola = false;
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["%PDF"], { type: "application/pdf" }) }) as never;
});
afterEach(cleanup);

describe("Rileggi l'originale (23/11/2026)", () => {
  it("propone la riga mancante e l'autista, e aggiunge solo quelli", async () => {
    m.invoke.mockResolvedValue({ data: { success: true, ddt: {
      vettore: { tipo: "mittente", autista: "Mario Bianchi" },
      righe_merce: [
        { codice_articolo: "RCK35S4-S", descrizione: "Cls C 28-35 S4 XC1XC2", quantita: 4, unita_misura: "m3" },
        { codice_articolo: "214", descrizione: "214 INTEGRAZIONE VIAGGIO", quantita: 1, unita_misura: "Nr" },
      ] } }, error: null });
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Rileggi l'originale" }));
    expect(await screen.findByText(/214 INTEGRAZIONE VIAGGIO · 1 nr/)).toBeInTheDocument();
    expect(screen.queryByText(/Cls C 28-35/)).toBeNull();
    expect(screen.getByText("Autista: Mario Bianchi")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi alla bolla" }));
    await waitFor(() => expect(m.aggiungi).toHaveBeenCalledWith([expect.objectContaining({ descrizione: "214 INTEGRAZIONE VIAGGIO", posizione: 2 })]));
    await waitFor(() => expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ autista_nome: "Mario Bianchi" })));
  });
  it("niente originale o sola lettura: niente pulsante", () => {
    const { container } = mostra(null);
    expect(container).toBeEmptyDOMElement();
    cleanup();
    m.sola = true;
    expect(mostra().container).toBeEmptyDOMElement();
  });
});
