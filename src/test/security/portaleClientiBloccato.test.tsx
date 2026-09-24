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
import { clienteSenzaAccesso } from "../../../supabase/functions/_shared/clienteSenzaAccesso";

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

  it("anche il link con token vale solo col portale acceso e il cliente sbloccato", () => {
    const token = leggi("supabase/migrations/20280924120000_token_portale_solo_con_portale_attivo.sql");
    expect(token).toContain("AND coalesce(c.customer_portal_enabled, false)");
    expect(token).toContain("AND NOT coalesce(p.is_blocked, false)");
  });
});

describe("a un cliente senza accesso non parte nessuna email di accesso", () => {
  /** Database finto: un profilo e i suoi ruoli. */
  const db = (profilo: { is_blocked: boolean } | null, ruoli: string[], errore = false) => ({
    from: (tabella: string) => ({
      select: () => ({
        eq: () =>
          tabella === "profiles"
            ? { maybeSingle: async () => ({ data: profilo, error: errore ? { message: "giù" } : null }) }
            : Promise.resolve({ data: ruoli.map((role) => ({ role })), error: null }),
      }),
    }),
  });

  it("riconosce il cliente bloccato, e solo lui", async () => {
    expect(await clienteSenzaAccesso(db({ is_blocked: true }, ["customer"]), "u1")).toBe(true);
    expect(await clienteSenzaAccesso(db({ is_blocked: false }, ["customer"]), "u1")).toBe(false);
    // Un dipendente che è anche cliente non si tocca, anche se bloccato.
    expect(await clienteSenzaAccesso(db({ is_blocked: true }, ["customer", "company_staff"]), "u1")).toBe(false);
    expect(await clienteSenzaAccesso(db({ is_blocked: true }, ["company_admin"]), "u1")).toBe(false);
  });

  it("se non sa rispondere dice «no»: l'accesso lo chiude comunque il database", async () => {
    expect(await clienteSenzaAccesso(db(null, ["customer"]), "u1")).toBe(false);
    expect(await clienteSenzaAccesso(db({ is_blocked: true }, ["customer"], true), "u1")).toBe(false);
    expect(await clienteSenzaAccesso(db({ is_blocked: true }, ["customer"]), undefined)).toBe(false);
  });

  it("reset dell'amministratore, «Password dimenticata» e email di Supabase lo usano", () => {
    const reset = leggi("supabase/functions/reset-customer-password/index.ts");
    expect(reset).toContain("if (await clienteSenzaAccesso(supabaseAdmin, targetUserId)) {");
    // Il controllo viene prima della password nuova, non dopo.
    expect(reset.indexOf("clienteSenzaAccesso(supabaseAdmin")).toBeLessThan(reset.indexOf("updateUserById("));

    const dimenticata = leggi("supabase/functions/reset-password-branded/index.ts");
    expect(dimenticata).toContain("if (await clienteSenzaAccesso(supabaseAdmin, linkData.user?.id)) {");
    expect(dimenticata.indexOf("clienteSenzaAccesso(supabaseAdmin")).toBeLessThan(dimenticata.indexOf("sendEmailUnified({"));

    const hook = leggi("supabase/functions/auth-email-hook/index.ts");
    expect(hook).toContain('(azione === "recovery" || azione === "magiclink" || azione === "invite")');
    expect(hook.indexOf("clienteSenzaAccesso(admin, user.id)")).toBeLessThan(hook.indexOf("sendEmailUnified({"));
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
