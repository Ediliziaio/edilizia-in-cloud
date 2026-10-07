/**
 * «Invia per firma» e lo step Economia (06/10/2026): i controlli del passo PDF (le rate devono fare 100%, il piano di
 * finanziamento deve essere sul totale di adesso) e il salvataggio automatico di Economia devono andare d'accordo.
 *
 * Un preventivo con rate e piano scritti dalla scheda Economia deve poter partire per firma; e se il totale cambia da
 * un altro passo, il controllo si ferma davanti al piano di prima e si sblocca riaprendo Economia, che lo riscrive da
 * solo. Qui i due passi veri (StepEconomia e StepPdf), uno alla volta come nel wizard, sullo stesso preventivo: lo
 * step scrive col suo `onChange`, e il passo PDF legge il preventivo con quelle scritture sopra (è quello che il wizard
 * gli dà: la copia salvata più i campi toccati).
 */
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SrProgettoDetail, SrProgettoRow, SrSerramentoRow } from "@/types/serramenti";
import type { RigaFinanziamento, TabellaFinanziamento } from "@/hooks/useTabelleFinanziamento";

vi.setConfig({ testTimeout: 30_000 });

const stato = vi.hoisted(() => ({
  permessi: { canApproveDiscounts: true, canViewMargins: false, canViewCosts: false },
  tabelle: [] as unknown[],
  righe: {} as Record<string, unknown[]>,
  /** Le proprietà che la scheda di invio ha ricevuto dal passo PDF all'ultimo disegno. */
  invio: null as null | { disabled: boolean; disabledReason: string },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => stato.permessi }));
vi.mock("@/hooks/useDiscountRules", () => ({ useDiscountRules: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/usePrezzoFinaleAMano", () => ({ usePrezzoFinaleAMano: () => ({ data: false, isLoading: false, isError: false }) }));
vi.mock("@/hooks/useFamilies", () => ({ useFamilies: () => ({ families: [] as unknown[], isLoading: false }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useTabelleFinanziamento", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useTabelleFinanziamento")>()),
  useTabelleFinanziamentoAttive: () => ({ data: stato.tabelle, isLoading: false }),
  useTabellaFinanziamentoRighe: (id: string | null) => ({ data: id ? stato.righe[id] ?? [] : [], isLoading: false }),
}));
vi.mock("@/hooks/useSerramentoPDF", () => ({
  renderSerramentoBlob: vi.fn(),
  useSerramentoPDF: () => ({ downloadPDF: vi.fn(), previewPDF: vi.fn(), isGenerating: false }),
}));
vi.mock("@/lib/serramenti/queries", () => ({
  useTariffeManodopera: () => ({ data: [] as unknown[] }),
  useGeneraPdf: () => ({ mutate: vi.fn(), isPending: false }),
  useConvertiInOrdine: () => ({ mutate: vi.fn(), isPending: false }),
  useTemplatePdf: () => ({ data: null as null }),
  useAziendaPerPdf: () => ({ data: null as null }),
}));
vi.mock("@/components/moduli/InviaFirmaCard", () => ({
  InviaFirmaCard: (props: { disabled: boolean; disabledReason: string }): null => { stato.invio = props; return null; },
}));
vi.mock("@/integrations/supabase/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catena: any = new Proxy({}, {
    get: (_t, p) => p === "then"
      ? (ok: (v: unknown) => unknown) => Promise.resolve({ data: [] as unknown[], error: null as null }).then(ok)
      : p === "maybeSingle" ? () => Promise.resolve({ data: null as null, error: null as null })
      : () => catena,
  });
  return { supabase: { from: () => catena } };
});

import { StepEconomia } from "@/components/serramenti/StepEconomia";
import { StepPdf } from "@/components/serramenti/StepPdf";

/** Quattro finestre da 2.500 €: 10.000 + IVA 10% = 11.000. */
const FINESTRE = (prezzoTotale: number) => ({
  id: "s1", progetto_id: "p1", company_id: "c1", position: 1, tipologia: "finestra_2ante", quantita: 4,
  larghezza_mm: 1200, altezza_mm: 1400, metri_quadri: 6.72, prezzo_unitario: prezzoTotale / 4, prezzo_totale: prezzoTotale,
  family_id: null as string | null, listino_voce_id: null as string | null, posa_esclusa: false,
}) as unknown as SrSerramentoRow;

/** Tutto ciò che il passo PDF vuole perché il documento sia pronto, e i totali salvati coerenti con le posizioni. */
const PROGETTO = (prezzoTotale: number) => ({
  id: "p1", company_id: "c1", code: "SR-2026-0001", stato: "bozza", cliente_nome: "Mario", cliente_cognome: "Rossi",
  cantiere_indirizzo: "Via Roma 12", tipo_intervento: "sostituzione", esigenze: [{ titolo: "Spifferi" }],
  iva_inclusa: true, iva_percentuale: 10, sconto_percentuale: 0, sconto_importo: 0, valido_fino_giorni: 15,
  totale_min: prezzoTotale * 1.1, totale_max: prezzoTotale * 1.1, created_at: "2026-10-01T09:00:00Z",
}) as unknown as SrProgettoRow;

const dettaglio = (prezzoTotale: number): SrProgettoDetail => ({
  progetto: PROGETTO(prezzoTotale), serramenti: [FINESTRE(prezzoTotale)], accessori: [], media: [], risparmio: null as null, servizi: [],
});

const TABELLA = (id: string): TabellaFinanziamento => ({
  id, company_id: "c1", finanziaria_id: "f1", finanziaria_nome: "Compass", nome_prodotto: "Prestito Casa", codice_condizione: null as string | null,
  subtariffa_default: null as string | null, tan_base: 5.9, pdf_url: null as string | null, csv_url: null as string | null,
  data_decorrenza: null as string | null, data_scadenza: null as string | null, attiva: true,
});
/** Quattro durate e tre fasce (5.000, 8.000, 12.000): arriva a 12.000, quindi 20.000 da finanziare sono fuori fascia. */
const RIGHE = (id: string): RigaFinanziamento[] =>
  [[24, 0.04584], [48, 0.0252], [60, 0.02], [84, 0.015]].flatMap(([durata, k]) =>
    [5000, 8000, 12000].map((fascia): RigaFinanziamento => ({
      id: `r-${durata}-${fascia}`, tabella_id: id, subtariffa: null as string | null, importo_erogato: fascia, spese_istruttoria: null as number | null,
      importo_totale_credito: null as number | null, numero_rate: durata, durata_mesi: durata, prima_rata_giorni: null as number | null,
      importo_rata: Math.round(fascia * k * 100) / 100, spese_incasso_rata: null as number | null, interessi_cliente: null as number | null,
      importo_totale_dovuto: Math.round(fascia * k * durata * 100) / 100, tan: 5.9, taeg: 6.45, icc: null as number | null,
    })));

type Passo = "economia" | "pdf";

/**
 * Il wizard in piccolo: UN preventivo (`form`, con le scritture dello step), un passo alla volta. Il passo PDF riceve le
 * posizioni di adesso e il preventivo con le scritture sopra, come `detailSulloSchermo` del wizard.
 */
function Wizard({ iniziale, passoIniziale = "economia", posizioni }: { iniziale: Partial<SrProgettoRow>; passoIniziale?: Passo; posizioni: number }) {
  const [form, setForm] = useState<Partial<SrProgettoRow>>({ ...PROGETTO(10_000), ...iniziale });
  const [passo, setPasso] = useState<Passo>(passoIniziale);
  // Le posizioni sono quelle di Composizione (qui, il prezzo delle finestre), il totale salvato lo scrive il wizard in ogni passo.
  const detail: SrProgettoDetail = { ...dettaglio(posizioni), progetto: { ...PROGETTO(posizioni), ...form } as SrProgettoRow };
  return (
    <>
      <button onClick={() => setPasso("economia")}>vai a Economia</button>
      <button onClick={() => setPasso("pdf")}>vai al PDF</button>
      {passo === "economia" ? (
        <StepEconomia progettoId="p1" detail={detail} form={form} onChange={(campo, valore) => setForm((f) => ({ ...f, [campo]: valore }))} />
      ) : (
        <StepPdf progettoId="p1" detail={detail} />
      )}
    </>
  );
}

const monta = (iniziale: Partial<SrProgettoRow> = {}, posizioni = 10_000, passoIniziale: Passo = "economia") => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const radice = (p: number) => (
    <QueryClientProvider client={client}><Wizard iniziale={iniziale} posizioni={p} passoIniziale={passoIniziale} /></QueryClientProvider>
  );
  const resa = render(radice(posizioni));
  /** Le posizioni cambiano da un altro passo (Composizione): lo stesso preventivo, un altro prezzo. */
  return { ...resa, conPrezzo: (p: number) => resa.rerender(radice(p)) };
};

const vaiAlPdf = () => fireEvent.click(screen.getByRole("button", { name: "vai al PDF" }));
const vaiAEconomia = () => fireEvent.click(screen.getByRole("button", { name: "vai a Economia" }));
const scegli = (nome: string | RegExp) => fireEvent.click(screen.getByRole("button", { name: nome }));
const gruppoAnticipo = () => within(screen.getByRole("group", { name: "Anticipo" }));
const invio = () => stato.invio as { disabled: boolean; disabledReason: string };

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= (): boolean => false;
  proto.setPointerCapture ??= (): void => undefined;
  proto.releasePointerCapture ??= (): void => undefined;
  proto.scrollIntoView ??= (): void => undefined;
});

beforeEach(() => {
  stato.permessi = { canApproveDiscounts: true, canViewMargins: false, canViewCosts: false };
  stato.tabelle = [TABELLA("t1")];
  stato.righe = { t1: RIGHE("t1") };
  stato.invio = null;
  localStorage.clear();
});
afterEach(() => cleanup());

describe("un preventivo scritto dalla scheda Economia parte per firma", () => {
  it("«Finanziamento» e 48 rate: le rate fanno 100% e il piano è sul totale di adesso (11.000 €, anticipo 30%)", () => {
    monta();
    scegli("Finanziamento");
    scegli(/^48 rate/);
    vaiAlPdf();
    expect(invio().disabled).toBe(false);
  });

  it("con un anticipo diverso (40%): le rate si rifanno 40/60 e il piano è sui 6.600 da finanziare, e si manda", () => {
    monta();
    scegli("Finanziamento");
    scegli(/^48 rate/);
    fireEvent.click(gruppoAnticipo().getByRole("button", { name: "40%" }));
    vaiAlPdf();
    expect(invio().disabled).toBe(false);
  });

  it("«Tutto finanziato» (anticipo 0%): il piano è su tutti gli 11.000, e si manda", () => {
    monta();
    scegli("Finanziamento");
    scegli("Tutto finanziato");
    scegli(/^48 rate/);
    vaiAlPdf();
    expect(invio().disabled).toBe(false);
  });

  it("il piano manuale (nessuna tabella della finanziaria): si manda", () => {
    stato.tabelle = [];
    stato.righe = {};
    monta();
    scegli("Finanziamento");
    // il piano manuale ha già le sue rate a schermo: si scrive toccando il tasto dell'anticipo o un valore
    fireEvent.click(gruppoAnticipo().getByRole("button", { name: "30%" }));
    fireEvent.click(gruppoAnticipo().getByRole("button", { name: "20%" }));
    vaiAlPdf();
    expect(invio().disabled).toBe(false);
  });

  it("un bonifico (3 step): si manda, e il piano di prima non c'è più", () => {
    monta();
    scegli("Finanziamento");
    scegli(/^48 rate/);
    scegli("Bonifico");
    vaiAlPdf();
    expect(invio().disabled).toBe(false);
  });

  it("oltre l'ultima fascia della tabella (20.000 € da finanziare) non c'è nessuna rata sbagliata nel preventivo e il passo PDF non ferma l'invio per questo", () => {
    monta({}, 20_000);
    scegli("Finanziamento");
    // 22.000 € con anticipo 30% = 15.400 da finanziare: oltre i 12.000 della tabella, nessun tasto con una rata
    expect(screen.queryByRole("button", { name: /^48 rate/ })).toBeNull();
    expect(screen.getByText(/Fuori fascia/)).toBeTruthy();
    vaiAlPdf();
    expect(invio().disabled).toBe(false);
  });
});

describe("i controlli di «Invia per firma» e il salvataggio automatico di Economia", () => {
  it("rate che non fanno 100% (scritte a mano): l'invio si ferma; «Dividi in parti uguali» le rimette a posto e si manda", () => {
    monta();
    scegli("Bonifico");
    fireEvent.change(screen.getByLabelText("Percentuale dello step 1"), { target: { value: "20" } });
    // l'ultima rata chiude il conto: per arrivare a una somma sbagliata si scrive nell'ultima
    fireEvent.change(screen.getByLabelText("Percentuale dello step 3"), { target: { value: "20" } });
    vaiAlPdf();
    expect(invio().disabled).toBe(true);
    expect(invio().disabledReason).toContain("rate");
    vaiAEconomia();
    scegli("Dividi in parti uguali");
    vaiAlPdf();
    expect(invio().disabled).toBe(false);
  });

  it("il totale sale da un altro passo: il piano di prima ferma l'invio (finanziamento), e riaprendo Economia si riscrive da solo e si sblocca", () => {
    const { conPrezzo } = monta();
    scegli("Finanziamento");
    scegli(/^48 rate/);
    vaiAlPdf();
    expect(invio().disabled).toBe(false);
    // Composizione: le finestre costano di più (12.000 + IVA = 13.200); il piano scritto è ancora quello degli 11.000
    conPrezzo(12_000);
    expect(invio().disabled).toBe(true);
    expect(invio().disabledReason).toContain("finanziamento");
    // Si riapre Economia: il piano segue il totale (e da solo, senza nessun pulsante)
    vaiAEconomia();
    vaiAlPdf();
    expect(invio().disabled).toBe(false);
  });

  it("un preventivo di prima con rate 30/70 e anticipo 40 (la contraddizione) ma il piano coerente con l'anticipo scritto: si manda lo stesso, e Economia la segnala senza cambiarla", () => {
    monta({
      schema_pagamento: "acconto_finanziato", fin_anticipo_pct: 40, fin_tabella_id: "t1", fin_tabella_riga_id: "r-48-8000",
      pagamento_milestones: [
        { label: "Acconto alla firma", percentuale: 30, when: "Firma contratto" },
        { label: "Finanziamento", percentuale: 70, when: "Erogato all'inizio lavori" },
      ],
      fin_piani: [{ nome: "Prestito Casa", mesi: 48, tasso: 5.9, rata_mese: 201.6, anticipo: 4_400, finanziato: 6_600 }],
    } as Partial<SrProgettoRow>, 10_000);
    expect(screen.getByText(/il preventivo dice due cose/)).toBeTruthy();
    vaiAlPdf();
    expect(invio().disabled).toBe(false);
  });
});
