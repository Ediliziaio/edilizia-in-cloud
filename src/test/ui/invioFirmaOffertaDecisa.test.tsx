/**
 * InviaFirmaCard (preventivi dei moduli): un'offerta già decisa non si «reinvia».
 *
 * La scheda spegneva «Reinvia aggiornato» solo guardando la data di firma: dopo un
 * RIFIUTO del cliente il pulsante restava acceso (e il badge diceva «Visto dal cliente»);
 * cliccandolo si riscrivevano PDF e totali e solo dopo il server rispondeva 409.
 * Ora la scheda legge anche lo stato (accettata, rifiutata, commessa, annullata).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FRASI_OFFERTA_MODULO } from "@/lib/moduli/esitoOffertaModulo";

const stato = vi.hoisted(() => ({ mobile: false }));
const ponte = vi.hoisted(() => ({
  leggi: vi.fn(),
  upsert: vi.fn(),
  invia: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditPreventivi: true, isLoading: false }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "utente-1" } }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => stato.mobile }));
vi.mock("@/components/moduli/BarraInvioMobile", () => ({
  BarraInvioMobile: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/moduli/quoteBridge", () => ({
  getModuleQuote: (...argomenti: unknown[]) => ponte.leggi(...argomenti),
  upsertModuleQuote: (...argomenti: unknown[]) => ponte.upsert(...argomenti),
  sendModuleQuoteSignature: (...argomenti: unknown[]) => ponte.invia(...argomenti),
  signatureLink: (t: string) => `https://esempio.it/firma/${t}`,
  resolveModuleSignatureLink: async (): Promise<string | null> => null,
}));

import { InviaFirmaCard } from "@/components/moduli/InviaFirmaCard";

const riga = (extra: Record<string, unknown>) => ({
  id: "q1", quote_number: "OFF-2026-042", status: "inviata", signature_token: "tok-1", sent_at: "2026-09-20T10:00:00Z",
  viewed_at: "2026-09-21T10:00:00Z" as string | null, signed_at: null as string | null, expires_at: "2026-10-20T10:00:00Z", ...extra,
});

const disegna = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <InviaFirmaCard
        companyId="azienda-1" moduleKey="bagni" progettoId="progetto-1" titolo="Bagno" clientName="Cliente di prova"
        clientEmail="cliente@esempio.it" subtotal={1000} vatAmount={220} total={1220}
        generaPdfBlob={async () => new Blob()} onIndietro={() => undefined}
      />
    </QueryClientProvider>,
  );

const reinvia = () => screen.findByRole("button", { name: /Reinvia aggiornato/ });

beforeEach(() => {
  stato.mobile = false;
  ponte.leggi.mockReset(); ponte.upsert.mockReset(); ponte.invia.mockReset();
  toast.error.mockReset(); toast.success.mockReset();
  ponte.leggi.mockResolvedValue(riga({}));
});
afterEach(cleanup);

describe("InviaFirmaCard su un computer", () => {
  it("rifiutata dal cliente: «Reinvia aggiornato» spento, badge «Rifiutato dal cliente» (non «Visto»), motivo scritto", async () => {
    ponte.leggi.mockResolvedValue(riga({ status: "rifiutata" }));
    disegna();
    expect(await reinvia()).toBeDisabled();
    expect(screen.getByText("Rifiutato dal cliente")).toBeInTheDocument();
    expect(screen.queryByText("Visto dal cliente")).toBeNull();
    expect(screen.getByText(FRASI_OFFERTA_MODULO.rifiutata)).toBeInTheDocument();
  });

  it.each([
    ["accettata solo per stato", "Firmato dal cliente", { status: "accettata" }],
    ["firmata (data di firma)", "Firmato dal cliente", { status: "accettata", signed_at: "2026-09-22T10:00:00Z" }],
    ["diventata commessa", "Diventato commessa", { status: "convertita" }],
    ["annullata", "Annullato", { status: "annullata" }],
  ])("%s: pulsante spento e badge «%s»", async (_nome, etichetta, extra) => {
    ponte.leggi.mockResolvedValue(riga(extra));
    disegna();
    expect(await reinvia()).toBeDisabled();
    expect(screen.getByText(etichetta)).toBeInTheDocument();
  });

  it.each([["inviata", {}], ["scaduta", { status: "scaduta" }], ["bozza", { status: "bozza", viewed_at: null }]])(
    "%s: il reinvio aggiornato resta acceso, senza motivi di blocco",
    async (_nome, extra) => {
      ponte.leggi.mockResolvedValue(riga(extra));
      disegna();
      expect(await reinvia()).toBeEnabled();
      expect(screen.queryByText(/Questo preventivo è /)).toBeNull();
    },
  );
});

describe("InviaFirmaCard sul telefono", () => {
  it("rifiutata: nessun «Reinvia», un pulsante spento «Rifiutato», nessun link di firma", async () => {
    stato.mobile = true;
    ponte.leggi.mockResolvedValue(riga({ status: "rifiutata" }));
    disegna();
    expect(await screen.findByRole("button", { name: /Rifiutato/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Reinvia/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Link firma/ })).toBeNull();
  });

  it("firmata: resta il pulsante spento «Firmato»", async () => {
    stato.mobile = true;
    ponte.leggi.mockResolvedValue(riga({ status: "accettata", signed_at: "2026-09-22T10:00:00Z" }));
    disegna();
    expect(await screen.findByRole("button", { name: /Firmato/ })).toBeDisabled();
  });

  it("inviata: «Reinvia» acceso e link di firma", async () => {
    stato.mobile = true;
    disegna();
    expect(await screen.findByRole("button", { name: /Reinvia/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Link firma/ })).toBeInTheDocument();
  });
});

describe("InviaFirmaCard: il server dice di no (pagina rimasta aperta mentre il cliente rifiutava)", () => {
  it("l'avviso porta la frase del server e la scheda si rilegge: il pulsante si spegne", async () => {
    ponte.upsert.mockResolvedValue({ id: "q1" });
    ponte.invia.mockRejectedValue(new Error(FRASI_OFFERTA_MODULO.rifiutata));
    disegna();
    fireEvent.click(await reinvia());
    // Nel frattempo il cliente ha rifiutato: la prossima lettura lo dice.
    ponte.leggi.mockResolvedValue(riga({ status: "rifiutata" }));
    fireEvent.click(await screen.findByRole("button", { name: /Invia ora/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Invio non riuscito", { description: FRASI_OFFERTA_MODULO.rifiutata }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Reinvia aggiornato/ })).toBeDisabled());
    expect(screen.getByText("Rifiutato dal cliente")).toBeInTheDocument();
  });

  it("un invio riuscito resta com'era: avviso di successo, nessun errore", async () => {
    ponte.upsert.mockResolvedValue({ id: "q1" });
    ponte.invia.mockResolvedValue(undefined);
    disegna();
    fireEvent.click(await reinvia());
    fireEvent.click(await screen.findByRole("button", { name: /Invia ora/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
  });
});
