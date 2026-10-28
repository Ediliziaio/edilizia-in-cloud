/// <reference types="node" />
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const C = "10000000-0000-4000-a000-000000000001",
  OTHER = "10000000-0000-4000-a000-000000000002",
  U = "20000000-0000-4000-a000-000000000001",
  O = "30000000-0000-4000-a000-000000000001";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
create role authenticated; create role anon; create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.actor',true),'')::uuid$$;
create function get_effective_company_id() returns uuid language sql as $$select nullif(current_setting('app.company',true),'')::uuid$$;
create function has_role(uuid,text) returns boolean language sql as $$select false$$;
create function is_super_admin(uuid) returns boolean language sql as $$select false$$;
create function has_permission(uuid,text) returns boolean language sql as $$select current_setting('app.allowed',true)='true'$$;
create function e_persona_ufficio(uuid,uuid) returns boolean language sql as $$select true$$;
create table companies(id uuid primary key,playbook_auto_apply boolean default false,ticket_playbook_auto_apply boolean default false);
create table orders(id uuid primary key,company_id uuid,deleted_at timestamptz);
create table company_uffici(id uuid primary key,company_id uuid,attivo boolean);
create table order_statuses(id uuid primary key,company_id uuid);
create table order_work_phases(id uuid primary key,order_id uuid,status text,name text,position int);
create table tasks(id uuid primary key default gen_random_uuid(),company_id uuid,order_id uuid,title text,activity_scope text,status text,bloccata_da_task_id uuid,attende_fase_id uuid);
alter table tasks add notes text,add due_date date,add assigned_to uuid,add created_by uuid,add ufficio_id uuid,add sort_order int,add priority text,add category text,add sblocco_giorni int,add chiudi_su_evento text,add fase_al_completamento_id uuid;
alter table tasks add completed_at timestamptz,add updated_at timestamptz default now(),add ticket_id uuid,add evento_gia_avvenuto boolean default false;
create table ufficio_membri(ufficio_id uuid,profile_id uuid);
create table notifications(company_id uuid,user_id uuid,type text,title text,body text,entity_type text,entity_id uuid,action_url text);
create table order_task_template(id uuid primary key default gen_random_uuid(),company_id uuid references companies(id),ambito text,vertical text,sort_order int,titolo text,descrizione text,giorni_offset int,giorni_dopo_sblocco int,priorita text,attivo boolean,assegna_a_utente uuid,assegna_a_ufficio_id uuid,chiudi_su_evento text,fase_raggiunta_id uuid,activity_scope text,dopo_fase_lavorazione text,dipende_da_id uuid references order_task_template(id) on delete set null,updated_at timestamptz default now());
insert into companies(id) values('${C}'),('${OTHER}');
insert into orders(id,company_id) values('${O}','${C}');
grant usage on schema public,auth to authenticated; grant all on all tables in schema public to authenticated;
alter table order_task_template enable row level security;create policy tenant on order_task_template to authenticated using(company_id=get_effective_company_id()) with check(company_id=get_effective_company_id());
set app.actor='${U}';set app.company='${C}';set app.allowed='true';
`);
  await db.exec(
    readFileSync(
      "supabase/migrations/20261027084341_office_workspace_atomic_templates.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261027090709_office_flow_application_atomic.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261027093146_office_dependencies_release_consistent.sql",
      "utf8",
    ),
  );
  await db.exec(`
create trigger trg_sblocca_task_a_catena after update of completed_at on tasks for each row execute function sblocca_task_a_catena();
create trigger trg_sblocca_fasi_ufficio_da_cantiere after update of status on order_work_phases for each row execute function sblocca_fasi_ufficio_da_cantiere();
set role authenticated;
`);
}, 30000);
afterAll(async () => {
  await db?.close();
});
const step = (title: string, rest: Record<string, unknown> = {}) => ({
  titolo: title,
  office_stage: "avvio",
  ...rest,
});
const expected = async () =>
  (
    await db.query(
      "select id,updated_at from order_task_template where company_id=$1 order by id",
      [C],
    )
  ).rows;
const save = async (rows: unknown[], revision: unknown[], company = C) =>
  db.query(
    "select salva_flusso_lavoro_atomico($1::uuid,'commessa',null,$2::jsonb,$3::jsonb,true)",
    [company, JSON.stringify(rows), JSON.stringify(revision)],
  );
describe("office workflow atomic storage", () => {
  for (const phaseFirst of [false, true]) {
    it(`releases dual prerequisites in either order without blocking siblings (phase first: ${phaseFirst})`, async () => {
      const root = (
        await db.query<{ id: string }>(
          "insert into tasks(company_id,order_id,title,activity_scope,status) values($1,$2,'Dual root','ufficio','da_fare') returning id",
          [C, O],
        )
      ).rows[0].id;
      const phase = (
        await db.query<{ id: string }>(
          "insert into order_work_phases(id,order_id,name,status,position) values(gen_random_uuid(),$1,'Dual phase','da_fare',100) returning id",
          [O],
        )
      ).rows[0].id;
      const child = async (
        title: string,
        predecessor: string | null,
        construction: string | null,
      ) =>
        (
          await db.query<{ id: string }>(
            "insert into tasks(company_id,order_id,title,activity_scope,status,assigned_to,bloccata_da_task_id,attende_fase_id,sblocco_giorni) values($1,$2,$3,'ufficio','in_attesa',$4,$5,$6,3) returning id",
            [C, O, title, U, predecessor, construction],
          )
        ).rows[0].id;
      // Dual is deliberately inserted first: the old trigger aborted the whole loop here.
      const dual = await child("Dual successor", root, phase);
      const taskOnly = await child("Task-only successor", root, null);
      const phaseOnly = await child("Phase-only successor", null, phase);
      const completeTask = () =>
        db.query(
          "update tasks set status='completata',completed_at=now() where id=$1",
          [root],
        );
      const completePhase = () =>
        db.query(
          "update order_work_phases set status='completata' where id=$1",
          [phase],
        );
      const status = async (id: string) =>
        (
          await db.query<{ status: string; due_date: string | null }>(
            "select status,due_date from tasks where id=$1",
            [id],
          )
        ).rows[0];
      if (phaseFirst) await completePhase();
      else await completeTask();
      expect(await status(dual)).toMatchObject({
        status: "in_attesa",
        due_date: null,
      });
      expect(await status(phaseFirst ? phaseOnly : taskOnly)).toMatchObject({
        status: "da_fare",
      });
      expect(await status(phaseFirst ? taskOnly : phaseOnly)).toMatchObject({
        status: "in_attesa",
        due_date: null,
      });
      if (phaseFirst) await completeTask();
      else await completePhase();
      expect(await status(dual)).toMatchObject({ status: "da_fare" });
      expect(
        (
          await db.query(
            "select due_date=(now() at time zone 'Europe/Rome')::date+3 as correct from tasks where id=$1",
            [dual],
          )
        ).rows[0],
      ).toMatchObject({ correct: true });
      expect(
        (
          await db.query(
            "select count(*)::int n from notifications where entity_id=any($1::uuid[])",
            [[dual, taskOnly, phaseOnly]],
          )
        ).rows[0],
      ).toMatchObject({ n: 3 });
      await completePhase();
      await completeTask();
      expect(
        (
          await db.query(
            "select count(*)::int n from notifications where entity_id=any($1::uuid[])",
            [[dual, taskOnly, phaseOnly]],
          )
        ).rows[0],
      ).toMatchObject({ n: 3 });
    });
  }
  it("applies a full task batch atomically and does not duplicate it on retry", async () => {
    const payload = [
      {
        title: "Batch A",
        activity_scope: "ufficio",
        office_stage: "avvio",
        days: 1,
      },
      {
        title: "Batch B",
        activity_scope: "ufficio",
        office_stage: "acquisti",
        predecessor_title: "Batch A",
        release_days: 3,
      },
    ];
    const call = () =>
      db.query(
        "select applica_attivita_commessa_atomico($1,$2,$3::jsonb,'2026-10-27') n",
        [C, O, JSON.stringify(payload)],
      );
    expect((await call()).rows[0]).toMatchObject({ n: 2 });
    expect((await call()).rows[0]).toMatchObject({ n: 0 });
    expect(
      (
        await db.query(
          "select status,due_date,sblocco_giorni from tasks where title='Batch B'",
        )
      ).rows[0],
    ).toMatchObject({ status: "in_attesa", due_date: null, sblocco_giorni: 3 });
  });
  it("rolls back all earlier tasks if a later task is invalid", async () => {
    await expect(
      db.query(
        "select applica_attivita_commessa_atomico($1,$2,$3::jsonb,'2026-10-27')",
        [
          C,
          O,
          JSON.stringify([
            { title: "Rollback A", office_stage: "avvio" },
            { title: "Rollback B", office_stage: "bad" },
          ]),
        ],
      ),
    ).rejects.toThrow();
    expect(
      (
        await db.query(
          "select count(*) n from tasks where title like 'Rollback%'",
        )
      ).rows[0],
    ).toMatchObject({ n: 0 });
  });
  it("rejects missing construction prerequisites before writing any tasks", async () => {
    await expect(
      db.query(
        "select applica_attivita_commessa_atomico($1,$2,$3::jsonb,'2026-10-27')",
        [
          C,
          O,
          JSON.stringify([
            { title: "Missing A" },
            { title: "Missing B", phase_name: "Fase assente" },
          ]),
        ],
      ),
    ).rejects.toThrow(/Manca la lavorazione/);
    expect(
      (
        await db.query(
          "select count(*) n from tasks where title like 'Missing%'",
        )
      ).rows[0],
    ).toMatchObject({ n: 0 });
  });
  it("starts successors whose predecessor is already complete", async () => {
    await db.exec("update tasks set status='completata' where title='Batch A'");
    await db.query(
      "select applica_attivita_commessa_atomico($1,$2,$3::jsonb,'2026-10-27')",
      [
        C,
        O,
        JSON.stringify([
          { title: "Batch A" },
          { title: "After done", predecessor_title: "Batch A", days: 2 },
        ]),
      ],
    );
    expect(
      (
        await db.query(
          "select status,bloccata_da_task_id from tasks where title='After done'",
        )
      ).rows[0],
    ).toMatchObject({ status: "da_fare", bloccata_da_task_id: null });
  });
  it("creates groups and dependencies in one transaction", async () => {
    await save(
      [
        step("Contratto"),
        step("Ordine", { dipende_da_posizione: 0, office_stage: "acquisti" }),
      ],
      [],
    );
    const r = await db.query<{
      id: string;
      dipende_da_id: string;
      office_stage: string;
    }>("select * from order_task_template order by sort_order");
    expect(r.rows[1].dipende_da_id).toBe(r.rows[0].id);
    expect(r.rows[1].office_stage).toBe("acquisti");
  });
  it("rolls back earlier changes and the automatic switch when a later row fails", async () => {
    const before = await db.query(
      "select * from order_task_template order by id",
    );
    const revision = await expected();
    await expect(
      save(
        [step("Temporaneo"), step("Non valido", { office_stage: "inventato" })],
        revision,
      ),
    ).rejects.toThrow();
    expect(
      (await db.query("select * from order_task_template order by id")).rows,
    ).toEqual(before.rows);
  });
  it("rejects stale snapshots without overwriting the model", async () => {
    await expect(save([step("Sovrascrittura")], [])).rejects.toThrow(
      /altro utente/,
    );
    expect(
      (await db.query("select count(*) n from order_task_template")).rows[0],
    ).toMatchObject({ n: 2 });
  });
  it("rejects duplicate titles, cycles and cross-company access", async () => {
    const revision = await expected();
    await expect(save([step("A"), step(" a ")], revision)).rejects.toThrow(
      /distinto/,
    );
    await expect(
      save([step("A", { dipende_da_posizione: 0 })], revision),
    ).rejects.toThrow(/dipendenza/);
    await expect(save([step("A")], [], OTHER)).rejects.toThrow(/Non puoi/);
  });
  it("rejects unauthorized saves and missing auth", async () => {
    await db.exec("set app.allowed='false'");
    await expect(save([], await expected())).rejects.toThrow(/Non puoi/);
    await db.exec("set app.allowed='true';set app.actor=''");
    await expect(save([], await expected())).rejects.toThrow(/Non puoi/);
    await db.exec(`set app.actor='${U}'`);
  });
  it("preserves existing ids on edit", async () => {
    const revision = await expected();
    const id = (
      await db.query<{ id: string }>(
        "select id from order_task_template order by sort_order limit 1",
      )
    ).rows[0].id;
    await save([step("Contratto aggiornato", { id })], revision);
    expect(
      (await db.query("select id,titolo from order_task_template")).rows,
    ).toEqual([{ id, titolo: "Contratto aggiornato" }]);
  });
  it("inherits a group for older server-side callers without backfilling existing tasks", async () => {
    await db.query(
      "insert into tasks(company_id,order_id,title,activity_scope,status) values($1,$2,'Contratto aggiornato','ufficio','da_fare')",
      [C, O],
    );
    expect(
      (
        await db.query(
          "select office_stage from tasks where title='Contratto aggiornato'",
        )
      ).rows[0],
    ).toMatchObject({ office_stage: "avvio" });
  });
  it("blocks completion until the predecessor is actually complete", async () => {
    const id = (
      await db.query<{ id: string }>(
        "select id from tasks where title='Contratto aggiornato' limit 1",
      )
    ).rows[0].id;
    await db.query(
      "insert into tasks(company_id,order_id,title,activity_scope,status,bloccata_da_task_id) values($1,$2,'Dipendente','ufficio','in_attesa',$3)",
      [C, O, id],
    );
    await expect(
      db.exec("update tasks set status='completata' where title='Dipendente'"),
    ).rejects.toThrow(/dipendenza/);
    await db.query("update tasks set status='completata' where id=$1", [id]);
    await db.exec("update tasks set status='da_fare' where title='Dipendente'");
    expect(
      (await db.query("select status from tasks where title='Dipendente'"))
        .rows[0],
    ).toMatchObject({ status: "da_fare" });
  });
  it("keeps execution unavailable to anonymous users and uses RLS invoker", async () => {
    expect(
      (
        await db.query(
          "select has_function_privilege('anon','salva_flusso_lavoro_atomico(uuid,text,text,jsonb,jsonb,boolean)','execute') ok",
        )
      ).rows[0],
    ).toMatchObject({ ok: false });
    expect(
      (
        await db.query(
          "select prosecdef from pg_proc where proname='salva_flusso_lavoro_atomico'",
        )
      ).rows[0],
    ).toMatchObject({ prosecdef: false });
  });
});
