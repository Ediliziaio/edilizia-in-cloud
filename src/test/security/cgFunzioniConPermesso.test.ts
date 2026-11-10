/**
 * Ogni funzione del Controllo di Gestione chiamabile dal browser controlla il permesso (10/11/2026).
 *
 * Il 09/11 quattro funzioni nuove (lavori in corso, rimanenza, provenienza dei ricavi, voci da
 * classificare) controllavano l'azienda ma non il permesso: le leggeva chiunque ne facesse parte,
 * anche un cliente esterno. Il cancello del modulo è `_cg_assert_lettura`; `cg_puo_leggere` è la
 * stessa domanda come sì/no.
 *
 * Regola, da 20290116000000 in poi: una funzione `cg_*` SECURITY DEFINER che non è chiusa al
 * browser (revoke da authenticated) deve passare dal cancello, nel suo corpo o con l'innesto di una
 * migrazione successiva che la nomina insieme a `_cg_assert_lettura`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(__dirname, "../../..", "supabase/migrations");
const DA = "20290116000000";
const migrazioni = readdirSync(DIR)
  .filter((f) => /^\d{14}_.+\.sql$/.test(f) && f.slice(0, 14) >= DA)
  .sort()
  .map((nome) => ({ nome, testo: readFileSync(join(DIR, nome), "utf8") }));

const CANCELLO = /_cg_assert_lettura|_cg_assert_enabled|cg_puo_leggere/;

/** Le funzioni cg_* create, col loro corpo, nel file dove nascono per ultimo. */
function funzioni() {
  const trovate = new Map<string, { file: number; corpo: string }>();
  migrazioni.forEach(({ testo }, i) => {
    const re = /create\s+or\s+replace\s+function\s+public\.(cg_\w+)\s*\(([\s\S]*?)\$(\w*)\$([\s\S]*?)\$\3\$/gi;
    for (const m of testo.matchAll(re)) {
      trovate.set(m[1].toLowerCase(), { file: i, corpo: `${m[2]}${m[4]}` });
    }
  });
  return trovate;
}

describe("Funzioni del Controllo di Gestione", () => {
  it("passano dal cancello del permesso, o sono chiuse al browser", () => {
    const scoperte: string[] = [];
    for (const [nome, { file, corpo }] of funzioni()) {
      if (!/security\s+definer/i.test(corpo)) continue;
      if (/returns\s+trigger/i.test(corpo)) continue;
      if (CANCELLO.test(corpo) || nome === "cg_puo_leggere") continue;
      const dopo = migrazioni.slice(file);
      const chiusa = dopo.some(({ testo }) =>
        new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${nome}\\b[^;]*from[^;]*authenticated`, "i").test(testo));
      const innestata = dopo.some(({ testo }) =>
        testo.includes(`public.${nome}(`) && /_cg_assert_lettura\(/.test(testo) && /pg_get_functiondef/.test(testo));
      if (!chiusa && !innestata) scoperte.push(`${nome} (${migrazioni[file].nome})`);
    }
    expect(scoperte).toEqual([]);
  });

  it("le quattro del 09/11 sono tra quelle corrette", () => {
    const correzione = migrazioni.find((m) => m.nome.startsWith("20290213240000"))?.testo ?? "";
    for (const f of ["cg_lavori_in_corso", "cg_ricavi_provenienza", "cg_voci_non_classificate", "cg_registra_rimanenza_lavori"]) {
      expect(correzione).toContain(`public.${f}(`);
    }
    expect(correzione).toContain("public.cg_puo_leggere(company_id)");
  });
});
