/**
 * Accessi multi-azienda: contano solo se attivi e non scaduti (25/09/2026).
 *
 * 86 policy su 55 tabelle, e 8 funzioni, facevano entrare in un'azienda con una
 * riga qualsiasi in multi_company_access: anche un accesso sospeso, un invito
 * mai accettato o un accesso scaduto. Provato su una copia annullata: con
 * l'accesso sospeso si vedevano 61 proposte AI, 935 articoli di magazzino, 325
 * esecuzioni di flussi, come con l'accesso attivo. Ora il criterio è quello di
 * user_can_access_company: status = 'active' e scadenza vuota o futura.
 *
 * Tiene fermo:
 *   · ogni sottoquery su multi_company_access delle migrazioni 20280925010001…6
 *     ha stato e scadenza; le policy sono rilanciabili (DROP POLICY IF EXISTS)
 *     e a lotti piccoli, con lock_timeout;
 *   · restano fuori, apposta, le policy dove la riga è della persona gestita
 *     (staff_permissions, profiles_lettura_authenticated) e le RESTRICTIVE;
 *   · le 8 funzioni cambiano solo il pezzo indicato, contato una volta sola;
 *   · il selettore azienda scarta gli accessi non validi, anche dalla copia nel
 *     browser, altrimenti comparirebbero voci senza nome.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { accessoMultiAziendaValido } from "@/lib/auth/multiCompany";

const CARTELLA = resolve(process.cwd(), "supabase/migrations");
const migrazioni = readdirSync(CARTELLA)
  .filter((f) => /^2028092501000\d_accessi_multi_azienda_attivi_.+\.sql$/.test(f))
  .sort()
  .map((nome) => ({ nome, sql: readFileSync(resolve(CARTELLA, nome), "utf8") }));

// Le istruzioni, senza i commenti (che raccontano anche com'era prima).
const codice = (sql: string) => sql.replace(/--.*$/gm, "");

const lottiPolicy = migrazioni.filter((m) => /_accessi_multi_azienda_attivi_\d\.sql$/.test(m.nome));
const funzioni = migrazioni.filter((m) => /_funzioni_(policy|rpc)\.sql$/.test(m.nome));

/** il WHERE (bilanciato) che segue ogni FROM public.multi_company_access */
function whereMultiAzienda(sql: string): { alias: string; where: string }[] {
  const out: { alias: string; where: string }[] = [];
  const re = /FROM public\.multi_company_access(?: (\w+))?\s+WHERE \(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const alias = m[1] ?? "multi_company_access";
    const inizio = m.index + m[0].length - 1;
    let profondita = 0;
    let fine = inizio;
    for (let i = inizio; i < sql.length; i++) {
      if (sql[i] === "(") profondita++;
      if (sql[i] === ")") profondita--;
      if (profondita === 0) {
        fine = i;
        break;
      }
    }
    out.push({ alias, where: sql.slice(inizio, fine + 1) });
  }
  return out;
}

describe("accesso multi-azienda valido (selettore azienda)", () => {
  const adesso = new Date("2026-09-25T10:00:00Z");

  it("conta solo attivo e non scaduto", () => {
    expect(accessoMultiAziendaValido({ status: "active", expires_at: null }, adesso)).toBe(true);
    expect(accessoMultiAziendaValido({ status: "active", expires_at: "2026-10-01T00:00:00Z" }, adesso)).toBe(true);
    expect(accessoMultiAziendaValido({ status: "active", expires_at: "2026-09-24T00:00:00Z" }, adesso)).toBe(false);
    expect(accessoMultiAziendaValido({ status: "suspended", expires_at: null }, adesso)).toBe(false);
    expect(accessoMultiAziendaValido({ status: "invited", expires_at: null }, adesso)).toBe(false);
  });

  it("le voci senza stato (azienda del profilo, commercialista) restano", () => {
    expect(accessoMultiAziendaValido({}, adesso)).toBe(true);
  });

  it("AuthContext filtra sia la lettura sia la copia nel browser", () => {
    const auth = readFileSync(resolve(process.cwd(), "src/contexts/AuthContext.tsx"), "utf8");
    expect(auth.match(/\.filter\(\(a\) => accessoMultiAziendaValido\(a\)\)/g) ?? []).toHaveLength(2);
    const lettura = auth.slice(auth.indexOf('.from("multi_company_access")'), auth.indexOf("accountant_firm_members"));
    expect(lettura).toContain(".filter((a) => accessoMultiAziendaValido(a))");
  });
});

describe("policy: stato e scadenza in ogni sottoquery multi-azienda", () => {
  it("ci sono i sei lotti e le due migrazioni delle funzioni", () => {
    expect(lottiPolicy.map((m) => m.nome.slice(0, 14))).toEqual([
      "20280925010001", "20280925010002", "20280925010003",
      "20280925010004", "20280925010005", "20280925010006",
    ]);
    expect(funzioni.map((m) => m.nome.slice(0, 14))).toEqual(["20280925010007", "20280925010008"]);
  });

  it.each(migrazioni)("$nome non aspetta i lock all'infinito", ({ sql }) => {
    expect(codice(sql)).toContain("SET LOCAL lock_timeout = '3s';");
  });

  it.each(lottiPolicy)("$nome: lotto piccolo e rilanciabile", ({ sql }) => {
    const c = codice(sql);
    const create = [...c.matchAll(/CREATE POLICY ("[^"]+"|\w+) ON (public\.\w+)/g)];
    expect(create.length).toBeGreaterThan(0);
    expect(create.length).toBeLessThanOrEqual(20);
    for (const [, nome, tabella] of create) {
      const drop = c.indexOf(`DROP POLICY IF EXISTS ${nome} ON ${tabella};`);
      expect(drop, `${nome}`).toBeGreaterThanOrEqual(0);
      expect(drop).toBeLessThan(c.indexOf(`CREATE POLICY ${nome} ON ${tabella}`));
    }
  });

  it("86 policy in tutto, e companies da sola nell'ultimo lotto", () => {
    const tutte = lottiPolicy.flatMap(({ sql }) => [...codice(sql).matchAll(/CREATE POLICY ("[^"]+"|\w+) ON public\.(\w+)/g)]);
    expect(tutte).toHaveLength(86);
    const ultimo = codice(lottiPolicy[lottiPolicy.length - 1].sql);
    expect([...ultimo.matchAll(/CREATE POLICY .+ ON public\.(\w+)/g)].map((m) => m[1])).toEqual(["companies", "companies"]);
  });

  it.each(lottiPolicy)("$nome: ogni WHERE su multi_company_access vuole attivo e non scaduto", ({ sql }) => {
    const where = whereMultiAzienda(codice(sql));
    expect(where.length).toBeGreaterThan(0);
    for (const { alias, where: w } of where) {
      expect(w).toContain(`(${alias}.user_id = ( SELECT auth.uid() AS uid))`);
      expect(w).toContain(`(${alias}.status = 'active'::text)`);
      expect(w).toContain(`((${alias}.expires_at IS NULL) OR (${alias}.expires_at > now()))`);
    }
  });

  it("restano fuori le policy sulla persona gestita, le RESTRICTIVE e i controlli per riga", () => {
    const c = lottiPolicy.map(({ sql }) => codice(sql)).join("\n");
    expect(c).not.toContain("ON public.staff_permissions");
    expect(c).not.toContain("profiles_lettura_authenticated");
    expect(c).not.toContain("AS RESTRICTIVE");
    expect(c).not.toMatch(/POLICY (IF EXISTS )?blocco_utente_bloccato/);
    // user_can_access_company(company_id) prende la colonna: girerebbe per riga.
    expect(c).not.toContain("user_can_access_company");
  });
});

describe("funzioni: cambia solo il pezzo, contato una volta", () => {
  const attese: Record<string, string[]> = {
    "20280925010007": [
      "public.can_access_render_company(uuid)",
      "public.conversazioni_puo_accedere(uuid)",
      "public.can_access_company_people(uuid)",
      "public.can_manage_company_people(uuid)",
      "public.can_view_company_people(uuid)",
    ],
    "20280925010008": [
      "public.ai_assert_company_access(uuid)",
      "public.get_customer_context(uuid)",
      "public.hr_update_richiesta_stato(uuid,text,text)",
    ],
  };

  it.each(funzioni)("$nome", ({ nome, sql }) => {
    const c = codice(sql);
    for (const firma of attese[nome.slice(0, 14)]) expect(c).toContain(`('${firma}',`);
    // ogni pezzo nuovo porta la scadenza
    const nuovi = [...c.matchAll(/E'((?:[^']|'')*)'\)/g)].map((m) => m[1]);
    expect(nuovi).toHaveLength(attese[nome.slice(0, 14)].length);
    for (const n of nuovi) expect(n).toMatch(/expires_at IS NULL OR (mca\.)?expires_at > now\(\)/);
    expect(c).toContain("pg_get_functiondef(r.funzione::regprocedure)");
    expect(c).toContain("IF strpos(def, r.nuovo) > 0 THEN");
    expect(c).toContain("IF n <> 1 THEN");
    expect(c).toContain("EXECUTE replace(def, r.vecchio, r.nuovo);");
  });
});
