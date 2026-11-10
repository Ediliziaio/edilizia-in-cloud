import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";

const sql = readFileSync(
  resolve("supabase/migrations/20260530050213_sa_intel_helpers.sql"),
  "utf8",
);
const db = new PGlite();
const company = "20000000-0000-4000-a000-000000000001";
beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE TABLE internal_chat_channels (
      id uuid PRIMARY KEY, is_system boolean, is_dm boolean, dm_user_ids uuid[]
    );
    CREATE TABLE internal_chat_messages (
      channel_id uuid, company_id uuid, sender_id uuid,
      content text, created_at timestamptz DEFAULT now()
    );
  `);
});
afterAll(() => db.close());

it("ricostruisce gli helper prima della migrazione di luglio e preserva il filtro dei messaggi", async () => {
  await db.exec(sql);
  await db.exec(`
    INSERT INTO internal_chat_channels VALUES
      ('30000000-0000-4000-a000-000000000001',true,true,
        ARRAY['00000000-0000-0000-0000-000000000002']::uuid[]);
    INSERT INTO internal_chat_messages(channel_id,company_id,sender_id,content,message_type) VALUES
      ('30000000-0000-4000-a000-000000000001','${company}','40000000-0000-4000-a000-000000000001','Testo del cliente','text'),
      ('30000000-0000-4000-a000-000000000001','${company}','40000000-0000-4000-a000-000000000001','Foto','image'),
      ('30000000-0000-4000-a000-000000000001','${company}','00000000-0000-0000-0000-000000000002','Risposta Silvio','text');
  `);
  expect(
    (await db.query("select * from sa_companies_with_recent_silvio_msgs()"))
      .rows,
  ).toEqual([{ company_id: company }]);
  expect(
    (
      await db.query("select * from sa_recent_silvio_user_messages($1)", [
        company,
      ])
    ).rows,
  ).toEqual([{ content: "Testo del cliente" }]);
  expect(
    (
      await db.query(
        "select has_function_privilege('authenticated','sa_recent_silvio_user_messages(uuid,int,int)','execute') as allowed",
      )
    ).rows,
  ).toEqual([{ allowed: false }]);
});

it("è ripetibile su un ambiente che possiede già il campo senza perdere contenuti", async () => {
  await db.exec(sql);
  expect(
    (
      await db.query("select * from sa_recent_silvio_user_messages($1)", [
        company,
      ])
    ).rows,
  ).toEqual([{ content: "Testo del cliente" }]);
});
