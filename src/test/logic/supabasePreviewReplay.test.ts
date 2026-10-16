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
        await db.query<{ qual: string }>(
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
      create table signature_requests(id uuid primary key,tipo_documento text);
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
      "20260703132132_fea_fix_fv_tipo_documento_and_audit_insert",
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
    await db.exec(`create function check_staff_visibility(uuid,uuid) returns boolean language sql stable as $$select true$$;
      create function is_super_admin() returns boolean language sql stable as $$select false$$;
      create table sr_progetti(id uuid,company_id uuid,created_by uuid,consulente_id uuid);
      create table rst_progetti(id uuid,company_id uuid,created_by uuid);
      create table bgn_progetti(id uuid,company_id uuid,created_by uuid);
      create table tet_progetti(id uuid,company_id uuid,created_by uuid);
      create table clm_progetti(id uuid,company_id uuid,created_by uuid);
      create table ele_progetti(id uuid,company_id uuid,created_by uuid);
      create table idr_progetti(id uuid,company_id uuid,created_by uuid);
      create table pav_progetti(id uuid,company_id uuid,created_by uuid);
      create table pis_progetti(id uuid,company_id uuid,created_by uuid);`);
    await db.exec(migration("20260713131656_cestino_preventivi_30gg"));
    await db.exec(
      migration("20260713133837_preventivi_only_assigned_visibilita"),
    );
    const feaFoundation = migration("20260818000001_fea_documenti_sistema");
    const policyStart = feaFoundation.indexOf(
      "-- Completa la policy audit autenticata rinviata da luglio 2026.",
    );
    expect(policyStart).toBeGreaterThan(0);
    await db.exec("alter table fea_audit_log enable row level security");
    await db.exec(feaFoundation.slice(policyStart));
    expect(
      (
        await db.query(
          "select roles = array['authenticated']::name[] as restricted from pg_policies where tablename='fea_audit_log' and policyname='fea_audit_insert'",
        )
      ).rows,
    ).toEqual([{ restricted: true }]);
    await db.exec(migration("20261027120000_fv_modulo_wave1"));
    expect(
      (
        await db.query<{ qual: string }>(
          "select qual from pg_policies where tablename='fv_progetti' and policyname='co_fv_progetti_all'",
        )
      ).rows[0].qual,
    ).toContain("check_staff_visibility");
    expect(
      (
        await db.query(
          "select column_name from information_schema.columns where table_name='fv_progetti' and column_name='deleted_at'",
        )
      ).rows,
    ).toHaveLength(1);
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

it("completa il seed delle fonti normative e il riepilogo per categoria", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth;create table auth.users(id uuid primary key);
      create table companies(id uuid primary key);create table ai_brain_documents(id uuid primary key);`);
    const foundation = readFileSync(
      "supabase/migrations/20260508250000_kb_multilang_and_external_sources.sql",
      "utf8",
    );
    const ddl = foundation.match(
      /CREATE TABLE IF NOT EXISTS public.ai_kb_external_sources\s*\([\s\S]*?\n\);/,
    );
    expect(ddl).not.toBeNull();
    await db.exec(ddl![0]);
    await db.exec(
      readFileSync(
        "supabase/migrations/20260509220000_kb_seed_external_sources_ue.sql",
        "utf8",
      ),
    );
    expect(
      (await db.query("select name from ai_kb_external_sources")).rows,
    ).toHaveLength(5);
  } finally {
    await db.close();
  }
}, 60000);

it("ricostruisce il client email prima del catalogo legacy dei flag", async () => {
  const db = new PGlite();
  const ddl = (path: string, table: string) => {
    const match = readFileSync(`supabase/migrations/${path}.sql`, "utf8").match(
      new RegExp(
        `CREATE TABLE(?: IF NOT EXISTS)? (?:public\\.)?${table}\\s*\\([\\s\\S]*?\\n\\);`,
      ),
    );
    expect(match, table).not.toBeNull();
    return match![0];
  };
  try {
    await db.exec(`create schema auth; create schema storage; create role authenticated;create role service_role;
      create type app_role as enum ('company_admin','super_admin');
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create function get_my_company_id() returns uuid language sql stable as $$select null::uuid$$;
      create function is_super_admin() returns boolean language sql stable as $$select false$$;
      create function has_role(uuid,app_role) returns boolean language sql stable as $$select false$$;
      create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
      create table auth.users(id uuid primary key);create table companies(id uuid primary key,name text);
      create table profiles(id uuid primary key,company_id uuid);create table orders(id uuid primary key);
      create table user_roles(user_id uuid,role text);create table ai_action_proposals(id uuid primary key);
      create table platform_feature_flags(key text primary key,name text,description text,category text,is_beta boolean,default_value boolean,sort_order int,icon text);
      create table company_feature_overrides(company_id uuid,feature_key text,is_enabled boolean,override_reason text,override_by uuid,unique(company_id,feature_key));
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);create table storage.objects(bucket_id text,name text);`);
    await db.exec(
      ddl(
        "20260223070844_72a46932-5604-41ae-97de-f8f3d84abf18",
        "email_folders",
      ),
    );
    await db.exec(ddl("20260510030000_email_triage_inbox", "email_inbox"));
    await db.exec(
      ddl("20260510050000_email_oauth_connections", "email_oauth_connections"),
    );
    // La fondazione inbox precedente abilita RLS dopo la CREATE TABLE.
    await db.exec("alter table email_inbox enable row level security");
    await db.exec(
      readFileSync(
        "supabase/migrations/20260510100000_email_client_foundations.sql",
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20260709100000_feature_flags_admin.sql",
        "utf8",
      ),
    );
    expect(
      (
        await db.query(
          "select default_value from feature_flags where key='email_client'",
        )
      ).rows,
    ).toEqual([{ default_value: false }]);
    expect(
      (
        await db.query(
          "select relrowsecurity from pg_class where oid='email_inbox'::regclass",
        )
      ).rows[0],
    ).toEqual({ relrowsecurity: true });
    expect(
      (
        await db.query(
          "select policyname from pg_policies where tablename='email_threads' and policyname='email_threads_owner'",
        )
      ).rows,
    ).toHaveLength(1);
  } finally {
    await db.close();
  }
}, 60000);

it("le copie anticipate di viste e firma attendono le fondazioni dei verticali", async () => {
  const db = new PGlite();
  try {
    for (const name of [
      "20260604042649_signature_requests_fv_progetto",
      "20260616064141_v_preventivi_unificati",
      "20260616194437_v_preventivi_unificati_rst",
      "20260620134206_opportunity_value_autosync_from_preventivi",
      "20260622133211_v_preventivi_unificati_completa",
    ]) {
      await db.exec(readFileSync(`supabase/migrations/${name}.sql`, "utf8"));
    }
    await db.exec(
      "create table signature_requests(id uuid primary key,company_id uuid);create table fv_progetti(id uuid primary key)",
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20260604042649_signature_requests_fv_progetto.sql",
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20270618030000_signature_requests_fv_progetto.sql",
        "utf8",
      ),
    );
    expect(
      (
        await db.query(
          "select conname from pg_constraint where conrelid='signature_requests'::regclass and contype='f'",
        )
      ).rows,
    ).toHaveLength(1);
  } finally {
    await db.close();
  }
}, 60000);

it("attiva il flag serramenti solo se esiste la demo destinataria", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create table companies(id uuid primary key);create table company_feature_overrides(company_id uuid references companies(id),feature_key text,is_enabled boolean,override_reason text,notes text,updated_at timestamptz,unique(company_id,feature_key))`,
    );
    const seed = readFileSync(
      "supabase/migrations/20260511190000_sr_enable_demo_company.sql",
      "utf8",
    );
    await db.exec(seed);
    expect(
      (await db.query("select * from company_feature_overrides")).rows,
    ).toHaveLength(0);
    await db.exec(
      "insert into companies values ('778a2c76-1253-49f2-a5e8-283363ac3e29')",
    );
    await db.exec(seed);
    await db.exec(seed);
    expect(
      (await db.query("select is_enabled from company_feature_overrides")).rows,
    ).toEqual([{ is_enabled: true }]);
  } finally {
    await db.close();
  }
}, 60000);

it("inizializza i cataloghi render protetti prima dei relativi seed", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth;create role authenticated;create type app_role as enum ('super_admin');
   create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
   create function has_role(uuid,app_role) returns boolean language sql stable as $$select false$$;
   create table platform_settings(key text primary key,value text);`);
    for (const file of [
      "20260515072000_render_provider_gemini_openrouter_openai_chain",
      "20260515080000_fix_openrouter_openai_image_model",
    ]) {
      await db.exec(readFileSync(`supabase/migrations/${file}.sql`, "utf8"));
    }
    expect(
      (
        await db.query(
          "select relname,relrowsecurity from pg_class where relname in ('render_provider_config','render_provider_pricing') order by relname",
        )
      ).rows,
    ).toEqual([
      { relname: "render_provider_config", relrowsecurity: true },
      { relname: "render_provider_pricing", relrowsecurity: true },
    ]);
    expect(
      (
        await db.query(
          "select value from platform_settings where key='render_default_provider'",
        )
      ).rows,
    ).toEqual([{ value: "gemini" }]);
    expect(
      (
        await db.query(
          "select provider_key from render_provider_config where is_default=true",
        )
      ).rows,
    ).toEqual([{ provider_key: "gemini" }]);
  } finally {
    await db.close();
  }
}, 60000);

it("il backfill compensi supporta anche lo schema precedente a compensation_mode", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth;create role authenticated;create type app_role as enum ('super_admin');
   create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
   create function has_role(uuid,app_role) returns boolean language sql stable as $$select false$$;
   create function has_permission(uuid,text) returns boolean language sql stable as $$select false$$;
   create function get_user_company_id(uuid) returns uuid language sql stable as $$select null::uuid$$;
   create function update_updated_at_column() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
   create table auth.users(id uuid primary key);create table companies(id uuid primary key);
   create table orders(id uuid primary key,company_id uuid);
   create table salespeople(id uuid primary key,company_id uuid,first_name text,last_name text,email text,phone text,commission_type text,commission_value numeric,is_active boolean);
   create table order_salespeople(id uuid primary key,order_id uuid,salesperson_id uuid,commission_type text,commission_value numeric,commission_amount numeric,deduction_amount numeric,is_paid boolean,payment_expected_date date,paid_date date);
   insert into companies values ('10000000-0000-4000-8000-000000000001');
   insert into salespeople values ('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Mario','Rossi',null,null,'fixed',10,true);`);
    const migration = readFileSync(
      "supabase/migrations/20260523131000_variable_compensation_foundation.sql",
      "utf8",
    );
    await db.exec(migration);
    expect(
      (
        await db.query(
          "select metadata->>'compensation_mode' as mode from compensation_beneficiaries",
        )
      ).rows,
    ).toEqual([{ mode: "only_commission" }]);
    await db.exec(
      "alter table salespeople add column compensation_mode text;insert into salespeople values ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Anna','Verdi',null,null,'fixed',20,true,'fixed_only')",
    );
    await db.exec(migration);
    expect(
      (
        await db.query(
          "select metadata->>'compensation_mode' as mode from compensation_beneficiaries order by source_id",
        )
      ).rows,
    ).toEqual([{ mode: "only_commission" }, { mode: "fixed_only" }]);
  } finally {
    await db.close();
  }
}, 60000);

it("completa profilo contratto e ambito modelli quando vengono create le tabelle fasi", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth;create role authenticated;create role anon;
   create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
   create function has_permission_for_company(uuid,text,uuid) returns boolean language sql stable as $$select false$$;
   create function utente_bloccato() returns boolean language sql stable as $$select false$$;
   create table companies(id uuid primary key);create table orders(id uuid primary key,company_id uuid);`);
    const profile = readFileSync(
      "supabase/migrations/20261016114116_company_contract_workflow_profile.sql",
      "utf8",
    );
    const scope = readFileSync(
      "supabase/migrations/20261016120017_contract_template_scope.sql",
      "utf8",
    );
    await db.exec(profile);
    await db.exec(scope);
    await db.exec(
      readFileSync(
        "supabase/migrations/20281007140000_modelli_fasi_azienda.sql",
        "utf8",
      ),
    );
    await db.exec(profile);
    await db.exec(scope);
    await db.exec(
      "insert into companies values ('10000000-0000-4000-8000-000000000001');insert into company_fasi_settings(company_id) values ('10000000-0000-4000-8000-000000000001');insert into work_phase_templates(company_id,name) values ('10000000-0000-4000-8000-000000000001','Standard')",
    );
    expect(
      (
        await db.query(
          "select contract_workflow_profile from company_fasi_settings",
        )
      ).rows,
    ).toEqual([{ contract_workflow_profile: "standard" }]);
    expect(
      (await db.query("select template_scope from work_phase_templates")).rows,
    ).toEqual([{ template_scope: "cantiere" }]);
    expect(
      (
        await db.query(
          "select has_table_privilege('authenticated','work_phase_templates','insert') as allowed",
        )
      ).rows,
    ).toEqual([{ allowed: false }]);
    expect(
      (
        await db.query(
          "select relrowsecurity from pg_class where oid='work_phase_templates'::regclass",
        )
      ).rows,
    ).toEqual([{ relrowsecurity: true }]);
  } finally {
    await db.close();
  }
}, 60000);

it("conferma accountant prima delle policy dell’audit, senza assegnare ruoli", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth;create schema cron;create role authenticated;
   create type app_role as enum ('super_admin','company_admin','subcontractor');
   create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
   create function get_user_company_id(uuid) returns uuid language sql stable as $$select null::uuid$$;
   create function has_role(uuid,app_role) returns boolean language sql stable as $$select false$$;
   create function has_permission(uuid,text) returns boolean language sql stable as $$select false$$;
   create function get_dashboard_kpis(uuid,timestamptz,timestamptz,uuid) returns int language sql volatile as $$select 1$$;
   create table cron.job(jobid bigint,jobname text);create table invoices(id uuid,company_id uuid);create table user_roles(user_id uuid,role app_role);`);
    await db.exec(
      readFileSync(
        "supabase/migrations/20260527122753_db_perf_stable_dedup_indexes.sql",
        "utf8",
      ),
    );
    const audit = readFileSync(
      "supabase/migrations/20260527135644_rls_hardening_audit_2026_05_27.sql",
      "utf8",
    );
    await db.exec(`create function get_my_company_id() returns uuid language sql stable as $$select null::uuid$$;
      create function check_staff_visibility(uuid,uuid) returns boolean language sql stable as $$select false$$;
      create table companies(id uuid primary key);create table ai_model_config(company_id uuid);
      create table invoice_lines(invoice_id uuid);create table invoice_payments(company_id uuid);
      create table customer_documents(company_id uuid);
      create table customer_messages(company_id uuid,sender_role text,sender_id uuid);
      create table contact_messages(company_id uuid,sent_by uuid);create table profiles(id uuid,company_id uuid);
      create table employees(id uuid,user_id uuid);create table expense_reports(id uuid,company_id uuid,employee_id uuid);
      create table expense_report_items(report_id uuid);create table appointments(company_id uuid,assigned_to uuid);
      create table cedolini(id uuid);create table hr_assenze(employee_id uuid);`);
    await db.exec(audit);
    const customer = readFileSync(
      "supabase/migrations/20270526200000_customer_os_data_layer.sql",
      "utf8",
    );
    const tableStart = customer.indexOf(
      "CREATE TABLE IF NOT EXISTS public.customer_interactions",
    );
    const tableEnd = customer.indexOf(
      "-- INSERT solo via service_role",
      tableStart,
    );
    expect(tableStart).toBeGreaterThan(0);
    expect(tableEnd).toBeGreaterThan(tableStart);
    await db.exec(customer.slice(tableStart, tableEnd));
    expect(
      (
        await db.query<{ qual: string }>(
          "select qual from pg_policies where tablename='customer_interactions' and policyname='customer_interactions_select'",
        )
      ).rows[0].qual,
    ).toContain("check_staff_visibility");
    expect(
      (
        await db.query(
          "select policyname from pg_policies where tablename='customer_interactions' and policyname='interactions_company_select'",
        )
      ).rows,
    ).toHaveLength(0);

    expect(
      (
        await db.query(
          "select policyname from pg_policies where policyname='invoices_billing_view'",
        )
      ).rows,
    ).toHaveLength(1);
    const people = readFileSync(
      "supabase/migrations/20260815000001_persone_accessi_redesign.sql",
      "utf8",
    );
    const worker = people.match(
      /ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'worker'[^;]*;/,
    );
    expect(worker).not.toBeNull();
    await db.exec(worker![0]);
    expect(
      (
        await db.query(
          "select enumlabel from pg_enum where enumtypid='app_role'::regtype order by enumsortorder",
        )
      ).rows.map((row: { enumlabel: string }) => row.enumlabel),
    ).toEqual([
      "super_admin",
      "company_admin",
      "subcontractor",
      "worker",
      "accountant",
    ]);
    expect((await db.query("select * from user_roles")).rows).toHaveLength(0);
  } finally {
    await db.close();
  }
}, 60000);

it("gli indici storici attendono le colonne e restano idempotenti", async () => {
  const db = new PGlite();
  try {
    const migration = readFileSync(
      "supabase/migrations/20260527203601_db_perf_missing_fk_indexes.sql",
      "utf8",
    );
    await db.exec(migration);
    await db.exec(`create table order_events(actor_id uuid);create table hr_talent_answers(company_id uuid,question_id uuid,assessment_version uuid);
   create table profiles(blocked_by uuid);create table company_activity_log(brain_doc_id uuid,actor_user_id uuid);`);
    await db.exec(migration);
    await db.exec(migration);
    expect(
      (
        await db.query(
          "select indexname from pg_indexes where schemaname='public'",
        )
      ).rows,
    ).toHaveLength(7);
  } finally {
    await db.close();
  }
}, 60000);

it("l’initplan modifica solo policy esistenti e conserva l’isolamento del servizio", async () => {
  const db = new PGlite();
  try {
    const migration = readFileSync(
      "supabase/migrations/20260605082009_rls_initplan_perf.sql",
      "utf8",
    );
    await db.exec(migration);
    await db.exec(`create role authenticated;create role service_role;
   create table referral_signup_attempts(id int);insert into referral_signup_attempts values (1);
   alter table referral_signup_attempts enable row level security;
   create policy service_role_all_access on referral_signup_attempts for all
    using(current_setting('role',true)='service_role') with check(current_setting('role',true)='service_role');
   grant select on referral_signup_attempts to authenticated,service_role;`);
    await db.exec(migration);
    await db.exec("set role authenticated");
    expect(
      (await db.query("select * from referral_signup_attempts")).rows,
    ).toHaveLength(0);
    await db.exec("set role service_role");
    expect(
      (await db.query("select * from referral_signup_attempts")).rows,
    ).toEqual([{ id: 1 }]);
    expect(
      JSON.stringify(
        (
          await db.query(
            "explain (format json) select * from referral_signup_attempts",
          )
        ).rows,
      ),
    ).toContain("InitPlan");
    await db.exec("reset role");
  } finally {
    await db.close();
  }
}, 60000);
