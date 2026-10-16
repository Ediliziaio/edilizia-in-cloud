import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
const dedup = readFileSync(
  "supabase/migrations/20260506090300_entity_attachments_dedup.sql",
  "utf8",
);
const foundation = readFileSync(
  "supabase/migrations/20270103000000_document_linker_foundation.sql",
  "utf8",
);

it("ricostruisce gli allegati in ordine cronologico, mantiene RLS e impedisce nuovi duplicati", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth; create role authenticated;
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create function public.has_role(uuid,text) returns boolean language sql stable as $$select false$$;
      create table public.companies(id uuid primary key);
      create table auth.users(id uuid primary key);
      create table public.profiles(id uuid, company_id uuid);
      create table public.multi_company_access(user_id uuid, company_id uuid);`);
    // Run both complete files, in the same order as a new Supabase branch.
    await db.exec(dedup);
    expect(
      (
        await db.query(
          "select to_regclass('public.entity_attachments') as table_name",
        )
      ).rows[0],
    ).toEqual({ table_name: null });
    await db.exec(foundation);
    const company = "10000000-0000-4000-8000-000000000001";
    const user = "10000000-0000-4000-8000-000000000002";
    await db.exec(
      `insert into companies values ('${company}'); insert into auth.users values ('${user}');`,
    );
    const insert = `insert into entity_attachments(company_id,entity_table,entity_id,storage_path,file_name,attached_by)
      values ('${company}','orders','${user}','file.pdf','file.pdf','${user}')`;
    await db.exec(insert);
    await expect(db.exec(insert)).rejects.toMatchObject({ code: "23505" });
    // Soft deleted versions do not prevent attaching the same file again.
    await db.exec("update entity_attachments set deleted_at=now()");
    await db.exec(insert);
    await db.exec(dedup);
    await db.exec(foundation);
    expect(
      (
        await db.query(
          "select id from entity_attachments where deleted_at is null",
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select relrowsecurity from pg_class where oid='entity_attachments'::regclass",
        )
      ).rows[0],
    ).toEqual({ relrowsecurity: true });
  } finally {
    await db.close();
  }
}, 60000);

it("deduplica una tabella preesistente senza eliminare lo storico né unire aziende diverse", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table entity_attachments(id uuid,company_id uuid,entity_table text,entity_id uuid,storage_path text,attached_at timestamptz,deleted_at timestamptz,deleted_by uuid);
      insert into entity_attachments values
        ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000010','orders','10000000-0000-4000-8000-000000000020','file.pdf',now(),null,null),
        ('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000010','orders','10000000-0000-4000-8000-000000000020','file.pdf',now()-interval '1 day',null,null),
        ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000011','orders','10000000-0000-4000-8000-000000000020','file.pdf',now(),null,null);`);
    await db.exec(dedup);
    expect(
      (await db.query("select id from entity_attachments")).rows,
    ).toHaveLength(3);
    expect(
      (
        await db.query(
          "select id from entity_attachments where deleted_at is null order by id",
        )
      ).rows,
    ).toEqual([
      { id: "10000000-0000-4000-8000-000000000001" },
      { id: "10000000-0000-4000-8000-000000000003" },
    ]);
    await db.exec(dedup);
    expect(
      (
        await db.query(
          "select id from entity_attachments where deleted_at is null",
        )
      ).rows,
    ).toHaveLength(2);
  } finally {
    await db.close();
  }
}, 60000);

// Tenant-specific catalogue data is optional when rebuilding an empty branch.
it("il seed del listino non richiede aziende di produzione e non usa altre aziende", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create table companies(id uuid primary key, name text, created_at timestamptz default now())",
    );
    const seed = readFileSync(
      "supabase/migrations/20260506090500_seed_listino_piu_luce_kebei.sql",
      "utf8",
    );
    await db.exec(seed);
    await db.exec(
      "insert into companies(id,name) values (gen_random_uuid(),'Altra azienda')",
    );
    await db.exec(seed);
    expect((await db.query("select name from companies")).rows).toEqual([
      { name: "Altra azienda" },
    ]);
  } finally {
    await db.close();
  }
}, 60000);

it("ricostruisce anche le estensioni cedolini prima della relativa tabella base", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
      create type app_role as enum ('company_admin','super_admin');
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create function public.has_role(uuid,app_role) returns boolean language sql stable as $$select false$$;
      create function public.get_my_company_id() returns uuid language sql stable as $$select null::uuid$$;
      create table auth.users(id uuid primary key);
      create table companies(id uuid primary key);
      create table employees(id uuid primary key,company_id uuid,user_id uuid);
      create table profiles(id uuid,company_id uuid);`);
    await db.exec(
      readFileSync(
        "supabase/migrations/20260506093500_cedolini_presenze_auto.sql",
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20260916000015_create_hr_cedolini.sql",
        "utf8",
      ),
    );
    expect(
      (
        await db.query(
          "select column_name from information_schema.columns where table_name='hr_cedolini' and column_name in ('generation_method','validation_warnings','ore_ordinarie')",
        )
      ).rows,
    ).toHaveLength(3);
    expect(
      (
        await db.query(
          "select indexname from pg_indexes where indexname='idx_cedolini_pending_review'",
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select relrowsecurity from pg_class where oid='hr_cedolini'::regclass",
        )
      ).rows[0],
    ).toEqual({ relrowsecurity: true });
  } finally {
    await db.close();
  }
}, 60000);

it("le policy commesse attendono gli helper magazzino senza perdere i vincoli di accesso", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth; create role authenticated;
      create type app_role as enum ('company_admin','super_admin');
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create function public.has_role(uuid,app_role) returns boolean language sql stable as $$select false$$;
      create function public.get_my_company_id() returns uuid language sql stable as $$select null::uuid$$;
      create function public.get_user_company_id(uuid) returns uuid language sql stable as $$select null::uuid$$;
      create function public.get_order_customer_id(uuid) returns uuid language sql stable as $$select null::uuid$$;
      create function public.get_order_company_id(uuid) returns uuid language sql stable as $$select null::uuid$$;
      create table orders(id uuid primary key,company_id uuid);
      create table employees(id uuid,user_id uuid);
      create table salespeople(id uuid,user_id uuid);
      create table order_employees(order_id uuid,employee_id uuid);
      create table order_salespeople(order_id uuid,salesperson_id uuid);
      create table order_items(order_id uuid);`);
    const fix = readFileSync(
      "supabase/migrations/20260506095300_critical_rls_recursion_fix.sql",
      "utf8",
    );
    await db.exec(fix);
    expect(
      (
        await db.query(
          "select to_regprocedure('order_has_item_in_my_warehouse(uuid)') as helper",
        )
      ).rows[0],
    ).toEqual({ helper: null });
    await db.exec(`alter table order_items add column destination_warehouse_id uuid;
      create function get_my_warehouse_ids() returns uuid[] language sql stable as $$select array['10000000-0000-4000-8000-000000000010'::uuid]$$;
      create function is_warehouse_user() returns boolean language sql stable as $$select true$$;`);
    const warehouse = readFileSync(
      "supabase/migrations/20260921000001_warehouse_assignments_and_rls.sql",
      "utf8",
    );
    const start = warehouse.indexOf(
      "CREATE OR REPLACE FUNCTION public.order_has_item_in_my_warehouse",
    );
    const end = warehouse.indexOf(
      "-- ============================================================================\n-- 3.3",
      start,
    );
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    await db.exec(warehouse.slice(start, end));
    await db.exec(fix);
    await db.exec(
      `insert into order_items values ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000010'),('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000011')`,
    );
    expect(
      (
        await db.query(
          "select order_has_item_in_my_warehouse('10000000-0000-4000-8000-000000000001') as assigned,order_has_item_in_my_warehouse('10000000-0000-4000-8000-000000000002') as other",
        )
      ).rows[0],
    ).toEqual({ assigned: true, other: false });
    expect(
      (
        await db.query(
          "select qual from pg_policies where policyname='orders_warehouse_user_view'",
        )
      ).rows[0].qual,
    ).toContain("company_id = get_my_company_id()");
  } finally {
    await db.close();
  }
}, 60000);

it("ricostruisce il computo con le colonne di abbinamento e le policy aziendali", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth; create schema storage;
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
      create table auth.users(id uuid primary key);
      create table companies(id uuid primary key);
      create table profiles(id uuid,company_id uuid);
      create table quotes(id uuid primary key);
      create table quote_items(id uuid primary key);
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(bucket_id text,name text);`);
    await db.exec(
      readFileSync(
        "supabase/migrations/20260508140000_computo_voci_match_columns.sql",
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20260915000001_computo_metrico_ai.sql",
        "utf8",
      ),
    );
    expect(
      (
        await db.query(
          "select column_name from information_schema.columns where table_name='computo_voci_estratte' and column_name in ('matched_template_id','matched_family_id','match_confidence')",
        )
      ).rows,
    ).toHaveLength(3);
    expect(
      (
        await db.query(
          "select relrowsecurity from pg_class where oid='computo_voci_estratte'::regclass",
        )
      ).rows[0],
    ).toEqual({ relrowsecurity: true });
    expect(
      (
        await db.query(
          "select policyname from pg_policies where tablename='computo_voci_estratte'",
        )
      ).rows,
    ).toHaveLength(4);
  } finally {
    await db.close();
  }
}, 60000);

it("ricostruisce le estensioni successive di FV, bundle, SMS e audit firma", async () => {
  const db = new PGlite();
  const migration = (name: string) =>
    readFileSync(`supabase/migrations/${name}.sql`, "utf8");
  const tableDDL = (sql: string, name: string) => {
    const match = sql.match(
      new RegExp(
        `CREATE TABLE(?: IF NOT EXISTS)? (?:public\\.)?${name}\\s*\\([\\s\\S]*?\\n\\);`,
      ),
    );
    expect(match, name).not.toBeNull();
    return match![0];
  };
  try {
    await db.exec(`create schema auth; create schema storage; create schema cron;
      create role authenticated; create role service_role;
      create type app_role as enum ('company_admin','super_admin');
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create function has_role(uuid,app_role) returns boolean language sql stable as $$select false$$;
      create function get_my_company_id() returns uuid language sql stable as $$select null::uuid$$;
      create function get_effective_company_id() returns uuid language sql stable as $$select null::uuid$$;
      create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
      create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
      create function cron.unschedule(text) returns boolean language sql as $$select true$$;
      create table cron.job(jobname text);
      create table auth.users(id uuid primary key);
      create table companies(id uuid primary key);
      create table marketing_contacts(id uuid primary key,first_name text,last_name text);
      create table marketing_opportunities(id uuid primary key);
      create table orders(id uuid primary key);
      create table article_families(id uuid primary key);
      create table article_templates(id uuid primary key);
      create table articoli_native(id uuid primary key,company_id uuid);
      create table tariffe_aziendali(id uuid primary key);
      create table signature_requests(id uuid primary key);
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(bucket_id text,name text);`);
    const hardening = migration(
      "20260527135644_rls_hardening_audit_2026_05_27",
    );
    const block = hardening.match(
      /DO \$fv_logs_dependency\$[\s\S]*?END \$fv_logs_dependency\$;/,
    );
    expect(block).not.toBeNull();
    await db.exec(block![0]);
    for (const name of [
      "20260620063026_fv_progetti_dati_tetto",
      "20260620063036_fv_perdita_ombreggiamento",
      "20260628142253_fv_progetti_modalita_pagamento",
      "20260628172238_fv_componenti_bundle_immagini",
      "20260703162839_fv_sconto_e_link_listino",
      "20260704061843_fv_template_usp_cronoprogramma",
      "20260613043724_adjust_credits_atomic_sms_support",
      "20260703125722_fea_p1_audit_restrict_and_expiry",
    ]) {
      await db.exec(migration(name));
    }
    await db.exec(migration("20260708000000_sconti_quantita_bundle"));
    await db.exec(
      tableDDL(
        migration("20260816000001_sms_telnyx_wallet"),
        "sms_wallet_transazioni",
      ),
    );
    await db.exec(
      tableDDL(
        migration("20260818000001_fea_documenti_sistema"),
        "fea_audit_log",
      ),
    );
    await db.exec(migration("20261027120000_fv_modulo_wave1"));
    expect(
      (
        await db.query(
          "select column_name from information_schema.columns where table_name='fv_progetti' and column_name in ('layout_tetto','modalita_pagamento','sconto_valore','perdita_ombreggiamento_pct')",
        )
      ).rows,
    ).toHaveLength(4);
    expect(
      (
        await db.query(
          "select column_name from information_schema.columns where table_name='fv_template_pdf' and column_name in ('usp','cronoprogramma')",
        )
      ).rows,
    ).toHaveLength(2);
    expect(
      (
        await db.query(
          "select column_name from information_schema.columns where table_name='bundle_voci' and column_name='immagine_url'",
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select relrowsecurity from pg_class where oid='fv_function_logs'::regclass",
        )
      ).rows[0],
    ).toEqual({ relrowsecurity: true });
    expect(
      (
        await db.query(
          "select policyname from pg_policies where tablename='fv_function_logs'",
        )
      ).rows,
    ).toHaveLength(2);
    expect(
      (
        await db.query(
          "select confdeltype from pg_constraint where conname='fea_audit_log_request_id_fkey'",
        )
      ).rows[0],
    ).toEqual({ confdeltype: "r" });
    await db.exec(
      "insert into companies values ('10000000-0000-4000-8000-000000000001'); insert into sms_wallet_transazioni(company_id,tipo,importo,saldo_dopo,descrizione) values ('10000000-0000-4000-8000-000000000001','rettifica_admin',1,1,'Verifica')",
    );
    expect(
      (await db.query("select tipo from sms_wallet_transazioni")).rows,
    ).toEqual([{ tipo: "rettifica_admin" }]);
  } finally {
    await db.close();
  }
}, 60000);

it("crea il Test Lab prima della policy di maggio senza richiedere l’azienda demo", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth; create role authenticated; create role service_role;
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create function is_silvio_superadmin(uuid default auth.uid()) returns boolean language sql stable as $$select false$$;
      create table auth.users(id uuid primary key);
      create table companies(id uuid primary key);
      create table profiles(id uuid,company_id uuid);`);
    await db.exec(
      readFileSync(
        "supabase/migrations/20260509200000_ai_admin_restructure_fixes.sql",
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20270309000000_ai_test_lab_demo_only.sql",
        "utf8",
      ),
    );
    expect(
      (
        await db.query(
          "select relrowsecurity from pg_class where oid='ai_test_runs'::regclass",
        )
      ).rows[0],
    ).toEqual({ relrowsecurity: true });
    expect(
      (
        await db.query(
          "select policyname from pg_policies where policyname='ai_test_runs_select_v2'",
        )
      ).rows,
    ).toHaveLength(1);
    expect((await db.query("select * from ai_test_quota")).rows).toHaveLength(
      0,
    );
    expect((await db.query("select * from companies")).rows).toHaveLength(0);
  } finally {
    await db.close();
  }
}, 60000);
