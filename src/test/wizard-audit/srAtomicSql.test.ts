import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
const company = "d2000000-0000-4000-a000-000000000002",
  project = "00000000-0000-4000-a000-000000000001",
  windowId = "00000000-0000-4000-a000-000000000002";
let db: PGlite;
type Bom = {
  serramenti: Record<string, unknown>[];
  accessori: Record<string, unknown>[];
  servizi: Record<string, unknown>[];
};
let base: Bom, proj: unknown;
const save = (next: Bom, expected = base) =>
  db.query("select public.sr_apply_ai_bom_atomic($1,$2,$3,$4,$5) as result", [
    project,
    company,
    JSON.stringify(proj),
    JSON.stringify(expected),
    JSON.stringify(next),
  ]);
beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql as $$select '00000000-0000-4000-a000-000000000099'::uuid$$;
    create function public.get_effective_company_id() returns uuid language sql as $$select '${company}'::uuid$$;
    create function public.has_permission_for_company(uuid,text,uuid) returns boolean language sql as $$select true$$;
    grant usage on schema auth to authenticated;grant execute on all functions in schema auth to authenticated;`);
  await db.exec(
    readFileSync(
      "supabase/migrations/20261024134400_sr_ai_bom_atomico.sql",
      "utf8",
    ),
  );
  await db.exec(`create table public.sr_progetti(id uuid primary key,company_id uuid,stato text,cliente_nome text);
    create table public.article_families(id uuid primary key,company_id uuid);
    create table public.sr_serramenti_progetto(id uuid primary key,progetto_id uuid references public.sr_progetti(id),company_id uuid,position integer,tipologia_label text,quantita numeric,prezzo_unitario numeric,prezzo_totale numeric,family_id uuid,created_at timestamptz,updated_at timestamptz);
    create table public.sr_accessori_progetto(id uuid primary key,progetto_id uuid references public.sr_progetti(id),company_id uuid,serramento_id uuid references public.sr_serramenti_progetto(id) on delete set null,position integer,descrizione text,quantita numeric,prezzo_unitario numeric,prezzo_totale numeric,family_id uuid,created_at timestamptz,updated_at timestamptz);
    create table public.sr_servizi_progetto(id uuid primary key,progetto_id uuid references public.sr_progetti(id),company_id uuid,position integer,descrizione text check(descrizione<>'GUASTO'),quantita numeric,prezzo_unitario_vendita numeric,prezzo_totale_vendita numeric,created_at timestamptz,updated_at timestamptz);
    create table public.test_media(id uuid primary key,serramento_id uuid references public.sr_serramenti_progetto(id) on delete set null);
    grant select,insert,update,delete on all tables in schema public to authenticated;`);
  for (const table of [
    "sr_progetti",
    "sr_serramenti_progetto",
    "sr_accessori_progetto",
    "sr_servizi_progetto",
  ])
    await db.exec(
      `alter table public.${table} enable row level security;create policy scope on public.${table} to authenticated using(company_id=public.get_effective_company_id()) with check(company_id=public.get_effective_company_id());`,
    );
}, 30000);
beforeEach(async () => {
  await db.exec(
    `reset role;truncate public.sr_progetti cascade;insert into public.sr_progetti values('${project}','${company}','bozza','Sintetico');insert into public.sr_serramenti_progetto values('${windowId}','${project}','${company}',0,'Finestra',2,500,1000,null,now(),now());insert into public.test_media values('00000000-0000-4000-a000-000000000090','${windowId}');set role authenticated;`,
  );
  proj = (await db.query<{ row: Record<string, unknown> }>("select to_jsonb(p) as row from public.sr_progetti p"))
    .rows[0].row;
  base = {
    serramenti: (
      await db.query<{ row: Record<string, unknown> }>(
        "select to_jsonb(r) as row from public.sr_serramenti_progetto r",
      )
    ).rows.map((r) => r.row as Record<string, unknown>),
    accessori: [],
    servizi: [],
  };
});
afterAll(async () => {
  await db?.close();
});
describe("SR confirmed BOM import in real local PostgreSQL", () => {
  it("preserves an untouched incomplete legacy row while adding a complete service", async () => {
    await db.exec(
      "update public.sr_serramenti_progetto set prezzo_unitario=null,prezzo_totale=null",
    );
    base.serramenti = (
      await db.query<{ row: Record<string, unknown> }>(
        "select to_jsonb(r) as row from public.sr_serramenti_progetto r",
      )
    ).rows.map((r) => r.row as Record<string, unknown>);
    const next = structuredClone(base);
    next.servizi = [
      {
        id: "00000000-0000-4000-a000-000000000050",
        progetto_id: project,
        company_id: company,
        position: 1,
        descrizione: "Trasporto",
        quantita: 1,
        prezzo_unitario_vendita: 100,
        prezzo_totale_vendita: 100,
      },
    ];
    await save(next);
    expect(
      (
        await db.query(
          "select prezzo_unitario from public.sr_serramenti_progetto",
        )
      ).rows[0],
    ).toEqual({ prezzo_unitario: null });
  });
  it("updates stable rows without breaking existing media and replays without duplicate rows", async () => {
    const next = structuredClone(base);
    next.serramenti[0] = {
      ...next.serramenti[0],
      quantita: 3,
      prezzo_totale: 1500,
    };
    expect((await save(next)).rows[0]).toMatchObject({
      result: { projectId: project, replayed: false },
    });
    expect(
      (await db.query("select serramento_id from public.test_media")).rows,
    ).toEqual([{ serramento_id: windowId }]);
    expect((await save(next)).rows[0]).toMatchObject({
      result: { replayed: true },
    });
  });
  it("rolls back a changed window if insertion in a later set fails", async () => {
    const next = structuredClone(base);
    next.serramenti[0] = {
      ...next.serramenti[0],
      quantita: 3,
      prezzo_totale: 1500,
    };
    next.servizi = [
      {
        id: "00000000-0000-4000-a000-000000000050",
        progetto_id: project,
        company_id: company,
        descrizione: "GUASTO",
        quantita: 1,
        prezzo_unitario_vendita: 10,
        prezzo_totale_vendita: 10,
      },
    ];
    await expect(save(next)).rejects.toThrow();
    expect(
      (await db.query("select quantita from public.sr_serramenti_progetto"))
        .rows[0],
    ).toEqual({ quantita: "2" });
  });
  it("detects concurrent BOM or project changes before importing anything", async () => {
    await db.exec(
      "update public.sr_serramenti_progetto set quantita=4,prezzo_totale=2000",
    );
    await expect(save({ ...base, serramenti: [] })).rejects.toMatchObject({
      code: "40001",
    });
    await db.exec("update public.sr_progetti set cliente_nome='Cambiato'");
    await expect(save(base)).rejects.toMatchObject({ code: "40001" });
  });
  it("rejects foreign ownership, calculated-total tampering and orphan accessories", async () => {
    const next = structuredClone(base);
    next.serramenti[0].company_id = "00000000-0000-4000-a000-000000000010";
    await expect(save(next)).rejects.toThrow();
    next.serramenti[0] = base.serramenti[0];
    next.serramenti[0] = { ...next.serramenti[0], prezzo_totale: 1 };
    await expect(save(next)).rejects.toThrow();
    next.serramenti = base.serramenti;
    next.accessori = [
      {
        id: "00000000-0000-4000-a000-000000000050",
        progetto_id: project,
        company_id: company,
        serramento_id: "00000000-0000-4000-a000-000000000099",
        descrizione: "Accessorio",
        quantita: 1,
        prezzo_unitario: 10,
        prezzo_totale: 10,
      },
    ];
    await expect(save(next)).rejects.toThrow(/senza serramento/);
  });
});
