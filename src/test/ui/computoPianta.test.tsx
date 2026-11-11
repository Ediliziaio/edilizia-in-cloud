import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComputoCommessa } from "@/hooks/useComputoCommessa";
import type { VoceComputo } from "@/lib/computo/alberoComputo";
import type { ConfrontoRiga } from "@/lib/planimetrie/computo";
import type { Origine } from "../../../shared/planimetrie/modello.ts";

// Il computo di commessa con le piante (Planimetrie, fase 4): «Prendi dalla pianta»,
// le righe stimate, «La pianta è cambiata» e il computo contrattuale che non si tocca.

const aggiungi = vi.fn();
const aggiorna = vi.fn();
const perizia = vi.fn();
let computo: ComputoCommessa;
let voci: VoceComputo[];
let cambiate: Array<{ pianta: { id: string; titolo: string; versioneCorrente: number }; confronto: ConfrontoRiga[] }>;
let origine: Origine | null;
let piantaAssociata: string | null = null;
let varianteAperta = false;

const trilocale = JSON.parse(readFileSync(join(process.cwd(), "shared/planimetrie/esempi/trilocale.json"), "utf8"));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" }, user: { id: "u1" } }) }));
// Il pannello dei collegamenti ha test dedicati con QueryClient e casi di accesso.
// Qui restano isolate le misure e le revisioni del computo.
vi.mock("@/components/planimetrie/PlanimetrieAssociate", () => ({ PlanimetrieAssociate: (): null => null }));
vi.mock("@/hooks/useComputoCommessa", () => ({
  computoInLettura: () => false,
  computoLetto: () => true,
  useComputiCommessa: () => ({ data: varianteAperta ? [computo, { ...computo, id: "variante-1", variante_di: computo.id, stato: "bozza" }] : [computo], isLoading: false, error: null as Error | null }),
  useVociComputo: () => ({ data: voci, isLoading: false }),
  useModificaComputo: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useScartaComputo: () => ({ mutate: vi.fn() }),
  useRiprovaLetturaComputo: () => ({ mutate: vi.fn(), isPending: false }),
  useCaricaComputo: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClassificaVoci: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useSbloccaComputo: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useComputoPianta", () => ({
  usePianteDelComputo: () => ({
    piante: new Map([["p1", { id: "p1", titolo: "Rilievo appartamento", versioneCorrente: 2 }]]),
    origineMisura: (m: { planimetria_id?: string | null }) => (m.planimetria_id ? origine : null),
    cambiate, caricamento: false, errore: null as string | null,
  }),
  useAggiungiMisureDaPianta: () => ({ mutate: aggiungi, isPending: false }),
  useAggiornaMisureDaPianta: () => ({ mutate: aggiorna, isPending: false }),
  usePeriziaDaPianta: () => ({ mutate: perizia, isPending: false }),
}));
vi.mock("@/lib/planimetrie/archivio", () => ({
  useElencoPlanimetrie: () => ({ data: [
    { id: "p9", titolo: "Pianta di un'altra commessa", order_id: "o9", computo_upload_id: piantaAssociata === "p9" ? "k1" : null },
    { id: "p1", titolo: "Rilievo appartamento", order_id: "o1" },
  ], isLoading: false, error: null as Error | null }),
  usePlanimetria: (id: string | null) => ({
    data: id === "p1" || id === piantaAssociata ? { riga: { id }, versione: { numero: 3, created_at: "2026-10-30T10:00:00Z", documento: trilocale } } : undefined,
    isLoading: false, error: null as Error | null,
  }),
}));

import OrderComputoTab from "@/components/computo/commessa/OrderComputoTab";

const voce = (n: number, p: Partial<VoceComputo>): VoceComputo => ({
  id: `v${n}`, ordine: n, numero_ordine: String(n), codice_voce: null, codice_tariffa: `T.${n}`, codice_prezzario: null,
  descrizione_breve: `Voce ${n}`, descrizione_estesa: `Descrizione completa della voce ${n}`, unita_misura: "mq", quantita: 10, prezzo_unitario_computo: 10, importo_computo: 100,
  super_categoria: "ECO", categoria: "OPERE", sotto_categoria: null, is_sicurezza: false, is_detrazione: false, a_corpo: false, warnings: [], misure: [], ...p,
});
const rigaDaPianta = { id: "m1", ordine: 1, descrizione: "Bagno — pavimento", parti_uguali: null as number | null, lunghezza: null as number | null, larghezza: null as number | null, altezza_peso: null as number | null,
  quantita: 5, formula: null as string | null, planimetria_id: "p1", planimetria_versione: 1, planimetria_chiavi: ["fatto:locale:bagno.pavimento_mq"] };
const confrontoBagno: ConfrontoRiga = {
  misura: { id: "m1", voceId: "v2", descrizione: "Bagno — pavimento", quantita: 5, planimetriaId: "p1", versione: 1, chiavi: ["fatto:locale:bagno.pavimento_mq"] },
  vecchia: 5, nuova: 6.5, differenza: 1.5, mancanti: [], origine: "rilevata",
};

const apriVoce2 = () => {
  fireEvent.click(screen.getByRole("button", { name: /^OPERE/ }));
  fireEvent.click(screen.getByRole("button", { name: /Voce 2/ }));
};

beforeEach(() => {
  aggiungi.mockReset(); aggiorna.mockReset(); perizia.mockReset();
  vi.restoreAllMocks();
  computo = {
    id: "k1", titolo: "Computo esecutivo", file_name: "Computo.pdf", file_type: "pdf", stato: "verificato",
    extraction_status: "review", extraction_error: null, extraction_method: "pdf_text", progresso: null, oggetto_lavori: null, committente: null,
    totale_dichiarato: null, totale_calcolato: null, controllo_totali: null, lavoro_pubblico: true, stazione_appaltante: null,
    cig: null, cup: null, ribasso_percentuale: null, oneri_sicurezza: null, created_at: null,
    variante_di: null, numero_variante: null, motivo_variante: null, contrattuale_dal: null,
  };
  voci = [voce(1, {}), voce(2, { quantita: 5, importo_computo: 50, misure: [rigaDaPianta] })];
  cambiate = [];
  origine = "rilevata";
  piantaAssociata = null;
  varianteAperta = false;
});

describe("righe di misura prese dalla pianta", () => {
  it("dicono da quale versione vengono; le stimate si vedono sulla riga, sulla voce e nel totale", () => {
    origine = "stimata";
    render(<OrderComputoTab orderId="o1" companyId="c1" canEdit />);
    expect(screen.getByText(/contiene misure stimate \(1 riga\)/)).toBeInTheDocument();
    apriVoce2();
    const tabella = screen.getByRole("table", { name: /Righe di misura della voce 2/ });
    expect(tabella).toHaveTextContent("Bagno — pavimento");
    expect(tabella).toHaveTextContent("dalla pianta v1 · stimata");
    expect(tabella).toHaveTextContent("contiene misure stimate");
  });

  it("una misura rilevata non porta avvisi", () => {
    render(<OrderComputoTab orderId="o1" companyId="c1" canEdit />);
    expect(screen.queryByText(/contiene misure stimate/)).toBeNull();
    apriVoce2();
    expect(screen.getByRole("table", { name: /Righe di misura della voce 2/ })).not.toHaveTextContent("stimata");
  });
});

describe("«Prendi dalla pianta»", () => {
  it("propone la planimetria associata al computo prima di quella generica della commessa", () => {
    piantaAssociata = "p9";
    render(<OrderComputoTab orderId="o1" companyId="c1" canEdit />);
    apriVoce2();
    fireEvent.click(screen.getByRole("button", { name: "Prendi dalla pianta" }));
    expect(screen.getByLabelText("1. Quale pianta")).toHaveValue("p9");
    expect(screen.getByRole("group", { name: "Associate a questo computo" })).toHaveTextContent("Pianta di un'altra commessa");
  });
  it("parte dalla pianta della commessa, si scelgono le stanze e nascono le righe", () => {
    render(<OrderComputoTab orderId="o1" companyId="c1" canEdit />);
    apriVoce2();
    fireEvent.click(screen.getByRole("button", { name: "Prendi dalla pianta" }));
    const finestra = screen.getByRole("dialog");
    expect(within(finestra).getByLabelText("1. Quale pianta")).toHaveValue("p1");
    // La voce è in mq: si propone il pavimento.
    expect(within(finestra).getByLabelText("3. Quale quantità")).toHaveValue("pavimento_mq");
    expect(within(finestra).getByText("Righe che verranno aggiunte (6)")).toBeInTheDocument();
    fireEvent.click(within(finestra).getByRole("button", { name: "Nessuna" }));
    fireEvent.click(within(finestra).getByRole("checkbox", { name: /^Bagno/ }));
    expect(within(finestra).getByText(/La voce passa da/)).toHaveTextContent(/da 5,00 a \d+,\d\d mq/);
    fireEvent.click(within(finestra).getByRole("button", { name: "Aggiungi 1 riga" }));
    expect(aggiungi).toHaveBeenCalledTimes(1);
    const [arg] = aggiungi.mock.calls[0];
    expect(arg).toMatchObject({ planimetriaId: "p1", versione: 3, companyId: "c1" });
    expect(arg.voce.id).toBe("v2");
    expect(arg.righe).toEqual([expect.objectContaining({ descrizione: "Bagno — pavimento", chiavi: ["fatto:locale:bagno.pavimento_mq"], origine: "rilevata" })]);
  });

  it("avvisa e impedisce di sommare quantità in un'unità diversa dalla voce", () => {
    render(<OrderComputoTab orderId="o1" companyId="c1" canEdit />);
    apriVoce2();
    fireEvent.click(screen.getByRole("button", { name: "Prendi dalla pianta" }));
    fireEvent.change(screen.getByLabelText("3. Quale quantità"), { target: { value: "battiscopa_ml" } });
    expect(screen.getByText(/La voce è in mq, la quantità scelta è in m/)).toBeInTheDocument();
    const aggiungiRighe = screen.getByRole("button", { name: /Aggiungi \d+ rig/ });
    expect(aggiungiRighe).toBeDisabled();
    fireEvent.click(aggiungiRighe);
    expect(aggiungi).not.toHaveBeenCalled();
    expect(screen.queryByText(/La voce passa da/)).toBeNull();
    expect(screen.getByText(/Totale dalla pianta/)).toBeInTheDocument();
  });

  it("non c'è su un computo contrattuale né per chi non può modificare", () => {
    computo.stato = "contrattuale";
    const { unmount } = render(<OrderComputoTab orderId="o1" companyId="c1" canEdit />);
    apriVoce2();
    expect(screen.queryByRole("button", { name: "Prendi dalla pianta" })).toBeNull();
    unmount();
    computo.stato = "verificato";
    render(<OrderComputoTab orderId="o1" companyId="c1" canEdit={false} />);
    apriVoce2();
    expect(screen.queryByRole("button", { name: "Prendi dalla pianta" })).toBeNull();
  });
});

describe("«La pianta è cambiata»", () => {
  it("mostra vecchia → nuova quantità e aggiorna solo dopo la conferma", async () => {
    cambiate = [{ pianta: { id: "p1", titolo: "Rilievo appartamento", versioneCorrente: 2 }, confronto: [confrontoBagno] }];
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<OrderComputoTab orderId="o1" companyId="c1" canEdit />);
    const avviso = screen.getByRole("status", { name: "La pianta è cambiata" });
    expect(avviso).toHaveTextContent("il computo non si aggiorna da solo");
    expect(avviso).toHaveTextContent("versione 2; il computo usa la versione 1");
    const riga = within(avviso).getByRole("row", { name: /Bagno — pavimento/ });
    expect(riga).toHaveTextContent("5,00");
    expect(riga).toHaveTextContent("6,50");
    expect(riga).toHaveTextContent("+1,50");
    expect(within(avviso).getByRole("button", { name: "Aggiorna le quantità" })).toBeDisabled();
    fireEvent.click(within(avviso).getByRole("checkbox", { name: "Seleziona misura Bagno — pavimento" }));
    fireEvent.click(within(avviso).getByRole("button", { name: "Aggiorna le quantità" }));
    await vi.waitFor(() => expect(conferma).toHaveBeenCalled());
    expect(aggiorna).not.toHaveBeenCalled();
    conferma.mockReturnValue(true);
    fireEvent.click(within(avviso).getByRole("button", { name: "Aggiorna le quantità" }));
    await vi.waitFor(() => expect(aggiorna).toHaveBeenCalled());
    expect(aggiorna.mock.calls[0][0]).toMatchObject({ versione: 2, confronto: [confrontoBagno] });
  });

  it("computo contrattuale: niente aggiornamento, le differenze vanno nella perizia di variante", async () => {
    computo.stato = "contrattuale";
    varianteAperta = true;
    cambiate = [{ pianta: { id: "p1", titolo: "Rilievo appartamento", versioneCorrente: 2 }, confronto: [confrontoBagno] }];
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<OrderComputoTab orderId="o1" companyId="c1" canEdit />);
    const avviso = screen.getByRole("status", { name: "La pianta è cambiata" });
    expect(within(avviso).queryByRole("button", { name: "Aggiorna le quantità" })).toBeNull();
    expect(avviso).toHaveTextContent("la pianta nuova non lo cambia");
    fireEvent.click(within(avviso).getByRole("checkbox", { name: "Seleziona misura Bagno — pavimento" }));
    fireEvent.click(within(avviso).getByRole("button", { name: "Porta le differenze nella perizia di variante" }));
    await vi.waitFor(() => expect(perizia).toHaveBeenCalled());
    expect(perizia.mock.calls[0][0]).toMatchObject({ versione: 2, titoloPianta: "Rilievo appartamento" });
    expect(aggiorna).not.toHaveBeenCalled();
  });

  it("non crea una perizia quando il computo contrattuale non ne ha una aperta", () => {
    computo.stato = "contrattuale";
    cambiate = [{ pianta: { id: "p1", titolo: "Rilievo appartamento", versioneCorrente: 2 }, confronto: [confrontoBagno] }];
    render(<OrderComputoTab orderId="o1" companyId="c1" canEdit />);
    expect(screen.getByText(/serve una perizia di variante già esistente/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Porta le differenze nella perizia di variante" })).not.toBeInTheDocument();
    expect(perizia).not.toHaveBeenCalled();
  });

  it("contrattuale senza contabilità dei lavori pubblici: spiega che va sbloccato", () => {
    computo.stato = "contrattuale";
    computo.lavoro_pubblico = false;
    cambiate = [{ pianta: { id: "p1", titolo: "Rilievo appartamento", versioneCorrente: 2 }, confronto: [confrontoBagno] }];
    render(<OrderComputoTab orderId="o1" companyId="c1" canEdit />);
    const avviso = screen.getByRole("status", { name: "La pianta è cambiata" });
    expect(avviso).toHaveTextContent("va prima sbloccato");
    expect(within(avviso).queryByRole("button")).toBeNull();
  });
});
