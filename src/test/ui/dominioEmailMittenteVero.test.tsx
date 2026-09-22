import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * «Dominio email» dice il mittente vero di ogni canale (21/09/2026).
 *
 * Con il dominio verificato la pagina diceva «Tutte le prossime email
 * (marketing e transazionali) usciranno da noreply@dominio»: il transazionale
 * usciva invece dalla piattaforma, e "noreply" era un valore che nessuno
 * scrive. Ora il mittente lo calcola il server (resolveSender, in get_status)
 * e la pagina lo mostra canale per canale.
 */

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
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

/** Il dominio come lo restituisce get_status: marketing verificato e attivo, Resend in verifica. */
const dominio = (resendStatus: "pending" | "verified"): Record<string, unknown> => ({
  id: "dominio-1",
  domain: "rossi.it",
  from_email: "noreply",
  from_name: null,
  ee_domain_added: true,
  ee_spf_verified: true,
  ee_dkim_verified: true,
  ee_tracking_verified: false,
  sg_domain_id: null,
  sg_cname_1_host: null, sg_cname_1_value: null, sg_cname_1_valid: false,
  sg_cname_2_host: null, sg_cname_2_value: null, sg_cname_2_valid: false,
  sg_cname_3_host: null, sg_cname_3_value: null, sg_cname_3_valid: false,
  resend_domain_id: "re_1",
  resend_status: resendStatus,
  resend_region: "eu-west-1",
  is_verified: resendStatus === "verified",
  is_active: true,
  verified_at: "2026-09-21T10:00:00Z",
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
});

describe("il mittente vero, canale per canale", () => {
  it("marketing dal dominio, transazionale ancora dalla piattaforma: la pagina lo dice", async () => {
    const { container } = mostra({
      domains: [dominio("pending")],
      mittenti: { marketing: DAL_DOMINIO, transactional: TRANSAZIONALE_PIATTAFORMA },
    });
    await waitFor(() => expect(container.textContent).toContain("Email Transazionali"));
    const testo = container.textContent ?? "";

    expect(testo).toContain("Mittente: Rossi Costruzioni <no-reply@rossi.it>");
    expect(testo).toContain("Da: Rossi Costruzioni via EdiliziaInCloud <no-reply@notifiche.ediliziaincloud.it>");
    expect(testo).toContain("Passa al tuo dominio quando questo canale risulta verificato.");
    // Il caso del 21/09: nessuna promessa su tutti e due i canali, niente "noreply@".
    expect(testo).not.toContain("marketing e le transazionali escono");
    expect(testo).not.toContain("noreply@rossi.it");
  });

  it("tutti e due dal dominio: il riquadro verde lo dice", async () => {
    const { container } = mostra({
      domains: [dominio("verified")],
      mittenti: { marketing: DAL_DOMINIO, transactional: DAL_DOMINIO },
    });
    await waitFor(() => expect(container.textContent).toContain("Dominio attivo: le email di marketing e le transazionali escono da"));
    expect(container.textContent).toContain("no-reply@rossi.it");
  });

  it("dominio verificato ma non scelto per il transazionale: niente riquadro verde, e dice dove sceglierlo", async () => {
    const { container } = mostra({
      domains: [dominio("verified")],
      mittenti: { marketing: DAL_DOMINIO, transactional: TRANSAZIONALE_PIATTAFORMA },
    });
    await waitFor(() => expect(container.textContent).toContain("Il dominio è pronto: per usarlo sceglilo in Preferenze email."));
    expect(container.textContent).not.toContain("Dominio attivo: le email di marketing e le transazionali");
  });

  it("senza dominio: i mittenti veri e nessun campo che non salva niente", async () => {
    const { container } = mostra({
      domains: [],
      mittenti: { marketing: MARKETING_PIATTAFORMA, transactional: TRANSAZIONALE_PIATTAFORMA },
    });
    await waitFor(() => expect(container.textContent).toContain("Le email funzionano già"));
    const testo = container.textContent ?? "";

    expect(testo).toContain("Rossi Costruzioni via EdiliziaInCloud <no-reply@notifiche.ediliziaincloud.it>");
    expect(testo).toContain("Rossi Costruzioni via EdiliziaInCloud <no-reply@mkt.eic-mail.com>");
    expect(testo).toContain("Verificato il dominio, le email partiranno da");
    expect(testo).toContain("no-reply@tuaazienda.it");
    expect(testo).not.toContain("Parte locale email");
    expect(container.querySelector('a[href="/azienda/impostazioni/preferenze-email"]')).not.toBeNull();
  });

  it("funzione non ancora aggiornata (senza mittenti): la pagina non inventa niente e non si rompe", async () => {
    const { container } = mostra({ domains: [dominio("pending")] });
    await waitFor(() => expect(container.textContent).toContain("Email Transazionali"));
    const testo = container.textContent ?? "";
    expect(testo).not.toContain("Mittente:");
    expect(testo).not.toContain("Da: ");
    expect(testo).not.toContain("Dominio attivo:");
  });
});
