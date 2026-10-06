/**
 * Il wizard del preventivo Serramenti (06/10/2026), le due cose che arrivano a elenco, commessa e cliente:
 *
 *  1. i totali che il preventivo tiene sulla sua riga (totale_min / totale_max, letti dall'elenco, dalle
 *     opportunità e da sr_converti_in_ordine) seguono ogni tipo di modifica: sconto, IVA, IVA mista, sconto
 *     fisso, prezzo scritto a mano e una riga che cambia di pochi centesimi;
 *  2. il PDF che si apre dal pulsante «Anteprima PDF» è quello che si vede sullo schermo, non la copia salvata
 *     due secondi fa: l'autosave parte due secondi dopo l'ultima modifica.
 *
 * Il wizard vero, coi dati finti; lo step Economia è finto e scrive i campi con `onChange` come il vero.
 */
import { cleanup, fireEvent, render, screen, waitFor, within, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SrProgettoDetail, SrProgettoRow, SrSerramentoRow, SrAccessorioRow, SrServizioRow } from "@/types/serramenti";

vi.setConfig({ testTimeout: 30_000 });

const { stato, aggiornamenti, anteprime } = vi.hoisted(() => ({
  stato: { detail: null as unknown as SrProgettoDetail },
  aggiornamenti: [] as Array<Record<string, unknown>>,
  anteprime: [] as Array<{ detail: SrProgettoDetail }>,
}));

vi.mock("react-router-dom", () => ({ useParams: () => ({ id: "p1" }), useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams(), vi.fn()] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, effectiveCompany: { id: "c1", name: "Bianchi Infissi" } }) }));
vi.mock("@/integrations/supabase/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catena: any = new Proxy({}, { get: (_t, p) => (p === "then" ? undefined : p === "maybeSingle" ? () => Promise.resolve({ data: null as null, error: null as null }) : () => catena) });
  return { supabase: { from: () => catena } };
});
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewMargins: false, canViewCosts: false }) }));
vi.mock("@/hooks/useSerramentiModelSupport", () => ({ useSerramentiModelSupport: () => ({ supported: true, isLoading: false }) }));
vi.mock("@/hooks/useSerramentoPDF", () => ({
  useSerramentoPDF: () => ({ previewPDF: (opts: { detail: SrProgettoDetail }) => { anteprime.push(opts); return Promise.resolve(); }, isGenerating: false }),
}));
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
}));
vi.mock("@/lib/serramenti/useCostoPosizioneListino", () => ({ useCostoPosizioneListino: () => ({ costoPosizione: (): null => null, inCaricamento: false }) }));
vi.mock("@/components/serramenti/StepBom", () => ({ StepBom: () => <p>contenuto del passo Composizione</p> }));
vi.mock("@/components/serramenti/StepAccessori", () => ({ StepAccessori: () => <p>contenuto Foto</p> }));
vi.mock("@/components/serramenti/StepEconomia", () => ({
  StepEconomia: ({ onChange }: { onChange: (campo: string, valore: unknown) => void }) => (
    <div>
      <button onClick={() => onChange("sconto_percentuale", 10)}>sconto 10%</button>
      <button onClick={() => onChange("iva_percentuale", 22)}>IVA 22%</button>
      <button onClick={() => onChange("iva_percentuale", -1)}>IVA mista</button>
      <button onClick={() => onChange("sconto_importo", 100)}>sconto fisso 100</button>
      <button onClick={() => onChange("prezzo_manuale", 5000)}>prezzo a mano 5000</button>
    </div>
  ),
}));
vi.mock("@/components/serramenti/StepConsulenza", () => ({ StepConsulenza: (): null => null }));
vi.mock("@/components/serramenti/StepPdf", () => ({ StepPdf: () => <p>contenuto PDF</p> }));
vi.mock("@/components/serramenti/StepContenuti", () => ({ StepContenuti: (): null => null }));
vi.mock("@/components/serramenti/ContactPickerDialog", () => ({ ContactPickerDialog: (): null => null }));
vi.mock("@/components/serramenti/AiSerramentiDraftLauncher", () => ({ AiSerramentiDraftLauncher: (): null => null }));
vi.mock("@/components/serramenti/AnteprimaPdfLive", () => ({ AnteprimaPdfLive: () => <p>PDF vero segnaposto</p> }));

import SerramentiWizard from "@/pages/azienda/serramenti/SerramentiWizard";

/** Serramenti 5.000, complemento 1.200, servizio 800: 7.000 di voci. IVA 10% → 7.700 salvato e coerente. */
const finestra = { id: "s1", tipologia: "finestra_2ante", quantita: 1, prezzo_unitario: 5000, prezzo_totale: 5000, larghezza_mm: 1000, altezza_mm: 1000, position: 0 } as unknown as SrSerramentoRow;
const complemento = { id: "a1", tipo: "zanzariera", quantita: 1, prezzo_unitario: 1200, prezzo_totale: 1200, position: 0 } as unknown as SrAccessorioRow;
const servizio = { id: "m1", descrizione: "Trasporto", quantita: 1, prezzo_unitario_vendita: 800, prezzo_totale_vendita: 800, position: 0 } as unknown as SrServizioRow;

const preventivo = (servizi: SrServizioRow[] = [servizio], extra: Partial<SrProgettoRow> = {}): SrProgettoDetail => ({
  progetto: {
    id: "p1", company_id: "c1", code: "SR-2026-0412", stato: "bozza", revision_number: 1, parent_id: null, updated_at: "2026-10-05T09:24:00Z",
    cliente_nome: "Mario", cliente_cognome: "Rossi", tipo_intervento: "sostituzione", intervento_titolo: null, modello_snapshot: null,
    iva_percentuale: 10, sconto_percentuale: 0, sconto_importo: 0, prezzo_manuale: null,
    totale_min: 7700, totale_max: 7700, totale_serramenti: 1, totale_accessori: 1, metri_quadri_totali: 1,
    ...extra,
  } as unknown as SrProgettoRow,
  serramenti: [finestra], accessori: [complemento], media: [], risparmio: null, servizi,
});

const monta = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SerramentiWizard /></QueryClientProvider>);
const passo = async (nome: string) => {
  const nav = await screen.findByRole("navigation", { name: "Fasi del preventivo" });
  fireEvent.click(within(nav).getByRole("button", { name: nome }));
};
/** Lascia girare i timer a zero ms del wizard (i totali si scrivono subito dopo il render). */
const lasciaGirare = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
/** Salva (si lascia il passo, e il wizard salva al volo), torna a Economia e legge il totale scritto sulla riga. */
const salvaELeggi = async (): Promise<{ min: unknown; max: unknown }> => {
  await lasciaGirare();
  const prima = aggiornamenti.length;
  await passo("Contatto");
  await waitFor(() => expect(aggiornamenti.length).toBeGreaterThan(prima));
  const unito = Object.assign({}, ...aggiornamenti.slice(prima));
  await passo("Economia");
  await screen.findByText("sconto 10%");
  return { min: unito.totale_min, max: unito.totale_max };
};

beforeEach(() => { stato.detail = preventivo(); aggiornamenti.length = 0; anteprime.length = 0; localStorage.clear(); });
afterEach(() => cleanup());

describe("i totali sulla riga del preventivo seguono ogni modifica", () => {
  it("sconto, IVA, IVA mista, sconto fisso e prezzo scritto a mano: totale_min e totale_max sono sempre il totale del PDF", async () => {
    monta();
    await passo("Economia");

    // Sconto 10% con IVA 10%: 7.000 − 10% = 6.300; + 10% = 6.930.
    fireEvent.click(await screen.findByText("sconto 10%"));
    expect(await salvaELeggi()).toEqual({ min: 6930, max: 6930 });

    // IVA 22%: 6.300 × 1,22 = 7.686.
    fireEvent.click(screen.getByText("IVA 22%"));
    expect(await salvaELeggi()).toEqual({ min: 7686, max: 7686 });

    // IVA mista: imponibile 6.300, IVA 954 (aliquota effettiva 1.060 / 7.000) → 7.254.
    fireEvent.click(screen.getByText("IVA mista"));
    expect(await salvaELeggi()).toEqual({ min: 7254, max: 7254 });

    // Sconto fisso 100, poi −10%: (7.000 − 100) × 0,9 = 6.210; IVA 6.210 × 1.060/7.000 = 940,37 → 7.150,37.
    fireEvent.click(screen.getByText("sconto fisso 100"));
    expect(await salvaELeggi()).toEqual({ min: 7150.37, max: 7150.37 });

    // Prezzo scritto a mano 5.000: (5.000 − 100) × 0,9 = 4.410; IVA 4.410 × 1.060/7.000 = 667,80 → 5.077,80.
    fireEvent.click(screen.getByText("prezzo a mano 5000"));
    expect(await salvaELeggi()).toEqual({ min: 5077.8, max: 5077.8 });
  });

  it("una riga che cambia di 30 centesimi: il totale salvato la segue (elenco e commessa non restano indietro)", async () => {
    const { rerender } = monta();
    await passo("Economia");
    await lasciaGirare();
    aggiornamenti.length = 0;
    // Il servizio da 800,00 diventa 800,30: con l'IVA 10% il totale passa da 7.700,00 a 7.700,33.
    stato.detail = preventivo([{ ...servizio, prezzo_unitario_vendita: 800.3, prezzo_totale_vendita: 800.3 } as SrServizioRow]);
    rerender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SerramentiWizard /></QueryClientProvider>);
    expect(await salvaELeggi()).toEqual({ min: 7700.33, max: 7700.33 });
  });
});

describe("la detrazione scritta sul preventivo segue il totale in ogni passo", () => {
  it("salvata quando il totale era più alto: aprendo il preventivo (senza passare da Economia) si riscrive su quello di adesso", async () => {
    // Totale oggi 7.700 (50% = 3.850, 385 all'anno); sul preventivo c'è la detrazione di un totale di 11.000.
    stato.detail = preventivo([servizio], { detrazione_aliquota: 50, detrazione_eur_totale: 5500, detrazione_eur_anno: 550 });
    monta();
    await lasciaGirare();
    await passo("Contatto");
    await waitFor(() => expect(aggiornamenti.length).toBeGreaterThan(0));
    const unito = Object.assign({}, ...aggiornamenti);
    expect(unito).toMatchObject({ detrazione_eur_totale: 3850, detrazione_eur_anno: 385 });
    // E il totale non è cambiato: non c'è nient'altro da scrivere.
    expect(unito).not.toHaveProperty("totale_max");
  });

  it("senza detrazione scelta (esclusa o mai decisa) il wizard non la inventa", async () => {
    stato.detail = preventivo([servizio], { detrazione_aliquota: 0, detrazione_eur_totale: null, detrazione_eur_anno: null });
    monta();
    await lasciaGirare();
    await passo("Contatto");
    await lasciaGirare();
    expect(Object.assign({}, ...aggiornamenti)).not.toHaveProperty("detrazione_eur_totale");
  });
});

describe("uscire dal preventivo prima dei due secondi dell'autosave", () => {
  it("una modifica appena fatta si salva lo stesso quando si lascia la pagina (non resta solo nella copia di recupero)", async () => {
    const { unmount } = monta();
    await passo("Contatto");
    fireEvent.change(await screen.findByPlaceholderText("Paolo"), { target: { value: "Giulia" } });
    // Si esce subito (indietro, un altro menu): l'autosave non è ancora partito.
    expect(aggiornamenti).toHaveLength(0);
    unmount();
    await waitFor(() => expect(aggiornamenti.length).toBeGreaterThan(0));
    expect(Object.assign({}, ...aggiornamenti)).toMatchObject({ cliente_nome: "Giulia" });
  });

  it("senza modifiche non si scrive niente", async () => {
    const { unmount } = monta();
    await passo("Contatto");
    await lasciaGirare();
    unmount();
    await lasciaGirare();
    expect(aggiornamenti).toHaveLength(0);
  });
});

describe("«Anteprima PDF»: il documento che si vede sullo schermo", () => {
  it("una modifica fatta e non ancora salvata (l'autosave parte dopo due secondi) è già nel PDF che si apre", async () => {
    monta();
    // Si apre sul Contatto o sul passo dopo: nel Contatto si cambia il nome.
    await passo("Contatto");
    fireEvent.change(await screen.findByPlaceholderText("Paolo"), { target: { value: "Giulia" } });
    // Si apre subito il PDF: la copia salvata dice ancora «Mario».
    fireEvent.click(screen.getByRole("button", { name: /Anteprima PDF/ }));
    await waitFor(() => expect(anteprime.length).toBeGreaterThan(0));
    expect(anteprime[0].detail.progetto.cliente_nome).toBe("Giulia");
    expect(anteprime[0].detail.progetto.cliente_cognome).toBe("Rossi");
    // E il resto del preventivo non cambia: le posizioni sono quelle salvate.
    expect(anteprime[0].detail.serramenti).toHaveLength(1);
  });
});
