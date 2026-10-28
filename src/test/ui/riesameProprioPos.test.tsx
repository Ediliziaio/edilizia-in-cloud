import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  loading: false,
  fetching: false,
  errore: false,
  refetch: vi.fn(),
}));
vi.mock("@/hooks/useRiesameProprioPos", () => ({
  useRiesameProprioPos: () => ({
    isLoading: m.loading,
    isFetching: m.fetching,
    isError: m.errore,
    error: new Error("Originale cambiato"),
    refetch: m.refetch,
    dataUpdatedAt: Date.now(),
    data: {
      attivita: "TEST posa",
      dal: "2026-11-10",
      al: "2026-11-15",
      revisione: 2,
      responsabile: "TEST tecnico",
      ruolo_responsabile: "TEST referente",
      persone: [{}],
      riscontri: [
        {
          persona_id: "h",
          profilo_id: "p",
          requisito_id: "r",
          nominativo: "TEST addetto",
          mansione: "TEST posatore",
          titolo: "TEST requisito",
          profilo_nome: "TEST profilo",
          profilo_versione: 1,
          esito: "non_applicabile",
          motivazione: "TEST motivazione",
          qualifica: null,
        },
      ],
    },
  }),
}));
import { RiesameProprioPos } from "@/components/sicurezza/RiesameProprioPos";
afterEach(cleanup);
beforeEach(() => {
  m.loading = false;
  m.fetching = false;
  m.errore = false;
  m.refetch.mockReset();
});
const ui = () => <RiesameProprioPos companyId="c" orderId="o" id="r" />;
it("mostra matrice e scopo senza promettere inserimento o approvazione", () => {
  render(ui());
  expect(
    screen.getByRole("table", {
      name: "Riscontri nominativi della propria impresa",
    }),
  ).toBeTruthy();
  expect(screen.getByText("TEST addetto")).toBeTruthy();
  expect(screen.getByText(/non inserisce dati nel POS/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Ricontrolla le fonti" }));
  expect(m.refetch).toHaveBeenCalledOnce();
});
it("un errore corrente nasconde anche dati precedentemente in cache", () => {
  m.errore = true;
  render(ui());
  expect(screen.getByRole("alert").textContent).toContain("Originale cambiato");
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.queryByText("TEST addetto")).toBeNull();
});
it("durante la prima lettura non mostra riscontri cached come verificati", () => {
  m.loading = true;
  m.fetching = true;
  render(ui());
  expect(screen.getByRole("status")).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.getByRole("button")).toBeDisabled();
});
