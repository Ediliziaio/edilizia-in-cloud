/**
 * Wizard Fotovoltaico, la pagina vera con dati e grafici finti: le Fasi 5 e 6 di un progetto
 * già creato (id nell'indirizzo), con il calcolo finanziario che risponde quello che
 * risponderebbe il server. Si guarda cosa vede e cosa salva chi compila.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { INITIAL } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";

const { stato, NESSUNO, aggiorna, invoca, vista } = vi.hoisted(() => ({
  stato: {
    margini: true,
    progetto: null as Record<string, unknown> | null,
    scenario: null as Record<string, unknown> | null,
    regole: [] as unknown[],
    template: null as Record<string, unknown> | null,
    tabelle: [] as unknown[],
    top: [] as unknown[],
    /** Il catalogo dei pannelli, e dopo quanti millisecondi arriva (la ricarica della pagina non lo ha ancora in memoria). */
    pannelli: [] as unknown[],
    ritardoCatalogo: 0,
    /** Le righe di componenti già salvate sul progetto. */
    componenti: undefined as unknown,
  },
  NESSUNO: [] as unknown[],
  aggiorna: vi.fn(async (_: unknown): Promise<void> => undefined),
  invoca: vi.fn(async (_nome: string, _opzioni?: unknown): Promise<{ data: unknown; error: unknown }> => ({ data: null, error: null })),
  vista: { confronto: null as unknown, simulatore: null as unknown },
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "p1" }),
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={String(to)}>{children}</a>,
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), message: vi.fn(), dismiss: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, effectiveCompany: { id: "c1", name: "Bianchi Solare" } }) }));
vi.mock("@/integrations/supabase/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catena: any = new Proxy({}, { get: (_t, p) => (p === "then" ? undefined : p === "maybeSingle" || p === "single" ? () => Promise.resolve({ data: null as null, error: null as null }) : () => catena) });
  const nulla = () => Promise.resolve({ data: null as null, error: null as null });
  return { supabase: { from: () => catena, rpc: nulla, functions: { invoke: (nome: string, opzioni?: unknown) => invoca(nome, opzioni) }, storage: { from: () => catena } } };
});
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewMargins: stato.margini, canViewCosts: stato.margini }) }));
vi.mock("@/hooks/useSupportoModelliPreventivo", () => ({ useSupportoModelloPreventivo: () => ({ supported: true, isLoading: false }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/hooks/useDiscountRules", () => ({ useDiscountRules: () => ({ data: stato.regole, isLoading: false }) }));
vi.mock("@/hooks/useBundles", () => ({ useBundlesList: () => ({ bundles: NESSUNO }) }));
vi.mock("@/lib/fotovoltaico/queries", async () => {
  const { useEffect, useState } = await import("react");
  const lista = { data: NESSUNO, isLoading: false };
  /** I pannelli arrivano dopo `ritardoCatalogo` ms; le altre categorie sono vuote. */
  function useArticoliFv(categoria: string) {
    const [pronto, setPronto] = useState(stato.ritardoCatalogo === 0);
    useEffect(() => {
      if (stato.ritardoCatalogo === 0) return undefined;
      const t = setTimeout(() => setPronto(true), stato.ritardoCatalogo);
      return () => clearTimeout(t);
    }, []);
    return categoria === "pannello" && pronto ? { data: stato.pannelli, isLoading: false } : { data: NESSUNO, isLoading: !pronto };
  }
  const mutazione = { mutateAsync: vi.fn(() => Promise.resolve({})), mutate: vi.fn(), isPending: false };
  const aggiornamento = { mutateAsync: (x: unknown) => aggiorna(x), mutate: vi.fn(), isPending: false };
  return {
    useProgetto: () => ({ data: stato.progetto, isLoading: false }),
    useAggiornaProgetto: () => aggiornamento,
    useProfiliAutoconsumo: () => lista,
    useArticoliFv,
    useComponentiProgetto: () => ({ data: stato.componenti, isLoading: false }),
    useListinoPerFv: () => lista,
    useUpsertComponenti: () => mutazione,
    useUpsertManodopera: () => mutazione,
    useUpsertServizi: () => mutazione,
    useTariffeFv: () => lista,
    useManodoperaProgetto: () => ({ data: undefined as unknown, isLoading: false }),
    useServiziProgetto: () => ({ data: undefined as unknown, isLoading: false }),
    useTabelleFinanziamentoFv: () => ({ data: stato.tabelle, isLoading: false }),
    useTopFinanziamentiFv: () => ({ data: stato.top, isLoading: false }),
    useTemplatePdf: () => ({ data: stato.template, isLoading: false }),
    useServiziCatalogo: () => lista,
    useDuplicaProgetto: () => mutazione,
  };
});
vi.mock("@/components/fotovoltaico/FvContactPicker", () => ({ FvContactPicker: () => <p>scelta del contatto</p> }));
vi.mock("@/components/fotovoltaico/CassaCumulataChart", () => ({ CassaCumulataChart: (): null => null }));
vi.mock("@/components/fotovoltaico/FvConfrontoVarianti", () => ({ FvConfrontoVarianti: (p: { ctx: unknown }): null => { vista.confronto = p.ctx; return null; } }));
vi.mock("@/components/fotovoltaico/FvLayoutTetto", () => ({ FvLayoutTetto: (): null => null }));
vi.mock("@/components/fotovoltaico/FvSimulatoreInterattivo", () => ({ FvSimulatoreInterattivo: (p: { base: unknown }): null => { vista.simulatore = p.base; return null; } }));
vi.mock("@/components/fotovoltaico/FvDimensionamentoStringhe", () => ({ FvDimensionamentoStringhe: (): null => null }));

import FotovoltaicoWizard from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard";

/** Il progetto come lo rilegge il database: 5,4 kWp, 4.500 kWh di consumo, il cliente paga 0,25 €/kWh. */
function riga(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "p1", company_id: "c1", numero: "FV-2026-0101", stato: "bozza", archetipo: "privato_prima",
    cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_telefono: "347 123 4567", cliente_email: null,
    indirizzo: "Via Roma 4", comune: "Vicenza", provincia: "VI", cap: "36100", regione: "Veneto", popolazione_comune: 110000,
    latitudine: 45.5, longitudine: 11.5, tipologia_immobile: "residenziale", superficie_immobile_mq: 120, prima_casa: true,
    consumo_annuo_kwh: 4500, costo_kwh_attuale: 0.25, tariffa_tipo: "monoraria", profilo_consumo: "misto",
    isee: null, numero_figli: 0, reddito_annuo_dichiarato: null,
    fonte_dati_tetto: "manuale", qualita_dati_tetto: null, imagery_date: null, ore_sole_annue: 1350,
    superficie_tetto_disponibile_mq: 60, numero_pannelli_max: 20, potenza_max_kwp: 9,
    azimut_tetto: null, inclinazione_tetto: null, layout_tetto: null, perdita_ombreggiamento_pct: 0,
    numero_pannelli_scelti: 12, potenza_kwp: 5.4, con_accumulo: false, capacita_accumulo_kwh: 0, con_wallbox: false, con_ottimizzatori: false,
    kit_bundle_id: null, kit_nome: null, kit_prezzo: null, prezzo_vendita_manuale: null, iva_aliquota: 0.1,
    layout_overlay: null, modalita_pagamento: null, sconto_tipo: null, sconto_valore: null,
    scenario_finanziamento: "cash", finanziamento_durata_mesi: null, finanziamento_tabella_id: null,
    prezzo_vendita_iva_inclusa: 12100, modello_snapshot: null, cliente: null,
    ...extra,
  };
}

/** Quello che risponde fv-calcolo-finanziario per 11.000 € di imponibile (12.100 con IVA 10%), 4 anni di rientro. */
function scenarioDelServer(extra: Record<string, unknown> = {}, costi: Record<string, unknown> = {}): Record<string, unknown> {
  const cassa = Array.from({ length: 26 }, (_, anno) => ({ anno, flusso: anno === 0 ? -12100 : 1500, cumulato: -12100 + 1500 * anno }));
  return {
    produzione_annua_kwh: 5515, autoconsumo_pct: 0.35, energia_autoconsumata_kwh: 1930, energia_immessa_rete_kwh: 3585,
    risparmio_bolletta_eur: 600, ricavi_rid_eur: 360, detrazione_anno_eur: 605, cassa_anno_per_anno: cassa,
    payback_anni: 8.1, npv_25_anni: 7000, irr_pct: 0.09, risparmio_totale_25_anni: 37500,
    sensitivity_minus15: { payback_anni: 9, npv: 5000 }, sensitivity_plus15: { payback_anni: 7.4, npv: 9000 },
    scenario_auto_elettrica: { payback_anni: 7, npv: 8000, autoconsumo: 0.55 }, scenario_pompa_calore: { payback_anni: 6, npv: 9000, autoconsumo: 0.65 },
    incentivi: [{ codice: "DETR_50_PRIMA", nome: "Detrazione 50%", tipo: "detrazione_irpef", importo_eur: 6050, durata_anni: 10 }],
    costi: {
      costo_totale_netto: 7300, prezzo_pieno_netto: 11000, sconto_eur_applicato: 0, sconto_limitato: false,
      prezzo_vendita_netto: 11000, prezzo_vendita_iva_inclusa: 12100, margine_eur: 3700, margine_pct: 0.3364,
      costi_incompleti: false, costo_componenti_vendita: 11000, ...costi,
    },
    ...extra,
  };
}

const monta = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <FotovoltaicoWizard />
  </QueryClientProvider>,
);

/** Il draft del browser per il progetto p1: serve a farlo aprire alla Fase voluta. */
function apriAllaFase(step: number, extra: Record<string, unknown> = {}) {
  localStorage.setItem("fv_wizard_draft_v1_p1", JSON.stringify({
    step, completedSteps: [1, 2, 3, 4, 5].filter((n) => n < step), savedAt: Date.now(), data: { ...INITIAL, ...extra },
  }));
}

beforeEach(() => {
  stato.margini = true;
  stato.progetto = riga();
  stato.scenario = scenarioDelServer();
  stato.regole = [];
  stato.template = null;
  stato.tabelle = [];
  stato.top = [];
  stato.pannelli = [];
  stato.ritardoCatalogo = 0;
  stato.componenti = undefined;
  vista.confronto = null;
  vista.simulatore = null;
  aggiorna.mockClear();
  vi.mocked(toast.error).mockClear();
  invoca.mockReset();
  invoca.mockImplementation(async (nome: string) => ({ data: nome === "fv-calcolo-finanziario" ? stato.scenario : nome === "fv-genera-pdf" ? { url: "x.html" } : null, error: null }));
  localStorage.clear();
});
afterEach(() => cleanup());

const arrivaAllaFase6 = async () => { await screen.findByText(/Anteprima finanziaria per il cliente/); };

describe("Fase 6: confronto varianti e simulatore", () => {
  it("partono dal prezzo del kWh del cliente (0,25), non da uno scritto nel codice: il rientro della configurazione scelta deve tornare con quello della scheda", async () => {
    apriAllaFase(6);
    monta();
    await arrivaAllaFase6();
    await waitFor(() => expect(vista.confronto).not.toBeNull());
    const ctx = vista.confronto as { costo_kwh_attuale: number; prezzo_rid_kwh: number };
    expect(ctx.costo_kwh_attuale).toBe(0.25);
    expect((vista.simulatore as { costo_kwh_attuale: number }).costo_kwh_attuale).toBe(0.25);
    // il ritiro dell'energia resta quello del calcolo (di serie 0,10)
    expect(ctx.prezzo_rid_kwh).toBe(0.1);
  });

  it("se il server lo risponde (prezzo del kWh e ritiro usati nel calcolo) si usano quei valori", async () => {
    stato.scenario = scenarioDelServer({ costo_kwh_attuale: 0.27, prezzo_rid_eur_kwh: 0.12 });
    apriAllaFase(6);
    monta();
    await arrivaAllaFase6();
    await waitFor(() => expect(vista.confronto).not.toBeNull());
    expect(vista.confronto).toMatchObject({ costo_kwh_attuale: 0.27, prezzo_rid_kwh: 0.12 });
  });
});

describe("Fase 6: il guadagno in 25 anni", () => {
  it("«guadagno netto» è quello che resta tolta la spesa (la cassa a fine vita, come nel PDF: +25.400), non la somma dei risparmi (37.500)", async () => {
    // 25 anni a 1.500 € = 37.500 di risparmi; investimento 12.100 → in tasca 25.400
    apriAllaFase(6);
    monta();
    await arrivaAllaFase6();
    const etichetta = await screen.findByText("guadagno netto in 25 anni vs senza FV");
    const hero = etichetta.closest(".relative") as HTMLElement;
    expect(hero.textContent).toContain("€ 25.400");
    expect(hero.textContent).not.toContain("37.500");
    // lo stesso numero sul grafico della cassa e nella frase «Investi … e guadagnerai …»
    expect(screen.getByText(/a fine vita/).textContent).toContain("25.400");
    expect(screen.getByText(/guadagnerai/).textContent).toContain("25.400");
    // il totale dei risparmi resta, col suo nome, tra i numeri chiave
    expect(screen.getByText("Risparmio 25 anni").parentElement?.textContent).toContain("37.500");
  });
});

/** Un progetto con la Fase 6 già confermata: tasso zero in 60 mesi e un anticipo del 30% alla firma. */
const conAnticipo = (anticipo: number, extra: Record<string, unknown> = {}) => riga({
  scenario_finanziamento: "zero", finanziamento_durata_mesi: 60,
  modalita_pagamento: { tranche: [{ label: "Saldo", pct: 100 }], note: null, anticipo_pct: anticipo },
  ...extra,
});

describe("Fase 6: la rata col finanziamento a tasso zero e l'anticipo", () => {
  it("la rata grande e il «costo netto reale» sono quelli del capitale finanziato (70%), gli stessi del riquadro «Modalità di pagamento» e del PDF", async () => {
    stato.progetto = conAnticipo(30);
    apriAllaFase(6);
    monta();
    await arrivaAllaFase6();
    // 12.100 − anticipo 30% (3.630) = 8.470 in 60 rate = 141 al mese; il risparmio in bolletta è 960 / 12 = 80 → costo netto 61
    const rata = (await screen.findByText("Rata mensile (tasso 0%)")).parentElement as HTMLElement;
    expect(rata.textContent).toContain("€ 141");
    expect(rata.textContent).not.toContain("€ 202");
    const netto = screen.getByText("Costo netto reale").parentElement as HTMLElement;
    expect(netto.textContent).toContain("€ 61");
    // il riquadro dei pagamenti dice la stessa rata
    expect(screen.getByText("Rata mensile").parentElement?.textContent).toContain("€ 141");
  });

  it("senza anticipo la rata è quella intera (12.100 / 60 = 202)", async () => {
    stato.progetto = conAnticipo(0);
    apriAllaFase(6);
    monta();
    await arrivaAllaFase6();
    expect((await screen.findByText("Rata mensile (tasso 0%)")).parentElement?.textContent).toContain("€ 202");
  });
});

/** Il patch che «Avanti» della Fase 6 scrive sul progetto (l'unico che porta la scelta di finanziamento). */
async function premiAvantiEprendiIlSalvataggio(): Promise<Record<string, unknown>> {
  fireEvent.click(await screen.findByRole("button", { name: /Avanti/ }));
  await waitFor(() => expect(aggiorna.mock.calls.some((c) => "finanziamento_rata_eur" in ((c[0] as { patch: Record<string, unknown> }).patch))).toBe(true));
  return (aggiorna.mock.calls.map((c) => (c[0] as { patch: Record<string, unknown> }).patch).find((p) => "finanziamento_rata_eur" in p)) as Record<string, unknown>;
}

describe("Fase 6: cosa salva «Avanti» per il noleggio", () => {
  it("la durata salvata è quella con cui si è calcolato il canone: 24 mesi richiesti, ma il noleggio parte da 36 (canone 11.000 · 1,12 / 36 = 342,22)", async () => {
    stato.progetto = riga({
      archetipo: "pmi", scenario_finanziamento: "noleggio", finanziamento_durata_mesi: 24,
      modalita_pagamento: { tranche: [{ label: "Saldo", pct: 100 }], note: null, anticipo_pct: 0 },
    });
    apriAllaFase(6);
    monta();
    await arrivaAllaFase6();
    const patch = await premiAvantiEprendiIlSalvataggio();
    expect(patch.scenario_finanziamento).toBe("noleggio");
    expect(patch.finanziamento_rata_eur).toBeCloseTo(342.22, 2);
    // nel PDF «Canone mensile · N mesi»: N deve essere i 36 mesi su cui è fatto il canone, non i 24 richiesti
    expect(patch.finanziamento_durata_mesi).toBe(36);
  });
});

describe("Fase 6: cosa salva «Avanti» per il tasso zero", () => {
  it("la rata è al centesimo: 12.345,67 € in 60 rate = 205,76 (non 206: 60 rate da 206 fanno 12.360, 14 € più del prezzo)", async () => {
    stato.progetto = conAnticipo(0);
    stato.scenario = scenarioDelServer({}, { prezzo_vendita_iva_inclusa: 12345.67, prezzo_vendita_netto: 11223.34, prezzo_pieno_netto: 11223.34 });
    apriAllaFase(6);
    monta();
    await arrivaAllaFase6();
    const patch = await premiAvantiEprendiIlSalvataggio();
    expect(patch.scenario_finanziamento).toBe("zero");
    expect(patch.finanziamento_durata_mesi).toBe(60);
    expect(patch.finanziamento_rata_eur).toBe(205.76);
    expect(patch.finanziamento_totale_dovuto_eur).toBe(12345.67);
    expect(patch.finanziamento_taeg).toBe(0);
    // la rata per le rate resta entro mezzo euro dal prezzo: la somma torna
    expect(Math.abs((patch.finanziamento_rata_eur as number) * 60 - 12345.67)).toBeLessThan(0.5);
  });
});

describe("Fase 5: le righe non ancora confermate con «Avanti» si ritrovano alla ricarica", () => {
  it("manodopera, servizi e prodotti extra della bozza del browser tornano sullo schermo (il database non li ha ancora)", async () => {
    apriAllaFase(5, {
      manodopera_righe: [{ tariffa_id: null, descrizione: "Posa pannelli", ore: 16, tariffa_oraria_netta: 25, tariffa_oraria_vendita: 40 }],
      servizi_righe: [{ tipo: "altro", descrizione: "Pratica GSE", quantita: 1, prezzo_netto: 200, prezzo_vendita: 350, note_operative: null }],
      prodotti_extra: [{ uid: "u-1", listino_id: null, descrizione: "Staffe speciali", quantita: 4, prezzo_vendita: 35, prezzo_acquisto: null }],
    });
    monta();
    expect(await screen.findByDisplayValue("Posa pannelli")).toBeTruthy();
    expect(screen.getByDisplayValue("Pratica GSE")).toBeTruthy();
    expect(screen.getByDisplayValue("Staffe speciali")).toBeTruthy();
    expect(screen.queryByText(/Nessuna manodopera/)).toBeNull();
  });
});

/** Un progetto con 12 moduli da 450 W (5,4 kWp), già salvato con quel modello di pannello. */
const PANNELLO_450 = { id: "pan-1", categoria: "pannello", marca: "Acme", modello: "P450", potenza_w: 450, prezzo_vendita: 180, prezzo_acquisto: 120, attivo: true };
function progettoCon12ModuliDa450() {
  stato.pannelli = [PANNELLO_450];
  stato.componenti = [{ id: "c1", progetto_id: "p1", categoria: "pannello", articolo_id: "pan-1", descrizione: "Acme P450", quantita: 12, prezzo_unitario_vendita: 180, prezzo_unitario_netto: 120, unita_misura: "pz" }];
  stato.progetto = riga({ numero_pannelli_scelti: 12, potenza_kwp: 5.4 });
}
/** Quello che dice il riquadro «Potenza» della Fase 5. */
const potenzaMostrata = () => screen.getByText("Potenza", { selector: "div" }).parentElement?.textContent;

describe("Fase 5: la potenza dell'impianto alla riapertura del progetto", () => {
  it("con il catalogo dei pannelli che arriva dopo i componenti la potenza resta 5,40 kWp (12 × 450 W), non diventa 12 × 540 W = 6,48", async () => {
    progettoCon12ModuliDa450();
    stato.ritardoCatalogo = 150;
    apriAllaFase(5);
    monta();
    await screen.findByText(/Prezzo di vendita e IVA/);
    await new Promise((r) => setTimeout(r, 450));
    expect(potenzaMostrata()).toContain("5.40");
  });

  it("se il modello salvato non è più a listino la potenza salvata non cambia (prima diventava moduli × 540 W)", async () => {
    progettoCon12ModuliDa450();
    stato.pannelli = [{ ...PANNELLO_450, id: "altro", potenza_w: 600 }];
    apriAllaFase(5);
    monta();
    await screen.findByText(/Prezzo di vendita e IVA/);
    await new Promise((r) => setTimeout(r, 300));
    expect(potenzaMostrata()).toContain("5.40");
  });

  it("chi sposta il numero dei moduli ricalcola la potenza sui watt del modello scelto: 16 × 450 W = 7,20 kWp", async () => {
    progettoCon12ModuliDa450();
    apriAllaFase(5);
    monta();
    await screen.findByText(/Prezzo di vendita e IVA/);
    await waitFor(() => expect(potenzaMostrata()).toContain("5.40"));
    const cursore = document.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(cursore, { target: { value: "16" } });
    await waitFor(() => expect(potenzaMostrata()).toContain("7.20"));
  });
});

/** Il patch che il calcolo della Fase 6 scrive sul progetto PRIMA di chiamare il server (sconto, prezzo a corpo, IVA, ombra). */
const patchPrimaDelCalcolo = () =>
  aggiorna.mock.calls.map((c) => (c[0] as { patch: Record<string, unknown> }).patch).find((p) => "prezzo_vendita_manuale" in p);

describe("Fase 6: riaprendo il progetto il calcolo che parte da solo non cancella sconto e prezzo a corpo", () => {
  it("lo sconto del 7% salvato torna nel patch, non null (la bozza del browser lo porta)", async () => {
    stato.progetto = riga({ sconto_tipo: "pct", sconto_valore: 7 });
    apriAllaFase(6, { sconto_tipo: "pct", sconto_valore: 7 });
    monta();
    await arrivaAllaFase6();
    await waitFor(() => expect(patchPrimaDelCalcolo()).toBeDefined());
    expect(patchPrimaDelCalcolo()).toMatchObject({ sconto_tipo: "pct", sconto_valore: 7, prezzo_vendita_manuale: null });
  });

  it("il prezzo a corpo di 9.000 € salvato torna nel patch, non null (altrimenti il preventivo si ricalcola dal listino)", async () => {
    stato.progetto = riga({ prezzo_vendita_manuale: 9000 });
    apriAllaFase(6, { prezzo_vendita_manuale: 9000 });
    monta();
    await arrivaAllaFase6();
    await waitFor(() => expect(patchPrimaDelCalcolo()).toBeDefined());
    expect(patchPrimaDelCalcolo()).toMatchObject({ prezzo_vendita_manuale: 9000 });
  });
});

describe("Fase 6: riaprire un progetto ripristina la scelta di finanziamento, la durata e la tabella", () => {
  const PAGAMENTO: { tranche: Array<{ label: string; pct: number }>; note: string | null; anticipo_pct: number } = { tranche: [{ label: "Saldo", pct: 100 }], note: null, anticipo_pct: 0 };
  /** La riga del riquadro grande della rata: titolo e sottotitolo con modalità, durata, finanziaria. */
  const riquadroRata = (titolo: string) => screen.getByText(titolo).parentElement?.textContent ?? "";

  it("tasso zero in 60 mesi (la bozza del browser dice «rate, 84 mesi»: vince quello salvato)", async () => {
    stato.progetto = riga({ scenario_finanziamento: "zero", finanziamento_durata_mesi: 60, modalita_pagamento: PAGAMENTO });
    apriAllaFase(6);
    monta();
    await arrivaAllaFase6();
    await waitFor(() => expect(riquadroRata("Rata mensile (tasso 0%)")).toContain("Tasso 0% · 60 mesi"));
  });

  it("rate con la tabella della finanziaria scelta, in 60 mesi: la tessera dice finanziaria, durata e TAEG di QUELLA tabella", async () => {
    stato.tabelle = [{ id: "t-fin", finanziaria_nome: "Findomestic" }, { id: "t-altra", finanziaria_nome: "Compass" }];
    const rata = (importo: number, taeg: number, tan: number): Record<string, unknown> => ({
      id: "r", tabella_id: "t", importo_erogato: 12100, durata_mesi: 60, numero_rate: 60, importo_rata: importo, tan, taeg,
      importo_totale_dovuto: importo * 60, spese_istruttoria: null, spese_incasso_rata: null, interessi_cliente: null,
    });
    stato.top = [
      { id: "t-altra", finanziaria_nome: "Compass", rata: rata(120, 4.2, 3.9) },
      { id: "t-fin", finanziaria_nome: "Findomestic", rata: rata(150, 6.1, 5.7) },
    ];
    stato.progetto = riga({ scenario_finanziamento: "rate", finanziamento_durata_mesi: 60, finanziamento_tabella_id: "t-fin", modalita_pagamento: PAGAMENTO });
    apriAllaFase(6);
    monta();
    await arrivaAllaFase6();
    await waitFor(() => expect(riquadroRata("Rata mensile finanziata")).toContain("Findomestic · 60 mesi · TAEG 6.10%"));
    // la rata è quella della tabella scelta (150), non quella della «top consigliata» (120)
    expect(riquadroRata("Rata mensile finanziata")).toContain("€ 150");
  });

  it("noleggio in 36 mesi per una PMI: il canone è «Canone operativo» su 36 mesi", async () => {
    stato.progetto = riga({ archetipo: "pmi", scenario_finanziamento: "noleggio", finanziamento_durata_mesi: 36, modalita_pagamento: PAGAMENTO });
    apriAllaFase(6);
    monta();
    await arrivaAllaFase6();
    await waitFor(() => expect(riquadroRata("Canone operativo")).toContain("Noleggio operativo · 36 mesi"));
  });
});

describe("Fase 6: se il calcolo del server risponde con un errore si legge il messaggio vero, in italiano", () => {
  /** Come lo dà supabase-js per una risposta non 2xx: `message` è la frase inglese generica, il messaggio vero sta nel corpo (`context.json()`). */
  const rispostaNon2xx = (corpo: () => Promise<unknown>) =>
    Object.assign(new Error("Edge Function returned a non-2xx status code"), { context: { json: corpo } });
  const calcoloInErrore = (errore: unknown) =>
    invoca.mockImplementation(async (nome: string) => (nome === "fv-calcolo-finanziario" ? { data: null, error: errore } : { data: null, error: null }));

  it("il messaggio del server (nel corpo della risposta) arriva a chi compila, sia nel riquadro sia nell'avviso", async () => {
    calcoloInErrore(rispostaNon2xx(async () => ({ error: "Progetto non trovato" })));
    apriAllaFase(6);
    monta();
    expect(await screen.findByText("Progetto non trovato")).toBeTruthy();
    expect(screen.queryByText(/non-2xx/)).toBeNull();
    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Calcolo finanziario fallito: Progetto non trovato"));
  });

  it("se il corpo non si legge, la frase generica inglese diventa una frase italiana", async () => {
    calcoloInErrore(rispostaNon2xx(async () => { throw new SyntaxError("Unexpected token < in JSON"); }));
    apriAllaFase(6);
    monta();
    expect(await screen.findByText("Il server ha risposto con un errore. Riprova fra qualche istante.")).toBeTruthy();
    expect(vi.mocked(toast.error).mock.calls.flat().join(" ")).not.toMatch(/non-2xx/);
  });

  it("senza rete (supabase-js non arriva al server) il messaggio dice di controllare la connessione", async () => {
    calcoloInErrore(new Error("Failed to send a request to the Edge Function"));
    apriAllaFase(6);
    monta();
    expect(await screen.findByText("Il server non risponde: controlla la connessione e riprova.")).toBeTruthy();
  });
});
