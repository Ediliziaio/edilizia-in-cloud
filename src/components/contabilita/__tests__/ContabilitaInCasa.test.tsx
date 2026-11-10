import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const stato = { attiva: false, righeAggiornate: 1, aggiornamenti: [] as unknown[] };

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "az-1" } }) }));
const permessi = { isAdmin: true, canEditSettingsProfile: false };
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => permessi }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/contabilita/ContabilitaGenerale", () => ({ default: () => <div>SCHERMATA PARTITA DOPPIA</div> }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { contabilita_generale_attiva: stato.attiva }, error: null as null }) }) }),
      update: (v: unknown) => {
        stato.aggiornamenti.push(v);
        return { eq: () => ({ select: async () => ({ data: Array.from({ length: stato.righeAggiornate }, () => ({ id: "az-1" })), error: null as null }) }) };
      },
    }),
  },
}));

import ContabilitaGeneralePagina from "@/pages/azienda/ContabilitaGeneralePagina";

function monta() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><ContabilitaGeneralePagina /></QueryClientProvider>);
}

describe("Contabilità generale nel menu Contabilità", () => {
  beforeEach(() => { stato.attiva = false; stato.righeAggiornate = 1; stato.aggiornamenti = []; permessi.isAdmin = true; });

  it("spenta: spiega cos'è e non mostra il piano vuoto", async () => {
    monta();
    expect(await screen.findByText(/La partita doppia è spenta/)).toBeTruthy();
    expect(screen.queryByText("SCHERMATA PARTITA DOPPIA")).toBeNull();
  });

  it("accesa: mostra la schermata della partita doppia", async () => {
    stato.attiva = true;
    monta();
    expect(await screen.findByText("SCHERMATA PARTITA DOPPIA")).toBeTruthy();
  });

  it("chi può la accende, e la pagina passa alla schermata", async () => {
    monta();
    const interruttore = await screen.findByRole("switch");
    await waitFor(() => expect((interruttore as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(interruttore);
    expect(await screen.findByText("SCHERMATA PARTITA DOPPIA")).toBeTruthy();
    expect(stato.aggiornamenti).toEqual([{ contabilita_generale_attiva: true }]);
  });

  it("se il database non tocca la riga, non finge di averla accesa", async () => {
    stato.righeAggiornate = 0;
    monta();
    const interruttore = await screen.findByRole("switch");
    await waitFor(() => expect((interruttore as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(interruttore);
    await waitFor(() => expect(stato.aggiornamenti.length).toBe(1));
    expect(screen.queryByText("SCHERMATA PARTITA DOPPIA")).toBeNull();
    expect(screen.getByText(/La partita doppia è spenta/)).toBeTruthy();
  });

  it("senza permesso l'interruttore è fermo", async () => {
    permessi.isAdmin = false;
    monta();
    const interruttore = await screen.findByRole("switch");
    expect((interruttore as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/La cambia chi può modificare/)).toBeTruthy();
  });
});
