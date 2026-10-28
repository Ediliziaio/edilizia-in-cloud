import { afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PagheWorkspace } from "@/components/personale/PagheWorkspace";
const s = vi.hoisted(() => ({
  allowed: true,
  canEdit: true,
  closed: false,
  error: false,
  config: false,
  mutate: vi.fn(),
}));
vi.mock("@/hooks/useOperai", () => ({ oggiRoma: () => "2026-10-26" }));
vi.mock("@/hooks/usePayrollWorkspace", () => ({
  usePayrollWorkspace: () => {
    const q = <T,>(data: T) => ({
      data,
      isPending: false,
      isError: s.error,
      refetch: vi.fn(),
    });
    return {
      allowed: s.allowed,
      canEdit: s.canEdit,
      closed: s.closed,
      company: "c",
      change: { mutate: s.mutate, isPending: false },
      people: q([
        {
          id: "p",
          nome: "Persona",
          cognome: "Test",
          employee_id: "e",
          attivo: true,
          buono_pasto_abilitato: false,
          rimborso_km_abilitato: false,
        },
      ]),
      config: q(
        s.config
          ? {
              buono_pasto_attivo: true,
              buono_pasto_modalita: "fisso",
              buono_pasto_valore: 8,
              buono_pasto_soglia_ore: 6,
              km_tariffa_eur: 0.35,
            }
          : null,
      ),
      meals: q([] as never[]),
      km: q([] as never[]),
      movements: q([] as never[]),
      links: q([] as never[]),
      documents: q([] as never[]),
      balances: q([] as never[]),
      closure: q(null),
    };
  },
}));
afterEach(() => {
  cleanup();
  s.allowed = true;
  s.canEdit = true;
  s.closed = false;
  s.error = false;
  s.config = false;
  vi.clearAllMocks();
});
it("never mutates data on opening, changing views or cancelling a dialog", () => {
  render(<PagheWorkspace area="benefit" />);
  expect(s.mutate).not.toHaveBeenCalled();
  expect(screen.getByText(/Regole non configurate/)).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Riconcilia maturazioni" })
      .hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Regole aziendali" }));
  expect(s.mutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
  fireEvent.click(screen.getByRole("button", { name: "Diritti individuali" }));
  expect(s.mutate).not.toHaveBeenCalled();
});
it("requires explicit confirmation and names the scope of a whole-company reconciliation", () => {
  s.config = true;
  render(<PagheWorkspace area="benefit" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Riconcilia maturazioni" }),
  );
  expect(screen.getByText(/tutte le persone dell’azienda/)).toBeTruthy();
  expect(s.mutate).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Conferma riconciliazione" }),
  );
  expect(s.mutate).toHaveBeenCalledWith(
    { kind: "reconcile" },
    expect.any(Object),
  );
});
it("exposes no writes in read-only mode or on a closed month", () => {
  s.config = true;
  s.canEdit = false;
  const view = render(<PagheWorkspace area="benefit" />);
  expect(
    screen
      .getByRole("button", { name: "Regole aziendali" })
      .hasAttribute("disabled"),
  ).toBe(true);
  s.canEdit = true;
  s.closed = true;
  view.rerender(<PagheWorkspace area="benefit" />);
  expect(
    screen
      .getByRole("button", { name: "Riconcilia maturazioni" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(s.mutate).not.toHaveBeenCalled();
});
it("shows read errors instead of empty archives or fabricated balances", () => {
  s.error = true;
  render(<PagheWorkspace area="registers" />);
  expect(screen.getByRole("alert").textContent).toContain("non disponibili");
  expect(screen.queryByText("Saldo TFR registrato al periodo")).toBeNull();
});
it("keeps TFR/welfare amounts explicitly non-certified and requires missing fields before recording", () => {
  render(<PagheWorkspace area="registers" />);
  expect(
    screen.getByText(/non significa TFR o welfare pari a zero/),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Registra voce" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Conferma registrazione" }),
  );
  expect(screen.getByRole("alert").textContent).toContain("Seleziona persona");
  expect(s.mutate).not.toHaveBeenCalled();
});
