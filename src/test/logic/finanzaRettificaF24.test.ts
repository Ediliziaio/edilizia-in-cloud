import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";

const azienda = "a0000000-0000-4000-a000-000000000001";
const migration = readFileSync("supabase/migrations/20290423101000_finanza_liquidazione_f24.sql", "utf8");
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth;
    create function auth.uid() returns uuid language sql as $$select '${azienda}'::uuid$$;
    create function public.user_can_access_company(uuid) returns boolean language sql as $$select $1=auth.uid()$$;
    create function public.e_amministratore_di(uuid) returns boolean language sql as $$select $1=auth.uid()$$;
    create function public.user_can_write_accountant_company(uuid) returns boolean language sql as $$select false$$;
    create function public.utente_sola_lettura(uuid) returns boolean language sql as $$select false$$;
    create function public.has_role(uuid,text) returns boolean language sql as $$select false$$;
    create function public.giorno_lavorativo_successivo(date) returns date language sql as
      $$select $1 + case extract(dow from $1) when 6 then 2 when 0 then 1 else 0 end$$;
    create table public.fiscal_reports(
      id uuid primary key default gen_random_uuid(), company_id uuid, report_type text, period_start date,
      period_end date, status text, data_summary jsonb, ade_protocol_number text, updated_at timestamptz);
    create table public.f24_entries(
      id uuid primary key default gen_random_uuid(), company_id uuid, anno int, mese int, tributo_code text,
      tributo_descrizione text, importo numeric, stato text, data_scadenza date, data_pagamento date,
      note text, pdf_url text, created_at timestamptz, updated_at timestamptz, unique(company_id,anno,mese,tributo_code));
    create table public.fattura_allegati(company_id uuid, f24_entry_id uuid);
    create table public.test_calcolo(importo numeric);
    create function public.liquidazione_iva_righi(uuid,int,int,jsonb) returns jsonb language sql as $$
      select jsonb_build_object('calcolabile',true,'dal','2025-01-01','al','2025-01-31',
        'mese',1,'etichetta','Gennaio','righi',jsonb_build_object('vp14_debito',c.importo))
      from public.test_calcolo c
    $$;
  `);
  // Questo fixture controlla la generazione e la rettifica. Il calcolo deI righi ha una propria suite.
  await db.exec(migration.slice(0, migration.indexOf("-- La scadenza finale")));
}, 15000);

afterAll(async () => db?.close());

it("usa la soglia nei periodi di riporto e crea la scadenza al termine di legge", async () => {
  const result = await db.query<{ ottobre: string; novembre: string; dicembre: string; terzo: string; quarto: string }>(`
    select private.f24_iva_versamento(2026,10,null,80)->>'stato' ottobre,
      private.f24_iva_versamento(2026,11,null,80)->>'scadenza' novembre,
      private.f24_iva_versamento(2026,12,null,80)->>'scadenza' dicembre,
      private.f24_iva_versamento(2026,null,3,80)->>'scadenza' terzo,
      private.f24_iva_versamento(2026,null,5,80)->>'stato' quarto
  `);
  expect(result.rows[0]).toEqual({
    ottobre: "riporto", novembre: "2026-12-16", dicembre: "2027-01-18",
    terzo: "2026-11-16", quarto: "annuale",
  });
});

it("sospende e riallinea la stessa voce F24 e preserva i versamenti pagati", async () => {
  await db.exec("insert into public.test_calcolo values(200)");
  const conferma = () => db.query<{ id: string }>(`
    select public.liquidazione_iva_conferma($1,2025,1)->>'id' id
  `, [azienda]);
  const id = (await conferma()).rows[0].id;
  const f24 = await db.query<{ id: string }>("select public.liquidazione_iva_crea_f24($1)->>'id' id", [id]);
  const idF24 = f24.rows[0].id;
  const righe = () => db.query<{ id: string; stato: string; importo: string; note: string }>(
    "select id,stato,importo,note from public.f24_entries",
  );
  await db.query("select public.liquidazione_iva_riapri($1)", [id]);
  expect((await righe()).rows[0]).toMatchObject({ id: idF24, stato: "annullato", importo: "200" });
  await db.exec("update public.test_calcolo set importo=350");
  await conferma();
  expect((await righe()).rows).toEqual([
    expect.objectContaining({ id: idF24, stato: "da_pagare", importo: "350", note: expect.stringContaining("200") }),
  ]);
  await db.query("update public.f24_entries set stato='pagato' where id=$1", [idF24]);
  await expect(db.query("select public.liquidazione_iva_riapri($1)", [id])).rejects.toMatchObject({ code: "23514" });
  expect((await righe()).rows[0]).toMatchObject({ stato: "pagato", importo: "350" });
});
