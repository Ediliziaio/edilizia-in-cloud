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
