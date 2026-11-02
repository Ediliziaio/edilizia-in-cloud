import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CampoRapportino from "@/pages/campo/CampoRapportino";
import { summarizeCampoTime } from "@/lib/campo/timeSummary";
import type { RegoleCampo } from "@/lib/campo/regoleCampo";
import { SCHEMA_COME_OGGI, type CampoModulo, type ModuloSchema } from "../../../supabase/functions/_shared/moduliCantiere";

type Membro = {
  key: string; employee_id?: string; subappaltatore_id?: string; nome: string; squadra?: string | null;
  rapportino_inviato?: boolean; gia_registrato_da_altri?: boolean; ore_timbrate?: number | null; timbratura_aperta?: boolean;
};
const state = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  gia: null as Record<string, unknown> | null,
  role: { isCapocantiere: false, esisteCapo: false } as { isCapocantiere: boolean; esisteCapo: boolean; isCaposquadra?: boolean },
  crew: [] as Membro[],
  regole: undefined as RegoleCampo | undefined,
  oreGia: null as { ore: number; da: string } | null,
  fasi: [] as unknown[], sottofasi: [] as unknown[],
  verificaErrore: false, verificaCaricamento: false,
  schema: undefined as unknown,
  subappaltatore: false,
  mezzi: vi.fn(),
}));
vi.mock("react-router-dom", () => ({ useParams: () => ({ orderId: "order" }), useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams(), vi.fn()] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "worker" }, profile: { company_id: "company", first_name: "Mario", last_name: "Rossi" } }) }));
vi.mock("@/hooks/useIsCampo", () => ({ useIsCampo: () => ({ isSubappaltatore: state.subappaltatore }) }));
vi.mock("@/hooks/useGPS", () => ({ useGPS: () => ({ requestPosition: vi.fn() }) }));
vi.mock("@/hooks/useWeatherForecast", () => ({ useWeatherForecast: () => ({ data: undefined as Map<string, { code: number }> | undefined }) }));
vi.mock("@/hooks/campo/useCampoDayTime", () => ({ useCampoDayTime: () => ({
  summary: summarizeCampoTime([], { start: new Date("2026-09-24T00:00:00Z"), end: new Date("2026-09-25T00:00:00Z"), now: new Date("2026-09-24T18:00:00Z"), includeOpen: true }),
  isSuccess: true, isError: false, refetch: vi.fn(),
}) }));
vi.mock("@/components/campo/FirmaPad", () => ({ FirmaPad: ({ label, onChange }: { label: string; onChange: (v: string | null) => void }) => <div>Firma simulata<button onClick={() => onChange("data:image/png;base64,aGVsbG8=")}>Traccia {label}</button></div> }));
vi.mock("@/lib/campo/rapportinoAssignment", () => ({ hasRapportinoAssignment: async () => true }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), warning: vi.fn() } }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data:
    queryKey[0] === "campo-articoli-commessa-rapportino" ? [] :
    queryKey[0] === "campo-rapportino-cantiere" ? { order_code: "C-123", description: "Ristrutturazione Via Roma" } :
    queryKey[0] === "campo-fasi-commessa" ? state.fasi :
    queryKey[0] === "campo-sottofasi" ? state.sottofasi :
    queryKey[0] === "campo-ruolo" ? state.role :
    queryKey[0] === "campo-squadra" ? state.crew :
    queryKey[0] === "campo-regole-ordine" ? state.regole :
    queryKey[0] === "modulo-rapportino" ? state.schema :
    queryKey[0] === "campo-ore-gia-registrate" ? state.oreGia :
    queryKey[0] === "campo-rapportino-gia-oggi" ? state.gia :
    queryKey[0] === "campo-cantiere-coord" ? { lat: 45, lng: 9 } : undefined,
    isError: queryKey[0] === "campo-rapportino-gia-oggi" && state.verificaErrore,
    isLoading: queryKey[0] === "campo-ruolo" && state.verificaCaricamento,
    refetch: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: (config: { mutationFn: () => Promise<unknown>; onSuccess?: () => void; onError?: (e: unknown) => void }) => ({
    isPending: false,
    mutate: async () => { try { await config.mutationFn(); config.onSuccess?.(); } catch (e) { config.onError?.(e); } },
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async (nome: string, args: unknown) => { if (nome === "campo_mezzi_fine_giornata") state.mezzi(args); return { data: null as null, error: null as null }; },
  from: (table: string) => {
    const result = { data: table === "campo_rapportini" ? { id: "report" } : {}, error: null as Error | null };
    const query = { insert: (value: unknown) => { if (table === "campo_rapportini") state.insert(value); return query; },
      update: (value: unknown) => { if (table === "campo_rapportini") state.update(value); return query; }, in: () => query,
      select: () => query, eq: () => query, single: async () => result, maybeSingle: async () => result,
      then: Promise.resolve(result).then.bind(Promise.resolve(result)) };
    return query;
  }, functions: { invoke: async () => ({ data: { pdf_url: "https://local.invalid/rapportino.pdf" }, error: null as null }) },
  storage: { from: () => ({ upload: async () => ({ data: { path: "firma.png" }, error: null as null }), getPublicUrl: () => ({ data: { publicUrl: "https://local.invalid/firma.png" } }) }) },
} }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  state.role = { isCapocantiere: false, esisteCapo: true }; state.crew = []; state.regole = undefined; state.oreGia = null; state.gia = null;
  state.fasi = []; state.sottofasi = []; state.schema = undefined; state.subappaltatore = false;
  state.verificaErrore = false; state.verificaCaricamento = false;
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-24T15:00:00+02:00"));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const campo = (p: Partial<CampoModulo> = {}): CampoModulo => ({
  chiave: "pezzi", etichetta: "Pezzi posati", tipo: "number", obbligatorio: false,
  chi: "tutti", ditte: "tutti", quando: "sempre", livello: "rapportino", stampa: "interno", ...p,
});
const conCampi = (...campi: CampoModulo[]): ModuloSchema => ({ ...SCHEMA_COME_OGGI, campi });
const spenti = (...b: Array<keyof ModuloSchema["blocchi"]>): ModuloSchema => ({
  ...SCHEMA_COME_OGGI, blocchi: { ...SCHEMA_COME_OGGI.blocchi, ...Object.fromEntries(b.map(x => [x, false])) },
});
const ore = () => screen.getByLabelText("Ore ordinarie su questo cantiere");
const compilaOre = () => fireEvent.change(ore(), { target: { value: "8" } });
const invia = () => fireEvent.click(screen.getByRole("button", { name: "Invia rapportino" }));
const inviato = () => state.insert.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
const riaperto = (extra: Record<string, unknown> = {}) => {
  state.gia = {
    id: "r1", created_at: "2026-09-24T10:00:00Z", stato: "rifiutato", motivo_rifiuto: "Rivedi", descrizione_lavori: "Posa", ore_lavorate: 8, ore_straordinario: 0,
    foto_urls: ["https://x/campo-rapportini/a.jpg"], fasi_lavorate: [], presenze: null,
    materiali_usati: [{ nome: "Silicone", quantita: 2, unita: "pz" }], meteo: null, percentuale_avanzamento: 0, lavoro_completato: false, firma_cliente_url: null, ...extra,
  };
};

describe("Senza modello si lavora come oggi", () => {
  it("mostra le parti di sempre e non aggiunge nulla all'invio", async () => {
    render(<CampoRapportino />);
    expect(screen.getByText("Foto cantiere")).toBeInTheDocument();
    expect(screen.getByText("Altro da segnalare (facoltativo)")).toBeInTheDocument();
    compilaOre(); invia();
    await waitFor(() => expect(state.insert).toHaveBeenCalled());
    expect(inviato()).not.toHaveProperty("campi_extra");
  });
});

describe("Parti spente", () => {
  it("le foto spente spariscono", () => {
    state.schema = spenti("foto");
    render(<CampoRapportino />);
    expect(screen.queryByText("Foto cantiere")).toBeNull();
  });
  it("senza nessuna parte in «Altro» la sezione non c'è", () => {
    state.schema = spenti("fasi", "materiali", "mezzi", "straordinario");
    render(<CampoRapportino />);
    expect(screen.queryByText("Altro da segnalare (facoltativo)")).toBeNull();
  });
  it("il capo non vede i riquadri spenti al secondo passo", () => {
    state.role = { isCapocantiere: true, esisteCapo: true };
    state.schema = spenti("materiali", "mezzi");
    render(<CampoRapportino />);
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    expect(screen.queryByText(/Materiali usati · facoltativo/)).toBeNull();
    expect(screen.queryByText(/Mezzi e attrezzi · facoltativo/)).toBeNull();
    expect(screen.getByText(/Lavorazioni e avanzamento/)).toBeInTheDocument();
  });
  it("con i mezzi spenti non registra le giornate dei mezzi", async () => {
    state.schema = spenti("mezzi");
    render(<CampoRapportino />);
    compilaOre(); invia();
    await waitFor(() => expect(state.insert).toHaveBeenCalled());
    expect(state.mezzi).not.toHaveBeenCalled();
  });
  it("un respinto con materiali, fasi e foto, a parti spente, non perde nulla al rimando", async () => {
    riaperto({ fasi_lavorate: [{ phase_id: "f1", percentuale: 40 }] });
    state.schema = spenti("materiali", "fasi", "foto");
    render(<CampoRapportino />);
    await waitFor(() => expect(ore()).toHaveValue(8));
    fireEvent.click(screen.getByRole("button", { name: /Rimanda|Invia rapportino/ }));
    await waitFor(() => expect(state.update).toHaveBeenCalled());
    const u = state.update.mock.calls[0][0] as Record<string, unknown>;
    expect(u).not.toHaveProperty("materiali_usati");
    expect(u).not.toHaveProperty("fasi_lavorate");
    expect(u.foto_urls).toEqual(["https://x/campo-rapportini/a.jpg"]);
  });
});

describe("Campi propri", () => {
  it("l'operaio con un capo vede il campo senza aprire nulla e lo invia con etichetta e tipo", async () => {
    state.schema = conCampi(campo({ unita: "pz" }));
    render(<CampoRapportino />);
    const c = screen.getByLabelText("Pezzi posati");
    expect(c.closest("details")).toBeNull();
    fireEvent.change(c, { target: { value: "12" } });
    compilaOre(); invia();
    await waitFor(() => expect(state.insert).toHaveBeenCalled());
    expect(inviato()?.campi_extra).toEqual([{ chiave: "pezzi", etichetta: "Pezzi posati", tipo: "number", valore: 12, stampa: "interno", unita: "pz" }]);
  });
  it("un obbligatorio vuoto blocca l'invio e dice quale manca", async () => {
    const { toast } = await import("sonner");
    state.schema = conCampi(campo({ obbligatorio: true }));
    render(<CampoRapportino />);
    compilaOre(); invia();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Compila: Pezzi posati"));
    expect(state.insert).not.toHaveBeenCalled();
    expect(screen.getByText("Campo obbligatorio")).toBeInTheDocument();
  });
  it("l'operaio non vede i campi del capo, il capo sì", () => {
    state.schema = conCampi(campo({ chi: "capo" }));
    const { unmount } = render(<CampoRapportino />);
    expect(screen.queryByLabelText("Pezzi posati")).toBeNull();
    unmount();
    state.role = { isCapocantiere: true, esisteCapo: true };
    render(<CampoRapportino />);
    expect(screen.getByLabelText("Pezzi posati")).toBeInTheDocument();
  });
  it("il capo con un obbligatorio non passa al secondo passo", async () => {
    const { toast } = await import("sonner");
    state.role = { isCapocantiere: true, esisteCapo: true };
    state.schema = conCampi(campo({ obbligatorio: true }));
    render(<CampoRapportino />);
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    expect(toast.error).toHaveBeenCalledWith("Compila: Pezzi posati");
    expect(screen.getByLabelText("Pezzi posati")).toBeInTheDocument();
  });
  it("con le ore proprie l'operaio manda le ore senza campi, anche obbligatori", async () => {
    state.regole = { chiCompila: "ore_proprie", oreDalle: "capo", avvisoScostamentoMinuti: null };
    state.schema = conCampi(campo({ obbligatorio: true }));
    render(<CampoRapportino />);
    expect(screen.queryByLabelText("Pezzi posati")).toBeNull();
    compilaOre(); invia();
    await waitFor(() => expect(state.insert).toHaveBeenCalled());
  });
  it("il subappaltatore vede solo i campi per le ditte", async () => {
    state.subappaltatore = true;
    state.schema = conCampi(campo({ ditte: "dipendenti" }), campo({ chiave: "ditta", etichetta: "Squadra della ditta", tipo: "text", ditte: "subappaltatori" }));
    render(<CampoRapportino />);
    expect(screen.queryByLabelText("Pezzi posati")).toBeNull();
    expect(screen.getByLabelText("Squadra della ditta")).toBeInTheDocument();
  });
  it("un campo di fine lavori non compare nel giornaliero", () => {
    state.schema = conCampi(campo({ quando: "fine_lavori" }));
    render(<CampoRapportino />);
    expect(screen.queryByLabelText("Pezzi posati")).toBeNull();
  });
  it("un respinto riprende i valori e conserva quelli di un campo eliminato", async () => {
    riaperto({ campi_extra: [
      { chiave: "pezzi", etichetta: "Pezzi posati", tipo: "number", valore: 5, stampa: "interno" },
      { chiave: "tolto", etichetta: "Campo di allora", tipo: "text", valore: "x", stampa: "interno" },
    ] });
    state.schema = conCampi(campo());
    render(<CampoRapportino />);
    await waitFor(() => expect(screen.getByLabelText("Pezzi posati")).toHaveValue(5));
    fireEvent.click(screen.getByRole("button", { name: /Rimanda|Invia rapportino/ }));
    await waitFor(() => expect(state.update).toHaveBeenCalled());
    const u = state.update.mock.calls[0][0] as { campi_extra: Array<{ chiave: string; etichetta: string }> };
    expect(u.campi_extra.map(v => v.chiave)).toEqual(["pezzi", "tolto"]);
    expect(u.campi_extra[1].etichetta).toBe("Campo di allora");
  });
});

describe("Bozza", () => {
  it("una bozza con una chiave non più nel modello si riprende e si invia", async () => {
    state.schema = conCampi(campo());
    const { unmount } = render(<CampoRapportino />);
    fireEvent.change(screen.getByLabelText("Pezzi posati"), { target: { value: "3" } });
    const chiave = "campo-draft:rapportino:company:worker:order:2026-09-24:daily";
    await waitFor(() => expect(localStorage.getItem(chiave)).not.toBeNull(), { timeout: 5000 });
    expect(JSON.parse(localStorage.getItem(chiave)!).data.campiValori).toEqual({ pezzi: 3 });
    unmount();
    state.schema = conCampi(campo({ chiave: "altro", etichetta: "Altro campo", tipo: "text" }));
    render(<CampoRapportino />);
    const riprendi = await screen.findByRole("button", { name: /Riprendi/ });
    fireEvent.click(riprendi);
    await waitFor(() => expect(screen.getByLabelText("Altro campo")).toBeInTheDocument());
    compilaOre(); invia();
    await waitFor(() => expect(state.insert).toHaveBeenCalled());
    expect(inviato()).not.toHaveProperty("campi_extra");
  });
});
