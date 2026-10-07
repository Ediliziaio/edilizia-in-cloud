import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CampoRapportino from "@/pages/campo/CampoRapportino";
import { summarizeCampoTime } from "@/lib/campo/timeSummary";
import { REGOLE_COME_OGGI, type RegoleCampo } from "@/lib/campo/regoleCampo";

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
}));
vi.mock("react-router-dom", () => ({ useParams: () => ({ orderId: "order" }), useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams(), vi.fn()] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "worker" }, profile: { company_id: "company", first_name: "Mario", last_name: "Rossi" } }) }));
vi.mock("@/hooks/useIsCampo", () => ({ useIsCampo: () => ({ isSubappaltatore: false }) }));
vi.mock("@/hooks/useGPS", () => ({ useGPS: () => ({ requestPosition: vi.fn() }) }));
vi.mock("@/hooks/useWeatherForecast", () => ({ useWeatherForecast: () => ({ data: undefined as Map<string, { code: number }> | undefined }) }));
vi.mock("@/hooks/campo/useCampoDayTime", () => ({ useCampoDayTime: () => ({
  summary: summarizeCampoTime([], { start: new Date("2026-09-24T00:00:00Z"), end: new Date("2026-09-25T00:00:00Z"), now: new Date("2026-09-24T18:00:00Z"), includeOpen: true }),
  isSuccess: true, isError: false, refetch: vi.fn(),
}) }));
vi.mock("@/components/campo/FirmaPad", () => ({ FirmaPad: () => <div>Firma simulata</div> }));
vi.mock("@/lib/campo/rapportinoAssignment", () => ({ hasRapportinoAssignment: async () => true }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), warning: vi.fn() } }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data:
    queryKey[0] === "campo-articoli-commessa-rapportino" ? [] :
    queryKey[0] === "campo-rapportino-cantiere" ? { order_code: "C-123", description: "Ristrutturazione Via Roma" } :
    queryKey[0] === "campo-fasi-commessa" ? [] :
    queryKey[0] === "campo-ruolo" ? state.role :
    queryKey[0] === "campo-squadra" ? state.crew :
    queryKey[0] === "campo-regole-ordine" ? state.regole :
    queryKey[0] === "campo-ore-gia-registrate" ? state.oreGia :
    queryKey[0] === "campo-rapportino-gia-oggi" ? state.gia :
    queryKey[0] === "campo-cantiere-coord" ? { lat: 45, lng: 9 } : undefined,
    isError: false, refetch: vi.fn() }),
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
      update: (value: unknown) => { if (table === "campo_rapportini") state.update(value); return query; }, in: () => query,
      select: () => query, eq: () => query, single: async () => result, maybeSingle: async () => result,
      then: Promise.resolve(result).then.bind(Promise.resolve(result)) };
    return query;
  }, functions: { invoke: async () => ({ data: { pdf_url: "https://local.invalid/rapportino.pdf" }, error: null as null }) },
} }));
beforeEach(() => {
  vi.clearAllMocks();
  state.role = { isCapocantiere: false, esisteCapo: false }; state.crew = []; state.regole = undefined; state.oreGia = null; state.gia = null;
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-24T15:00:00+02:00"));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const ore = () => screen.queryByLabelText("Ore ordinarie su questo cantiere");
const avanti = () => fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
const invia = () => fireEvent.click(screen.getByRole("button", { name: "Invia rapportino" }));

describe("Il capocantiere, con le ore dalle timbrature", () => {
  const squadra: Membro[] = [
    { key: "emp-1", employee_id: "1", nome: "Mario", ore_timbrate: 7.5 },
    { key: "emp-2", employee_id: "2", nome: "Luca", ore_timbrate: null },
    { key: "emp-3", employee_id: "3", nome: "Anna", ore_timbrate: 6, timbratura_aperta: true },
    { key: "emp-4", employee_id: "4", nome: "Gina", gia_registrato_da_altri: true },
    { key: "emp-5", employee_id: "5", nome: "Piero", rapportino_inviato: true },
    { key: "sub-1", subappaltatore_id: "s1", nome: "Ditta Rossi", squadra: "Ditta" },
  ];
  const apriSquadra = () => {
    state.role = { isCapocantiere: true, esisteCapo: true }; state.crew = squadra;
    state.regole = { chiCompila: "capo", oreDalle: "timbrature", avvisoScostamentoMinuti: 30 };
    render(<CampoRapportino />);
  };

  it("dice per ognuno cosa dicono le timbrature e non rimette chi è già registrato", () => {
    apriSquadra();
    expect(screen.getByRole("button", { name: /Mario.*timbrate 7h 30/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Luca.*non ha timbrato/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Anna.*ancora dentro/ })).toBeInTheDocument();
    // la ditta non timbra: nessuna nota
    expect(screen.getByRole("button", { name: "Ditta Rossi" })).toBeInTheDocument();
    // chi è già coperto non si può selezionare, e il motivo è scritto
    expect(screen.getByText(/Gina · già registrato da un collega/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Gina/ })).toBeNull();
    expect(screen.getByText(/Piero · ha mandato il suo/)).toBeInTheDocument();
  });

  it("«Seleziona chi ha timbrato» prende solo chi ha ore definitive, con le sue ore", () => {
    apriSquadra();
    fireEvent.click(screen.getByRole("button", { name: "Seleziona chi ha timbrato (1)" }));
    expect(screen.getByLabelText("Ore di Mario")).toHaveValue(7.5);
    expect(screen.queryByLabelText("Ore di Luca")).toBeNull();
    expect(screen.queryByLabelText("Ore di Anna")).toBeNull();
    // chi non ha timbrato lo aggiunge il capo, e le ore le scrive lui
    fireEvent.click(screen.getByRole("button", { name: /Luca/ }));
    expect(screen.getByLabelText("Ore di Luca")).toHaveValue(null);
    expect(screen.getByText("Non ha timbrato: scrivi tu le ore.")).toBeInTheDocument();
  });

  it("avvisa se le ore scritte si allontanano dalle timbrate più della soglia", () => {
    apriSquadra();
    fireEvent.click(screen.getByRole("button", { name: "Seleziona chi ha timbrato (1)" }));
    expect(screen.getByText("Ha timbrato 7h 30.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ore di Mario"), { target: { value: "9" } });
    expect(screen.getByText("Ha timbrato 7h 30: hai scritto più di 1h 30.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ore di Mario"), { target: { value: "7.7" } });
    expect(screen.getByText("Ha timbrato 7h 30.")).toBeInTheDocument();
  });

  it("invia le presenze con le ore confermate dal capo", async () => {
    apriSquadra();
    fireEvent.click(screen.getByRole("button", { name: "Seleziona chi ha timbrato (1)" }));
    fireEvent.change(screen.getByLabelText("Ore di Mario"), { target: { value: "8" } });
    avanti(); invia();
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({
      presenze: [expect.objectContaining({ employee_id: "1", nome: "Mario", ore: 8 })],
    })));
  });
});

describe("Il capocantiere, con le ore scritte a mano (come oggi)", () => {
  it("non mostra nulla di nuovo se l'azienda non ha scelto: ore vuote, nessun avviso", () => {
    state.role = { isCapocantiere: true, esisteCapo: true };
    state.crew = [{ key: "emp-1", employee_id: "1", nome: "Mario", ore_timbrate: 7.5 }];
    render(<CampoRapportino />);
    expect(screen.queryByText(/timbrate/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Seleziona chi ha timbrato/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mario" }));
    expect(screen.getByLabelText("Ore di Mario")).toHaveValue(null);
  });

  it("con il solo avviso acceso mostra il confronto con le timbrate, senza precompilare", () => {
    state.role = { isCapocantiere: true, esisteCapo: true };
    state.regole = { ...REGOLE_COME_OGGI, avvisoScostamentoMinuti: 15 };
    state.crew = [{ key: "emp-1", employee_id: "1", nome: "Mario", ore_timbrate: 6 }];
    render(<CampoRapportino />);
    fireEvent.click(screen.getByRole("button", { name: /Mario/ }));
    expect(screen.getByLabelText("Ore di Mario")).toHaveValue(null);
    fireEvent.change(screen.getByLabelText("Ore di Mario"), { target: { value: "8" } });
    expect(screen.getByText("Ha timbrato 6h: hai scritto più di 2h.")).toBeInTheDocument();
  });
});

describe("L'operaio, secondo come lavora l'azienda", () => {
  it("se il rapportino lo fa il capo, non scrive le ore e invia lo stesso descrizione e foto", async () => {
    state.regole = { chiCompila: "capo", oreDalle: "capo", avvisoScostamentoMinuti: null };
    state.role = { isCapocantiere: false, esisteCapo: true };
    render(<CampoRapportino />);
    expect(ore()).toBeNull();
    expect(screen.getByText("Le tue ore le registra il capocantiere")).toBeInTheDocument();
    invia();
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ ore_lavorate: 0, ore_straordinario: 0 })));
  });

  it("se oggi il capo non c'era, può scrivere le sue ore", async () => {
    state.regole = { chiCompila: "capo", oreDalle: "capo", avvisoScostamentoMinuti: null };
    state.role = { isCapocantiere: false, esisteCapo: true };
    render(<CampoRapportino />);
    fireEvent.click(screen.getByRole("button", { name: /Scrivo io le mie ore/ }));
    fireEvent.change(ore()!, { target: { value: "6" } });
    invia();
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ ore_lavorate: 6 })));
  });

  it("se il cantiere non ha un capocantiere, nessuno scriverebbe le ore: le scrive lui", () => {
    state.regole = { chiCompila: "capo", oreDalle: "capo", avvisoScostamentoMinuti: null };
    state.role = { isCapocantiere: false, esisteCapo: false };
    render(<CampoRapportino />);
    expect(ore()).not.toBeNull();
    expect(screen.queryByText("Le tue ore le registra il capocantiere")).toBeNull();
  });

  it("con «ognuno il suo» scrive le sue ore come sempre", () => {
    state.regole = { chiCompila: "ognuno", oreDalle: "capo", avvisoScostamentoMinuti: null };
    state.role = { isCapocantiere: false, esisteCapo: true };
    render(<CampoRapportino />);
    expect(ore()).not.toBeNull();
  });

  it("con «ore_proprie» manda solo le sue ore: niente racconto, foto o «Altro da segnalare»", async () => {
    state.regole = { chiCompila: "ore_proprie", oreDalle: "capo", avvisoScostamentoMinuti: null };
    state.role = { isCapocantiere: false, esisteCapo: true };
    render(<CampoRapportino />);
    expect(ore()).not.toBeNull();
    expect(screen.getByText("Le tue ore di oggi")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Ho installato il telaio/)).toBeNull();
    expect(screen.queryByText("Foto cantiere")).toBeNull();
    expect(screen.queryByText(/Altro da segnalare/)).toBeNull();
    fireEvent.change(ore()!, { target: { value: "7" } });
    invia();
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ ore_lavorate: 7 })));
  });

  it("con «ore_proprie» ma senza capo in cantiere, racconta la giornata come sempre", () => {
    state.regole = { chiCompila: "ore_proprie", oreDalle: "capo", avvisoScostamentoMinuti: null };
    state.role = { isCapocantiere: false, esisteCapo: false };
    render(<CampoRapportino />);
    expect(ore()).not.toBeNull();
    expect(screen.getByText("Cosa hai fatto oggi?")).toBeInTheDocument();
    expect(screen.getByText("Foto cantiere")).toBeInTheDocument();
  });

  it("se il capo lo ha già messo nelle presenze, le sue ore non si scrivono due volte, in ogni flusso", async () => {
    state.regole = { chiCompila: "ognuno", oreDalle: "capo", avvisoScostamentoMinuti: null };
    state.oreGia = { ore: 8, da: "Marco Operaio" };
    render(<CampoRapportino />);
    expect(ore()).toBeNull();
    expect(screen.getByText(/Marco Operaio ha già segnato le tue ore di questa giornata \(8h\)/)).toBeInTheDocument();
    // «Oggi il capo non c'era» non ha senso: il capo c'era e le ha segnate
    expect(screen.queryByRole("button", { name: /Scrivo io le mie ore/ })).toBeNull();
    avanti(); invia();
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ ore_lavorate: 0 })));
  });

  it("ma chi ha fatto ore diverse sullo stesso cantiere può aggiungerle: solo quelle in più", async () => {
    state.oreGia = { ore: 4, da: "Marco Operaio" };
    render(<CampoRapportino />);
    fireEvent.click(screen.getByRole("button", { name: /Ho fatto altre ore, non comprese in queste/ }));
    expect(screen.getByText(/ha già segnato 4h per te in questa giornata: scrivi qui solo le ore in più/)).toBeInTheDocument();
    fireEvent.change(ore()!, { target: { value: "3" } });
    avanti(); invia();
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ ore_lavorate: 3 })));
  });
});


describe("Un rapportino diverso per chi lo compila", () => {
  const squadra: Membro[] = [
    { key: "emp-1", employee_id: "1", nome: "Mario" },
    { key: "emp-2", employee_id: "2", nome: "Luca" },
    { key: "emp-3", employee_id: "3", nome: "Anna" },
  ];

  it("l'operaio con un capo ha un passo solo: nessuna schermata di avanzamento, fine lavori o firma", () => {
    state.role = { isCapocantiere: false, esisteCapo: true };
    render(<CampoRapportino />);
    expect(screen.queryByRole("button", { name: "Avanti" })).toBeNull();
    expect(screen.getByRole("button", { name: "Invia rapportino" })).toBeInTheDocument();
    expect(screen.queryByText("Lavoro completato")).toBeNull();
    expect(screen.queryByText(/Passo \d di/)).toBeNull();
    expect(screen.getByText("Altro da segnalare (facoltativo)")).toBeInTheDocument();
    expect(screen.queryByText("Firma simulata")).toBeNull();
  });

  it("chi lavora da solo, senza un capo nominato, ha i due passi di sempre", () => {
    state.role = { isCapocantiere: false, esisteCapo: false };
    render(<CampoRapportino />);
    expect(screen.getByRole("button", { name: "Avanti" })).toBeInTheDocument();
    expect(screen.getByText(/Passo 1 di 2/)).toBeInTheDocument();
    expect(screen.queryByText("Altro da segnalare (facoltativo)")).toBeNull();
  });

  it("il capo sceglie chi ha lavorato già al primo passo e non vede le sue ore personali", () => {
    state.role = { isCapocantiere: true, esisteCapo: true }; state.crew = squadra;
    render(<CampoRapportino />);
    expect(screen.getByText("Chi ha lavorato oggi?")).toBeInTheDocument();
    expect(ore()).toBeNull();
    expect(screen.getByText("Cosa hai fatto oggi?")).toBeInTheDocument();
  });

  it("«Stesse ore per tutti» scrive le ore a tutti i selezionati con un tocco", async () => {
    state.role = { isCapocantiere: true, esisteCapo: true }; state.crew = squadra;
    render(<CampoRapportino />);
    expect(screen.queryByText("Stesse ore per tutti:")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mario" }));
    expect(screen.queryByText("Stesse ore per tutti:")).toBeNull(); // con uno solo non serve
    fireEvent.click(screen.getByRole("button", { name: "Luca" }));
    fireEvent.click(screen.getByRole("button", { name: "8 h" }));
    expect(screen.getByLabelText("Ore di Mario")).toHaveValue(8);
    expect(screen.getByLabelText("Ore di Luca")).toHaveValue(8);
    avanti(); invia();
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({
      presenze: [expect.objectContaining({ nome: "Mario", ore: 8 }), expect.objectContaining({ nome: "Luca", ore: 8 })],
    })));
  });

  it("se in cantiere non c'è nessuno da segnare, il capo scrive le sue ore come tutti", () => {
    state.role = { isCapocantiere: true, esisteCapo: true }; state.crew = [];
    render(<CampoRapportino />);
    expect(ore()).not.toBeNull();
  });
});

describe("Il rapportino respinto si corregge e si rimanda", () => {
  const respinto = {
    id: "vecchio", created_at: "2026-09-24T08:00:00Z", stato: "rifiutato", motivo_rifiuto: "Mancano le foto del bagno",
    descrizione_lavori: "Posa del telaio al primo piano", ore_lavorate: 7, ore_straordinario: 0,
    foto_urls: ["https://local.invalid/foto1.jpg"], fasi_lavorate: [] as never[], presenze: [] as never[], materiali_usati: [{ nome: "Malta", quantita: 2, unita: "sacco" }],
    meteo: "nuvoloso", percentuale_avanzamento: 0,
  };

  it("lo riapre già compilato, col motivo dell'ufficio", async () => {
    state.gia = respinto;
    render(<CampoRapportino />);
    expect(screen.getByText("L’ufficio ha respinto questo rapportino")).toBeInTheDocument();
    expect(screen.getByText("Motivo: Mancano le foto del bagno")).toBeInTheDocument();
    expect(screen.queryByText(/Esiste già un rapportino per questa giornata/)).toBeNull();
    await waitFor(() => expect(screen.getByDisplayValue("Posa del telaio al primo piano")).toBeInTheDocument());
    expect(screen.getByLabelText("Ore ordinarie su questo cantiere")).toHaveValue(7);
  });

  it("lo rimanda aggiornando lo stesso rapportino, senza crearne un altro", async () => {
    state.gia = respinto;
    render(<CampoRapportino />);
    await waitFor(() => expect(screen.getByDisplayValue("Posa del telaio al primo piano")).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue("Posa del telaio al primo piano"), { target: { value: "Posa del telaio e foto del bagno" } });
    avanti();
    fireEvent.click(screen.getByRole("button", { name: "Rimanda il rapportino" }));
    await waitFor(() => expect(state.update).toHaveBeenCalledWith(expect.objectContaining({
      stato: "inviato", motivo_rifiuto: null, approvato: false, pdf_url: null,
      descrizione_lavori: "Posa del telaio e foto del bagno", ore_lavorate: 7,
      materiali_usati: [expect.objectContaining({ nome: "Malta", quantita: 2, unita: "sacco" })],
    })));
    expect(state.insert).not.toHaveBeenCalled();
  });

  it("un rapportino già inviato o approvato resta bloccato: si corregge dall'ufficio", () => {
    state.gia = { ...respinto, stato: "inviato" };
    render(<CampoRapportino />);
    expect(screen.getByText(/Esiste già un rapportino per questa giornata/)).toBeInTheDocument();
    expect(screen.queryByText("L’ufficio ha respinto questo rapportino")).toBeNull();
    expect(screen.getByRole("button", { name: "Avanti" })).toBeDisabled();
  });
});
