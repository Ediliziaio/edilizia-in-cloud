import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
  it("con tutti i permessi: venduto, previsto, consuntivo oltre il previsto e margini", () => {
    render(<EconomiaFaseRiga economia={fase} vedeVenduto vedeCosti vedeMargini />);
    expect(screen.getByText("Venduto").nextSibling).toHaveTextContent("1.500,00 €");
    expect(screen.getByText("Costo previsto").nextSibling).toHaveTextContent("1.540,00 €");
    expect(screen.getByText("Costo consuntivo").nextSibling).toHaveTextContent("1.580,00 €");
    expect(screen.getByText("manodopera 1.140,00 € · materiali e forniture 400,00 €")).toBeInTheDocument();
    expect(screen.getByText("+40,00 € sul previsto")).toBeInTheDocument();
    expect(screen.getByText(/Margine previsto/)).toHaveTextContent("Margine previsto -2,7% · consuntivo -5,3%");
  });

  it("senza permesso sui costi: solo il venduto, niente costi né scostamento", () => {
    render(<EconomiaFaseRiga economia={fase} vedeVenduto vedeCosti={false} vedeMargini={false} />);
    expect(screen.getByText("Venduto")).toBeInTheDocument();
    expect(screen.queryByText("Costo previsto")).not.toBeInTheDocument();
    expect(screen.queryByText(/sul previsto/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Margine/)).not.toBeInTheDocument();
  });

  it("senza permesso sugli importi: niente venduto; senza nessuno dei due la riga non c'è", () => {
    const { container, rerender } = render(<EconomiaFaseRiga economia={fase} vedeVenduto={false} vedeCosti vedeMargini={false} />);
    expect(screen.queryByText("Venduto")).not.toBeInTheDocument();
    expect(screen.getByText("Costo consuntivo")).toBeInTheDocument();
    rerender(<EconomiaFaseRiga economia={fase} vedeVenduto={false} vedeCosti={false} vedeMargini />);
    expect(container).toBeEmptyDOMElement();
  });

  it("senza righe del contratto collegate il venduto dice come averlo", () => {
    const vuota = economiaFasi({ fasi: [{ id: "f1" }], righe: [], assegnazioni: [] }).perFase.get("f1")!;
    render(<EconomiaFaseRiga economia={vuota} vedeVenduto vedeCosti vedeMargini />);
    expect(screen.getByText("Venduto").nextSibling).toHaveTextContent("—");
    expect(screen.getByText("nessuna riga del contratto collegata")).toBeInTheDocument();
  });
});

describe("riepilogo economico delle lavorazioni", () => {
  it("somma le fasi e dice cosa resta fuori", () => {
    render(<RiepilogoEconomicoFasi economia={economia} vedeVenduto vedeCosti vedeMargini />);
    expect(screen.getByText("Riepilogo economico delle lavorazioni")).toBeInTheDocument();
    expect(screen.getByText("Scostamento").nextSibling).toHaveTextContent("40,00 €");
    expect(screen.getByText(/Fuori dalle fasi/)).toHaveTextContent("venduto 300,00 € (1 riga)");
  });

  it("senza permessi su importi e costi non c'è", () => {
    const { container } = render(<RiepilogoEconomicoFasi economia={economia} vedeVenduto={false} vedeCosti={false} vedeMargini />);
    expect(container).toBeEmptyDOMElement();
  });
});
