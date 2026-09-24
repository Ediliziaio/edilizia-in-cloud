/**
 * whatsapp-send: un utente invia solo per un'azienda a cui ha accesso
 * (24/09/2026).
 *
 * Prima bastava essere collegati: company_id arrivava dal corpo della
 * richiesta così com'era, e con quello si sceglievano numero, token e credito
 * di qualunque azienda. Le funzioni interne (segreto del cron, service role)
 * restano come prima: sono loro a scegliere l'azienda.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const invio = readFileSync(join(process.cwd(), "supabase/functions/whatsapp-send/index.ts"), "utf8");
const inizioControllo = invio.indexOf("if (clienteUtente) {");

describe("whatsapp-send: l'azienda deve essere dell'utente", () => {
  it("il controllo c'è, ed è fatto con l'accesso dell'utente, non col service role", () => {
    expect(inizioControllo).toBeGreaterThan(-1);
    const controllo = invio.slice(inizioControllo, invio.indexOf("const adminClient"));
    expect(controllo).toContain('clienteUtente.rpc("user_can_access_company", { p_company_id: companyId })');
    expect(controllo).toContain('clienteUtente.rpc("utente_bloccato")');
    expect(controllo).toContain("accesso.data !== true");
    expect(controllo).toContain("blocco.data === true");
    expect(controllo).toContain("status: 403");
  });

  it("vale solo per chi arriva col proprio accesso, non per le funzioni interne", () => {
    expect(invio).toContain("let clienteUtente: ReturnType<typeof createClient> | null = null;");
    expect(invio).toContain("if (isAuthenticated) clienteUtente = supabaseUser;");
    // Il segreto del cron e il service role non passano di lì.
    const primaDelloUtente = invio.slice(0, invio.indexOf("if (!isAuthenticated && authHeader.startsWith"));
    expect(primaDelloUtente).not.toContain("clienteUtente =");
  });

  it("viene prima di tutto ciò che usa l'azienda: carta, add-on, numero, credito, invio", () => {
    for (const passo of [
      "checkPaymentMethod(adminClient, companyId)",
      "addonWhatsAppAttivo(adminClient, companyId",
      '.from("ai_whatsapp_numbers")',
      "addebitaMessaggioWhatsApp(",
      "https://graph.facebook.com/v21.0/${phoneNumberId}/messages",
    ]) {
      expect(invio.indexOf(passo), passo).toBeGreaterThan(inizioControllo);
    }
  });

  it("il numero scelto resta legato all'azienda controllata", () => {
    expect(invio).toMatch(/\.eq\("id", body\.wa_number_id\)\s*\.eq\("company_id", companyId\)/);
  });
});
