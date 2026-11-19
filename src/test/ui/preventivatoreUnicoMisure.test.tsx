import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuoteMisureRiga } from "@/components/quotes/QuoteMisureRiga";
import { rigaConMisure } from "@/lib/preventivi/misurePreventivo";
import type { QuoteItemPro } from "@/types/quoteItem";

function Preventivo() {
  const [item, setItem] = useState<QuoteItemPro>({ name: "Cartongesso", description: "", item_type: "service", item_category: "posa", quantity: 20,
    unit_price: 40, discount_percent: 10, vat_rate: 22, unit_of_measure: "mq", sort_order: 0, prezzo_acquisto: 12, mostra_nel_pdf: true, is_optional: false });
  return <><output aria-label="Quantità della voce">{item.quantity}</output><QuoteMisureRiga item={item} onChange={m => setItem(r => rigaConMisure(r, m))} /></>;
}

describe("misure facoltative nella stessa riga del preventivo", () => {
  it("attiva il calcolo, corregge una formula e torna alla quantità manuale senza perdere il dettaglio", () => {
    render(<Preventivo />);
    const toggle = screen.getByRole("switch", { name: "Calcola quantità dalle misure: Cartongesso" });
    fireEvent.click(toggle);
    expect(screen.getByRole("alert")).toHaveTextContent("Completa le misure");
    fireEvent.change(screen.getByLabelText("formula misura 1"), { target: { value: "(3+2)*2,4" } });
    expect(screen.getByLabelText("Quantità della voce")).toHaveTextContent("12");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("formula misura 1"), { target: { value: "1/0" } });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("formula misura 1"), { target: { value: "(3+2)*2,4" } });
    fireEvent.click(toggle);
    expect(screen.getByLabelText("Quantità della voce")).toHaveTextContent("20");
    expect(screen.getByLabelText("formula misura 1")).toHaveValue("(3+2)*2,4");
    expect(screen.getByLabelText("formula misura 1")).toBeDisabled();
    fireEvent.click(toggle);
    expect(screen.getByLabelText("Quantità della voce")).toHaveTextContent("12");
  });
});
