import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AnalisiCosti } from "@/lib/preventivi/analisiCosti";

const migrazione = (nome: string) => readFileSync("supabase/migrations/" + nome, "utf8");
const azienda = "00000000-0000-0000-0000-000000000001";
const altra = "00000000-0000-0000-0000-000000000002";
const quote = "00000000-0000-0000-0000-000000000003";
const computo = "00000000-0000-0000-0000-000000000004";
const computoDaPreparare = "00000000-0000-0000-0000-000000000005";
const dati: Pick<AnalisiCosti, "versione" | "voci" | "fasi" | "generali" | "alternative"> = { versione: 1, voci: {}, fasi: {}, generali: [], alternative: {} };
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.user', true),'')::uuid
    $$;
    grant usage on schema auth to authenticated;
    create table public.companies(id uuid primary key);
    create table public.platform_feature_flags(key text primary key, name text, description text, category text,
      is_beta boolean, default_value boolean, plans_included text[], icon text, sort_order integer, supports_preview boolean);
    create table public.quotes(id uuid primary key, company_id uuid, status text, updated_at timestamptz,
      source text, deleted_at timestamptz, version integer, parent_quote_id uuid, quote_number text,
      subtotal numeric, discount_amount numeric, vat_amount numeric, total numeric, prezzo_manuale numeric,
      client_name text, client_email text, client_phone text, client_company text, client_address text,
      indirizzo_lavori text, tipo_lavoro text, opportunity_id uuid);
    alter table public.quotes alter column id set default gen_random_uuid();
    alter table public.quotes add column created_at timestamptz default now(), add column created_by uuid,
      add column title text, add column signed_at timestamptz, add column client_tipo text, add column client_fiscal_code text,
      add column client_vat_number text, add column contact_id uuid, add column customer_id uuid,
      add column prezzo_manuale_iva_pct numeric, add column discount_percent numeric, add column payment_phases jsonb,
      add column ritenuta_garanzia jsonb, add column validity_days integer, add column expires_at timestamptz,
      add column pdf_storage_path text, add column pdf_generated_at timestamptz;
    create table public.quote_items(id uuid primary key default gen_random_uuid(), quote_id uuid, company_id uuid,
      item_type text, name text, description text, quantity numeric, unit_price numeric, discount_percent numeric, vat_rate numeric,
      unit_of_measure text, sort_order integer, article_template_id uuid, item_category text, tariffa_id uuid,
      prezzo_acquisto numeric, mostra_nel_pdf boolean, is_optional boolean, misura_x numeric, misura_y numeric,
      family_id uuid, axis_selections jsonb, supplier_catalog_id uuid, supplier_product_line_id uuid,
      computo_voce_id uuid, parent_item_id uuid, line_total numeric generated always as (quantity*unit_price) stored);
    alter table public.quote_items alter column name set not null;
    alter table public.quote_items add column codice_prezzario text, add column custom_field_values jsonb;
    create table orders(id uuid primary key default gen_random_uuid(),company_id uuid,quote_id uuid,quote_number text,
      order_code text, deleted_at timestamptz, client_name text, client_email text, client_phone text, client_company text,
      client_address text, indirizzo_lavori text, tipo_lavoro text, opportunity_id uuid, created_by uuid);
    create table order_items(order_id uuid, name text, purchase_price numeric);
    create table order_work_phases(id uuid primary key default gen_random_uuid(),company_id uuid,order_id uuid,
      name text,position integer,notes text,importo_venduto numeric);
    create table order_work_phase_voci(company_id uuid,order_id uuid,phase_id uuid,position integer,descrizione text,
      unita text,quantita numeric,costo_manodopera numeric,importo numeric,tariffa_id uuid,origine text,origine_id uuid,origine_codice text);
    create function public.create_order_atomic(p_order_data jsonb,p_items jsonb,p_salesperson jsonb,p_user_id uuid,p_installments jsonb)
    returns jsonb language plpgsql as $$declare o uuid; begin
      insert into public.orders(company_id) values((p_order_data->>'company_id')::uuid) returning id into o;
      insert into public.order_items select o,i->>'name',(i->>'purchase_price')::numeric from jsonb_array_elements(p_items) i;
      return jsonb_build_object('id',o,'success',true);
    end$$;
    create table public.computo_preventivo_drafts(id uuid primary key, company_id uuid, payload jsonb);
    create table public.computo_voci_estratte(id uuid, company_id uuid);
    create table public.quote_versions(company_id uuid, quote_id uuid, version_num integer, snapshot jsonb);
    grant select, insert, update on public.quotes to authenticated;
    grant select, update on public.computo_preventivo_drafts to authenticated;
    grant select on public.computo_voci_estratte to authenticated;
    grant select, insert, update, delete on public.quote_items to authenticated;
    create function public.utente_bloccato() returns boolean language sql stable as $$ select false $$;
    create function public.utente_sola_lettura(uuid) returns boolean language sql stable as $$
      select current_setting('test.mode',true) = 'readonly'
    $$;
    create function public.user_can_access_company(uuid) returns boolean language sql stable as $$ select $1 = '${azienda}'::uuid $$;
    create function public.assert_company_access(uuid) returns void language plpgsql as $$begin
      if not public.user_can_access_company($1) then raise exception 'azienda'; end if;
    end$$;
    create function public.has_permission_for_company(uuid, text, uuid) returns boolean language sql stable as $$
      select (current_setting('test.mode', true) <> 'noprices' or $2 <> 'can_view_margins')
        and (current_setting('test.mode', true) <> 'nocosts' or $2 <> 'can_view_costs')
    $$;
    create function public.resolve_company_feature(uuid,text) returns table(is_enabled boolean, access_level text)
      language sql stable as $$ select current_setting('test.mode', true) <> 'disabled', 'enabled'::text $$;
    insert into public.companies values ('${azienda}'), ('${altra}');
    insert into public.quotes(id,company_id,status) values ('${quote}', '${azienda}', 'bozza');
    insert into public.computo_preventivo_drafts values ('${computo}', '${azienda}', '{}');
    insert into public.computo_preventivo_drafts values ('${computoDaPreparare}', '${azienda}', '{}');
  `);
  await db.exec(migrazione("20281105370000_preventivo_tiene_il_legame_col_computo.sql"));
  await db.exec(migrazione("20290418120000_commessa_da_computo_con_detrazioni.sql"));
  await db.exec(migrazione("20290507120200_preventivo_analisi_costi.sql"));
  await db.exec(migrazione("20290507120200_preventivo_analisi_costi.sql"));
  await db.exec(migrazione("20290507120500_prepara_commessa_computo_atomic.sql"));
  await db.exec(migrazione("20290507120500_prepara_commessa_computo_atomic.sql"));
}, 30_000);
afterAll(async () => { await db?.close(); });

async function visibilita(modalita: string) {
  await db.query("select set_config('test.mode',$1,false), set_config('test.user',$2,false)", [modalita, azienda]);
  const { rows } = await db.query("select revisione from public.preventivo_analisi_costi order by tipo,revisione");
  return rows;
}

describe("Persistenza privata delle analisi", () => {
  it("applica permessi e flag, congela le revisioni e conserva l’ID commerciale dopo la riscrittura", async () => {
    await db.exec("set role authenticated");
    await visibilita("enabled");
    await db.query("insert into public.preventivo_analisi_costi(company_id,tipo,documento_id,dati) values ($1,'preventivo',$2,$3), ($1,'computo',$4,$3)", [azienda, quote, dati, computo]);
    expect(await visibilita("enabled")).toHaveLength(2);
    expect(await visibilita("disabled")).toEqual([]);
    expect(await visibilita("noprices")).toEqual([]);
    await visibilita("readonly");
    expect((await db.query("update public.preventivo_analisi_costi set versione=2 returning versione")).rows).toEqual([]);
    await visibilita("enabled");
    await expect(db.query("update public.preventivo_analisi_costi set documento_id=$1", [altra])).rejects.toThrow("permission denied");
    await expect(db.query("insert into public.preventivo_analisi_costi(company_id,tipo,documento_id,dati) values ($1,'preventivo',$2,$3)", [altra, quote, dati])).rejects.toThrow("row-level security");
    const articolo = [{ item_type: "service", name: "Posa", quantity: 1, unit_price: 10, analisi_riga_id: altra }];
    await db.query("select public.save_quote_items_atomic($1,$2,$3)", [quote, azienda, JSON.stringify(articolo)]);
    await db.query("select public.save_quote_items_atomic($1,$2,$3)", [quote, azienda, JSON.stringify(articolo)]);
    expect((await db.query("select analisi_riga_id from public.quote_items")).rows).toEqual([{ analisi_riga_id: altra }]);
    await db.exec("reset role");
    await db.query("insert into public.quote_versions values ($1,$2,1,$3)", [azienda, quote, { quote: { subtotal: 10 }, items: articolo }]);
    await db.query("update public.computo_preventivo_drafts set payload=$1 where id=$2", [{ voci: [], revisioni: [{ id: altra, nome: "Offerta inviata" }] }, computo]);
    await db.exec("set role authenticated");
    expect(await visibilita("enabled")).toHaveLength(4);
    expect((await db.query("update public.preventivo_analisi_costi set versione=2 returning revisione")).rows).toEqual([{ revisione: "" }, { revisione: "" }]);
    expect((await db.query("select versione from public.preventivo_analisi_costi where revisione <> ''")).rows).toEqual([{ versione: 1 }, { versione: 1 }]);
  });

  it("trasferisce nella conversione i costi accettati a materiali e lavorazioni, ripartendo una volta quelli comuni", async () => {
    await db.exec("reset role");
    const costo = (nome: string, prezzo: string, base = "totale") => ({ nome, prezzo, base, quantita: "1", fattore: "1" });
    const venduto = [
      { item_type: "service", item_category: "posa", name: "Posa", quantity: 2, unit_price: 25, analisi_riga_id: altra },
      { item_type: "product", item_category: "prodotto", name: "Articolo", quantity: 1, unit_price: 50, analisi_riga_id: computo },
      { item_type: "product", item_category: "prodotto", name: "Alternativa", quantity: 1, unit_price: 99, is_optional: true },
    ];
    await db.query("select public.save_quote_items_atomic($1,$2,$3)", [quote, azienda, JSON.stringify(venduto)]);
    const analisi = { ...dati, voci: { [altra]: [costo("Costo posa", "12,50", "unitaria")], [computo]: [costo("Costo articolo", "30")] },
      generali: [costo("Trasporto", "5")] };
    await db.query("update public.preventivo_analisi_costi set dati=$1 where documento_id=$2 and revisione=''", [analisi, quote]);
    await db.query("update public.quotes set status='accettata',subtotal=100,total=100,version=1 where id=$1", [quote]);
    await db.query("update public.preventivo_analisi_costi set dati=$1 where documento_id=$2 and revisione=''", [dati, quote]);
    const { rows: [articolo] } = await db.query<{ id: string }>("select id from public.quote_items where name='Articolo'");
    const parametri = [quote, { company_id: azienda }, JSON.stringify([{ name: "Articolo", origine_preventivo_id: articolo.id }])];
    await db.exec("set role authenticated");
    await visibilita("enabled");
    const crea = "select public.crea_commessa_preventivo_atomic($1,$2,$3)";
    await db.query(crea, parametri);
    await expect(db.query(crea, parametri)).rejects.toThrow();
    await db.exec("reset role");
    expect((await db.query("select costo_manodopera*quantita costo from public.order_work_phase_voci")).rows).toEqual([{ costo: "27.5000" }]);
    expect((await db.query("select purchase_price from public.order_items")).rows).toEqual([{ purchase_price: "32.5000" }]);
    expect((await db.query("select count(*)::int as righe from public.orders")).rows).toEqual([{ righe: 1 }]);
  });

  it("prepara il computo una sola volta, conserva la versione precedente se una riga fallisce e rispetta i permessi", async () => {
    await db.exec("set role authenticated");
    await visibilita("enabled");
    const testata = {
      quote_number: "COLL-740", title: "Posa campione", client_name: "Cliente prova",
      subtotal: 18.25, vat_amount: 4.02, total: 22.27, prezzo_manuale: 18.25, prezzo_manuale_iva_pct: 22,
      discount_percent: 0, payment_phases: [{ amount: 22.27, percent: 100 }],
      pdf_storage_path: "computo-1.pdf",
    };
    const righe = [{
      name: "Posa", quantity: 1, unit_price: 18.25, codice_prezzario: "POSA-01", prezzo_acquisto: 12,
      custom_field_values: { computo: { capitolo: "Finiture" } },
    }];
    const rpc = "select public.prepara_commessa_computo_atomic($1,$2,$3,$4) as id";
    const args = (head = testata, linee: unknown[] = righe) => [azienda, computoDaPreparare, head, JSON.stringify(linee)];
    const prima = await db.query<{ id: string }>(rpc, args());
    expect(await db.query(rpc, args({ ...testata, quote_number: "NUMERO-DI-UN-ALTRO-INVIO" }))).toMatchObject({ rows: prima.rows });
    const id = prima.rows[0].id;
    await expect(db.query(rpc, args({ ...testata, pdf_storage_path: "computo-incompleto.pdf" }, [{ ...righe[0], name: null }]))).rejects.toThrow();
    expect((await db.query("select pdf_storage_path, total, payment_phases, quote_number from public.quotes where id=$1", [id])).rows).toEqual([
      { pdf_storage_path: "computo-1.pdf", total: "22.27", payment_phases: testata.payment_phases, quote_number: "COLL-740" },
    ]);
    expect((await db.query("select name, codice_prezzario, prezzo_acquisto, custom_field_values from public.quote_items where quote_id=$1", [id])).rows).toEqual([
      { name: "Posa", codice_prezzario: "POSA-01", prezzo_acquisto: "12", custom_field_values: righe[0].custom_field_values },
    ]);
    await expect(db.query(rpc, [altra, ...args().slice(1)])).rejects.toThrow(/permesso/i);
    await visibilita("readonly");
    await expect(db.query(rpc, args())).rejects.toThrow(/permesso/i);
    await visibilita("nocosts");
    await db.query(rpc, args());
    expect((await db.query("select prezzo_acquisto from public.quote_items where quote_id=$1", [id])).rows).toEqual([{ prezzo_acquisto: null }]);
    await visibilita("enabled");
    await db.query("update public.quotes set signed_at=now() where id=$1", [id]);
    await expect(db.query(rpc, args())).rejects.toThrow(/già stato deciso/i);
    await db.exec("reset role");
    expect((await db.query("select count(*)::int as n from public.quotes where source=$1", ["modulo:computo:" + computoDaPreparare])).rows).toEqual([{ n: 1 }]);
  });
});
