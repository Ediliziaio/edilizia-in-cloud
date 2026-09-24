/**
 * Portale clienti: lo accende solo EdiliziaInCloud, e spento vuol dire che nessun
 * cliente ha un accesso (24/09/2026, richiesta di Florin).
 *
 * Prima l'azienda poteva accenderselo da sola dalle Impostazioni, e «Converti in
 * cliente» creava un account attivo mandando al cliente un'email con la password
 * in chiaro anche col portale spento. Le regole vere stanno nel database
 * (migrazione 20280924110000, provata con utenti simulati); qui si controlla che
 * pagina e funzione server dicano e facciano lo stesso.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const leggi = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

const auth = vi.hoisted(() => ({ userRoles: [] as string[] }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    effectiveCompany: { id: "azienda-1", customer_portal_enabled: false },
    refreshAuth: async () => {},
    userRoles: auth.userRoles,
  }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => async () => true }));

import { CustomerPortalToggle } from "@/components/settings/CustomerPortalToggle";

afterEach(cleanup);

describe("l'interruttore del portale clienti", () => {
  it("l'azienda lo vede ma non può cambiarlo", () => {
    auth.userRoles = ["company_admin"];
    render(<CustomerPortalToggle />);
    expect(screen.getByRole("switch", { name: "Area privata clienti" })).toBeDisabled();
    expect(screen.getByText(/La attiva EdiliziaInCloud su richiesta/)).toBeInTheDocument();
  });

  it("il super admin può accenderlo", () => {
    auth.userRoles = ["super_admin"];
    render(<CustomerPortalToggle />);
    expect(screen.getByRole("switch", { name: "Area privata clienti" })).not.toBeDisabled();
    expect(screen.queryByText(/La attiva EdiliziaInCloud su richiesta/)).toBeNull();
  });
});

describe("«Converti in cliente» rispetta il portale", () => {
  const funzione = leggi("supabase/functions/convert-contact-to-customer/index.ts");

  it("legge l'interruttore dell'azienda e, se è spento, crea solo l'anagrafica bloccata", () => {
    expect(funzione).toContain("customer_portal_enabled");
    expect(funzione).toContain("portal_disabled: !portaleAttivo");
    expect(funzione).toContain("is_blocked: !portaleAttivo");
  });

  it("nessuna email senza portale, e mai la password dentro l'email", () => {
    expect(funzione).toContain("if (portaleAttivo) {");
    expect(funzione).not.toContain("emailCredenziali(");
    expect(funzione).toContain("password: portaleAttivo ? password : null");
  });

  it("chi converte deve lavorare in quell'azienda", () => {
    expect(funzione).toContain("await requireCompanyAccess(supabaseAdmin, userId, String(company_id), corsH)");
  });

  it("la finestra non mostra una password quando il cliente non ha accesso", () => {
    const finestra = leggi("src/components/marketing/ConvertToCustomerDialog.tsx");
    expect(finestra).toContain("Il portale clienti non è attivo");
    expect(finestra).toContain("setGeneratedPassword(data.password ?? \"\")");
  });
});

describe("le regole nel database", () => {
  const migrazione = leggi("supabase/migrations/20280924110000_portale_clienti_solo_super_admin.sql");

  it("solo il super admin cambia l'interruttore", () => {
    expect(migrazione).toContain("create trigger trg_portale_clienti_decide_solo_super_admin");
    expect(migrazione).toContain("before insert or update of customer_portal_enabled on public.companies");
  });

  it("un cliente senza portale resta bloccato, da qualunque strada arrivi", () => {
    expect(migrazione).toContain("create trigger trg_profilo_cliente_resta_bloccato");
    expect(migrazione).toContain("create trigger trg_ruolo_cliente_blocca_senza_portale");
    expect(migrazione).toContain("create trigger trg_portale_spento_blocca_clienti");
  });
});

describe("un cliente bloccato non entra", () => {
  it("il login dei clienti guarda il blocco e fa uscire subito", () => {
    const login = leggi("src/pages/ClientiLogin.tsx");
    expect(login).toMatch(/from\("profiles"\)\s*\.select\("is_blocked"\)/);
    expect(login).toContain("Il portale clienti non è attivo. Per informazioni contatta l'azienda.");
  });

  it("l'area clienti mostra il muro anche a chi ha già una sessione aperta", () => {
    const area = leggi("src/components/layouts/CustomerLayout.tsx");
    expect(area).toContain("!previewSession.isPreview && (profile as { is_blocked?: boolean | null } | null)?.is_blocked");
    expect(area).toContain("Portale clienti non attivo");
  });
});
