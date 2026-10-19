// src/test/logic/whatsappMigrazioniBot.test.ts
/**
 * Le migrazioni del bot WhatsApp del 18/10/2026 toccano funzioni esistenti
 * solo dal corpo censito (impronta md5) e con lock_timeout, e non aprono
 * niente a chi usa l'app.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const leggi = (f: string) => readFileSync(resolve(process.cwd(), "supabase/migrations", f), "utf8");

describe("migrazioni del bot WhatsApp", () => {
  it("la marginalità si apre solo ai servizi interni, con l'interruttore del controllo di gestione", () => {
    const sql = leggi("20281018130000_marginalita_dai_servizi_interni.sql");
    expect(sql).toContain("set local lock_timeout = '3s';");
    expect(sql).toContain("'5c17acce02e642003d4142dd68f1b6d1'");
    expect(sql).toContain("'b6042b8a33d54e4a1097e13d24131593'");
    expect(sql).toContain("IF coalesce(auth.role(), '') = 'service_role' THEN\n    PERFORM public._cg_assert_enabled(v_company_id);");
    // Per gli utenti dell'app il controllo resta quello di prima.
    expect(sql).toContain("ELSIF v_company_id IS DISTINCT FROM public.get_my_company_id()");
  });

  it("il rapportino della sera entra nei tipi di routine senza toglierne", () => {
    const sql = leggi("20281018140000_bot_routine_rapportino_sera.sql");
    for (const t of ["report_mattino", "todo_operaio", "avviso", "promemoria_appuntamento", "rapportino_sera"]) expect(sql).toContain(`'${t}'`);
  });

  it("la bozza di Silvio prende il numero vero, la sorgente e il cliente univoco", () => {
    const sql = leggi("20281018150000_preventivo_da_silvio_numero_vero.sql");
    expect(sql).toContain("set local lock_timeout = '3s';");
    expect(sql).toContain("'1b804b4b8f0d8a78eac5f824174ee925'");
    expect(sql).toContain("'a74772e0a033de8f1fc981311653256f'");
    expect(sql).toContain("v_number := public.generate_quote_number(p_company_id);");
    expect(sql).toContain("CASE WHEN count(*) = 1 THEN (array_agg(m.id))[1] END INTO v_contact");
  });
});
