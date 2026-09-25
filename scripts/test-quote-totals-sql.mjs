// Database PostgreSQL WASM isolato, nessuna connessione al servizio Supabase.
// node scripts/test-quote-totals-sql.mjs /path/to/@electric-sql/pglite/dist/index.js
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const fixtures = JSON.parse(await readFile(new URL("../src/test/fixtures/quoteTotalsParity.json", import.meta.url), "utf8"));
await db.exec(`
  CREATE TABLE public.quotes (
    id uuid PRIMARY KEY, company_id uuid, prezzo_manuale numeric(12,2),
    prezzo_manuale_iva_pct numeric(5,2), discount_percent numeric(5,2),
    subtotal numeric, discount_amount numeric, vat_amount numeric,
    total numeric, updated_at timestamptz
  );
  CREATE TABLE public.quote_items (
    quote_id uuid REFERENCES public.quotes(id), line_total numeric(12,2),
    vat_rate numeric(5,2), is_optional boolean
  );
  CREATE INDEX ON public.quote_items(quote_id);
`);
await db.exec(await readFile(new URL("../supabase/migrations/20280923100000_quote_totals_rounding_parity.sql", import.meta.url), "utf8"));
const quoteId = "00000000-0000-4000-8000-000000000001";
const companyId = "00000000-0000-4000-8000-000000000002";
for (const fixture of fixtures) {
  await db.exec("DELETE FROM public.quote_items; DELETE FROM public.quotes;");
  await db.query("INSERT INTO public.quotes (id,company_id,prezzo_manuale,prezzo_manuale_iva_pct,discount_percent) VALUES ($1,$2,$3,$4,$5)",
    [quoteId, companyId, fixture.manual, fixture.manualRate, fixture.discount]);
  for (const item of fixture.items) {
    await db.query("INSERT INTO public.quote_items VALUES ($1, ROUND($2::numeric * $3::numeric * (1 - $4::numeric / 100), 2), $5, $6)",
      [quoteId, item.quantity, item.unit_price, item.discount_percent || 0, item.vat_rate, item.is_optional || false]);
  }
  await db.query("SELECT public.do_recalculate_quote_totals($1)", [quoteId]);
  const { rows: [saved] } = await db.query("SELECT subtotal,discount_amount,vat_amount,total FROM public.quotes WHERE id=$1", [quoteId]);
  const numbers = Object.fromEntries(Object.entries(saved).map(([k,v]) => [k, Number(v)]));
  assert.deepEqual(numbers, fixture.expected, fixture.name);
  console.log("PASS", fixture.name);
}
// SECURITY INVOKER: una chiamata diretta non può aggirare le policy tenant.
await db.exec("UPDATE public.quotes SET updated_at = '2000-01-01T00:00:00Z'");
await db.exec(`
  CREATE ROLE quote_test_user;
  GRANT USAGE ON SCHEMA public TO quote_test_user;
  GRANT SELECT, UPDATE ON public.quotes TO quote_test_user;
  GRANT SELECT ON public.quote_items TO quote_test_user;
  ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_quotes ON public.quotes TO quote_test_user
    USING (company_id::text = current_setting('app.company_id', true))
    WITH CHECK (company_id::text = current_setting('app.company_id', true));
  SET ROLE quote_test_user;
  SET app.company_id = 'different-company';
`);
await db.query("SELECT public.do_recalculate_quote_totals($1)", [quoteId]);
assert.equal((await db.query("SELECT * FROM public.quotes")).rows.length, 0);
await db.exec("RESET ROLE");
assert.equal(Number((await db.query("SELECT total FROM public.quotes")).rows[0].total), 0);
assert.equal(new Date((await db.query("SELECT updated_at FROM public.quotes")).rows[0].updated_at).toISOString(), "2000-01-01T00:00:00.000Z");
console.log("PASS accesso isolato per tenant; 8 casi monetari verificati");
await db.close();
