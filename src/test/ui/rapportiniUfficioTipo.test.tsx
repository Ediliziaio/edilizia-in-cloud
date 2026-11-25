// «Scrivi rapportini»: lavori o trasporti si sceglie su ogni commessa, non solo su quelle chiamate TRASPORTI (25/11/2026).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ descrizione: "REALIZZAZIONE VILLA", costi: true }));
const db = vi.hoisted(() => {
  const from = (t: string) => {
    const risposta = () => Promise.resolve({ data: t === "orders" ? { description: m.descrizione } : ([] as unknown[]), error: null });
    const q: Record<string, unknown> = {};
    Object.assign(q, { select: () => q, eq: () => q, order: () => q, limit: risposta, maybeSingle: risposta, then: (ok: (v: unknown) => void) => risposta().then(ok) });
    return q;
  };
  return { from };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), from: db.from, storage: { from: () => ({}) } } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewCosts: m.costi }) }));
vi.mock("@/hooks/useCatalogoVociRapportino", () => ({ useCatalogoVociRapportino: () => ({
  isFetched: true, isError: false,
  data: { voci: [{ id: "t", nome: "TRASPORTI", unita: "cad", costo_unitario: 120, vendita_unitaria: 180 }], aMano: true },
}) }));
const nessuno = vi.hoisted((): never[] => []);
vi.mock("@/hooks/useMezzi", () => ({ useMezzi: () => ({ data: nessuno }), useMezziDellaCommessa: () => ({ data: nessuno }) }));
vi.mock("@/hooks/useOrderWorkPhases", () => ({ useOrderWorkPhases: () => ({ phases: nessuno, unassigned: nessuno, employees: nessuno }) }));
vi.mock("@/hooks/useSottofasi", () => ({ useSottofasi: () => ({ perFase: new Map() }) }));
vi.mock("@/hooks/useAccessiCommessa", () => ({ useAccessiCommessa: () => ({ data: nessuno }), nomeAccesso: () => "" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useModuliCantiere", async () => {
  const { SCHEMA_COME_OGGI } = await import("../../../supabase/functions/_shared/moduliCantiere");
  return { useModuloRapportino: () => ({ schema: SCHEMA_COME_OGGI, isLoading: false, isError: false }) };
});

import { RapportiniUfficio } from "@/components/orders/RapportiniUfficio";

afterEach(() => { cleanup(); m.descrizione = "REALIZZAZIONE VILLA"; m.costi = true; });

const apri = () => {
  render(<QueryClientProvider client={new QueryClient()}><RapportiniUfficio orderId="o1" /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Scrivi rapportini" }));
};

describe("Scrivi rapportini: lavori o trasporti", () => {
  it("su una commessa di cantiere si sceglie «trasporti»: il giorno parte col viaggio, e tornando a «lavori» il viaggio vuoto sparisce", async () => {
    apri();
    expect(screen.getByRole("radio", { name: /Rapportino lavori/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("button", { name: /Aggiungi viaggio/ })).not.toBeNull();
    expect(screen.queryByText("Carico")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Rapportino trasporti/ }));
    await waitFor(() => expect(screen.getByText("Carico")).toBeInTheDocument());
    expect(screen.getByRole("radio", { name: /Rapportino trasporti/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: /Rapportino lavori/ }));
    await waitFor(() => expect(screen.queryByText("Carico")).toBeNull());
  });

  it("sulla commessa «TRASPORTI» parte già su trasporti", async () => {
    m.descrizione = "TRASPORTI C/T";
    apri();
    await waitFor(() => expect(screen.getByRole("radio", { name: /Rapportino trasporti/ })).toHaveAttribute("aria-checked", "true"));
    await waitFor(() => expect(screen.getByText("Carico")).toBeInTheDocument());
  });

  it("senza Costi né Acquisti il rapportino trasporti non si sceglie e dice perché", () => {
    m.costi = false;
    apri();
    const trasporti = screen.getByRole("radio", { name: /Rapportino trasporti/ });
    expect(trasporti).toBeDisabled();
    expect(trasporti).toHaveTextContent("Serve il permesso Costi o Acquisti");
  });
});

describe("Pulsanti in testa all'elenco", () => {
  it("«Rapportino trasporti» apre la finestra già su trasporti, col viaggio", async () => {
    const { NuoviRapportiniUfficio } = await import("@/components/orders/RapportiniUfficio");
    render(<QueryClientProvider client={new QueryClient()}><NuoviRapportiniUfficio orderId="o1" /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: /Rapportino trasporti/ }));
    await waitFor(() => expect(screen.getByRole("radio", { name: /Rapportino trasporti/ })).toHaveAttribute("aria-checked", "true"));
    await waitFor(() => expect(screen.getByText("Carico")).toBeInTheDocument());
  });
  it("«Rapportino lavori» apre la finestra su lavori, senza viaggio", async () => {
    const { NuoviRapportiniUfficio } = await import("@/components/orders/RapportiniUfficio");
    render(<QueryClientProvider client={new QueryClient()}><NuoviRapportiniUfficio orderId="o1" /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: /Rapportino lavori/ }));
    expect(await screen.findByRole("radio", { name: /Rapportino lavori/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText("Carico")).toBeNull();
  });
  it("senza Costi né Acquisti il pulsante trasporti è spento", async () => {
    m.costi = false;
    const { NuoviRapportiniUfficio } = await import("@/components/orders/RapportiniUfficio");
    render(<QueryClientProvider client={new QueryClient()}><NuoviRapportiniUfficio orderId="o1" /></QueryClientProvider>);
    expect(screen.getByRole("button", { name: /Rapportino trasporti/ })).toBeDisabled();
  });
});
