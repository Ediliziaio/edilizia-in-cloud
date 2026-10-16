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
