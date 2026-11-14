import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";

/** Cantiere → «Tutta l'operazione» (lotto B, 14/11/2026): elenchi unici con la colonna Commessa. */
const m = vi.hoisted(() => ({ dati: null as unknown }));
vi.mock("@/hooks/useMovimentiOperazione", () => ({
  useMovimentiOperazione: () => ({ data: m.dati, isLoading: false, isError: false, refetch: vi.fn() }),
}));
import { MovimentiOperazione } from "@/components/orders/generali/moduli/MovimentiOperazione";

const riepilogo = {
  generale: { id: "g", codice: "O-0003", nome: "Via Lotti" },
  figlie: [{ id: "f1", codice: "O-0038", nome: "Unità 1" }],
  permessi: { costi: true, importi: true, margini: true },
} as unknown as RiepilogoGenerale;

m.dati = {
  rapportini: [
    { id: "r1", order_id: "g", data_lavoro: "2026-11-10", ore_lavorate: 8, descrizione_lavori: "Scavi", stato: "inviato", approvato: true, autore: { first_name: "Mario", last_name: "Rossi" } },
    { id: "r2", order_id: "f1", data_lavoro: "2026-11-11", ore_lavorate: 4.5, descrizione_lavori: "Tracce", stato: "inviato", approvato: false, autore: null },
  ],
  ordini: [{ id: "o1", order_id: "f1", oda_number: "ODA-7", status: "confermato", issue_date: "2026-11-01", total: 1200, supplier_id: "s1" }],
  ddt: [{ id: "d1", order_id: "g", numero_ddt: "55", data_ricezione: "2026-11-05", stato: "ricevuto", supplier_id: "s1", purchase_order_id: null }],
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
  fornitori: { s1: "SPRING SRL" },
  troncati: [],
};

afterEach(cleanup);

describe("tutta l'operazione nel cantiere", () => {
  it("rapportini di generale e commesse insieme, con le ore sommate e la commessa di ognuno", () => {
    const apri = vi.fn();
    render(<MovimentiOperazione riepilogo={riepilogo} vista="rapportini" onApri={apri} />);
    expect(screen.getByText("2 rapportini · 12,5 ore")).toBeInTheDocument();
    const righe = screen.getAllByRole("row").slice(1);
    expect(within(righe[0]).getByText("Generale")).toBeInTheDocument();
    expect(within(righe[1]).getByText("Unità 1")).toBeInTheDocument();
    fireEvent.click(within(righe[1]).getByRole("button"));
    expect(apri).toHaveBeenCalledWith("f1");
  });

  it("forniture: ordini e DDT, con il fornitore e il DDT senza ordine", () => {
    render(<MovimentiOperazione riepilogo={riepilogo} vista="forniture" onApri={vi.fn()} />);
    expect(screen.getByText("ODA-7")).toBeInTheDocument();
    expect(screen.getAllByText("SPRING SRL")).toHaveLength(2);
    expect(screen.getByText("Senza ordine")).toBeInTheDocument();
  });

  it("costi: totale, non pagati, e il pagamento ignoto (9999) non diventa né una data né una scadenza", () => {
    render(<MovimentiOperazione riepilogo={riepilogo} vista="fatture" onApri={vi.fn()} />);
    expect(screen.getByText(/2 costi · 201\.000 € · non segnati pagati 1\.000 €/)).toBeInTheDocument();
    expect(screen.getByText("Pagato il 10/11/2026")).toBeInTheDocument();
    expect(screen.getByText("Da confermare")).toBeInTheDocument();
    expect(screen.queryByText(/9999/)).toBeNull();
  });

  it("rapportini col giornale dei lavori, squadre con timbrature e mezzi", () => {
    const { unmount } = render(<MovimentiOperazione riepilogo={riepilogo} vista="rapportini" onApri={vi.fn()} />);
    expect(screen.getByText("Getto solaio")).toBeInTheDocument();
    expect(screen.getByText("1 giornata")).toBeInTheDocument();
    unmount();
    render(<MovimentiOperazione riepilogo={riepilogo} vista="squadre" onApri={vi.fn()} />);
    expect(screen.getByText("Mario Rossi")).toBeInTheDocument();
    expect(screen.getByText("Escavatore · AB123CD")).toBeInTheDocument();
    expect(screen.getByText("Fermo")).toBeInTheDocument();
    expect(screen.getByText("1 giornata di lavoro")).toBeInTheDocument();
  });

  it("le sezioni che si consultano una commessa alla volta lo dicono", () => {
    render(<MovimentiOperazione riepilogo={riepilogo} vista="pagamenti" onApri={vi.fn()} />);
    expect(screen.getByText(/si consulta una commessa alla volta/)).toBeInTheDocument();
  });
});
