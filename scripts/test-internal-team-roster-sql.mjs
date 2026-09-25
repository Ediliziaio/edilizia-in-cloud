// Isolated PostgreSQL/WASM only. No client, secrets, network or shared database.
// Fixtures replace existing authorization helpers; NOT a full Supabase/Auth/API audit.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { PGlite } = await import(pathToFileURL(process.argv[2] ?? require.resolve("@electric-sql/pglite")).href);
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const company = id(1), other = id(2), admin = id(3), team = id(4), employee = id(5), noLogin = id(6), foreign = id(7), inactive = id(8), external = id(9);
let checks = 0;
const pass = message => { checks++; console.log(`PASS ${message}`); };
async function context(role = "admin", c = company, uid = admin, blocked = false) {
  await db.query("SELECT set_config('test.company',$1,false),set_config('test.role',$2,false),set_config('test.uid',$3,false),set_config('test.blocked',$4,false)", [c, role, uid, String(blocked)]);
}
async function save(operation, ids, expected = null, leader = null, targetTeam = team, c = company) {
  return (await db.query("SELECT public.save_internal_team_roster_v1($1,$2,$3,$4,$5::uuid[],$6) AS id", [c, targetTeam, expected, operation, ids, leader])).rows[0].id;
}
async function rejects(operation, pattern, name) {
  await assert.rejects(operation, pattern); pass(name);
}
try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth, public TO authenticated, anon;
    CREATE TABLE public.companies(id uuid PRIMARY KEY);
    CREATE TABLE public.external_teams(id uuid PRIMARY KEY, company_id uuid, name text, kind text, is_active boolean);
    CREATE TABLE public.employees(id uuid PRIMARY KEY, company_id uuid, first_name text, last_name text, user_id uuid, is_active boolean);
    CREATE TABLE public.order_employees(id uuid, total_cost numeric); CREATE TABLE public.order_campo_assignments(id uuid);
    CREATE FUNCTION public.utente_bloccato() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('test.blocked',true),'false')='true' $$;
    CREATE FUNCTION public.user_can_access_company(c uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT c::text=current_setting('test.company',true) $$;
    CREATE FUNCTION public.can_manage_company_people(c uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.user_can_access_company(c) AND current_setting('test.role',true)='admin' $$;
    CREATE FUNCTION public.has_permission_for_company(u uuid,p text,c uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT u=auth.uid() AND public.user_can_access_company(c) AND ((p='can_edit_orders' AND current_setting('test.role',true)='office') OR (p='can_edit_settings_orders' AND current_setting('test.role',true)='planner')) $$;
    ALTER TABLE public.external_teams ENABLE ROW LEVEL SECURITY; ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
    CREATE POLICY company_teams ON public.external_teams FOR SELECT TO authenticated USING(public.user_can_access_company(company_id));
    CREATE POLICY company_employees ON public.employees FOR SELECT TO authenticated USING(public.user_can_access_company(company_id));
    GRANT SELECT ON public.external_teams, public.employees TO authenticated;
  `);
  await db.query("INSERT INTO companies VALUES ($1),($2)", [company, other]);
  await db.query("INSERT INTO external_teams VALUES ($1,$2,'Squadra A','interna',true),($3,$2,'Ditta','esterna',true)", [team, company, external]);
  await db.query("INSERT INTO employees VALUES ($1,$2,'Anna','Bianchi',$3,true),($4,$2,'Bruno','Rossi',null,true),($5,$6,'Altra','Azienda',null,true),($7,$2,'Ex','Dipendente',null,false)", [employee, company, admin, noLogin, foreign, other, inactive]);
  await db.exec(await readFile(new URL("../supabase/proposals/20260924125846_internal_team_rosters_local_proposal.sql", import.meta.url), "utf8"));
  await context(); await db.exec("SET ROLE authenticated");
  const empty = (await db.query("SELECT public.internal_team_roster_v1($1,$2) AS snapshot", [company, team])).rows[0].snapshot;
  assert.equal(empty.roster.version, null); assert.equal(empty.employees.length, 3); pass("snapshot company-scoped without salary fields");
  assert.ok(empty.employees.every(e => !('gross_salary' in e) && !('costo_orario' in e)));
  assert.equal(await save(id(10), [employee, noLogin], null, employee), id(10)); pass("atomic save including employee without account");
  assert.equal(await save(id(10), [noLogin, employee], null, employee), id(10)); pass("idempotent retry ignoring selection order");
  await rejects(() => save(id(10), [employee], null, employee), /dati diversi/, "operation key cannot be reused for a different payload");
  assert.equal(await save(id(11), [employee], id(10)), id(11)); pass("new version keeps previous composition");
  assert.equal(await save(id(10), [employee, noLogin], null, employee), id(10)); pass("lost reply retry after a subsequent version remains idempotent");
  await rejects(() => save(id(12), [employee], id(10)), /altra sessione/, "stale expected version rejected");
  await rejects(() => save(id(12), [], id(11)), /1 a 100/, "empty roster rejected");
  await rejects(() => save(id(12), [employee, employee], id(11)), /duplicati/, "duplicates rejected");
  await rejects(() => save(id(12), [employee, null], id(11)), /non validi/, "null employee rejected");
  await rejects(() => save(id(12), [employee, foreign], id(11)), /altra azienda/, "cross-company member rolls back entire command");
  await rejects(() => save(id(12), [employee, inactive], id(11)), /inattivi/, "inactive member rejected");
  await rejects(() => save(id(12), [employee], id(11), noLogin), /referente/, "leader must be selected");
  await rejects(() => save(id(12), [employee], null, null, external), /interna/, "external supplier is not a crew");
  await rejects(() => db.query("INSERT INTO internal_team_roster_members VALUES($1,$2,$3)", [id(11), company, noLogin]), /row-level security/, "cannot append members to a committed historical version");
  await rejects(() => db.query("DELETE FROM internal_team_roster_versions WHERE id=$1", [id(10)]), /permission denied/, "historical versions cannot be deleted via API role");
  await rejects(() => db.query("UPDATE internal_team_roster_members SET employee_id=$1 WHERE version_id=$2", [employee, id(10)]), /permission denied/, "historical members cannot be rewritten");
  await rejects(() => db.query("INSERT INTO internal_team_roster_versions(id,company_id,team_id) VALUES($1,$2,$3)", [id(30), company, team]), /1 a 100/, "direct incomplete version rolls back at commit");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM internal_team_roster_versions")).rows[0].n, 2); pass("failed operations left no partial version");
  await context("office");
  assert.equal((await db.query("SELECT public.internal_team_roster_v1($1,$2) AS s", [company, team])).rows[0].s.canManage, false);
  await rejects(() => save(id(12), [employee], id(11)), /Accesso negato/, "office can preview but cannot manage roster");
  await context("reader"); await rejects(() => db.query("SELECT public.internal_team_roster_v1($1,$2)", [company, team]), /Accesso negato/, "unprivileged role cannot read roster API");
  await context("admin", other); assert.equal((await db.query("SELECT count(*)::int AS n FROM internal_team_roster_members")).rows[0].n, 0);
  await rejects(() => save(id(12), [employee], id(11)), /Accesso negato/, "company B sees no company A memberships and cannot write");
  await context("admin", company, ""); await rejects(() => save(id(12), [employee], id(11)), /Accesso negato/, "missing authenticated identity rejected");
  await context("admin", company, admin, true); await rejects(() => save(id(12), [employee], id(11)), /Accesso negato/, "blocked user rejected");
  await context("planner"); assert.equal(await save(id(13), [noLogin], id(11), noLogin), id(13)); pass("settings-orders permission can manage without promoting leader");
  await db.exec("RESET ROLE");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM order_employees")).rows[0].n, 0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM order_campo_assignments")).rows[0].n, 0); pass("zero labor costs or Campo assignments created");
  await db.exec("SET ROLE anon"); await rejects(() => db.query("SELECT public.internal_team_roster_v1($1,$2)", [company, team]), /permission denied/, "anon has no RPC execution grant");
  console.log(`${checks} SQL checks passed. Synthetic permissions, not a full Auth/API/Storage or concurrent-session test.`);
} finally { await db.close(); }
