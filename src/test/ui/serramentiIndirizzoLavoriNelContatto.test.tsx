/**
 * L'indirizzo dei lavori nel passo Contatto del preventivatore Serramenti (06/10/2026): di serie lo stesso del
 * cliente, e lo segue; «altrove» solo se serve. Il passo «Immobile» non lo ha più. Il wizard vero, coi dati
 * finti: quello che si scrive arriva alla creazione o al salvataggio, e a destra si vede com'è.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SrProgettoDetail, SrProgettoRow } from "@/types/serramenti";

// Il primo test importa il wizard (e il suo mondo): sotto carico supera i 5 secondi di partenza.
vi.setConfig({ testTimeout: 30_000 });

const { DETAIL, stato, creazioni, aggiornamenti } = vi.hoisted(() => {
  const progetto = {
    id: "p1", company_id: "c1", code: "SR-2026-0412", stato: "bozza", revision_number: 1, parent_id: null, updated_at: "2026-10-05T09:24:00Z",
    cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_telefono: "347 123 4567",
    tipo_intervento: "sostituzione", intervento_titolo: null, iva_percentuale: 10, sconto_percentuale: 0, sconto_importo: 0,
    modello_snapshot: null, totale_min: 0, totale_max: 0,
  } as unknown as SrProgettoRow;
  const detail: SrProgettoDetail = { progetto, serramenti: [], accessori: [], media: [], risparmio: null, servizi: [] };
  return {
    DETAIL: detail,
    stato: { id: "p1" as string | undefined, detail },
    creazioni: [] as Array<Record<string, unknown>>,
    aggiornamenti: [] as Array<Record<string, unknown>>,
  };
});

vi.mock("react-router-dom", () => ({ useParams: () => ({ id: stato.id }), useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams(), vi.fn()] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, effectiveCompany: { id: "c1", name: "Bianchi Infissi" } }) }));
vi.mock("@/integrations/supabase/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catena: any = new Proxy({}, { get: (_t, p) => (p === "then" ? undefined : p === "maybeSingle" ? () => Promise.resolve({ data: null as null, error: null as null }) : () => catena) });
  return { supabase: { from: () => catena } };
});
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewMargins: false, canViewCosts: false }) }));
vi.mock("@/hooks/useSerramentiModelSupport", () => ({ useSerramentiModelSupport: () => ({ supported: true, isLoading: false }) }));
vi.mock("@/hooks/useSerramentoPDF", () => ({ useSerramentoPDF: () => ({ previewPDF: vi.fn(), isGenerating: false }) }));
vi.mock("@/lib/serramenti/queries", () => ({
  useProgetto: () => ({ data: (stato.id ? stato.detail : undefined) as SrProgettoDetail | undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateProgetto: () => ({
    mutateAsync: (input: Record<string, unknown>) => { creazioni.push(input); return Promise.resolve({ id: "nuovo" }); },
    isPending: false,
  }),
  useUpdateProgetto: () => ({
    mutateAsync: (patch: Record<string, unknown>) => { aggiornamenti.push(patch); return Promise.resolve({}); },
    isPending: false,
  }),
  useDuplicaProgetto: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTemplatePdf: () => ({ data: null as null, isLoading: false, isError: false }),
  useAziendaPerPdf: () => ({ data: { ragione_sociale: "Bianchi Infissi S.r.l." } }),
}));
vi.mock("@/lib/serramenti/useCostoPosizioneListino", () => ({ useCostoPosizioneListino: () => ({ costoPosizione: (): null => null, inCaricamento: false }) }));
vi.mock("@/components/serramenti/StepBom", () => ({ StepBom: () => <p>contenuto del passo Composizione</p> }));
vi.mock("@/components/serramenti/StepAccessori", () => ({ StepAccessori: () => <p>contenuto Foto</p> }));
vi.mock("@/components/serramenti/StepEconomia", () => ({ StepEconomia: () => <p>contenuto Economia</p> }));
vi.mock("@/components/serramenti/StepConsulenza", () => ({ StepConsulenza: (): null => null }));
vi.mock("@/components/serramenti/StepPdf", () => ({ StepPdf: () => <p>contenuto PDF</p> }));
vi.mock("@/components/serramenti/StepContenuti", () => ({ StepContenuti: (): null => null }));
vi.mock("@/components/serramenti/ContactPickerDialog", () => ({ ContactPickerDialog: (): null => null }));
vi.mock("@/components/serramenti/AiSerramentiDraftLauncher", () => ({ AiSerramentiDraftLauncher: (): null => null }));
vi.mock("@/components/serramenti/AnteprimaPdfLive", () => ({ AnteprimaPdfLive: () => <p>PDF vero segnaposto</p> }));

import SerramentiWizard from "@/pages/azienda/serramenti/SerramentiWizard";

const CLIENTE = { cliente_indirizzo: "Via Tortona 33", cliente_citta: "Milano", cliente_cap: "20121", cliente_provincia: "MI" };
const ALTROVE = { cantiere_indirizzo: "Via Roma 12", cantiere_citta: "Torino", cantiere_cap: "10121", cantiere_provincia: "TO" };

/** Un preventivo già creato, con questi campi in più. */
const preventivo = (extra: Record<string, unknown>): SrProgettoDetail => ({ ...DETAIL, progetto: { ...DETAIL.progetto, ...extra } as SrProgettoRow });

const monta = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SerramentiWizard /></QueryClientProvider>);
const barra = () => screen.findByRole("navigation", { name: "Fasi del preventivo" });
const anteprima = () => screen.getByRole("complementary", { name: "Anteprima del preventivo", hidden: true });
const spunta = () => screen.getByRole("checkbox", { name: /Lavori allo stesso indirizzo del cliente/ });
const campiLavori = () => screen.queryByRole("group", { name: "Indirizzo dei lavori" });
const scrivi = (segnaposto: string, valore: string) => fireEvent.change(screen.getByPlaceholderText(segnaposto), { target: { value: valore } });
const apriContatto = async () => {
  const nav = await barra();
  fireEvent.click(within(nav).getByRole("button", { name: "Contatto" }));
  await screen.findByPlaceholderText("Via Tortona 33");
};

beforeEach(() => { stato.id = "p1"; stato.detail = DETAIL; creazioni.length = 0; aggiornamenti.length = 0; localStorage.clear(); });
afterEach(() => cleanup());

describe("preventivo nuovo", () => {
  beforeEach(() => { stato.id = undefined; });

  it("l'indirizzo del cliente arriva anche ai lavori: alla creazione il preventivo ha tutti e due uguali", async () => {
    monta();
    scrivi("Via Tortona 33", "Via Tortona 33");
    scrivi("Milano", "Milano");
    scrivi("20121", "20121");
    scrivi("MI", "MI");
    expect(spunta().getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Via Tortona 33, 20121 Milano (MI)")).toBeTruthy();
    expect(campiLavori()).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Crea e continua/ }));
    await waitFor(() => expect(creazioni).toHaveLength(1));
    expect(creazioni[0]).toMatchObject({
      ...CLIENTE,
      cantiere_indirizzo: "Via Tortona 33", cantiere_citta: "Milano", cantiere_cap: "20121", cantiere_provincia: "MI",
    });
  });

  it("con «altrove» i lavori sono quelli scritti, il cliente resta il suo", async () => {
    monta();
    scrivi("Via Tortona 33", "Via Tortona 33");
    scrivi("Milano", "Milano");
    fireEvent.click(spunta());
    const campi = within(campiLavori() as HTMLElement);
    fireEvent.change(campi.getByLabelText("Via e numero"), { target: { value: "Via Roma 12" } });
    fireEvent.change(campi.getByLabelText("Città"), { target: { value: "Torino" } });
    fireEvent.change(campi.getByLabelText("CAP"), { target: { value: "10121" } });
    fireEvent.change(campi.getByLabelText("Provincia"), { target: { value: "to" } });

    fireEvent.click(screen.getByRole("button", { name: /Crea e continua/ }));
    await waitFor(() => expect(creazioni).toHaveLength(1));
    expect(creazioni[0]).toMatchObject({ cliente_indirizzo: "Via Tortona 33", cliente_citta: "Milano", ...ALTROVE });
  });

  it("senza nessun indirizzo si crea lo stesso: i lavori restano vuoti", async () => {
    monta();
    scrivi("Paolo", "Giulia");
    fireEvent.click(screen.getByRole("button", { name: /Crea e continua/ }));
    await waitFor(() => expect(creazioni).toHaveLength(1));
    expect(creazioni[0].cantiere_indirizzo ?? null).toBeNull();
    expect(creazioni[0].cantiere_citta ?? null).toBeNull();
  });
});

describe("preventivo già creato", () => {
  it("i lavori altrove si aprono su «altrove», coi campi scritti; cambiare il cliente salva solo il cliente", async () => {
    stato.detail = preventivo({ ...CLIENTE, ...ALTROVE });
    monta();
    await apriContatto();
    expect(spunta().getAttribute("aria-checked")).toBe("false");
    const campi = within(campiLavori() as HTMLElement);
    expect((campi.getByLabelText("Via e numero") as HTMLInputElement).value).toBe("Via Roma 12");
    expect((campi.getByLabelText("Città") as HTMLInputElement).value).toBe("Torino");

    scrivi("Milano", "Monza");
    fireEvent.click(screen.getByRole("button", { name: /Salva e continua/ }));
    await waitFor(() => expect(aggiornamenti).toHaveLength(1));
    expect(aggiornamenti[0]).toMatchObject({ cliente_citta: "Monza" });
    expect(Object.keys(aggiornamenti[0]).filter((k) => k.startsWith("cantiere_"))).toEqual([]);
  });

  it("stesso indirizzo: cambiando il cliente il salvataggio porta anche i lavori, per intero", async () => {
    stato.detail = preventivo({ ...CLIENTE, cantiere_indirizzo: "Via Tortona 33", cantiere_citta: "Milano", cantiere_cap: "20121", cantiere_provincia: "MI" });
    monta();
    await apriContatto();
    expect(spunta().getAttribute("aria-checked")).toBe("true");

    scrivi("Milano", "Monza");
    fireEvent.click(screen.getByRole("button", { name: /Salva e continua/ }));
    await waitFor(() => expect(aggiornamenti).toHaveLength(1));
    expect(aggiornamenti[0]).toMatchObject({ cliente_citta: "Monza", cantiere_citta: "Monza" });
    // Le altre tre voci non sono cambiate: non si riscrivono.
    expect(aggiornamenti[0]).not.toHaveProperty("cantiere_indirizzo");
  });

  it("un preventivo di prima (lavori vuoti): aprirlo e salvarlo non scrive nessun indirizzo", async () => {
    stato.detail = preventivo({ ...CLIENTE });
    monta();
    await apriContatto();
    expect(spunta().getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Via Tortona 33, 20121 Milano (MI)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Salva e continua/ }));
    // Niente da salvare: nessuna scrittura (e comunque nessun campo di indirizzo).
    await waitFor(() => expect(screen.queryByPlaceholderText("Via Tortona 33")).toBeNull());
    expect(aggiornamenti.flatMap((p) => Object.keys(p)).filter((k) => /indirizzo|citta|cap|provincia/.test(k))).toEqual([]);
  });

  it("togliendo la spunta e scrivendo, il salvataggio porta solo l'indirizzo dei lavori nuovo", async () => {
    stato.detail = preventivo({ ...CLIENTE, cantiere_indirizzo: "Via Tortona 33", cantiere_citta: "Milano", cantiere_cap: "20121", cantiere_provincia: "MI" });
    monta();
    await apriContatto();
    fireEvent.click(spunta());
    const campi = within(campiLavori() as HTMLElement);
    fireEvent.change(campi.getByLabelText("Via e numero"), { target: { value: "Via Roma 12" } });
    fireEvent.change(campi.getByLabelText("Città"), { target: { value: "Torino" } });
    fireEvent.change(campi.getByLabelText("CAP"), { target: { value: "10121" } });
    fireEvent.change(campi.getByLabelText("Provincia"), { target: { value: "TO" } });
    fireEvent.click(screen.getByRole("button", { name: /Salva e continua/ }));
    await waitFor(() => expect(aggiornamenti).toHaveLength(1));
    expect(aggiornamenti[0]).toMatchObject(ALTROVE);
    expect(Object.keys(aggiornamenti[0]).filter((k) => k.startsWith("cliente_"))).toEqual([]);
  });
});

describe("passo «Immobile»", () => {
  it("non ha più l'indirizzo: restano il tipo di intervento e il piano", async () => {
    stato.detail = preventivo({ ...CLIENTE, ...ALTROVE });
    monta();
    // Si apre da solo sul passo dopo il Contatto.
    await screen.findByText("Tipo di intervento");
    expect(screen.getByText("Intervento")).toBeTruthy();
    expect(screen.getByText("Piano")).toBeTruthy();
    expect(screen.queryByText("Indirizzo cantiere")).toBeNull();
    expect(screen.queryByText(/Lascia vuoto se coincide/)).toBeNull();
    expect(screen.queryByPlaceholderText("Via Tortona 33")).toBeNull();
    expect(screen.queryByPlaceholderText("Milano")).toBeNull();
  });
});

describe("anteprima a destra", () => {
  it("stesso indirizzo: il cliente c'è una volta sola, la riga «Cantiere» non lo ripete", async () => {
    stato.detail = preventivo({ ...CLIENTE, cantiere_indirizzo: "Via Tortona 33", cantiere_citta: "Milano", cantiere_cap: "20121", cantiere_provincia: "MI" });
    monta();
    await barra();
    expect(within(anteprima()).getAllByText(/Via Tortona 33/)).toHaveLength(1);
    expect(within(anteprima()).queryByText(/Cantiere:/)).toBeNull();
  });

  it("lavori altrove: la riga «Cantiere» dice dove", async () => {
    stato.detail = preventivo({ ...CLIENTE, ...ALTROVE });
    monta();
    await barra();
    expect(within(anteprima()).getByText(/Cantiere:/).parentElement?.textContent).toContain("Via Roma 12, 10121 Torino, TO");
  });
});

describe("lista di controllo del PDF", () => {
  it("«Indirizzo dei lavori» rimanda al passo Contatto, dove ora si scrive", () => {
    const sorgente = readFileSync(resolve(process.cwd(), "src/components/serramenti/StepPdf.tsx"), "utf8");
    expect(sorgente).toMatch(/label: "Indirizzo dei lavori",[\s\S]{0,200}passo: "cliente"/);
    expect(sorgente).not.toMatch(/label: "Indirizzo cantiere"/);
  });
});
