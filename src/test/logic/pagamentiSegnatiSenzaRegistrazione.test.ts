/**
 * «Segnate pagate, ma i soldi non risultano usciti» (26/11/2026, Impresa Vulcano).
 *
 * Una distinta RiBa da 94.198 € non si riusciva a riconciliare: a mano le fatture «non si
 * trovavano» e restavano in elenco solo le note di credito. Causa: il 4/11 un UPDATE in
 * blocco ha acceso `company_costs.is_paid` su 365 costi, il trigger
 * `costo_allinea_rate_fornitori` ha messo le rate a «pagata», ma nessuna scrittura di
 * prima nota è stata creata — quella la fa `registra_pagamento_costo`, saltata dal blocco.
 * Da lì la riconciliazione, che esclude le rate pagate, non aveva più niente da offrire.
 *
 * Qui si tiene fermo l'impianto della migrazione 20290616100000. I numeri veri sono stati
 * provati in produzione su Impresa Vulcano, in transazioni annullate: la rata SILTE 448
 * ricompare fra i candidati con l'etichetta giusta, e riaprendo i costi del 31/10 tornano
 * 55 rate da pagare per 86.332 €.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  "supabase/migrations/20290616100000_pagamenti_segnati_senza_registrazione.sql",
  "utf8",
);

describe("l'elenco di quelle da sistemare", () => {
  it("prende le rate pagate che hanno ancora un residuo, non tutte le pagate", () => {
    expect(sql).toContain("create or replace function public.pagamenti_segnati_da_sistemare");
    expect(sql).toContain("r.stato = 'pagata'");
    expect(sql).toContain("private.fornitore_residuo_rata(r) > 0.005");
  });

  it("lo vede solo chi gestisce i pagamenti ai fornitori", () => {
    expect(sql).toContain("public.puo_gestire_scadenze(p_company)");
    expect(sql).toMatch(/revoke all on function public\.pagamenti_segnati_da_sistemare\(uuid\) from public, anon;/);
  });
});

describe("la riparazione", () => {
  it("tocca solo `is_paid` e lascia riaprire al trigger che lo sa già fare", () => {
    const f = sql.slice(sql.indexOf("function public.riapri_pagamenti_segnati"), sql.indexOf("-- 3 ──"));
    expect(f).toContain("set is_paid = false, paid_date = null");
    // Niente scritture a mano su rate e fatture: ci pensa costo_allinea_rate_fornitori.
    expect(f).not.toContain("update public.rate_fornitori");
    expect(f).not.toContain("update public.fatture_ricevute");
  });

  it("non sfiora i costi pagati davvero, nemmeno se glieli si passa", () => {
    const f = sql.slice(sql.indexOf("function public.riapri_pagamenti_segnati"), sql.indexOf("-- 3 ──"));
    expect(f).toContain("private.fornitore_residuo_rata(r) > 0.005");
    expect(f).toContain("coalesce(c.is_paid, false)");
  });

  it("chiede permesso e utente, e resta chiusa ad anon", () => {
    expect(sql).toContain("public.puo_gestire_scadenze(p_company) is not true");
    expect(sql).toContain("public.user_can_access_company(p_company) is not true");
    expect(sql).toMatch(/revoke all on function public\.riapri_pagamenti_segnati\(uuid, uuid\[\]\) from public, anon;/);
  });
});

describe("la riconciliazione le vede di nuovo", () => {
  it("non esclude più le rate pagate col residuo, e non guarda più se il costo è pagato", () => {
    const f = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.bank_candidati_movimento"));
    expect(f).toContain("r.stato NOT IN('stornata','da_bloccare','richiamata')");
    expect(f).toContain("r.stato<>'pagata' OR NOT coalesce(c.is_paid,false) OR private.fornitore_residuo_rata(r)>0.005");
    // Prima il costo pagato le tagliava fuori già nella JOIN.
    expect(f).not.toContain("c.annullato_il IS NULL AND NOT coalesce(c.is_paid,false)");
  });

  it("le marca per quello che sono, invece di mescolarle alle altre", () => {
    expect(sql).toContain("Segnata pagata · pagamento non registrato");
  });

  it("quelle pagate davvero restano fuori: il filtro sul residuo non si tocca", () => {
    const f = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.bank_candidati_movimento"));
    expect(f).toContain("WHERE residuo>0 AND (q='' OR strpos");
  });

  it("si ferma se la funzione da riscrivere non è più quella", () => {
    expect(sql).toContain("non e'' piu'' quella che questa migrazione riscrive");
  });
});
