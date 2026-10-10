/**
 * Impostazioni → Crediti (09/10/2026).
 *
 * - Il menu «Ricarica» ha due voci. «Agenti AI» e «WhatsApp» facevano pagare un prodotto Stripe che accredita lo
 *   specchio che nessuno legge più (il credito è uno solo dal 07/09): chi avesse pagato da lì non avrebbe ricevuto
 *   credito. Finora 0 ricariche passate da quelle due voci.
 * - Una testata sola: il titolo lo mette il layout, il saldo sta nel riquadro. Prima c'erano due titoli di primo
 *   livello e il saldo tre volte.
 * - Una sola frase per i servizi bloccati, anche dentro Piano abbonamento → Crediti (prima due).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const stato = vi.hoisted(() => ({ bloccato: false, saldo: 42.5 }));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "az-1" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => { const b = { select: () => b, eq: () => b, gte: () => b, order: () => b, then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [] as unknown[], error: null as unknown }).then(ok) }; return b; } },
}));
vi.mock("@/hooks/credits/useWallets", () => ({
  useWallets: () => ({
    wallets: [
      { type: "email", label: "Crediti", balance: stato.saldo, spent: 0, recharged: 0, blocked: stato.bloccato, currency: "eur", rechargeable: true },
      { type: "render", label: "Render AI", balance: 3, spent: 0, recharged: 0, blocked: false, currency: "count", rechargeable: true },
    ],
    totalBalanceEur: stato.saldo,
    hasBlocked: stato.bloccato,
    isLoading: false,
    isError: false,
    refetch: () => {},
  }),
}));
vi.mock("@/components/credits/WalletCard", () => ({ WalletCard: ({ wallet }: { wallet: { label: string } }) => <p>Scheda {wallet.label}</p> }));
vi.mock("@/components/credits/SmsWalletCard", () => ({ SmsWalletCard: (): null => null }));
vi.mock("@/components/credits/UnifiedAutoTopupCard", () => ({ UnifiedAutoTopupCard: () => <p>Ricarica automatica</p> }));
vi.mock("@/components/credits/ConsumptionByService", () => ({ ConsumptionByService: (): null => null }));
vi.mock("@/components/credits/CreditsHistory", () => ({ CreditsHistory: (): null => null }));
vi.mock("@/components/credits/ConsumoForecastChart", () => ({ ConsumoForecastChart: (): null => null }));
vi.mock("@/components/email-marketing/EmailQuotaWidget", () => ({ EmailQuotaWidget: (): null => null }));
vi.mock("@/components/credits/TeamAIUsage", () => ({ default: (): null => null }));
// La finestra vera si monta solo cliccando una voce del menu: qui basta sapere quale portafoglio apre.
vi.mock("@/components/credits/RechargeDialog", () => ({ RechargeDialog: ({ walletType }: { walletType: string }) => <p>Si apre la ricarica «{walletType}»</p> }));

import SettingsCredits from "@/pages/azienda/settings/SettingsCredits";

// Radix DropdownMenu in jsdom
Object.assign(Element.prototype, { hasPointerCapture: () => false, releasePointerCapture: () => {}, setPointerCapture: () => {}, scrollIntoView: () => {} });

function apri(embedded = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><SettingsCredits embedded={embedded} /></MemoryRouter></QueryClientProvider>);
}
const apriMenuRicarica = () => fireEvent.pointerDown(screen.getByRole("button", { name: /Ricarica$/ }), { button: 0, ctrlKey: false, pointerType: "mouse" });

beforeEach(() => { stato.bloccato = false; stato.saldo = 42.5; });
afterEach(cleanup);

describe("Crediti: il menu «Ricarica»", () => {
  it("ha due voci: i crediti (AI, email, WhatsApp) e i pacchetti Render AI", async () => {
    apri();
    apriMenuRicarica();
    const voci = (await screen.findAllByRole("menuitem")).map((v) => v.textContent?.trim());
    expect(voci).toEqual(["Crediti (AI, email, WhatsApp)", "Render AI (pacchetti)"]);
  });

  it("«Agenti AI» e «WhatsApp» non ci sono più", async () => {
    apri();
    apriMenuRicarica();
    await screen.findAllByRole("menuitem");
    expect(screen.queryByRole("menuitem", { name: /Agenti AI/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /^WhatsApp$/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Email Marketing/ })).toBeNull();
  });

  it("la prima voce ricarica il portafoglio unico, la seconda i render", async () => {
    apri();
    apriMenuRicarica();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Crediti \(AI, email, WhatsApp\)/ }));
    expect(await screen.findByText("Si apre la ricarica «email»")).toBeInTheDocument();
    cleanup();
    apri();
    apriMenuRicarica();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Render AI/ }));
    expect(await screen.findByText("Si apre la ricarica «render»")).toBeInTheDocument();
  });

  it("nessun altro punto della pagina offre di ricaricare «ai» o «whatsapp»", () => {
    const pagina = readFileSync(resolve(process.cwd(), "src/pages/azienda/settings/SettingsCredits.tsx"), "utf8");
    expect(pagina).not.toContain('setRechargeWallet("ai")');
    expect(pagina).not.toContain('setRechargeWallet("whatsapp")');
  });
});

describe("Crediti: una testata, una frase per i blocchi", () => {
  it("nella pagina non c'è nessun titolo di primo livello (lo mette il layout) e il saldo compare una volta", () => {
    apri();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getAllByText(/42,50/)).toHaveLength(1);
    expect(screen.getByText("Saldo totale")).toBeInTheDocument();
    expect(screen.queryByText("Crediti & Saldo")).toBeNull();
  });

  it("servizi fermi: una frase sola, nella pagina e dentro Piano abbonamento", () => {
    stato.bloccato = true;
    for (const dentro of [false, true]) {
      cleanup();
      apri(dentro);
      expect(screen.getAllByText(/servizi sono fermi/), dentro ? "embedded" : "pagina").toHaveLength(1);
      expect(screen.getByRole("alert")).toHaveTextContent("Ricarica i crediti per farli ripartire.");
      expect(screen.queryByText(/bloccati per saldo/)).toBeNull();
    }
  });

  it("senza blocchi non c'è nessun avviso", () => {
    apri(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("i nomi sono in italiano: «Consumo AI per persona» e «Filtra per servizio, tipo e data»", () => {
    apri(true);
    const accordion = screen.getByText(/Storico transazioni/).closest("button") as HTMLElement;
    expect(within(accordion).getByText("Filtra per servizio, tipo e data")).toBeInTheDocument();
    expect(screen.getByText("Consumo AI per persona")).toBeInTheDocument();
    expect(screen.queryByText(/wallet/i)).toBeNull();
    expect(screen.queryByText(/Consumo AI Team|per utente/)).toBeNull();
  });
});
