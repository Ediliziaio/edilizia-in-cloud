import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Telefonia solo all'amministratore; WhatsApp Bot, email e scontistica
 * seguono il permesso (21/09/2026, seguito dell'audit dello stesso giorno).
 *
 * Cinque pagine non controllavano nessun permesso lato interfaccia. Guardando
 * il database non erano tutte uguali:
 *  - Numeri di telefono: comprare/rilasciare un numero costa un canone
 *    mensile vero, e NESSUNA riga — né RLS né le funzioni edge — controllava
 *    il ruolo. Florin: «solo chi è amministratore può farlo» → si RESTRINGE.
 *  - WhatsApp Bot, email, scontistica: il database scriveva solo con
 *    l'amministratore (o, per la scontistica, era all'opposto: apertissima).
 *    Florin: chi ha il permesso di vista, e non è in sola lettura, scrive
 *    anche → si allinea alla stessa regola dei costi.
 */

const radice = resolve(__dirname, "../../..");
const leggi = (percorso: string) => readFileSync(resolve(radice, percorso), "utf8");
const MIGRATION = leggi("supabase/migrations/20280922110000_telefonia_solo_admin_resto_segue_permesso.sql");

describe("telefonia: solo l'amministratore, in ogni strato", () => {
  it("le policy di virtual_phone_numbers e sms_telnyx_numbers controllano has_role(...,'company_admin')", () => {
    for (const tabella of ["virtual_phone_numbers", "sms_telnyx_numbers", "ai_phone_numbers_v2"]) {
      const blocchi = [...MIGRATION.matchAll(
        new RegExp(`create policy "[^"]+" on public\\.${tabella}[\\s\\S]*?(?=create policy|drop policy|$)`, "g"),
      )].filter((m) => /for (insert|update|delete|all)/.test(m[0]));
      expect(blocchi.length, tabella).toBeGreaterThan(0);
      for (const b of blocchi) {
        // La select di ai_phone_numbers_v2 resta aperta: qui si controllano
        // solo i blocchi di scrittura (non "for select").
        if (/for select/.test(b[0])) continue;
        expect(b[0], `${tabella}: ${b[0].slice(0, 60)}`).toMatch(/has_role\(.*'company_admin'/);
      }
    }
  });

  it("le due funzioni edge (comprare/rilasciare un numero) controllano il ruolo, non solo l'appartenenza all'azienda", () => {
    const proxy = leggi("supabase/functions/telnyx-proxy/index.ts");
    expect(proxy).toContain("async function isCompanyAdmin(");
    // Entrambe le azioni chiamano isCompanyAdmin prima di parlare con Telnyx.
    const buyBlocco = proxy.slice(proxy.indexOf('case "buy_number"'), proxy.indexOf('case "list_numbers"'));
    expect(buyBlocco).toContain("isCompanyAdmin(adminClient, userId)");
    const releaseBlocco = proxy.slice(proxy.indexOf('case "release_number"'), proxy.indexOf('case "send_sms"'));
    expect(releaseBlocco).toContain("isCompanyAdmin(adminClient, userId)");

    const acquistaSms = leggi("supabase/functions/telnyx-acquista-numero/index.ts");
    expect(acquistaSms).toMatch(/requireCompanyAccess\([^)]*\{\s*\n?\s*allowedRoles:\s*\["company_admin"\]/);
  });

  it("la pagina Numeri di telefono nasconde acquisto, rilascio e import a chi non è amministratore", () => {
    const pagina = leggi("src/pages/azienda/settings/SettingsPhoneNumbers.tsx");
    expect(pagina).toContain("const { isAdmin } = usePermissions();");
    // I tre pulsanti che scrivono sono tutti dietro isAdmin: apri il dialogo
    // di acquisto, il rilascio nella tabella numeri, l'import da Telnyx.
    expect(pagina).toMatch(/\{isAdmin && \(\s*\n\s*<Dialog open=\{purchaseOpen\}/);
    const rilascio = pagina.slice(0, pagina.indexOf("AlertDialogTitle>Rilascia Numero"));
    expect(rilascio.slice(rilascio.lastIndexOf("isAdmin && ("))).not.toBe("");
    expect(rilascio.lastIndexOf("isAdmin && (")).toBeGreaterThan(rilascio.lastIndexOf("</TableRow>"));
    const importa = pagina.slice(pagina.indexOf("importTelnyx.mutate()") - 100, pagina.indexOf("importTelnyx.mutate()"));
    expect(importa).toMatch(/isAdmin && \(/);
  });
});

describe("WhatsApp Bot, email, scontistica: la modifica segue il permesso", () => {
  it("messaging_whatsapp_config, company_email_domains, company_email_preferences, discount_rules usano aziende_con_permesso + non sola lettura", () => {
    for (const { tabella, permesso } of [
      { tabella: "messaging_whatsapp_config", permesso: "can_view_settings_integrations" },
      { tabella: "company_email_domains", permesso: "can_view_marketing_email" },
      { tabella: "company_email_preferences", permesso: "can_view_marketing_email" },
      { tabella: "discount_rules", permesso: "can_view_settings_scontistica" },
    ]) {
      for (const azione of ["for insert", "for update", "for delete"]) {
        const idx = MIGRATION.indexOf(`on public.${tabella}\n  ${azione}`);
        expect(idx, `${tabella} ${azione}`).toBeGreaterThan(-1);
        const blocco = MIGRATION.slice(idx, idx + 300);
        expect(blocco, `${tabella} ${azione}`).toMatch(
          new RegExp(`aziende_con_permesso\\('${permesso}'\\)[\\s\\S]{0,60}utente_sola_lettura`),
        );
      }
    }
  });

  it("scontistica scrive su discount_rules, non su salespeople (che nella pagina è solo l'elenco nomi)", () => {
    const pagina = leggi("src/pages/azienda/settings/SettingsScontistica.tsx");
    expect(pagina).toContain('from("salespeople")');
    expect(pagina).toContain("useDiscountRules");
    // La query su salespeople è una sola: la lookup del menu a tendina, non una scrittura.
    const scritture = [...pagina.matchAll(/from\("salespeople"\)\s*\n?\s*\.(insert|update|delete|upsert)\(/g)];
    expect(scritture).toEqual([]);
  });

  it("l'audit non aveva trovato la tabella giusta al primo giro: discount_rules era apertissima, non l'ha lasciata così", () => {
    expect(MIGRATION).toContain('drop policy if exists "discount_rules_company_access"');
  });

  it("manage-email-domain (dominio email) accetta anche chi ha il permesso, non solo l'amministratore", () => {
    const fn = leggi("supabase/functions/manage-email-domain/index.ts");
    expect(fn).toContain('_permission: "can_view_marketing_email"');
    expect(fn).toContain("sola_lettura");
  });
});
