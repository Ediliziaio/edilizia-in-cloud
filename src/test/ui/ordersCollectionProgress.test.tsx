import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { OrdersCollectionProgress } from "@/components/orders/OrdersCollectionProgress";

afterEach(cleanup);
describe("Situazione incassi delle commesse", () => {
  it("mostra quote complementari sul riscosso e residuo", () => {
    render(<OrdersCollectionProgress collected={203} pending={797} period="2026" />);
    expect(screen.getByRole("progressbar", { name: "Quota incassata" })).toHaveAttribute("aria-valuenow", "20.3");
    expect(screen.getByText("20,3%")).toBeVisible();
    expect(screen.getByText("79,7%")).toBeVisible();
    expect(screen.getByText(/commesse 2026 · IVA inclusa/)).toBeVisible();
  });
  it("non presenta zero incassi come un dato reale durante il caricamento", () => {
    render(<OrdersCollectionProgress collected={0} pending={0} period="2026" loading />);
    expect(screen.getByRole("region", { name: "Situazione incassi" })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
  it("senza importi non mostra percentuali indefinibili", () => {
    render(<OrdersCollectionProgress collected={0} pending={0} period="2026" />);
    expect(screen.getByText(/Nessun importo/)).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
  it("con nessun residuo indica incassi completati", () => {
    render(<OrdersCollectionProgress collected={100} pending={0} period="2026" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByText("0%")).toBeVisible();
  });
});
