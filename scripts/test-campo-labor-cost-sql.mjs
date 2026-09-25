// Native Node TS stripping + PostgreSQL WASM. Synthetic, memory-only, no network.
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";
import {reviewHourlyCost,laborLineCost} from "../src/lib/campo/laborCostReview.ts";
const require=createRequire(import.meta.url);
const modulePath=process.argv[2]??require.resolve("@electric-sql/pglite");
const {PGlite}=await import(pathToFileURL(modulePath).href);
const db=new PGlite();
const company="00000000-0000-4000-8000-000000000001",employee="00000000-0000-4000-8000-000000000002";
const user="00000000-0000-4000-8000-000000000003",order="00000000-0000-4000-8000-000000000004",report="00000000-0000-4000-8000-000000000005";
try {
  await db.exec(`
    CREATE TABLE public.employees(id uuid primary key, company_id uuid,user_id uuid,costo_orario numeric,gross_salary numeric,monthly_hours numeric,inps_rate numeric);
    CREATE FUNCTION public.user_can_access_company(id uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT id::text=current_setting('test.company',true) $$;
    CREATE TABLE public.order_employees(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,order_id uuid,employee_id uuid,phase_id uuid,hourly_rate numeric NOT NULL,hours_worked numeric,total_cost numeric);
    CREATE TABLE public.campo_rapportini(id uuid PRIMARY KEY,company_id uuid,order_id uuid,user_id uuid,stato text,ore_lavorate numeric,ore_straordinario numeric,fasi_lavorate jsonb,presenze jsonb,presenze_registrate jsonb,costo_manodopera numeric,costo_registrato_at timestamptz);
  `);
  await db.query("SELECT set_config('test.company',$1,false)",[company]);
  const sql=await readFile(new URL("../supabase/migrations/20280228000001_rpc_definer_guardia_company.sql",import.meta.url),"utf8");
  const functionSql=sql.match(/CREATE OR REPLACE FUNCTION public\.costo_orario_dipendente[\s\S]*?\$function\$;/)?.[0];
  assert.ok(functionSql,"Existing function must be found, never substitute an invented SQL formula");
  await db.exec(functionSql);
  await db.exec(await readFile(new URL("../supabase/migrations/20280910000001_campo_costo_manodopera_null.sql",import.meta.url),"utf8"));
  await db.exec("CREATE TRIGGER cost BEFORE UPDATE ON public.campo_rapportini FOR EACH ROW EXECUTE FUNCTION public.fn_rapportino_costo_manodopera()");
  const cases=[
    {costo_orario:25,gross_salary:2000,monthly_hours:160,inps_rate:28},
    {costo_orario:null,gross_salary:2000,monthly_hours:160,inps_rate:0},
    {costo_orario:null,gross_salary:2000,monthly_hours:160,inps_rate:null},
    {costo_orario:0,gross_salary:1600,monthly_hours:160,inps_rate:0},
    {costo_orario:null,gross_salary:1750,monthly_hours:173,inps_rate:28},
    {costo_orario:null,gross_salary:2000,monthly_hours:null,inps_rate:28},
    {costo_orario:0,gross_salary:null,monthly_hours:null,inps_rate:null},
    {costo_orario:1.005,gross_salary:null,monthly_hours:null,inps_rate:null},
    {costo_orario:99.95,gross_salary:null,monthly_hours:null,inps_rate:null},
    {costo_orario:null,gross_salary:1.005,monthly_hours:1,inps_rate:0},
  ];
  for(const fixture of cases){
    await db.query("INSERT INTO employees VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET costo_orario=$4,gross_salary=$5,monthly_hours=$6,inps_rate=$7",[employee,company,user,fixture.costo_orario,fixture.gross_salary,fixture.monthly_hours,fixture.inps_rate]);
    const {rows}=await db.query("SELECT public.costo_orario_dipendente($1) AS rate",[employee]);
    const rate=Number(rows[0].rate), preview=reviewHourlyCost({id:employee,user_id:user,...fixture});
    assert.equal(preview.amount??0,rate);
    for(const hours of [0,0.1,3.5,8,24]){
      const actual=await db.query("SELECT round($1::numeric*$2::numeric,2) AS cost",[hours,rate]);
      assert.equal(laborLineCost(hours,rate),Number(actual.rows[0].cost));
    }
  }
  console.log("PASS 10 tariff cases and 50 monetary products against existing SQL");
  await db.query("UPDATE employees SET costo_orario=25 WHERE id=$1",[employee]);
  await db.query("INSERT INTO campo_rapportini(id,company_id,order_id,user_id,stato,ore_lavorate,ore_straordinario) VALUES($1,$2,$3,$4,'inviato',4,1)",[report,company,order,user]);
  await db.query("UPDATE campo_rapportini SET stato='approvato' WHERE id=$1",[report]);
  let saved=(await db.query("SELECT * FROM campo_rapportini WHERE id=$1",[report])).rows[0];
  assert.equal(Number(saved.costo_manodopera),125);
  await db.query("UPDATE campo_rapportini SET stato='approvato' WHERE id=$1",[report]);
  assert.equal(Number((await db.query("SELECT sum(total_cost) AS n FROM order_employees")).rows[0].n),125);
  await db.query("UPDATE employees SET costo_orario=40 WHERE id=$1",[employee]);
  await db.query("UPDATE campo_rapportini SET stato='rifiutato' WHERE id=$1",[report]);
  assert.equal(Number((await db.query("SELECT sum(total_cost) AS n FROM order_employees")).rows[0].n),0);
  await db.query("UPDATE campo_rapportini SET ore_lavorate=8,presenze=$2,stato='approvato' WHERE id=$1",[report,JSON.stringify([{employee_id:employee,ore:3},{subappaltatore_id:"external",ore:8}])]);
  saved=(await db.query("SELECT * FROM campo_rapportini WHERE id=$1",[report])).rows[0];
  assert.equal(Number(saved.costo_manodopera),120);
  console.log("PASS approval, same-report retry, snapshot reversal after tariff change, crew replaces author/external presence");
  await db.query("SELECT set_config('test.company',$1,false)",["other-company"]);
  assert.equal((await db.query("SELECT public.costo_orario_dipendente($1) AS rate",[employee])).rows[0].rate,null);
  console.log("PASS existing function company guard on synthetic identities (not a full RLS/API test)");
}finally{await db.close();}
