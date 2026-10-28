import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
const s = vi.hoisted(() => ({ fail: false, native: vi.fn() }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({
  useEffectiveCompanyId: () => "A",
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ isAdmin: true }),
}));
vi.mock("@/hooks/useAnagraficheNative", () => ({
  useAnagraficheNative: (...args: unknown[]) => {
    s.native(...args);
    return {
      data: Array.from({ length: 120 }, (_, i) => ({
        id: String(i),
        ragione_sociale: `Cliente prova ${String(i).padStart(3, "0")}`,
        tipo: "cliente",
        tipo_cliente: "B2B",
        attivo: true,
        fatturato_totale: 0,
        numero_fatture: 0,
      })),
      isError: s.fail,
      isLoading: false,
      refetch: vi.fn(),
    };
  },
}));
vi.mock("@/components/fatturazione/PartnerReconciliationPanel", () => ({
  PartnerReconciliationPanel: () : null => null,
}));
import AnagraficheList from "@/pages/azienda/fatturazione/AnagraficheList";
function Path() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}
const open = () =>
  render(
    <MemoryRouter>
      <AnagraficheList embedded />
      <Path />
    </MemoryRouter>,
  );
beforeEach(() => {
  s.fail = false;
  s.native.mockClear();
});
afterEach(cleanup);
it("richiede il registro completo e visualizza solo 30 righe per pagina", () => {
  open();
  expect(s.native).toHaveBeenCalledWith(undefined, false, true);
  expect(screen.getAllByRole("row")).toHaveLength(31);
  expect(screen.getByText(/120 anagrafiche/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Successivi" }));
  expect(screen.getByText("Cliente prova 030")).toBeInTheDocument();
  expect(screen.queryByText("Cliente prova 000")).not.toBeInTheDocument();
});
it("un errore non diventa assenza di anagrafiche", () => {
  s.fail = true;
  open();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Anagrafiche non disponibili",
  );
  expect(
    screen.queryByText("Nessuna anagrafica trovata"),
  ).not.toBeInTheDocument();
});
it("i pulsanti portano alle anagrafiche operative, senza comandi di importazione inerti", () => {
  open();
  expect(
    screen.queryByRole("button", { name: "Importa Excel" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Fornitori operativi" }));
  expect(screen.getByTestId("path")).toHaveTextContent(
    "/azienda/impostazioni/fornitori",
  );
});
