/**
 * Il wizard Fotovoltaico nel guscio comune: fasi in alto col totale sempre in vista,
 * anteprima live a destra che si ricalcola mentre si scrive nella Fase 5, «Impresa»
 * solo a chi può vedere i margini, colonna che si nasconde e si ricorda. Si prova la
 * pagina vera (le fasi, i conti, il listino), con i dati e i grafici finti.
 *
 * Il progetto è «nuovo»: la bozza locale porta cliente, tetto e componenti scelti, e
 * da lì si lavora come farebbe chi compila (voci di manodopera, sconto, prezzo a corpo).
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL, LS_KEY_NEW } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";

const { stato, ARTICOLI, NESSUNO, apiInvoke, aggiorna } = vi.hoisted(() => ({
  stato: { margini: true, id: undefined as string | undefined },
  apiInvoke: vi.fn(),
  aggiorna: vi.fn(() => Promise.resolve({})),
  ARTICOLI: {
    pannello: [{ id: "pan1", descrizione: "Pannello 450 W bifacciale", prezzo_vendita: 180, prezzo_acquisto: 120, potenza_w: 450, garanzia_anni: 25 }],
    inverter: [{ id: "inv1", descrizione: "Inverter ibrido 6 kW", prezzo_vendita: 1500, prezzo_acquisto: 1000, potenza_kw: 6, garanzia_anni: 10 }],
    accumulo: [{ id: "acc1", descrizione: "Batteria 10 kWh", prezzo_vendita: 5000, prezzo_acquisto: 3500, capacita_kwh: 10, garanzia_anni: 10 }],
  } as Record<string, Array<Record<string, unknown>>>,
  NESSUNO: [] as unknown[],
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: stato.id }),
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={String(to)}>{children}</a>,
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, effectiveCompany: { id: "c1", name: "Bianchi Solare" } }) }));
vi.mock("@/integrations/supabase/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catena: any = new Proxy({}, { get: (_t, p) => (p === "then" ? undefined : p === "maybeSingle" || p === "single" ? () => Promise.resolve({ data: null as null, error: null as null }) : () => catena) });
  const nulla = () => Promise.resolve({ data: null as null, error: null as null });
  return { supabase: { from: () => catena, rpc: nulla, functions: { invoke: apiInvoke }, storage: { from: () => catena } } };
});
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewMargins: stato.margini, canViewCosts: stato.margini }) }));
vi.mock("@/hooks/useSupportoModelliPreventivo", () => ({ useSupportoModelloPreventivo: () => ({ supported: true, isLoading: false }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/hooks/useDiscountRules", () => ({ useDiscountRules: () => ({ data: NESSUNO, isLoading: false }) }));
vi.mock("@/hooks/useBundles", () => ({ useBundlesList: () => ({ bundles: NESSUNO }) }));
vi.mock("@/lib/fotovoltaico/queries", () => {
  const lista = { data: NESSUNO, isLoading: false };
  const niente = { data: undefined as unknown, isLoading: false };
  const mutazione = { mutateAsync: vi.fn(() => Promise.resolve({})), mutate: vi.fn(), isPending: false };
  return {
    useProgetto: () => niente,
    useAggiornaProgetto: () => ({ ...mutazione, mutateAsync: aggiorna }),
    useProfiliAutoconsumo: () => lista,
    useArticoliFv: (categoria: string) => ({ data: ARTICOLI[categoria] ?? NESSUNO, isLoading: false }),
    useComponentiProgetto: () => niente,
    useListinoPerFv: () => lista,
    useUpsertComponenti: () => mutazione,
    useUpsertManodopera: () => mutazione,
    useUpsertServizi: () => mutazione,
    useTariffeFv: () => lista,
    useManodoperaProgetto: () => niente,
    useServiziProgetto: () => niente,
    useTabelleFinanziamentoFv: () => lista,
    useTopFinanziamentiFv: () => lista,
    useTemplatePdf: () => niente,
    useServiziCatalogo: () => lista,
    useDuplicaProgetto: () => mutazione,
  };
});
// Grafici, mappe e simulatori hanno i loro test: qui basta che non pesino.
vi.mock("@/components/preventivatore/SelezionaCliente", () => ({ SelezionaCliente: () => <p>scelta del contatto</p>, SelezionaClienteDialog: (): null => null }));
vi.mock("@/components/fotovoltaico/CassaCumulataChart", () => ({ CassaCumulataChart: (): null => null }));
vi.mock("@/components/fotovoltaico/FvConfrontoVarianti", () => ({ FvConfrontoVarianti: (): null => null }));
vi.mock("@/components/fotovoltaico/FvLayoutTetto", () => ({ FvLayoutTetto: (): null => null }));
vi.mock("@/components/fotovoltaico/FvSimulatoreInterattivo", () => ({ FvSimulatoreInterattivo: (): null => null }));
vi.mock("@/components/fotovoltaico/FvDimensionamentoStringhe", () => ({ FvDimensionamentoStringhe: (): null => null }));

import FotovoltaicoWizard from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard";

/** La bozza di chi è arrivato alla Fase 5: 12 pannelli da 450 W (5,4 kWp) e un inverter dal listino. */
function seminaBozza(step: number, extra: Record<string, unknown> = {}, completate: number[] = [1, 2, 3, 4].filter((n) => n < step)) {
  localStorage.setItem(`fv_wizard_draft_v1_${stato.id ?? "new"}::u1:c1:generale`, JSON.stringify({
    step,
    completedSteps: completate,
    savedAt: Date.now(),
    data: {
      ...INITIAL,
      cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_telefono: "347 123 4567",
      indirizzo: "Via Roma 4", cap: "36100", comune: "Vicenza", provincia: "VI",
      consumo_annuo_kwh: 4500, ore_sole_annue: 1350, numero_pannelli_max: 20, potenza_max_kwp: 9,
      numero_pannelli_scelti: 12, potenza_kwp: 5.4, pannello_id: "pan1", inverter_id: "inv1",
      ...extra,
    },
  }));
}

const monta = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <FotovoltaicoWizard />
  </QueryClientProvider>,
);
const tab = (nome: string) => screen.getByRole("button", { name: nome });
const barra = () => tab("Configurazione").closest(".sticky") as HTMLElement;
const anteprima = () => screen.getByRole("complementary", { name: "Anteprima del preventivo", hidden: true });
const arrivaAllaFase5 = async () => { await screen.findByText("Prezzo di vendita e IVA"); };

beforeEach(() => { stato.margini = true; stato.id = undefined; apiInvoke.mockReset().mockResolvedValue({ data: null, error: null }); aggiorna.mockClear(); localStorage.clear(); });
afterEach(() => cleanup());

describe("Fotovoltaico nel guscio comune", () => {
  it("nella Fase 1 il tipo Azienda mostra anagrafica senza anticipare la scelta di pagamento",async()=>{
    seminaBozza(1,{cliente_tipo:"azienda",archetipo:"pmi"});monta();await screen.findByRole("heading",{name:/Dati del cliente/});
    expect(screen.getByRole("radio",{name:"Azienda"})).toHaveAttribute("aria-checked","true");
    expect(screen.queryByRole("heading",{name:"Come vuole procedere l’azienda?"})).not.toBeInTheDocument();
  });
  it("otto fasi in alto coi nomi corti (per esteso per lo screen reader) e il totale IVA inclusa sempre in vista", async () => {
    seminaBozza(5);
    monta();
    await arrivaAllaFase5();
    const fasi = Array.from(barra().querySelectorAll<HTMLElement>("[data-tab]"));
    expect(fasi.map((f) => f.getAttribute("aria-label"))).toEqual([
      "Cliente", "Immobile", "Consumi", "Tetto", "Configurazione", "Anteprima finanziaria", "Vista impresa", "Genera preventivo",
    ]);
    // nella tab il nome corto, per esteso nella striscia «Fase 5 di 8» sotto
    expect(tab("Configurazione").textContent).toContain("Impianto");
    expect(tab("Configurazione").textContent).not.toContain("Configurazione");
    expect(tab("Anteprima finanziaria").textContent).toContain("Finanza");
    expect(tab("Genera preventivo").textContent).toContain("Genera");
    expect(within(barra()).getByText(/Fase 5 di 8/).parentElement?.textContent).toContain("Configurazione");
    expect(tab("Configurazione").getAttribute("aria-current")).toBe("step");
    // 12 × 180 + 1.500 = 3.660 + IVA 10% = 4.026
    expect(within(barra()).getByText("€ 4.026,00")).toBeTruthy();
    expect(within(barra()).getByText("Totale IVA incl.")).toBeTruthy();
  });

  it("a destra il preventivo: cliente, impianto, righe dal listino, totali e i numeri dell'impianto", async () => {
    seminaBozza(5);
    monta();
    await arrivaAllaFase5();
    const a = within(anteprima());
    expect(a.getByText("Bianchi Solare")).toBeTruthy();
    expect(a.getByText("Mario Rossi")).toBeTruthy();
    expect(a.getByText("Via Roma 4, 36100 Vicenza, VI")).toBeTruthy();
    expect(a.getByText("Impianto fotovoltaico da 5,4 kWp")).toBeTruthy();
    // le righe sono quelle che la Fase 5 salva
    expect(a.getByText("Pannello 450 W bifacciale")).toBeTruthy();
    expect(a.getByText("Inverter ibrido 6 kW")).toBeTruthy();
    // i numeri dell'impianto: potenza, moduli, produzione (5,4 × 1.350 × 0,7565) e copertura dei consumi
    expect(a.getByText("5,4 kWp")).toBeTruthy();
    expect(a.getByText("5.515 kWh/anno")).toBeTruthy();
    expect(a.getByText("123%")).toBeTruthy();
    // totali: 3.660 + IVA 10% (366) = 4.026
    expect(a.getByText("Totale voci")).toBeTruthy();
    expect(a.getByText("IVA 10%")).toBeTruthy();
    expect(a.getByText("€ 4.026,00")).toBeTruthy();
  });

  it("mentre compili la Fase 5 anteprima e totale in barra si ricalcolano a ogni voce, sconto e prezzo a corpo", async () => {
    seminaBozza(5);
    monta();
    await arrivaAllaFase5();

    // manodopera: 10 h × 50 €/h = 500 → 4.160 + IVA = 4.576
    fireEvent.click(screen.getAllByRole("button", { name: "+ Voce libera" })[0]);
    fireEvent.change(await screen.findByPlaceholderText("Descrizione"), { target: { value: "Posa impianto" } });
    fireEvent.change(screen.getByTitle("Ore"), { target: { value: "10" } });
    fireEvent.change(screen.getByTitle("€/h vendita"), { target: { value: "50" } });
    await waitFor(() => expect(within(barra()).getByText("€ 4.576,00")).toBeTruthy());
    expect(within(anteprima()).getByText("Posa impianto")).toBeTruthy();
    expect(within(anteprima()).getByText("Installazione e manodopera")).toBeTruthy();

    // servizio: pratica a 250 € → 4.410 + IVA = 4.851
    fireEvent.click(screen.getAllByRole("button", { name: "+ Voce libera" })[1]);
    fireEvent.change(await screen.findByPlaceholderText("Descrizione servizio"), { target: { value: "Pratica GSE" } });
    fireEvent.change(screen.getByTitle("Prezzo vendita"), { target: { value: "250" } });
    await waitFor(() => expect(within(barra()).getByText("€ 4.851,00")).toBeTruthy());
    expect(within(anteprima()).getByText("Pratica GSE")).toBeTruthy();

    // sconto di 300 €: imponibile 4.110 + IVA = 4.521
    fireEvent.click(screen.getByRole("button", { name: "€" }));
    fireEvent.change(screen.getByPlaceholderText("es. 500"), { target: { value: "300" } });
    await waitFor(() => expect(within(barra()).getByText("€ 4.521,00")).toBeTruthy());
    expect(within(anteprima()).getByText("− € 300,00")).toBeTruthy();
    expect(within(anteprima()).getByText("Imponibile")).toBeTruthy();

    // prezzo a corpo di 5.000 €: prende il posto della somma delle voci, lo sconto non vale → 5.500
    const corpo = screen.getByLabelText("Prezzo a corpo (imponibile, IVA esclusa)");
    fireEvent.change(corpo, { target: { value: "5000" } });
    fireEvent.blur(corpo);
    await waitFor(() => expect(within(barra()).getByText("€ 5.500,00")).toBeTruthy());
    expect(within(anteprima()).getByText("Prezzo concordato")).toBeTruthy();
    expect(within(anteprima()).queryByText("− € 300,00")).toBeNull();
    expect(within(anteprima()).getByText(/Prezzo scritto a mano/)).toBeTruthy();
  });

  it("«Impresa» compare solo a chi può vedere i margini, e col costo di ogni riga il margine è vero", async () => {
    seminaBozza(5);
    stato.margini = false;
    const { unmount } = monta();
    await arrivaAllaFase5();
    expect(within(anteprima()).queryByRole("button", { name: "Impresa" })).toBeNull();
    unmount();

    stato.margini = true;
    monta();
    await arrivaAllaFase5();
    expect(within(anteprima()).queryByText("Costo")).toBeNull();
    fireEvent.click(within(anteprima()).getByRole("button", { name: "Impresa" }));
    await waitFor(() => expect(within(anteprima()).getByText("Costo")).toBeTruthy());
    expect(within(anteprima()).getByText(/Vista impresa/)).toBeTruthy();
    // costo 12 × 120 + 1.000 = 2.440 su 3.660 di imponibile → margine 1.220
    expect(within(anteprima()).getByText("€ 1.220,00")).toBeTruthy();
  });

  it("prima della Fase 5 non c'è un impianto inventato: si vedono i dati del tetto e il totale non c'è", async () => {
    seminaBozza(2, { pannello_id: null, inverter_id: null });
    monta();
    await screen.findByText(/Fase 2 di 8/);
    const a = within(anteprima());
    expect(a.getByText("Impianto fotovoltaico")).toBeTruthy();
    expect(a.getByText("4.500 kWh")).toBeTruthy();
    expect(a.getByText("fino a 20 moduli (9 kWp)")).toBeTruthy();
    expect(a.queryByText("Potenza")).toBeNull();
    expect(within(barra()).queryByText("Totale IVA incl.")).toBeNull();
  });

  it("tornando indietro dalla Fase 5 l'impianto scelto resta in anteprima, col suo totale", async () => {
    seminaBozza(5);
    monta();
    await arrivaAllaFase5();
    fireEvent.click(tab("Immobile"));
    await screen.findByText(/Fase 2 di 8/);
    expect(within(anteprima()).getByText("Impianto fotovoltaico da 5,4 kWp")).toBeTruthy();
    expect(within(barra()).getByText("€ 4.026,00")).toBeTruthy();
  });

  it("un preventivo nuovo, ancora vuoto, mostra la carta bianca e non un totale", async () => {
    monta();
    await screen.findByText(/Fase 1 di 8/);
    expect(within(anteprima()).getByText("Nome del cliente")).toBeTruthy();
    expect(within(barra()).queryByText("Totale IVA incl.")).toBeNull();
  });

  it("nascondere l'anteprima la toglie e la ricorda per tutti i preventivatori; dalla barra torna", async () => {
    seminaBozza(5);
    monta();
    await arrivaAllaFase5();
    fireEvent.click(within(anteprima()).getByRole("button", { name: "Nascondi l'anteprima" }));
    expect(screen.queryByRole("complementary", { name: "Anteprima del preventivo", hidden: true })).toBeNull();
    expect(localStorage.getItem("preventivatore_anteprima_nascosta")).toBe("1");
    fireEvent.click(within(barra()).getByRole("button", { name: /Mostra anteprima/ }));
    expect(anteprima()).toBeTruthy();
    expect(localStorage.getItem("preventivatore_anteprima_nascosta")).toBe("0");
  });

  it("da telefono il totale nel piede apre l'anteprima dal basso", async () => {
    seminaBozza(5);
    monta();
    await arrivaAllaFase5();
    fireEvent.click(screen.getByRole("button", { name: /Totale € 4\.026,00: apri l'anteprima/ }));
    const tendina = await screen.findByRole("dialog");
    expect(within(tendina).getByText("Pannello 450 W bifacciale")).toBeTruthy();
    expect(within(tendina).getByText("€ 4.026,00")).toBeTruthy();
  });

  it("senza la colonna (tablet e telefono) l'anteprima si apre anche dall'occhio nella barra", async () => {
    seminaBozza(5);
    monta();
    await arrivaAllaFase5();
    fireEvent.click(within(barra()).getByRole("button", { name: "Apri l'anteprima" }));
    const tendina = await screen.findByRole("dialog");
    expect(within(tendina).getByText("Inverter ibrido 6 kW")).toBeTruthy();
  });

  it("cambiando fase si riparte dall'alto della pagina (scorre <main>, non la finestra)", async () => {
    seminaBozza(5);
    const main = document.createElement("main");
    main.id = "main-content";
    main.scrollTo = vi.fn();
    document.body.appendChild(main);
    try {
      monta();
      await arrivaAllaFase5();
      (main.scrollTo as ReturnType<typeof vi.fn>).mockClear();
      fireEvent.click(tab("Immobile"));
      await screen.findByText(/Fase 2 di 8/);
      expect(main.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    } finally {
      main.remove();
    }
  });
});


describe("Preventivo fotovoltaico senza mappa", () => {
  it("dalla località calcola da solo la stima e avanza senza mappe né limiti inventati", async () => {
    apiInvoke.mockResolvedValue({ data: { ore_sole_annue_equivalenti: 1450 }, error: null });
    seminaBozza(4, { latitudine: 42.56, longitudine: 12.64, ore_sole_annue: null, numero_pannelli_max: null, potenza_max_kwp: null });
    monta();
    expect(screen.getByRole("button", { name: /Preventivo senza mappa/ })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByRole("button", { name: /^Avanti/ })).not.toBeDisabled());
    expect(apiInvoke).toHaveBeenCalledWith("fv-pvgis-fetch", expect.anything());
    expect(screen.getByText(/Impostazioni avanzate/).closest("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByRole("button", { name: /^Avanti/ }));
    await arrivaAllaFase5();
    expect(screen.queryByTestId("fv-piano-tetto")).toBeNull();
    expect(apiInvoke).not.toHaveBeenCalledWith("maps-proxy", expect.anything());
    expect(screen.getByText(/Capienza del tetto da verificare/)).toBeTruthy();
  });

  it("calcola con PVGIS e salva geometria assente e scelta senza mappa sul progetto", async () => {
    stato.id = "progetto-locale";
    apiInvoke.mockResolvedValue({ data: { ore_sole_annue_equivalenti: 1500 }, error: null });
    seminaBozza(4, { latitudine: 42.56, longitudine: 12.64, ore_sole_annue: null, numero_pannelli_max: null, potenza_max_kwp: null });
    monta();
    await waitFor(() => expect(screen.getByLabelText("Ore equivalenti annue")).toHaveValue(1500));
    expect(apiInvoke).toHaveBeenCalledWith("fv-pvgis-fetch", { body: { lat: 42.56, lng: 12.64, kwp: 5.4 } });
    expect(aggiorna).toHaveBeenCalledWith(expect.objectContaining({ patch: expect.objectContaining({
      fonte_dati_tetto: "pvgis", superficie_tetto_disponibile_mq: null, numero_pannelli_max: null, potenza_max_kwp: null,
      layout_overlay: { modalita: "senza_mappa" },
    }) }));
    fireEvent.click(screen.getByRole("button", { name: /^Avanti/ }));
    await arrivaAllaFase5();
    expect(aggiorna).toHaveBeenLastCalledWith(expect.objectContaining({ patch: expect.objectContaining({ layout_overlay: { modalita: "senza_mappa" } }) }));
    expect(apiInvoke).not.toHaveBeenCalledWith("fv-solar-api-fetch", expect.anything());
    expect(apiInvoke).not.toHaveBeenCalledWith("maps-proxy", expect.anything());
  });

  it("inserisce 200 moduli senza limite fittizio di 60 e calcola i kWp dal modello scelto", async () => {
    seminaBozza(5, { numero_pannelli_max: null, potenza_max_kwp: null });
    monta(); await arrivaAllaFase5();
    fireEvent.change(screen.getByLabelText("Numero pannelli"), { target: { value: "200" } });
    expect(screen.getByLabelText("Numero pannelli")).toHaveValue(200);
    expect(screen.getByLabelText("Regola il numero di pannelli")).toHaveAttribute("max", "200");
    expect(within(anteprima()).getByText("90 kWp")).toBeTruthy();
  });
});


it("il nuovo progetto comunica al salvataggio iniziale la scelta senza mappa", async () => {
  apiInvoke.mockResolvedValue({ data: { progetto_id: "bozza-locale" }, error: null });
  seminaBozza(2, { latitudine: 42.56, longitudine: 12.64 });
  monta();
  fireEvent.click(screen.getByRole("button", { name: /^Avanti/ }));
  await waitFor(() => expect(apiInvoke).toHaveBeenCalledWith("fv-onboarding-cliente", {
    body: expect.objectContaining({ senza_mappa: true, company_id: "c1" }),
  }));
});


it("se la stima automatica fallisce consente il retry dalla località senza chiedere un numero tecnico", async () => {
  apiInvoke.mockResolvedValueOnce({ data: null, error: new Error("Servizio non disponibile") });
  seminaBozza(4, { latitudine: 42.56, longitudine: 12.64, ore_sole_annue: null, numero_pannelli_max: null });
  monta();
  await waitFor(() => expect(apiInvoke).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByRole("button", { name: "Ricalcola dalla località" })).not.toBeDisabled());
  expect(screen.getByRole("button", { name: /^Avanti/ })).toBeDisabled();
  apiInvoke.mockResolvedValue({ data: { ore_sole_annue_equivalenti: 1500 }, error: null });
  fireEvent.click(screen.getByRole("button", { name: "Ricalcola dalla località" }));
  await waitFor(() => expect(screen.getByRole("button", { name: /^Avanti/ })).not.toBeDisabled());
  expect(apiInvoke).toHaveBeenCalledTimes(2);
});

it("il disegno aggiorna quantità, potenza e prezzi solo dopo conferma; Annulla conserva la configurazione", async () => {
  const {creaDisegnoTetto,disponiModuliAutomaticamente}=await import("../../../supabase/functions/_shared/fvDisegnoCommerciale");
  seminaBozza(5,{layout_overlay:disponiModuliAutomaticamente(creaDisegnoTetto("due_falde"),12),con_accumulo:false});
  monta();await arrivaAllaFase5();
  fireEvent.click(screen.getByRole("button",{name:"Modifica disposizione pannelli"}));
  fireEvent.keyDown(screen.getByRole("button",{name:"Modulo 1"}),{key:"Delete"});
  expect(screen.getByLabelText("Riepilogo disposizione")).toHaveTextContent("11 pannelli");
  expect(screen.getByLabelText("Numero pannelli")).toHaveValue(12);
  fireEvent.click(screen.getByRole("button",{name:"Annulla"}));
  expect(screen.getByLabelText("Numero pannelli")).toHaveValue(12);
  fireEvent.click(screen.getByRole("button",{name:"Modifica disposizione pannelli"}));
  fireEvent.keyDown(screen.getByRole("button",{name:"Modulo 1"}),{key:"Delete"});
  fireEvent.click(screen.getByRole("button",{name:"Usa disposizione nel preventivo"}));
  expect(screen.getByLabelText("Numero pannelli")).toHaveValue(11);
  expect(anteprima()).toHaveTextContent("4,95");
  expect(anteprima()).toHaveTextContent("1.980");
  fireEvent.click(screen.getByRole("button",{name:"Escludi il disegno dal PDF"}));
  fireEvent.change(screen.getByLabelText("Numero pannelli"),{target:{value:"8"}});
  fireEvent.click(screen.getByRole("button",{name:"Disegna il tetto"}));
  expect(screen.getByLabelText("Numero pannelli")).toHaveValue(8);
  expect(screen.getByLabelText("Riepilogo disposizione")).toHaveTextContent("11 pannelli");
  fireEvent.click(screen.getByRole("button",{name:"Annulla"}));
  expect(screen.getByLabelText("Numero pannelli")).toHaveValue(8);
});


it("aprire e chiudere il disegno facoltativo mantiene il preventivo senza mappa", async () => {
  seminaBozza(5,{numero_pannelli_max:null,potenza_max_kwp:null});monta();await arrivaAllaFase5();
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Disegna il tetto"}));
  expect(screen.getByRole("dialog",{name:"Piano di posa dei pannelli"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Annulla"}));
  expect(screen.getByLabelText("Numero pannelli")).not.toBeDisabled();
  expect(screen.getByLabelText("Numero pannelli")).toHaveValue(12);
  expect(screen.getByText(/Preventivo senza mappa: capienza/)).toBeTruthy();
  expect(apiInvoke).not.toHaveBeenCalledWith("maps-proxy",expect.anything());
});
