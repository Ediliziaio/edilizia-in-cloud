/**
 * Listino, prodotti, tariffe, articoli, pacchetti e listini dei fornitori: li
 * legge ogni interno, li modifica chi ha il permesso (26/09/2026).
 *
 * Provato in una transazione annullata: un venditore cambiava 50 righe di
 * griglia, categorie, tariffe, prodotti, assi, varianti, documenti, pacchetti,
 * articoli e listini dei fornitori, e importava prodotti con la RPC; dopo, 0
 * righe e 42501, e continua a vedere tutto (13.963 righe di griglia, 119
 * prodotti). Chi ha il listino, l'amministratore e, per i listini dei
 * fornitori, chi gestisce i fornitori: come prima.
 *
 * Tiene ferma anche la regola nell'app: chi vede il listino senza poterlo
 * modificare non trova i pulsanti (una UPDATE che la RLS filtra non dà
 * errore: salverebbe nel vuoto con «aggiornato»).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");
const codice = leggi("supabase/migrations/20280926061500_listino_scrittura_col_permesso.sql").replace(/--.*$/gm, "");

const policy = (tabella: string, nome: string) => {
  const m = codice.match(new RegExp(`create policy ${nome} on public\\.${tabella}\\s+for (\\w+) to authenticated([\\s\\S]*?\\);)\\n`));
  expect(m, `${tabella} / ${nome}`).not.toBeNull();
  return { comando: m![1], testo: m![2] };
};

const LISTINO = "public.aziende_con_permesso('can_edit_settings_pricing')";
const PACCHETTI = "public.aziende_con_uno_dei_permessi(array[\n                'can_edit_settings_bundle', 'can_edit_settings_pricing'])";
const FORNITORI = "public.aziende_con_uno_dei_permessi(array[\n           'can_edit_settings_suppliers', 'can_manage_suppliers', 'can_edit_settings_pricing'])";
const ARTICOLI = "public.aziende_con_uno_dei_permessi(array[\n                'can_edit_settings_pricing', 'can_view_billing', 'can_edit_marketing_opportunities'])";

// tabella, policy vecchia «stessa azienda», policy di lettura ("" se resta quella di prima), policy di scrittura, permesso
const TABELLE: ReadonlyArray<readonly [string, string, string, string, string]> = [
  ["listino_griglia", "lg_company", "lg_lettura", "lg_scrittura", LISTINO],
  ["listino_categorie", "lcat_company", "lcat_lettura", "lcat_scrittura", LISTINO],
  ["tariffe_aziendali", "ta_company", "ta_lettura", "ta_scrittura", LISTINO],
  ["articoli_native", "company_isolation", "articoli_native_lettura", "articoli_native_scrittura", ARTICOLI],
  ["bundle_prodotti", "bp_company", "bp_lettura", "bp_scrittura", PACCHETTI],
  ["listini_fornitore", "lf_company", "lf_lettura", "lf_scrittura", FORNITORI],
  ["listino_fornitore_voci", "lfv_company", "lfv_lettura", "lfv_scrittura", FORNITORI],
  ["article_families", "families_cud", "", "families_scrittura", LISTINO],
  ["article_family_axes", "axes_cud", "", "axes_scrittura", LISTINO],
  ["article_family_axis_values", "axis_values_cud", "", "axis_values_scrittura", LISTINO],
  ["article_family_documents", "afd_cud", "", "afd_scrittura", LISTINO],
  ["listino_schede_linea", "lsl_azienda", "lsl_lettura", "lsl_scrittura", LISTINO],
];

describe("migrazione listino_scrittura_col_permesso", () => {
  it("non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
  });

  it.each(TABELLE)("%s: via la regola «stessa azienda», si scrive col permesso in USING e in WITH CHECK", (tabella, vecchia, _lettura, scrittura, permesso) => {
    expect(codice).toContain(`drop policy if exists ${vecchia} on public.${tabella};`);
    const p = policy(tabella, scrittura);
    expect(p.comando).toBe("all");
    expect(p.testo.split(permesso).length - 1, `${tabella}: il permesso in USING e in WITH CHECK`).toBe(2);
    expect(p.testo.match(/not \(select public\.utente_e_cliente_esterno\(\)\)/g) ?? []).toHaveLength(2);
  });

  it.each(TABELLE.filter((t) => t[2] !== ""))("%s: la lettura resta a ogni interno dell'azienda", (tabella, _vecchia, lettura) => {
    const p = policy(tabella, lettura);
    expect(p.comando).toBe("select");
    expect(p.testo).toMatch(/company_id = \(select public\.get_(my|effective)_company_id\(\)\) and not \(select public\.utente_e_cliente_esterno\(\)\)/);
    expect(p.testo).not.toContain("aziende_con");
  });

  it("voci dei pacchetti: lettura e scrittura seguono il pacchetto", () => {
    expect(codice).toContain("drop policy if exists bv_bundle on public.bundle_voci;");
    const lettura = policy("bundle_voci", "bv_lettura");
    expect(lettura.comando).toBe("select");
    expect(lettura.testo).not.toContain("aziende_con");
    const scrittura = policy("bundle_voci", "bv_scrittura");
    expect(scrittura.testo.match(/'can_edit_settings_bundle', 'can_edit_settings_pricing'/g) ?? []).toHaveLength(2);
  });

  it("dove il super admin non ha una policy sua, il suo ramo resta nella scrittura", () => {
    for (const [tabella, nome] of [
      ["articoli_native", "articoli_native_scrittura"],
      ["bundle_prodotti", "bp_scrittura"],
      ["bundle_voci", "bv_scrittura"],
      ["article_family_documents", "afd_scrittura"],
    ] as const) {
      const p = policy(tabella, nome);
      expect(p.testo.match(/public\.has_role\(\(select auth\.uid\(\)\), 'super_admin'::public\.app_role\)/g) ?? [], tabella).toHaveLength(2);
    }
  });

  it("import_article_family_template chiede il permesso del listino, dopo il controllo dell'azienda", () => {
    const chiamata = codice.slice(codice.indexOf("select pg_temp.aggiungi_controllo("));
    expect(chiamata).toContain("'public.import_article_family_template(uuid,uuid,uuid,text)'");
    expect(chiamata).toContain("RAISE EXCEPTION ''not a member of company %'', p_company_id USING ERRCODE = ''42501'';");
    expect(chiamata).toContain("AND NOT (p_company_id = ANY (public.aziende_con_permesso(''can_edit_settings_pricing''))) THEN");
    expect(chiamata).toContain("USING ERRCODE = ''42501''");
    expect(chiamata).toContain("IF NOT public.has_role(v_user_id, ''super_admin''::app_role)");
  });
});

describe("le pagine non offrono modifiche che il database rifiuta", () => {
  it("Tariffe: nuova voce, import, modifica, archivia ed elimina solo a chi può modificare", () => {
    const pagina = leggi("src/pages/azienda/settings/SettingsTariffe.tsx");
    expect(pagina).toMatch(/\{isAdmin && \(\s*<Button\s+size="sm"\s+onClick=\{openNew\}/);
    expect(pagina).toMatch(/\{isAdmin && \(\s*<>\s*<DropdownMenuLabel>Aggiungi in blocco<\/DropdownMenuLabel>/);
    expect(pagina).toMatch(/const rowClick = \(t: Tariffa\) => \(e: React\.MouseEvent\) => \{\s*if \(!isAdmin\) return;/);
    expect(pagina).toContain("disabled={!isAdmin}");
  });

  it("Margini: il margine per categoria è in sola lettura senza il permesso del listino", () => {
    const pagina = leggi("src/pages/azienda/settings/SettingsMargini.tsx");
    expect(pagina).toContain("disabled={!puoModificareListino}");
    expect(pagina).toContain("if (!puoModificareListino) return;");
    expect(pagina).toContain("puoModificareListino={isAdmin}");
  });

  it("Matrice serramenti e Componenti FV rispettano lo stesso permesso", () => {
    expect(leggi("src/features/serramenti-listini/components/MatriceEditor.tsx")).toContain("<fieldset disabled={solaLettura}");
    expect(leggi("src/features/serramenti-listini/pages/MatriceListini.tsx")).toContain("solaLettura={!puoModificare}");
    const fv = leggi("src/pages/azienda/fotovoltaico/ComponentiFv.tsx");
    expect(fv).toContain("gestore || permessi.canEditMarketingOpportunities || permessi.canEditSettingsPricing || permessi.canViewBilling");
    expect(fv).toMatch(/\{gestore && \(\s*<Button variant="outline" onClick=\{\(\) => setCollegaOpen\(true\)\}/);
  });
});
