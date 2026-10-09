import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CampoRapportinoVoce from "@/pages/campo/CampoRapportinoVoce";
import type { CampoResolvedAssignment } from "@/lib/campo/assignments";

/**
 * Il rapportino vocale aperto da menu o Home non ha un cantiere. Con più cantieri aperti il server non può
 * indovinarlo: la nota restava orfana (solo nel registro vocale) e l'app diceva «salvato». Ora si sceglie prima.
 */
const state = vi.hoisted(() => ({
  orderId: undefined as string | undefined,
  assignments: [] as unknown[], loading: false,
  process: vi.fn(), confirm: vi.fn(), info: vi.fn(), success: vi.fn(),
}));
vi.mock("react-router-dom", () => ({ useParams: () => ({ orderId: state.orderId }), useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams()] }));
vi.mock("@/hooks/campo/useCampoAssignments", () => ({ useCampoAssignments: () => ({ data: state.assignments, isLoading: state.loading }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: null as null, isLoading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/lib/campo/network-status", () => ({ isOnline: () => true }));
vi.mock("sonner", () => ({ toast: { success: state.success, info: state.info, error: vi.fn() } }));
vi.mock("@/hooks/campo/useRapportinoVocale", () => ({
  useRapportinoVocale: () => ({ uploading: false, transcribing: false, draft: null as null, error: null as null, processAudio: state.process, confirmRapportino: state.confirm, resetDraft: vi.fn() }),
}));
vi.mock("@/components/campo/CampoAudioRecorder", () => ({
  default: ({ onConfirm }: { onConfirm: (b: Blob, d: number, m: string) => void }) => <button onClick={() => onConfirm(new Blob(["x"]), 5, "audio/webm")}>Registra</button>,
}));
vi.mock("@/components/campo/CampoRapportinoForm", () => ({
  default: ({ orderLinked, onConfirm }: { orderLinked: boolean; onConfirm: () => void }) => (
    <div><span>{orderLinked ? "collegato" : "non collegato"}</span><button onClick={onConfirm}>Conferma</button></div>
  ),
}));

const cantiere = (id: string, code: string, status = "in_corso"): CampoResolvedAssignment => ({
  id: `a-${id}`, order_id: id, is_capocantiere: false, sources: [],
  order: { id, company_id: "c", order_code: code, description: `Lavori ${code}`, status, indirizzo_lavori: null, percentuale_avanzamento: 0, work_start_date: null, work_end_date: null },
});
beforeEach(() => {
  vi.clearAllMocks(); state.orderId = undefined; state.assignments = []; state.loading = false;
  state.process.mockResolvedValue({ trascrizione: "ho posato due serramenti", dati_estratti: { ore_lavorate: 4 }, audio_duration_sec: 5 });
  state.confirm.mockResolvedValue(true);
});
afterEach(cleanup);

describe("Rapportino vocale: a quale cantiere?", () => {
  it("con più cantieri aperti chiede prima il cantiere e non mostra ancora il registratore", () => {
    state.assignments = [cantiere("o1", "C-001"), cantiere("o2", "C-002")];
    render(<CampoRapportinoVoce />);
    expect(screen.getByText("Per quale cantiere è il rapportino?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /C-001/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /C-002/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registra" })).not.toBeInTheDocument();
  });

  it("scelto il cantiere compare il registratore e l'audio va su quel cantiere", async () => {
    state.assignments = [cantiere("o1", "C-001"), cantiere("o2", "C-002")];
    render(<CampoRapportinoVoce />);
    fireEvent.click(screen.getByRole("button", { name: /C-002/ }));
    expect(screen.getByText("Rapportino collegato")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Registra" }));
    await waitFor(() => expect(state.process).toHaveBeenCalledWith(expect.anything(), 5, "audio/webm", "o2"));
  });

  it("la conferma salva sul cantiere scelto", async () => {
    state.assignments = [cantiere("o1", "C-001"), cantiere("o2", "C-002")];
    render(<CampoRapportinoVoce />);
    fireEvent.click(screen.getByRole("button", { name: /C-001/ }));
    fireEvent.click(screen.getByRole("button", { name: "Registra" }));
    await waitFor(() => expect(screen.getByText("collegato")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Conferma" }));
    await waitFor(() => expect(state.confirm).toHaveBeenCalledWith(expect.anything(), "o1"));
    expect(state.success).toHaveBeenCalledWith("Rapportino salvato e commessa aggiornata", expect.anything());
  });

  it("con un cantiere solo non chiede niente: è quello", async () => {
    state.assignments = [cantiere("o1", "C-001")];
    render(<CampoRapportinoVoce />);
    expect(screen.queryByText("Per quale cantiere è il rapportino?")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Registra" }));
    await waitFor(() => expect(state.process).toHaveBeenCalledWith(expect.anything(), 5, "audio/webm", "o1"));
  });

  it("i cantieri chiusi o annullati non contano: con uno aperto e uno chiuso non si chiede", async () => {
    state.assignments = [cantiere("o1", "C-001"), cantiere("o2", "C-002", "chiuso"), cantiere("o3", "C-003", "Annullato")];
    render(<CampoRapportinoVoce />);
    expect(screen.queryByText("Per quale cantiere è il rapportino?")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Registra" }));
    await waitFor(() => expect(state.process).toHaveBeenCalledWith(expect.anything(), 5, "audio/webm", "o1"));
  });

  it("lo stesso cantiere assegnato per due vie conta una volta sola", () => {
    state.assignments = [cantiere("o1", "C-001"), { ...cantiere("o1", "C-001"), id: "a-bis" }];
    render(<CampoRapportinoVoce />);
    expect(screen.queryByText("Per quale cantiere è il rapportino?")).not.toBeInTheDocument();
  });

  it("aperto da un cantiere (c'è l'ordine nell'indirizzo) non cambia: va su quello, senza domande", async () => {
    state.orderId = "o9";
    state.assignments = [cantiere("o1", "C-001"), cantiere("o2", "C-002")];
    render(<CampoRapportinoVoce />);
    expect(screen.queryByText("Per quale cantiere è il rapportino?")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Registra" }));
    await waitFor(() => expect(state.process).toHaveBeenCalledWith(expect.anything(), 5, "audio/webm", "o9"));
  });

  it("senza nessun cantiere resta una nota vocale, e lo dice: non finge un rapportino di cantiere", async () => {
    render(<CampoRapportinoVoce />);
    fireEvent.click(screen.getByRole("button", { name: "Registra" }));
    await waitFor(() => expect(screen.getByText("non collegato")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Conferma" }));
    await waitFor(() => expect(state.confirm).toHaveBeenCalledWith(expect.anything(), null));
    expect(state.success).toHaveBeenCalledWith(expect.stringContaining("Non è legata a nessun cantiere"), expect.anything());
  });

  it("finché i cantieri non sono arrivati non c'è il registratore (poi comparirebbe la scelta e glielo toglierebbe)", () => {
    state.loading = true;
    render(<CampoRapportinoVoce />);
    expect(screen.getByRole("status")).toHaveTextContent("Carico i tuoi cantieri");
    expect(screen.queryByRole("button", { name: "Registra" })).not.toBeInTheDocument();
  });

  it("aperto da un cantiere non aspetta nessuno: il registratore c'è subito", () => {
    state.loading = true;
    state.orderId = "o9";
    render(<CampoRapportinoVoce />);
    expect(screen.getByRole("button", { name: "Registra" })).toBeInTheDocument();
  });
});
