// Bolle con lo stesso numero in anni diversi (migrazione 20290404308000): la numerazione dei DDT
// ricomincia ogni anno, il doppione vero resta rifiutato.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
const AZ = "00000000-0000-4000-a000-000000000001", FORN = "00000000-0000-4000-a000-000000000002";

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(`
    create table ddt_ricezione(id uuid primary key default gen_random_uuid(), company_id uuid, supplier_id uuid, numero_ddt text, data_ricezione date);
    create unique index ddt_ricezione_una_bolla_per_fornitore on ddt_ricezione (company_id, supplier_id, upper(btrim(numero_ddt)))
      where supplier_id is not null and btrim(numero_ddt) <> '';
    insert into ddt_ricezione(company_id, supplier_id, numero_ddt, data_ricezione) values ('${AZ}','${FORN}','1068','2025-11-03');
    alter table ddt_ricezione add column purchase_order_id uuid, add column created_at timestamptz default clock_timestamp();
    create function bolla_numero_norma(v text) returns text language sql immutable as $f$select regexp_replace(upper(coalesce(v,'')), '[^A-Z0-9]', '', 'g')$f$;
    -- Come in produzione, ridotta alla ricerca della bolla già caricata (i due pezzi che la migrazione corregge).
    create function arrivo_registra(p_ordine uuid, p_righe jsonb, p_fornitore uuid, p_numero text, p_data date, p_company uuid)
    returns uuid language plpgsql as $f$
    declare v_ddt uuid; v_numero text := p_numero; v_data date := coalesce(p_data, current_date); v_company uuid := p_company; po record;
    begin
      select p_ordine id, p_fornitore supplier_id into po;
      select d.id into v_ddt from public.ddt_ricezione d
       where d.company_id = v_company and d.supplier_id is not distinct from po.supplier_id
         and (upper(btrim(d.numero_ddt)) = upper(v_numero)
            or (public.bolla_numero_norma(v_numero) <> '' and public.bolla_numero_norma(d.numero_ddt) = public.bolla_numero_norma(v_numero)))
     order by case when d.purchase_order_id = po.id then 0 when d.purchase_order_id is null then 1 else 2 end, d.created_at
     limit 1;
      if v_ddt is null then
        select d.id into v_ddt from public.ddt_ricezione d
         where d.company_id = v_company and d.purchase_order_id = po.id and upper(btrim(d.numero_ddt)) = upper(v_numero)
       order by d.created_at limit 1;
      end if;
      return v_ddt;
    end $f$;
  `);
  await db.exec(readFileSync("supabase/migrations/20290404308000_ddt_stesso_numero_anni_diversi.sql", "utf8"));
});
afterAll(async () => db?.close());

const bolla = (numero: string, data: string) =>
  db.query(`insert into ddt_ricezione(company_id, supplier_id, numero_ddt, data_ricezione) values ($1,$2,$3,$4)`, [AZ, FORN, numero, data]);

describe("bolle con lo stesso numero in anni diversi", () => {
  it("la 1068 del 2026 entra accanto alla 1068 del 2025", async () => {
    await expect(bolla("1068", "2026-01-08")).resolves.toBeDefined();
  });

  it("lo stesso numero nello stesso anno resta un doppione, anche scritto diverso; il nome del vincolo lo riconosce il browser", async () => {
    await expect(bolla(" 1068 ", "2026-03-02")).rejects.toThrow(/una_bolla_per_fornitore/);
  });

  it("il vincolo vecchio non c'è più", async () => {
    const r = await db.query<{ n: number }>(`select count(*)::int n from pg_indexes where indexname = 'ddt_ricezione_una_bolla_per_fornitore'`);
    expect(r.rows[0].n).toBe(0);
  });

  it("l'arrivo dall'ordine riusa la bolla solo dello stesso anno", async () => {
    const vecchia = (await db.query<{ id: string }>(`select id from ddt_ricezione where data_ricezione = '2025-11-03'`)).rows[0].id;
    const nuova = (await db.query<{ id: string }>(`select id from ddt_ricezione where data_ricezione = '2026-01-08'`)).rows[0].id;
    const trova = async (data: string) =>
      (await db.query<{ r: string | null }>(`select arrivo_registra(null, '[]', $1, '1068', $2, $3) r`, [FORN, data, AZ])).rows[0].r;
    expect(await trova("2025-12-20")).toBe(vecchia);
    expect(await trova("2026-02-01")).toBe(nuova);
    expect(await trova("2027-01-15")).toBeNull();
  });

  it("rifatta, la migrazione non tocca di nuovo la funzione", async () => {
    await expect(db.exec(readFileSync("supabase/migrations/20290404308000_ddt_stesso_numero_anni_diversi.sql", "utf8"))).resolves.toBeDefined();
    const src = (await db.query<{ n: number }>(`select (length(prosrc) - length(replace(prosrc, 'extract(year from d.data_ricezione)', ''))) / length('extract(year from d.data_ricezione)') n from pg_proc where proname = 'arrivo_registra'`)).rows[0].n;
    expect(src).toBe(2);
  });
});
