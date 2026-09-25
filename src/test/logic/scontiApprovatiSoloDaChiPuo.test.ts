/**
 * Gli sconti dei preventivi li approva chi ha il permesso (26/09/2026).
 *
 * Provato in una transazione annullata: prima un venditore si approvava da
 * solo lo sconto chiesto (con la RPC o scrivendo decision a mano), e un
 * utente di un'altra azienda chiedeva e approvava sconti su preventivi non
 * suoi. Dopo: il venditore chiede come prima, ma non decide (42501, 0 righe);
 * l'altra azienda riceve 42501; l'amministratore decide come prima.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const codice = readFileSync(resolve(process.cwd(), "supabase/migrations/20280926070000_sconti_approvati_solo_da_chi_puo.sql"), "utf8")
  .replace(/--.*$/gm, "");

const policy = (nome: string) => {
  const m = codice.match(new RegExp(`create policy ${nome} on public\\.quote_approvals\\s+for (\\w+) to authenticated([\\s\\S]*?\\);)\\n`));
  expect(m, nome).not.toBeNull();
  return { comando: m![1], testo: m![2] };
};

const chiamata = (firma: string) => {
  const inizio = codice.indexOf(`'${firma}'`);
  expect(inizio, firma).toBeGreaterThan(0);
  return codice.slice(inizio, codice.indexOf(");", inizio));
};

describe("migrazione sconti_approvati_solo_da_chi_puo", () => {
  it("non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
  });

  it("decide_quote_approval: decide solo chi approva gli sconti, nell'azienda della richiesta", () => {
    const c = chiamata("public.decide_quote_approval(uuid,text,numeric,text)");
    // agganciato dopo la lettura della richiesta, quando v_company_id è noto
    expect(c).toContain("RAISE EXCEPTION ''approval_not_found_or_already_decided'';");
    expect(c).toContain("v_company_id = ANY (public.aziende_con_permesso(''can_approve_discounts''))");
    expect(c).toContain("USING ERRCODE = ''42501''");
  });

  it("request_quote_approval: chiede solo chi modifica i preventivi di quell'azienda", () => {
    const c = chiamata("public.request_quote_approval(uuid,numeric,text)");
    expect(c).toContain("RAISE EXCEPTION ''quote_not_found'';");
    expect(c).toContain("v_company_id = ANY (public.aziende_con_permesso(''can_edit_preventivi''))");
  });

  it("quote_approvals: via la regola unica, la richiesta si inserisce senza decisione", () => {
    expect(codice).toContain("drop policy if exists quote_approvals_company_access on public.quote_approvals;");
    const r = policy("quote_approvals_richiesta");
    expect(r.comando).toBe("insert");
    expect(r.testo).toContain("requested_by = (select auth.uid())");
    for (const campo of ["decision", "decided_by", "decided_at", "sconto_autorizzato_pct", "note_decisione"]) {
      expect(r.testo, campo).toContain(`${campo} is null`);
    }
  });

  it("quote_approvals: decisioni e cancellazioni solo a chi approva gli sconti", () => {
    const d = policy("quote_approvals_decisione");
    expect(d.comando).toBe("update");
    expect(d.testo.match(/aziende_con_permesso\('can_approve_discounts'\)/g) ?? []).toHaveLength(2);
    const c = policy("quote_approvals_cancellazione");
    expect(c.comando).toBe("delete");
    expect(c.testo).toContain("aziende_con_permesso('can_approve_discounts')");
    expect(policy("quote_approvals_lettura").comando).toBe("select");
  });

  it("seed_quote_templates resta al trigger delle aziende nuove", () => {
    expect(codice).toContain("revoke all on function public.seed_quote_templates(uuid) from public, anon, authenticated;");
  });
});

describe("la pagina delle approvazioni dice la stessa cosa", () => {
  it("decide solo chi ha canApproveDiscounts", () => {
    const pagina = readFileSync(resolve(process.cwd(), "src/pages/azienda/marketing/QuoteApprovals.tsx"), "utf8");
    expect(pagina).toContain("const isAdmin = permissions.canApproveDiscounts;");
    expect(pagina).toMatch(/if \(!isAdmin\) \{/);
  });
});
