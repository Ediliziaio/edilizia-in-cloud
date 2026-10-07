/**
 * Il passo Economia del preventivatore Serramenti (06/10/2026): prima il prezzo e poi come paga il cliente, con
 * risparmio e recupero come extra richiudibili; meno spazio sprecato; il pagamento compatto, con le rate e il
 * finanziamento che si scrivono da soli (niente «Applica calcoli»); lo sconto veloce che non aggira
 * l'approvazione; lo stato vuoto onesto. Il componente vero (StepEconomia), con i dati e i permessi finti scelti
 * dal test: quello che l'utente tocca arriva al preventivo come `onChange(campo, valore)`, e qui si leggono
 * quelle scritture.
 */
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SrAccessorioRow, SrProgettoDetail, SrProgettoRow, SrSerramentoRow, SrWizardStep } from "@/types/serramenti";
import type { DiscountRule } from "@/hooks/useDiscountRules";
import type { RigaFinanziamento, TabellaFinanziamento } from "@/hooks/useTabelleFinanziamento";
import { IVA_MISTA_SENTINEL } from "@/lib/serramenti/calcoli";
import { calcolaEcobonus } from "@/lib/serramenti/ecobonus";
import { formatCurrency } from "@/lib/formatters";
import { paybackAtteso } from "@/lib/serramenti/risparmioPreventivo";
import { PIANO_MANUALE_DI_SERIE, pianiManuali } from "@/lib/serramenti/pianoFinanziamento";

// Il primo test importa lo step (e il suo mondo): sotto carico supera i 5 secondi di partenza.
vi.setConfig({ testTimeout: 30_000 });

const stato = vi.hoisted(() => ({
  permessi: { canApproveDiscounts: false, canViewMargins: false, canViewCosts: false },
  regole: [] as unknown[],
  prezzoAMano: false,
  /** Cosa risponde il database finto, tabella per tabella (di serie: nessuna riga). */
  database: {} as Record<string, unknown[]>,
  /** Le tabelle attive della finanziaria e le loro righe (per id di tabella). */
  tabelle: [] as unknown[],
  righe: {} as Record<string, unknown[]>,
  scritture: [] as Array<[string, unknown]>,
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => stato.permessi }));
vi.mock("@/hooks/useDiscountRules", () => ({ useDiscountRules: () => ({ data: stato.regole }) }));
vi.mock("@/hooks/usePrezzoFinaleAMano", () => ({
  usePrezzoFinaleAMano: () => ({ data: stato.prezzoAMano, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useFamilies", () => ({ useFamilies: () => ({ families: [] as unknown[], isLoading: false }) }));
vi.mock("@/lib/serramenti/queries", () => ({ useTariffeManodopera: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/useTabelleFinanziamento", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useTabelleFinanziamento")>()),
  useTabelleFinanziamentoAttive: () => ({ data: stato.tabelle, isLoading: false }),
  useTabellaFinanziamentoRighe: (id: string | null) => ({ data: id ? stato.righe[id] ?? [] : [], isLoading: false }),
}));
vi.mock("@/integrations/supabase/client", () => {
  // Ogni lettura risponde con le righe della tabella scelta dal test (di serie nessuna): niente richieste di
  // approvazione, niente costi di listino.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catena = (tabella: string): any => new Proxy({}, {
    get: (_t, p) => p === "then"
      ? (ok: (v: unknown) => unknown) => Promise.resolve({ data: stato.database[tabella] ?? [], error: null as null }).then(ok)
      : p === "maybeSingle" ? () => Promise.resolve({ data: (stato.database[tabella] ?? [])[0] ?? null, error: null as null })
      : () => catena(tabella),
  });
  return { supabase: { from: (tabella: string) => catena(tabella) } };
});

import { StepEconomia } from "@/components/serramenti/StepEconomia";

const PROGETTO = {
  id: "p1", company_id: "c1", code: "SR-2026-0001", created_at: "2026-10-01T09:00:00Z",
  iva_percentuale: 10, sconto_percentuale: 0, sconto_importo: 0, valido_fino_giorni: 15,
} as unknown as SrProgettoRow;

/** Quattro finestre da 2.500 € l'una: 10.000 € + IVA 10% = 11.000 €, cifre tonde per i conti a mente. */
const FINESTRE = {
  id: "s1", progetto_id: "p1", company_id: "c1", position: 1, tipologia: "finestra_2ante", quantita: 4,
  larghezza_mm: 1200, altezza_mm: 1400, metri_quadri: 6.72, prezzo_unitario: 2500, prezzo_totale: 10_000,
  family_id: null as string | null, listino_voce_id: null as string | null, posa_esclusa: false,
} as unknown as SrSerramentoRow;

const dettaglio = (extra: Partial<SrProgettoDetail> = {}): SrProgettoDetail => ({
  progetto: PROGETTO, serramenti: [FINESTRE], accessori: [], media: [], risparmio: null as null, servizi: [], ...extra,
});

const regola = (patch: Partial<DiscountRule>): DiscountRule => ({
  id: "r1", company_id: "c1", name: "Standard", scope: "globale", salesperson_id: null, client_category: null, tipo_lavoro: null,
  importo_min: null, importo_max: null, margine_min_pct: 20, sconto_max_pct: 10, approva_oltre_pct: 7.5, priority: 100,
  is_active: true, created_at: "2026-01-01", updated_at: "2026-01-01", ...patch,
});

const TABELLA = (id: string, nome: string, finanziaria = "Compass"): TabellaFinanziamento => ({
  id, company_id: "c1", finanziaria_id: "f1", finanziaria_nome: finanziaria, nome_prodotto: nome, codice_condizione: null as string | null,
  subtariffa_default: null as string | null, tan_base: 5.9, pdf_url: null as string | null, csv_url: null as string | null,
  data_decorrenza: null as string | null, data_scadenza: null as string | null, attiva: true,
});

/** Una tabella con quattro durate e tre fasce di importo (5.000, 8.000, 12.000): la rata cresce con la fascia. */
const RIGHE_TABELLA = (id: string): RigaFinanziamento[] =>
  [[24, 0.04584], [48, 0.0252], [60, 0.02], [84, 0.015]].flatMap(([durata, k]) =>
    [5000, 8000, 12000].map((fascia): RigaFinanziamento => ({
      id: `r-${durata}-${fascia}`, tabella_id: id, subtariffa: null as string | null, importo_erogato: fascia, spese_istruttoria: null as number | null,
      importo_totale_credito: null as number | null, numero_rate: durata, durata_mesi: durata, prima_rata_giorni: null as number | null,
      importo_rata: Math.round(fascia * k * 100) / 100, spese_incasso_rata: null as number | null, interessi_cliente: null as number | null,
      importo_totale_dovuto: Math.round(fascia * k * durata * 100) / 100, tan: 5.9, taeg: 6.45, icc: null as number | null,
    })));

const RATE_TRE_STEP = [
  { label: "Acconto alla firma", percentuale: 30, when: "Firma contratto" },
  { label: "Acconto arrivo merce", percentuale: 40, when: "Merce in magazzino" },
  { label: "Saldo", percentuale: 30, when: "Prima dei lavori" },
];
const RATE_FINANZIATO = [
  { label: "Acconto alla firma", percentuale: 30, when: "Firma contratto" },
  { label: "Finanziamento", percentuale: 70, when: "Erogato all'inizio lavori" },
];
/** Il piano che il preventivo di 11.000 € (anticipo 30%, 7.700 da finanziare) ha scritto per la riga 48 rate × fascia 8.000. */
const PIANO_48 = { nome: "Prestito Casa", mesi: 48, tasso: 5.9, rata_mese: 201.6, anticipo: 3300, finanziato: 7700 };
const ECO_11000 = calcolaEcobonus({ imponibile_eur: 11_000, aliquota: 50 });

/** Un preventivo già completo e coerente: rate, finanziamento da tabella, detrazione, risparmio (con un valore SUO, 600 €). */
const COMPLETO: Partial<SrProgettoRow> = {
  schema_pagamento: "acconto_finanziato",
  pagamento_milestones: RATE_FINANZIATO,
  fin_anticipo_pct: 30, fin_tabella_id: "t1", fin_tabella_riga_id: "r-48-8000", fin_piani: [PIANO_48],
  detrazione_aliquota: 50, detrazione_eur_totale: ECO_11000.detrazione_totale, detrazione_eur_anno: ECO_11000.rata_annuale,
  risparmio_calcolato: true, risparmio_eur_anno: 600, co2_risparmiata_t_anno: 1.2,
  payback_anni: paybackAtteso({ totale: 11_000, risparmioEurAnno: 600, detrazioneEurAnno: ECO_11000.rata_annuale }),
};

/** Come il wizard: le scritture arrivano al modulo e lo step si ridisegna col valore nuovo. */
function Ospite({ iniziale, dett, onVai }: {
  iniziale: Partial<SrProgettoRow>;
  dett: SrProgettoDetail;
  onVai?: (passo: SrWizardStep) => void;
}) {
  const [form, setForm] = useState<Partial<SrProgettoRow>>(iniziale);
  return (
    <StepEconomia
      progettoId="p1"
      detail={dett}
      form={form}
      onChange={(campo, valore) => { stato.scritture.push([campo as string, valore]); setForm((f) => ({ ...f, [campo]: valore })); }}
      onVaiAlPasso={onVai}
    />
  );
}

const monta = (iniziale: Partial<SrProgettoRow> = {}, dett: SrProgettoDetail = dettaglio(), onVai?: (passo: SrWizardStep) => void) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const radice = (d: SrProgettoDetail) => (
    <QueryClientProvider client={client}>
      <Ospite iniziale={{ ...PROGETTO, ...iniziale }} dett={d} onVai={onVai} />
    </QueryClientProvider>
  );
  const resa = render(radice(dett));
  /** Lo stesso preventivo aperto con altre righe: cambia il totale, non quello che l'utente ha scritto. */
  return { ...resa, conRighe: (d: SrProgettoDetail) => resa.rerender(radice(d)) };
};

/** Le finestre allo stesso numero ma a un prezzo diverso: il totale del preventivo cambia. */
const conPrezzo = (prezzoTotale: number): SrProgettoDetail =>
  dettaglio({ serramenti: [{ ...FINESTRE, prezzo_unitario: prezzoTotale / 4, prezzo_totale: prezzoTotale } as SrSerramentoRow] });

/** Le scritture di un campo, dall'ultima. */
const scritto = (campo: string) => stato.scritture.filter(([c]) => c === campo).map(([, v]) => v);
const ultimo = (campo: string) => scritto(campo).at(-1);

beforeAll(() => {
  // La tendina di Radix (Select) in jsdom: i metodi del puntatore e lo scroll non ci sono.
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= (): boolean => false;
  proto.setPointerCapture ??= (): void => undefined;
  proto.releasePointerCapture ??= (): void => undefined;
  proto.scrollIntoView ??= (): void => undefined;
});

beforeEach(() => {
  stato.permessi = { canApproveDiscounts: false, canViewMargins: false, canViewCosts: false };
  stato.regole = [];
  stato.prezzoAMano = false;
  stato.database = {};
  stato.tabelle = [];
  stato.righe = {};
  stato.scritture = [];
  localStorage.clear();
});
afterEach(() => cleanup());

/** `a` viene prima di `b` nella pagina. */
const prima = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const titolo = (nome: string | RegExp) => screen.getByRole("heading", { name: nome });
const extra = (nome: RegExp) => screen.getByRole("button", { name: nome });
const apri = (nome: RegExp) => fireEvent.click(extra(nome));

describe("1. l'ordine: prima il prezzo, poi come paga il cliente, poi la detrazione; gli extra in fondo", () => {
  it("le schede stanno nell'ordine prezzo → come paga → detrazione → extra", () => {
    monta();
    const prezzo = titolo(/Totale preventivo \(PDF cliente\)/);
    const paga = titolo("Come paga il cliente");
    const detrazione = titolo(/Detrazione fiscale/);
    const risparmio = extra(/Risparmio energetico/);
    expect(prima(prezzo, paga)).toBe(true);
    expect(prima(paga, detrazione)).toBe(true);
    expect(prima(detrazione, risparmio)).toBe(true);
    // E dentro il prezzo ci sono sconto, IVA e validità dell'offerta.
    const scheda = prezzo.closest("div.rounded-lg") as HTMLElement;
    expect(within(scheda).getByText("Sconto %")).toBeTruthy();
    expect(within(scheda).getByText("IVA")).toBeTruthy();
    expect(within(scheda).getByText("Validità (giorni)")).toBeTruthy();
  });

  it("risparmio energetico è chiuso di serie: i suoi campi non ci sono, un clic li apre e un altro li chiude", () => {
    monta();
    const risparmio = extra(/Risparmio energetico/);
    expect(risparmio.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Calcola risparmio in bolletta")).toBeNull();
    fireEvent.click(risparmio);
    expect(risparmio.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Calcola risparmio in bolletta")).toBeTruthy();
    fireEvent.click(risparmio);
    expect(screen.queryByText("Calcola risparmio in bolletta")).toBeNull();
  });

  it("il recupero in 10 anni c'è solo col risparmio acceso, è chiuso di serie e si apre con un clic", () => {
    monta();
    expect(screen.queryByRole("button", { name: /Recupero/ })).toBeNull();

    cleanup();
    monta({ risparmio_calcolato: true });
    const recupero = extra(/Recupero/);
    expect(recupero.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Recuperato in 10 anni")).toBeNull();
    fireEvent.click(recupero);
    expect(screen.getByText("Recuperato in 10 anni")).toBeTruthy();
  });

  it("col risparmio attivo nel preventivo, da chiuso lo dice, e chiudere non cancella quello che si era scritto", () => {
    monta({ risparmio_calcolato: true });
    const risparmio = extra(/Risparmio energetico/);
    expect(risparmio.textContent).toMatch(/Attivo/);
    expect(risparmio.textContent).toMatch(/€\s?\d+\/anno/);

    fireEvent.click(risparmio);
    fireEvent.change(screen.getByDisplayValue("2.8"), { target: { value: "3.4" } });
    fireEvent.click(risparmio); // chiude
    fireEvent.click(risparmio); // riapre
    expect(screen.getByDisplayValue("3.4")).toBeTruthy();
    // L'interruttore del risparmio (l'ultimo della pagina) è rimasto acceso.
    expect(screen.getAllByRole("switch").at(-1)?.getAttribute("aria-checked")).toBe("true");
  });

  it("aprire e chiudere gli extra non scrive niente: il preventivo con il risparmio acceso resta com'è, e il PDF pure", () => {
    stato.tabelle = [TABELLA("t1", "Prestito Casa")];
    stato.righe = { t1: RIGHE_TABELLA("t1") };
    monta(COMPLETO);
    expect(stato.scritture).toEqual([]);
    apri(/Risparmio energetico/);
    apri(/Recupero/);
    fireEvent.click(extra(/Risparmio energetico/));
    fireEvent.click(extra(/Recupero/));
    expect(stato.scritture).toEqual([]);
  });

  it("senza il pulsante «Applica calcoli al progetto»: tutto quello che il pulsante scriveva si scrive da solo", () => {
    monta();
    expect(screen.queryByRole("button", { name: /Applica calcoli/ })).toBeNull();
  });
});

describe("2. meno spazio sprecato", () => {
  const schedaPrezzo = () => titolo(/Totale preventivo \(PDF cliente\)/).closest("div.rounded-lg") as HTMLElement;

  describe("il prezzo manuale, quando è inerte, non occupa spazio", () => {
    it("spento e senza prezzo scritto: niente riquadro, niente tratteggio che spiega una funzione spenta", () => {
      stato.prezzoAMano = false;
      monta();
      expect(screen.queryByText(/Prezzo manuale dell'offerta/)).toBeNull();
      expect(screen.queryByText(/Disponibile quando l'azienda abilita/)).toBeNull();
      expect(schedaPrezzo().querySelector(".border-dashed")).toBeNull();
      // il contenitore resta vuoto e si nasconde: nessuna riga vuota nella griglia
      const contenitore = schedaPrezzo().querySelector("div.empty\\:hidden") as HTMLElement;
      expect(contenitore).not.toBeNull();
      expect(contenitore.matches(":empty")).toBe(true);
    });

    it("acceso dall'azienda: il campo c'è", () => {
      stato.prezzoAMano = true;
      monta();
      expect(screen.getByLabelText(/Prezzo manuale dell'offerta/)).toBeTruthy();
    });

    it("spento ma con un prezzo già scritto: il campo c'è, così lo si può togliere", () => {
      stato.prezzoAMano = false;
      monta({ prezzo_manuale: 5000 });
      expect((screen.getByLabelText(/Prezzo manuale dell'offerta/) as HTMLInputElement).value).toBe("5000");
    });
  });

  describe("le regole di scontistica sono una riga sola", () => {
    it("massimo, soglia di approvazione e margine minimo stanno in un solo elemento, con il link per configurarle", () => {
      stato.regole = [regola({})];
      monta();
      const riga = screen.getByText("Regole sconti").parentElement as HTMLElement;
      expect(riga.textContent).toMatch(/max\s*10,0%/);
      expect(riga.textContent).toMatch(/approvazione oltre\s*7,5%/);
      expect(riga.textContent).toMatch(/margine min\s*20,0%/);
      expect(within(riga).getByRole("link", { name: /Configura regole/ }).getAttribute("href")).toBe("/azienda/impostazioni/scontistica");
      // le scatole di prima non ci sono più
      expect(screen.queryByText("Sconto max")).toBeNull();
      expect(screen.queryByText("Approva oltre")).toBeNull();
      expect(screen.queryByText(/Applicate:/)).toBeNull();
      // i nomi delle regole restano nel suggerimento
      expect(riga.getAttribute("title")).toMatch(/Applicate: Standard/);
    });

    it("senza nessuna regola dice che vale il massimo predefinito, sempre in una riga", () => {
      stato.regole = [];
      monta();
      const riga = screen.getByText("Regole sconti").parentElement as HTMLElement;
      expect(riga.textContent).toMatch(/nessuna regola configurata: massimo 10,0%/);
    });

    it("telefono no, come prima: la riga è nascosta sotto i 768 px", () => {
      stato.regole = [regola({})];
      monta();
      expect((screen.getByText("Regole sconti").parentElement as HTMLElement).className).toMatch(/max-md:hidden/);
    });
  });

  describe("il margine è una riga sola, e lo vede solo chi lo vedeva prima", () => {
    const conCosti = (prezzoAcquisto: number) => {
      stato.database = { listino_griglia: [{ id: "g1", prezzo_acquisto: prezzoAcquisto, supplier_product_line_id: null }] };
      return dettaglio({ serramenti: [{ ...FINESTRE, listino_voce_id: "g1" } as SrSerramentoRow] });
    };

    it("senza permesso su margini e costi non c'è niente", () => {
      stato.permessi = { canApproveDiscounts: true, canViewMargins: false, canViewCosts: false };
      monta({}, conCosti(1500));
      expect(screen.queryByText(/Margine \(interno\)/)).toBeNull();
    });

    it("col permesso: costo, vendita, margine € e % in un solo elemento, senza le scatole di prima", async () => {
      stato.permessi = { canApproveDiscounts: false, canViewMargins: true, canViewCosts: false };
      monta({}, conCosti(1500)); // 4 finestre × 1.500 = 6.000 di costo su 10.000 di vendita
      const riga = (await screen.findByText(/Margine \(interno\)/)).parentElement as HTMLElement;
      await vi.waitFor(() => expect(riga.textContent).toMatch(/costo\s*€\s*6\.000/));
      expect(riga.textContent).toMatch(/vendita\s*€\s*10\.000/);
      expect(riga.textContent).toMatch(/€\s*4\.000\s*\(40,0%\)/);
      expect(riga.textContent).not.toMatch(/Sotto target|Costi incompleti/);
      expect(screen.queryByText("Costo acquisto netto")).toBeNull();
      expect(screen.queryByText("Imponibile vendita")).toBeNull();
      expect(screen.queryByText(/Il margine è calcolato su valori netti/)).toBeNull(); // lo dice il suggerimento
    });

    it("sotto il target della regola lo dice nella stessa riga", async () => {
      stato.permessi = { canApproveDiscounts: false, canViewMargins: true, canViewCosts: false };
      stato.regole = [regola({ margine_min_pct: 20 })];
      monta({}, conCosti(2200)); // costo 8.800: margine 1.200 = 12%
      const riga = (await screen.findByText(/Margine \(interno\)/)).parentElement as HTMLElement;
      await vi.waitFor(() => expect(riga.textContent).toMatch(/Sotto target 20,0%/));
      expect(riga.textContent).toMatch(/\(12,0%\)/);
    });

    it("con i costi incompleti dice quante righe mancano, senza percentuali fuorvianti", async () => {
      stato.permessi = { canApproveDiscounts: false, canViewMargins: false, canViewCosts: true };
      monta(); // la finestra non ha nessun costo collegato
      const riga = (await screen.findByText(/Margine \(interno\)/)).parentElement as HTMLElement;
      expect(riga.textContent).toMatch(/Costi incompleti: mancano su 1 riga/);
      // niente cifra e niente percentuale: «parziale —» e subito il costo
      expect(riga.textContent).toMatch(/parziale\s*—\s*costo/);
    });

    it("telefono no, come prima: la riga è nascosta sotto i 768 px", async () => {
      stato.permessi = { canApproveDiscounts: false, canViewMargins: true, canViewCosts: false };
      monta({}, conCosti(1500));
      const riga = (await screen.findByText(/Margine \(interno\)/)).parentElement as HTMLElement;
      expect(riga.className).toMatch(/max-md:hidden/);
    });
  });
});

describe("3. il pagamento compatto: interruttore, rate con l'importo accanto, ultima rata che chiude il conto", () => {
  const rata = (n: number, campo: "Nome dello step" | "Percentuale dello step" | "Quando, step") =>
    screen.getByLabelText(`${campo} ${n}`) as HTMLInputElement;
  const percentuali = () => [1, 2, 3, 4, 5].flatMap((n) => {
    const campo = screen.queryByLabelText(`Percentuale dello step ${n}`) as HTMLInputElement | null;
    return campo ? [Number(campo.value)] : [];
  });
  const scriviPercentuale = (n: number, valore: string) =>
    fireEvent.change(rata(n, "Percentuale dello step"), { target: { value: valore } });
  const rateScritte = () => ultimo("pagamento_milestones") as Array<{ label: string; percentuale: number; when: string | null }>;
  const bonifico = () => screen.getByRole("button", { name: "Bonifico" });
  const finanziamento = () => screen.getByRole("button", { name: "Finanziamento" });
  const conTreStep = { schema_pagamento: "tre_step" as const, pagamento_milestones: RATE_TRE_STEP };

  describe("l'interruttore Bonifico / Finanziamento", () => {
    it("mostra la famiglia dello schema scritto nel preventivo, e le sue varianti", () => {
      monta(conTreStep);
      expect(bonifico().getAttribute("aria-pressed")).toBe("true");
      expect(finanziamento().getAttribute("aria-pressed")).toBe("false");
      expect(screen.getByRole("button", { name: /3 step/ }).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByRole("button", { name: "2 acconti + saldo" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Acconto + finanziato" })).toBeNull();
    });

    it("passare al finanziamento scrive lo schema di partenza e le sue rate, con la forma di sempre", () => {
      stato.tabelle = [TABELLA("t1", "Prestito Casa")];
      stato.righe = { t1: RIGHE_TABELLA("t1") };
      monta(conTreStep);
      fireEvent.click(finanziamento());
      expect(ultimo("schema_pagamento")).toBe("acconto_finanziato");
      expect(rateScritte()).toEqual(RATE_FINANZIATO);
      expect(Object.keys(rateScritte()[0]).sort()).toEqual(["label", "percentuale", "when"]);
      expect(finanziamento().getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByRole("button", { name: "Acconto + finanziato" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("tornare al bonifico toglie il piano di finanziamento dal preventivo: la pagina del cliente lo stampa se c'è", () => {
      stato.tabelle = [TABELLA("t1", "Prestito Casa")];
      stato.righe = { t1: RIGHE_TABELLA("t1") };
      monta(COMPLETO);
      fireEvent.click(bonifico());
      expect(ultimo("schema_pagamento")).toBe("tre_step");
      expect(ultimo("fin_piani")).toEqual([]);
      expect(ultimo("fin_tabella_riga_id")).toBeNull();
      expect(rateScritte()).toEqual(RATE_TRE_STEP);
      // E la simulazione sparisce dalla pagina.
      expect(screen.queryByText("Simulazione finanziamento")).toBeNull();
    });

    it("toccare la famiglia che è già quella non riscrive niente", () => {
      monta(conTreStep);
      fireEvent.click(bonifico());
      expect(stato.scritture.filter(([c]) => c === "schema_pagamento" || c === "pagamento_milestones")).toEqual([]);
    });
  });

  describe("nessuna scelta preselezionata: a schermo c'è solo quello che nel preventivo c'è davvero", () => {
    it("un preventivo senza rate né schema non mostra rate, né il finanziamento, e non scrive niente aprendo lo step", () => {
      monta({ schema_pagamento: null, pagamento_milestones: null });
      expect(bonifico().getAttribute("aria-pressed")).toBe("false");
      expect(finanziamento().getAttribute("aria-pressed")).toBe("false");
      expect(screen.queryByLabelText("Nome dello step 1")).toBeNull();
      expect(screen.queryByText("Simulazione finanziamento")).toBeNull();
      expect(screen.getByText(/Scegli come paga il cliente/)).toBeTruthy();
      expect(stato.scritture.filter(([c]) => /^(schema_pagamento|pagamento_milestones|fin_)/.test(c))).toEqual([]);
    });

    it("la prima scelta scrive lo schema e le rate, e le rate compaiono", () => {
      monta({ schema_pagamento: null, pagamento_milestones: null });
      fireEvent.click(bonifico());
      expect(ultimo("schema_pagamento")).toBe("tre_step");
      expect(rateScritte()).toEqual(RATE_TRE_STEP);
      expect(percentuali()).toEqual([30, 40, 30]);
    });

    it("un preventivo da modello (rate = [], schema vuoto) parte allo stesso modo: da scegliere", () => {
      monta({ schema_pagamento: null, pagamento_milestones: [] });
      expect(screen.getByText(/Scegli come paga il cliente/)).toBeTruthy();
      expect(bonifico().getAttribute("aria-pressed")).toBe("false");
    });

    it("rate scritte ma schema no (preventivi di prima): vale «3 step», come nel PDF", () => {
      monta({ schema_pagamento: null, pagamento_milestones: RATE_TRE_STEP });
      expect(bonifico().getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByRole("button", { name: /3 step/ }).getAttribute("aria-pressed")).toBe("true");
      expect(percentuali()).toEqual([30, 40, 30]);
    });

    it("«Personalizzato» è una scelta anche senza rate: si parte da zero e si aggiunge", () => {
      monta({ schema_pagamento: null, pagamento_milestones: null });
      fireEvent.click(screen.getByRole("button", { name: "Personalizzato" }));
      expect(ultimo("schema_pagamento")).toBe("personalizzato");
      expect(ultimo("pagamento_milestones")).toEqual([]);
      expect(screen.getByRole("button", { name: "Personalizzato" }).getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(screen.getByRole("button", { name: "Aggiungi step" }));
      expect(rateScritte()).toEqual([{ label: "", percentuale: 100, when: null }]);
    });
  });

  describe("le rate", () => {
    it("ogni rata ha l'importo in € accanto alla percentuale, sul totale IVA inclusa (11.000 €)", () => {
      monta(conTreStep);
      expect(screen.getAllByText("€ 3.300")).toHaveLength(2);
      expect(screen.getByText("€ 4.400")).toBeTruthy();
      // l'importo segue la percentuale scritta
      scriviPercentuale(2, "50");
      expect(within(screen.getByLabelText("Nome dello step 2").closest("li") as HTMLElement).getByText("€ 5.500")).toBeTruthy();
    });

    it("cambiando una rata che non è l'ultima, l'ultima chiude il conto e le altre non si toccano", () => {
      monta(conTreStep);
      scriviPercentuale(1, "20"); // 20 / 40 / → 40
      expect(rateScritte().map((r) => r.percentuale)).toEqual([20, 40, 40]);
      scriviPercentuale(2, "35"); // 20 / 35 / → 45
      expect(rateScritte().map((r) => r.percentuale)).toEqual([20, 35, 45]);
      expect(percentuali()).toEqual([20, 35, 45]);
      expect(screen.getByText("Totale: 100%")).toBeTruthy();
    });

    it("la forma scritta è quella di sempre: nome, percentuale e quando, e i testi non si perdono", () => {
      monta(conTreStep);
      scriviPercentuale(1, "25");
      expect(rateScritte()).toEqual([
        { label: "Acconto alla firma", percentuale: 25, when: "Firma contratto" },
        { label: "Acconto arrivo merce", percentuale: 40, when: "Merce in magazzino" },
        { label: "Saldo", percentuale: 35, when: "Prima dei lavori" },
      ]);
    });

    it("il nome e il «quando» si scrivono subito nel preventivo", () => {
      monta(conTreStep);
      fireEvent.change(rata(2, "Nome dello step"), { target: { value: "Arrivo infissi" } });
      expect(rateScritte()[1].label).toBe("Arrivo infissi");
      fireEvent.change(rata(2, "Quando, step"), { target: { value: "" } });
      expect(rateScritte()[1].when).toBeNull();
    });

    it("scrivendo nell'ultima rata si decide quanto vale lei: il totale lo dice, niente si sistema di nascosto", () => {
      monta(conTreStep);
      scriviPercentuale(3, "20");
      expect(rateScritte().map((r) => r.percentuale)).toEqual([30, 40, 20]);
      expect(screen.getByText("Totale: 90%")).toBeTruthy();
      expect(screen.getByText(/\+10% per arrivare a 100%/)).toBeTruthy();
      scriviPercentuale(3, "40");
      expect(screen.getByText("Totale: 110%")).toBeTruthy();
      expect(screen.getByText(/−10% per arrivare a 100%/)).toBeTruthy();
    });

    it("se le altre rate superano già 100 l'ultima va a zero, non sotto", () => {
      monta(conTreStep);
      scriviPercentuale(1, "80"); // 80 + 40 = 120 → l'ultima 0
      expect(rateScritte().map((r) => r.percentuale)).toEqual([80, 40, 0]);
      expect(screen.getByText("Totale: 120%")).toBeTruthy();
    });

    it("le rate che nel preventivo non fanno 100 restano com'erano: aprendo lo step non si sistema niente", () => {
      monta({ schema_pagamento: "tre_step", pagamento_milestones: [
        { label: "Acconto", percentuale: 30, when: null }, { label: "Saldo", percentuale: 60, when: null },
      ] });
      expect(screen.getByText("Totale: 90%")).toBeTruthy();
      expect(stato.scritture.filter(([c]) => c === "pagamento_milestones")).toEqual([]);
    });

    it("«Dividi in parti uguali»: 33 / 33 / 34, e 50 / 50 con due rate; nomi e «quando» restano", () => {
      monta(conTreStep);
      fireEvent.click(screen.getByRole("button", { name: "Dividi in parti uguali" }));
      expect(rateScritte()).toEqual([
        { label: "Acconto alla firma", percentuale: 33, when: "Firma contratto" },
        { label: "Acconto arrivo merce", percentuale: 33, when: "Merce in magazzino" },
        { label: "Saldo", percentuale: 34, when: "Prima dei lavori" },
      ]);
      expect(screen.getByText("Totale: 100%")).toBeTruthy();

      cleanup();
      stato.scritture = [];
      monta({ schema_pagamento: "acconto_finanziato", pagamento_milestones: RATE_FINANZIATO });
      fireEvent.click(screen.getByRole("button", { name: "Dividi in parti uguali" }));
      expect(rateScritte().map((r) => r.percentuale)).toEqual([50, 50]);
    });

    it("«Dividi in parti uguali» non c'è con una sola rata", () => {
      monta({ schema_pagamento: "tutto_finanziato", pagamento_milestones: [{ label: "Finanziamento", percentuale: 100, when: null }] });
      expect(screen.queryByRole("button", { name: "Dividi in parti uguali" })).toBeNull();
    });

    it("aggiungendo uno step prende quello che resta (zero se il conto già torna), e la forma è la stessa", () => {
      monta(conTreStep);
      fireEvent.click(screen.getByRole("button", { name: "Aggiungi step" }));
      expect(rateScritte()).toHaveLength(4);
      expect(rateScritte()[3]).toEqual({ label: "", percentuale: 0, when: null });
      expect(rateScritte().map((r) => r.percentuale)).toEqual([30, 40, 30, 0]);
      // abbassando un'altra rata, la nuova ultima chiude il conto
      scriviPercentuale(3, "20");
      expect(rateScritte().map((r) => r.percentuale)).toEqual([30, 40, 20, 10]);
    });

    it("togliendo uno step l'ultima si riprende la sua quota; l'ultimo step rimasto non si toglie", () => {
      monta(conTreStep);
      fireEvent.click(screen.getByRole("button", { name: "Rimuovi lo step 2" }));
      expect(rateScritte().map((r) => r.label)).toEqual(["Acconto alla firma", "Saldo"]);
      expect(rateScritte().map((r) => r.percentuale)).toEqual([30, 70]);

      cleanup();
      monta({ schema_pagamento: "tutto_finanziato", pagamento_milestones: [{ label: "Finanziamento", percentuale: 100, when: null }] });
      expect((screen.getByRole("button", { name: "Rimuovi lo step 1" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("telefono: «Quando» e importo stanno sotto, sulla seconda riga di ogni rata (due righe per rata)", () => {
      monta(conTreStep);
      const riga = screen.getByLabelText("Nome dello step 1").closest("li") as HTMLElement;
      expect(riga.className).toMatch(/grid-cols-\[minmax\(0,1fr\)_4\.75rem_auto\]/);
      expect(screen.getByLabelText("Quando, step 1").className).toMatch(/row-start-2/);
    });
  });
});

describe("3 bis. la simulazione del finanziamento: durate con la rata sul tasto, e tutto si scrive da solo", () => {
  const t1 = () => { stato.tabelle = [TABELLA("t1", "Prestito Casa")]; stato.righe = { t1: RIGHE_TABELLA("t1") }; };
  const tasto = (durata: number) => screen.getByRole("button", { name: new RegExp(`^${durata} rate`) });
  const premuto = (durata: number) => tasto(durata).getAttribute("aria-pressed") === "true";
  const piani = () => ultimo("fin_piani") as Array<Record<string, unknown>>;
  const finanziato = { schema_pagamento: "acconto_finanziato" as const, pagamento_milestones: RATE_FINANZIATO, fin_anticipo_pct: 30 };
  const campo = (nome: string) => screen.getByLabelText(nome) as HTMLInputElement;

  describe("la scelta delle rate con un tocco", () => {
    it("ogni durata è un tasto con la rata già calcolata, per la fascia dell'importo da finanziare (7.700 → fascia 8.000)", () => {
      t1();
      monta(finanziato);
      expect(tasto(24).textContent).toMatch(/€ 367\/mese/);
      expect(tasto(48).textContent).toMatch(/€ 202\/mese/);
      expect(tasto(60).textContent).toMatch(/€ 160\/mese/);
      expect(tasto(84).textContent).toMatch(/€ 120\/mese/);
      // senza niente di scritto non c'è nessuna durata evidenziata, e lo dice
      expect([24, 48, 60, 84].map(premuto)).toEqual([false, false, false, false]);
      expect(screen.getByText(/Scegli le rate: il piano compare nel preventivo/)).toBeTruthy();
    });

    it("scegliere una durata scrive subito tabella, riga e piano, senza premere altro (nome, mesi, TAN, rata, anticipo, finanziato)", () => {
      t1();
      monta(finanziato);
      fireEvent.click(tasto(60));
      expect(ultimo("fin_tabella_id")).toBe("t1");
      expect(ultimo("fin_tabella_riga_id")).toBe("r-60-8000");
      expect(piani()).toEqual([{ nome: "Prestito Casa", mesi: 60, tasso: 5.9, rata_mese: 160, anticipo: 3300, finanziato: 7700 }]);
      expect(premuto(60)).toBe(true);
      expect(premuto(24)).toBe(false);
      // il riepilogo in una riga: rate × importo, TAN, TAEG, totale dovuto
      const riepilogo = screen.getByText(/60 rate da € 160/).closest("p") as HTMLElement;
      expect(riepilogo.textContent).toMatch(/TAN 5,9%/);
      expect(riepilogo.textContent).toMatch(/TAEG 6,45%/);
      expect(riepilogo.textContent).toMatch(/totale dovuto € 9\.600/);
    });

    it("riaprendo il preventivo si vede la durata SCRITTA, non la prima della tabella", () => {
      t1();
      monta(COMPLETO);
      expect(premuto(48)).toBe(true);
      expect(premuto(24)).toBe(false);
      expect(screen.getByText(/48 rate da € 202/)).toBeTruthy();
    });

    it("se la riga scritta non si trova più (tabella ricaricata) vale la durata del piano scritto", () => {
      t1();
      monta({ ...COMPLETO, fin_tabella_riga_id: "riga-che-non-c-e-piu" });
      expect(premuto(48)).toBe(true);
    });

    it("con una sola tabella è già scelta: niente tendina, e le durate si vedono subito", () => {
      t1();
      monta(finanziato);
      expect(screen.queryByRole("combobox", { name: "Tabella finanziamento" })).toBeNull();
      expect(screen.getByText(/Tabella:/).textContent).toMatch(/Prestito Casa · Compass/);
      expect(tasto(24)).toBeTruthy();
      // preselezionarla non scrive niente: la tabella entra nel preventivo con la prima durata scelta
      expect(stato.scritture.filter(([c]) => /^fin_/.test(c))).toEqual([]);
    });

    it("con più tabelle resta la tendina, e le durate si vedono dopo aver scelto la tabella", () => {
      stato.tabelle = [TABELLA("t1", "Prestito Casa"), TABELLA("t2", "Casa Facile", "Findomestic")];
      stato.righe = { t1: RIGHE_TABELLA("t1"), t2: RIGHE_TABELLA("t2") };
      monta(finanziato);
      expect(screen.getByRole("combobox", { name: "Tabella finanziamento" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: /^24 rate/ })).toBeNull();
      expect(screen.getByText(/Scegli una tabella per vedere le rate/)).toBeTruthy();
    });

    it("con la tabella già scritta nel preventivo (più tabelle) le durate si vedono senza altro", () => {
      stato.tabelle = [TABELLA("t1", "Prestito Casa"), TABELLA("t2", "Casa Facile")];
      stato.righe = { t1: RIGHE_TABELLA("t1"), t2: RIGHE_TABELLA("t2") };
      monta(COMPLETO);
      expect(premuto(48)).toBe(true);
    });

    it("una tabella archiviata dopo l'uso resta leggibile: il piano scritto si vede ancora", () => {
      stato.tabelle = [];
      stato.righe = { t1: RIGHE_TABELLA("t1") };
      monta(COMPLETO);
      expect(premuto(48)).toBe(true);
      expect(screen.getByRole("tablist", { name: "Modalità finanziamento" })).toBeTruthy();
    });

    it("senza tabelle si usa il piano manuale, e si dice dove caricarne una", () => {
      stato.tabelle = [];
      monta({ ...finanziato, fin_piani: [] });
      expect(screen.queryByRole("tablist")).toBeNull();
      expect(screen.getByText(/Nessuna tabella finanziaria configurata/)).toBeTruthy();
      expect(screen.getByRole("link", { name: /Impostazioni → Finanziamenti/ }).getAttribute("href")).toBe("/azienda/impostazioni/finanziamenti");
    });
  });

  describe("l'anticipo", () => {
    it("tasti 0/10/20/30/40 e campo, con l'importo in € accanto e quanto resta da finanziare", () => {
      t1();
      monta(finanziato);
      const gruppo = screen.getByRole("group", { name: "Anticipo" });
      expect(within(gruppo).getAllByRole("button").map((b) => b.textContent)).toEqual(["0%", "10%", "20%", "30%", "40%"]);
      expect(within(gruppo).getByRole("button", { name: "30%" }).getAttribute("aria-pressed")).toBe("true");
      expect(campo("Anticipo in percentuale").value).toBe("30");
      const scheda = screen.getByRole("heading", { name: "Simulazione finanziamento" }).closest("div.rounded-lg") as HTMLElement;
      expect(within(scheda).getByText("€ 3.300")).toBeTruthy(); // anticipo
      expect(within(scheda).getByText("€ 7.700")).toBeTruthy(); // da finanziare
    });

    it("cambiare l'anticipo riscrive anticipo e piano: la durata scelta resta, la fascia dell'importo segue", () => {
      t1();
      monta(COMPLETO);
      fireEvent.click(within(screen.getByRole("group", { name: "Anticipo" })).getByRole("button", { name: "20%" }));
      // 20% di 11.000 = 2.200 di anticipo, 8.800 da finanziare → fascia 12.000
      expect(ultimo("fin_anticipo_pct")).toBe(20);
      expect(ultimo("fin_tabella_riga_id")).toBe("r-48-12000");
      expect(piani()).toEqual([{ nome: "Prestito Casa", mesi: 48, tasso: 5.9, rata_mese: 302.4, anticipo: 2200, finanziato: 8800 }]);
      expect(premuto(48)).toBe(true);
    });

    it("scrivere l'anticipo nel campo lo cambia subito", () => {
      t1();
      monta(finanziato);
      fireEvent.change(campo("Anticipo in percentuale"), { target: { value: "45" } });
      expect(ultimo("fin_anticipo_pct")).toBe(45);
      const scheda = screen.getByRole("heading", { name: "Simulazione finanziamento" }).closest("div.rounded-lg") as HTMLElement;
      expect(within(scheda).getByText("€ 4.950")).toBeTruthy();
    });

    it("senza durata scelta cambiare l'anticipo non inventa nessun piano", () => {
      t1();
      monta(finanziato);
      fireEvent.click(within(screen.getByRole("group", { name: "Anticipo" })).getByRole("button", { name: "10%" }));
      expect(ultimo("fin_anticipo_pct")).toBe(10);
      expect(scritto("fin_piani")).toEqual([]);
    });

    it("se la riga scritta non si trova più, cambiare l'anticipo riscrive comunque il piano, per la durata del piano scritto", () => {
      t1();
      monta({ ...COMPLETO, fin_tabella_riga_id: "riga-che-non-c-e-piu" });
      fireEvent.click(within(screen.getByRole("group", { name: "Anticipo" })).getByRole("button", { name: "20%" }));
      expect(ultimo("fin_tabella_riga_id")).toBe("r-48-12000");
      expect(piani()).toEqual([{ nome: "Prestito Casa", mesi: 48, tasso: 5.9, rata_mese: 302.4, anticipo: 2200, finanziato: 8800 }]);
    });

    it("col piano manuale non ancora scritto, toccare l'anticipo lo scrive (la prima azione dell'utente lo inserisce)", () => {
      stato.tabelle = [];
      monta({ ...finanziato, fin_piani: [] });
      fireEvent.click(within(screen.getByRole("group", { name: "Anticipo" })).getByRole("button", { name: "20%" }));
      expect(piani().map((p) => [p.nome, p.mesi, p.anticipo, p.finanziato])).toEqual([["Estesa", 120, 2200, 8800], ["Standard", 60, 2200, 8800]]);
      expect(screen.queryByText(/Non ancora nel preventivo/)).toBeNull();
    });

    it("toccare l'anticipo o la durata che ci sono già non scrive niente (scrivere a vuoto segna il preventivo come modificato)", () => {
      t1();
      monta(COMPLETO);
      fireEvent.click(within(screen.getByRole("group", { name: "Anticipo" })).getByRole("button", { name: "30%" }));
      fireEvent.click(tasto(48));
      fireEvent.click(screen.getByRole("button", { name: "Acconto + finanziato" }));
      expect(stato.scritture).toEqual([]);
    });
  });

  describe("il piano manuale (TAN libero)", () => {
    it("passare a «Manuale» scrive i due piani di serie, e toglie la tabella dal preventivo", () => {
      t1();
      monta(COMPLETO);
      fireEvent.click(screen.getByRole("tab", { name: /Manuale/ }));
      expect(ultimo("fin_tabella_id")).toBeNull();
      expect(ultimo("fin_tabella_riga_id")).toBeNull();
      expect(piani().map((p) => [p.nome, p.mesi, p.tasso])).toEqual([["Estesa", 120, 5.5], ["Standard", 60, 0]]);
      // la rata di ciascun piano si vede
      expect(screen.getAllByText(/€ \d+\/mese/)).toHaveLength(2);
    });

    it("scrivere i mesi o il TAN riscrive i piani con la rata calcolata", () => {
      t1();
      monta(COMPLETO);
      fireEvent.click(screen.getByRole("tab", { name: /Manuale/ }));
      fireEvent.change(campo("Piano Estesa: durata in mesi"), { target: { value: "96" } });
      expect(piani()[0]).toMatchObject({ nome: "Estesa", mesi: 96, tasso: 5.5, anticipo: 3300, finanziato: 7700 });
      fireEvent.change(campo("Piano Standard: TAN in percentuale"), { target: { value: "2.5" } });
      expect(piani()[1]).toMatchObject({ nome: "Standard", mesi: 60, tasso: 2.5 });
      expect(Number(piani()[1].rata_mese)).toBeGreaterThan(Math.round((7700 / 60) * 100) / 100);
    });

    it("riaprendo un preventivo col piano manuale si vedono i SUOI valori, non quelli di serie", () => {
      stato.tabelle = [];
      const manuale = pianiManuali({ totale: 11_000, anticipoPct: 30, piani: { estesa: { mesi: 96, tasso: 4.2 }, standard: { mesi: 48, tasso: 1 } } });
      monta({ ...finanziato, fin_tabella_id: null, fin_tabella_riga_id: null, fin_piani: manuale });
      expect(campo("Piano Estesa: durata in mesi").value).toBe("96");
      expect(campo("Piano Estesa: TAN in percentuale").value).toBe("4.2");
      expect(campo("Piano Standard: durata in mesi").value).toBe("48");
      expect(campo("Piano Standard: TAN in percentuale").value).toBe("1");
      expect(screen.queryByText(/Non ancora nel preventivo/)).toBeNull();
    });

    it("con i valori solo di partenza lo dice: «Non ancora nel preventivo»", () => {
      stato.tabelle = [];
      monta({ ...finanziato, fin_piani: [] });
      expect(screen.getByText(/Non ancora nel preventivo/)).toBeTruthy();
    });

    it("senza tabelle, scegliere il finanziamento scrive già il piano manuale che si vede", () => {
      stato.tabelle = [];
      monta({ schema_pagamento: null, pagamento_milestones: null, fin_anticipo_pct: 30 });
      fireEvent.click(screen.getByRole("button", { name: "Finanziamento" }));
      expect(piani().map((p) => p.nome)).toEqual(["Estesa", "Standard"]);
      expect(screen.queryByText(/Non ancora nel preventivo/)).toBeNull();
    });

    it("tornare da «Manuale» a «Da tabella» toglie il piano manuale: nel preventivo non resta niente che a schermo non c'è", () => {
      t1();
      monta({ ...finanziato, fin_tabella_id: null, fin_tabella_riga_id: null, fin_piani: pianiManuali({ totale: 11_000, anticipoPct: 30, piani: PIANO_MANUALE_DI_SERIE }) });
      fireEvent.click(screen.getByRole("tab", { name: /Da tabella/ }));
      expect(ultimo("fin_piani")).toEqual([]);
      expect(ultimo("fin_tabella_id")).toBe("t1");
    });
  });

  describe("tornare al finanziamento, e cambiare tabella", () => {
    const bonifico = () => screen.getByRole("button", { name: "Bonifico" });
    const finanziamentoBtn = () => screen.getByRole("button", { name: "Finanziamento" });

    it("tornare al finanziamento dopo un bonifico rimette la durata che c'era (anticipo e tabella erano rimasti)", () => {
      t1();
      monta(COMPLETO);
      fireEvent.click(bonifico());
      expect(ultimo("fin_piani")).toEqual([]);
      fireEvent.click(finanziamentoBtn());
      expect(ultimo("fin_tabella_riga_id")).toBe("r-48-8000");
      expect(piani()).toEqual([PIANO_48]);
      expect(premuto(48)).toBe(true);
    });

    it("lo stesso con il piano manuale: i valori scritti a mano tornano com'erano", () => {
      t1();
      const scritti = pianiManuali({ totale: 11_000, anticipoPct: 30, piani: { estesa: { mesi: 96, tasso: 4.2 }, standard: { mesi: 48, tasso: 1 } } });
      monta({ ...finanziato, fin_tabella_id: null, fin_tabella_riga_id: null, fin_piani: scritti });
      fireEvent.click(bonifico());
      fireEvent.click(finanziamentoBtn());
      expect(piani().map((p) => [p.nome, p.mesi, p.tasso])).toEqual([["Estesa", 96, 4.2], ["Standard", 48, 1]]);
      expect((screen.getByRole("tab", { name: /Manuale/ })).getAttribute("aria-selected")).toBe("true");
    });

    it("una scelta mai fatta non si inventa tornando al finanziamento: resta da scegliere la durata", () => {
      t1();
      monta({ schema_pagamento: "tre_step", pagamento_milestones: RATE_TRE_STEP, fin_anticipo_pct: 30 });
      fireEvent.click(finanziamentoBtn());
      expect(scritto("fin_piani")).toEqual([]);
    });

    it("scegliere un'altra tabella dalla tendina toglie il piano di prima: le durate si scelgono di nuovo", async () => {
      stato.tabelle = [TABELLA("t1", "Prestito Casa"), TABELLA("t2", "Casa Facile", "Findomestic")];
      stato.righe = { t1: RIGHE_TABELLA("t1"), t2: RIGHE_TABELLA("t2") };
      monta(COMPLETO);
      expect(premuto(48)).toBe(true);
      fireEvent.pointerDown(screen.getByRole("combobox", { name: "Tabella finanziamento" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
      fireEvent.click(await screen.findByRole("option", { name: /Casa Facile/ }));
      expect(ultimo("fin_tabella_id")).toBe("t2");
      expect(ultimo("fin_tabella_riga_id")).toBeNull();
      expect(ultimo("fin_piani")).toEqual([]);
      expect(premuto(48)).toBe(false);
      expect(screen.getByText(/Scegli le rate: il piano compare nel preventivo/)).toBeTruthy();
    });
  });

  describe("la rata segue il totale, senza pulsante e senza scritture a vuoto", () => {
    it("aprire un preventivo già completo non scrive niente (rate, finanziamento, detrazione, risparmio)", () => {
      t1();
      monta(COMPLETO);
      expect(stato.scritture).toEqual([]);
    });

    it("se i prezzi cambiano in un altro passo, il piano scritto si rifà sul totale nuovo (fascia compresa)", () => {
      t1();
      const { conRighe } = monta(COMPLETO);
      expect(stato.scritture).toEqual([]);
      conRighe(conPrezzo(15_000)); // totale 16.500: finanziato 11.550 → fascia 12.000
      expect(ultimo("fin_tabella_riga_id")).toBe("r-48-12000");
      expect(piani()).toEqual([{ nome: "Prestito Casa", mesi: 48, tasso: 5.9, rata_mese: 302.4, anticipo: 4950, finanziato: 11550 }]);
    });

    it("lo stesso con il piano manuale: la rata si rifà dal nuovo importo", () => {
      stato.tabelle = [];
      const scritti = pianiManuali({ totale: 11_000, anticipoPct: 30, piani: PIANO_MANUALE_DI_SERIE });
      const { conRighe } = monta({ ...finanziato, fin_tabella_id: null, fin_tabella_riga_id: null, fin_piani: scritti });
      expect(scritto("fin_piani")).toEqual([]);
      conRighe(conPrezzo(20_000)); // totale 22.000: finanziato 15.400
      expect(piani().map((p) => [p.mesi, p.finanziato, p.anticipo])).toEqual([[120, 15400, 6600], [60, 15400, 6600]]);
      expect(piani()[1].rata_mese).toBe(256.67);
    });

    it("con un bonifico non si rifà nessun piano: non c'è", () => {
      t1();
      const { conRighe } = monta({ schema_pagamento: "tre_step", pagamento_milestones: RATE_TRE_STEP, fin_piani: [], fin_anticipo_pct: 30 });
      conRighe(conPrezzo(15_000));
      expect(scritto("fin_piani")).toEqual([]);
    });

    it("un piano che non c'è non nasce da solo, nemmeno se cambia il totale", () => {
      t1();
      const { conRighe } = monta(finanziato);
      conRighe(conPrezzo(15_000));
      expect(scritto("fin_piani")).toEqual([]);
      expect(scritto("fin_tabella_riga_id")).toEqual([]);
    });

    it("nemmeno quando restano una tabella e una riga scritte ma il piano no: il piano non si inventa", () => {
      t1();
      const { conRighe } = monta({ ...finanziato, fin_tabella_id: "t1", fin_tabella_riga_id: "r-48-8000", fin_piani: [] });
      conRighe(conPrezzo(15_000));
      expect(stato.scritture.filter(([c]) => c === "fin_piani" || c === "fin_tabella_riga_id")).toEqual([]);
    });
  });
});

describe("3 ter. il risparmio energetico si scrive da solo, e spegnerlo lo toglie dal PDF", () => {
  const interruttoreRisparmio = () => screen.getAllByRole("switch").at(-1) as HTMLElement;
  const aperto = () => apri(/Risparmio energetico/);

  it("accendere il risparmio scrive i campi che il PDF legge: importo e CO₂ arrotondati come il database, zona e payback", () => {
    monta();
    aperto();
    fireEvent.click(interruttoreRisparmio());
    expect(ultimo("risparmio_calcolato")).toBe(true);
    const risparmio = ultimo("risparmio_eur_anno") as number;
    expect(risparmio).toBeGreaterThan(0);
    expect(Math.round(risparmio * 100) / 100).toBe(risparmio);
    const co2 = ultimo("co2_risparmiata_t_anno") as number;
    expect(co2).toBeGreaterThan(0);
    expect(Math.round(co2 * 1000) / 1000).toBe(co2);
    expect(typeof ultimo("cantiere_zona_climatica")).toBe("string");
    // con la detrazione accesa (di serie) c'è anche l'anno di pareggio, dal risparmio scritto
    const eco = calcolaEcobonus({ imponibile_eur: 11_000, aliquota: 50 });
    // (un payback oltre i 10 anni è «nessun anno»: non si scrive se non c'era già)
    expect(ultimo("payback_anni") ?? null).toBe(paybackAtteso({ totale: 11_000, risparmioEurAnno: risparmio, detrazioneEurAnno: eco.rata_annuale }));
  });

  it("cambiare gli Uw riscrive risparmio e payback", () => {
    monta({ risparmio_calcolato: true, risparmio_eur_anno: 77, payback_anni: 17.5 });
    aperto();
    const prima = ultimo("risparmio_eur_anno");
    fireEvent.change(screen.getByDisplayValue("2.8"), { target: { value: "4.5" } });
    const dopo = ultimo("risparmio_eur_anno") as number;
    expect(dopo).toBeGreaterThan(Number(prima ?? 77));
    fireEvent.change(screen.getByDisplayValue("1.1"), { target: { value: "0.8" } });
    expect(ultimo("risparmio_eur_anno") as number).toBeGreaterThan(dopo);
  });

  it("spegnere il risparmio azzera importo, CO₂ e payback: il PDF li legge dall'importo, il segno di spunta non basta", () => {
    monta(COMPLETO);
    aperto();
    fireEvent.click(interruttoreRisparmio());
    expect(ultimo("risparmio_calcolato")).toBe(false);
    expect(ultimo("risparmio_eur_anno")).toBeNull();
    expect(ultimo("co2_risparmiata_t_anno")).toBeNull();
    expect(ultimo("payback_anni")).toBeNull();
    // e la zona climatica, che è un dato del cantiere, non si tocca
    expect(scritto("cantiere_zona_climatica")).toEqual([]);
  });

  it("riaprendo un preventivo col risparmio personalizzato (600 €) non lo riscrive con quello di partenza", () => {
    expect(COMPLETO.payback_anni).not.toBeNull();
    monta(COMPLETO);
    expect(stato.scritture).toEqual([]);
    aperto();
    expect(stato.scritture).toEqual([]);
    // gli Uw tornano ai valori di partenza (non stanno scritti da nessuna parte), ma il 600 resta quello del preventivo
    expect(scritto("risparmio_eur_anno")).toEqual([]);
  });

  it("il payback segue il totale usando il risparmio scritto (600 €), senza toccare il risparmio", () => {
    const { conRighe } = monta(COMPLETO);
    conRighe(conPrezzo(20_000)); // totale 22.000, detrazione 1.100 l'anno: in 10 anni non si ripaga
    const eco = calcolaEcobonus({ imponibile_eur: 22_000, aliquota: 50 });
    expect(paybackAtteso({ totale: 22_000, risparmioEurAnno: 600, detrazioneEurAnno: eco.rata_annuale })).toBeNull();
    expect(scritto("payback_anni")).toEqual([null]);
    expect(scritto("risparmio_eur_anno")).toEqual([]);
    expect(scritto("risparmio_calcolato")).toEqual([]);
  });

  it("senza detrazione non si calcola nessun payback, e quello scritto non si tocca", () => {
    monta({ ...COMPLETO, detrazione_aliquota: 0, detrazione_eur_totale: 0, detrazione_eur_anno: 0 });
    expect(stato.scritture).toEqual([]);
  });
});

describe("4. sconti rapidi: i tasti e «Arriva a €» con lo sconto doppio (% e fisso), senza aggirare l'approvazione", () => {
  const gruppo = () => screen.getByRole("group", { name: "Sconto veloce" });
  const tastoSconto = (nome: string) => within(gruppo()).getByRole("button", { name: nome }) as HTMLButtonElement;
  const campoArrivaA = () => screen.getByLabelText(/Arriva a €/) as HTMLInputElement;
  const applicaArrivaA = () => fireEvent.click(screen.getByRole("button", { name: "Applica" }));
  const comeAdmin = () => { stato.permessi = { canApproveDiscounts: true, canViewMargins: false, canViewCosts: false }; };
  const euro = (n: number) => formatCurrency(n).replace(/\s/g, " ");
  const testoPagina = () => (document.body.textContent ?? "").replace(/\s/g, " ");

  describe("chi può approvare gli sconti", () => {
    beforeEach(comeAdmin);

    it("un tasto scrive lo sconto in percentuale e azzera quello fisso: i due insieme darebbero un totale diverso da quello che il tasto promette", () => {
      monta({ sconto_percentuale: 2, sconto_importo: 500 });
      fireEvent.click(tastoSconto("10%"));
      expect(ultimo("sconto_percentuale")).toBe(10);
      expect(ultimo("sconto_importo")).toBe(0);
      // 10.000 − 10% = 9.000 + IVA 10% = 9.900: quello che dice il tasto
      expect(screen.getByText("€ 9.900,00")).toBeTruthy();
      // e il campo dello sconto fisso mostra lo 0 che c'è adesso, non il vecchio valore
      expect(((screen.getByText("Sconto fisso (€)").parentElement as HTMLElement).querySelector("input") as HTMLInputElement).value).toBe("0");
    });

    it("«Nessuno» toglie tutti e due gli sconti", () => {
      monta({ sconto_percentuale: 5, sconto_importo: 300 });
      fireEvent.click(tastoSconto("Nessuno"));
      expect(ultimo("sconto_percentuale")).toBe(0);
      expect(ultimo("sconto_importo")).toBe(0);
      expect(screen.getByText("€ 11.000,00")).toBeTruthy();
    });

    it("il tasto premuto è quello che coincide con lo sconto che c'è davvero, anche se viene dal campo fisso (1.000 € su 10.000 = 10%)", () => {
      monta({ sconto_percentuale: 0, sconto_importo: 1000 });
      expect(tastoSconto("10%").getAttribute("aria-pressed")).toBe("true");
      expect(tastoSconto("Nessuno").getAttribute("aria-pressed")).toBe("false");
    });

    it("toccare il tasto che c'è già non riscrive niente", () => {
      monta({ sconto_percentuale: 5, sconto_importo: 0 });
      fireEvent.click(tastoSconto("5%"));
      expect(stato.scritture.filter(([c]) => c === "sconto_percentuale" || c === "sconto_importo")).toEqual([]);
    });

    it("«Arriva a €» porta il totale IVA inclusa alla cifra voluta: dice lo sconto che serve e lo scrive in percentuale", () => {
      monta({ sconto_importo: 300 }); // lo sconto fisso c'era: il calcolo parte dal prezzo pieno e lo sostituisce
      fireEvent.change(campoArrivaA(), { target: { value: "10.450" } });
      expect(screen.getByText(`Serve uno sconto del 5% (−${euro(500)}, IVA esclusa).`)).toBeTruthy();
      applicaArrivaA();
      expect(ultimo("sconto_percentuale")).toBe(5);
      expect(ultimo("sconto_importo")).toBe(0);
      expect(screen.getByText("€ 10.450,00")).toBeTruthy();
    });

    it("«Arriva a €» parte dal prezzo scritto a mano, quando c'è: sconto e IVA si calcolano su quello", () => {
      stato.prezzoAMano = true;
      monta({ prezzo_manuale: 8000 }); // 8.000 + IVA 10% = 8.800
      fireEvent.change(campoArrivaA(), { target: { value: "8.360" } });
      expect(screen.getByText(`Serve uno sconto del 5% (−${euro(400)}, IVA esclusa).`)).toBeTruthy();
      applicaArrivaA();
      expect(ultimo("sconto_percentuale")).toBe(5);
      expect(screen.getByText("€ 8.360,00")).toBeTruthy();
    });

    it("l'amministrazione non ha un tetto, ma lo sconto oltre il massimo fa scattare gli stessi avvisi e la richiesta di approvazione: il flusso non si aggira", () => {
      stato.regole = [regola({ sconto_max_pct: 10, approva_oltre_pct: 7.5 })];
      monta();
      expect(tastoSconto("10%").disabled).toBe(false);
      fireEvent.change(campoArrivaA(), { target: { value: "8800" } }); // 20% di sconto
      applicaArrivaA();
      expect(ultimo("sconto_percentuale")).toBe(20);
      expect(testoPagina()).toMatch(/Oltre max 10\.0% — serve override admin/);
      expect(screen.getByRole("button", { name: /Richiedi approvazione/ })).toBeTruthy();
    });

    it("tra la soglia di approvazione e il massimo il tasto avvisa che serve l'approvazione", () => {
      stato.regole = [regola({ sconto_max_pct: 12, approva_oltre_pct: 7.5 })];
      monta();
      fireEvent.click(tastoSconto("10%"));
      expect(testoPagina()).toMatch(/Oltre 7\.5% — richiede approvazione admin/);
      expect(screen.getByRole("button", { name: /Richiedi approvazione/ })).toBeTruthy();
    });

    it("con l'IVA mista «Arriva a €» non c'è (l'aliquota cambia con lo sconto); i tasti sì e funzionano", () => {
      monta({ iva_percentuale: IVA_MISTA_SENTINEL });
      expect(screen.queryByLabelText(/Arriva a €/)).toBeNull();
      expect(screen.getByText(/«Arriva a €» non c'è con l'IVA mista/)).toBeTruthy();
      fireEvent.click(tastoSconto("5%"));
      expect(ultimo("sconto_percentuale")).toBe(5);
    });
  });

  it("su telefono i tasti e il campo «Arriva a €» sono da dito: almeno 36 px, senza tap-compact che li teneva a 28", () => {
    stato.permessi = { canApproveDiscounts: true, canViewMargins: false, canViewCosts: false };
    monta();
    for (const nome of ["Nessuno", "5%", "10%"]) {
      expect(tastoSconto(nome).className).toMatch(/max-md:min-h-9/);
      expect(tastoSconto(nome).className).not.toMatch(/tap-compact/);
    }
    expect(campoArrivaA().className).toMatch(/max-md:h-11/);
  });

  describe("chi non può approvare gli sconti", () => {
    it("i tasti ci sono ma sono spenti, come i campi: cliccarli non scrive niente", () => {
      stato.permessi = { canApproveDiscounts: false, canViewMargins: false, canViewCosts: false };
      monta({ sconto_percentuale: 5 });
      for (const nome of ["Nessuno", "5%", "10%"]) expect(tastoSconto(nome).disabled).toBe(true);
      fireEvent.click(tastoSconto("10%"));
      fireEvent.click(tastoSconto("Nessuno"));
      expect(stato.scritture.filter(([c]) => c === "sconto_percentuale" || c === "sconto_importo")).toEqual([]);
    });

    it("niente «Arriva a €»: per loro resta solo la riga dei tasti spenti, con la spiegazione", () => {
      stato.permessi = { canApproveDiscounts: false, canViewMargins: false, canViewCosts: false };
      monta();
      expect(screen.queryByLabelText(/Arriva a €/)).toBeNull();
      expect(gruppo().closest("[title]")?.getAttribute("title")).toMatch(/Solo l'amministrazione/);
    });

    it("il flusso di prima non cambia: campi in sola lettura, avviso blu, e «Richiedi approvazione» per uno sconto già scritto oltre il massimo", () => {
      stato.permessi = { canApproveDiscounts: false, canViewMargins: false, canViewCosts: false };
      stato.regole = [regola({ sconto_max_pct: 10, approva_oltre_pct: 7.5 })];
      monta({ sconto_percentuale: 12 });
      expect((screen.getByTitle(/Solo l'amministrazione può modificare lo sconto\. Usa Richiedi approvazione/) as HTMLInputElement).readOnly).toBe(true);
      expect(screen.getByText(/Lo sconto è gestito dall'amministrazione/)).toBeTruthy();
      expect(screen.getByRole("button", { name: /Richiedi approvazione/ })).toBeTruthy();
    });
  });
});


describe("5. stato vuoto onesto: senza serramenti né importo non si mostrano campi che non possono funzionare", () => {
  const vuoto = () => dettaglio({ serramenti: [] });
  const vaiAllOfferta = () => screen.getByRole("button", { name: "Vai all'Offerta" });
  const soloComplementi = () => dettaglio({
    serramenti: [],
    accessori: [{ id: "a1", progetto_id: "p1", company_id: "c1", position: 0, tipo: "persiana", quantita: 4, prezzo_unitario: 310, prezzo_totale: 1240 } as unknown as SrAccessorioRow],
  });

  it("un messaggio chiaro e un pulsante «Vai all'Offerta» che porta al passo dove si aggiungono i serramenti", () => {
    const onVai = vi.fn();
    monta({}, vuoto(), onVai);
    expect(screen.getByText(/Non c'è ancora niente da calcolare/)).toBeTruthy();
    fireEvent.click(vaiAllOfferta());
    expect(onVai).toHaveBeenCalledTimes(1);
    expect(onVai).toHaveBeenCalledWith("bom");
  });

  it("nessun campo che non può funzionare: né prezzo, né rate, né detrazione, né extra", () => {
    monta({}, vuoto(), vi.fn());
    expect(screen.queryByText("Sconto %")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Come paga il cliente" })).toBeNull();
    expect(screen.queryByRole("heading", { name: /Detrazione fiscale/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Risparmio energetico/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Riepilogo composizione" })).toBeNull();
  });

  it("senza il collegamento ai passi il messaggio c'è, ma non un pulsante che non fa niente", () => {
    monta({}, vuoto());
    expect(screen.getByText(/Non c'è ancora niente da calcolare/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Vai all'Offerta" })).toBeNull();
  });

  it("un prezzo scritto a mano è un importo: con quello la schermata c'è, anche senza serramenti", () => {
    monta({ prezzo_manuale: 5000 }, vuoto(), vi.fn());
    expect(screen.queryByText(/Non c'è ancora niente da calcolare/)).toBeNull();
    expect(screen.getByText("Sconto %")).toBeTruthy();
    expect(screen.getByLabelText(/Prezzo manuale dell'offerta/)).toBeTruthy();
    // niente avviso «aggiungi un serramento»: il prezzo c'è
    expect(screen.queryByText(/non ci sono serramenti/i)).toBeNull();
  });

  it("con i serramenti la schermata c'è anche se non hanno ancora un prezzo: è lì che si scrive il prezzo a mano", () => {
    stato.prezzoAMano = true;
    monta({}, dettaglio({ serramenti: [{ ...FINESTRE, prezzo_unitario: 0, prezzo_totale: 0 } as SrSerramentoRow] }), vi.fn());
    expect(screen.queryByText(/Non c'è ancora niente da calcolare/)).toBeNull();
    expect(screen.getByLabelText(/Prezzo manuale dell'offerta/)).toBeTruthy();
  });

  it("solo complementi con un prezzo: la schermata c'è, e un avviso con lo stesso pulsante dice che mancano i serramenti", () => {
    const onVai = vi.fn();
    monta({}, soloComplementi(), onVai);
    expect(screen.queryByText(/Non c'è ancora niente da calcolare/)).toBeNull();
    expect(screen.getByText("Sconto %")).toBeTruthy();
    expect(screen.getByText(/non ci sono serramenti/i)).toBeTruthy();
    fireEvent.click(vaiAllOfferta());
    expect(onVai).toHaveBeenCalledWith("bom");
  });

  it("dal vuoto al pieno (si aggiungono le righe e si torna) lo step si ridisegna senza errori", () => {
    const { conRighe } = monta({}, vuoto(), vi.fn());
    expect(screen.getByText(/Non c'è ancora niente da calcolare/)).toBeTruthy();
    conRighe(dettaglio());
    expect(screen.queryByText(/Non c'è ancora niente da calcolare/)).toBeNull();
    expect(screen.getByText("Sconto %")).toBeTruthy();
    conRighe(vuoto());
    expect(screen.getByText(/Non c'è ancora niente da calcolare/)).toBeTruthy();
  });
});

describe("6. su telefono i controlli piccoli hanno un'area di tocco da dito, senza cambiare l'aspetto", () => {
  it("i due interruttori (detrazione e risparmio) allargano l'area che risponde al tocco a 48×44; Bonifico / Finanziamento è alto 40 su telefono e 36 da tablet", () => {
    monta();
    apri(/Risparmio energetico/);
    const interruttori = screen.getAllByRole("switch");
    expect(interruttori).toHaveLength(2);
    for (const i of interruttori) {
      // pseudo-elemento che esce di 4 px ai lati e di 12 sopra e sotto (l'interruttore è 44×24 con il bordo da 2 px)
      expect(i.className).toMatch(/max-md:relative/);
      expect(i.className).toMatch(/max-md:before:absolute/);
      expect(i.className).toMatch(/max-md:before:-inset-x-1/);
      expect(i.className).toMatch(/max-md:before:-inset-y-3/);
    }
    for (const nome of ["Bonifico", "Finanziamento"]) {
      const tasto = screen.getByRole("button", { name: nome });
      expect(tasto.className).toMatch(/max-md:min-h-10/);
      expect(tasto.className).toMatch(/md:min-h-9/);
    }
  });
});

describe("7. rate e anticipo sono la stessa cosa: negli schemi con finanziamento la scheda, le rate e il PDF dicono la stessa cifra", () => {
  const t1 = () => { stato.tabelle = [TABELLA("t1", "Prestito Casa")]; stato.righe = { t1: RIGHE_TABELLA("t1") }; };
  const scheda = () => screen.getByRole("heading", { name: "Simulazione finanziamento" }).closest("div.rounded-lg") as HTMLElement;
  const schedaPaga = () => screen.getByRole("heading", { name: "Come paga il cliente" }).closest("div.rounded-lg") as HTMLElement;
  const campoAnticipo = () => screen.getByLabelText("Anticipo in percentuale") as HTMLInputElement;
  const chip = (pct: number) => within(screen.getByRole("group", { name: "Anticipo" })).getByRole("button", { name: `${pct}%` });
  type Rata = { label: string; percentuale: number; when: string | null };
  const rate = () => ultimo("pagamento_milestones") as Rata[];
  const percentuali = () => rate().map((r) => r.percentuale);
  const piani = () => ultimo("fin_piani") as Array<Record<string, unknown>>;
  /** Quello che il cliente paga di tasca sua secondo le rate: tutte tranne «Finanziamento», sul totale IVA inclusa. */
  const anticipoDelleRate = (totale: number) =>
    rate().filter((r) => r.label !== "Finanziamento").reduce((somma, r) => somma + (totale * r.percentuale) / 100, 0);
  const finanziato = { schema_pagamento: "acconto_finanziato" as const, pagamento_milestones: RATE_FINANZIATO, fin_anticipo_pct: 30 };
  const campiDelPagamento = (c: string) => c === "fin_anticipo_pct" || c === "pagamento_milestones" || c === "schema_pagamento" || c === "fin_piani";

  it("lo schema di serie «Finanziamento» su 11.000 €: l'anticipo della scheda è la somma delle rate non finanziate (3.300), non i 4.400 del 40% di partenza", () => {
    t1();
    monta({ fin_anticipo_pct: 40 }); // 40 = l'anticipo di partenza dell'azienda; nessuna scelta di pagamento ancora fatta
    fireEvent.click(screen.getByRole("button", { name: "Finanziamento" }));
    expect(ultimo("schema_pagamento")).toBe("acconto_finanziato");
    expect(ultimo("fin_anticipo_pct")).toBe(30);
    expect(percentuali()).toEqual([30, 70]);
    expect(anticipoDelleRate(11_000)).toBe(3_300);
    // la scheda del finanziamento e le rate dicono la stessa cifra: 3.300 di anticipo e 7.700 da finanziare
    expect(within(scheda()).getByText("€ 3.300")).toBeTruthy();
    expect(within(scheda()).getByText("€ 7.700")).toBeTruthy();
    expect(within(schedaPaga()).getByText("€ 3.300")).toBeTruthy();
    expect(within(schedaPaga()).getByText("€ 7.700")).toBeTruthy();
    expect(within(scheda()).queryByText("€ 4.400")).toBeNull();
    expect(campoAnticipo().value).toBe("30");
    expect(screen.queryByText(/il preventivo dice due cose/)).toBeNull();
  });

  // si parte da uno schema diverso da quello scelto, con l'anticipo di partenza dell'azienda (40) che non è di nessuno dei tre
  const partenza = (schema: "acconto_finanziato" | "due_acconti_finanziato") =>
    ({ ...finanziato, schema_pagamento: schema, fin_anticipo_pct: 40,
      pagamento_milestones: schema === "acconto_finanziato" ? RATE_FINANZIATO : [
        { label: "Acconto alla firma", percentuale: 20, when: "Firma contratto" },
        { label: "Acconto arrivo merce", percentuale: 30, when: "Merce in magazzino" },
        { label: "Finanziamento", percentuale: 50, when: "Erogato all'inizio lavori" },
      ] });
  it.each([
    ["Tutto finanziato", "tutto_finanziato", 0, [100], "acconto_finanziato"],
    ["Acconto + finanziato", "acconto_finanziato", 30, [30, 70], "due_acconti_finanziato"],
    ["2 acconti + finanziato", "due_acconti_finanziato", 50, [20, 30, 50], "acconto_finanziato"],
  ] as const)("ogni schema con finanziamento scrive l'anticipo che dicono le sue rate: «%s» → %s%%", (nome, schema, anticipo, attese, da) => {
    t1();
    monta(partenza(da));
    fireEvent.click(screen.getByRole("button", { name: nome }));
    expect(ultimo("schema_pagamento")).toBe(schema);
    expect(percentuali()).toEqual(attese);
    expect(Math.abs((ultimo("fin_anticipo_pct") as number) - anticipo)).toBeLessThan(1e-9);
    expect(anticipoDelleRate(11_000)).toBeCloseTo((11_000 * anticipo) / 100, 6);
    expect(campoAnticipo().value).toBe(String(anticipo));
  });

  it("un tasto dell'anticipo (40%) rifà le rate: acconto 40%, finanziamento 60%; il piano segue (6.600 da finanziare) e la pagina dice la stessa cifra", () => {
    t1();
    monta(COMPLETO);
    fireEvent.click(chip(40));
    expect(ultimo("fin_anticipo_pct")).toBe(40);
    expect(percentuali()).toEqual([40, 60]);
    expect(rate().map((r) => r.label)).toEqual(["Acconto alla firma", "Finanziamento"]);
    expect(piani()[0]).toMatchObject({ mesi: 48, anticipo: 4_400, finanziato: 6_600 });
    expect(within(scheda()).getByText("€ 4.400")).toBeTruthy();
    expect(within(schedaPaga()).getByText("€ 4.400")).toBeTruthy();
    expect(within(schedaPaga()).getByText("€ 6.600")).toBeTruthy();
    expect(anticipoDelleRate(11_000)).toBe(4_400);
  });

  it("anticipo 0%: restano solo le rate del finanziamento e lo schema è «Tutto finanziato»; poi 30%: torna l'acconto, e lo schema «Acconto + finanziato»", () => {
    t1();
    monta(finanziato);
    fireEvent.click(chip(0));
    expect(ultimo("fin_anticipo_pct")).toBe(0);
    expect(rate()).toEqual([{ label: "Finanziamento", percentuale: 100, when: "Erogato all'inizio lavori" }]);
    expect(ultimo("schema_pagamento")).toBe("tutto_finanziato");
    expect(screen.getByRole("button", { name: "Tutto finanziato" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(chip(30));
    expect(ultimo("fin_anticipo_pct")).toBe(30);
    expect(rate()).toEqual([
      { label: "Acconto alla firma", percentuale: 30, when: "Firma contratto" },
      { label: "Finanziamento", percentuale: 70, when: "Erogato all'inizio lavori" },
    ]);
    expect(ultimo("schema_pagamento")).toBe("acconto_finanziato");
  });

  it("due acconti: l'anticipo si divide nelle proporzioni di prima (20:30) e lo schema resta «2 acconti + finanziato»", () => {
    t1();
    monta({ schema_pagamento: "due_acconti_finanziato", pagamento_milestones: [
      { label: "Acconto alla firma", percentuale: 20, when: "Firma contratto" },
      { label: "Acconto arrivo merce", percentuale: 30, when: "Merce in magazzino" },
      { label: "Finanziamento", percentuale: 50, when: "Erogato all'inizio lavori" },
    ], fin_anticipo_pct: 50 });
    fireEvent.click(chip(40));
    expect(percentuali()).toEqual([16, 24, 60]);
    expect(ultimo("fin_anticipo_pct")).toBe(40);
    expect(ultimo("schema_pagamento") ?? "due_acconti_finanziato").toBe("due_acconti_finanziato");
    expect(rate().map((r) => r.label)).toEqual(["Acconto alla firma", "Acconto arrivo merce", "Finanziamento"]);
  });

  it("cambiare una rata cambia l'anticipo (e il piano che c'è lo segue): acconto 30 → 35 fa anticipo 35%", () => {
    t1();
    monta(COMPLETO);
    fireEvent.change(screen.getByLabelText("Percentuale dello step 1"), { target: { value: "35" } });
    expect(percentuali()).toEqual([35, 65]);
    expect(ultimo("fin_anticipo_pct")).toBe(35);
    expect(piani()[0]).toMatchObject({ anticipo: 3_850, finanziato: 7_150 });
    expect(campoAnticipo().value).toBe("35");
    expect(within(scheda()).getByText("€ 3.850")).toBeTruthy();
    expect(screen.queryByText(/il preventivo dice due cose/)).toBeNull();
  });

  it("una rata aggiunta dopo il finanziamento conta come anticipo (il cliente la paga di tasca sua): 30 + 10 → 40%", () => {
    t1();
    monta(COMPLETO);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi step" }));
    fireEvent.change(screen.getByLabelText("Nome dello step 3"), { target: { value: "Saldo posa" } });
    // l'ultima rata si decide scrivendola: 10, e il finanziamento scende a 60 perché il totale torni a 100
    fireEvent.change(screen.getByLabelText("Percentuale dello step 3"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Percentuale dello step 2"), { target: { value: "60" } });
    expect(percentuali()).toEqual([30, 60, 10]);
    expect(ultimo("fin_anticipo_pct")).toBe(40);
  });

  it("il piano manuale segue le rate: cambiando una rata (e quindi l'anticipo) i due piani si rifanno sul nuovo importo da finanziare", () => {
    stato.tabelle = [];
    const salvato = pianiManuali({ totale: 11_000, anticipoPct: 30, piani: PIANO_MANUALE_DI_SERIE });
    monta({ ...finanziato, fin_piani: salvato });
    expect(scritto("fin_piani")).toEqual([]);
    fireEvent.change(screen.getByLabelText("Percentuale dello step 1"), { target: { value: "35" } });
    expect(ultimo("fin_anticipo_pct")).toBe(35);
    expect(piani()).toEqual(pianiManuali({ totale: 11_000, anticipoPct: 35, piani: PIANO_MANUALE_DI_SERIE }));
    expect(piani().map((p) => p.anticipo)).toEqual([3_850, 3_850]);
  });

  it("tornare al finanziamento da un bonifico rimette il piano con l'anticipo delle rate dello schema (30%), non con quello di prima (40%)", () => {
    t1();
    const prima = { ...COMPLETO, fin_anticipo_pct: 40, fin_piani: [{ ...PIANO_48, anticipo: 4_400, finanziato: 6_600 }] };
    monta(prima);
    fireEvent.click(screen.getByRole("button", { name: "Bonifico" }));
    expect(ultimo("fin_piani")).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Finanziamento" }));
    expect(ultimo("fin_anticipo_pct")).toBe(30);
    expect(piani()[0]).toMatchObject({ mesi: 48, anticipo: 3_300, finanziato: 7_700 });
    // il piano si riscrive UNA volta (subito giusto), non prima con il 40% e poi con il 30%: toglierlo col bonifico, rimetterlo
    expect(scritto("fin_piani")).toHaveLength(2);
  });

  it("«Personalizzato» non è legato: non si sa quale rata sia il finanziamento, e anticipo e rate restano indipendenti", () => {
    stato.tabelle = [];
    monta({
      schema_pagamento: "personalizzato", fin_anticipo_pct: 40,
      pagamento_milestones: [{ label: "Prima", percentuale: 50, when: null }, { label: "Seconda", percentuale: 50, when: null }],
    });
    expect(screen.queryByText(/il preventivo dice due cose/)).toBeNull();
    fireEvent.click(chip(20));
    expect(ultimo("fin_anticipo_pct")).toBe(20);
    expect(scritto("pagamento_milestones")).toEqual([]);
    fireEvent.change(screen.getByLabelText("Percentuale dello step 1"), { target: { value: "60" } });
    expect(percentuali()).toEqual([60, 40]);
    expect(scritto("fin_anticipo_pct")).toEqual([20]); // solo quella del tasto
  });

  it("un bonifico non ha anticipo di finanziamento: scegliere gli schemi del bonifico non scrive l'anticipo", () => {
    monta({ schema_pagamento: "tre_step", pagamento_milestones: RATE_TRE_STEP, fin_anticipo_pct: 40 });
    fireEvent.click(screen.getByRole("button", { name: "2 acconti + saldo" }));
    fireEvent.change(screen.getByLabelText("Percentuale dello step 1"), { target: { value: "35" } });
    expect(scritto("pagamento_milestones").length).toBeGreaterThan(0);
    expect(scritto("fin_anticipo_pct")).toEqual([]);
  });

  describe("un preventivo di prima, con rate e anticipo che si contraddicono (rate 30/70, anticipo 40)", () => {
    const contraddittorio = { ...finanziato, fin_anticipo_pct: 40 };
    const avviso = () => screen.queryByText(/il preventivo dice due cose/);

    it("aprendolo non si scrive niente (non si cambiano a sorpresa gli importi di un preventivo già fatto), ma la scheda lo dice", () => {
      t1();
      monta(contraddittorio);
      expect(stato.scritture.filter(([c]) => campiDelPagamento(c) || /^fin_/.test(c))).toEqual([]);
      const testo = avviso()?.closest("p")?.textContent ?? "";
      expect(testo).toMatch(/Le rate sopra hanno un anticipo del 30% \(€ 3\.300\), qui è del 40%/);
      // la scheda continua a dire quello che sta scritto (e che il PDF stampa): 40%
      expect(campoAnticipo().value).toBe("40");
    });

    it("«Usa il 30%» allinea l'anticipo alle rate: scrive 30, le rate restano com'erano, e l'avviso sparisce", () => {
      t1();
      monta({ ...contraddittorio, fin_tabella_id: "t1", fin_tabella_riga_id: "r-48-8000", fin_piani: [{ ...PIANO_48, anticipo: 4_400, finanziato: 6_600 }] });
      fireEvent.click(screen.getByRole("button", { name: "Usa il 30%" }));
      expect(ultimo("fin_anticipo_pct")).toBe(30);
      expect(scritto("pagamento_milestones")).toEqual([]);
      expect(piani()[0]).toMatchObject({ anticipo: 3_300, finanziato: 7_700 });
      expect(avviso()).toBeNull();
    });

    it("scegliere un tasto qualunque risolve la contraddizione: vale quello che si è scelto (le rate lo seguono)", () => {
      t1();
      monta(contraddittorio);
      fireEvent.click(chip(40));
      expect(percentuali()).toEqual([40, 60]);
      expect(avviso()).toBeNull();
    });

    it("senza contraddizione (rate 30/70, anticipo 30), per un bonifico e per «Personalizzato» l'avviso non c'è", () => {
      t1();
      monta(finanziato);
      expect(avviso()).toBeNull();
      cleanup();
      monta({ schema_pagamento: "tre_step", pagamento_milestones: RATE_TRE_STEP, fin_anticipo_pct: 40 });
      expect(avviso()).toBeNull();
      cleanup();
      stato.tabelle = [];
      monta({ schema_pagamento: "personalizzato", pagamento_milestones: RATE_FINANZIATO, fin_anticipo_pct: 40 });
      expect(avviso()).toBeNull();
    });
  });

  describe("il campo dell'anticipo", () => {
    it("si può svuotare per riscrivere: finché è vuoto non si scrive niente (0% toglierebbe le rate dell'acconto); scrivendo 25 si scrive 25", () => {
      t1();
      monta(finanziato);
      fireEvent.change(campoAnticipo(), { target: { value: "" } });
      expect(campoAnticipo().value).toBe("");
      expect(stato.scritture.filter(([c]) => campiDelPagamento(c))).toEqual([]);
      fireEvent.change(campoAnticipo(), { target: { value: "25" } });
      expect(ultimo("fin_anticipo_pct")).toBe(25);
      expect(percentuali()).toEqual([25, 75]);
      expect(campoAnticipo().value).toBe("25");
    });

    it("uscendo dal campo vuoto torna il valore scritto", () => {
      t1();
      monta(finanziato);
      fireEvent.change(campoAnticipo(), { target: { value: "" } });
      fireEvent.blur(campoAnticipo());
      expect(campoAnticipo().value).toBe("30");
      expect(scritto("fin_anticipo_pct")).toEqual([]);
    });

    it("un anticipo con troppe cifre si arrotonda al centesimo (come la colonna del database) e le rate lo seguono al centesimo", () => {
      t1();
      monta(finanziato);
      fireEvent.change(campoAnticipo(), { target: { value: "33.333" } });
      expect(ultimo("fin_anticipo_pct")).toBe(33.33);
      expect(percentuali()).toEqual([33.33, 66.67]);
    });

    it("uno 0 scritto apposta vale 0: tutto finanziato", () => {
      t1();
      monta(finanziato);
      fireEvent.change(campoAnticipo(), { target: { value: "0" } });
      expect(ultimo("fin_anticipo_pct")).toBe(0);
      expect(percentuali()).toEqual([100]);
    });
  });
});

describe("8. oltre l'ultima fascia della tabella: nessuna rata sbagliata, un messaggio che dice cosa fare", () => {
  const t1 = () => { stato.tabelle = [TABELLA("t1", "Prestito Casa")]; stato.righe = { t1: RIGHE_TABELLA("t1") }; };
  const campoAnticipo = () => screen.getByLabelText("Anticipo in percentuale") as HTMLInputElement;
  const durate = () => screen.queryByRole("group", { name: "Quante rate" });
  const piani = () => ultimo("fin_piani") as Array<Record<string, unknown>>;
  const messaggio = () => screen.queryByText(/Fuori fascia\./)?.closest("p") ?? null;
  const finanziato = { schema_pagamento: "acconto_finanziato" as const, pagamento_milestones: RATE_FINANZIATO, fin_anticipo_pct: 30 };
  /** 20.000 € + IVA 10% = 22.000 €; la tabella arriva a 12.000: con anticipo 30% da finanziare ce ne sono 15.400. */
  const GRANDE = () => conPrezzo(20_000);
  /** Il preventivo da 22.000 € con anticipo 50% (rate 50/50) e il piano da tabella scritto per 11.000 da finanziare. */
  const GRANDE_COMPLETO: Partial<SrProgettoRow> = {
    schema_pagamento: "acconto_finanziato", pagamento_milestones: [
      { label: "Acconto alla firma", percentuale: 50, when: "Firma contratto" },
      { label: "Finanziamento", percentuale: 50, when: "Erogato all'inizio lavori" },
    ], fin_anticipo_pct: 50, fin_tabella_id: "t1", fin_tabella_riga_id: "r-48-12000",
    fin_piani: [{ nome: "Prestito Casa", mesi: 48, tasso: 5.9, rata_mese: 302.4, anticipo: 11_000, finanziato: 11_000 }],
  };

  it("importo da finanziare oltre l'ultima fascia: nessun tasto con una rata, e il messaggio con le cifre e cosa fare", () => {
    t1();
    monta(finanziato, GRANDE());
    expect(durate()).toBeNull();
    expect(screen.queryByText(/\/mese/)).toBeNull();
    const testo = messaggio()?.textContent ?? "";
    expect(testo).toMatch(/L'importo da finanziare \(€ 15\.400\) supera le fasce della tabella \(fino a € 12\.000\)/);
    expect(testo).toMatch(/non c'è nessuna rata da mostrare/);
    expect(testo).toMatch(/Aumenta l'anticipo, scegli un'altra tabella o usa la modalità manuale/);
    // non è il messaggio della tabella vuota
    expect(screen.queryByText(/non ha ancora righe/)).toBeNull();
    // e non si scrive nessun piano da tabella
    expect(scritto("fin_piani")).toEqual([]);
    expect(scritto("fin_tabella_riga_id")).toEqual([]);
  });

  it("dentro le fasce il messaggio non c'è e le rate sono quelle della fascia giusta (come prima)", () => {
    t1();
    monta(finanziato);
    expect(messaggio()).toBeNull();
    expect(durate()).toBeTruthy();
    expect(screen.getByRole("button", { name: /^48 rate/ }).textContent).toMatch(/€ 202\/mese/);
  });

  it("un anticipo che riporta l'importo nelle fasce (50%: da finanziare 11.000) fa tornare i tasti, con le rate giuste", () => {
    t1();
    monta(finanziato, GRANDE());
    expect(durate()).toBeNull();
    fireEvent.change(campoAnticipo(), { target: { value: "50" } });
    expect(messaggio()).toBeNull();
    const tasto48 = screen.getByRole("button", { name: /^48 rate/ });
    expect(tasto48.textContent).toMatch(/€ 302\/mese/); // fascia 12.000 × 0,0252
    fireEvent.click(tasto48);
    expect(piani()).toEqual([{ nome: "Prestito Casa", mesi: 48, tasso: 5.9, rata_mese: 302.4, anticipo: 11_000, finanziato: 11_000 }]);
  });

  it("le durate che non arrivano a quell'importo non hanno tasto e sono elencate; le altre hanno la rata", () => {
    t1();
    // a 84 mesi la tabella arriva solo a 8.000: per 11.000 da finanziare quella durata è fuori fascia
    stato.righe = { t1: RIGHE_TABELLA("t1").filter((r) => !(r.durata_mesi === 84 && r.importo_erogato === 12000)) };
    monta({ ...finanziato, fin_anticipo_pct: 0, pagamento_milestones: [{ label: "Finanziamento", percentuale: 100, when: "Erogato" }], schema_pagamento: "tutto_finanziato" });
    expect(screen.queryByRole("button", { name: /^84 rate/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^60 rate/ })).toBeTruthy();
    expect(screen.getByText(/Senza rata a questo importo \(oltre l'ultima fascia\): 84 mesi\./)).toBeTruthy();
    expect(messaggio()).toBeNull();
  });

  it("un piano da tabella già scritto che esce dalle fasce (il totale sale) si toglie: nel PDF non resta la rata di prima", () => {
    t1();
    const { conRighe } = monta(COMPLETO);
    expect(scritto("fin_piani")).toEqual([]);
    conRighe(GRANDE());
    expect(ultimo("fin_piani")).toEqual([]);
    expect(ultimo("fin_tabella_riga_id")).toBeNull();
    expect(messaggio()).toBeTruthy();
    expect(durate()).toBeNull();
  });

  it("...e quando l'importo rientra nelle fasce quel piano torna da solo, con la stessa durata e la rata della fascia giusta", () => {
    t1();
    const { conRighe } = monta(COMPLETO);
    conRighe(GRANDE());
    expect(ultimo("fin_piani")).toEqual([]);
    conRighe(dettaglio());
    expect(ultimo("fin_tabella_riga_id")).toBe("r-48-8000");
    expect(piani()[0]).toMatchObject({ mesi: 48, anticipo: 3_300, finanziato: 7_700, rata_mese: 201.6 });
  });

  it("aprendo un preventivo salvato con la rata dell'ultima fascia (quella sbagliata) la si toglie, e la scheda dice perché", () => {
    t1();
    monta({ ...GRANDE_COMPLETO, fin_anticipo_pct: 30, pagamento_milestones: RATE_FINANZIATO,
      fin_piani: [{ nome: "Prestito Casa", mesi: 48, tasso: 5.9, rata_mese: 302.4, anticipo: 6_600, finanziato: 15_400 }] }, GRANDE());
    expect(ultimo("fin_piani")).toEqual([]);
    expect(ultimo("fin_tabella_riga_id")).toBeNull();
    expect(messaggio()?.textContent).toMatch(/supera le fasce della tabella/);
    // con la tabella e la tabella scelta ancora al loro posto
    expect(scritto("fin_tabella_id")).toEqual([]);
  });

  it("scrivere l'anticipo cifra per cifra non perde la scelta: «3» esce dalle fasce, «50» rientra, e il piano torna", () => {
    t1();
    monta(GRANDE_COMPLETO, GRANDE());
    expect(scritto("fin_piani")).toEqual([]);
    fireEvent.change(campoAnticipo(), { target: { value: "3" } });
    expect(ultimo("fin_piani")).toEqual([]); // 21.340 da finanziare: oltre l'ultima fascia
    expect(messaggio()).toBeTruthy();
    fireEvent.change(campoAnticipo(), { target: { value: "50" } });
    expect(messaggio()).toBeNull();
    expect(piani()[0]).toMatchObject({ mesi: 48, finanziato: 11_000 });
    expect(ultimo("fin_tabella_riga_id")).toBe("r-48-12000");
  });

  it("scegliere un'altra tabella dimentica la durata: se poi l'importo rientra non torna un piano che l'utente non ha scelto", async () => {
    stato.tabelle = [TABELLA("t1", "Prestito Casa"), TABELLA("t2", "Casa Facile")];
    stato.righe = { t1: RIGHE_TABELLA("t1"), t2: RIGHE_TABELLA("t2") };
    const { conRighe } = monta(COMPLETO);
    conRighe(GRANDE()); // fuori fascia: il piano si toglie e la durata (48) si ricorda
    expect(ultimo("fin_piani")).toEqual([]);
    fireEvent.pointerDown(screen.getByRole("combobox", { name: "Tabella finanziamento" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(await screen.findByRole("option", { name: /Casa Facile/ }));
    expect(ultimo("fin_tabella_id")).toBe("t2");
    conRighe(dettaglio()); // l'importo rientra nelle fasce
    expect(ultimo("fin_piani")).toEqual([]);
    expect(ultimo("fin_tabella_riga_id")).toBeNull();
  });

  it("passare al piano manuale e tornare a «Da tabella» dimentica la durata: nessun piano da tabella torna da solo", () => {
    t1();
    const { conRighe } = monta(COMPLETO);
    conRighe(GRANDE()); // fuori fascia: il piano si toglie e la durata si ricorda
    fireEvent.click(screen.getByRole("tab", { name: /^Manuale/ }));
    expect(piani().map((p) => p.nome)).toEqual(["Estesa", "Standard"]); // da lì il piano è quello manuale
    fireEvent.click(screen.getByRole("tab", { name: /^Da tabella/ }));
    expect(ultimo("fin_piani")).toEqual([]); // «finché non si sceglie una durata non c'è nessun piano»
    conRighe(dettaglio());
    expect(ultimo("fin_piani")).toEqual([]);
    expect(ultimo("fin_tabella_riga_id")).toBeNull();
  });

  it("finché le righe della tabella non sono arrivate non si sa se l'importo è fuori fascia: il piano scritto non si tocca, nemmeno toccando l'anticipo", () => {
    stato.tabelle = [TABELLA("t1", "Prestito Casa")];
    stato.righe = {}; // non ancora arrivate
    monta(COMPLETO, GRANDE());
    expect(stato.scritture.filter(([c]) => /^fin_/.test(c))).toEqual([]);
    fireEvent.click(within(screen.getByRole("group", { name: "Anticipo" })).getByRole("button", { name: "40%" }));
    expect(ultimo("fin_anticipo_pct")).toBe(40);
    expect(scritto("fin_piani")).toEqual([]);
    expect(scritto("fin_tabella_riga_id")).toEqual([]);
  });

  it("passando da un bonifico a «Personalizzato» il piano da tabella non torna da solo: la simulazione non è nel preventivo", () => {
    t1();
    monta(COMPLETO);
    fireEvent.click(screen.getByRole("button", { name: "Bonifico" })); // toglie il piano e ne ricorda la durata
    expect(ultimo("fin_piani")).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Personalizzato" }));
    expect(ultimo("fin_piani")).toEqual([]);
    expect(ultimo("fin_tabella_riga_id")).toBeNull();
    // e tornando a «Finanziamento» sì: lì il piano torna con la durata di prima
    fireEvent.click(screen.getByRole("button", { name: "Finanziamento" }));
    expect(ultimo("fin_tabella_riga_id")).toBe("r-48-8000");
    expect(piani()[0]).toMatchObject({ mesi: 48, finanziato: 7_700 });
  });

  it("il piano manuale non ha fasce: con lo stesso importo grande segue il totale come prima, senza messaggi", () => {
    t1();
    const manuale = pianiManuali({ totale: 11_000, anticipoPct: 30, piani: PIANO_MANUALE_DI_SERIE });
    const { conRighe } = monta({ ...finanziato, fin_tabella_id: null, fin_tabella_riga_id: null, fin_piani: manuale });
    expect(scritto("fin_piani")).toEqual([]);
    conRighe(GRANDE());
    expect(piani()).toEqual(pianiManuali({ totale: 22_000, anticipoPct: 30, piani: PIANO_MANUALE_DI_SERIE }));
    expect(messaggio()).toBeNull();
  });
});

describe("9. la detrazione: lo step scrive l'aliquota; gli importi che seguono il totale li allinea il wizard, una volta sola", () => {
  const eco = (aliquota: number, totale = 11_000) => calcolaEcobonus({ imponibile_eur: totale, aliquota });
  const scrittureDetrazione = () => ({
    aliquota: scritto("detrazione_aliquota"), totale: scritto("detrazione_eur_totale"), anno: scritto("detrazione_eur_anno"),
  });
  const interruttoreDetrazione = () => screen.getAllByRole("switch")[0];

  it("preventivo che non l'ha mai avuta: la mostra accesa al 50% e la scrive (aliquota e importi), altrimenti il PDF esce senza", () => {
    monta({ detrazione_aliquota: null, detrazione_eur_totale: null, detrazione_eur_anno: null });
    expect(scrittureDetrazione()).toEqual({ aliquota: [50], totale: [eco(50).detrazione_totale], anno: [eco(50).rata_annuale] });
  });

  it("aliquota già scritta ma importi rimasti indietro (il totale è cambiato): lo step non scrive niente, li riallinea il wizard", () => {
    monta({ detrazione_aliquota: 50, detrazione_eur_totale: 3850, detrazione_eur_anno: 385 });
    expect(scrittureDetrazione()).toEqual({ aliquota: [], totale: [], anno: [] });
  });

  it("il totale cambia con l'aliquota già scritta: lo step non riscrive né l'aliquota né gli importi", () => {
    const { conRighe } = monta(COMPLETO);
    conRighe(conPrezzo(20_000));
    expect(scrittureDetrazione()).toEqual({ aliquota: [], totale: [], anno: [] });
  });

  it("l'interruttore spento scrive 0 (esclusa) e nient'altro; riacceso scrive l'aliquota e gli importi di adesso", () => {
    monta(COMPLETO);
    fireEvent.click(interruttoreDetrazione());
    expect(scrittureDetrazione()).toEqual({ aliquota: [0], totale: [], anno: [] });
    fireEvent.click(interruttoreDetrazione());
    expect(scrittureDetrazione()).toEqual({
      aliquota: [0, 50], totale: [eco(50).detrazione_totale], anno: [eco(50).rata_annuale],
    });
  });

  it("un'altra aliquota (36%) scrive l'aliquota e gli importi di quel momento", async () => {
    monta(COMPLETO);
    const tendina = screen.getAllByRole("combobox").find((c) => /Prima casa/.test(c.textContent ?? "")) as HTMLElement;
    fireEvent.pointerDown(tendina, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(await screen.findByRole("option", { name: /36%/ }));
    expect(scrittureDetrazione()).toEqual({ aliquota: [36], totale: [eco(36).detrazione_totale], anno: [eco(36).rata_annuale] });
  });

  it("un'aliquota di prima non più proponibile (65%): lo step mostra il 50% e lo scrive, con gli importi giusti", () => {
    monta({ ...COMPLETO, detrazione_aliquota: 65, detrazione_eur_totale: 7150, detrazione_eur_anno: 715 });
    expect(scrittureDetrazione()).toEqual({ aliquota: [50], totale: [eco(50).detrazione_totale], anno: [eco(50).rata_annuale] });
  });

  it("aprendo un preventivo con la detrazione allineata non si scrive niente", () => {
    monta(COMPLETO);
    expect(scrittureDetrazione()).toEqual({ aliquota: [], totale: [], anno: [] });
  });
});

describe("10. un tocco sullo schema di pagamento GIÀ scelto non tocca le rate", () => {
  // Con l'autosave un tocco riporta subito nel preventivo le rate di serie: prima il reset c'era solo a schermo e partiva
  // col vecchio «Applica calcoli». Il tocco sul chip che è già lo schema scelto non fa niente.
  const CAMPI_PAGAMENTO = ["schema_pagamento", "pagamento_milestones", "fin_anticipo_pct", "fin_piani", "fin_tabella_id", "fin_tabella_riga_id"];
  const scrittureDelPagamento = () => stato.scritture.filter(([c]) => CAMPI_PAGAMENTO.includes(c));
  const percentualiASchermo = () => [1, 2, 3, 4].flatMap((n) => {
    const campo = screen.queryByLabelText(`Percentuale dello step ${n}`) as HTMLInputElement | null;
    return campo ? [Number(campo.value)] : [];
  });

  it("«Personalizzato» con tre rate scritte a mano: toccarlo ancora non le cancella", () => {
    monta({
      schema_pagamento: "personalizzato",
      pagamento_milestones: [
        { label: "Anticipo", percentuale: 20, when: "Firma" },
        { label: "Intermedio", percentuale: 30, when: null },
        { label: "Saldo", percentuale: 50, when: "Fine lavori" },
      ],
    });
    expect(percentualiASchermo()).toEqual([20, 30, 50]);
    fireEvent.click(screen.getByRole("button", { name: "Personalizzato" }));
    expect(scrittureDelPagamento()).toEqual([]);
    expect(percentualiASchermo()).toEqual([20, 30, 50]);
  });

  it("«3 step» con rate 25/50/25 scritte a mano: toccarlo ancora non le riporta a 30/40/30", () => {
    monta({ schema_pagamento: "tre_step", pagamento_milestones: RATE_TRE_STEP.map((r, i) => ({ ...r, percentuale: [25, 50, 25][i] })) });
    expect(percentualiASchermo()).toEqual([25, 50, 25]);
    fireEvent.click(screen.getByRole("button", { name: /^3 step/ }));
    expect(scrittureDelPagamento()).toEqual([]);
    expect(percentualiASchermo()).toEqual([25, 50, 25]);
  });

  it("«Acconto + finanziato» con rate 35/65, anticipo 35 e piano scritto: toccarlo ancora non riporta a 30/70 né rifà il piano", () => {
    stato.tabelle = [TABELLA("t1", "Prestito Casa")];
    stato.righe = { t1: RIGHE_TABELLA("t1") };
    monta({
      schema_pagamento: "acconto_finanziato",
      pagamento_milestones: [
        { label: "Acconto alla firma", percentuale: 35, when: "Firma contratto" },
        { label: "Finanziamento", percentuale: 65, when: "Erogato all'inizio lavori" },
      ],
      fin_anticipo_pct: 35, fin_tabella_id: "t1", fin_tabella_riga_id: "r-48-8000",
      fin_piani: [{ nome: "Prestito Casa", mesi: 48, tasso: 5.9, rata_mese: 201.6, anticipo: 3_850, finanziato: 7_150 }],
    });
    expect(percentualiASchermo()).toEqual([35, 65]);
    fireEvent.click(screen.getByRole("button", { name: "Acconto + finanziato" }));
    expect(scrittureDelPagamento()).toEqual([]);
    expect(percentualiASchermo()).toEqual([35, 65]);
    expect((screen.getByLabelText("Anticipo in percentuale") as HTMLInputElement).value).toBe("35");
  });

  it("un preventivo di prima con rate e senza schema scritto: il chip che a schermo è acceso («3 step», come nel PDF) non riscrive niente", () => {
    monta({ schema_pagamento: null, pagamento_milestones: RATE_TRE_STEP.map((r, i) => ({ ...r, percentuale: [25, 50, 25][i] })) });
    fireEvent.click(screen.getByRole("button", { name: /^3 step/ }));
    expect(scrittureDelPagamento()).toEqual([]);
  });

  it("un altro schema invece si applica come sempre: scrive lo schema e le sue rate", () => {
    monta({ schema_pagamento: "tre_step", pagamento_milestones: RATE_TRE_STEP.map((r, i) => ({ ...r, percentuale: [25, 50, 25][i] })) });
    fireEvent.click(screen.getByRole("button", { name: "2 acconti + saldo" }));
    expect(ultimo("schema_pagamento")).toBe("due_acconti_saldo");
    expect((ultimo("pagamento_milestones") as Array<{ percentuale: number }>).map((r) => r.percentuale)).toEqual([30, 40, 30]);
  });

  it("e «Personalizzato» da un altro schema si applica: parte senza rate, da scrivere", () => {
    monta({ schema_pagamento: "tre_step", pagamento_milestones: RATE_TRE_STEP });
    fireEvent.click(screen.getByRole("button", { name: "Personalizzato" }));
    expect(ultimo("schema_pagamento")).toBe("personalizzato");
    expect(ultimo("pagamento_milestones")).toEqual([]);
  });
});

describe("11. un preventivo già deciso (firmato, accettato, in commessa) non si riscrive da solo", () => {
  // Il piano di finanziamento, la detrazione e il resto fanno parte di ciò che il cliente ha firmato, e il PDF si rifà dai
  // dati salvati: aprendo Economia, o cambiando un prezzo da un altro passo, lo step non scrive niente. Chi lavora può
  // sempre scegliere (tasti, rate, durate): quelle sono scritture sue.
  const t1 = () => { stato.tabelle = [TABELLA("t1", "Prestito Casa")]; stato.righe = { t1: RIGHE_TABELLA("t1") }; };
  /** Le finestre allo stesso numero ma a un altro prezzo (totale = prezzo + IVA 10%), col preventivo nello stato dato. */
  const conStato = (extra: Partial<SrProgettoRow>, prezzoTotale = 10_000): SrProgettoDetail => dettaglio({
    progetto: { ...PROGETTO, ...extra } as SrProgettoRow,
    serramenti: [{ ...FINESTRE, prezzo_unitario: prezzoTotale / 4, prezzo_totale: prezzoTotale } as SrSerramentoRow],
  });
  const MOTIVI: Array<[string, Partial<SrProgettoRow>, string]> = [
    ["accettato (stato)", { stato: "accettato" }, "accettato"],
    ["firmato (data della firma)", { stato: "consegnato", firmato_il: "2026-10-05T09:00:00Z" }, "firmato"],
    ["firmato (immagine della firma)", { stato: "in_valutazione", firma_cliente_url: "firme/p1.png" }, "firmato"],
    ["in commessa", { stato: "consegnato", ordine_id: "o1" }, "in commessa"],
  ];
  const AVVISO = /non corrisponde al totale attuale/;
  const avviso = () => screen.queryByText(AVVISO);
  const APERTO: Partial<SrProgettoRow> = { stato: "consegnato", firmato_il: null, firma_cliente_url: null, ordine_id: null };

  it.each(MOTIVI)("%s: il totale cambia da un altro passo e il piano resta com'era (zero scritture), e la scheda lo dice", (_nome, extra, parola) => {
    t1();
    const { conRighe } = monta(COMPLETO, conStato(extra));
    expect(avviso()).toBeNull(); // piano e totale tornano: niente avviso
    conRighe(conStato(extra, 9_000));
    expect(stato.scritture).toEqual([]);
    expect(screen.getByText(new RegExp(`Il preventivo è già ${parola}: il piano di finanziamento non corrisponde al totale attuale`))).toBeTruthy();
  });

  it.each(MOTIVI)("%s: aprendo Economia con il piano già indietro non scrive niente, e c'è l'avviso", (_nome, extra, parola) => {
    t1();
    monta(COMPLETO, conStato(extra, 9_000));
    expect(stato.scritture).toEqual([]);
    expect(screen.getByText(new RegExp(`Il preventivo è già ${parola}: il piano di finanziamento non corrisponde`))).toBeTruthy();
  });

  it("lo stesso preventivo ancora aperto (consegnato, senza firma né commessa) il piano lo riscrive sul totale di adesso, e non c'è l'avviso", () => {
    t1();
    monta(COMPLETO, conStato(APERTO, 9_000));
    expect((ultimo("fin_piani") as Array<{ finanziato: number }>)[0].finanziato).toBe(6_930);
    expect(avviso()).toBeNull();
  });

  it("oltre l'ultima fascia della tabella il piano di un preventivo deciso non si toglie da solo: l'avviso c'è, i dati restano", () => {
    t1();
    const { conRighe } = monta(COMPLETO, conStato({ stato: "accettato" }));
    conRighe(conStato({ stato: "accettato" }, 20_000));
    expect(stato.scritture).toEqual([]);
    expect(avviso()).toBeTruthy();
  });

  it("l'avviso non ha pulsanti: niente che cambi il piano da solo", () => {
    t1();
    monta(COMPLETO, conStato({ stato: "accettato" }, 9_000));
    const riquadro = avviso()?.closest(".rounded-md") as HTMLElement;
    expect(riquadro).toBeTruthy();
    expect(within(riquadro).queryAllByRole("button")).toEqual([]);
  });

  it.each(MOTIVI)("%s: nemmeno il valore di partenza della detrazione (preventivo che non l'ha mai avuta) né l'aliquota di prima si scrivono da soli", (_nome, extra) => {
    monta({ detrazione_aliquota: null, detrazione_eur_totale: null, detrazione_eur_anno: null }, conStato(extra));
    expect(stato.scritture).toEqual([]);
    cleanup();
    monta({ detrazione_aliquota: 65, detrazione_eur_totale: 7150, detrazione_eur_anno: 715 }, conStato(extra));
    expect(stato.scritture).toEqual([]);
  });

  it("il recupero in 10 anni (payback) di un preventivo deciso non si riscrive quando il totale cambia", () => {
    t1();
    const { conRighe } = monta(COMPLETO, conStato({ stato: "accettato" }));
    conRighe(conStato({ stato: "accettato" }, 9_000));
    expect(scritto("payback_anni")).toEqual([]);
  });

  it("la regola di sconto collegata al preventivo (discount_rule_id) non si riscrive da sola se il preventivo è deciso", () => {
    stato.regole = [regola({})];
    monta({ discount_rule_id: null }, conStato({ stato: "accettato" }));
    expect(scritto("discount_rule_id")).toEqual([]);
    cleanup();
    monta({ discount_rule_id: null }, conStato(APERTO));
    expect(scritto("discount_rule_id")).toEqual(["r1"]); // aperto: si collega, come sempre
  });

  it("le scelte di chi lavora si scrivono anche su un preventivo deciso: un tasto dell'anticipo, una durata", () => {
    t1();
    monta({ ...COMPLETO, fin_piani: [], fin_tabella_riga_id: null }, conStato({ stato: "accettato" }));
    fireEvent.click(screen.getByRole("button", { name: /^60 rate/ }));
    expect(ultimo("fin_tabella_riga_id")).toBe("r-60-8000");
    fireEvent.click(within(screen.getByRole("group", { name: "Anticipo" })).getByRole("button", { name: "40%" }));
    expect(ultimo("fin_anticipo_pct")).toBe(40);
  });
});

describe("12. senza importo (bozza vuota) lo step non scrive la detrazione di partenza", () => {
  // Un preventivo che non ha mai avuto l'aliquota riceve il 50% e gli importi aprendo Economia: con un totale a zero (bozza
  // vuota, serramenti senza prezzo) sono zeri e uno schermo che dice «Non c'è ancora niente da calcolare».
  const vuoto = () => dettaglio({ serramenti: [] });
  const senzaPrezzo = () => dettaglio({ serramenti: [{ ...FINESTRE, prezzo_unitario: 0, prezzo_totale: 0 } as SrSerramentoRow] });
  const MAI_AVUTA: Partial<SrProgettoRow> = { detrazione_aliquota: null, detrazione_eur_totale: null, detrazione_eur_anno: null };

  it("una bozza vuota (né serramenti né importi) aperta su Economia non scrive niente: lo schermo dice che non c'è niente da calcolare", () => {
    monta(MAI_AVUTA, vuoto(), vi.fn());
    expect(screen.getByText(/Non c'è ancora niente da calcolare/)).toBeTruthy();
    expect(stato.scritture).toEqual([]);
  });

  it("serramenti senza prezzo (importo zero): nessuna scrittura, la scheda c'è e la detrazione si mostra a zero", () => {
    monta(MAI_AVUTA, senzaPrezzo());
    expect(screen.getByText("Sconto %")).toBeTruthy();
    expect(stato.scritture).toEqual([]);
  });

  it("nemmeno l'aliquota di prima non più proponibile (65%) si scrive senza importo", () => {
    monta({ detrazione_aliquota: 65, detrazione_eur_totale: 0, detrazione_eur_anno: 0 }, vuoto(), vi.fn());
    expect(stato.scritture).toEqual([]);
  });

  it("appena l'importo c'è (si aggiungono le righe e si torna) la detrazione di partenza si scrive: 50% e importi del totale", () => {
    const { conRighe } = monta(MAI_AVUTA, vuoto(), vi.fn());
    expect(stato.scritture).toEqual([]);
    conRighe(dettaglio());
    expect(scritto("detrazione_aliquota")).toEqual([50]);
    expect(scritto("detrazione_eur_totale")).toEqual([ECO_11000.detrazione_totale]);
    expect(scritto("detrazione_eur_anno")).toEqual([ECO_11000.rata_annuale]);
  });

  it("un preventivo con importo e senza aliquota la riceve come sempre (50% e importi)", () => {
    monta(MAI_AVUTA);
    expect(scritto("detrazione_aliquota")).toEqual([50]);
    expect(scritto("detrazione_eur_totale")).toEqual([ECO_11000.detrazione_totale]);
  });

  it("spegnere la detrazione è una scelta di chi lavora e si scrive anche con importo zero", () => {
    monta(MAI_AVUTA, senzaPrezzo());
    fireEvent.click(screen.getAllByRole("switch")[0]);
    expect(scritto("detrazione_aliquota")).toEqual([0]);
  });
});

describe("13. il confronto delle liste non dipende dall'ordine delle chiavi: un valore già uguale non si riscrive a vuoto", () => {
  // Il database dà le rate con le chiavi when, label, percentuale; il codice le scrive label, percentuale, when. Con un
  // confronto per testo (JSON.stringify) due liste uguali risultavano diverse e un tocco le riscriveva.
  const DAL_DATABASE = [
    { when: "Firma contratto", label: "Acconto alla firma", percentuale: 30 },
    { when: "Erogato all'inizio lavori", label: "Finanziamento", percentuale: 70 },
  ];

  it("«Personalizzato» con rate uguali a quelle di «Acconto + finanziato» (chiavi in ordine del database): passando al finanziamento si scrive lo schema, le rate uguali no", () => {
    monta({ schema_pagamento: "personalizzato", pagamento_milestones: DAL_DATABASE as never, fin_anticipo_pct: 30 });
    fireEvent.click(screen.getByRole("button", { name: "Finanziamento" }));
    expect(ultimo("schema_pagamento")).toBe("acconto_finanziato");
    expect(scritto("pagamento_milestones")).toEqual([]);
    expect(scritto("fin_anticipo_pct")).toEqual([]);
  });

  it("con rate diverse invece si scrivono: 35/65 passando al finanziamento tornano 30/70", () => {
    monta({
      schema_pagamento: "personalizzato", fin_anticipo_pct: 35,
      pagamento_milestones: DAL_DATABASE.map((r, i) => ({ ...r, percentuale: [35, 65][i] })) as never,
    });
    fireEvent.click(screen.getByRole("button", { name: "Finanziamento" }));
    expect((ultimo("pagamento_milestones") as Array<{ percentuale: number }>).map((r) => r.percentuale)).toEqual([30, 70]);
  });
});
