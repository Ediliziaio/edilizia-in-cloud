import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OrderHeaderSummary, VoceRiepilogo } from "@/components/orders/OrderHeaderSummary";
afterEach(cleanup);
describe("Riepilogo commessa compatto", () => {
  it("nelle viste operative mobile raccoglie il riepilogo senza smontare i dati", () => {
    const { container, rerender } = render(<OrderHeaderSummary compact><p>Numeri aggiornati</p></OrderHeaderSummary>);
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Numeri aggiornati")).toBeInTheDocument();
    expect(screen.getByText("Numeri e stato commessa")).toBeVisible();
    rerender(<OrderHeaderSummary compact={false}><p>Numeri aggiornati</p></OrderHeaderSummary>);
    expect(container.querySelector("details")).toBeNull();
    expect(screen.getByText("Numeri aggiornati")).toBeVisible();
  });
  it("a riepilogo chiuso mostra la riga di sintesi e tiene montati i blocchi", () => {
    const { container } = render(
      <OrderHeaderSummary compact riepilogo={<VoceRiepilogo etichetta="Incassato">80.850,00 €</VoceRiepilogo>}>
        <p>Numeri aggiornati</p>
      </OrderHeaderSummary>,
    );
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Incassato")).toBeVisible();
    expect(screen.getByText("80.850,00 €")).toBeVisible();
    expect(screen.getByText("Mostra dettagli")).toBeVisible();
    expect(screen.queryByText("Numeri e stato commessa")).not.toBeInTheDocument();
    // i blocchi restano nel DOM: nessun dato viene smontato e ricaricato
    expect(screen.getByText("Numeri aggiornati")).toBeInTheDocument();
  });
});
