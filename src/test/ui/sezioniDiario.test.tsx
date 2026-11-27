import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { SezioniDiario } from "@/components/orders/SezioniDiario";

const m = vi.hoisted(() => ({ importi: true }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewOrderAmounts: m.importi }) }));
vi.mock("@/lib/rendiconti/rendicontiGiornalieri", () => ({ elencoRendiconti: async () => [{ id: "a" }, { id: "b" }] }));
afterEach(cleanup);

const draw = (onChange = vi.fn(), value: "rapportini" | "rendiconti" = "rapportini") => render(
  <QueryClientProvider client={new QueryClient()}><SezioniDiario orderId="o" value={value} onChange={onChange} nRapportini={5} /></QueryClientProvider>,
);

it("mostra le due sezioni con i numeri e passa dall'una all'altra", async () => {
  const onChange = vi.fn();
  draw(onChange);
  expect(screen.getByRole("button", { name: "Rapportini (5)" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(await screen.findByRole("button", { name: "Rendiconti al committente (2)" }));
  expect(onChange).toHaveBeenCalledWith("rendiconti");
});

it("senza il permesso sugli importi non mostra il numero dei rendiconti", () => {
  m.importi = false;
  draw();
  expect(screen.getByRole("button", { name: "Rendiconti al committente" })).toBeVisible();
  m.importi = true;
});
