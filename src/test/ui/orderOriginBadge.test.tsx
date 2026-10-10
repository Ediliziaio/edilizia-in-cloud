import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { OrderOriginBadge } from "@/components/orders/OrderOriginBadge";

afterEach(cleanup);
describe("origine commessa", () => {
  it("apre il preventivo commerciale, non l'editor fatture", () => {
    render(<MemoryRouter><OrderOriginBadge quoteId="q1" quoteNumber="PRV-1" /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /PRV-1/ })).toHaveAttribute("href", "/azienda/marketing/preventivi/q1");
  });
  it("non crea un link senza preventivo", () => {
    render(<MemoryRouter><OrderOriginBadge /></MemoryRouter>);
    expect(screen.getByText("Ordine diretto")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
