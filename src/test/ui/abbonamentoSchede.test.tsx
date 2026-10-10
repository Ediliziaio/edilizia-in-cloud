/**
 * Impostazioni → Piano abbonamento (09/10/2026): tre schede, non quattro.
 *
 * - Via la scheda «Notifiche»: un elenco fisso di cinque email, con un rinnovo «7 giorni prima, solo piani annuali»
 *   che il codice smentiva (system-emails-tick manda l'avviso 3 giorni prima, a qualunque ciclo), un link a «Profilo →
 *   Notifiche» che ricaricava la pagina e apriva il Profilo, e una promessa «nelle prossime release».
 * - Via la sotto-scheda «Consumi crediti» dei Pagamenti: conteneva solo un rimando.
 * - Nomi che si leggono: Piano · Pagamenti · Crediti (gli indirizzi `?tab=` restano `abbonamenti`, `pagamenti`,
 *   `portafoglio`: li usano altri link dell'app).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fatture = vi.hoisted(() => [
  { id: "f1", stripeInvoiceId: "in_1", amountPaid: 12700, amountDue: 0, currency: "eur", status: "paid", invoiceUrl: null as string | null, invoicePdf: null as string | null, periodStart: "2026-09-01T00:00:00Z", periodEnd: "2026-10-01T00:00:00Z", paidAt: "2026-09-01T00:00:00Z", createdAt: "2026-09-01T00:00:00Z" },
  { id: "f2", stripeInvoiceId: "in_2", amountPaid: 0, amountDue: 12700, currency: "eur", status: "open", invoiceUrl: null as string | null, invoicePdf: null as string | null, periodStart: "2026-10-01T00:00:00Z", periodEnd: "2026-11-01T00:00:00Z", paidAt: null as string | null, createdAt: "2026-10-01T00:00:00Z" },
  { id: "f3", stripeInvoiceId: "in_3", amountPaid: 0, amountDue: 12700, currency: "eur", status: "void", invoiceUrl: null as string | null, invoicePdf: null as string | null, periodStart: "2026-08-01T00:00:00Z", periodEnd: "2026-09-01T00:00:00Z", paidAt: null as string | null, createdAt: "2026-08-01T00:00:00Z" },
  { id: "f4", stripeInvoiceId: "in_4", amountPaid: 0, amountDue: 12700, currency: "eur", status: "uncollectible", invoiceUrl: null as string | null, invoicePdf: null as string | null, periodStart: "2026-07-01T00:00:00Z", periodEnd: "2026-08-01T00:00:00Z", paidAt: null as string | null, createdAt: "2026-07-01T00:00:00Z" },
  { id: "f5", stripeInvoiceId: "in_5", amountPaid: 0, amountDue: 12700, currency: "eur", status: "draft", invoiceUrl: null as string | null, invoicePdf: null as string | null, periodStart: "2026-06-01T00:00:00Z", periodEnd: "2026-07-01T00:00:00Z", paidAt: null as string | null, createdAt: "2026-06-01T00:00:00Z" },
]);

vi.mock("@/hooks/useBilling", () => ({
  abbonamentoDaAttivare: () => false,
  useBillingInfo: () => ({
    isLoading: false,
    data: {
      planId: "p1", planName: "Starter", planPriceMonthly: 127, planPriceYearly: 1270, trialEndsAt: null as string | null, status: "active",
      dunningStatus: null as string | null, paymentFailureCount: 0, stripeCustomerId: "cus_1", stripeSubscriptionStatus: "active", paymentMethod: "stripe",
      isInDunning: false, dunningDaysLeft: 0, currentPeriodStart: "2026-10-01T00:00:00Z", currentPeriodEnd: "2026-11-01T00:00:00Z", cancelAtPeriodEnd: false, billingCycle: "monthly",
    },
  }),
  useInvoices: () => ({ data: fatture, isLoading: false }),
  useTopPlanPrice: () => ({ data: 0 }),
  useStripePaymentMethod: () => ({ data: { hasMethod: true, brand: "visa", last4: "4242", expMonth: 12, expYear: 2030 }, isLoading: false }),
  useOpenBillingPortal: () => ({ mutate: () => {}, isPending: false }),
  useStartCardSetup: () => ({ mutate: () => {}, isPending: false }),
  useStartPlanCheckout: () => ({ mutate: () => {}, isPending: false }),
  useAutoTopupFailure: () => ({ data: null as unknown }),
}));
vi.mock("@/hooks/useBillingDetails", () => ({
  useBillingDetails: () => ({ data: { legal_name: "Rossi Costruzioni Srl", vat_number: "01234567897", address_line1: "Via Roma 1", postal_code: "20100", city: "Milano", invoice_email: "amm@rossi.it" } }),
}));
vi.mock("@/hooks/useSubscriptionLimits", () => ({ useSubscriptionLimits: () => ({ isScopriPlan: false, isLoading: false }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/mobile/SoloDaComputer", () => ({ AvvisoSoloDaComputer: (): null => null }));
vi.mock("@/components/billing/BillingDetailsCard", () => ({ BillingDetailsCard: (): null => null }));
vi.mock("@/components/billing/SpazioArchiviazioneCard", () => ({ SpazioArchiviazioneCard: (): null => null }));
vi.mock("@/components/billing/PlanChangeDialog", () => ({ PlanChangeDialog: (): null => null, CancelPlanDialog: (): null => null }));
vi.mock("@/pages/azienda/settings/SettingsCredits", () => ({ default: () => <p>CONTENUTO DELLA SCHEDA CREDITI</p> }));

import SettingsSubscriptionBilling from "@/pages/azienda/settings/SettingsSubscriptionBilling";

function apri(percorso = "/azienda/impostazioni/abbonamento") {
  return render(<MemoryRouter initialEntries={[percorso]}><SettingsSubscriptionBilling /></MemoryRouter>);
}
const schede = () => screen.getAllByRole("tab").map((s) => s.textContent?.trim());

afterEach(cleanup);

describe("Piano abbonamento: tre schede", () => {
  it("Piano, Pagamenti e Crediti: non ci sono più «Notifiche», «Abbonamenti» e «Portafoglio»", () => {
    apri();
    expect(schede()).toEqual(["Piano", "Pagamenti", "Crediti"]);
  });

  it("un vecchio indirizzo ?tab=notifiche apre il Piano", () => {
    apri("/azienda/impostazioni/abbonamento?tab=notifiche");
    expect(screen.getByRole("tab", { name: "Piano" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Starter" })).toBeInTheDocument();
  });

  it("?tab=portafoglio resta l'indirizzo della scheda Crediti", async () => {
    apri("/azienda/impostazioni/abbonamento?tab=portafoglio");
    expect(screen.getByRole("tab", { name: "Crediti" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("CONTENUTO DELLA SCHEDA CREDITI")).toBeInTheDocument();
  });

  it("la pagina non promette niente sulle notifiche e non manda al Profilo", () => {
    const pagina = readFileSync(resolve(process.cwd(), "src/pages/azienda/settings/SettingsSubscriptionBilling.tsx"), "utf8");
    expect(pagina).not.toContain('href="/azienda/impostazioni/mio-profilo"');
    expect(pagina).not.toContain("Notifiche fatturazione");
    expect(pagina).not.toContain("nelle prossime release");
    expect(pagina).not.toContain("re-charge");
  });
});

describe("Piano abbonamento: Pagamenti", () => {
  it("non c'è la sotto-scheda «Consumi crediti»: un rimando alla scheda Crediti", async () => {
    apri("/azienda/impostazioni/abbonamento?tab=pagamenti");
    expect(screen.queryByRole("tab", { name: /Consumi crediti/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Fatture abbonamento/ })).toBeNull();
    expect(schede()).toEqual(["Piano", "Pagamenti", "Crediti"]);
    fireEvent.click(screen.getByRole("button", { name: "Consumi dei crediti → Crediti" }));
    expect(screen.getByRole("tab", { name: "Crediti" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("CONTENUTO DELLA SCHEDA CREDITI")).toBeInTheDocument();
  });

  it("gli stati delle fatture sono in parole: «Da pagare», «Annullata», «Non incassata», «Bozza»", () => {
    apri("/azienda/impostazioni/abbonamento?tab=pagamenti");
    const sezione = screen.getByText("Cronologia dei pagamenti").closest("div[class*='rounded']") as HTMLElement;
    const tabella = within(document.body);
    for (const etichetta of ["Pagata", "Da pagare", "Annullata", "Non incassata", "Bozza"]) {
      expect(tabella.getAllByText(etichetta).length, etichetta).toBeGreaterThan(0);
    }
    expect(sezione).toBeTruthy();
    expect(screen.queryByText("In scadenza")).toBeNull();
    for (const grezzo of ["void", "uncollectible", "draft", "open"]) expect(screen.queryByText(grezzo)).toBeNull();
  });
});

describe("Piano abbonamento: informazioni fiscali", () => {
  it("la partita IVA non porta un «Verificato» che nessuno verifica", () => {
    apri("/azienda/impostazioni/abbonamento?tab=pagamenti");
    expect(screen.getByText("01234567897")).toBeInTheDocument();
    expect(screen.queryByText("Verificato")).toBeNull();
  });
});

describe("Piano abbonamento: il Piano", () => {
  it("il pulsante e la finestra del cambio piano parlano chiaro", () => {
    apri();
    fireEvent.click(screen.getByRole("button", { name: /Cambia o annulla il piano/ }));
    const finestra = screen.getByRole("dialog");
    expect(within(finestra).getByText("Scegli cosa vuoi fare con il tuo piano.")).toBeInTheDocument();
    expect(within(finestra).getByText("Passa a un piano superiore")).toBeInTheDocument();
    expect(within(finestra).getByText("Passa a un piano più economico")).toBeInTheDocument();
    expect(within(finestra).getByText("Annulla il piano")).toBeInTheDocument();
    expect(within(finestra).queryByText(/Aspetta!/)).toBeNull();
    expect(within(finestra).queryByText(/Desidero/)).toBeNull();
  });
});
