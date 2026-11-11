import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const query = vi.hoisted(() => ({ error: null as Error | null, refetch: vi.fn() }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditMezzi: true, isAdmin: false, solaLettura: false }) }));
vi.mock("@/hooks/useMezzi", () => ({ useCreaInventario: () => ({ mutateAsync: vi.fn(), isPending: false }), useMezziCategorie: () => ({ data: [] as unknown[] }), useInventari: () => ({ data: [] as unknown[], isLoading: false, error: query.error, refetch: query.refetch }) }));
import MezziInventario from "@/pages/azienda/MezziInventario";
beforeEach(() => { query.error = null; query.refetch.mockClear(); });
afterEach(cleanup);
it("distingue una lettura fallita da un inventario mai fatto e consente di riprovare", () => {
  query.error = new Error("offline");
  render(<MemoryRouter><MezziInventario /></MemoryRouter>);
  expect(screen.queryByText("Nessun inventario fatto finora.")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Impossibile aggiornare gli inventari");
  fireEvent.click(screen.getByRole("button", { name: "Riprova caricamento inventari" }));
  expect(query.refetch).toHaveBeenCalledOnce();
});
it("mostra lo stato vuoto dopo una lettura riuscita", () => {
  render(<MemoryRouter><MezziInventario /></MemoryRouter>);
  expect(screen.getByText("Nessun inventario fatto finora.")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("annullando il nuovo giro riporta il focus al comando che lo ha aperto", async () => {
  render(<MemoryRouter><MezziInventario /></MemoryRouter>);
  const trigger = screen.getByRole("button", { name: "Nuovo giro" });
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
  await waitFor(() => expect(trigger).toHaveFocus());
});
