import { PGlite } from "@electric-sql/pglite";
import { existsSync, readFileSync } from "node:fs";
import { beforeAll,afterAll,expect,it } from "vitest";
const a='a0000000-0000-4000-a000-000000000001',b='b0000000-0000-4000-a000-000000000001';
const id=(n:number)=>`c0000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
const name='20290421120000_finanza_revisioni_live.sql';
const sql=readFileSync(existsSync(`supabase/migrations/${name}`)?`supabase/migrations/${name}`:`docs/migrazioni-pronte/${name}`,'utf8');
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create schema private;create role authenticated;create role anon;create role service_role;
 create publication supabase_realtime;
 create table companies(id uuid primary key);insert into companies values('${a}'),('${b}');
 create function user_can_access_company(uuid) returns boolean language sql as $$select $1='${a}'$$;
 create function puo_vedere_scadenze(uuid) returns boolean language sql as $$select $1='${a}' and coalesce(current_setting('test.finance',true),'yes')='yes'$$;
 create function ai_is_service_role() returns boolean language sql as $$select false$$;
 create function assert_company_access(uuid) returns void language plpgsql as $$begin if $1<>'${a}' then raise exception 'Non autorizzato' using errcode='42501';end if;end$$;
 create table orders(id uuid primary key,company_id uuid references companies(id) on delete cascade);
 create table order_installments(id uuid primary key,order_id uuid references orders(id) on delete cascade);
 `);
 for(const table of ['scadenze','prima_nota_entries','company_costs','rate_fornitori','fatture_ricevute','invoices','invoice_payments','documenti_fiscali','movimenti_cassa_native','ordini_variazione','unita_movimenti','unita_immobiliari','note_credito_storni'])
   await db.exec(`create table ${table}(id uuid primary key,company_id uuid references companies(id) on delete cascade);`);
 await db.exec(sql);
},20000);
afterAll(async()=>{await db.close()});
const fingerprint=async(company=a)=>(await db.query<{r:string}>('select finanza_revisione($1) r',[company])).rows[0].r;
it("una sola notifica per azienda/commit anche su sorgenti diverse",async()=>{
 await db.exec(`begin;insert into orders values('${id(1)}','${a}');insert into company_costs values('${id(2)}','${a}');
 insert into prima_nota_entries values('${id(3)}','${a}');insert into orders values('${id(4)}','${b}');commit;`);
 const rows=(await db.query<{company_id:string;n:number}>('select company_id,count(*)::int n from finanza_revisioni group by company_id')).rows;
 expect(rows).toHaveLength(2);expect(rows.every(r=>r.n===1)).toBe(true);
});
it("aggiornamenti e cancellazioni cambiano la revisione senza creare movimenti",async()=>{
 const before=await fingerprint();await db.exec(`update company_costs set id='${id(5)}' where id='${id(2)}'`);
 const after=await fingerprint();expect(after).not.toBe(before);
 await db.exec(`delete from company_costs where id='${id(5)}'`);expect(await fingerprint()).not.toBe(after);
 expect((await db.query('select * from prima_nota_entries')).rows).toHaveLength(1);
});
it("le rate individuano l'azienda dalla commessa, e un rollback non invia segnali",async()=>{
 const before=await fingerprint();await db.exec(`begin;insert into order_installments values('${id(6)}','${id(1)}');rollback;`);
 expect(await fingerprint()).toBe(before);
 await db.exec(`insert into order_installments values('${id(6)}','${id(1)}')`);expect(await fingerprint()).not.toBe(before);
});
it("l'impronta cambia anche per una transazione tardiva con una data precedente",async()=>{
 const before=await fingerprint();await db.exec(`insert into finanza_revisioni(company_id,updated_at) values('${a}',now()-interval '12 hours')`);
 expect(await fingerprint()).not.toBe(before);
});
it("ripulisce al massimo cento vecchi segnali senza toccare dati finanziari",async()=>{
 await db.exec(`insert into finanza_revisioni(company_id,updated_at) select '${a}',now()-interval '2 days' from generate_series(1,150);
 insert into invoices values('${id(7)}','${a}');`);
 const r=await db.query<{n:number}>("select count(*)::int n from finanza_revisioni where updated_at<now()-interval '1 day'");
 expect(r.rows[0].n).toBe(50);expect((await db.query('select * from invoices')).rows).toHaveLength(1);
});
it("la pubblicazione contiene solo i metadati, mai le tabelle contabili",async()=>{
 expect((await db.query("select tablename from pg_publication_tables where pubname='supabase_realtime'")).rows).toEqual([{tablename:'finanza_revisioni'}]);
 expect((await db.query<{column_name:string}>("select column_name from information_schema.columns where table_name='finanza_revisioni' order by ordinal_position")).rows.map(r=>r.column_name)).toEqual(['company_id','revisione','updated_at']);
});
it("rispetta RLS, blocca scritture dirette e nega l'accesso agli utenti senza finanza",async()=>{
 await db.exec('set role authenticated');
 expect((await db.query<{company_id:string}>('select * from finanza_revisioni')).rows.every(r=>r.company_id===a)).toBe(true);
 await expect(fingerprint(b)).rejects.toMatchObject({code:'42501'});
 await expect(db.exec(`insert into finanza_revisioni(company_id) values('${a}')`)).rejects.toMatchObject({code:'42501'});
 await db.exec("set test.finance='no'");expect((await db.query('select * from finanza_revisioni')).rows).toHaveLength(0);
 await expect(fingerprint()).rejects.toMatchObject({code:'42501'});
 await db.exec("reset role;set test.finance='yes'");
});
it("il purge dell'azienda non viene bloccato dai trigger dei figli",async()=>{
 await db.exec(`delete from companies where id='${b}'`);
 expect((await db.query('select * from finanza_revisioni where company_id=$1',[b])).rows).toHaveLength(0);
});
it("la migrazione è idempotente e anon non può eseguire la RPC",async()=>{
 await db.exec(sql);
 expect((await db.query<{ok:boolean}>("select not has_function_privilege('anon',oid,'EXECUTE') ok from pg_proc where proname='finanza_revisione'")).rows[0].ok).toBe(true);
});
