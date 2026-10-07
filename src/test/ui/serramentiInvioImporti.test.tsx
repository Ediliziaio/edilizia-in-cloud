/**
 * Gli importi che «Invia per firma» scrive nel documento di firma del preventivo Serramenti (06/10/2026).
 *
 * Imponibile, IVA e totale arrivano alla scheda di invio dal passo PDF. Prima l'imponibile si ricavava dal solo
 * totale dividendo per `1 + aliquota`: con l'IVA mista (aliquota salvata -1, cioè «0,99») l'imponibile veniva più
 * alto del totale e l'IVA negativa. Il componente vero (StepPdf), con la scheda di invio finta che legge gli
 * importi che riceve.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SrProgettoDetail, SrProgettoRow, SrSerramentoRow, SrAccessorioRow, SrServizioRow } from "@/types/serramenti";

vi.setConfig({ testTimeout: 30_000 });

const ricevuti = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));

vi.mock("@/components/moduli/InviaFirmaCard", () => ({
  InviaFirmaCard: (props: Record<string, unknown>): null => { ricevuti.props = props; return null; },
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useSerramentoPDF", () => ({
  renderSerramentoBlob: vi.fn(),
  useSerramentoPDF: () => ({ downloadPDF: vi.fn(), previewPDF: vi.fn(), isGenerating: false }),
}));
vi.mock("@/lib/serramenti/queries", () => ({
  useGeneraPdf: () => ({ mutate: vi.fn(), isPending: false }),
  useConvertiInOrdine: () => ({ mutate: vi.fn(), isPending: false }),
  useTemplatePdf: () => ({ data: null as null }),
  useAziendaPerPdf: () => ({ data: null as null }),
}));

import { StepPdf } from "@/components/serramenti/StepPdf";

const finestra = (extra: Partial<SrSerramentoRow>) =>
  ({ id: "s1", tipologia: "finestra_2ante", quantita: 1, prezzo_unitario: null, prezzo_totale: null, larghezza_mm: 1000, altezza_mm: 1000, ...extra }) as SrSerramentoRow;
const accessorio = (extra: Partial<SrAccessorioRow>) =>
  ({ id: "a1", tipo: "zanzariera", quantita: 1, prezzo_unitario: null, prezzo_totale: null, ...extra }) as SrAccessorioRow;
const servizio = (extra: Partial<SrServizioRow>) =>
  ({ id: "m1", quantita: 1, prezzo_unitario_vendita: null, prezzo_totale_vendita: null, ...extra }) as SrServizioRow;

/** Serramenti 5.000, complemento 1.200, servizio 800: 7.000 di imponibile. */
const preventivo = (progetto: Partial<SrProgettoRow>, totale: number): SrProgettoDetail => ({
  progetto: {
    id: "p1", company_id: "c1", code: "SR-2026-0001", stato: "bozza", cliente_nome: "Mario", cliente_cognome: "Rossi",
    cantiere_indirizzo: "Via Roma 12", tipo_intervento: "sostituzione", esigenze: [{ titolo: "Spifferi" }],
    iva_inclusa: true, iva_percentuale: 10, sconto_percentuale: 0, sconto_importo: 0, totale_min: totale, totale_max: totale, valido_fino_giorni: 15,
    ...progetto,
  } as unknown as SrProgettoRow,
  serramenti: [finestra({ prezzo_totale: 5000 })],
  accessori: [accessorio({ prezzo_totale: 1200 })],
  media: [], risparmio: null, servizi: [servizio({ prezzo_totale_vendita: 800 })],
});

const importi = (detail: SrProgettoDetail) => {
  render(<StepPdf progettoId="p1" detail={detail} />);
  const p = ricevuti.props as { subtotal: number; vatAmount: number; total: number };
  return { subtotal: p.subtotal, vatAmount: p.vatAmount, total: p.total };
};

afterEach(() => { cleanup(); ricevuti.props = null; });

describe("importi del documento di firma (passo PDF)", () => {
  it("IVA al 10% con sconto: imponibile 6.300, IVA 630, totale 6.930", () => {
    expect(importi(preventivo({ iva_percentuale: 10, sconto_percentuale: 10 }, 6930))).toEqual({ subtotal: 6300, vatAmount: 630, total: 6930 });
  });

  it("IVA mista: l'IVA è quella vera (1.060 su 7.000) e non negativa, il totale è 8.060", () => {
    // 5.000 di serramenti oltre le altre prestazioni (2.000): 4.000 al 10% e 3.000 al 22% → IVA 400 + 660.
    expect(importi(preventivo({ iva_percentuale: -1 }, 8060))).toEqual({ subtotal: 7000, vatAmount: 1060, total: 8060 });
  });

  it("il totale è quello delle posizioni, non un totale salvato rimasto indietro", () => {
    // Totale salvato 6.900 (vecchio), posizioni oggi 7.700 con IVA 10%: il documento di firma dice 7.700.
    expect(importi(preventivo({ iva_percentuale: 10 }, 6900)).total).toBe(7700);
  });
});

describe("rate di pagamento prima di mandare il PDF", () => {
  const invio = (rate: Array<{ label: string; percentuale: number; when: string | null }> | null) => {
    render(<StepPdf progettoId="p1" detail={preventivo({ pagamento_milestones: rate as never }, 7700)} />);
    return ricevuti.props as { disabled: boolean; disabledReason: string };
  };

  it("rate che non fanno 100%: il PDF non si manda finché non si sistemano (il cliente leggerebbe un piano a metà)", () => {
    const p = invio([{ label: "Acconto", percentuale: 30, when: "Firma" }, { label: "Saldo", percentuale: 40, when: "Lavori" }]);
    expect(p.disabled).toBe(true);
    expect(p.disabledReason).toContain("rate");
  });

  it("ma non fermano il PDF da scaricare né la commessa, che delle rate non dipendono", () => {
    render(<StepPdf progettoId="p1" detail={preventivo({ pagamento_milestones: [{ label: "Acconto", percentuale: 30, when: "Firma" }] as never }, 7700)} />);
    expect((screen.getByRole("button", { name: /Crea commessa da questo preventivo/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((ricevuti.props as { pdfDisponibile: boolean }).pdfDisponibile).toBe(true);
  });

  it("rate che fanno 100% (anche 33,33 × 3 = 99,99), nessuna rata scritta o un piano a rate vuoto: si manda", () => {
    expect(invio([{ label: "A", percentuale: 30, when: null }, { label: "B", percentuale: 40, when: null }, { label: "C", percentuale: 30, when: null }]).disabled).toBe(false);
    cleanup();
    expect(invio([{ label: "A", percentuale: 33.33, when: null }, { label: "B", percentuale: 33.33, when: null }, { label: "C", percentuale: 33.33, when: null }]).disabled).toBe(false);
    cleanup();
    expect(invio(null).disabled).toBe(false);
    cleanup();
    expect(invio([]).disabled).toBe(false);
  });

  it("la lista di controllo dice quanto fanno le rate solo quando non tornano", () => {
    render(<StepPdf progettoId="p1" detail={preventivo({ pagamento_milestones: [{ label: "Acconto", percentuale: 30, when: "Firma" }, { label: "Saldo", percentuale: 40, when: "Lavori" }] as never }, 7700)} />);
    expect(screen.getByText(/le rate fanno 70,00%/)).toBeTruthy();
    cleanup();
    render(<StepPdf progettoId="p1" detail={preventivo({ pagamento_milestones: [{ label: "Acconto", percentuale: 30, when: "Firma" }, { label: "Saldo", percentuale: 70, when: "Lavori" }] as never }, 7700)} />);
    expect(screen.queryByText(/le rate fanno/)).toBeNull();
    expect(screen.getByText("Rate di pagamento al 100%")).toBeTruthy();
  });

  it("rate oltre il 100%: nemmeno così", () => {
    expect(invio([{ label: "A", percentuale: 60, when: null }, { label: "B", percentuale: 60, when: null }]).disabled).toBe(true);
  });
});

describe("finanziamento calcolato sul totale di adesso, prima di mandare il PDF", () => {
  // Totale 7.700 (7.000 + 10%), anticipo 30%: da finanziare 5.390.
  const piano = (finanziato: number) => [{ nome: "Standard", mesi: 60, tasso: 4.75, rata_mese: 100, anticipo: 7700 - finanziato, finanziato }];
  const invio = (extra: Partial<SrProgettoRow>) => {
    render(<StepPdf progettoId="p1" detail={preventivo({ fin_anticipo_pct: 30, ...extra }, 7700)} />);
    return ricevuti.props as { disabled: boolean; disabledReason: string };
  };

  it("piano calcolato sul totale vecchio (il totale è salito dopo «Applica calcoli»): il PDF non si manda con la rata sbagliata", () => {
    // Piano salvato quando il totale era 6.600: finanziato 4.620 (70%). Oggi il totale è 7.700 e si finanzia 5.390.
    const p = invio({ schema_pagamento: "acconto_finanziato", fin_piani: piano(4620) as never });
    expect(p.disabled).toBe(true);
    expect(p.disabledReason).toContain("finanziamento");
  });

  it("piano coerente col totale (anche con un euro di arrotondamento), schema senza finanziaria o nessun piano: si manda", () => {
    expect(invio({ schema_pagamento: "acconto_finanziato", fin_piani: piano(5390) as never }).disabled).toBe(false);
    cleanup();
    expect(invio({ schema_pagamento: "acconto_finanziato", fin_piani: piano(5390.49) as never }).disabled).toBe(false);
    cleanup();
    // Con «3 step» il PDF non stampa il finanziamento: un piano rimasto da prima non conta.
    expect(invio({ schema_pagamento: "tre_step", fin_piani: piano(4620) as never }).disabled).toBe(false);
    cleanup();
    expect(invio({ schema_pagamento: "acconto_finanziato", fin_piani: [] as never }).disabled).toBe(false);
  });
});

describe("il suggerimento sul finanziamento è vero anche per un preventivo già deciso", () => {
  // Per un preventivo aperto «riapri Economia: si ricalcola da solo» è vero (lo step riscrive il piano sul totale di adesso).
  // Per uno firmato, accettato o in commessa lo step NON lo riscrive (il piano fa parte di ciò che è stato firmato): il
  // suggerimento dice com'è, e come si cambia (una nuova revisione).
  // Totale 7.700, anticipo 30%: da finanziare 5.390; il piano scritto è rimasto sul totale di prima (4.620).
  const piano = (finanziato: number) => [{ nome: "Standard", mesi: 60, tasso: 4.75, rata_mese: 100, anticipo: 7700 - finanziato, finanziato }];
  const INDIETRO = { schema_pagamento: "acconto_finanziato" as const, fin_anticipo_pct: 30, fin_piani: piano(4620) as never };
  const mostra = (extra: Partial<SrProgettoRow>) => {
    render(<StepPdf progettoId="p1" detail={preventivo({ ...INDIETRO, ...extra }, 7700)} />);
    return ricevuti.props as { disabled: boolean; disabledReason: string };
  };
  const RIAPRI = /riapri Economia/;
  const DA_SOLO = /si ricalcola da solo/;

  it("aperto (bozza, consegnato): resta «riapri Economia, si ricalcola da solo»", () => {
    mostra({ stato: "consegnato" });
    expect(screen.getByText(/il piano di finanziamento è stato calcolato su un totale diverso: riapri Economia, si ricalcola da solo/)).toBeTruthy();
  });

  it.each([
    ["firmato (data della firma)", { stato: "consegnato", firmato_il: "2026-10-05T09:00:00Z" }, "Il preventivo è già firmato: il piano di finanziamento resta quello firmato; per cambiarlo serve una nuova revisione."],
    ["firmato (immagine della firma)", { stato: "in_valutazione", firma_cliente_url: "firme/p1.png" }, "Il preventivo è già firmato: il piano di finanziamento resta quello firmato; per cambiarlo serve una nuova revisione."],
    ["accettato", { stato: "accettato" }, "Il preventivo è già accettato: il piano di finanziamento resta quello accettato; per cambiarlo serve una nuova revisione."],
    ["in commessa", { stato: "consegnato", ordine_id: "o1" }, "Il preventivo è già in commessa: il piano di finanziamento resta quello della commessa; per cambiarlo serve una nuova revisione."],
  ] as const)("%s: il suggerimento dice che il piano resta com'è e che serve una nuova revisione, non di riaprire Economia", (_nome, extra, testo) => {
    const p = mostra(extra as Partial<SrProgettoRow>);
    expect(screen.getByText(new RegExp(testo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeTruthy();
    expect(screen.queryByText(RIAPRI)).toBeNull();
    expect(screen.queryByText(DA_SOLO)).toBeNull();
    // il controllo resta quello di prima: ferma l'invio e lo dice
    expect(p.disabled).toBe(true);
    expect(p.disabledReason).toContain("finanziamento");
  });

  it("deciso ma con il piano giusto: nessun suggerimento sul finanziamento", () => {
    mostra({ stato: "accettato", fin_piani: piano(5390) as never });
    expect(screen.queryByText(/il piano di finanziamento resta quello/)).toBeNull();
    expect(screen.queryByText(RIAPRI)).toBeNull();
  });
});
