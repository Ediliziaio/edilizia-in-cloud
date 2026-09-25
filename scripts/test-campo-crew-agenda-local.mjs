// Runs only inside the pre-existing, marked synthetic local fixture.
// All schema/data changes roll back. No repository env, remote service or saved token.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
const container = "supabase_db_squadre-backend.Zi9DAN";
const sql = text => execFileSync("docker", ["--context", "colima-eic-squadre", "exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-Atq"], { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
assert.equal(sql("SELECT marker FROM public.eic_crew_local_test_marker"), "synthetic-shifts-v1");
const proposal = await readFile(new URL("../supabase/proposals/campo_crew_agenda_local_proposal.sql", import.meta.url), "utf8");
const identity = permission => sql(`SELECT id FROM public.eic_crew_test_identities WHERE permission='${permission}' AND blocked=false LIMIT 1`);
const worker = identity("worker"), office = identity("office"), admin = identity("admin");
const blocked = sql("SELECT id FROM public.eic_crew_test_identities WHERE blocked LIMIT 1");
for (const uid of [worker, office, admin, blocked]) assert.match(uid, /^[a-f0-9-]{36}$/);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const c=id(1), other=id(2), team=id(4), employee=id(5), replacement=id(14), order=id(20), order2=id(21), phase=id(23);
const roster = sql(`SELECT id FROM public.internal_team_roster_versions WHERE team_id='${team}' ORDER BY sequence DESC LIMIT 1`);
assert.match(roster, /^[a-f0-9-]{36}$/);
const actor = uid => `RESET ROLE; SELECT set_config('request.jwt.claim.sub','${uid}',true); SET LOCAL ROLE authenticated;`;
const feed = (from="2099-05-01", to=from, company=c) => `public.campo_my_team_shifts_v1('${company}','${from}','${to}')`;
const shift = (n, { site=order, day="2099-05-01", start="08:00", end="12:00", members=[employee], previous=null, shiftId=id(n+10000), status="planned" }={}) => `SELECT public.save_internal_team_shift_v1('${c}','${site}','${team}','${shiftId}',${previous ? `'${previous}'` : "NULL"},'${id(n)}','${roster}','${day}','${start}','${end}',${site===order ? `'${phase}'` : "NULL"},ARRAY[${members.map(x=>`'${x}'::uuid`).join(",")}],NULL,'Solo collaudo','${status}');`;
const check = (condition, label) => `SELECT pg_temp.check_agenda((${condition}), '${label.replaceAll("'", "''")}');`;
const body = `BEGIN;
CREATE FUNCTION pg_temp.check_agenda(ok boolean,label text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %',label; END IF; RETURN 'PASS '||label; END; $$;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_code text, ADD COLUMN IF NOT EXISTS description text, ADD COLUMN IF NOT EXISTS indirizzo_lavori text;
ALTER TABLE public.order_work_phases ADD COLUMN IF NOT EXISTS name text;
UPDATE public.orders SET order_code='TEST-A',description='Cantiere sintetico A',indirizzo_lavori='Indirizzo di prova' WHERE id='${order}';
UPDATE public.orders SET order_code='TEST-B',description='Cantiere sintetico B' WHERE id='${order2}';
UPDATE public.order_work_phases SET name='Posa' WHERE id='${phase}';
UPDATE public.employees SET is_active=true,user_id='${worker}' WHERE id='${employee}';
UPDATE public.employees SET is_active=true,user_id='${office}' WHERE id='${replacement}';
UPDATE public.external_teams SET is_active=true WHERE id='${team}';
CREATE TEMP TABLE agenda_legacy_before AS SELECT (SELECT jsonb_agg(to_jsonb(e)) FROM public.order_employees e) AS costs,(SELECT jsonb_agg(to_jsonb(a)) FROM public.order_campo_assignments a) AS access;
${proposal}
${actor(admin)}
${shift(9100)}
${shift(9101,{site:order2,start:"12:00",end:"16:00"})}
${shift(9102,{day:"2099-05-02"})}
${actor(worker)}
${check(`jsonb_array_length(${feed()})=2`, "worker sees two consecutive sites in one day")}
${check(`${feed()}->0->>'orderCode'='TEST-A' AND ${feed()}->1->>'orderCode'='TEST-B'`, "minimal site identities and chronological ordering")}
${check(`${feed()}->0->>'phaseName'='Posa'`, "phase belongs to assigned site")}
${check(`NOT (${feed()}->0 ?| ARRAY['participants','employeeIds','notes','is_capocantiere','total_cost'])`, "no crew roster private notes costs or capo authority exposed")}
${check(`(SELECT count(*) FROM public.internal_team_shift_versions)=0`, "personal feed does not open source shift table")}
DO $$ BEGIN PERFORM ${feed("2099-05-01","2099-06-02")}; RAISE EXCEPTION 'range accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END $$;
${check("true", "oversize interval rejected")}
DO $$ BEGIN PERFORM ${feed("2099-05-01","2099-05-01",other)}; RAISE EXCEPTION 'other company accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
${check("true", "another company is rejected")}
${actor(office)}
${check(`jsonb_array_length(${feed()})=0`, "other active account cannot read worker agenda")}
${actor(blocked)}
DO $$ BEGIN PERFORM ${feed()}; RAISE EXCEPTION 'blocked accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
${check("true", "blocked account denied")}
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',true); SET LOCAL ROLE authenticated;
DO $$ BEGIN PERFORM ${feed()}; RAISE EXCEPTION 'no uid accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
${check("true", "authenticated role without identity denied")}
RESET ROLE;
${check("NOT has_function_privilege('anon','public.campo_my_team_shifts_v1(uuid,date,date)','EXECUTE') AND NOT has_function_privilege('anon','internal_team_planning.my_agenda_v1(uuid,date,date)','EXECUTE')", "anonymous execution privileges revoked on both functions")}
${actor(admin)}
${shift(9103,{previous:id(9100),shiftId:id(19100),members:[replacement]})}
${actor(worker)}
${check(`jsonb_array_length(${feed()})=1 AND ${feed()}->0->>'orderCode'='TEST-B'`, "removal cannot resurrect the older worker version")}
${actor(office)}
${check(`jsonb_array_length(${feed()})=1`, "replacement receives the revised personal shift")}
${actor(admin)}
${shift(9104,{previous:id(9101),shiftId:id(19101),site:order2,start:"12:00",end:"16:00",status:"cancelled"})}
${actor(worker)}
${check(`${feed()}->0->>'status'='cancelled'`, "cancellation reaches personal feed without deleting history")}
${actor(admin)}
${shift(9105,{previous:id(9102),shiftId:id(19102),day:"2099-05-03"})}
${actor(worker)}
${check(`jsonb_array_length(${feed("2099-05-02")})=0 AND jsonb_array_length(${feed("2099-05-03")})=1`, "rescheduling across date range cannot expose stale day")}
RESET ROLE; UPDATE public.employees SET is_active=false WHERE id='${employee}';
${actor(worker)}
${check(`jsonb_array_length(${feed("2099-05-03")})=0`, "employee deactivation revokes personal feed")}
RESET ROLE; UPDATE public.employees SET is_active=true,user_id='${office}' WHERE id='${employee}';
${actor(worker)}
${check(`jsonb_array_length(${feed("2099-05-03")})=0`, "old linked account loses agenda")}
${actor(office)}
${check(`jsonb_array_length(${feed("2099-05-03")})=0`, "new linked account does not inherit old snapshot")}
RESET ROLE; UPDATE public.employees SET user_id='${worker}',company_id='${other}' WHERE id='${employee}';
${actor(worker)}
${check(`jsonb_array_length(${feed("2099-05-03")})=0`, "employee company transfer revokes personal feed")}
RESET ROLE; UPDATE public.employees SET company_id='${c}' WHERE id='${employee}'; UPDATE public.external_teams SET is_active=false WHERE id='${team}';
${actor(worker)}
${check(`jsonb_array_length(${feed("2099-05-03")})=0`, "inactive team not scheduled as active work")}
RESET ROLE;
${check(`(SELECT costs FROM agenda_legacy_before) IS NOT DISTINCT FROM (SELECT jsonb_agg(to_jsonb(e)) FROM public.order_employees e) AND (SELECT access FROM agenda_legacy_before) IS NOT DISTINCT FROM (SELECT jsonb_agg(to_jsonb(a)) FROM public.order_campo_assignments a)`, "legacy costs hours and assignments unchanged")}
ROLLBACK;`;
try {
  const output = sql(body).split("\n").filter(line => line.startsWith("PASS "));
  assert.equal(output.length,21);
  console.log(output.join("\n"));
  console.log(`${output.length} real local PostgreSQL checks passed; transaction rolled back. Base auth helpers are synthetic fixtures, not full application RLS.`);
} catch (e) { console.error(e.stderr?.toString() || e.message); process.exitCode=1; }
