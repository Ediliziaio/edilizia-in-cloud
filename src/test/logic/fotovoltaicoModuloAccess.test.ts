import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// 21/09/2026 — Renova non poteva fare preventivi fotovoltaici: il piano le dà
// il modulo, ma la pagina guardava anche la vecchia colonna
// `companies.fv_modulo_attivo`, che nessuna schermata accende più, e diceva
// «contatta il team». Stessa sorte per Best Infissi e Bagni Milano. E la
// colonna gemella `fv_setup_completato`, mai scritta da nessuno, mostrava il
// benvenuto AL POSTO dell'elenco a chi di progetti ne aveva (Green Energy 18,
// Suntech 7). Il modulo ha UNA fonte: la funzione di piano
// `modulo_fotovoltaico_attivo`.

const RADICE = join(__dirname, "../../..");
const leggi = (percorso: string) => readFileSync(join(RADICE, percorso), "utf8");

describe("la pagina del Fotovoltaico decide solo col piano", () => {
  const pagina = leggi("src/pages/azienda/fotovoltaico/FotovoltaicoIndex.tsx");
  const rotte = leggi("src/routes/companyRoutes.tsx");

  it("l'accesso lo decide la rotta, con la funzione di piano", () => {
    // Permesso del ruolo, come gli altri moduli di vendita, e funzione di piano.
    expect(rotte).toMatch(
      /path="marketing\/fotovoltaico" element=\{\s*withCompanyPermission\(\s*"canViewMarketingOpportunities",\s*<FeatureRoute featureKey="modulo_fotovoltaico_attivo">/,
    );
  });

  it("dentro la pagina non c'è più un secondo cancello", () => {
    expect(pagina).not.toContain("useFvModuloAttivo");
    expect(pagina).not.toContain("showInactive");
    expect(pagina).not.toContain("showSetup");
    expect(pagina).not.toContain("Contatta il team Edilizia in Cloud per attivarlo");
  });

  it("chi non ha ancora progetti vede lo stato vuoto dell'elenco, coi passi per iniziare", () => {
    expect(pagina).toContain("progettiQuery.isSuccess && progetti.length === 0");
    expect(pagina).toContain('to="/azienda/marketing/fotovoltaico/componenti"');
    expect(pagina).toContain('to="/azienda/impostazioni/tariffe"');
  });
});

describe("il salvataggio del progetto decide solo col piano", () => {
  const funzione = leggi("supabase/functions/fv-onboarding-cliente/index.ts");

  it("chiede la funzione di piano e non ripiega sulla colonna vecchia", () => {
    expect(funzione).toContain('p_feature_key: "modulo_fotovoltaico_attivo"');
    expect(funzione).not.toMatch(/select\(\s*["']fv_modulo_attivo/);
  });

  it("se la verifica non riesce lo dice, invece di rispondere «modulo non attivo»", () => {
    expect(funzione).toContain('"Non riesco a verificare il modulo Fotovoltaico: riprova tra poco", 503');
  });
});

describe("di guardia: nessuno torna a leggere le colonne vecchie", () => {
  // Uso nel codice = tra virgolette, dopo un punto o come chiave. I commenti
  // si tolgono prima di cercare: spiegare perché le colonne non si usano più
  // è giusto. I tipi generati del database descrivono la tabella così com'è,
  // e restano fuori.
  const USO = /["'.](fv_modulo_attivo|fv_setup_completato)\b|\b(fv_modulo_attivo|fv_setup_completato)\s*[:?]/;
  const senzaCommenti = (testo: string) => testo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const ESCLUSI = new Set(["src/integrations/supabase/types.ts", "src/test/logic/fotovoltaicoModuloAccess.test.ts"]);

  const file = (cartella: string): string[] =>
    readdirSync(join(RADICE, cartella)).flatMap((nome) => {
      const percorso = join(cartella, nome);
      if (nome === "node_modules") return [];
      if (statSync(join(RADICE, percorso)).isDirectory()) return file(percorso);
      return /\.(ts|tsx)$/.test(nome) ? [percorso] : [];
    });

  it("la guardia funziona: vede un uso vero e ignora un commento", () => {
    expect(USO.test(senzaCommenti('const { data } = await q.select("fv_modulo_attivo");'))).toBe(true);
    expect(USO.test(senzaCommenti("moduloAttivo = company?.fv_modulo_attivo === true;"))).toBe(true);
    expect(USO.test(senzaCommenti("type R = { fv_setup_completato: boolean };"))).toBe(true);
    expect(USO.test(senzaCommenti("// la vecchia colonna `companies.fv_modulo_attivo` non si usa più"))).toBe(false);
  });

  it("in tutta l'app e in tutte le funzioni", () => {
    const colpevoli = [...file("src"), ...file("supabase/functions")]
      .map((p) => relative(RADICE, join(RADICE, p)))
      .filter((p) => !ESCLUSI.has(p))
      .filter((p) => USO.test(senzaCommenti(leggi(p))));
    expect(colpevoli).toEqual([]);
  });
});
