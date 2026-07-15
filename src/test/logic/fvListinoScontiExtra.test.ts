/**
 * Test contratto — FV: listino collegato + prodotti extra + sconto.
 *
 * Copre il wiring statico delle 4 parti:
 *  A. ComponentiFv: "Collega dal listino" (tipologia+fv_categoria su
 *     listino_macrocategorie + RPC fv_sync_listino_macro), "Sincronizza ora",
 *     TIPI estesi (wallbox/ottimizzatore/struttura/altro), badge "Dal listino".
 *  B. Wizard: banner catalogo FV vuoto + sezione "Prodotti extra" salvata in
 *     fv_componenti_progetto (categoria='altro', stesso payload replace-insert).
 *  C. Sconto: blocco Step 6 con evaluateDiscountRules + clamp server-side
 *     nell'edge fv-calcolo-finanziario (discount_rules, sconto_eur_applicato).
 *  D. SettingsScontistica: tipo lavoro a Select con "fotovoltaico".
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const r = (p: string) => resolve(process.cwd(), p);

const COMPONENTI_FV = r("src/pages/azienda/fotovoltaico/ComponentiFv.tsx");
const COLLEGA_LISTINO = r("src/lib/fotovoltaico/collegaListino.ts");
const WIZARD = r("src/pages/azienda/fotovoltaico/FotovoltaicoWizard.tsx");
const WIZARD_TYPES = r("src/pages/azienda/fotovoltaico/FotovoltaicoWizard/types.ts");
const QUERIES = r("src/lib/fotovoltaico/queries.ts");
const EDGE = r("supabase/functions/fv-calcolo-finanziario/index.ts");
const SETTINGS_SCONTI = r("src/pages/azienda/settings/SettingsScontistica.tsx");
const MACRO_MANAGER = r("src/components/listino/MacroCategorieManager.tsx");

describe("A. ComponentiFv — collega dal listino + tipi estesi", () => {
  it("ha i bottoni 'Collega dal listino' e 'Sincronizza ora'", () => {
    const src = readFileSync(COMPONENTI_FV, "utf8");
    expect(src).toContain("Collega dal listino");
    expect(src).toContain("Sincronizza ora");
    expect(src).toContain("CollegaListinoDialog");
  });

  it("estende i TIPI con wallbox/ottimizzatore/struttura/altro", () => {
    const src = readFileSync(COMPONENTI_FV, "utf8");
    expect(src).toContain('"wallbox"');
    expect(src).toContain("Colonnina / Wallbox");
    expect(src).toContain('"ottimizzatore"');
    expect(src).toContain('"struttura"');
    expect(src).toContain("Altro / Extra");
  });

  it("mostra il badge 'Dal listino' sui componenti proiettati (listino_family_id)", () => {
    const src = readFileSync(COMPONENTI_FV, "utf8");
    expect(src).toContain("Dal listino");
    expect(src).toContain("listino_family_id");
  });

  it("collegaListino.ts: proposta ILIKE + UPDATE macro + RPC fv_sync_listino_macro", () => {
    expect(existsSync(COLLEGA_LISTINO)).toBe(true);
    const src = readFileSync(COLLEGA_LISTINO, "utf8");
    // Mapping proposto per nome macro
    expect(src).toContain("proponiMappingMacroFv");
    expect(src).toContain("wallbox");
    expect(src).toContain("ottimizzator");
    expect(src).toContain("zavorr");
    // Scrive tipologia + fv_categoria su listino_macrocategorie e sincronizza via RPC
    expect(src).toContain('"listino_macrocategorie"');
    expect(src).toContain("fv_categoria");
    expect(src).toContain("fv_sync_listino_macro");
    expect(src).toContain("p_company_id");
  });

  it("il form macrocategorie del listino espone tipologia + componente FV", () => {
    const src = readFileSync(MACRO_MANAGER, "utf8");
    expect(src).toContain("formTipologia");
    expect(src).toContain("formFvCategoria");
    expect(src).toContain("Tipologia listino");
  });
});

describe("B. Wizard — banner catalogo vuoto + prodotti extra", () => {
  it("mostra il banner ambra quando il catalogo FV è vuoto, con CTA a ComponentiFv", () => {
    const src = readFileSync(WIZARD, "utf8");
    expect(src).toContain("catalogoFvVuoto");
    expect(src).toContain("Nessun componente nel catalogo FV");
    expect(src).toContain("Collega il listino al preventivatore");
    expect(src).toContain("/azienda/marketing/fotovoltaico/componenti");
  });

  it("ha la sezione 'Prodotti extra' con ricerca live sul listino", () => {
    const src = readFileSync(WIZARD, "utf8");
    expect(src).toContain("Prodotti extra dal listino");
    expect(src).toContain("useListinoPerFv(extraSearch)");
    expect(src).toContain("aggiungiExtra");
    expect(src).toContain("rimuoviExtra");
  });

  it("salva le extra in fv_componenti_progetto con categoria='altro' nello stesso payload", () => {
    const src = readFileSync(WIZARD, "utf8");
    expect(src).toContain("data.prodotti_extra.forEach");
    // Le righe extra vanno nello stesso array `comp` del replace-insert Step 5
    expect(src).toMatch(/prodotti_extra\.forEach[\s\S]*?comp\.push\(\{[\s\S]*?categoria: "altro"/);
  });

  it("WizardData tipizza prodotti_extra + sconto e la query listino ritorna il prezzo d'acquisto", () => {
    const types = readFileSync(WIZARD_TYPES, "utf8");
    expect(types).toContain("prodotti_extra");
    expect(types).toContain("sconto_tipo");
    expect(types).toContain("sconto_valore");
    const queries = readFileSync(QUERIES, "utf8");
    expect(queries).toContain("prezzo_base_acquisto");
  });
});

describe("C. Sconto — wizard step 6 + edge fv-calcolo-finanziario", () => {
  it("il wizard ha il blocco Sconto con evaluateDiscountRules e toggle %/€", () => {
    const src = readFileSync(WIZARD, "utf8");
    expect(src).toContain("Sconto commerciale");
    expect(src).toContain("evaluateDiscountRules");
    expect(src).toContain("classifyDiscount");
    expect(src).toContain('tipoLavoro: "fotovoltaico"');
    expect(src).toContain("parseDecimalIT");
    // toggle pct / importo
    expect(src).toContain('update("sconto_tipo", "pct")');
    expect(src).toContain('update("sconto_tipo", "importo")');
    // messaggi verdetto
    // "approvazione admin" può essere avvolto in <strong> nel markup del verdetto,
    // quindi si verifica la sottostringa robusta al tag, non la frase contigua.
    expect(src).toContain("approvazione admin");
    expect(src).toContain("oltre il massimo consentito");
    // riepilogo sempre visibile
    expect(src).toContain("Prezzo pieno (netto)");
    expect(src).toContain("Prezzo netto scontato");
    expect(src).toContain("Margine post-sconto");
  });

  it("il wizard persiste sconto_tipo/sconto_valore prima del ricalcolo", () => {
    const src = readFileSync(WIZARD, "utf8");
    expect(src).toMatch(/handleCalcolaFinanziario[\s\S]*?sconto_tipo[\s\S]*?sconto_valore[\s\S]*?fv-calcolo-finanziario/);
    expect(src).toContain("sconto_limitato");
  });

  it("l'edge carica discount_rules, clampa e scrive sconto_eur_applicato", () => {
    const src = readFileSync(EDGE, "utf8");
    expect(src).toContain('from("discount_rules")');
    expect(src).toContain("sconto_eur_applicato");
    expect(src).toContain("sconto_limitato");
    expect(src).toContain("prezzo_pieno_netto");
    // fallback coerente con la lib client
    expect(src).toContain("FALLBACK_SCONTO_PCT = 10");
    // margine minimo rispettato
    expect(src).toContain("margine_min_pct");
    // metriche a valle sul prezzo scontato
    expect(src).toContain("prezzo_pieno_netto - sconto_eur_applicato");
  });
});

describe("D. SettingsScontistica — tipi lavoro noti", () => {
  it("il tipo lavoro è un Select con 'fotovoltaico' tra le opzioni + voce Altro…", () => {
    const src = readFileSync(SETTINGS_SCONTI, "utf8");
    expect(src).toContain("TIPI_LAVORO_NOTI");
    expect(src).toContain('"fotovoltaico"');
    expect(src).toContain("(tutti i lavori)");
    expect(src).toContain("Altro…");
  });

  it("il copy spiega che le regole valgono per tutti i preventivatori e i privati", () => {
    const src = readFileSync(SETTINGS_SCONTI, "utf8");
    expect(src).toContain("tutti i preventivatori");
    expect(src).toContain("privati inclusi");
  });
});
