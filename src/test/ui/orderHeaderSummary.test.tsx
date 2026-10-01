import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OrderHeaderSummary } from "@/components/orders/OrderHeaderSummary";
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
});
