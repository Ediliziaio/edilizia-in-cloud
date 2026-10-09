import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CampoRapportino from "@/pages/campo/CampoRapportino";
import { summarizeCampoTime } from "@/lib/campo/timeSummary";
import type { RapportinoArticle } from "@/lib/campo/rapportinoMaterials";

/**
 * Il rapportino dice, per ogni fase su cui si è lavorato, quali materiali e quali foto sono di quella fase.
 * Una fase sola: si collega tutto da solo. Più fasi: l'operaio sceglie, per materiale e per foto, e il resto
 * resta generale. Un rapportino respinto si riapre con i collegamenti già fatti.
 */
const state = vi.hoisted(() => ({
  insert: vi.fn(), update: vi.fn(), error: vi.fn(),
  role: { isCapocantiere: false, esisteCapo: false } as { isCapocantiere: boolean; esisteCapo: boolean },
  phases: [] as Array<{ id: string; name: string; status: string; percentuale: number }>,
  articles: [] as RapportinoArticle[],
  existing: null as Record<string, unknown> | null,
  uploads: 0,
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
vi.mock("@/lib/campo/compressImage", () => ({ compressImage: async (): Promise<Blob | null> => null }));
vi.mock("@/lib/campo/rapportinoAssignment", () => ({ hasRapportinoAssignment: async () => true }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: state.error, loading: vi.fn(), warning: vi.fn() } }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data:
    queryKey[0] === "campo-articoli-commessa-rapportino" ? state.articles :
    queryKey[0] === "campo-rapportino-cantiere" ? { order_code: "C-123", description: "Ristrutturazione Via Roma" } :
    queryKey[0] === "campo-fasi-commessa" ? state.phases :
    queryKey[0] === "campo-ruolo" ? state.role :
    queryKey[0] === "campo-rapportino-gia-oggi" ? state.existing :
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
    const query = {
      insert: (value: unknown) => { if (table === "campo_rapportini") state.insert(value); return query; },
      update: (value: unknown) => { if (table === "campo_rapportini") state.update(value); return query; },
      select: () => query, eq: () => query, in: () => query, order: () => query, limit: () => query,
      single: async () => result, maybeSingle: async () => result,
      then: Promise.resolve(result).then.bind(Promise.resolve(result)),
    };
    return query;
  },
  storage: { from: () => ({
    upload: async (path: string) => { state.uploads++; return { data: { path }, error: null as null }; },
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://local.invalid/${path}` } }),
    createSignedUrls: async (paths: string[]) => ({ data: paths.map(p => ({ signedUrl: `https://firmato.invalid/${p}` })), error: null as null }),
  }) },
  functions: { invoke: async () => ({ data: { pdf_url: "https://local.invalid/rapportino-v4-test.pdf" }, error: null as null }) },
} }));

const FOTO_A = "https://local.invalid/a.jpg";
const FOTO_B = "https://local.invalid/b.jpg";

beforeEach(() => {
  vi.clearAllMocks();
  state.role = { isCapocantiere: false, esisteCapo: false };
  state.phases = [
    { id: "p1", name: "Posa serramenti", status: "in_corso", percentuale: 20 },
    { id: "p2", name: "Finiture", status: "da_iniziare", percentuale: 0 },
  ];
  state.articles = [{ id: "article", name: "Malta", categoria: "Materiali", template: { unit_of_measure: "kg", category: null as null } }];
  state.existing = null; state.uploads = 0;
  URL.createObjectURL = vi.fn(() => "blob:anteprima");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-24T15:00:00+02:00"));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

/** Passo 1 (ore + foto) e poi passo 2, dove si sceglie la fase. Sceglie le fasi indicate. */
async function compila({ fasi, foto = 0 }: { fasi: string[]; foto?: number }) {
  const { container } = render(<CampoRapportino />);
  fireEvent.change(screen.getByLabelText("Ore ordinarie su questo cantiere"), { target: { value: "3" } });
  if (foto) {
    const file = (n: number) => new File(["x"], `f${n}.jpg`, { type: "image/jpeg" });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: Array.from({ length: foto }, (_, i) => file(i)) } });
    await waitFor(() => expect(screen.getAllByAltText("preview")).toHaveLength(foto));
  }
  fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
  for (const nome of fasi) fireEvent.click(screen.getByRole("button", { name: nome }));
  return container;
}
const inviato = () => (state.insert.mock.calls[0]?.[0] ?? state.update.mock.calls[0]?.[0]) as Record<string, unknown>;

describe("una fase sola: tutto si collega da solo", () => {
  it("non chiede la fase di materiali e foto", async () => {
    await compila({ fasi: ["Posa serramenti"], foto: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Malta" }));
    expect(screen.queryByLabelText("Fase di Malta")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Fase della foto 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Di quale fase sono le foto?")).not.toBeInTheDocument();
  });

  it("il rapportino porta il materiale e le foto sotto la fase", async () => {
    await compila({ fasi: ["Posa serramenti"], foto: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Malta" }));
    fireEvent.click(screen.getByRole("button", { name: "Invia rapportino" }));
    await waitFor(() => expect(state.insert).toHaveBeenCalled());
    const r = inviato();
    expect(r.materiali_usati).toEqual([expect.objectContaining({ nome: "Malta", unita: "kg", fase_id: "p1" })]);
    const fasi = r.fasi_lavorate as Array<{ phase_id: string; nome: string; foto?: string[] }>;
    expect(fasi).toHaveLength(1);
    expect(fasi[0]).toMatchObject({ phase_id: "p1", nome: "Posa serramenti" });
    expect(fasi[0].foto).toHaveLength(2);
    expect(r.foto_urls).toEqual(fasi[0].foto); // l'elenco di tutte le foto resta com'era
  });

  it("senza fasi dichiarate il rapportino è quello di sempre: nessun collegamento", async () => {
    await compila({ fasi: [], foto: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Malta" }));
    fireEvent.click(screen.getByRole("button", { name: "Invia rapportino" }));
    await waitFor(() => expect(state.insert).toHaveBeenCalled());
    const r = inviato();
    expect(r).not.toHaveProperty("fasi_lavorate");
    expect((r.materiali_usati as Array<Record<string, unknown>>)[0]).not.toHaveProperty("fase_id");
    expect(r.foto_urls).toHaveLength(1);
  });
});

describe("più fasi: l'operaio assegna, il resto resta generale", () => {
  it("chiede la fase per ogni materiale e per ogni foto, senza obbligo", async () => {
    await compila({ fasi: ["Posa serramenti", "Finiture"], foto: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Malta" }));
    expect(screen.getByLabelText("Fase di Malta")).toHaveValue("");
    expect(screen.getByText("Di quale fase sono le foto?")).toBeInTheDocument();
    expect(screen.getByLabelText("Fase della foto 1")).toHaveValue("");
    expect(screen.getByLabelText("Fase della foto 2")).toHaveValue("");
    // senza scegliere nulla l'invio funziona lo stesso
    fireEvent.click(screen.getByRole("button", { name: "Invia rapportino" }));
    await waitFor(() => expect(state.insert).toHaveBeenCalled());
    const r = inviato();
    expect((r.materiali_usati as Array<Record<string, unknown>>)[0]).not.toHaveProperty("fase_id");
    expect((r.fasi_lavorate as Array<Record<string, unknown>>).every(f => !("foto" in f))).toBe(true);
    expect(state.error).not.toHaveBeenCalled();
  });

  it("la scelta finisce nel rapportino: materiale e foto sotto la fase scelta", async () => {
    await compila({ fasi: ["Posa serramenti", "Finiture"], foto: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Malta" }));
    fireEvent.change(screen.getByLabelText("Fase di Malta"), { target: { value: "p2" } });
    fireEvent.change(screen.getByLabelText("Fase della foto 1"), { target: { value: "p2" } });
    fireEvent.change(screen.getByLabelText("Fase della foto 2"), { target: { value: "p1" } });
    fireEvent.click(screen.getByRole("button", { name: "Invia rapportino" }));
    await waitFor(() => expect(state.insert).toHaveBeenCalled());
    const r = inviato();
    expect(r.materiali_usati).toEqual([expect.objectContaining({ nome: "Malta", fase_id: "p2" })]);
    const fasi = r.fasi_lavorate as Array<{ phase_id: string; foto?: string[] }>;
    const urls = r.foto_urls as string[];
    expect(fasi.find(f => f.phase_id === "p2")?.foto).toEqual([urls[0]]);
    expect(fasi.find(f => f.phase_id === "p1")?.foto).toEqual([urls[1]]);
  });

  it("togliere una fase scioglie i suoi collegamenti, senza spostarli su un'altra", async () => {
    await compila({ fasi: ["Posa serramenti", "Finiture"], foto: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Malta" }));
    fireEvent.change(screen.getByLabelText("Fase di Malta"), { target: { value: "p2" } });
    fireEvent.change(screen.getByLabelText("Fase della foto 1"), { target: { value: "p2" } });
    // «Finiture» si toglie dalle fasi lavorate
    fireEvent.click(screen.getByRole("button", { name: "Finiture" }));
    // ora la fase è una sola: tutto ciò che era generale si collega a quella; la scelta non si indovina da sola per «Finiture»
    expect(screen.queryByLabelText("Fase di Malta")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Invia rapportino" }));
    await waitFor(() => expect(state.insert).toHaveBeenCalled());
    const r = inviato();
    expect(r.materiali_usati).toEqual([expect.objectContaining({ fase_id: "p1" })]);
    expect(r.fasi_lavorate).toEqual([expect.objectContaining({ phase_id: "p1", foto: r.foto_urls })]);
  });

  it("il menu delle foto propone solo le fasi su cui si è lavorato", async () => {
    state.phases.push({ id: "p3", name: "Tinteggiature", status: "da_iniziare", percentuale: 0 });
    await compila({ fasi: ["Posa serramenti", "Finiture"], foto: 1 });
    const opzioni = within(screen.getByLabelText("Fase della foto 1")).getAllByRole("option").map(o => o.textContent);
    expect(opzioni).toEqual(["Nessuna fase", "Posa serramenti", "Finiture"]);
  });
});

describe("il riepilogo a blocchi", () => {
  it("una scheda per fase con i suoi materiali e le sue foto, poi quello che è generale", async () => {
    state.articles.push({ id: "viti", name: "Viti", categoria: "Materiali", template: { unit_of_measure: "pz", category: null as null } });
    await compila({ fasi: ["Posa serramenti", "Finiture"], foto: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Malta" }));
    fireEvent.click(screen.getByRole("button", { name: "Viti" }));
    fireEvent.change(screen.getByLabelText("Fase di Malta"), { target: { value: "p2" } });
    fireEvent.change(screen.getByLabelText("Fase della foto 1"), { target: { value: "p2" } });
    fireEvent.change(screen.getByLabelText("Fase della foto 2"), { target: { value: "p2" } });

    const scheda = (titolo: string) => screen.getByRole("heading", { name: titolo }).closest("section") as HTMLElement;
    const finiture = within(scheda("Finiture"));
    expect(finiture.getByText(/Malta/)).toBeInTheDocument();
    expect(finiture.getByText(/× 1 kg/)).toBeInTheDocument();
    expect(finiture.getByText("2 foto di questa fase")).toBeInTheDocument();

    const posa = within(scheda("Posa serramenti"));
    expect(posa.getByText("Nessun materiale né foto legati a questa fase.")).toBeInTheDocument();

    const altro = within(scheda("Altro"));
    expect(altro.getByText(/Viti/)).toBeInTheDocument();
    expect(altro.getByText("1 foto")).toBeInTheDocument();
  });

  it("con una fase sola le sue cose stanno nella sua scheda e non c'è «Altro»", async () => {
    await compila({ fasi: ["Posa serramenti"], foto: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Malta" }));
    const scheda = screen.getByRole("heading", { name: "Posa serramenti" }).closest("section") as HTMLElement;
    expect(within(scheda).getByText(/Malta/)).toBeInTheDocument();
    expect(within(scheda).getByText("2 foto di questa fase")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Altro" })).not.toBeInTheDocument();
  });

  it("senza fasi: «Foto e materiali» come prima, con il conto delle foto", async () => {
    await compila({ fasi: [], foto: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Malta" }));
    const scheda = screen.getByRole("heading", { name: "Foto e materiali" }).closest("section") as HTMLElement;
    expect(within(scheda).getByText("2 foto")).toBeInTheDocument();
    expect(within(scheda).getByText(/Malta/)).toBeInTheDocument();
  });

  it("la giornata è sempre in testa: data, ore, avanzamento delle fasi", async () => {
    await compila({ fasi: ["Posa serramenti"] });
    const giornata = screen.getByRole("heading", { name: "Giornata" }).closest("section") as HTMLElement;
    expect(within(giornata).getByText("24 settembre 2026")).toBeInTheDocument();
    expect(within(giornata).getByText("3h")).toBeInTheDocument();
    expect(within(screen.getByRole("heading", { name: "Posa serramenti" }).closest("section") as HTMLElement).getByText("→ 20%")).toBeInTheDocument();
  });

  it("la descrizione ha la sua scheda solo se c'è", async () => {
    await compila({ fasi: [] });
    expect(screen.queryByRole("heading", { name: "Descrizione" })).not.toBeInTheDocument();
  });
});

describe("un rapportino respinto si riapre con i collegamenti già fatti", () => {
  const respinto = () => ({
    id: "old", created_at: "2026-09-24T08:00:00Z", stato: "rifiutato", motivo_rifiuto: "Mancano le foto della posa.",
    descrizione_lavori: "Posa del primo serramento", ore_lavorate: 3, ore_straordinario: 0, meteo: null as null, percentuale_avanzamento: 0, presenze: null as null,
    foto_urls: [FOTO_A, FOTO_B],
    fasi_lavorate: [
      { phase_id: "p1", percentuale: 30, nome: "Posa serramenti", foto: [FOTO_A] },
      { phase_id: "p2", percentuale: 100, nome: "Finiture", foto: [FOTO_B] },
    ],
    materiali_usati: [{ nome: "Malta", quantita: 2, unita: "kg", order_item_id: "article", da_furgone: false, fase_id: "p2" }],
  });

  it("fasi, materiali e foto tornano ognuno al suo posto", async () => {
    state.existing = respinto();
    render(<CampoRapportino />);
    await waitFor(() => expect(screen.getByLabelText("Ore ordinarie su questo cantiere")).toHaveValue(3));
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    expect(screen.getByLabelText("Fase di Malta")).toHaveValue("p2");
    expect(screen.getByLabelText("Fase della foto 1")).toHaveValue("p1");
    expect(screen.getByLabelText("Fase della foto 2")).toHaveValue("p2");
  });

  it("rimandandolo si riscrivono i collegamenti, anche quelli cambiati", async () => {
    state.existing = respinto();
    render(<CampoRapportino />);
    await waitFor(() => expect(screen.getByLabelText("Ore ordinarie su questo cantiere")).toHaveValue(3));
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    fireEvent.change(screen.getByLabelText("Fase della foto 1"), { target: { value: "p2" } });
    fireEvent.click(screen.getByRole("button", { name: /Rimanda|Invia rapportino/ }));
    await waitFor(() => expect(state.update).toHaveBeenCalled());
    const r = inviato();
    expect(r.fasi_lavorate).toEqual([
      expect.objectContaining({ phase_id: "p1", percentuale: 30 }),
      expect.objectContaining({ phase_id: "p2", percentuale: 100, foto: [FOTO_A, FOTO_B] }),
    ]);
    expect((r.fasi_lavorate as Array<Record<string, unknown>>)[0]).not.toHaveProperty("foto");
    expect(r.materiali_usati).toEqual([expect.objectContaining({ nome: "Malta", fase_id: "p2" })]);
    expect(r.motivo_rifiuto).toBeNull();
  });

  it("un rapportino di prima, senza collegamenti, si riapre senza scelte inventate", async () => {
    state.existing = {
      ...respinto(),
      fasi_lavorate: [{ phase_id: "p1", percentuale: 30 }, { phase_id: "p2", percentuale: 50 }],
      materiali_usati: [{ nome: "Malta", quantita: 2, unita: "kg", order_item_id: "article", da_furgone: false }],
    };
    render(<CampoRapportino />);
    await waitFor(() => expect(screen.getByLabelText("Ore ordinarie su questo cantiere")).toHaveValue(3));
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    expect(screen.getByLabelText("Fase di Malta")).toHaveValue("");
    expect(screen.getByLabelText("Fase della foto 1")).toHaveValue("");
    expect(screen.getByLabelText("Fase della foto 2")).toHaveValue("");
  });

  it("le miniature di un rapportino respinto si vedono: gli indirizzi salvati sono di un contenitore privato e vanno firmati", async () => {
    const PRIVATA = "https://x.supabase.co/storage/v1/object/public/campo-rapportini/azienda/ordine/a.jpg";
    state.existing = { ...respinto(), foto_urls: [PRIVATA], fasi_lavorate: [{ phase_id: "p1", percentuale: 30, nome: "Posa serramenti", foto: [PRIVATA] }], materiali_usati: [] };
    render(<CampoRapportino />);
    await waitFor(() => expect(screen.getByLabelText("Ore ordinarie su questo cantiere")).toHaveValue(3));
    // anche nel passo 1 la miniatura arriva firmata, non come indirizzo pubblico di un contenitore chiuso
    await waitFor(() => expect(screen.getAllByAltText("preview")[0]).toHaveAttribute("src", "https://firmato.invalid/azienda/ordine/a.jpg"));
  });
});
