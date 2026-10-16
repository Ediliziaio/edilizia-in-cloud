import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
export const HOURS_MIGRATION='supabase/migrations/20261016110545_registro_giornaliero_ore_ufficio.sql';
export const HC='10000000-0000-4000-8000-000000000001',HU='10000000-0000-4000-8000-000000000002',HO='10000000-0000-4000-8000-000000000003',HE='10000000-0000-4000-8000-000000000004',HJ='10000000-0000-4000-8000-000000000005';
export async function createDailyHoursDatabase(){
 const db=new PGlite();
 await db.exec(`create schema auth;create role anon;create role authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
 create function get_effective_company_id() returns uuid language sql stable as $$select nullif(current_setting('test.company',true),'')::uuid$$;
 create function utente_bloccato() returns boolean language sql stable as $$select coalesce(current_setting('test.blocked',true),'false')='true'$$;
 create function utente_e_cliente_esterno() returns boolean language sql stable as $$select false$$;
 create function assert_company_access(c uuid) returns void language plpgsql as $$begin if c is distinct from get_effective_company_id() then raise exception 'Azienda non accessibile';end if;end$$;
 create function has_permission_for_company(u uuid,p text,c uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.permission',true),'true')<>'false' and p is distinct from current_setting('test.deny_permission',true)$$;
 create function check_staff_visibility(u uuid,a uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.visible',true),'true')<>'false'$$;
 create function campo_e_ufficio(c uuid) returns boolean language sql stable as $$select true$$;
 create table profiles(id uuid primary key,first_name text,last_name text);
 create table employees(id uuid primary key,company_id uuid,user_id uuid,first_name text,last_name text,is_active boolean default true,costo_orario numeric);
 create function costo_orario_dipendente(e uuid) returns numeric language sql stable as $$select costo_orario from employees where id=e$$;
 create function hr_profilo_da_user(u uuid,c uuid) returns uuid language sql as $$select null::uuid$$;
 create function campo_ore_timbrate_cantiere(p uuid,o uuid,g date) returns jsonb language sql as $$select '{}'::jsonb$$;
 create table orders(id uuid primary key,company_id uuid,assigned_to uuid,deleted_at timestamptz);
 create table order_employees(id uuid primary key default gen_random_uuid(),order_id uuid,employee_id uuid,phase_id uuid,hourly_rate numeric,hours_worked numeric default 0,total_cost numeric default 0);
 create table campo_rapportini(id uuid primary key default gen_random_uuid(),company_id uuid,order_id uuid,user_id uuid,role_type text,data_lavoro date,ore_lavorate numeric,ore_straordinario numeric,descrizione_lavori text,note text,presenze jsonb,presenze_registrate jsonb,source text,stato text,approvato boolean,approvato_da uuid,approvato_at timestamptz,motivo_rifiuto text,fasi_lavorate jsonb default '[]',costo_manodopera numeric,costo_registrato_at timestamptz,updated_at timestamptz default now());
 `);
 const safety=readFileSync('supabase/migrations/20281004140000_ore_persona_si_contano_una_volta.sql','utf8');
 await db.exec(safety.slice(safety.indexOf('create or replace function public.campo_fmt_ore'),safety.indexOf('-- Il trigger di costo:')));
 // Apply the actual production-compatible helpers and cost trigger, without replacing their logic.
 await db.exec(readFileSync('supabase/migrations/20281004150000_rapportino_conflitto_ore_anticipato.sql','utf8'));
 await db.exec(`create trigger registra before update on campo_rapportini for each row execute function fn_rapportino_costo_manodopera();`);
 await db.exec(readFileSync(HOURS_MIGRATION,'utf8'));
 await db.exec(`insert into profiles values('${HU}','Admin','Prova');insert into employees values('${HE}','${HC}',null,'Mario','Rossi',true,25);insert into orders values('${HO}','${HC}','${HU}',null),('${HJ}','${HC}','${HU}',null);select set_config('test.user','${HU}',false);select set_config('test.company','${HC}',false);grant usage on schema public,auth to authenticated,anon;`);
 return db;
}
