/**
 * Modelli, impostazioni e firma dei preventivi: li cambia chi ha il permesso
 * (26/09/2026).
 *
 * Provato in una transazione annullata: prima uno staff qualsiasi cambiava i
 * 6 modelli dei preventivi della sua azienda, le impostazioni (margini, PDF,
 * numerazione), scriveva il testo del recesso B2C e aggiungeva versioni ai
 * preventivi; dopo 0, 0, 42501 e 42501, e legge come prima. Chi ha il listino
 * e chi ha i Preventivi come prima.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const codice = leggi("supabase/migrations/20280926090000_modelli_e_impostazioni_col_permesso.sql").replace(/--.*$/gm, "");

const policy = (tabella: string, nome: string) => {
  const m = codice.match(new RegExp(`create policy ${nome} on public\\.${tabella}\\s+for (\\w+) to authenticated([\\s\\S]*?\\);)\\n`));
  expect(m, `${tabella} / ${nome}`).not.toBeNull();
  return { comando: m![1], testo: m![2] };
};

describe("migrazione modelli_e_impostazioni_col_permesso", () => {
  it("non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
  });

  it("i modelli li scrive chi modifica il listino (USING e WITH CHECK)", () => {
    expect(codice).toContain("drop policy if exists company_admin_manage_templates on public.quote_templates;");
    const p = policy("quote_templates", "quote_templates_scrittura");
    expect(p.comando).toBe("all");
    expect(p.testo.match(/aziende_con_permesso\('can_edit_settings_pricing'\)/g) ?? []).toHaveLength(2);
  });

  it("le impostazioni le legge ogni interno, le scrive chi ha listino o integrazioni", () => {
    expect(codice).toContain("drop policy if exists pi_company on public.preventivo_impostazioni;");
    expect(policy("preventivo_impostazioni", "pi_lettura").comando).toBe("select");
    const p = policy("preventivo_impostazioni", "pi_scrittura");
    expect(p.testo.match(/'can_edit_settings_pricing', 'can_edit_settings_integrations'/g) ?? []).toHaveLength(2);
  });

  it("la configurazione della firma la scrive chi ha le integrazioni", () => {
    expect(codice).toContain("drop policy if exists fea_config_company on public.fea_configurazione;");
    expect(policy("fea_configurazione", "fea_config_lettura").comando).toBe("select");
    const p = policy("fea_configurazione", "fea_config_scrittura");
    expect(p.testo.match(/aziende_con_permesso\('can_edit_settings_integrations'\)/g) ?? []).toHaveLength(2);
  });

  it("le versioni seguono il preventivo: si aggiungono solo se lo si può modificare", () => {
    const p = policy("quote_versions", "quote_versions_inserimento");
    expect(p.comando).toBe("insert");
    expect(p.testo).toContain("q.company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi')))");
    expect(p.testo).toContain("public.check_staff_visibility((select auth.uid()), q.assigned_to)");
    expect(policy("quote_versions", "quote_versions_lettura").testo).toContain("exists (select 1 from public.quotes q where q.id = quote_versions.quote_id)");
  });

  it("materiali PDF e allegati render si leggono e basta", () => {
    for (const nome of ["qpm_ins", "qpm_upd", "qpm_del"]) {
      expect(codice).toContain(`drop policy if exists ${nome} on public.quote_pdf_materials;`);
    }
    expect(policy("quote_render_attachments", "quote_render_attachments_lettura").comando).toBe("select");
  });
});

describe("il resto dell'app dice la stessa cosa", () => {
  it("salva-versione-preventivo chiede il permesso dei Preventivi", () => {
    const f = leggi("supabase/functions/salva-versione-preventivo/index.ts");
    expect(f).toContain('verificaPermessoAzienda(supabaseAdmin, userId, quote.company_id, ["can_edit_preventivi"], "modificare i preventivi")');
  });

  it("Margini in sola lettura per chi non modifica il listino", () => {
    const p = leggi("src/pages/azienda/settings/SettingsMargini.tsx");
    expect(p).toContain('<fieldset disabled={!puoModificareListino} className="m-0 min-w-0 space-y-6 border-0 p-0">');
    expect(p).toMatch(/const triggerAutoSave = useCallback\(\(\) => \{\s*if \(!puoModificareListino\) return;/);
    expect(p).toMatch(/const handleManualSave = \(\) => \{\s*if \(!puoModificareListino\) return;/);
  });

  it("Firma elettronica si salva solo con le integrazioni in modifica", () => {
    const p = leggi("src/pages/azienda/settings/SettingsFirmaElettronica.tsx");
    expect(p).toContain("const puoModificare = usePermissions().canEditSettingsIntegrations;");
    expect(p).toMatch(/\{puoModificare \? \(\s*<div className="sticky bottom-4 z-10 flex justify-end">/);
  });

  it("togliere un modello non finge di esserci riuscito", () => {
    const h = leggi("src/hooks/useQuoteTemplates.ts");
    expect(h).toContain("if (!data || data.length === 0) throw new Error('I modelli li cambia chi può modificare il listino');");
  });
});
