import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EconomiaFaseRiga } from "@/components/orders/EconomiaFaseRiga";
import { RiepilogoEconomicoFasi } from "@/components/orders/RiepilogoEconomicoFasi";
import { economiaFasi } from "@/lib/orders/economiaFasi";

/**
 * Venduto, costo previsto e costo consuntivo nella fase e nel riepilogo delle
 * lavorazioni (06/10/2026), ognuno col suo permesso.
 */

const economia = economiaFasi({
  fasi: [{ id: "f1" }],
  righe: [
    { id: "r1", phase_id: "f1", quantity: 10, unit_price: 150, discount_percent: 0, purchase_price: 40, standard_cost: null },
    { id: "r2", phase_id: null, quantity: 1, unit_price: 300, discount_percent: 0, purchase_price: null, standard_cost: null },
  ],
  assegnazioni: [{ phase_id: "f1", source: "employee", cost_preventivo: 1140, cost_consuntivo: 1200 }],
  acquisti: [{ order_item_id: "r1", line_total: 380 }],
});
const fase = economia.perFase.get("f1")!;

describe("riga Economia della fase", () => {
  const valore = (titolo: string) => screen.getByText(titolo).nextElementSibling;

  it("con tutti i permessi: venduto, previsto, consuntivo oltre il previsto e margine", () => {
    render(<EconomiaFaseRiga economia={fase} nomeFase="Demolizioni" vedeVenduto vedeCosti vedeMargini />);
    expect(valore("Venduto")).toHaveTextContent("1.500,00 €");
    expect(screen.getByText("dalle righe del contratto")).toBeInTheDocument();
    expect(valore("Costo previsto")).toHaveTextContent("1.540,00 €");
    // le voci stanno nel titolo della cifra, non in una riga in più
    expect(screen.getByTitle("manodopera 1.140,00 € · materiali e forniture 400,00 €")).toHaveTextContent("1.540,00 €");
    expect(valore("Costo consuntivo")).toHaveTextContent("1.580,00 €+40,00 €");
    expect(valore("Margine")).toHaveTextContent("-5,3%");
    expect(screen.getByText("previsto -2,7%")).toBeInTheDocument();
  });

  it("senza permesso sui costi: solo il venduto, niente costi né scostamento", () => {
    render(<EconomiaFaseRiga economia={fase} nomeFase="Demolizioni" vedeVenduto vedeCosti={false} vedeMargini={false} />);
    expect(screen.getByText("Venduto")).toBeInTheDocument();
    expect(screen.queryByText("Costo previsto")).not.toBeInTheDocument();
    expect(screen.queryByText(/\+40,00/)).not.toBeInTheDocument();
    expect(screen.queryByText("Margine")).not.toBeInTheDocument();
  });

  it("senza permesso sugli importi: niente venduto né margine; senza nessuno dei due la riga non c'è", () => {
    const { container, rerender } = render(<EconomiaFaseRiga economia={fase} nomeFase="Demolizioni" vedeVenduto={false} vedeCosti vedeMargini />);
    expect(screen.queryByText("Venduto")).not.toBeInTheDocument();
    expect(screen.queryByText("Margine")).not.toBeInTheDocument();
    expect(screen.getByText("Costo consuntivo")).toBeInTheDocument();
    rerender(<EconomiaFaseRiga economia={fase} nomeFase="Demolizioni" vedeVenduto={false} vedeCosti={false} vedeMargini />);
    expect(container).toBeEmptyDOMElement();
  });

  it("senza venduto (righe senza prezzo, niente importo sulla fase): un trattino, non zero euro", () => {
    const soloMateriali = economiaFasi({
      fasi: [{ id: "f1" }],
      righe: [{ id: "r1", phase_id: "f1", quantity: 60, unit_price: 0, discount_percent: 0, purchase_price: 8, standard_cost: null }],
      assegnazioni: [],
    }).perFase.get("f1")!;
    render(<EconomiaFaseRiga economia={soloMateriali} nomeFase="Massetti" vedeVenduto vedeCosti vedeMargini />);
    expect(valore("Venduto")).toHaveTextContent("—");
    expect(screen.queryByText("Margine")).not.toBeInTheDocument();
  });

  it("chi può, scrive il venduto della fase: si salva uscendo dal campo, vuoto torna alle righe, Esc annulla", () => {
    const salva = vi.fn();
    const { rerender } = render(<EconomiaFaseRiga economia={fase} nomeFase="Demolizioni" vedeVenduto vedeCosti vedeMargini onSalvaVenduto={salva} />);
    const campo = screen.getByRole("textbox", { name: "Venduto di Demolizioni" });
    expect(campo).toHaveValue("");
    expect(campo).toHaveAttribute("placeholder", "1.500,00");

    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "8.000" } });
    fireEvent.blur(campo);
    expect(salva).toHaveBeenLastCalledWith(8000);
    expect(campo).toHaveValue("8.000,00");

    // arriva il dato salvato: l'importo scritto vale più delle righe
    const scritto = economiaFasi({ fasi: [{ id: "f1", importo_venduto: 8000 }], righe: [], assegnazioni: [] }).perFase.get("f1")!;
    rerender(<EconomiaFaseRiga economia={scritto} nomeFase="Demolizioni" vedeVenduto vedeCosti vedeMargini onSalvaVenduto={salva} />);
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "9500" } });
    fireEvent.keyDown(campo, { key: "Escape" });
    fireEvent.blur(campo);
    expect(salva).toHaveBeenCalledTimes(1);
    expect(campo).toHaveValue("8.000,00");

    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "" } });
    fireEvent.blur(campo);
    expect(salva).toHaveBeenLastCalledWith(null);
  });

  it("un importo che non è un numero non si salva e il campo lo dice", () => {
    const salva = vi.fn();
    render(<EconomiaFaseRiga economia={fase} nomeFase="Demolizioni" vedeVenduto vedeCosti vedeMargini onSalvaVenduto={salva} />);
    const campo = screen.getByRole("textbox", { name: "Venduto di Demolizioni" });
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "otto mila" } });
    fireEvent.blur(campo);
    expect(salva).not.toHaveBeenCalled();
    expect(campo).toHaveAttribute("aria-invalid", "true");
  });
});

describe("economia delle lavorazioni (la tabella in cima)", () => {
  const fasiTabella = [
    { id: "f1", name: "Demolizioni", status: "completata" },
    { id: "f2", name: "Massetti", status: "da_iniziare" },
  ];
  const conti = economiaFasi({
    fasi: [{ id: "f1", importo_venduto: 8000 }, { id: "f2" }],
    righe: [
      { id: "r1", phase_id: "f2", quantity: 60, unit_price: 0, discount_percent: 0, purchase_price: 8, standard_cost: null },
      { id: "r2", phase_id: null, quantity: 1, unit_price: 0, discount_percent: 0, purchase_price: 100, standard_cost: null },
    ],
    assegnazioni: [{ phase_id: "f1", source: "team", cost_preventivo: 6300, cost_consuntivo: 6600 }],
  });
  const riga = (nome: string) => screen.getByRole("rowheader", { name: nome }).closest("tr")!;

  it("una riga per fase, il totale, quello fuori dalle fasi e quanto del contratto resta da ripartire", () => {
    render(<RiepilogoEconomicoFasi economia={conti} fasi={fasiTabella} importoContratto={85000} vedeVenduto vedeCosti vedeMargini />);
    expect(riga("Demolizioni")).toHaveTextContent("8.000,00 €6.300,00 €6.600,00 €+300,00 €17,5%");
    // righe senza prezzo di vendita: il venduto non c'è, non è zero
    expect(riga("Massetti")).toHaveTextContent("—480,00 €0,00 €—");
    expect(riga("Totale lavorazioni")).toHaveTextContent("8.000,00 €6.780,00 €6.600,00 €—");
    expect(riga("Fuori dalle fasi")).toHaveTextContent("—100,00 €0,00 €");
    expect(screen.getByText("da ripartire 77.000,00 €")).toBeInTheDocument();
    expect(screen.getByText("77.000,00 € del contratto da ripartire")).toBeInTheDocument();
    expect(screen.getByText(/1 lavorazione senza venduto/)).toBeInTheDocument();
  });

  it("nessuna lavorazione col venduto: un trattino, non zero euro, e tutto il contratto da ripartire", () => {
    const senza = economiaFasi({ fasi: [{ id: "f1" }], righe: [], assegnazioni: [{ phase_id: "f1", source: "employee", cost_preventivo: 100, cost_consuntivo: 0 }] });
    render(<RiepilogoEconomicoFasi economia={senza} fasi={[{ id: "f1", name: "Demolizioni", status: "in_corso" }]} importoContratto={85000} vedeVenduto vedeCosti vedeMargini />);
    expect(screen.getByText("Venduto", { selector: "summary span" }).querySelector("b")).toHaveTextContent("—");
    expect(riga("Totale lavorazioni")).toHaveTextContent("—100,00 €0,00 €—");
    expect(screen.getByText("85.000,00 € del contratto da ripartire")).toBeInTheDocument();
  });

  it("chi può scrive il venduto di ogni fase dalla tabella", () => {
    const salva = vi.fn();
    render(<RiepilogoEconomicoFasi economia={conti} fasi={fasiTabella} vedeVenduto vedeCosti vedeMargini onSalvaVenduto={salva} />);
    const campo = screen.getByRole("textbox", { name: "Venduto di Massetti" });
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "6.400" } });
    fireEvent.blur(campo);
    expect(salva).toHaveBeenCalledWith("f2", 6400);
  });

  it("senza permesso sugli importi niente venduto né margini; senza nessun permesso non c'è", () => {
    const { container, rerender } = render(<RiepilogoEconomicoFasi economia={conti} fasi={fasiTabella} importoContratto={85000} vedeVenduto={false} vedeCosti vedeMargini />);
    expect(screen.queryByRole("columnheader", { name: "Venduto" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Margine" })).not.toBeInTheDocument();
    expect(screen.queryByText(/da ripartire/)).not.toBeInTheDocument();
    rerender(<RiepilogoEconomicoFasi economia={conti} fasi={fasiTabella} vedeVenduto={false} vedeCosti={false} vedeMargini />);
    expect(container).toBeEmptyDOMElement();
  });
});
