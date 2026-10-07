/**
 * La detrazione nel wizard Serramenti, con lo step Economia VERO dentro il wizard vero (06/10/2026).
 *
 * La detrazione scritta sul preventivo (`detrazione_aliquota`, `detrazione_eur_totale`, `detrazione_eur_anno`) l'ha
 * tenuta allineata al totale, in ogni passo, il wizard (`detrazioneDelPreventivo` / `detrazioneCambiata`); lo step
 * Economia faceva lo stesso mentre era aperto. Due scrittori sullo stesso dato: con Economia aperta e la detrazione
 * rimasta indietro scrivevano tutti e due (e lo step riscriveva anche l'aliquota, uguale a quella già scritta).
 * Ora lo step scrive solo ciò che il wizard non può sapere (l'aliquota scelta, l'interruttore, il valore di partenza
 * di un preventivo che non l'ha mai avuta) e gli importi che seguono il totale li scrive il wizard, una volta sola.
 *
 * Qui si contano le scritture vere (ogni `onChange` del wizard passa da `segnaModifica`) e si guarda cosa parte
 * per il salvataggio.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SrAccessorioRow, SrProgettoDetail, SrProgettoRow, SrSerramentoRow, SrServizioRow } from "@/types/serramenti";
import { calcolaEcobonus } from "@/lib/serramenti/ecobonus";

vi.setConfig({ testTimeout: 30_000 });

const { stato, aggiornamenti } = vi.hoisted(() => ({
  stato: {
    detail: null as unknown as SrProgettoDetail,
    permessi: { canApproveDiscounts: false, canViewMargins: false, canViewCosts: false },
  },
  aggiornamenti: [] as Array<Record<string, unknown>>,
}));

vi.mock("react-router-dom", () => ({ useParams: () => ({ id: "p1" }), useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams(), vi.fn()] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, effectiveCompany: { id: "c1", name: "Bianchi Infissi" } }) }));
vi.mock("@/integrations/supabase/client", () => {
  // Ogni lettura risponde con una lista vuota: niente richieste di approvazione, niente costi di listino.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catena: any = new Proxy({}, {
    get: (_t, p) => p === "then"
      ? (ok: (v: unknown) => unknown) => Promise.resolve({ data: [] as unknown[], error: null as null }).then(ok)
      : p === "maybeSingle" ? () => Promise.resolve({ data: null as null, error: null as null })
      : () => catena,
  });
  return { supabase: { from: () => catena } };
});
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => stato.permessi }));
vi.mock("@/hooks/useDiscountRules", () => ({ useDiscountRules: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/usePrezzoFinaleAMano", () => ({ usePrezzoFinaleAMano: () => ({ data: false, isLoading: false, isError: false }) }));
vi.mock("@/hooks/useFamilies", () => ({ useFamilies: () => ({ families: [] as unknown[], isLoading: false }) }));
vi.mock("@/hooks/useTabelleFinanziamento", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useTabelleFinanziamento")>()),
  useTabelleFinanziamentoAttive: () => ({ data: [] as unknown[], isLoading: false }),
  useTabellaFinanziamentoRighe: () => ({ data: [] as unknown[], isLoading: false }),
}));
vi.mock("@/hooks/useSerramentiModelSupport", () => ({ useSerramentiModelSupport: () => ({ supported: true, isLoading: false }) }));
vi.mock("@/hooks/useSerramentoPDF", () => ({ useSerramentoPDF: () => ({ previewPDF: vi.fn(), isGenerating: false }) }));
vi.mock("@/lib/serramenti/queries", () => ({
  useProgetto: () => ({ data: stato.detail, isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateProgetto: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateProgetto: () => ({
    mutateAsync: (patch: Record<string, unknown>) => { aggiornamenti.push(patch); return Promise.resolve({}); },
    isPending: false,
  }),
  useDuplicaProgetto: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTemplatePdf: () => ({ data: null as null, isLoading: false, isError: false }),
  useAziendaPerPdf: () => ({ data: { ragione_sociale: "Bianchi Infissi S.r.l." } }),
  useTariffeManodopera: () => ({ data: [] as unknown[] }),
}));
vi.mock("@/lib/serramenti/useCostoPosizioneListino", () => ({ useCostoPosizioneListino: () => ({ costoPosizione: (): null => null, inCaricamento: false }) }));
// Ogni scrittura del wizard (`onChange`) passa da qui: si contano.
vi.mock("@/lib/serramenti/modificheInSospeso", async (importOriginal) => {
  const originale = await importOriginal<typeof import("@/lib/serramenti/modificheInSospeso")>();
  return { ...originale, segnaModifica: vi.fn(originale.segnaModifica) };
});
vi.mock("@/components/serramenti/StepBom", () => ({ StepBom: () => <p>contenuto del passo Composizione</p> }));
vi.mock("@/components/serramenti/StepAccessori", () => ({ StepAccessori: () => <p>contenuto Foto</p> }));
vi.mock("@/components/serramenti/StepConsulenza", () => ({ StepConsulenza: (): null => null }));
vi.mock("@/components/serramenti/StepPdf", () => ({ StepPdf: () => <p>contenuto PDF</p> }));
vi.mock("@/components/serramenti/StepContenuti", () => ({ StepContenuti: (): null => null }));
vi.mock("@/components/serramenti/ContactPickerDialog", () => ({ ContactPickerDialog: (): null => null }));
vi.mock("@/components/serramenti/AiSerramentiDraftLauncher", () => ({ AiSerramentiDraftLauncher: (): null => null }));
vi.mock("@/components/serramenti/AnteprimaPdfLive", () => ({ AnteprimaPdfLive: () => <p>PDF vero segnaposto</p> }));

import SerramentiWizard from "@/pages/azienda/serramenti/SerramentiWizard";
import { segnaModifica } from "@/lib/serramenti/modificheInSospeso";

/** Serramenti 5.000, complemento 1.200, servizio 800: 7.000 di voci. IVA 10% → 7.700. */
const finestra = { id: "s1", tipologia: "finestra_2ante", quantita: 1, prezzo_unitario: 5000, prezzo_totale: 5000, larghezza_mm: 1000, altezza_mm: 1000, position: 0, family_id: null, listino_voce_id: null, posa_esclusa: false } as unknown as SrSerramentoRow;
const complemento = { id: "a1", tipo: "zanzariera", quantita: 1, prezzo_unitario: 1200, prezzo_totale: 1200, position: 0 } as unknown as SrAccessorioRow;
const servizio = { id: "m1", descrizione: "Trasporto", quantita: 1, prezzo_unitario_vendita: 800, prezzo_totale_vendita: 800, position: 0 } as unknown as SrServizioRow;

/** La detrazione giusta per 7.700 € al 50%: 3.850 in tutto, 385 all'anno. */
const GIUSTA = calcolaEcobonus({ imponibile_eur: 7700, aliquota: 50 });
const ALLINEATA = { detrazione_aliquota: 50, detrazione_eur_totale: GIUSTA.detrazione_totale, detrazione_eur_anno: GIUSTA.rata_annuale };
/** Quella di un totale di 11.000 €, rimasta indietro. */
const INDIETRO = { detrazione_aliquota: 50, detrazione_eur_totale: 5500, detrazione_eur_anno: 550 };

const preventivo = (extra: Partial<SrProgettoRow> = {}): SrProgettoDetail => ({
  progetto: {
    id: "p1", company_id: "c1", code: "SR-2026-0412", stato: "bozza", revision_number: 1, parent_id: null, updated_at: "2026-10-05T09:24:00Z",
    cliente_nome: "Mario", cliente_cognome: "Rossi", tipo_intervento: "sostituzione", intervento_titolo: null, modello_snapshot: null,
    iva_percentuale: 10, sconto_percentuale: 0, sconto_importo: 0, prezzo_manuale: null,
    totale_min: 7700, totale_max: 7700, totale_serramenti: 1, totale_accessori: 1, metri_quadri_totali: 1,
    ...extra,
  } as unknown as SrProgettoRow,
  serramenti: [finestra], accessori: [complemento], media: [], risparmio: null, servizi: [servizio],
});

const monta = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SerramentiWizard /></QueryClientProvider>);
/** Il passo Economia aperto e lasciato girare: gli effetti, i timer a zero ms del wizard e quelli che ne seguono. */
const apriEconomia = async () => {
  const nav = await screen.findByRole("navigation", { name: "Fasi del preventivo" });
  fireEvent.click(within(nav).getByRole("button", { name: "Economia" }));
  await screen.findByText("Come paga il cliente");
  await lasciaGirare();
};
const lasciaGirare = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

/** Le scritture di un campo, in ordine: [valore, valore, ...]. */
const scritto = (campo: string) => vi.mocked(segnaModifica).mock.calls.filter(([, c]) => c === campo).map(([, , valore]) => valore);
const CAMPI_DETRAZIONE = ["detrazione_aliquota", "detrazione_eur_totale", "detrazione_eur_anno"];
const scrittureDetrazione = () => Object.fromEntries(CAMPI_DETRAZIONE.map((c) => [c, scritto(c)]));

beforeAll(() => {
  // La tendina di Radix (Select) in jsdom: i metodi del puntatore e lo scroll non ci sono.
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= (): boolean => false;
  proto.setPointerCapture ??= (): void => undefined;
  proto.releasePointerCapture ??= (): void => undefined;
  proto.scrollIntoView ??= (): void => undefined;
});

beforeEach(() => {
  stato.detail = preventivo(ALLINEATA);
  stato.permessi = { canApproveDiscounts: false, canViewMargins: false, canViewCosts: false };
  aggiornamenti.length = 0;
  vi.mocked(segnaModifica).mockClear();
  localStorage.clear();
});
afterEach(() => cleanup());

describe("la detrazione ha un solo scrittore per gli importi: il wizard", () => {
  it("allineata al totale: aprendo Economia non si scrive niente (né l'aliquota, né gli importi)", async () => {
    const { unmount } = monta();
    await apriEconomia();
    await lasciaGirare();
    expect(vi.mocked(segnaModifica).mock.calls).toEqual([]);
    unmount();
    await lasciaGirare();
    expect(aggiornamenti).toEqual([]);
  });

  it("rimasta indietro (totale salito da 5.500 a 7.700) con Economia aperta: UNA scrittura per importo e nient'altro, l'aliquota non si riscrive", async () => {
    stato.detail = preventivo(INDIETRO);
    const { unmount } = monta();
    await apriEconomia();
    await lasciaGirare();
    expect(scrittureDetrazione()).toEqual({
      detrazione_aliquota: [],
      detrazione_eur_totale: [GIUSTA.detrazione_totale],
      detrazione_eur_anno: [GIUSTA.rata_annuale],
    });
    expect(vi.mocked(segnaModifica).mock.calls).toHaveLength(2);
    unmount();
    await lasciaGirare();
    // ... e parte per il salvataggio una volta sola, con i soli due importi
    expect(aggiornamenti).toHaveLength(1);
    expect(Object.keys(aggiornamenti[0]).sort()).toEqual(["detrazione_eur_anno", "detrazione_eur_totale"]);
    expect(aggiornamenti[0]).toMatchObject({ detrazione_eur_totale: 3850, detrazione_eur_anno: 385 });
  });

  it("lo stesso fuori da Economia (il wizard la riallinea in ogni passo): gli stessi importi, scritti una volta", async () => {
    stato.detail = preventivo(INDIETRO);
    monta();
    await screen.findByRole("navigation", { name: "Fasi del preventivo" });
    await lasciaGirare();
    expect(scrittureDetrazione()).toEqual({
      detrazione_aliquota: [],
      detrazione_eur_totale: [GIUSTA.detrazione_totale],
      detrazione_eur_anno: [GIUSTA.rata_annuale],
    });
    // aprire Economia dopo non aggiunge scritture: sono già giusti
    await apriEconomia();
    await lasciaGirare();
    expect(vi.mocked(segnaModifica).mock.calls).toHaveLength(2);
  });

  it("il prezzo cambia con Economia aperta (sconto 10%): il totale e la detrazione si riscrivono UNA volta, l'aliquota no", async () => {
    stato.permessi = { canApproveDiscounts: true, canViewMargins: false, canViewCosts: false };
    monta();
    await apriEconomia();
    expect(vi.mocked(segnaModifica).mock.calls).toEqual([]);
    const dieci = within(screen.getByRole("group", { name: "Sconto veloce" })).getByRole("button", { name: "10%" });
    fireEvent.click(dieci);
    await lasciaGirare();
    await lasciaGirare();
    // 7.000 − 10% = 6.300; + IVA 10% = 6.930; detrazione 50% = 3.465, 346,5 all'anno
    expect(scritto("sconto_percentuale")).toEqual([10]);
    expect(scritto("totale_max")).toEqual([6930]);
    expect(scrittureDetrazione()).toEqual({
      detrazione_aliquota: [],
      detrazione_eur_totale: [3465],
      detrazione_eur_anno: [346.5],
    });
  });
});

describe("quello che lo step scrive da sé: ciò che il wizard non può sapere", () => {
  it("preventivo che non ha mai avuto la detrazione (aliquota vuota): lo step, che la mostra accesa al 50%, la scrive; il wizard non aggiunge niente", async () => {
    stato.detail = preventivo({ detrazione_aliquota: null, detrazione_eur_totale: null, detrazione_eur_anno: null });
    monta();
    // Prima di Economia il wizard non inventa niente
    await screen.findByRole("navigation", { name: "Fasi del preventivo" });
    await lasciaGirare();
    expect(vi.mocked(segnaModifica).mock.calls).toEqual([]);
    await apriEconomia();
    await lasciaGirare();
    expect(scrittureDetrazione()).toEqual({
      detrazione_aliquota: [50],
      detrazione_eur_totale: [GIUSTA.detrazione_totale],
      detrazione_eur_anno: [GIUSTA.rata_annuale],
    });
  });

  it("l'interruttore spento scrive l'aliquota 0 (esclusa) e nient'altro: il wizard non riscrive niente", async () => {
    monta();
    await apriEconomia();
    fireEvent.click(screen.getAllByRole("switch")[0]);
    await lasciaGirare();
    await lasciaGirare();
    expect(scrittureDetrazione()).toEqual({ detrazione_aliquota: [0], detrazione_eur_totale: [], detrazione_eur_anno: [] });
  });

  it("un'altra aliquota (36%) scrive aliquota e importi giusti, una volta; il wizard poi non riscrive niente", async () => {
    monta();
    await apriEconomia();
    // la tendina dell'aliquota non ha un'etichetta propria: è quella che dice «Prima casa 50%»
    const tendina = screen.getAllByRole("combobox").find((c) => /Prima casa/.test(c.textContent ?? "")) as HTMLElement;
    fireEvent.pointerDown(tendina, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(await screen.findByRole("option", { name: /36%/ }));
    await lasciaGirare();
    await lasciaGirare();
    const al36 = calcolaEcobonus({ imponibile_eur: 7700, aliquota: 36 });
    expect(scrittureDetrazione()).toEqual({
      detrazione_aliquota: [36],
      detrazione_eur_totale: [al36.detrazione_totale],
      detrazione_eur_anno: [al36.rata_annuale],
    });
  });

  it("un'aliquota di prima non più proponibile (65%) con gli importi indietro: lo step mostra e scrive il 50%, il wizard segue, e finisce lì senza rimbalzi", async () => {
    stato.detail = preventivo({ detrazione_aliquota: 65, detrazione_eur_totale: 7150, detrazione_eur_anno: 715 });
    monta();
    await apriEconomia();
    await lasciaGirare();
    await lasciaGirare();
    expect(scritto("detrazione_aliquota")).toEqual([50]);
    // l'ultimo valore scritto di ogni importo è quello del 50% sul totale di adesso, e non si rimbalza all'infinito
    expect(scritto("detrazione_eur_totale").at(-1)).toBe(GIUSTA.detrazione_totale);
    expect(scritto("detrazione_eur_anno").at(-1)).toBe(GIUSTA.rata_annuale);
    expect(scritto("detrazione_eur_totale").length).toBeLessThanOrEqual(2);
    expect(scritto("detrazione_eur_anno").length).toBeLessThanOrEqual(2);
    const prima = vi.mocked(segnaModifica).mock.calls.length;
    await lasciaGirare();
    await lasciaGirare();
    expect(vi.mocked(segnaModifica).mock.calls.length).toBe(prima);
  });
});
