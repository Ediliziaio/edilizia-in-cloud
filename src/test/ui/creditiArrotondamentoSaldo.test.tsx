import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WalletCard } from "@/components/credits/WalletCard";
import type { Wallet } from "@/hooks/credits/useWallets";
afterEach(cleanup);
const wallet: Wallet = { type: "ai", label: "Crediti", balance: 100.184, freeBalance: 1.594, freeGranted: 25, spent: 0, recharged: 100, currency: "eur", blocked: false, rechargeable: true };
it("spiega il centesimo dovuto agli arrotondamenti mostrando i valori di dettaglio", () => {
  render(<WalletCard wallet={wallet} />);
  expect(screen.getByText("101,78 €")).toBeInTheDocument();
  expect(screen.getByText("Perché la somma differisce di un centesimo?")).toBeInTheDocument();
  expect(screen.getByText(/Dettaglio a sei decimali/)).toHaveTextContent("1,594000 € inclusi + 100,184000 € ricaricati = 101,778000 € disponibili.");
});
it("non segnala differenze quando i saldi ai centesimi si riconciliano", () => {
  render(<WalletCard wallet={{ ...wallet, balance: 100.18, freeBalance: 1.59 }} />);
  expect(screen.getByText("101,77 €")).toBeInTheDocument();
  expect(screen.queryByText("Perché la somma differisce di un centesimo?")).not.toBeInTheDocument();
});
