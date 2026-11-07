import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * «Dominio email» dice il mittente vero delle campagne (21/09/2026), e dal
 * 07/11/2026 parla solo di quelle.
 *
 * Con il dominio verificato la pagina diceva «Tutte le prossime email
 * (marketing e transazionali) usciranno da noreply@dominio»: il mittente ora
 * lo calcola il server (resolveSender, in get_status). Dal 07/11/2026 le
 * aziende non usano più il loro dominio per i messaggi di servizio: la scheda
 * «Messaggi di servizio», la scelta del tipo nell'email di prova e l'avviso
 * sulla chiave Resend non ci sono più.
 */

const { invoke, toast } = vi.hoisted(() => ({
  invoke: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn(), info: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));
vi.mock("sonner", () => ({ toast }));

// La pagina decide cosa si può cambiare dal permesso «Email Marketing»: qui conta cosa dice, non chi la apre.
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ isAdmin: true, isLoading: false, canViewMarketingEmail: true, solaLettura: false }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    effectiveCompany: { id: "azienda-1" },
    user: { id: "utente-1", email: "titolare@rossi.it" },
  }),
}));

import SettingsEmailDomain from "@/pages/azienda/settings/SettingsEmailDomain";
import type { MittenteDelCanale } from "../../../supabase/functions/_shared/dominioEmailAzienda";

const DAL_DOMINIO: MittenteDelCanale = {
  from: "Rossi Costruzioni <no-reply@rossi.it>",
  fromEmail: "no-reply@rossi.it",
  usingCustomDomain: true,
  customDomainId: "dominio-1",
  domain: "rossi.it",
};
// Quello che una versione vecchia della funzione può ancora mandare.
const TRANSAZIONALE_PIATTAFORMA: MittenteDelCanale = {
  from: "Rossi Costruzioni via EdiliziaInCloud <no-reply@notifiche.ediliziaincloud.it>",
  fromEmail: "no-reply@notifiche.ediliziaincloud.it",
  usingCustomDomain: false,
  customDomainId: null,
  domain: "notifiche.ediliziaincloud.it",
};
const MARKETING_PIATTAFORMA: MittenteDelCanale = {
  from: "Rossi Costruzioni via EdiliziaInCloud <no-reply@mkt.eic-mail.com>",
  fromEmail: "no-reply@mkt.eic-mail.com",
  usingCustomDomain: false,
  customDomainId: null,
  domain: "mkt.eic-mail.com",
};

/** Il dominio come lo restituisce get_status; le colonne Resend sono quelle rimaste nelle righe vecchie. */
const dominio = (campagne: boolean): Record<string, unknown> => ({
  id: "dominio-1",
  domain: "rossi.it",
  from_email: "noreply",
  from_name: null,
  ee_domain_added: true,
  ee_spf_verified: campagne,
  ee_dkim_verified: campagne,
  ee_tracking_verified: false,
  resend_domain_id: null,
  resend_status: "not_started",
  is_verified: false,
  is_active: campagne,
  verified_at: campagne ? "2026-09-21T10:00:00Z" : null,
  dns_records: [],
});

function mostra(stato: unknown) {
  invoke.mockResolvedValue({ data: { success: true, ...(stato as object) }, error: null });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/azienda/impostazioni/dominio-email"]}>
        <SettingsEmailDomain />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  invoke.mockReset();
  Object.values(toast).forEach((f) => f.mockReset());
});

describe("la pagina parla solo delle campagne", () => {
  it("campagne dal dominio: mittente e riquadro verde, niente «Messaggi di servizio»", async () => {
    const { container } = mostra({ domains: [dominio(true)], mittenti: { marketing: DAL_DOMINIO } });
    await waitFor(() => expect(container.textContent).toContain("Dominio attivo: le campagne escono da"));
    const testo = container.textContent ?? "";

    expect(testo).toMatch(/Mittente:\s+Rossi Costruzioni <no-reply@rossi\.it>/);
    expect(testo).toContain("Campagne e newsletter");
    expect(testo).not.toContain("Messaggi di servizio");
    expect(testo).not.toMatch(/servizio|Resend|transazional/i);
    // Il caso del 21/09: niente "noreply@".
    expect(testo).not.toContain("noreply@rossi.it");
  });

  it("dominio verificato ma non scelto per le campagne: niente riquadro verde, e dice dove sceglierlo", async () => {
    const { container } = mostra({ domains: [dominio(true)], mittenti: { marketing: MARKETING_PIATTAFORMA } });
    await waitFor(() => expect(container.textContent).toContain("Il dominio è pronto: per usarlo sceglilo in Mittente e aspetto."));
    expect(container.textContent).not.toContain("Dominio attivo:");
  });

  it("campagne non ancora verificate: dice quando passa al dominio", async () => {
    const { container } = mostra({ domains: [dominio(false)], mittenti: { marketing: MARKETING_PIATTAFORMA } });
    await waitFor(() => expect(container.textContent).toContain("Passa al tuo dominio quando questo canale risulta verificato."));
    expect(container.textContent).toContain("Possono servire da pochi minuti a 48 ore");
  });

  it("una funzione vecchia che manda ancora il transazionale: la pagina lo ignora", async () => {
    const { container } = mostra({
      domains: [{ ...dominio(true), resend_domain_id: "re_1", resend_status: "pending" }],
      mittenti: { marketing: DAL_DOMINIO, transactional: TRANSAZIONALE_PIATTAFORMA },
    });
    await waitFor(() => expect(container.textContent).toContain("Dominio attivo: le campagne escono da"));
    const testo = container.textContent ?? "";
    expect(testo).not.toContain("Messaggi di servizio");
    expect(testo).not.toContain("notifiche.ediliziaincloud.it");
    // Attivo vuol dire campagne verificate: is_verified (che chiede anche Resend) non conta più.
    expect(testo).toContain("Attivo");
    expect(testo).not.toContain("righe verificate");
  });

  it("senza dominio: il mittente vero delle campagne, nessun cenno ai messaggi di servizio", async () => {
    const { container } = mostra({ domains: [], mittenti: { marketing: MARKETING_PIATTAFORMA } });
    await waitFor(() => expect(container.textContent).toContain("Le email funzionano già"));
    const testo = container.textContent ?? "";

    expect(testo).toContain("Le campagne partono come");
    expect(testo).toContain("Rossi Costruzioni via EdiliziaInCloud <no-reply@mkt.eic-mail.com>");
    expect(testo).not.toContain("notifiche.ediliziaincloud.it");
    expect(testo).not.toMatch(/messaggi di servizio/i);
    expect(testo).toContain("Verificato il dominio, le campagne partiranno da");
    expect(testo).toContain("no-reply@tuaazienda.it");
    expect(testo).not.toContain("Parte locale email");
    expect(container.querySelector('a[href="/azienda/impostazioni/preferenze-email"]')).not.toBeNull();
  });

  it("funzione non ancora aggiornata (senza mittenti): la pagina non inventa niente e non si rompe", async () => {
    const { container } = mostra({ domains: [dominio(false)] });
    await waitFor(() => expect(container.textContent).toContain("Campagne e newsletter"));
    const testo = container.textContent ?? "";
    expect(testo).not.toContain("Mittente:");
    expect(testo).not.toContain("Da: ");
    expect(testo).not.toContain("Dominio attivo:");
  });
});

describe("email di prova e verifica", () => {
  it("la prova non chiede il tipo di email: è sempre una campagna", async () => {
    mostra({ domains: [], mittenti: { marketing: MARKETING_PIATTAFORMA } });
    fireEvent.click(await screen.findByRole("button", { name: /Invia una prova/ }));
    await screen.findByText("Invia email di prova");
    expect(screen.queryByText("Tipo di email")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(document.body.textContent).not.toMatch(/messaggi di servizio/i);

    fireEvent.click(screen.getByRole("button", { name: "Invia prova" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("send-test-email", expect.anything()));
    const corpo = invoke.mock.calls.find((c) => c[0] === "send-test-email")?.[1]?.body;
    expect(corpo.stream).toBe("marketing");
    expect(corpo.to).toBe("titolare@rossi.it");
  });

  it("un avviso sulla chiave Resend da una funzione vecchia non arriva all'azienda", async () => {
    mostra({ domains: [dominio(false)], mittenti: { marketing: MARKETING_PIATTAFORMA } });
    await screen.findByRole("button", { name: "Verifica DNS" });
    invoke.mockResolvedValue({
      data: {
        success: true,
        domain_row: dominio(false),
        dns_records: [],
        provider_errors: { elastic_email: null, resend: "Resend addDomain 401: This API key is restricted to only send emails" },
        avviso_piattaforma: "Email transazionali: chiave Resend rifiutata",
      },
      error: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "Verifica DNS" }));
    await waitFor(() => expect(toast.message).toHaveBeenCalled());
    const detti = [...toast.message.mock.calls, ...toast.error.mock.calls, ...toast.success.mock.calls].map((c) => String(c[0]));
    expect(detti.join(" ")).not.toMatch(/Resend|transazional/i);
  });
});
