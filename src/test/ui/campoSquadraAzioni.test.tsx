import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CampoSquadra from "@/pages/campo/CampoSquadra";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  chiCompila: "ognuno" as string,
  righe: [] as Array<Record<string, unknown>>,
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn(), useParams: () => ({ orderId: "order" }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "capo" } }) }));
vi.mock("@/hooks/useRegoleCampo", () => ({ useRegoleCampoOrdine: () => ({ data: { chiCompila: state.chiCompila } }) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === "campo-squadra-oggi" ? state.righe : { order_code: "C-1", description: "Via Roma" },
    isLoading: false, isError: false, error: null as null, refetch: vi.fn(), isFetching: false,
  }),
  useMutation: (config: { mutationFn: (a: string) => Promise<unknown>; onSuccess: (r: unknown, a: string) => void; onError: (e: unknown) => void }) => ({
    isPending: false, variables: undefined as unknown,
    mutate: async (a: string) => { try { config.onSuccess(await config.mutationFn(a), a); } catch (e) { config.onError(e); } },
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: async (fn: string, args: unknown) => { state.rpc(fn, args); return { data: { ok: true }, error: null as null }; } } }));

const riga = (o: Record<string, unknown>) => ({ user_id: "a", nome: "Ion Popescu", ruolo: "dipendente", is_capocantiere: false, entrata: null as string | null, uscita: null as string | null, in_cantiere: false, ore: 0, rapportino_inviato: false, telefono: "3331234567", ...o });

beforeEach(() => { vi.clearAllMocks(); state.chiCompila = "ognuno"; state.righe = [riga({})]; });
afterEach(cleanup);

describe("Squadra di oggi: il capo agisce", () => {
  it("chiama col telefono di lavoro", () => {
    render(<CampoSquadra />);
    expect(screen.getByRole("link", { name: "Chiama Ion Popescu" }).getAttribute("href")).toContain("3331234567");
  });
  it("senza numero non c'è il bottone", () => {
    state.righe = [riga({ telefono: null })];
    render(<CampoSquadra />);
    expect(screen.queryByRole("link", { name: /Chiama/ })).toBeNull();
  });
  it("sollecita una volta e poi segna che è fatto", async () => {
    render(<CampoSquadra />);
    fireEvent.click(screen.getByRole("button", { name: "Sollecita il rapportino a Ion Popescu" }));
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("campo_sollecita_rapportino", { p_order_id: "order", p_user_id: "a" }));
    expect(await screen.findByRole("button", { name: "Sollecito mandato a Ion Popescu" })).toBeDisabled();
  });
  it("non sollecita sé stesso, chi l'ha già mandato, chi è senza app", () => {
    state.righe = [
      riga({ user_id: "capo", nome: "Luca Capo" }),
      riga({ user_id: "b", nome: "Fatto Già", rapportino_inviato: true }),
      riga({ user_id: null as string | null, nome: "Senza App" }),
    ];
    render(<CampoSquadra />);
    expect(screen.queryByRole("button", { name: /Sollecita/ })).toBeNull();
  });
  it("dove il rapportino lo fa il capo non si sollecita nessuno", () => {
    state.chiCompila = "capo";
    render(<CampoSquadra />);
    expect(screen.queryByRole("button", { name: /Sollecita/ })).toBeNull();
  });
});
