// PostgreSQL reale (PGlite), isolato e in memoria. Nessun dato cloud.
// Dipendenza di test: npm install --prefix .tmp/wl-db --no-save @electric-sql/pglite
// Esecuzione: NODE_PATH=<directory contenente @electric-sql/pglite> node scripts/test-white-label-plan.mjs
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
const id = n => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
await db.exec(`
 create role anon; create role authenticated;
 create schema auth;
 create type public.app_role as enum ('super_admin');
 create function auth.uid() returns uuid language sql as 'select null::uuid';
 create function public.has_role(uuid, public.app_role) returns boolean language sql as 'select false';
 create table subscription_plans(id uuid primary key, slug text, price_monthly numeric default 0, features jsonb default '[]');
 create table companies(id uuid primary key, subscription_plan_id uuid references subscription_plans, white_label_enabled boolean default false, brand_primary_color text default '#1E40AF');
 create table company_branding(company_id uuid unique references companies, whitelabel_tier text not null default 'none', is_active boolean default true, custom_domain text, custom_domain_cname text, custom_domain_verified boolean default false, custom_domain_verified_at timestamptz, primary_color text, logo_url text);
 create function company_branding_campi_piano() returns trigger language plpgsql as $$begin return new; end$$;
 create trigger trg_company_branding_campi_piano before insert or update on company_branding for each row execute function company_branding_campi_piano();
 create function sync_white_label_enabled() returns trigger language plpgsql security definer as $$begin update companies set white_label_enabled=(new.whitelabel_tier <> 'none') where id=new.company_id; return new; end$$;
 create trigger trg_sync_white_label_enabled after insert or update of whitelabel_tier on company_branding for each row execute function sync_white_label_enabled();
 insert into subscription_plans(id,slug) values ('${id(1)}','starter'),('${id(2)}','pro'),('${id(3)}','enterprise');
 insert into companies(id,subscription_plan_id) values ('${id(10)}','${id(2)}'),('${id(11)}','${id(1)}');
 insert into company_branding(company_id,whitelabel_tier,primary_color,logo_url) values ('${id(11)}','agency','#0F766E','logo-personalizzato.png');
`);
const migrations = new URL('../supabase/migrations/', import.meta.url);
const migration = readdirSync(migrations).find(name => name.endsWith('_white_label_incluso_piano_pro.sql'));
assert.ok(migration, 'Migrazione White Label presente');
const sql = readFileSync(new URL(migration, migrations), 'utf8');
await db.exec(`begin; ${sql} commit;`);
let checks = 0;
async function expectState(company, expected) {
 const { rows } = await db.query('select c.white_label_enabled, c.brand_primary_color, b.whitelabel_tier,b.whitelabel_manual_tier,b.primary_color,b.logo_url,b.is_active from companies c left join company_branding b on b.company_id=c.id where c.id=$1', [id(company)]);
 for (const [k,v] of Object.entries(expected)) assert.equal(rows[0][k],v,`${company}: ${k}`);
 checks++;
}
await expectState(10, {white_label_enabled:true,whitelabel_tier:'full',whitelabel_manual_tier:'none',brand_primary_color:'#1E40AF'});
await expectState(11, {white_label_enabled:true,whitelabel_tier:'agency',primary_color:'#0F766E',logo_url:'logo-personalizzato.png'});
await db.exec(`insert into companies(id,subscription_plan_id) values ('${id(12)}','${id(2)}'),('${id(13)}','${id(1)}'),('${id(14)}','${id(3)}');`);
await expectState(12, {white_label_enabled:true,whitelabel_tier:'full',whitelabel_manual_tier:'none'});
await expectState(13, {white_label_enabled:false,whitelabel_tier:'none'});
await expectState(14, {white_label_enabled:true,whitelabel_tier:'full'});
await db.exec(`update companies set subscription_plan_id='${id(2)}' where id='${id(13)}';`);
await expectState(13, {white_label_enabled:true,whitelabel_tier:'full'});
await db.exec(`update companies set subscription_plan_id='${id(1)}' where id='${id(13)}';`);
await expectState(13, {white_label_enabled:false,whitelabel_tier:'none',is_active:false});
await db.exec(`update company_branding set whitelabel_tier='basic',primary_color='#0F766E' where company_id='${id(13)}'; update companies set subscription_plan_id='${id(2)}' where id='${id(13)}';`);
await expectState(13, {whitelabel_tier:'full',whitelabel_manual_tier:'basic',primary_color:'#0F766E'});
await db.exec(`update companies set subscription_plan_id='${id(1)}' where id='${id(13)}';`);
await expectState(13, {white_label_enabled:true,whitelabel_tier:'basic',primary_color:'#0F766E'});
await db.exec(`update companies set subscription_plan_id='${id(2)}' where id='${id(11)}'; update companies set subscription_plan_id='${id(1)}' where id='${id(11)}';`);
await expectState(11, {whitelabel_tier:'agency',whitelabel_manual_tier:'agency',primary_color:'#0F766E'});
await db.exec(`grant usage on schema public,auth to authenticated; grant select,update,insert on companies,company_branding,subscription_plans to authenticated; grant execute on all functions in schema auth to authenticated;`);
// Il prezzo attuale non è un criterio di autorizzazione.
await db.exec(`update subscription_plans set price_monthly=199 where slug='pro'; update subscription_plans set price_monthly=999 where slug='starter'; insert into companies(id,subscription_plan_id) values ('${id(15)}','${id(2)}'),('${id(16)}','${id(1)}');`);
await expectState(15, {white_label_enabled:true,whitelabel_tier:'full'});
await expectState(16, {white_label_enabled:false,whitelabel_tier:'none'});
await db.exec('set role authenticated');
await assert.rejects(db.exec(`update company_branding set whitelabel_manual_tier='agency' where company_id='${id(13)}';`), /Il piano White-Label/);
checks++;
// Il browser può ancora personalizzare il marchio, senza acquisire Agency.
await db.exec(`update company_branding set primary_color='#7E22CE' where company_id='${id(13)}';`);
await db.exec('reset role');
await expectState(13, {whitelabel_tier:'basic',whitelabel_manual_tier:'basic',primary_color:'#7E22CE'});
// La console aggiorna la concessione mantenendo il tier come target UPDATE OF.
// Questo fa eseguire il trigger che sincronizza il flag runtime dopo il BEFORE.
await db.exec(`update company_branding set whitelabel_manual_tier='full', whitelabel_tier=whitelabel_tier, is_active=true where company_id='${id(16)}';`);
await expectState(16, {white_label_enabled:true,whitelabel_tier:'full',whitelabel_manual_tier:'full',is_active:true,brand_primary_color:'#1E40AF'});
await db.exec(`update company_branding set whitelabel_manual_tier='none', whitelabel_tier=whitelabel_tier, is_active=false where company_id='${id(16)}';`);
await expectState(16, {white_label_enabled:false,whitelabel_tier:'none',whitelabel_manual_tier:'none',is_active:false});
await db.exec(`update company_branding set whitelabel_manual_tier='agency', whitelabel_tier=whitelabel_tier, is_active=true where company_id='${id(15)}';`);
await expectState(15, {white_label_enabled:true,whitelabel_tier:'agency',whitelabel_manual_tier:'agency'});
await db.exec(`update company_branding set whitelabel_manual_tier='none', whitelabel_tier=whitelabel_tier, is_active=true where company_id='${id(15)}';`);
await expectState(15, {white_label_enabled:true,whitelabel_tier:'full',whitelabel_manual_tier:'none',brand_primary_color:'#1E40AF'});
await db.close();
console.log(`${checks} verifiche PostgreSQL superate: attivazione, upgrade, downgrade, diritti manuali, colori e protezione del tier.`);
