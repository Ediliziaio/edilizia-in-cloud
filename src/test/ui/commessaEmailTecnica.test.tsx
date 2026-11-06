import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OrdineCliente } from "@/components/orders/OrdineCliente";
afterEach(cleanup);
it("non presenta l'identificatore tecnico come recapito del cliente", () => {
  render(<MemoryRouter><OrdineCliente customer={{ id: "demo", first_name: "Cliente", last_name: "Demo", email: "cliente-demo@no-email.ediliziaincloud.local", phone: null, address: null }} /></MemoryRouter>);
  expect(screen.getByText("Email non indicata")).toBeInTheDocument();
  expect(screen.queryByText(/@no-email/)).not.toBeInTheDocument();
});
it("mantiene visibile un recapito reale nello snapshot senza anagrafica", () => {
  render(<MemoryRouter><OrdineCliente customer={null} snapshot={{ name: "Demo", email: "info@example.com" }} /></MemoryRouter>);
  expect(screen.getByText("info@example.com")).toBeInTheDocument();
});
