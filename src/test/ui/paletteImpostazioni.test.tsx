/**
 * La palette ⌘K dell'app cerca le impostazioni con lo stesso indice e lo stesso motore del ⌘K delle impostazioni:
 * le voci sono quelle del menu e dell'indice, filtrate per permesso e per piano, con i nomi che il menu usa.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommandPalette } from "@/components/CommandPalette";

const state = vi.hoisted(() => ({
  navigate: vi.fn(),
  permessi: { isAdmin: true, isLoading: false } as Record<string, unknown>,
}));
vi.mock("react-router-dom", async (importOriginal) => ({ ...(await importOriginal<typeof import("react-router-dom")>()), useNavigate: () => state.navigate }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [] as unknown[], error: null as unknown }) }) }) }),
    functions: { invoke: async () => ({ data: null as unknown, error: null as unknown }) },
  },
}));
vi.mock("@/hooks/useGlobalSearch", () => ({ useGlobalSearch: () => ({ data: [] as unknown[], isFetching: false }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.permessi }));
vi.mock("@/hooks/useStatoPiano", () => ({ useStatoPiano: () => ({ stato: { tuttoVisibile: true } }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/contexts/BillingModeContext", () => ({ useBillingMode: () => ({ isNative: false }) }));

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  state.navigate.mockClear();
  state.permessi = { isAdmin: true, isLoading: false };
});

async function cerca(testo: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><CommandPalette open onOpenChange={() => {}} /></MemoryRouter>
    </QueryClientProvider>,
  );
  const campo = await screen.findByPlaceholderText(/Cerca ordini, clienti/);
  fireEvent.change(campo, { target: { value: testo } });
}
/** Le voci del gruppo «Impostazioni» della palette. */
const impostazioni = () => {
  const gruppo = screen.queryByText("Impostazioni", { selector: "[cmdk-group-heading]" })?.closest("[cmdk-group]");
  return gruppo ? Array.from(gruppo.querySelectorAll("[cmdk-item]")).map((i) => i.textContent ?? "") : [];
};

describe("palette ⌘K: le impostazioni", () => {
  it("trova per parola, non per il solo nome: «prezzo a mano»", async () => {
    await cerca("prezzo a mano");
    await waitFor(() => expect(impostazioni()[0]).toContain("Prezzo scritto a mano"));
  });

  it("conosce anche Notifiche, Rapportini, Fasi e avanzamento, Sopralluoghi, QR & Codici", async () => {
    for (const [domanda, titolo] of [
      ["notifiche", "Notifiche"],
      ["rapportino", "Rapportini e presenze"],
      ["fasi", "Fasi e avanzamento"],
      ["sopralluogo", "Sopralluoghi"],
      ["codice a barre", "QR & Codici"],
    ] as const) {
      cleanup();
      await cerca(domanda);
      await waitFor(() => expect(impostazioni().some((v) => v.includes(titolo)), `«${domanda}»`).toBe(true));
    }
  });

  it("usa i nomi del menu: «Stati commessa» e «Pipeline di vendita», non «Stati ordine» e «Sequenze»", async () => {
    await cerca("stati");
    await waitFor(() => expect(impostazioni().some((v) => v.includes("Stati commessa"))).toBe(true));
    expect(impostazioni().some((v) => v.includes("Stati ordine"))).toBe(false);
    cleanup();
    await cerca("pipeline");
    await waitFor(() => expect(impostazioni().some((v) => v.includes("Pipeline di vendita"))).toBe(true));
  });

  it("chi non ha il permesso non trova la pagina", async () => {
    state.permessi = { isAdmin: false, isLoading: false, canViewSettingsPricing: true };
    await cerca("prezzo manuale");
    await waitFor(() => expect(screen.queryByText("Nessun risultato per \"prezzo manuale\"")).not.toBeNull());
    expect(impostazioni()).toEqual([]);
  });

  it("senza il permesso di fatturazione non si trova «Fatturazione», né «Crediti e ricariche»", async () => {
    state.permessi = { isAdmin: false, isLoading: false, canViewSettingsPricing: true };
    await cerca("fatturazione");
    expect(impostazioni().some((v) => v.includes("Fatturazione"))).toBe(false);
    cleanup();
    await cerca("crediti");
    expect(impostazioni().some((v) => v.includes("Crediti"))).toBe(false);
  });

  it("in mezzo a clienti e commesse ne escono al massimo otto", async () => {
    await cerca("pr"); // «prezzo», «profilo», «privacy», «prodotti»…: molte più di otto
    await waitFor(() => expect(impostazioni().length).toBeGreaterThan(0));
    expect(impostazioni()).toHaveLength(8);
  });

  it("ogni voce ha il suo gruppo del menu accanto, e un indirizzo solo", async () => {
    await cerca("commercialista");
    await waitFor(() => expect(impostazioni().length).toBeGreaterThan(1));
    const righe = impostazioni();
    expect(righe[0]).toContain("Persone & Accessi");
    expect(new Set(righe).size).toBe(righe.length);
  });

  it("scegliere una voce apre la sezione, con l'àncora", async () => {
    await cerca("posa automatica");
    fireEvent.click(await screen.findByText("Posa, trasporto e smaltimento"));
    await waitFor(() => expect(state.navigate).toHaveBeenCalledWith("/azienda/impostazioni/margini#posa-e-trasporto"));
  });
});
