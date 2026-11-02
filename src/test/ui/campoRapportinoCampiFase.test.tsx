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

const FASI = [
  { id: "f1", name: "Posa infissi", status: "in_corso", percentuale: 0 },
  { id: "f2", name: "Sigillature", status: "in_corso", percentuale: 0 },
];
const perFase = (p: Partial<CampoModulo> = {}) => conCampi(campo({ livello: "fase", ...p }));
const conDueFasi = () => riaperto({ fasi_lavorate: [{ phase_id: "f1", percentuale: 40 }, { phase_id: "f2", percentuale: 10 }] });
const rimanda = () => fireEvent.click(screen.getByRole("button", { name: /Rimanda|Invia rapportino/ }));

describe("Campi per fase", () => {
  beforeEach(() => { state.fasi = FASI; });

  it("con due fasi il campo compare per ciascuna e i valori si inviano separati, fuori da fasi_lavorate", async () => {
    conDueFasi(); state.schema = perFase();
    render(<CampoRapportino />);
    await waitFor(() => expect(screen.getAllByLabelText("Pezzi posati")).toHaveLength(2));
    expect(screen.getAllByLabelText("Pezzi posati")[0].closest("details")).toBeNull();
    const [a, b] = screen.getAllByLabelText("Pezzi posati");
    fireEvent.change(a, { target: { value: "3" } });
    fireEvent.change(b, { target: { value: "4" } });
    rimanda();
    await waitFor(() => expect(state.update).toHaveBeenCalled());
    const u = state.update.mock.calls[0][0] as { campi_extra: unknown[]; fasi_lavorate: unknown[] };
    expect(u.campi_extra).toEqual([
      expect.objectContaining({ chiave: "pezzi", valore: 3, phase_id: "f1", fase_nome: "Posa infissi" }),
      expect.objectContaining({ chiave: "pezzi", valore: 4, phase_id: "f2", fase_nome: "Sigillature" }),
    ]);
    expect(JSON.stringify(u.fasi_lavorate)).not.toContain("pezzi");
  });
  it("senza fasi scelte il campo sta sul rapportino", async () => {
    state.schema = perFase();
    render(<CampoRapportino />);
    fireEvent.change(screen.getByLabelText("Pezzi posati"), { target: { value: "2" } });
    compilaOre(); invia();
    await waitFor(() => expect(state.insert).toHaveBeenCalled());
    const [v] = inviato()!.campi_extra as Array<Record<string, unknown>>;
    expect(v.valore).toBe(2);
    expect(v).not.toHaveProperty("phase_id");
  });
  it("con le fasi spente il campo sta una volta sul rapportino", () => {
    state.schema = { ...perFase(), blocchi: { ...SCHEMA_COME_OGGI.blocchi, fasi: false } };
    render(<CampoRapportino />);
    expect(screen.getAllByLabelText("Pezzi posati")).toHaveLength(1);
  });
  it("una fase tolta non lascia il valore e il suo obbligatorio non blocca", async () => {
    riaperto({
      fasi_lavorate: [{ phase_id: "f1", percentuale: 40 }],
      campi_extra: [{ chiave: "pezzi", etichetta: "Pezzi posati", tipo: "number", valore: 9, stampa: "interno", phase_id: "f2", fase_nome: "Sigillature" },
        { chiave: "pezzi", etichetta: "Pezzi posati", tipo: "number", valore: 1, stampa: "interno", phase_id: "f1", fase_nome: "Posa infissi" }],
    });
    state.schema = perFase({ obbligatorio: true });
    render(<CampoRapportino />);
    await waitFor(() => expect(screen.getAllByLabelText("Pezzi posati")).toHaveLength(1));
    rimanda();
    await waitFor(() => expect(state.update).toHaveBeenCalled());
    const u = state.update.mock.calls[0][0] as { campi_extra: Array<{ phase_id: string }> };
    expect(u.campi_extra.map(v => v.phase_id)).toEqual(["f1"]);
  });
  it("un obbligatorio di una fase scelta blocca l'invio e nomina la fase", async () => {
    const { toast } = await import("sonner");
    conDueFasi(); state.schema = perFase({ obbligatorio: true });
    render(<CampoRapportino />);
    await waitFor(() => expect(screen.getAllByLabelText("Pezzi posati")).toHaveLength(2));
    rimanda();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Compila: Pezzi posati (Posa infissi), Pezzi posati (Sigillature)"));
    expect(state.update).not.toHaveBeenCalled();
  });
  it("a fasi spente un respinto conserva i valori delle fasi che aveva", async () => {
    riaperto({ fasi_lavorate: [{ phase_id: "f1", percentuale: 40 }],
      campi_extra: [{ chiave: "pezzi", etichetta: "Pezzi posati", tipo: "number", valore: 5, stampa: "interno", phase_id: "f1", fase_nome: "Posa infissi" }] });
    state.schema = { ...perFase({ obbligatorio: true }), blocchi: { ...SCHEMA_COME_OGGI.blocchi, fasi: false } };
    render(<CampoRapportino />);
    await waitFor(() => expect(ore()).toHaveValue(8));
    rimanda();
    await waitFor(() => expect(state.update).toHaveBeenCalled());
    const u = state.update.mock.calls[0][0] as { campi_extra: Array<{ valore: number; phase_id: string }> };
    expect(u.campi_extra).toEqual([expect.objectContaining({ valore: 5, phase_id: "f1" })]);
  });

  it("con le fasi non ancora caricate un respinto non perde i valori", async () => {
    state.fasi = [];
    riaperto({ fasi_lavorate: [{ phase_id: "f1", percentuale: 40, nome: "Posa infissi" }],
      campi_extra: [{ chiave: "pezzi", etichetta: "Pezzi posati", tipo: "number", valore: 5, stampa: "interno", phase_id: "f1", fase_nome: "Posa infissi" }] });
    state.schema = perFase();
    render(<CampoRapportino />);
    await waitFor(() => expect(ore()).toHaveValue(8));
    rimanda();
    await waitFor(() => expect(state.update).toHaveBeenCalled());
    const u = state.update.mock.calls[0][0] as { campi_extra: Array<Record<string, unknown>> };
    expect(u.campi_extra).toEqual([expect.objectContaining({ valore: 5, phase_id: "f1", fase_nome: "Posa infissi" })]);
  });
  it("quello scritto prima di scegliere la fase passa alla prima fase scelta", async () => {
    state.schema = perFase();
    render(<CampoRapportino />);
    fireEvent.change(screen.getByLabelText("Pezzi posati"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Posa infissi" }));
    await waitFor(() => expect(screen.getByLabelText("Pezzi posati")).toHaveValue(12));
    compilaOre(); invia();
    await waitFor(() => expect(state.insert).toHaveBeenCalled());
    expect(inviato()!.campi_extra).toEqual([expect.objectContaining({ valore: 12, phase_id: "f1" })]);
  });

  it("a elenco fasi non arrivato non scrive voci di fase senza nome, e il riquadro ha un titolo", async () => {
    state.fasi = [];
    riaperto({ fasi_lavorate: [{ phase_id: "f1", percentuale: 40, nome: "Posa infissi" }, { phase_id: "f9", percentuale: 10 }] });
    state.schema = perFase();
    render(<CampoRapportino />);
    expect(await screen.findByText("Posa infissi")).toBeInTheDocument();
    expect(screen.getByText("Lavorazione")).toBeInTheDocument();
    await waitFor(() => expect(ore()).toHaveValue(8));
    rimanda();
    await waitFor(() => expect(state.update).toHaveBeenCalled());
    const u = state.update.mock.calls[0][0] as { fasi_lavorate: Array<{ phase_id: string; nome?: string }> };
    expect(u.fasi_lavorate.find(f => f.phase_id === "f1")?.nome).toBe("Posa infissi");
  });
});

