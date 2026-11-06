import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ManualTreasuryPanel } from "@/components/tesoreria/ManualTreasuryPanel";
const state = vi.hoisted(() => ({ accounts: [{ id: "cassa", display_name: "Cassa demo", current_balance: 0, opening_balance: 0 }] }));
vi.mock("@/hooks/useManualTreasury", () => ({ useManualTreasury: () => ({ accounts: state.accounts, isLoading: false, createAccount: {}, updateAccount: {} }) }));
vi.mock("@/components/tesoreria/ManualTransactionsSheet", () => ({ ManualTransactionsSheet: ({ account, open }: { account: { current_balance: number } | null; open: boolean }) => open ? <div role="status">Saldo finestra: {account?.current_balance}</div> : null }));
afterEach(cleanup);
it("aggiorna il saldo della finestra già aperta quando la query riceve il nuovo conto", () => {
  const view = render(<ManualTreasuryPanel />);
  fireEvent.click(screen.getByRole("button", { name: "Movimenti" }));
  expect(screen.getByRole("status")).toHaveTextContent("Saldo finestra: 0");
  state.accounts = [{ ...state.accounts[0], current_balance: 1 }];
  view.rerender(<ManualTreasuryPanel />);
  expect(screen.getByRole("status")).toHaveTextContent("Saldo finestra: 1");
});
