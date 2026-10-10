/**
 * Dominio email: pulsanti attivi solo per chi può davvero usarli (09/10/2026).
 *
 * Registrare, controllare e togliere un dominio lo può fare chi amministra l'azienda o chi ha «Email Marketing» e non è in
 * «sola lettura» (policy «Permesso email: dominio …» e funzione `manage-email-domain`). Per gli altri «Continua», «Verifica DNS»,
 * il cestino e «Aggiungi un altro dominio» sono spenti, con la riga che dice cosa serve. Mandare un'email di prova a sé non cambia
 * niente: resta per tutti.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, permessi, toast } = vi.hoisted(() => ({
  invoke: vi.fn(),
  permessi: { isAdmin: true, canViewMarketingEmail: true, solaLettura: false, isLoading: false },
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn(), info: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => permessi }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    effectiveCompany: { id: "azienda-1" },
    user: { id: "utente-1", email: "titolare@rossi.it" },
  }),
}));

import SettingsEmailDomain from "@/pages/azienda/settings/SettingsEmailDomain";

const dominio = (): Record<string, unknown> => ({
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
  resend_status: "pending",
  resend_region: "eu-west-1",
  is_verified: false,
  is_active: true,
  verified_at: null,
  dns_records: [
    { type: "TXT", host: "rossi.it", value: "v=spf1 include:spf.example.net ~all", provider: "elastic_email", purpose: "SPF marketing", verified: true },
    { type: "CNAME", host: "api._domainkey.rossi.it", value: "api.dkim.example.net", provider: "elastic_email", purpose: "DKIM marketing", verified: false },
  ],
});

function mostra(domini: unknown[]) {
  invoke.mockImplementation(async (nome: string, args: { body: { action: string } }) => {
    if (nome === "manage-email-domain" && args.body.action === "get_status") {
      return { data: { success: true, domains: domini, mittenti: {} }, error: null as unknown };
    }
    return { data: { success: true }, error: null as unknown };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/azienda/impostazioni/dominio-email"]}>
        <SettingsEmailDomain />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const SOLO_LETTURA = /Stai solo consultando: per registrare o cambiare il dominio serve il permesso «Email Marketing»/;

beforeEach(() => {
  Object.assign(permessi, { isAdmin: true, canViewMarketingEmail: true, solaLettura: false, isLoading: false });
  Object.values(toast).forEach((f) => f.mockReset());
});

afterEach(() => {
  cleanup();
  invoke.mockReset();
});

describe("senza nessun dominio", () => {
  it("chi amministra può registrarlo", async () => {
    mostra([]);
    const campo = await screen.findByLabelText("Il tuo dominio");
    expect((campo as HTMLInputElement).disabled).toBe(false);
    fireEvent.change(campo, { target: { value: "rossi.it" } });
    expect((screen.getByRole("button", { name: "Continua" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(SOLO_LETTURA)).toBeNull();
  });

  it("chi può solo consultare non lo registra: campo e pulsante spenti, e dice cosa serve", async () => {
    Object.assign(permessi, { isAdmin: false, solaLettura: true });
    mostra([]);
    const campo = (await screen.findByLabelText("Il tuo dominio")) as HTMLInputElement;
    expect(campo.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Continua" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(SOLO_LETTURA)).toBeTruthy();
    // La prova a sé non cambia niente: resta attiva.
    expect((screen.getByRole("button", { name: /Invia una prova/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("chi ha «Email Marketing» e non è in sola lettura può registrarlo anche senza essere amministratore", async () => {
    Object.assign(permessi, { isAdmin: false, canViewMarketingEmail: true, solaLettura: false });
    mostra([]);
    expect(((await screen.findByLabelText("Il tuo dominio")) as HTMLInputElement).disabled).toBe(false);
  });

  it("mentre i permessi si caricano non li dà per buoni", async () => {
    Object.assign(permessi, { isAdmin: true, isLoading: true });
    mostra([]);
    expect(((await screen.findByLabelText("Il tuo dominio")) as HTMLInputElement).disabled).toBe(true);
  });
});

describe("con un dominio registrato", () => {
  it("chi può solo consultare non verifica, non toglie e non aggiunge altri domini", async () => {
    Object.assign(permessi, { isAdmin: false, solaLettura: true });
    mostra([dominio()]);
    expect(await screen.findByText(SOLO_LETTURA)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Verifica DNS" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Rimuovi il dominio rossi.it" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Aggiungi un altro dominio/ }) as HTMLButtonElement).disabled).toBe(true);
    // Guardare e provare restano possibili.
    expect((screen.getByRole("button", { name: "Aggiorna" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: /Invia una prova/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("chi amministra ha tutti i pulsanti attivi", async () => {
    mostra([dominio()]);
    await screen.findByRole("button", { name: "Verifica DNS" });
    expect((screen.getByRole("button", { name: "Verifica DNS" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Rimuovi il dominio rossi.it" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: /Aggiungi un altro dominio/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(SOLO_LETTURA)).toBeNull();
  });

  it("se la rimozione fallisce mostra il motivo vero, non «non-2xx status code»", async () => {
    mostra([dominio()]);
    fireEvent.click(await screen.findByRole("button", { name: "Rimuovi il dominio rossi.it" }));
    invoke.mockImplementation(async (_nome: string, args: { body: { action: string } }) =>
      args.body.action === "remove_domain"
        ? {
            data: null as unknown,
            error: {
              message: "Edge Function returned a non-2xx status code",
              context: { json: async () => ({ error: "Non autorizzato" }) },
            },
          }
        : { data: { success: true, domains: [dominio()], mittenti: {} }, error: null as unknown },
    );
    fireEvent.click(await screen.findByRole("button", { name: "Rimuovi" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Non autorizzato"));
  });

  it("le righe DNS si copiano con un pulsante che ha un nome", async () => {
    mostra([dominio()]);
    await screen.findByRole("button", { name: "Verifica DNS" });
    expect(screen.getByRole("button", { name: "Copia il nome: Autorizzazione a spedire" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copia il valore: Firma di sicurezza delle email" })).toBeTruthy();
  });
});

describe("parole di tutti i giorni", () => {
  it("senza dominio: niente emoji, «Continua», «transazionali» e «deliverability» non compaiono", async () => {
    mostra([]);
    await screen.findByText("Le email funzionano già.");
    const testo = document.body.textContent ?? "";
    expect(testo).not.toContain("✅");
    expect(testo).not.toMatch(/transazional|deliverability|branding/i);
    expect(screen.getByText("Usa il tuo dominio (facoltativo)")).toBeTruthy();
  });

  it("dopo la registrazione: le righe da copiare, l'avviso breve e la spiegazione chiusa", async () => {
    mostra([dominio()]);
    await screen.findByRole("button", { name: "Verifica DNS" });
    expect(screen.getByText("Righe da copiare nel pannello del dominio")).toBeTruthy();
    expect(screen.getByText(/Possono servire da pochi minuti a 48 ore\. Quando hai finito, premi «Verifica DNS»\./)).toBeTruthy();
    const spiegazione = screen.getByText("Perché devo premere «Verifica DNS»?").closest("details") as HTMLDetailsElement;
    expect(spiegazione.open).toBe(false);
    expect(screen.getByText("Controlla da solo ogni 30 secondi")).toBeTruthy();
    expect(within(document.body).queryByText(/Auto-refresh/)).toBeNull();
  });
});
