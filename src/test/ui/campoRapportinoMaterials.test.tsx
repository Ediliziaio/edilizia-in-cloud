import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CampoRapportino from "@/pages/campo/CampoRapportino";
import { summarizeCampoTime, type CampoPunch } from "@/lib/campo/timeSummary";
import type { RapportinoArticle } from "@/lib/campo/rapportinoMaterials";

const state = vi.hoisted(() => ({
  insert: vi.fn(), error: vi.fn(), allowed: true,
  role: { isCapocantiere: false, esisteCapo: false } as { isCapocantiere: boolean; esisteCapo: boolean } | undefined,
  phases: [] as Array<{ id: string; name: string; status: string; percentuale: number }>,
  punches: [] as CampoPunch[], timeError: false, orderId: "order",
  crew: [] as Array<{ key: string; employee_id: string; nome: string }>,
  weather: undefined as Map<string, { code: number }> | undefined,
  articles: [] as RapportinoArticle[], articlesError: false, articlesRefetch: vi.fn(),
  reportDate: null as string | null, existing: null as { id: string; created_at: string } | null,
  dayArgs: vi.fn(), setParams: vi.fn(),
}));
vi.mock("react-router-dom", () => ({ useParams: () => ({ orderId: state.orderId }), useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams(state.reportDate ? { data: state.reportDate } : {}), state.setParams] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "worker" }, profile: { company_id: "company", first_name: "Mario", last_name: "Rossi" } }) }));
vi.mock("@/hooks/useIsCampo", () => ({ useIsCampo: () => ({ isSubappaltatore: false }) }));
vi.mock("@/hooks/useGPS", () => ({ useGPS: () => ({ requestPosition: vi.fn() }) }));
vi.mock("@/hooks/useWeatherForecast", () => ({ useWeatherForecast: () => ({ data: state.weather }) }));
vi.mock("@/hooks/campo/useCampoDayTime", () => ({ useCampoDayTime: (...args: unknown[]) => { state.dayArgs(...args); return ({
  summary: summarizeCampoTime(state.punches, { start: new Date("2026-09-24T00:00:00Z"), end: new Date("2026-09-25T00:00:00Z"), now: new Date("2026-09-24T18:00:00Z"), includeOpen: true }),
  isSuccess: !state.timeError, isError: state.timeError, refetch: vi.fn(),
}); } }));
vi.mock("@/components/campo/FirmaPad", () => ({ FirmaPad: () => <div>Firma simulata</div> }));
vi.mock("@/lib/campo/rapportinoAssignment", () => ({ hasRapportinoAssignment: async () => state.allowed }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: state.error, loading: vi.fn(), warning: vi.fn() } }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data:
    queryKey[0] === "campo-articoli-commessa-rapportino" ? state.articles :
    queryKey[0] === "campo-rapportino-cantiere" ? { order_code: "C-123", description: "Ristrutturazione Via Roma" } :
    queryKey[0] === "campo-fasi-commessa" ? state.phases :
    queryKey[0] === "campo-ruolo" ? state.role :
    queryKey[0] === "campo-squadra" ? state.crew :
    queryKey[0] === "campo-rapportino-gia-oggi" ? state.existing :
    queryKey[0] === "campo-cantiere-coord" ? { lat: 45, lng: 9 } : undefined,
    isError: queryKey[0] === "campo-articoli-commessa-rapportino" && state.articlesError, refetch: state.articlesRefetch }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: (config: { mutationFn: () => Promise<unknown>; onSuccess?: () => void; onError?: (e: unknown) => void }) => ({
    isPending: false,
    mutate: async () => { try { await config.mutationFn(); config.onSuccess?.(); } catch (e) { config.onError?.(e); } },
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    const result = { data: table === "campo_rapportini" ? { id: "report" } : {}, error: null as Error | null };
    const query = { insert: (value: unknown) => { if (table === "campo_rapportini") state.insert(value); return query; },
      select: () => query, eq: () => query, single: async () => result, maybeSingle: async () => result,
      then: Promise.resolve(result).then.bind(Promise.resolve(result)) };
    return query;
  }, functions: { invoke: async () => ({ data: { pdf_url: "https://local.invalid/rapportino-v2-test.pdf" }, error: null as null }) },
} }));
beforeEach(() => { vi.clearAllMocks(); state.allowed = true; state.role = { isCapocantiere: false, esisteCapo: false }; state.phases = []; state.punches = []; state.timeError = false; state.crew = []; state.orderId = "order"; state.weather = undefined; state.articles = [{ id: "article", name: "Malta", categoria: "Materiali" }]; state.articlesError = false; });
beforeEach(() => { state.reportDate = null; state.existing = null; vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-24T15:00:00+02:00")); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const openMaterials = () => { render(<CampoRapportino />); fireEvent.change(screen.getByLabelText("Ore ordinarie su questo cantiere"), { target: { value: "0" } }); fireEvent.click(screen.getByRole("button", { name: "Avanti" })); fireEvent.click(screen.getByRole("button", { name: "Malta" })); };

describe("Giornata e invio entro il giorno successivo", () => {
  it("recupera ieri e conserva quella data nel payload e nel riepilogo", async () => {
    state.reportDate = "2026-09-23"; render(<CampoRapportino />);
    expect(screen.getByLabelText("Giornata di lavoro")).toHaveValue("2026-09-23");
    expect(state.dayArgs).toHaveBeenCalledWith("worker", "company", "2026-09-23");
    expect(screen.getByText(/entro oggi alle 23:59/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ore ordinarie su questo cantiere"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    expect(screen.getByText("23 settembre 2026")).toBeInTheDocument();
    expect(screen.getByText("Materiali usati nella giornata")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Invia rapportino" }));
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ data_lavoro: "2026-09-23", ore_lavorate: 3 })));
  });
  it.each(["2026-09-22", "2026-09-25", "broken"])("non cambia silenziosamente la data non inviabile %s", date => {
    state.reportDate = date; render(<CampoRapportino />);
    expect(screen.getByRole("alert")).toHaveTextContent("giorno successivo");
    expect(screen.getByLabelText("Giornata di lavoro")).toHaveValue(date);
    expect(screen.getByRole("button", { name: "Avanti" })).toBeDisabled();
  });
  it("blocca anche l'invio da modulo già aperto dopo la scadenza", async () => {
    state.reportDate = "2026-09-23"; render(<CampoRapportino />);
    fireEvent.change(screen.getByLabelText("Ore ordinarie su questo cantiere"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    vi.setSystemTime(new Date("2026-09-25T00:00:00+02:00"));
    fireEvent.click(screen.getByRole("button", { name: "Invia rapportino" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith(expect.stringContaining("giorno successivo")));
    expect(state.insert).not.toHaveBeenCalled();
    expect(screen.getByText("4h")).toBeInTheDocument();
  });
  it("non propone un doppione del rapportino giornaliero", () => {
    state.existing = { id: "old-report", created_at: "2026-09-24T08:00:00Z" };
    render(<CampoRapportino />);
    expect(screen.getByText(/Esiste già un rapportino/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Avanti" })).toBeDisabled();
  });
  it("chiede l'uscita prima dell'invio se questo cantiere è ancora aperto", async () => {
    state.punches = [punch("entrata", "08:00")]; render(<CampoRapportino />);
    expect(screen.getByRole("button", { name: "Vai a timbrare l’uscita" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Ore ordinarie su questo cantiere")).toHaveValue(10));
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    expect(screen.getByRole("button", { name: "Invia rapportino" })).toBeDisabled();
  });
  it("ieri non eredita il meteo di oggi", async () => {
    state.reportDate = "2026-09-23"; state.weather = new Map([["2026-09-24", { code: 0 }]]);
    render(<CampoRapportino />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Sole/ })).not.toHaveClass("bg-primary/10"));
  });
});

describe("Rapportino mobile, interazione con API simulate", () => {
  it("mantiene il cantiere identificabile in entrambi i passi", () => {
    render(<CampoRapportino />); expect(screen.getByLabelText("Cantiere del rapportino")).toHaveTextContent("C-123");
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    expect(screen.getByLabelText("Cantiere del rapportino")).toHaveTextContent("Ristrutturazione Via Roma");
  });
  it("non inventa pz quando il listino non specifica l'unità", async () => {
    openMaterials(); expect(screen.getByLabelText("Unità Malta")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Invia rapportino" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith(expect.stringContaining("unità di misura")));
    expect(state.insert).not.toHaveBeenCalled();
  });
  it("recupera l'unità strutturata del listino e la conserva nel payload", async () => {
    state.articles[0].template = { unit_of_measure: "mq", category: null as null };
    openMaterials(); expect(screen.getByLabelText("Unità Malta")).toHaveValue("m²");
    fireEvent.click(screen.getByRole("button", { name: "Invia rapportino" }));
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ materiali_usati: [expect.objectContaining({ unita: "m²" })] })));
  });
  it("esclude le prestazioni classificate e separa quelle non classificate", () => {
    state.articles.push({ id: "labor", name: "Posa", categoria: "Manodopera" }, { id: "unknown", name: "Impianto", categoria: null as null });
    openMaterials();
    expect(screen.queryByRole("button", { name: "Posa" })).not.toBeInTheDocument();
    expect(screen.getByText("Articoli da verificare (1)")).toBeInTheDocument();
    expect(screen.getByText("Impianto").closest("details")).not.toHaveAttribute("open");
  });
  it("distingue errore caricamento articoli dalla lista vuota", () => {
    state.articlesError = true; state.articles = []; render(<CampoRapportino />);
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a caricare gli articoli");
    fireEvent.click(screen.getByRole("button", { name: "Riprova materiali" })); expect(state.articlesRefetch).toHaveBeenCalled();
  });
  it("l'operaio dichiara la lavorazione svolta, non una percentuale di avanzamento", () => {
    state.role = { isCapocantiere: false, esisteCapo: true };
    state.phases = [{ id: "p", name: "Tinteggiature", status: "da_iniziare", percentuale: 0 }];
    render(<CampoRapportino />); fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    fireEvent.click(screen.getByRole("button", { name: "Tinteggiature" }));
    expect(screen.getByText("Lavorazioni svolte oggi")).toBeInTheDocument();
    expect(screen.getByText("· lavorata oggi")).toBeInTheDocument();
    expect(screen.queryByText("→ 0%")).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });
  it("invia articolo, quantità decimale e unità scelti nell'interfaccia", async () => {
    openMaterials();
    fireEvent.change(screen.getByLabelText("Quantità Malta"), { target: { value: "2.5" } });
    fireEvent.change(screen.getByLabelText("Unità Malta"), { target: { value: "kg" } });
    fireEvent.click(screen.getByRole("button", { name: "Invia rapportino" }));
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ materiali_usati: [{ nome: "Malta", quantita: 2.5, unita: "kg", order_item_id: "article", da_furgone: false }] })));
    expect(state.error).not.toHaveBeenCalled();
  });
  it("non salva una quantità nulla e conserva il materiale per correggerlo", async () => {
    openMaterials(); fireEvent.change(screen.getByLabelText("Quantità Malta"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Invia rapportino" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith(expect.stringContaining("quantità maggiore di zero")));
    expect(state.insert).not.toHaveBeenCalled(); expect(screen.getByLabelText("Quantità Malta")).toHaveValue(0);
  });
  it("non invia per un lavoro non assegnato", async () => {
    state.allowed = false; openMaterials(); fireEvent.click(screen.getByRole("button", { name: "Invia rapportino" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith(expect.stringContaining("non assegnato"))); expect(state.insert).not.toHaveBeenCalled();
  });
  it("rimuove solo il materiale scelto senza salvare", () => {
    openMaterials(); fireEvent.click(screen.getByRole("button", { name: "Rimuovi materiale Malta" }));
    expect(screen.queryByLabelText("Quantità Malta")).not.toBeInTheDocument(); expect(state.insert).not.toHaveBeenCalled();
  });
  it("non abilita percentuali di fase quando il ruolo non è stato verificato", () => {
    state.role = undefined; state.phases = [{ id: "p", name: "Posa", status: "in_corso", percentuale: 20 }];
    render(<CampoRapportino />); fireEvent.click(screen.getByRole("button", { name: "Avanti" })); fireEvent.click(screen.getByRole("button", { name: "Posa" }));
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });
  it("mantiene le percentuali per il cantiere senza capocantiere dopo verifica del ruolo", () => {
    state.phases = [{ id: "p", name: "Posa", status: "in_corso", percentuale: 20 }];
    render(<CampoRapportino />); fireEvent.click(screen.getByRole("button", { name: "Avanti" })); fireEvent.click(screen.getByRole("button", { name: "Posa" }));
    expect(screen.getByRole("slider")).toHaveValue("20");
  });
});

const punch = (tipo: string, at: string, order_id: string | null = "order"): CampoPunch => ({ tipo, timestamp_evento: `2026-09-24T${at}:00Z`, order_id });
describe("Ore del rapportino: interazione e arrivo asincrono dei dati", () => {
  it("non precompila 8 ore e richiede un valore esplicito prima dell'invio", async () => {
    render(<CampoRapportino />);
    expect(screen.getByLabelText("Ore ordinarie su questo cantiere")).toHaveValue(null);
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    fireEvent.click(screen.getByRole("button", { name: "Invia rapportino" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith(expect.stringContaining("Indica le ore")));
    expect(state.insert).not.toHaveBeenCalled();
  });
  it("propone solo il cantiere corrente, pause escluse", async () => {
    state.punches = [punch("entrata", "08:00"), punch("pausa_inizio", "10:00", null), punch("pausa_fine", "10:30", null), punch("uscita", "12:00", null), punch("entrata", "13:00", "other"), punch("uscita", "17:00", "other")];
    render(<CampoRapportino />);
    await waitFor(() => expect(screen.getByLabelText("Ore ordinarie su questo cantiere")).toHaveValue(3.5));
    fireEvent.click(screen.getByRole("button", { name: "Avanti" })); fireEvent.click(screen.getByRole("button", { name: "Invia rapportino" }));
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ ore_lavorate: 3.5 })));
  });
  it("non sovrascrive un valore manuale quando arrivano le timbrature", async () => {
    const page = render(<CampoRapportino />);
    fireEvent.change(screen.getByLabelText("Ore ordinarie su questo cantiere"), { target: { value: "2" } });
    state.punches = [punch("entrata", "08:00"), punch("uscita", "16:00")]; page.rerender(<CampoRapportino />);
    await waitFor(() => expect(screen.getByLabelText("Ore ordinarie su questo cantiere")).toHaveValue(2));
  });
  it("meteo arrivato prima non impedisce la proposta ore successiva", async () => {
    const now = new Date();
    state.weather = new Map([[`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`, { code: 0 }]]);
    const page = render(<CampoRapportino />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Sole/ })).toHaveClass("bg-primary/10"));
    state.punches = [punch("entrata", "08:00"), punch("uscita", "12:00")]; page.rerender(<CampoRapportino />);
    await waitFor(() => expect(screen.getByLabelText("Ore ordinarie su questo cantiere")).toHaveValue(4));
  });
  it("segnala la lettura fallita invece di proporre ore zero", () => {
    state.timeError = true; render(<CampoRapportino />);
    expect(screen.getByText(/Timbrature non disponibili/)).toBeInTheDocument();
    expect(screen.getByLabelText("Ore ordinarie su questo cantiere")).toHaveValue(null);
  });
  it("segnala una sequenza anomala senza precompilarla come confermata", () => {
    state.punches = [punch("uscita", "12:00")]; render(<CampoRapportino />);
    expect(screen.getByText(/timbrature da verificare/)).toBeInTheDocument();
    expect(screen.getByLabelText("Ore ordinarie su questo cantiere")).toHaveValue(null);
  });
  it("scegliere un membro non assegna otto ore e blocca la presenza vuota", async () => {
    state.role = { isCapocantiere: true, esisteCapo: true }; state.crew = [{ key: "emp-e", employee_id: "e", nome: "Luca Bianchi" }];
    render(<CampoRapportino />); fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    fireEvent.click(screen.getByRole("button", { name: "Luca Bianchi" }));
    expect(screen.getByLabelText("Ore di Luca Bianchi")).toHaveValue(null);
    fireEvent.click(screen.getByRole("button", { name: "Invia rapportino" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith(expect.stringContaining("ogni persona selezionata")));
    expect(state.insert).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Ore di Luca Bianchi"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Invia rapportino" }));
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ presenze: [{ employee_id: "e", nome: "Luca Bianchi", ore: 3 }] })));
  });
  it("il cambio cantiere non trascina ore o campi dalla bozza precedente", () => {
    const page = render(<CampoRapportino />);
    fireEvent.change(screen.getByLabelText("Ore ordinarie su questo cantiere"), { target: { value: "5" } });
    state.orderId = "other"; page.rerender(<CampoRapportino />);
    expect(screen.getByLabelText("Ore ordinarie su questo cantiere")).toHaveValue(null);
  });
  it("distingue nel riepilogo le ore dell'autore dalle presenze della squadra", () => {
    state.role = { isCapocantiere: true, esisteCapo: true };
    state.crew = [{ key: "emp-e", employee_id: "e", nome: "Luca Bianchi" }];
    render(<CampoRapportino />);
    fireEvent.change(screen.getByLabelText("Ore ordinarie su questo cantiere"), { target: { value: "3.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    fireEvent.click(screen.getByRole("button", { name: "Luca Bianchi" }));
    expect(screen.getByText(/Se hai lavorato anche tu/)).toBeInTheDocument();
    expect(screen.getByText("Ore personali ordinarie")).toBeInTheDocument();
    expect(screen.getByText("Presenze squadra")).toBeInTheDocument();
    expect(screen.getByText("Da indicare")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ore di Luca Bianchi"), { target: { value: "4" } });
    expect(screen.getByText("4 h")).toBeInTheDocument();
    expect(screen.getByText("3.5h")).toBeInTheDocument();
  });
});
