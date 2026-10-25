import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
const company = "d2000000-0000-4000-a000-000000000002",
  project = "00000000-0000-4000-a000-000000000001";
let db: PGlite;
const migration = readFileSync(
  "supabase/migrations/20261024132650_fv_configurazione_atomica.sql",
  "utf8",
);
const base = readFileSync(
  "supabase/migrations/20261027120000_fv_modulo_wave1.sql",
  "utf8",
);
const component = {
  articolo_id: null as null,
  categoria: "pannello",
  descrizione: "Pannello sintetico",
  marca: "Demo",
  modello: "P500",
  quantita: 12,
  unita_misura: "pz",
  prezzo_unitario_netto: 50,
  prezzo_unitario_vendita: 100,
  margine_pct: 0.5,
  potenza_unitaria_w: 500,
  potenza_unitaria_kw: null as null,
  capacita_kwh: null as null,
  garanzia_anni: 25,
  ordinamento: 1,
};
const payload = () => ({
  numero_pannelli_scelti: 12,
  potenza_kwp: 6,
  con_accumulo: false,
  capacita_accumulo_kwh: 0,
  con_wallbox: false,
  con_ottimizzatori: false,
  kit_bundle_id: null as null,
  kit_nome: null as null,
  kit_prezzo: null as null,
  prezzo_vendita_manuale: null as null,
  iva_aliquota: 0.1,
  layout_overlay: null as null,
});
const stamp = "2026-10-24T08:00:00Z";
const service = {
  tipo: "altro",
  descrizione: "Pratica sintetica",
  quantita: 1,
  prezzo_netto: 10,
  prezzo_vendita: 20,
  ordinamento: 1,
  note_operative: null as null,
};
const save = (
  opts: {
    company?: string;
    expected?: string;
    services?: unknown[];
    components?: unknown[];
    patch?: object;
  } = {},
) =>
  db.query(
    "select public.fv_save_configuration_atomic($1,$2,$3,$4,$5,$6,$7) as result",
    [
      project,
      opts.company ?? company,
      opts.expected ?? stamp,
      JSON.stringify(opts.patch ?? payload()),
      JSON.stringify(opts.components ?? [component]),
      "[]",
      JSON.stringify(opts.services ?? [service]),
    ],
  );
beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.user',true),'')::uuid$$;
    create function public.get_effective_company_id() returns uuid language sql as $$select nullif(current_setting('app.company',true),'')::uuid$$;
    create function public.has_permission_for_company(uuid,text,uuid) returns boolean language sql as $$select current_setting('app.edit',true)::boolean$$;
    grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;`);
  // Verify the function can be registered before the later-dated FV baseline.
  await db.exec(migration);
  await db.exec(`create table public.fv_progetti(id uuid primary key, company_id uuid, stato text, updated_at timestamptz,
    numero_pannelli_scelti integer, potenza_kwp numeric, con_accumulo boolean, capacita_accumulo_kwh numeric,
    con_wallbox boolean, con_ottimizzatori boolean, kit_bundle_id uuid, kit_nome text, kit_prezzo numeric,
    prezzo_vendita_manuale numeric, iva_aliquota numeric, layout_overlay jsonb,
    prezzo_vendita_iva_inclusa numeric, pdf_vendita_url text);
    create table public.fv_calcolo_finanziario(progetto_id uuid references public.fv_progetti(id), scenario_completo jsonb);
    create table public.articoli_native(id uuid primary key, company_id uuid);
    create table public.tariffe_aziendali(id uuid primary key, company_id uuid);
    create table public.bundle_prodotti(id uuid primary key, company_id uuid);`);
  for (const table of [
    "fv_componenti_progetto",
    "fv_manodopera_progetto",
    "fv_servizi_progetto",
  ]) {
    const ddl = base.match(
      new RegExp(
        `CREATE TABLE IF NOT EXISTS public\\.${table} \\([\\s\\S]*?\\n\\);`,
      ),
    )![0];
    await db.exec(ddl);
    await db.exec(`alter table public.${table} enable row level security;
      create policy scope on public.${table} to authenticated using (exists(select 1 from public.fv_progetti p where p.id=progetto_id)) with check (exists(select 1 from public.fv_progetti p where p.id=progetto_id));`);
  }
  await db.exec(`alter table public.fv_progetti enable row level security;
    create policy scope on public.fv_progetti to authenticated using (company_id=public.get_effective_company_id()) with check (company_id=public.get_effective_company_id());
    alter table public.fv_servizi_progetto add constraint test_failure check(descrizione <> 'GUASTO');
    grant select,insert,update,delete on all tables in schema public to authenticated;`);
}, 30000);
beforeEach(async () => {
  await db.exec(`reset role; truncate public.fv_progetti cascade;
    insert into public.fv_progetti(id,company_id,stato,updated_at,potenza_kwp) values ('${project}','${company}','bozza','${stamp}',3);
    insert into public.fv_componenti_progetto(progetto_id,categoria,descrizione,quantita,prezzo_unitario_netto,prezzo_unitario_vendita) values ('${project}','pannello','PRECEDENTE',6,50,100);
    set role authenticated; select set_config('app.user','00000000-0000-4000-a000-000000000099',false),set_config('app.company','${company}',false),set_config('app.edit','true',false);`);
});
afterAll(async () => {
  await db?.close();
});
describe("FV RPC executed in actual local PostgreSQL", () => {
  it("updates the project and all three row sets in one transaction", async () => {
    const r = await save();
    expect(r.rows[0]).toMatchObject({
      result: { projectId: project, replayed: false },
    });
    expect(
      (await db.query("select potenza_kwp from public.fv_progetti")).rows[0],
    ).toMatchObject({ potenza_kwp: "6" });
    expect(
      (await db.query("select descrizione from public.fv_componenti_progetto"))
        .rows,
    ).toEqual([{ descrizione: component.descrizione }]);
  });
  it("rolls back deletes, inserts and project changes if a later row fails a DB constraint", async () => {
    await expect(
      save({ services: [{ ...service, descrizione: "GUASTO" }] }),
    ).rejects.toThrow();
    expect(
      (await db.query("select descrizione from public.fv_componenti_progetto"))
        .rows,
    ).toEqual([{ descrizione: "PRECEDENTE" }]);
    expect(
      (await db.query("select potenza_kwp from public.fv_progetti")).rows[0],
    ).toMatchObject({ potenza_kwp: "3" });
  });
  it("rejects a stale update before replacing any rows", async () => {
    await expect(
      save({ expected: "2026-10-23T08:00:00Z" }),
    ).rejects.toMatchObject({ code: "40001" });
    expect(
      (await db.query("select descrizione from public.fv_componenti_progetto"))
        .rows[0],
    ).toMatchObject({ descrizione: "PRECEDENTE" });
  });
  it("makes a retry after a lost response a no-op, not another replacement", async () => {
    await save();
    const ids = (await db.query("select id from public.fv_componenti_progetto"))
      .rows;
    expect((await save()).rows[0]).toMatchObject({
      result: { replayed: true },
    });
    expect(
      (await db.query("select id from public.fv_componenti_progetto")).rows,
    ).toEqual(ids);
  });
  it("invalidates old finance and PDF pointers atomically, also on an editable configured project", async () => {
    await db.exec(
      `update public.fv_progetti set stato='configurato',prezzo_vendita_iva_inclusa=9999,pdf_vendita_url='old.pdf';insert into public.fv_calcolo_finanziario values('${project}','{"old":true}');`,
    );
    await save();
    expect(
      (
        await db.query(
          "select prezzo_vendita_iva_inclusa,pdf_vendita_url from public.fv_progetti",
        )
      ).rows[0],
    ).toEqual({ prezzo_vendita_iva_inclusa: null, pdf_vendita_url: null });
    expect(
      (await db.query("select * from public.fv_calcolo_finanziario")).rows,
    ).toEqual([]);
  });
  it("rejects issued projects, malformed flags and negative storage capacity", async () => {
    await expect(
      save({ patch: { ...payload(), con_wallbox: "false" } }),
    ).rejects.toMatchObject({ code: "22023" });
    await expect(
      save({ patch: { ...payload(), capacita_accumulo_kwh: -1 } }),
    ).rejects.toMatchObject({ code: "22023" });
    await db.exec("update public.fv_progetti set stato='emesso'");
    await expect(save()).rejects.toMatchObject({ code: "55000" });
  });
  it("does not treat a silently RLS-denied delete as a successful replacement", async () => {
    await db.exec(`reset role;drop policy scope on public.fv_componenti_progetto;
      create policy read_scope on public.fv_componenti_progetto for select to authenticated using(true);
      create policy write_scope on public.fv_componenti_progetto for insert to authenticated with check(true);set role authenticated;`);
    try {
      await expect(save()).rejects.toMatchObject({ code: "42501" });
      expect(
        (
          await db.query(
            "select descrizione from public.fv_componenti_progetto",
          )
        ).rows[0],
      ).toEqual({ descrizione: "PRECEDENTE" });
    } finally {
      await db.exec(`reset role;drop policy read_scope on public.fv_componenti_progetto;drop policy write_scope on public.fv_componenti_progetto;
      create policy scope on public.fv_componenti_progetto to authenticated using (exists(select 1 from public.fv_progetti p where p.id=progetto_id)) with check (exists(select 1 from public.fv_progetti p where p.id=progetto_id));set role authenticated;`);
    }
  });
  it.each(["false", ""])(
    "rejects missing or false edit permission (%s)",
    async (permission) => {
      await db.query("select set_config('app.edit',$1,false)", [
        permission || "false",
      ]);
      await expect(save()).rejects.toMatchObject({ code: "42501" });
    },
  );
  it("rejects another company and anonymous callers", async () => {
    await expect(
      save({ company: "00000000-0000-4000-a000-000000000010" }),
    ).rejects.toMatchObject({ code: "42501" });
    await db.exec("select set_config('app.user','',false)");
    await expect(save()).rejects.toMatchObject({ code: "42501" });
  });
  it("rejects reserved fields and malformed/negative input before any mutation", async () => {
    await expect(
      save({ patch: { ...payload(), company_id: company } }),
    ).rejects.toMatchObject({ code: "22023" });
    await expect(
      save({ components: [{ ...component, quantita: -1 }] }),
    ).rejects.toMatchObject({ code: "22023" });
    await expect(save({ components: [] })).rejects.toMatchObject({
      code: "22023",
    });
  });
});
