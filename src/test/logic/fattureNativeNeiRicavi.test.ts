/**
 * Le fatture fatte in EiC contano nel Controllo di Gestione (09/11/2026).
 *
 * Stanno in `documenti_fiscali`, le importate in `invoices`, e nessun codice
 * copia le une nelle altre. Il bilancio leggeva solo `invoices`: le native non
 * esistevano. Questo test sorveglia che tutti leggano la vista unica e che la
 * stessa fattura non si conti due volte.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(__dirname, "../../..", "supabase/migrations/20290126140000_ricavi_anche_fatture_native.sql"),
  "utf8",
);
const vista = sql.slice(
  sql.indexOf("create or replace view public.v_cg_fatture_emesse"),
  sql.indexOf("alter view public.v_cg_fatture_emesse"),
);
const ramoNative = vista.slice(vista.indexOf("union all"));

describe("La vista unica delle fatture emesse", () => {
  it("legge entrambe le tabelle", () => {
    expect(vista).toContain("from invoices i");
    expect(ramoNative).toContain("from documenti_fiscali d");
  });

  it("non conta due volte la fattura presente in entrambe", () => {
    expect(ramoNative).toContain("and not exists (");
    expect(ramoNative).toContain("g.invoice_number = d.numero");
    expect(ramoNative).toContain("g.issue_date = d.data_emissione");
    expect(ramoNative).toContain("(g.document_type = 'credit_note') = (d.tipo = 'nota_credito')");
  });

  it("una gemella cancellata non nasconde la nativa", () => {
    const gemella = ramoNative.slice(ramoNative.indexOf("and not exists ("));
    expect(gemella).toContain("g.deleted_at is null");
    expect(gemella).toContain("'cancelled'::text");
  });

  it("lascia fuori bozze, annullate, rifiutate e cancellate", () => {
    expect(ramoNative).toContain("array['bozza'::text, 'annullata'::text, 'rifiutata'::text]");
    expect(ramoNative).toContain("d.deleted_at is null");
  });

  it("prende solo i documenti di vendita veri", () => {
    const tipi = ramoNative.slice(ramoNative.indexOf("d.tipo = any"), ramoNative.indexOf("and not exists"));
    for (const t of ["fattura", "fattura_pa", "fattura_riepilogativa", "nota_credito", "nota_debito"]) {
      expect(tipi).toContain(`'${t}'`);
    }
    for (const t of ["proforma", "preventivo", "ddt", "autofattura", "reverse_charge_interno"]) {
      expect(tipi).not.toContain(`'${t}'`);
    }
  });

  it("le note di credito hanno il segno meno in tutti e due i rami", () => {
    expect(vista).toContain("case when i.document_type = 'credit_note' then -1 else 1 end as segno");
    expect(vista).toContain("case when d.tipo = 'nota_credito' then -1 else 1 end as segno");
  });

  it("non mette id di tabelle diverse nella stessa colonna cliente", () => {
    expect(ramoNative).toContain("null::uuid as cliente_id");
  });

  it("non è leggibile da anon e usa i permessi di chi chiede", () => {
    expect(sql).toContain("revoke all on public.v_cg_fatture_emesse from public, anon");
    expect(sql).toContain("alter view public.v_cg_fatture_emesse set (security_invoker = on)");
  });
});

describe("Chi la legge", () => {
  it("ricavi e fatturato delle commesse passano dalla vista", () => {
    const ricavi = sql.slice(sql.indexOf("create or replace view public.v_cg_ricavi_classificati"));
    expect(ricavi.slice(0, ricavi.indexOf("alter view"))).toContain("from public.v_cg_fatture_emesse f");
    const lavori = sql.slice(sql.indexOf("create or replace view public.v_cg_lavori_in_corso"));
    expect(lavori.slice(0, lavori.indexOf("alter view"))).toContain("from public.v_cg_fatture_emesse e");
  });

  it("le tre funzioni si correggono con un innesto che si ferma se il testo è cambiato", () => {
    expect(sql.match(/raise exception '[^']*questa migrazione va rivista'/g)).toHaveLength(3);
    expect(sql.match(/if position\('v_cg_fatture_emesse' in v_def\) > 0 then\s+return;/g)).toHaveLength(3);
  });

  it("il dettaglio dei ricavi usa il segno, così torna col conto economico", () => {
    expect(sql).toContain("'importo', f.segno * f.imponibile");
    expect(sql).toContain("COALESCE(sum(f.segno * f.imponibile), 0)");
  });

  it("i crediti verso clienti sono il residuo col segno", () => {
    expect(sql).toContain("SELECT COALESCE(sum(f.segno * f.residuo), 0)");
  });
});
