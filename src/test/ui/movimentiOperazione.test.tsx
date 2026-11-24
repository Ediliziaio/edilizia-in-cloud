import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { changeFormControl } from "@/test/helpers/changeFormControl";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";

/** Cantiere → «Tutta l'operazione» (lotto B, 14/11/2026): elenchi unici con la colonna Commessa. */
const m = vi.hoisted(() => ({ dati: null as unknown, leggi: vi.fn() }));
vi.mock("@/hooks/useSottofasi", () => ({
  useSottofasi: () => ({
    perFase: new Map([["fase-a", [{ id: "s1", name: "Armatura fondazioni", position: 0, data_inizio: "2026-11-03", data_fine: "2026-11-06", percentuale: 40 }]]]),
    isLoading: false, isError: false,
  }),
}));
vi.mock("@/hooks/useVociPrevisteFasi", () => ({
  useVociPrevisteFasi: () => ({
    data: [{ id: "v1", phase_id: "fase-a", subphase_id: "s1", descrizione: "Armatura fondazioni", quantita: 12.5, unita: "kg", importo: 500 }],
    isLoading: false, isError: false,
  }),
}));
vi.mock("@/hooks/useMovimentiOperazione", () => ({
  useMovimentiOperazione: (...argomenti: unknown[]) => {
    m.leggi(...argomenti);
    return { data: m.dati, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));
vi.mock("@/hooks/useDettagliPrioritaOperazione", () => ({
  useEdificiPriorita: (id?: string) => ({ data: id ? [{ edificio: "Palazzina B", order_id: "f1" }] : undefined }),
  useReferentiPriorita: (): { data: Record<string, string | null> } => ({ data: { f1: "Giulia Rossi", g: null } }),
  useFasiConsegna: () => ({ data: [{ id: "fase-a", order_id: "f1", name: "Fondazioni e struttura" }] }),
}));
vi.mock("@/hooks/useMaterialiOperazione", () => ({
  useConsegneFasiOperazione: () => ({ isPending: true }),
}));
vi.mock("@/hooks/useCassaOperazione", () => ({
  useCassaOperazione: () => ({
    previsti: [
      { id: "costo:saldo", costId: "saldo", orderId: "f1", description: "Saldo fornitore", direction: "out", date: "2026-11-20", cents: 68300, href: "/azienda/costi" },
      { id: "anticipo", description: "Incasso duplicato", direction: "in", date: "2026-11-20", cents: 98000, possibleDuplicate: true },
    ],
    avvisi: [] as never[], isError: false, isLoading: false,
  }),
}));
import type { VistaOperazione } from "@/hooks/useMovimentiOperazione";
import { MovimentiOperazione } from "@/components/orders/generali/moduli/MovimentiOperazione";

const riepilogo = {
  generale: { id: "g", codice: "O-0003", nome: "Via Lotti", modello: "sviluppo" },
  figlie: [{ id: "f1", codice: "O-0038", nome: "Unità 1" }],
  permessi: { costi: true, importi: true, margini: true },
} as unknown as RiepilogoGenerale;

m.dati = {
  rapportini: [
    { id: "r1", order_id: "g", data_lavoro: "2026-11-10", ore_lavorate: 8, descrizione_lavori: "Scavi", stato: "inviato", approvato: true, approvato_at: "2026-11-12T10:00:00Z", ore_straordinario: 1.5, foto_urls: ["foto-1", "foto-2"], autore: { first_name: "Mario", last_name: "Rossi" } },
    { id: "r2", order_id: "f1", data_lavoro: "2026-11-11", ore_lavorate: 4.5, descrizione_lavori: "Tracce", stato: "inviato", approvato: false, autore: null },
  ],
  ordini: [{ id: "o1", order_id: "f1", oda_number: "ODA-7", status: "confermato", issue_date: "2026-11-01", expected_delivery_date: "2026-11-07", actual_delivery_date: "2026-11-09", supplier_reference: "CONF-15", total: 1200, supplier_id: "s1" }],
  ddt: [{ id: "d1", order_id: "g", numero_ddt: "55", data_ricezione: "2026-11-05", stato: "ricevuto", supplier_id: "s1", purchase_order_id: null, destinazione: "cantiere", corriere: "Trasporti Demo", ricevuto_da_nome: "Antonio Verdi" }],
  costi: [
    { id: "c1", order_id: "g", name: "Acconto terreno", amount: 200000, documento_data: "2026-11-10", due_date: null, is_paid: true, paid_date: "2026-11-10", supplier_id: null },
    { id: "c2", order_id: "f1", name: "Progetto", amount: 1000, documento_data: "2026-11-02", due_date: "9999-12-31", is_paid: false, paid_date: null, supplier_id: "s1" },
  ],
  giornale: [{ id: "gl1", order_id: "f1", data_lavori: "2026-11-11", lavorazioni_eseguite: "Getto solaio", personale_presente: 4, stato: "firmato" }],
  timbrature: [{ id: "t1", order_id: "g", tipo: "entrata", timestamp_evento: "2026-11-11T07:30:00Z", persona: { first_name: "Mario", last_name: "Rossi" } }],
  mezzi: [
    { id: "m1", order_id: "g", giorno: "2026-11-11", usato: true, contatore: 1250, mezzo: { nome: "Escavatore", targa: "AB123CD" } },
    { id: "m2", order_id: "f1", giorno: "2026-11-12", usato: false, contatore: null, mezzo: { nome: "Gru", targa: null } },
  ],
  fasi: [], rapportiniCronoprogramma: [], subappalti: [],
  fornitori: { s1: "SPRING SRL" },
};

afterEach(cleanup);

function disegna(vista: VistaOperazione, onApri = vi.fn(), onApriRapportino = vi.fn()) {
  return render(
    <MemoryRouter><MovimentiOperazione riepilogo={riepilogo} vista={vista} onApri={onApri} onApriRapportino={onApriRapportino} /></MemoryRouter>,
  );
}

describe("tutta l'operazione nel cantiere", () => {
  it("espande una fase e apre la scheda della stessa unità con sottofase e voce collegate", async () => {
    const dati = m.dati as Record<string, unknown>;
    m.dati = { ...dati, fasi: [{ id: "fase-a", order_id: "f1", name: "Fondazioni", status: "in_corso", percentuale: 40 }] };
    try {
      const apri = vi.fn();
      disegna("lavorazioni", apri);
      const fase = screen.getByRole("button", { name: "Fondazioni", expanded: false });
      fireEvent.click(fase);
      const tabella = within(await screen.findByRole("table", { name: "Dettaglio Fondazioni" }));
      expect(tabella.getByRole("cell", { name: "Armatura fondazioni" })).toBeInTheDocument();
      expect(tabella.getByRole("cell", { name: "12,5 kg" })).toBeInTheDocument();
      expect(tabella.getByRole("cell", { name: "40%" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Apri scheda della fase" }));
      expect(apri).toHaveBeenCalledWith("f1", "fase-a");
      fireEvent.click(fase);
      expect(screen.queryByRole("table", { name: "Dettaglio Fondazioni" })).not.toBeInTheDocument();
      changeFormControl(screen.getByLabelText("Edificio delle lavorazioni"), { target: { value: "Palazzina B" } });
      expect(m.leggi).toHaveBeenLastCalledWith(riepilogo, "lavorazioni", undefined, { dal: "", al: "" }, { fasi: 1 }, "tutte",
        { nome: "Palazzina B", idCommesse: ["f1"] });
    } finally {
      m.dati = dati;
    }
  });
  it("rapportini di generale e commesse insieme, con le ore sommate e la commessa di ognuno", () => {
    const apri = vi.fn();
    const apriRapportino = vi.fn();
    disegna("rapportini", apri, apriRapportino);
    expect(screen.getByText("2 rapportini · 12,5 ore")).toBeInTheDocument();
    const righe = screen.getAllByRole("row").slice(1);
    expect(within(righe[0]).getByText("Generale")).toBeInTheDocument();
    expect(within(righe[0]).getByRole("cell", { name: "1,5" })).toBeInTheDocument();
    expect(within(righe[0]).getByRole("cell", { name: "2" })).toBeInTheDocument();
    expect(within(righe[0]).getByRole("cell", { name: "12/11/2026" })).toBeInTheDocument();
    expect(within(righe[1]).getByText("Unità 1")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Edificio" })).toBeInTheDocument();
    expect(within(righe[1]).getByRole("cell", { name: "Palazzina B" })).toBeInTheDocument();
    fireEvent.click(within(righe[1]).getByRole("button", { name: /O-0038/ }));
    expect(apri).toHaveBeenCalledWith("f1");
    fireEvent.click(within(righe[1]).getByRole("button", { name: "Tracce" }));
    expect(apriRapportino).toHaveBeenCalledWith("f1", "r2");
  });

  it("rilegge i registri per pagina e torna alla prima quando si applica un intervallo", () => {
    // La navigazione cambia la richiesta, senza accorciare lato client i dati in cache.
    const dati = m.dati as Record<string, unknown>;
    m.dati = { ...dati, pagine: { rapportini: { altre: true } } };
    try {
      disegna("rapportini");
      const pagine = within(screen.getByRole("navigation", { name: "Pagine di Rapportini" }));
      fireEvent.click(pagine.getByRole("button", { name: "Avanti" }));
      expect(m.leggi).toHaveBeenLastCalledWith(riepilogo, "rapportini", undefined, { dal: "", al: "" }, { rapportini: 2, giornale: 1 }, "tutte", undefined);
      fireEvent.change(screen.getByLabelText("Movimenti dal"), { target: { value: "2026-07-01" } });
      fireEvent.change(screen.getByLabelText("Movimenti al"), { target: { value: "2026-07-31" } });
      fireEvent.submit(screen.getByRole("form", { name: "Periodo dei movimenti" }));
      expect(m.leggi).toHaveBeenLastCalledWith(riepilogo, "rapportini", undefined,
        { dal: "2026-07-01", al: "2026-07-31" }, { rapportini: 1, giornale: 1 }, "tutte", undefined);
      expect(pagine.getByRole("button", { name: "Indietro" })).toBeDisabled();
    } finally {
      m.dati = dati;
    }
  });

  it("forniture: ordini e DDT, con il fornitore e il DDT senza ordine", () => {
    const { unmount } = disegna("acquisti");
    expect(screen.getByRole("link", { name: "ODA-7" })).toHaveAttribute("href", "/azienda/ordini-acquisto/o1");
    expect(screen.getByRole("cell", { name: "CONF-15" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "09/11/2026" })).toBeInTheDocument();
    expect(screen.getByText("SPRING SRL")).toBeInTheDocument();
    unmount();
    disegna("ddt");
    expect(screen.getByRole("link", { name: "55" })).toHaveAttribute("href", "/azienda/ddt/d1");
    expect(screen.getByText("SPRING SRL")).toBeInTheDocument();
    expect(screen.getByText("Senza ordine")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Cantiere" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Trasporti Demo" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Antonio Verdi" })).toBeInTheDocument();
  });

  it("costi: totale, non pagati, e il pagamento ignoto (9999) non diventa né una data né una scadenza", () => {
    disegna("fatture");
    expect(screen.getByText("2 costi registrati")).toBeInTheDocument();
    expect(screen.getByText("Pagato il 10/11/2026")).toBeInTheDocument();
    expect(screen.getByText("Da confermare")).toBeInTheDocument();
    expect(screen.queryByText(/9999/)).toBeNull();
  });

  it("rapportini col giornale dei lavori, squadre con timbrature e mezzi", () => {
    const { unmount } = disegna("rapportini");
    expect(screen.getByText("Getto solaio")).toBeInTheDocument();
    expect(screen.getByText("1 giornata")).toBeInTheDocument();
    unmount();
    disegna("squadre");
    expect(screen.getByText("Mario Rossi")).toBeInTheDocument();
    expect(screen.getByText("Escavatore · AB123CD")).toBeInTheDocument();
    expect(screen.getByText("Fermo")).toBeInTheDocument();
    expect(screen.getByText("1 giornata di lavoro")).toBeInTheDocument();
  });

  it("nella coda per urgenza consegne e DDT aprono i documenti e ogni rapportino apre la propria scheda", () => {
    const apriRapportino = vi.fn();
    disegna("da-seguire", vi.fn(), apriRapportino);
    const coda = within(screen.getByRole("region", { name: "Priorità del cantiere" }));
    const tabella = within(coda.getByRole("table", { name: "Priorità operative" }));
    expect(tabella.getByRole("columnheader", { name: "Referente" })).toBeInTheDocument();
    const righe = tabella.getAllByRole("row").slice(1);
    expect(righe[0]).toHaveTextContent("Consegna in ritardo");
    expect(within(righe[0]).getByRole("cell", { name: "Giulia Rossi" })).toBeInTheDocument();
    expect(righe[0]).toHaveTextContent("Attesa il 07/11/2026");
    expect(coda.getByRole("link", { name: /DDT da verificare/ })).toHaveAttribute("href", "/azienda/ddt/d1");
    fireEvent.click(coda.getByRole("button", { name: /Tracce/ }));
    expect(apriRapportino).toHaveBeenCalledWith("f1", "r2");
  });

  it("sfoglia una categoria e riparte dalla prima pagina quando cambia il periodo", () => {
    const dati = m.dati as Record<string, unknown>;
    m.dati = { ...dati, pagine: { ddt: { altre: true } } };
    try {
      disegna("da-seguire");
      const coda = within(screen.getByRole("region", { name: "Priorità del cantiere" }));
      fireEvent.click(coda.getByRole("button", { name: "DDT" }));
      expect(coda.queryByRole("link", { name: /Consegna in ritardo/ })).not.toBeInTheDocument();
      fireEvent.click(coda.getByRole("button", { name: "Avanti" }));
      expect(m.leggi).toHaveBeenLastCalledWith(riepilogo, "da-seguire", undefined, { dal: "", al: "" }, { ddt: 2 }, "ddt", undefined);
      changeFormControl(coda.getByLabelText("Edificio delle priorità"), { target: { value: "Palazzina B" } });
      fireEvent.change(screen.getByLabelText("Movimenti dal"), { target: { value: "2026-11-01" } });
      fireEvent.submit(screen.getByRole("form", { name: "Periodo dei movimenti" }));
      expect(m.leggi).toHaveBeenLastCalledWith(riepilogo, "da-seguire", undefined, { dal: "2026-11-01", al: "" }, { ddt: 1 }, "ddt",
        { nome: "Palazzina B", idCommesse: ["f1"] });
      const piano = new URL(coda.getByRole("link", { name: "Cassa e indicatori" }).getAttribute("href")!, "http://localhost");
      expect(piano.searchParams.get("priorita-edificio")).toBe("Palazzina B");
      expect(piano.searchParams.get("mov-dal")).toBe("2026-11-01");
      expect(piano.searchParams.get("cassa-base")).toBe("attesi");
    } finally {
      m.dati = dati;
    }
  });

  it("apre la fase collegata alla consegna e porta dalla cassa alla fonte del costo", () => {
    const apri = vi.fn();
    disegna("da-seguire", apri);
    fireEvent.click(screen.getByRole("button", { name: "Fasi collegate" }));
    const fasi = within(screen.getByRole("dialog", { name: "Lavorazioni collegate" }));
    fireEvent.click(fasi.getByRole("button", { name: /Fondazioni e struttura/ }));
    expect(apri).toHaveBeenCalledWith("f1", "fase-a");
    const coda = within(screen.getByRole("region", { name: "Priorità del cantiere" }));
    fireEvent.click(coda.getByRole("button", { name: "Cassa" }));
    expect(coda.getByRole("link", { name: /Saldo fornitore/ })).toHaveAttribute("href", "/azienda/costi?costo=saldo");
    expect(coda.queryByText("Incasso duplicato")).not.toBeInTheDocument();
    expect(coda.getByRole("link", { name: "Cassa e indicatori" }).getAttribute("href")).toContain("vista-piano=cassa");
  });
});
