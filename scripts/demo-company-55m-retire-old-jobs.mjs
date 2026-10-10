/** Recoverable retirement of the exact 41 audited, unstarted Demo 2 fixtures. */
import { existsSync } from 'node:fs';
import { C, DIR, q, j, read, save, sql, guard, run } from './demo-company-55m.mjs';

const codes = `DEMO-0314C567 DEMO-4E3B4E81 DEMO-4F315974 DEMO-797ED4CB DEMO-7A4BC459 DEMO-7FD5FACC DEMO-9B654B33 DEMO-9E9ECFDE DEMO-9EA72000 DEMO-A119AD6F DEMO-CDE36E15 DEMO-D0446C90 DEMO-E7D1A6E8 DEMO-F0693630 LAV-2026-001 ORD-2026-004 ORD-2026-006 ORD-2026-009 ORD-2026-016 ORD-2026-020 ORD-2026-021 ORD-2026-022 ORD-2026-023 ORD-2026-024 ORD-2026-C01 ORD-2026-C02 ORD-DEM-SR06 ORD-DEM-SR07 ORD-DEM-SR08 ORD-DEM-SR09 ORD-DEM-SR10 ORD-DEM-SR11 ORD-DEM-SR12 ORD-DEM-SR13 ORD-DEM-SR14 ORD-DEM-SR15 ORD-DEM-SR16 ORD-DEM-SR17 ORD-DEM-SR18 ORD-DEM-SR19 ORD-DEM-SR20`.split(' ');
const stage = 'retire-old-jobs';
const marker = '[DEMO CLEANUP 2026-10-10] Vecchio scenario non avviato: cestinato su richiesta. Documenti e movimenti conservati; ripristinabile.';
const mode = process.argv[2] ?? 'audit';
guard();

function financialFingerprint() {
  const tables = ['documenti_fiscali', 'invoices', 'prima_nota_entries', 'movimenti_cassa_native', 'scadenze', 'company_costs', 'purchase_orders', 'fatture_ricevute', 'hr_cedolini', 'warehouse_movements'];
  return sql(`select jsonb_build_object(${tables.map(t => `${q(t)},(select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) from public.${t} r where company_id=${q(C)})`).join(',')},'margins',(select md5(coalesce(jsonb_agg(jsonb_build_object('id',id,'consuntivo',consuntivo) order by id)::text,'[]')) from v_ordine_marginalita where company_id=${q(C)})) data`)[0].data;
}

if (mode === 'audit') {
  if (existsSync(`${DIR}/${stage}-before.json`)) throw Error('Original retirement snapshot already exists; use verify or existing plan.');
  const rows = sql(`select * from orders where company_id=${q(C)} and order_code in (${codes.map(q).join(',')}) order by order_code`);
  if (rows.length !== codes.length || rows.some(r => r.deleted_at || Number(r.percentuale_avanzamento) !== 0 || !r.work_end_date || r.work_end_date >= '2026-10-10')) throw Error('Retirement targets no longer match the reviewed old fixtures');
  const ids = rows.map(r => q(r.id)).join(',');
  const [executed] = sql(`select (select count(*) from campo_rapportini where company_id=${q(C)} and order_id in (${ids})) reports,(select count(*) from order_work_phases where order_id in (${ids}) and (percentuale>0 or status<>'da_iniziare')) advanced`);
  if (executed.reports || executed.advanced) throw Error('Do not retire newly executed work');
  const dependencies = read('retirement-dependencies');
  const children = {};
  for (let i = 0; i < dependencies.length; i += 15) {
    const chunk = dependencies.slice(i, i + 15);
    Object.assign(children, sql(`select jsonb_build_object(${chunk.map(({tab,col}) => `${q(tab+':'+col)},(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from public.${tab} r where ${col} in (${ids}))`).join(',')}) data`)[0].data);
  }
  const before = { company: C, at: new Date().toISOString(), rows, children, financial: financialFingerprint() };
  save(`${stage}-before`, before);
  const batches = rows.map(row => [
    `do $$begin if not exists(select 1 from orders where id=${q(row.id)} and company_id=${q(C)} and deleted_at is null and updated_at=${q(row.updated_at)} and version=${q(row.version)} and percentuale_avanzamento=0) or exists(select 1 from campo_rapportini where order_id=${q(row.id)}) or exists(select 1 from order_work_phases where order_id=${q(row.id)} and (percentuale>0 or status<>'da_iniziare')) then raise exception 'Retirement target changed';end if;end $$;`,
    `update orders set deleted_at=transaction_timestamp(),internal_notes=concat_ws(E'\n',nullif(internal_notes,''),${q(marker)}) where id=${q(row.id)} and company_id=${q(C)} and deleted_at is null;`,
  ]);
  const groups = [];
  for (let i = 0; i < batches.length; i += 8) groups.push(batches.slice(i, i + 8).flat());
  save(`${stage}-plan`, { company: C, codes, marker, recoverable: true, batches: groups });
  console.log({ targets: rows.length, advanced: executed.advanced, reports: executed.reports, dependentRows: Object.fromEntries(Object.entries(children).filter(([,v]) => v.length).map(([k,v]) => [k,v.length])), financialWrites: 0, permanentDeletes: 0 });
} else if (mode === 'dry' || mode === 'apply') {
  run(stage, mode === 'dry');
} else if (mode === 'verify') {
  const before = read(`${stage}-before`);
  const rows = sql(`select * from orders where company_id=${q(C)} and id in (${before.rows.map(r=>q(r.id)).join(',')}) order by order_code`);
  const financial = financialFingerprint();
  const errors = [];
  if (rows.length !== codes.length || rows.some(r => !r.deleted_at || !r.internal_notes?.includes(marker))) errors.push('Retirement missing');
  for (const row of rows) {
    const old = before.rows.find(r => r.id === row.id);
    for (const key of Object.keys(old)) if (!['deleted_at','internal_notes','updated_at','version'].includes(key) && JSON.stringify(row[key]) !== JSON.stringify(old[key])) errors.push(`${row.order_code}: changed ${key}`);
  }
  if (JSON.stringify(financial) !== JSON.stringify(before.financial)) errors.push('Financial or warehouse records changed');
  const result = { company: C, at: new Date().toISOString(), retired: rows.filter(r=>r.deleted_at).length, recoverable: true, financialUnchanged: JSON.stringify(financial)===JSON.stringify(before.financial), errors };
  save(`${stage}-verified`, result);
  console.log(result);
  if (errors.length) process.exitCode=1;
} else throw Error('audit | dry | apply | verify');
