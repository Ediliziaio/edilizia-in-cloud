// LOCAL SYNTHETIC FIXTURE ONLY. Auth/PostgREST/Postgres are real, application
// authorization helpers/base policies are reduced fixtures, NOT a production audit.
// Requires a NEW unlinked Supabase CLI project in the dedicated colima-eic-squadre VM.
// Never reads repository .env files. Creates only local .invalid test accounts.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const project = path.resolve(process.argv[2] ?? "missing-project");
assert.match(project, /\/lavo\/work\/squadre-backend\.[A-Za-z0-9]+$/);
const config = await readFile(path.join(project, "supabase/config.toml"), "utf8");
const projectId = config.match(/^project_id = "([^"]+)"/m)?.[1];
assert.match(projectId ?? "", /^squadre-backend\.[A-Za-z0-9]+$/);
const env = { ...process.env, DOCKER_HOST: "unix:///Users/agenteai/.colima/eic-squadre/docker.sock" };
const keys = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { cwd: project, env, stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" }));
assert.equal(keys.API_URL, "http://127.0.0.1:58321");
const container = `supabase_db_${projectId}`;
function sql(text) {
  return execFileSync("docker", ["--context", "colima-eic-squadre", "exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-Atq"], { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const company=id(1), other=id(2), team=id(4), employee=id(5), noLogin=id(6), foreign=id(7), inactive=id(8), external=id(9), replacement=id(14), order=id(20), order2=id(21), orderForeign=id(22), phase=id(23), phaseOther=id(24);
let checks=0;
function pass(name) { checks++; console.log(`PASS ${name}`); }
async function request(endpoint, body, token, method="POST") {
  const response = await fetch(`${keys.API_URL}${endpoint}`, { method, signal: AbortSignal.timeout(15000), headers: { apikey: keys.ANON_KEY, Authorization: `Bearer ${token ?? keys.ANON_KEY}`, "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data=text; }
  return { ok: response.ok, status: response.status, data };
}
const rpc = (name, body, token) => request(`/rest/v1/rpc/${name}`, body, token);
async function ok(result, name) { assert.equal(result.ok,true, JSON.stringify(result.data)); pass(name); return result.data; }
async function denied(result, pattern, name) { assert.equal(result.ok,false, JSON.stringify(result.data)); assert.match(result.data.message ?? String(result.data),pattern); pass(name); }
const password="Only-local-fixture-2026!";
const identities={};
for (const name of ["admin","office","planner","worker","blocked","other"]) {
  const email=`crew-shift-${name}@example.invalid`;
  const login = await request("/auth/v1/token?grant_type=password", { email,password });
  let session=login;
  if (!login.ok) {
    const create=await request("/auth/v1/admin/users", { email,password,email_confirm:true }, keys.SERVICE_ROLE_KEY);
    assert.equal(create.ok,true,JSON.stringify(create.data));
    session=await request("/auth/v1/token?grant_type=password", { email,password });
  }
  assert.equal(session.ok,true,JSON.stringify(session.data));
  identities[name]={id:session.data.user.id,token:session.data.access_token};
}
const token=identities.admin.token;
const exists=sql("SELECT to_regclass('public.eic_crew_local_test_marker') IS NOT NULL");
if (exists==='t') {
  assert.equal(sql("SELECT marker FROM public.eic_crew_local_test_marker"),'synthetic-shifts-v1');
  // Explicit test-owned targets only. Marker and dedicated Docker context guard reruns.
  sql("TRUNCATE public.internal_team_shift_versions,public.internal_team_roster_members,public.internal_team_roster_versions;");
} else {
  assert.equal(sql("SELECT to_regclass('public.orders') IS NULL"),'t',"Refusing to install fixture over an application database");
  const rosterSql=await readFile(new URL("../supabase/proposals/20260924125846_internal_team_rosters_local_proposal.sql",import.meta.url),"utf8");
  const shiftSql=await readFile(new URL("../supabase/proposals/20260924133316_internal_team_shifts_local_proposal.sql",import.meta.url),"utf8");
  sql(`BEGIN;
    CREATE TABLE public.eic_crew_local_test_marker(marker text PRIMARY KEY);
    INSERT INTO public.eic_crew_local_test_marker VALUES('synthetic-shifts-v1');
    REVOKE ALL ON public.eic_crew_local_test_marker FROM anon,authenticated;
    CREATE TABLE public.eic_crew_test_identities(id uuid PRIMARY KEY,company_id uuid,permission text,blocked boolean);
    ALTER TABLE public.eic_crew_test_identities ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.eic_crew_test_identities FROM anon,authenticated;
    GRANT SELECT ON public.eic_crew_test_identities TO authenticated;
    CREATE POLICY own_identity ON public.eic_crew_test_identities FOR SELECT TO authenticated USING(id=auth.uid());
    CREATE TABLE public.companies(id uuid PRIMARY KEY);
    CREATE TABLE public.external_teams(id uuid PRIMARY KEY,company_id uuid,name text,kind text,is_active boolean);
    CREATE TABLE public.employees(id uuid PRIMARY KEY,company_id uuid,first_name text,last_name text,user_id uuid,is_active boolean);
    CREATE TABLE public.orders(id uuid PRIMARY KEY,company_id uuid);
    CREATE TABLE public.order_work_phases(id uuid PRIMARY KEY,company_id uuid,order_id uuid);
    CREATE TABLE public.order_employees(id uuid PRIMARY KEY,total_cost numeric,hours_worked numeric);
    CREATE TABLE public.order_campo_assignments(id uuid PRIMARY KEY,is_capocantiere boolean);
    CREATE FUNCTION public.utente_bloccato() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce((SELECT blocked FROM public.eic_crew_test_identities WHERE id=auth.uid()),true) $$;
    CREATE FUNCTION public.user_can_access_company(c uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM public.eic_crew_test_identities WHERE id=auth.uid() AND company_id=c) $$;
    CREATE FUNCTION public.can_manage_company_people(c uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM public.eic_crew_test_identities WHERE id=auth.uid() AND company_id=c AND permission='admin') $$;
    CREATE FUNCTION public.has_permission_for_company(u uuid,p text,c uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM public.eic_crew_test_identities WHERE id=auth.uid() AND id=u AND company_id=c AND ((permission='office' AND p='can_edit_orders') OR (permission='planner' AND p='can_edit_settings_orders'))) $$;
    ALTER TABLE public.external_teams ENABLE ROW LEVEL SECURITY; ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY; ALTER TABLE public.order_work_phases ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_teams ON public.external_teams FOR SELECT TO authenticated USING(public.user_can_access_company(company_id));
    CREATE POLICY tenant_employees ON public.employees FOR SELECT TO authenticated USING(public.user_can_access_company(company_id));
    CREATE POLICY tenant_orders ON public.orders FOR SELECT TO authenticated USING(public.user_can_access_company(company_id));
    CREATE POLICY tenant_phases ON public.order_work_phases FOR SELECT TO authenticated USING(public.user_can_access_company(company_id));
    REVOKE ALL ON public.companies,public.external_teams,public.employees,public.orders,public.order_work_phases,public.order_employees,public.order_campo_assignments FROM anon,authenticated;
    GRANT SELECT ON public.external_teams,public.employees,public.orders,public.order_work_phases TO authenticated;
    ${rosterSql}
    ${shiftSql}
    COMMIT;
  `);
}
// Keep ONLY these proposal functions current when repeating the isolated fixture.
// Tables/schema changes still require a new scratch project, not an implicit reset.
sql('CREATE SCHEMA IF NOT EXISTS internal_team_planning; REVOKE ALL ON SCHEMA internal_team_planning FROM PUBLIC,anon,authenticated; GRANT USAGE ON SCHEMA internal_team_planning TO authenticated;');
for (const file of ['20260924125846_internal_team_rosters_local_proposal.sql','20260924133316_internal_team_shifts_local_proposal.sql']) {
  const source=await readFile(new URL(`../supabase/proposals/${file}`,import.meta.url),'utf8');
  const functions=[...source.matchAll(/^CREATE FUNCTION (?:public\.(?:internal_team_|save_internal_team_)|internal_team_planning\.)[\s\S]*?^\$\$;/gm)].map(m=>m[0].replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'));
  assert.ok(functions.length>=3);
  sql(functions.join('\n'));
  if (file.includes('shifts')) {
    sql('DROP POLICY crew_shift_read ON public.internal_team_shift_versions;'+source.match(/CREATE POLICY crew_shift_read[\s\S]*?;/)[0]);
    sql('REVOKE ALL ON FUNCTION internal_team_planning.has_overlap_v1(uuid,uuid,date,time,time,uuid[]) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION internal_team_planning.has_overlap_v1(uuid,uuid,date,time,time,uuid[]) TO authenticated;');
  }
}
// All values below are locally generated UUIDs, not arbitrary SQL input.
sql("ALTER FUNCTION public.utente_bloccato() SET search_path=''; ALTER FUNCTION public.user_can_access_company(uuid) SET search_path=''; ALTER FUNCTION public.can_manage_company_people(uuid) SET search_path=''; ALTER FUNCTION public.has_permission_for_company(uuid,text,uuid) SET search_path='';");
sql(`INSERT INTO public.companies VALUES('${company}'),('${other}') ON CONFLICT DO NOTHING;
  INSERT INTO public.external_teams VALUES('${team}','${company}','Squadra ristrutturazioni','interna',true),('${external}','${company}','Ditta esterna','esterna',true) ON CONFLICT DO NOTHING;
  INSERT INTO public.employees VALUES('${employee}','${company}','Anna','Bianchi','${identities.worker.id}',true),('${noLogin}','${company}','Bruno','Rossi',null,true),('${replacement}','${company}','Carlo','Verdi',null,true),('${foreign}','${other}','Altra','Azienda',null,true),('${inactive}','${company}','Ex','Dipendente',null,false) ON CONFLICT DO NOTHING;
  UPDATE public.employees SET is_active=true WHERE id='${employee}';
  UPDATE public.external_teams SET is_active=true WHERE id='${team}';
  INSERT INTO public.orders VALUES('${order}','${company}'),('${order2}','${company}'),('${orderForeign}','${other}') ON CONFLICT DO NOTHING;
  INSERT INTO public.order_work_phases VALUES('${phase}','${company}','${order}'),('${phaseOther}','${company}','${order2}') ON CONFLICT DO NOTHING;
  INSERT INTO public.order_employees VALUES('${id(30)}',125,5) ON CONFLICT DO NOTHING;
  INSERT INTO public.order_campo_assignments VALUES('${id(31)}',true) ON CONFLICT DO NOTHING;
  ${Object.entries(identities).map(([name,u])=>`INSERT INTO public.eic_crew_test_identities VALUES('${u.id}','${name==='other'?other:company}','${name==='other'?'admin':name}',${name==='blocked'}) ON CONFLICT(id) DO UPDATE SET company_id=excluded.company_id,permission=excluded.permission,blocked=excluded.blocked;`).join('\n')}
  NOTIFY pgrst,'reload schema';
`);
// Readiness is retried only for PostgREST's schema cache, never for a failed mutation.
for(let attempt=0;attempt<20;attempt++) {
  const probe=await rpc('internal_team_shifts_v1',{p_company_id:company,p_order_id:order,p_from:'2026-09-24',p_to:'2026-09-24'},token);
  if(probe.ok) break;
  if(probe.data.code!=='PGRST202') throw new Error(JSON.stringify(probe.data));
  await new Promise(r=>setTimeout(r,150));
}
const roster=id(100);
await ok(await rpc('save_internal_team_roster_v1',{p_company_id:company,p_team_id:team,p_expected_version:null,p_operation_id:roster,p_employee_ids:[employee,noLogin],p_leader_employee_id:employee},token),'roster saved through real local Auth + REST');
function payload(n,patch={}) { return {p_company_id:company,p_order_id:order,p_team_id:team,p_shift_id:id(n+1000),p_expected_version:null,p_operation_id:id(n),p_roster_version:roster,p_work_date:'2026-09-24',p_start_time:'08:00',p_end_time:'12:00',p_phase_id:phase,p_employee_ids:[employee,noLogin],p_leader_employee_id:employee,p_notes:'',p_status:'planned',...patch}; }
const save=(p,t=token)=>rpc('save_internal_team_shift_v1',p,t);
const first=payload(200);
assert.equal(await ok(await save(first),'atomic crew shift including employee without login'),first.p_operation_id);
await ok(await save({...first,p_employee_ids:[noLogin,employee]}),'idempotent retry does not duplicate shift');
const versionConflict=await save({...first,p_notes:'changed'});
assert.equal(versionConflict.status,409);assert.equal(versionConflict.data.code,'PT409');
await denied(versionConflict,/dati diversi/,'operation ID cannot be reused with different payload; finite HTTP 409');
await denied(await save(payload(201)),/sovrapposto/,'overlap on same site rejected');
await denied(await save(payload(202,{p_order_id:order2,p_phase_id:null})),/sovrapposto/,'overlap on another site rejected');
await ok(await save(payload(203,{p_order_id:order2,p_phase_id:null,p_start_time:'12:00',p_end_time:'16:00'})),'same employee on two sites with adjacent shifts');
await ok(await save(payload(204,{p_employee_ids:[replacement],p_leader_employee_id:replacement})),'replacement tracked without rewriting standard roster');
for (const [patch,pattern,label] of [
  [{p_employee_ids:[]},/1 a 100/,'empty crew'],[{p_employee_ids:[employee,employee]},/duplicati/,'duplicate person'],
  [{p_employee_ids:[employee,null]},/non validi/,'null person'],[{p_employee_ids:[foreign]},/altra azienda/,'cross-company person'],
  [{p_employee_ids:[inactive]},/inattivi/,'inactive person'],[{p_employee_ids:[replacement],p_leader_employee_id:noLogin},/referente/,'leader outside actual crew'],
  [{p_order_id:orderForeign},/Commessa/,'cross-company order'],[{p_team_id:external},/Squadra interna/,'external firm used as crew'],
  [{p_phase_id:phaseOther},/Lavorazione/,'phase from another site'],[{p_end_time:'07:00',p_employee_ids:[replacement],p_leader_employee_id:null},/check constraint/,'negative time range'],
  [{p_start_time:'08:00:30'},/minuto/,'seconds in scheduling time'],[{p_notes:'x'.repeat(1001),p_work_date:'2026-09-25'},/check constraint/,'oversize notes'],
]) await denied(await save(payload(210,{p_work_date:'2026-09-26',...patch})),pattern,`${label} rejected atomically`);
for (const name of ['worker','blocked','other','planner']) await denied(await save(payload(211),identities[name].token),/Accesso negato/,`${name} cannot schedule this crew`);
await ok(await save(payload(212,{p_work_date:'2026-09-25'}),identities.office.token),'orders editor can schedule without changing roster');
const cancelled={...first,p_operation_id:id(220),p_expected_version:first.p_operation_id,p_status:'cancelled'};
await ok(await save(cancelled),'cancellation appends a version and preserves history');
await ok(await save(first),'lost original reply remains idempotent after cancellation');
await denied(await save({...first,p_operation_id:id(221)}),/altra sessione/,'stale modification rejected');
await denied(await save({...cancelled,p_operation_id:id(222),p_expected_version:id(220)}),/non annullabile/,'cancelled shift cannot be cancelled twice under a new ID');
await ok(await save(payload(223)),'cancelled shift releases planning overlap, not Campo access');
const results=await Promise.all([save(payload(230,{p_work_date:'2026-09-27'})),save(payload(231,{p_work_date:'2026-09-27',p_order_id:order2,p_phase_id:null}))]);
assert.equal(results.filter(r=>r.ok).length,1,JSON.stringify(results));
assert.equal(results.filter(r=>r.data?.code==='23P01').length,1,JSON.stringify(results));pass('real concurrent REST transactions: exactly one overlapping shift wins');
const same=payload(232,{p_work_date:'2026-09-28'});
const retries=await Promise.all([save(same),save(same)]);
assert.ok(retries.every(r=>r.ok&&r.data===same.p_operation_id),JSON.stringify(retries));pass('concurrent same-operation retries return the same receipt');
const parallelVersion={...same,p_expected_version:same.p_operation_id,p_start_time:'09:00',p_end_time:'13:00'};
const versions=await Promise.all([save({...parallelVersion,p_operation_id:id(233)}),save({...parallelVersion,p_operation_id:id(234)})]);
assert.equal(versions.filter(r=>r.ok).length,1,JSON.stringify(versions));pass('concurrent revisions cannot fork the shift');
const direct={id:id(240),shift_id:id(1240),company_id:company,order_id:order,team_id:team,roster_version:roster,phase_id:null,work_date:'2026-09-29',start_time:'08:00',end_time:'12:00',employee_ids:[foreign],leader_employee_id:null,notes:'',status:'planned'};
await denied(await request('/rest/v1/internal_team_shift_versions',direct,token),/altra azienda/,'direct table insert cannot bypass validation');
await denied(await request('/rest/v1/internal_team_shift_versions',{...direct,employee_ids:[employee],created_by:identities.worker.id},token),/permission denied/,'direct insert cannot forge actor');
await denied(await request(`/rest/v1/internal_team_shift_versions?id=eq.${id(223)}`,{notes:'rewrite'},token,'PATCH'),/permission denied/,'history cannot be updated');
await denied(await request(`/rest/v1/internal_team_shift_versions?id=eq.${id(223)}`,undefined,token,'DELETE'),/permission denied/,'history cannot be deleted');
const hidden=await request('/rest/v1/internal_team_shift_versions?select=id',undefined,identities.other.token,'GET');
assert.deepEqual(hidden.data,[]);pass('other company cannot read shift history');
await denied(await save(payload(250),keys.ANON_KEY),/permission denied/,'anonymous role cannot invoke command');
sql(`UPDATE public.employees SET is_active=false WHERE id='${employee}'; UPDATE public.external_teams SET is_active=false WHERE id='${team}';`);
await ok(await save({...payload(223),p_operation_id:id(251),p_expected_version:id(223),p_status:'cancelled'}),'cancellation works after employee and crew deactivation');
sql(`UPDATE public.employees SET is_active=true WHERE id='${employee}'; UPDATE public.external_teams SET is_active=true WHERE id='${team}';`);
await ok(await rpc('save_internal_team_roster_v1',{p_company_id:company,p_team_id:team,p_expected_version:roster,p_operation_id:id(101),p_employee_ids:[employee,replacement],p_leader_employee_id:replacement},token),'later standard roster version saved');
await denied(await save(payload(252,{p_work_date:'2026-09-30'})),/Composizione modificata/,'new shift rejects stale standard roster');
const rows=await ok(await rpc('internal_team_shifts_v1',{p_company_id:company,p_order_id:order,p_from:'2026-09-24',p_to:'2026-09-30'},token),'read model includes latest versions only');
const substitute=rows.find(s=>s.version===id(204));
assert.ok(substitute.participants.some(p=>p.id===employee&&p.kind==='excluded'));
assert.ok(substitute.participants.some(p=>p.id===replacement&&p.kind==='replacement'));
assert.ok(substitute.participants.some(p=>p.id===noLogin&&p.kind==='excluded'));
pass('effective crew snapshot survives later changes to habitual roster');
assert.equal(sql('SELECT count(*)||\':\'||sum(total_cost)||\':\'||sum(hours_worked) FROM public.order_employees'),'1:125:5');
assert.equal(sql('SELECT count(*)||\':\'||count(*) FILTER(WHERE is_capocantiere) FROM public.order_campo_assignments'),'1:1');
pass('legacy labor costs, worked hours and existing Campo roles remain exactly unchanged');
// Model an editor restricted to one site. No other-site details may leak, but
// the privileged boolean-only occupancy lookup must still prevent a double shift.
sql(`ALTER POLICY tenant_orders ON public.orders USING(public.user_can_access_company(company_id) AND (public.can_manage_company_people(company_id) OR id<>'${order2}'));`);
const officeRows=await request('/rest/v1/internal_team_shift_versions?select=order_id',undefined,identities.office.token,'GET');
assert.ok(officeRows.ok&&officeRows.data.every(r=>r.order_id!==order2));pass('site-restricted editor cannot read another site planning');
await denied(await save(payload(260,{p_roster_version:id(101),p_start_time:'12:00',p_end_time:'14:00'}),identities.office.token),/sovrapposto/,'hidden other-site shift still prevents overlapping scheduling');
sql('ALTER POLICY tenant_orders ON public.orders USING(public.user_can_access_company(company_id));');
console.log(`${checks} local Auth/REST/Postgres checks passed. Base application authorization policies are synthetic fixtures; no production audit or automatic Campo sync claimed.`);
