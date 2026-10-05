/**
 * Il wizard Serramenti dentro il guscio comune: barra delle fasi con il totale
 * sempre in vista, anteprima live a destra, tendina da telefono. Si prova la
 * pagina vera (con i dati e i passi finti): quello che l'utente vede cambia
 * mentre scrive, e «Impresa» compare solo a chi può vedere i margini.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SrAccessorioRow, SrProgettoDetail, SrProgettoRow, SrSerramentoRow, SrServizioRow } from "@/types/serramenti";

const { DETAIL, stato } = vi.hoisted(() => {
  const base = { progetto_id: "p1", company_id: "c1", created_at: "", updated_at: "" };
  const sr = (id: string, position: number, extra: Partial<SrSerramentoRow>): SrSerramentoRow => ({
    ...base, id, position, tipologia: "finestra", tipologia_label: "Finestra 2 ante", ambiente: null, materiale: null, serie: null, vetro: null,
    vetro_specs: null, apertura: null, colore_interno: null, colore_esterno: null, larghezza_mm: 1200, altezza_mm: 1400, quantita: 1,
    metri_quadri: null, family_id: null, macrocategoria_override_id: null, listino_voce_id: null, supplier_catalog_id: null,
    supplier_product_line_id: null, prezzo_unitario: 800, prezzo_totale: 800, valori_assi: {}, foto_storage_path: null, foto_render_path: null,
    note: null, posa_esclusa: false, ...extra,
  });
  const accessorio: SrAccessorioRow = {
    ...base, id: "a1", position: 0, tipo: "persiana", descrizione: null, quantita: 4, larghezza_mm: null, altezza_mm: null,
    prezzo_unitario: 310, prezzo_totale: 1240, listino_voce_id: null, serramento_id: "s1", note: null, posa_esclusa: false,
    family_id: null, valori_assi: null, modalita_prezzo: null, supplier_catalog_id: null, supplier_product_line_id: null,
  };
  const servizio: SrServizioRow = {
    ...base, id: "m1", position: 0, tariffa_id: null, variante_id: null, descrizione: "Trasporto", unita: null, quantita: 1,
    prezzo_unitario_costo: 60, prezzo_unitario_vendita: 150, prezzo_totale_costo: 60, prezzo_totale_vendita: 150, note: null,
  };
  const progetto = {
    id: "p1", company_id: "c1", code: "SR-2026-0412", stato: "bozza", revision_number: 1, parent_id: null, updated_at: "2026-10-05T09:24:00Z",
    cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_telefono: "347 123 4567",
    cantiere_indirizzo: "Via Roma 4", cantiere_citta: "Vicenza", tipo_intervento: "sostituzione", intervento_titolo: null,
    iva_percentuale: 10, sconto_percentuale: 5, sconto_importo: 0, modello_snapshot: null, totale_min: 5173, totale_max: 5173,
  } as unknown as SrProgettoRow;
  const detail: SrProgettoDetail = {
    progetto,
    serramenti: [
      sr("s1", 0, { quantita: 3, apertura: "2 ante", prezzo_unitario: 820, prezzo_totale: 2460, listino_voce_id: "v1" }),
      sr("s2", 1, { tipologia: "portafinestra", tipologia_label: "Portafinestra", prezzo_unitario: 1100, prezzo_totale: 1100 }),
      sr("s3", 2, { tipologia_label: "Finestra bagno", prezzo_unitario: null, prezzo_totale: null }),
    ],
    accessori: [accessorio],
    media: [],
    risparmio: null,
    servizi: [servizio],
  };
  return { stato: { id: "p1" as string | undefined, margini: true }, DETAIL: detail };
});

vi.mock("react-router-dom", () => ({ useParams: () => ({ id: stato.id }), useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams(), vi.fn()] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, effectiveCompany: { id: "c1", name: "Bianchi Infissi" } }) }));
vi.mock("@/integrations/supabase/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catena: any = new Proxy({}, { get: (_t, p) => (p === "then" ? undefined : p === "maybeSingle" ? () => Promise.resolve({ data: null as null, error: null as null }) : () => catena) });
  return { supabase: { from: () => catena } };
});
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewMargins: stato.margini, canViewCosts: stato.margini }) }));
vi.mock("@/hooks/useSerramentiModelSupport", () => ({ useSerramentiModelSupport: () => ({ supported: true, isLoading: false }) }));
vi.mock("@/hooks/useSerramentoPDF", () => ({ useSerramentoPDF: () => ({ previewPDF: vi.fn(), isGenerating: false }) }));
vi.mock("@/lib/serramenti/queries", () => ({
  useProgetto: () => ({ data: (stato.id ? DETAIL : undefined) as SrProgettoDetail | undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateProgetto: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateProgetto: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDuplicaProgetto: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTemplatePdf: () => ({ data: null as null, isLoading: false, isError: false }),
  useAziendaPerPdf: () => ({ data: { ragione_sociale: "Bianchi Infissi S.r.l." } }),
}));
vi.mock("@/lib/serramenti/useCostoPosizioneListino", () => ({
  // il listino finto: la finestra s1 costa 540 a pezzo, il resto non si sa
  useCostoPosizioneListino: () => ({
    costoPosizione: (riga: { id: string; quantita?: number | null }): number | null => (riga.id === "s1" ? 540 * Number(riga.quantita ?? 1) : null),
    inCaricamento: false,
  }),
}));
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

const monta = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SerramentiWizard /></QueryClientProvider>);
const anteprima = () => screen.getByRole("complementary", { name: "Anteprima del preventivo", hidden: true });

beforeEach(() => { stato.id = "p1"; stato.margini = true; localStorage.clear(); });
afterEach(() => cleanup());

describe("Serramenti nel guscio comune", () => {
  it("sei fasi in alto, col totale IVA inclusa sempre in vista (stesso numero dei conti: 5.173 €)", async () => {
    monta();
    const nav = await screen.findByRole("navigation", { name: "Fasi del preventivo" });
    expect(within(nav).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Contatto", "Immobile e contenuti", "Composizione offerta", "Foto e render", "Economia", "Consulenza e PDF",
    ]);
    // 2.460 + 1.100 + 1.240 + 150 = 4.950; sconto 5% → 4.702,50; IVA 10% → 5.172,75
    expect(within(nav.parentElement as HTMLElement).getByText("€ 5.173")).toBeTruthy();
    expect(within(nav.parentElement as HTMLElement).getByText("Totale IVA incl.")).toBeTruthy();
  });

  it("a destra il preventivo con righe, dettagli e totali; la voce senza prezzo è segnalata", async () => {
    monta();
    await screen.findByRole("navigation", { name: "Fasi del preventivo" });
    const a = within(anteprima());
    expect(a.getByText("Bianchi Infissi S.r.l.")).toBeTruthy();
    expect(a.getByText("Mario Rossi")).toBeTruthy();
    expect(a.getByText("Portafinestra")).toBeTruthy();
    expect(a.getByText("Sconto 5%")).toBeTruthy();
    expect(a.getByText("da prezzare")).toBeTruthy();
    expect(a.getByText(/1 voce senza prezzo/)).toBeTruthy();
  });

  it("il passo si cambia dalla barra e l'anteprima resta dov'è", async () => {
    monta();
    const nav = await screen.findByRole("navigation", { name: "Fasi del preventivo" });
    fireEvent.click(within(nav).getByRole("button", { name: "Composizione offerta" }));
    await screen.findByText("contenuto del passo Composizione");
    expect(within(anteprima()).getByText("Mario Rossi")).toBeTruthy();
    expect(within(nav).getByRole("button", { name: "Composizione offerta" }).getAttribute("aria-current")).toBe("step");
  });

  it("«Impresa» compare solo a chi può vedere i margini; scelta, mostra costi e margine", async () => {
    stato.margini = false;
    const { unmount } = monta();
    await screen.findByRole("navigation", { name: "Fasi del preventivo" });
    expect(within(anteprima()).queryByRole("button", { name: "Impresa" })).toBeNull();
    unmount();

    stato.margini = true;
    monta();
    await screen.findByRole("navigation", { name: "Fasi del preventivo" });
    expect(within(anteprima()).queryByText("Costo")).toBeNull();
    fireEvent.click(within(anteprima()).getByRole("button", { name: "Impresa" }));
    await waitFor(() => expect(within(anteprima()).getByText("Costo")).toBeTruthy());
    expect(within(anteprima()).getByText(/Vista impresa/)).toBeTruthy();
  });

  it("«PDF vero» mostra il documento vero al posto dell'anteprima, e la scelta resta per la prossima volta", async () => {
    monta();
    await screen.findByRole("navigation", { name: "Fasi del preventivo" });
    fireEvent.click(within(anteprima()).getByRole("button", { name: "PDF vero" }));
    await waitFor(() => expect(within(anteprima()).getByText("PDF vero segnaposto")).toBeTruthy());
    expect(localStorage.getItem("sr_pannello_pdf_live")).toBe("1");
  });

  it("l'anteprima si nasconde e si riapre dalla barra; la scelta resta", async () => {
    monta();
    await screen.findByRole("navigation", { name: "Fasi del preventivo" });
    fireEvent.click(within(anteprima()).getByRole("button", { name: "Nascondi l'anteprima" }));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Anteprima del preventivo", hidden: true })).toBeNull());
    expect(localStorage.getItem("sr_anteprima_nascosta")).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: /Mostra anteprima/ }));
    await waitFor(() => expect(anteprima()).toBeTruthy());
  });

  it("da telefono il totale nel piede apre l'anteprima dal basso", async () => {
    monta();
    await screen.findByRole("navigation", { name: "Fasi del preventivo" });
    fireEvent.click(screen.getByRole("button", { name: /Totale € 5\.173: apri l'anteprima/ }));
    const tendina = await screen.findByRole("dialog");
    expect(within(tendina).getByText("Portafinestra")).toBeTruthy();
    expect(within(tendina).getByRole("button", { name: /Apri il PDF/ })).toBeTruthy();
  });

  it("preventivo nuovo: le altre fasi aspettano, e quello che scrivi nel Contatto compare subito a destra", async () => {
    stato.id = undefined;
    monta();
    const nav = await screen.findByRole("navigation", { name: "Fasi del preventivo" });
    expect((within(nav).getByRole("button", { name: "Composizione offerta" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(nav).getByRole("button", { name: "Contatto" }) as HTMLButtonElement).disabled).toBe(false);
    expect(within(anteprima()).getByText("Nome del cliente")).toBeTruthy();
    expect(within(anteprima()).queryByRole("button", { name: "PDF vero" })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Paolo"), { target: { value: "Anna" } });
    fireEvent.change(screen.getByPlaceholderText("Conti"), { target: { value: "Verdi" } });
    await waitFor(() => expect(within(anteprima()).getByText("Anna Verdi")).toBeTruthy());
    expect(screen.getByRole("button", { name: /Crea e continua/ })).toBeTruthy();
  });
});
