/**
 * InviaFirmaCard: il preventivo del modulo lo manda al cliente solo chi può
 * modificare i preventivi (26/09/2026).
 *
 * Deciso da Florin: mandare in firma cambia il preventivo, quindi serve il
 * permesso di modificarlo. Chi lo vede soltanto trova il pulsante spento col
 * motivo scritto e non copia il link di firma; send-quote-signature lo rifiuta
 * comunque.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const SERVE = "Per mandarlo al cliente serve il permesso di modificare i preventivi.";

const stato = vi.hoisted(() => ({
  permessi: { canEditPreventivi: false, isLoading: false },
  mobile: false,
  quote: null as null | Record<string, unknown>,
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => stato.permessi }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "utente-1" } }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => stato.mobile }));
vi.mock("@/components/moduli/BarraInvioMobile", () => ({
  BarraInvioMobile: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/moduli/quoteBridge", () => ({
  getModuleQuote: async () => stato.quote,
  upsertModuleQuote: vi.fn(),
  sendModuleQuoteSignature: vi.fn(),
  signatureLink: (t: string) => `https://esempio.it/firma/${t}`,
  resolveModuleSignatureLink: async (): Promise<string | null> => null,
}));

import { InviaFirmaCard } from "@/components/moduli/InviaFirmaCard";

const disegna = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <InviaFirmaCard
        companyId="azienda-1"
        moduleKey="bagni"
        progettoId="progetto-1"
        titolo="Bagno"
        clientName="Cliente di prova"
        clientEmail="cliente@esempio.it"
        subtotal={1000}
        vatAmount={220}
        total={1220}
        generaPdfBlob={async () => new Blob()}
        onIndietro={() => undefined}
      />
    </QueryClientProvider>,
  );

beforeEach(() => {
  stato.permessi = { canEditPreventivi: false, isLoading: false };
  stato.mobile = false;
  stato.quote = { id: "q1", sent_at: "2026-09-20T10:00:00Z", signature_token: "tok-1", signed_at: null, viewed_at: null };
  toast.error.mockClear();
});
afterEach(cleanup);

describe("InviaFirmaCard: mandare al cliente richiede di poter modificare", () => {
  it("chi vede soltanto: pulsante spento, motivo scritto, niente link di firma", async () => {
    disegna();
    const invia = await screen.findByRole("button", { name: /Reinvia aggiornato/ });
    expect(invia).toBeDisabled();
    expect(screen.getByText(SERVE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copia link firma/ })).toBeNull();
  });

  it("chi può modificare: pulsante acceso e link di firma", async () => {
    stato.permessi = { canEditPreventivi: true, isLoading: false };
    disegna();
    expect(await screen.findByRole("button", { name: /Copia link firma/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reinvia aggiornato/ })).toBeEnabled();
    expect(screen.queryByText(SERVE)).toBeNull();
  });

  it("mentre i permessi si caricano: pulsante spento ma nessun motivo sbagliato", async () => {
    stato.permessi = { canEditPreventivi: false, isLoading: true };
    disegna();
    expect(await screen.findByRole("button", { name: /Reinvia aggiornato/ })).toBeDisabled();
    expect(screen.queryByText(SERVE)).toBeNull();
  });

  it("dal telefono: il tocco spiega il motivo e non apre l'invio", async () => {
    stato.mobile = true;
    disegna();
    fireEvent.click(await screen.findByRole("button", { name: /Reinvia/ }));
    expect(toast.error).toHaveBeenCalledWith(SERVE);
    expect(screen.queryByText("Invia ora")).toBeNull();
    expect(screen.queryByRole("button", { name: /Link firma/ })).toBeNull();
  });
});
