import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
const company = "d2000000-0000-4000-a000-000000000002";
const project = "00000000-0000-4000-a000-000000000001";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite(); await db.waitReady;
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$select '00000000-0000-4000-a000-000000000099'::uuid$$;
    create function public.get_effective_company_id() returns uuid language sql as $$select current_setting('app.company')::uuid$$;
    create function public.utente_bloccato() returns boolean language sql as $$select false$$;
    create function public.utente_e_cliente_esterno() returns boolean language sql as $$select false$$;
    create function public.check_staff_visibility(uuid,uuid) returns boolean language sql as $$select true$$;
    create sequence public.numeri_qa;
    create function public.fv_genera_numero_progetto(uuid) returns text language sql as $$select 'FV-QA-'||nextval('public.numeri_qa')$$;
    create table public.fv_progetti(id uuid primary key, company_id uuid, numero text, stato text, versione integer,
      versione_padre_id uuid, created_by uuid, updated_by uuid, ultima_modifica_by uuid, created_at timestamptz, updated_at timestamptz,
      deleted_at timestamptz, emesso_il timestamptz, firmato_il timestamptz, annullato boolean, annullato_il timestamptz,
      annullato_motivo text, pdf_vendita_url text, pdf_tecnico_url text, pdf_mobile_url text, ordine_id uuid,
      modello_snapshot jsonb, prezzo_vendita_iva_inclusa numeric);
    create table public.articoli_native(id uuid primary key, company_id uuid);
    create table public.tariffe_aziendali(id uuid primary key, company_id uuid);
    create table public.fv_calcolo_finanziario(id uuid default gen_random_uuid(), progetto_id uuid references public.fv_progetti(id), attivo boolean, scenario_completo jsonb, created_at timestamptz default now());`);
  const base = readFileSync("supabase/migrations/20261027120000_fv_modulo_wave1.sql", "utf8");
  for (const table of ["fv_componenti_progetto", "fv_manodopera_progetto", "fv_servizi_progetto", "fv_pannelli_layout"]) {
    const ddl = base.match(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table} \\([\\s\\S]*?\\n\\);`))?.[0];
    if (!ddl) throw new Error(`Tabella di prova mancante: ${table}`);
    await db.exec(ddl);
  }
  await db.exec(readFileSync("supabase/migrations/20280916950000_fv_duplica_progetto.sql", "utf8"));
}, 30_000);
beforeEach(async () => {
  await db.exec(`truncate public.fv_progetti cascade; select set_config('app.company','${company}',false);
    insert into public.fv_progetti(id,company_id,numero,stato,versione,firmato_il,pdf_vendita_url,ordine_id,modello_snapshot,prezzo_vendita_iva_inclusa)
      values('${project}','${company}','FV-ORIGINALE','firmato',2,now(),'originale.html','00000000-0000-4000-a000-000000000003','{"template":{"colore_primario":"#173c40","pdf_cover_hero":"Originale QA"},"intervento":"nuovo"}',11000);
    insert into public.fv_componenti_progetto(progetto_id,categoria,descrizione,quantita,prezzo_unitario_netto,prezzo_unitario_vendita) values('${project}','pannello','Pannello QA',12,100,150);
    insert into public.fv_manodopera_progetto(progetto_id,descrizione,ore,tariffa_oraria_netta,tariffa_oraria_vendita) values('${project}','Posa QA',8,30,45);
    insert into public.fv_servizi_progetto(progetto_id,tipo,descrizione,quantita,prezzo_netto,prezzo_vendita) values('${project}','altro','Pratica QA',1,100,200);
    insert into public.fv_calcolo_finanziario(progetto_id,attivo,scenario_completo) values('${project}',true,'{"totale":11000}');`);
});
afterAll(async () => { await db?.close(); });
describe("Il pulsante Duplica FV: RPC reale su PostgreSQL locale", () => {
  it("copia modello congelato, importi, componenti, servizi e manodopera", async () => {
    const { rows } = await db.query<{ id: string }>("select public.fv_duplica_progetto($1) as id", [project]);
    const id = rows[0].id;
    const clone = (await db.query("select * from public.fv_progetti where id=$1", [id])).rows[0];
    expect(clone).toMatchObject({ stato: "bozza", versione: 3, versione_padre_id: project, firmato_il: null, pdf_vendita_url: null, ordine_id: null, prezzo_vendita_iva_inclusa: "11000",
      modello_snapshot: { template: { colore_primario: "#173c40", pdf_cover_hero: "Originale QA" }, intervento: "nuovo" } });
    for (const table of ["fv_componenti_progetto", "fv_manodopera_progetto", "fv_servizi_progetto", "fv_calcolo_finanziario"]) {
      expect((await db.query(`select * from public.${table} where progetto_id=$1`, [id])).rows).toHaveLength(1);
    }
    expect((await db.query("select stato,pdf_vendita_url from public.fv_progetti where id=$1", [project])).rows[0]).toEqual({ stato: "firmato", pdf_vendita_url: "originale.html" });
  });
  it("ogni copia ha id e numero propri e non riusa il PDF firmato", async () => {
    const a = (await db.query<{ id: string }>("select public.fv_duplica_progetto($1) as id", [project])).rows[0].id;
    const b = (await db.query<{ id: string }>("select public.fv_duplica_progetto($1) as id", [project])).rows[0].id;
    expect(a).not.toBe(b);
    const rows = (await db.query<{ numero: string; firmato_il: string | null; pdf_vendita_url: string | null }>("select numero,firmato_il,pdf_vendita_url from public.fv_progetti where id in ($1,$2)", [a,b])).rows;
    expect(rows[0].numero).not.toBe(rows[1].numero);
    rows.forEach(r => { expect(r.firmato_il).toBeNull(); expect(r.pdf_vendita_url).toBeNull(); });
  });
  it("non duplica il progetto di un'altra azienda", async () => {
    await db.exec("select set_config('app.company','d2000000-0000-4000-a000-000000000004',false)");
    await expect(db.query("select public.fv_duplica_progetto($1)", [project])).rejects.toThrow("Progetto non trovato");
  });
});
