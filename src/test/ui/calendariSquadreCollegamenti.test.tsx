import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidaSquadreCollegate } from "@/lib/manodopera/cacheSquadre";
import {
  percorsoSquadra,
  SQUADRE_OPERAI,
  CALENDARI_SQUADRE,
} from "@/lib/manodopera/collegamentiSquadre";
import { useSalvaSquadra } from "@/hooks/useCalendariLavori";
import { ExternalTeamDialog } from "@/components/employees/ExternalTeamDialog";
import type { ReactNode } from "react";

const api = vi.hoisted(() => ({
  update: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
  select: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "azienda-1" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => api },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.clearAllMocks();
  api.update.mockReturnValue(api);
  api.eq.mockReturnValue(api);
  api.select.mockReturnValue(api);
  api.single.mockResolvedValue({
    data: { id: "squadra-1" },
    error: null as null,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Le squadre sono condivise tra le pagine", () => {
  it("aggiorna tutte le letture collegate dopo un salvataggio senza invalidare le altre risorse", async () => {
    const qc = new QueryClient();
    const keys = [
      ["manodopera", "squadre", "azienda-1"],
      ["manodopera", "commessa", "ordine-1"],
      ["calendari-lavori", "squadre", "azienda-1"],
      ["calendari-lavori", "squadre-google", "azienda-1"],
      ["external-teams", "azienda-1"],
      ["gcal-busy-slots", "azienda-1"],
    ];
    keys.forEach((k) => qc.setQueryData(k, []));
    qc.setQueryData(["mezzi", "azienda-1"], []);
    await invalidaSquadreCollegate(qc);
    keys.forEach((k) => expect(qc.getQueryState(k)?.isInvalidated).toBe(true));
    expect(qc.getQueryState(["mezzi", "azienda-1"])?.isInvalidated).toBe(false);
  });
  it("il salvataggio da Calendari preserva il responsabile HR delle interne e resta nell'azienda", async () => {
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSalvaSquadra(), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        id: "squadra-1",
        name: "Nord",
        kind: "interna",
        is_active: true,
        vat_rate: 22,
        leader_user_id: "vecchio-responsabile",
      }),
    );
    expect(api.update.mock.calls[0][0]).not.toHaveProperty("leader_user_id");
    expect(api.eq).toHaveBeenCalledWith("id", "squadra-1");
    expect(api.eq).toHaveBeenCalledWith("company_id", "azienda-1");
  });
  it("la finestra nelle impostazioni blocca il tipo e rimanda il responsabile alla gestione operai", () => {
    render(
      <ExternalTeamDialog
        open
        onOpenChange={vi.fn()}
        team={{
          id: "squadra-1",
          name: "Nord",
          kind: "interna",
          contact_name: null,
          phone: null,
          email: null,
          notes: null,
          is_active: true,
          vat_rate: 22,
        }}
        onSave={vi.fn()}
        isSaving={false}
        utenti={[{ id: "p1", nome: "Caposquadra" }]}
        tipoBloccato
      />,
    );
    expect(screen.getByRole("combobox", { name: "Tipo" })).toBeDisabled();
    expect(screen.queryByText("Capocantiere")).toBeNull();
    expect(
      screen.getByText(/Componenti e responsabile si gestiscono/),
    ).toBeInTheDocument();
  });
  it("i percorsi mantengono vista, tab e identità della squadra", () => {
    const id = "squadra con & simboli";
    const href = percorsoSquadra(SQUADRE_OPERAI, id);
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("squadra")).toBe(id);
    expect(params.get("vista")).toBe("squadre");
    expect(params.get("tab")).toBe("operai");
    expect(percorsoSquadra(CALENDARI_SQUADRE, "s1")).toBe(
      `${CALENDARI_SQUADRE}&squadra=s1`,
    );
  });
});
