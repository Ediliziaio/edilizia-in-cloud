/**
 * Serramenti, passo PDF (06/10/2026): importi della copia di firma e esigenze del cliente.
 *
 *  1. Gli importi che «Invia per firma» manda al cliente sono quelli del PDF anche con i «prezzi inseriti senza IVA»
 *     (`iva_inclusa = false`, 1 preventivo vero su 38). Il passo li ricalcolava dal totale salvato con `iva_inclusa`, che dice
 *     se i PREZZI inseriti comprendono l'IVA, non se il totale salvato la comprende (`totale_max` è sempre IVA inclusa):
 *     un preventivo da 11.000 € andava in firma a 12.100 €, e il cliente firmava un PDF da 11.000 €. Oggi gli importi
 *     vengono dalle posizioni (importiDelPreventivo): qui il caso resta fissato.
 *  2. Le esigenze del cliente sono facoltative.
 *
 * La scheda «Cosa ti ha detto il cliente?» dice «Facoltativo» e il PDF stampa le esigenze solo se ci sono; il passo PDF
 * invece teneva la regola della prima versione («Almeno 1 esigenza» non era `facoltativo`): un preventivo senza esigenze
 * restava bloccato, con «Scarica PDF», «Invia per firma» e «Crea commessa» spenti e «Completa prima…».
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SrProgettoDetail } from "@/types/serramenti";

const { firma } = vi.hoisted(() => ({ firma: { props: null as null | Record<string, unknown> } }));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/moduli/InviaFirmaCard", () => ({
  InviaFirmaCard: (props: Record<string, unknown>): null => {
    firma.props = props;
    return null;
  },
}));
vi.mock("@/lib/serramenti/queries", () => ({
  useGeneraPdf: () => ({ mutate: vi.fn(), isPending: false }),
  useConvertiInOrdine: () => ({ mutate: vi.fn(), isPending: false }),
  useTemplatePdf: () => ({ data: null as unknown }),
  useAziendaPerPdf: () => ({ data: null as unknown }),
}));
vi.mock("@/hooks/useSerramentoPDF", () => ({
  renderSerramentoBlob: vi.fn(),
  useSerramentoPDF: () => ({ downloadPDF: vi.fn(), previewPDF: vi.fn(), isGenerating: false }),
}));

import { StepPdf } from "@/components/serramenti/StepPdf";

type Riga = Record<string, unknown>;
const serramento = (prezzo: number, quantita = 1): Riga => ({
  id: `s-${prezzo}`, quantita, prezzo_unitario: prezzo / quantita, prezzo_totale: prezzo, metri_quadri: 1.5 * quantita,
  tipologia: "finestra", larghezza_mm: 1200, altezza_mm: 1400,
});

function preventivo(progetto: Riga, righe: { serramenti?: Riga[] } = {}): SrProgettoDetail {
  return {
    progetto: {
      id: "sr1", company_id: "c1", code: "SR-2026-0001", stato: "bozza", ordine_id: null, public_url: null, pdf_html_url: null,
      cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_email: "mario@example.it", cliente_telefono: "347 123 4567",
      cliente_indirizzo: "Via Roma 1", cantiere_indirizzo: "Via Roma 1", cantiere_citta: "Torino",
      intervento_sintesi: "Sostituzione di 2 finestre", tipo_intervento: "sostituzione", esigenze: [{ titolo: "Spifferi" }],
      iva_percentuale: 10, iva_inclusa: true, sconto_percentuale: 0, sconto_importo: 0, prezzo_manuale: null,
      totale_min: 0, totale_max: 0, consulenza_at: null, valido_fino_giorni: 15,
      ...progetto,
    },
    serramenti: righe.serramenti ?? [serramento(10000, 2)],
    accessori: [],
    servizi: [],
    media: [],
    risparmio: null,
  } as unknown as SrProgettoDetail;
}

beforeEach(() => { firma.props = null; });
afterEach(() => cleanup());

describe("passo PDF: importi della copia di firma", () => {
  // 10.000 € di serramenti, IVA 10%: totale 11.000 € (totale_max è sempre IVA inclusa).
  const conIva = (iva_inclusa: boolean) =>
    preventivo({ iva_percentuale: 10, iva_inclusa, totale_min: 11000, totale_max: 11000 });

  it("prezzi inseriti senza IVA (`iva_inclusa = false`): il totale di firma resta 11.000 €, non 12.100 €", () => {
    render(<StepPdf progettoId="sr1" detail={conIva(false)} />);
    expect(firma.props).toMatchObject({ subtotal: 10000, vatAmount: 1000, total: 11000 });
  });

  it("prezzi inseriti con IVA (`iva_inclusa = true`): gli stessi numeri", () => {
    render(<StepPdf progettoId="sr1" detail={conIva(true)} />);
    expect(firma.props).toMatchObject({ subtotal: 10000, vatAmount: 1000, total: 11000 });
  });
});

describe("passo PDF: le esigenze del cliente sono facoltative", () => {
  const completo = { totale_min: 11000, totale_max: 11000 };

  it("senza esigenze si può mandare in firma e creare la commessa", () => {
    render(<StepPdf progettoId="sr1" detail={preventivo({ ...completo, esigenze: [] })} />);
    expect(firma.props).toMatchObject({ disabled: false, pdfDisponibile: true });
    expect((screen.getByRole("button", { name: /Crea commessa da questo preventivo/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: /Scarica PDF/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("senza esigenze la riga della lista dice che è facoltativo e non chiede di completarla", () => {
    render(<StepPdf progettoId="sr1" detail={preventivo({ ...completo, esigenze: [] })} />);
    expect(screen.queryAllByText(/Completa prima/)).toHaveLength(0);
    expect(screen.getByText(/Almeno 1 esigenza/).className).not.toMatch(/amber-700/);
  });

  it("restano obbligatori il cliente, i serramenti e il totale: senza il totale niente invio né commessa", () => {
    render(<StepPdf progettoId="sr1" detail={preventivo({ esigenze: [], totale_min: 0, totale_max: 0 })} />);
    expect(firma.props).toMatchObject({ disabled: true });
    expect((screen.getByRole("button", { name: /Crea commessa da questo preventivo/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
