import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComputoCommessa } from "@/hooks/useComputoCommessa";
import type { VoceComputo } from "@/lib/computo/alberoComputo";

const muta = vi.fn();
const classifica = vi.fn();
const sblocca = vi.fn();
let computo: ComputoCommessa;
let voci: VoceComputo[];

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" }, user: { id: "u1" } }) }));
vi.mock("@/hooks/useComputoCommessa", () => ({
  computoInLettura: (c: ComputoCommessa | null) => !!c && ["uploading", "extracting_text"].includes(c.extraction_status),
  computoLetto: (c: ComputoCommessa | null) => !!c && ["review", "completed"].includes(c.extraction_status),
  useComputiCommessa: () => ({ data: [computo], isLoading: false, error: null as Error | null }),
  useVociComputo: () => ({ data: voci, isLoading: false }),
  useModificaComputo: () => ({ mutate: muta, mutateAsync: muta }),
  useScartaComputo: () => ({ mutate: vi.fn() }),
  useCaricaComputo: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClassificaVoci: () => ({ mutate: classifica, mutateAsync: classifica, isPending: false }),
  useSbloccaComputo: () => ({ mutate: sblocca, isPending: false }),
}));
// Le piante del computo (fase 4 delle Planimetrie) hanno il loro test: qui nessuna pianta.
vi.mock("@/hooks/useComputoPianta", () => ({
  usePianteDelComputo: () => ({ piante: new Map(), origineMisura: (): null => null, cambiate: [] as unknown[], caricamento: false, errore: null as string | null }),
}));

import OrderComputoTab from "@/components/computo/commessa/OrderComputoTab";

const voce = (n: number, p: Partial<VoceComputo>): VoceComputo => ({
  id: `v${n}`, ordine: n, numero_ordine: String(n), codice_voce: null, codice_tariffa: `T.${n}`, codice_prezzario: null,
  descrizione_breve: `Voce ${n}`, descrizione_estesa: `Descrizione completa della voce ${n}`, unita_misura: "mq", quantita: 10, prezzo_unitario_computo: 10, importo_computo: 100,
  super_categoria: "ECO", categoria: "OPERE", sotto_categoria: null, is_sicurezza: false, is_detrazione: false, a_corpo: false, warnings: [], misure: [], ...p,
});

beforeEach(() => {
  muta.mockReset(); classifica.mockReset(); sblocca.mockReset();
  computo = {
    id: "k1", titolo: "Computo esecutivo", file_name: "Computo metrico.pdf", file_type: "pdf", stato: "verificato",
    extraction_status: "review", extraction_error: null, extraction_method: "pdf_text", progresso: null, oggetto_lavori: null, committente: null,
    totale_dichiarato: 1100, totale_calcolato: 1100, controllo_totali: null, lavoro_pubblico: true, stazione_appaltante: "Comune di Prova",
    cig: "A1B2C3D4E5", cup: null, ribasso_percentuale: 10, oneri_sicurezza: 100, created_at: null,
    variante_di: null, numero_variante: null, motivo_variante: null, contrattuale_dal: null,
  };
  voci = [
    voce(1, { categoria: "ONERI DELLA SICUREZZA", is_sicurezza: true, importo_computo: 100 }),
    voce(2, { importo_computo: 1000, quantita: 100, misure: [{ ordine: 1, descrizione: "Parete nord", parti_uguali: 2, lunghezza: 10, larghezza: null, altezza_peso: 5, quantita: 100, formula: null }] }),
  ];
});

describe("scheda Computo della commessa", () => {
  it("mostra l'esito del controllo dei totali e il quadro economico del lavoro pubblico", () => {
    render(<OrderComputoTab orderId="o1" companyId="c1" canEdit />);
    expect(screen.getByRole("status")).toHaveTextContent("2 voci lette, totale 1.100,00 € = totale del documento ✓");
    expect(screen.getByText("Importo contrattuale").nextSibling).toHaveTextContent("1.000,00");
    expect(screen.getByText(/di cui oneri della sicurezza/).parentElement).toHaveTextContent("100,00");
  });

  it("la voce si apre con la descrizione completa e il libretto delle misure", () => {
    render(<OrderComputoTab orderId="o1" companyId="c1" canEdit />);
    fireEvent.click(screen.getByRole("button", { name: /^OPERE/ }));
    fireEvent.click(screen.getByRole("button", { name: /Voce 2/ }));
    expect(screen.getByText("Descrizione completa della voce 2")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /Righe di misura della voce 2/ })).toHaveTextContent("Parete nord");
  });

  it("la ricerca filtra anche sulle righe di misura", () => {
    render(<OrderComputoTab orderId="o1" companyId="c1" canEdit />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Cerca nel computo" }), { target: { value: "parete" } });
    expect(screen.getByText(/1 di 2 voci/)).toBeInTheDocument();
  });

  it("un computo contrattuale è bloccato: niente sostituzione né modifiche ai dati di gara", () => {
    computo.stato = "contrattuale";
    render(<OrderComputoTab orderId="o1" companyId="c1" canEdit />);
    expect(screen.queryByRole("button", { name: "Carica un nuovo computo" })).toBeNull();
    expect(screen.getByLabelText("Stazione appaltante")).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Lavoro pubblico" })).toBeDisabled();
  });

  it("chi vede la commessa ma non la modifica non può caricare né cambiare stato", () => {
    render(<OrderComputoTab orderId="o1" companyId="c1" canEdit={false} />);
    expect(screen.queryByRole("button", { name: "Rendi contrattuale" })).toBeNull();
    expect(screen.getByLabelText("CIG")).toBeDisabled();
  });

  it("IVA e spese tecniche vanno fra le somme a disposizione: fuori dai lavori e dal ribasso", () => {
    voci.push(voce(3, { super_categoria: "SOMME A DISPOSIZIONE", categoria: null, descrizione_breve: "IVA 10% sui lavori", importo_computo: 110 }));
    voci.push(voce(4, { super_categoria: "SPESE TECNICHE", categoria: null, descrizione_breve: "Direzione dei lavori", importo_computo: 90 }));
    render(<OrderComputoTab orderId="o1" companyId="c1" canEdit />);
    expect(screen.getByText("Totale lavori a base d'asta").nextSibling).toHaveTextContent("1.100,00");
    expect(screen.getByText("Importo contrattuale").nextSibling).toHaveTextContent("1.000,00");
    expect(screen.getByText("Totale somme a disposizione").nextSibling).toHaveTextContent("200,00");
    expect(screen.getByText("Totale dell'intervento (A + B)").nextSibling).toHaveTextContent("1.300,00");
  });

  it("rendendolo contrattuale fissa la classificazione proposta delle voci", async () => {
    voci.push(voce(3, { super_categoria: "SOMME A DISPOSIZIONE", categoria: null, descrizione_breve: "IVA 10% sui lavori", importo_computo: 110 }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<OrderComputoTab orderId="o1" companyId="c1" canEdit />);
    fireEvent.click(screen.getByRole("button", { name: "Rendi contrattuale" }));
    await vi.waitFor(() => expect(muta).toHaveBeenCalled());
    expect(classifica).toHaveBeenCalledWith({ ids: ["v1", "v2"], sezione: "lavori" });
    expect(classifica).toHaveBeenCalledWith({ ids: ["v3"], sezione: "somme_a_disposizione" });
  });

  it("lo sblocco del contrattuale chiede il motivo e passa dal database", () => {
    computo.stato = "contrattuale";
    render(<OrderComputoTab orderId="o1" companyId="c1" canEdit />);
    expect(screen.getByRole("tab", { name: "Libretto" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sblocca" }));
    const conferma = screen.getAllByRole("button", { name: "Sblocca" }).at(-1)!;
    expect(conferma).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Errore di trascrizione della voce 2" } });
    fireEvent.click(conferma);
    expect(sblocca).toHaveBeenCalledWith({ id: "k1", motivo: "Errore di trascrizione della voce 2" }, expect.anything());
    expect(muta).not.toHaveBeenCalled();
  });

  it("le differenze rimandano alla voce", () => {
    voci[1] = { ...voci[1], importo_computo: 999 };
    computo.totale_dichiarato = 1099;
    render(<OrderComputoTab orderId="o1" companyId="c1" canEdit />);
    const link = screen.getByRole("button", { name: "Voce 2" });
    fireEvent.click(link);
    expect(screen.getByText("Descrizione completa della voce 2")).toBeInTheDocument();
  });
});
