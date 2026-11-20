// Esegue SQL proposto e trigger economici reali in Postgres isolato, senza dati cliente.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
const pg = new PGlite();
const c='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', o='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const r='cccccccc-cccc-4ccc-cccc-cccccccccccc', u='dddddddd-dddd-4ddd-dddd-dddddddddddd', other='eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee', v='ffffffff-ffff-4fff-ffff-ffffffffffff';
const proposal='docs/sql-proposte/20290422150000_rapportini_modifica_e_fasi_idempotenti.sql';
const file=(p:string)=>readFile(p,'utf8');
function fn(sql:string,name:string,end='$$;') { const start=sql.indexOf(`create or replace function public.${name}(`); if(start<0) throw new Error(name); return sql.slice(start,sql.indexOf(end,start)+end.length); }
beforeAll(async()=>{
 await pg.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
 create table ctx(company uuid, uid uuid, admin boolean, edit boolean, cost boolean, sale boolean, visible boolean, blocked boolean);
 insert into ctx values('${c}','${u}',false,true,true,true,true,false);
 create function auth.uid() returns uuid language sql stable as $$select uid from ctx$$;
 create function utente_bloccato() returns boolean language sql stable as $$select blocked from ctx$$;
 create function utente_e_cliente_esterno() returns boolean language sql stable as $$select false$$;
 create function has_permission_for_company(uuid,text,uuid) returns boolean language sql stable as $$select company=$3 and case $2 when 'can_edit_orders' then edit when 'can_view_costs' then cost when 'can_view_order_amounts' then sale else true end from ctx$$;
 create function assert_company_access(uuid) returns void language plpgsql as $$begin if $1 is distinct from (select company from ctx) then raise exception 'Azienda estranea' using errcode='42501'; end if; end$$;
 create function get_effective_company_id() returns uuid language sql stable as $$select company from ctx$$;
 create function check_staff_visibility(uuid,uuid) returns boolean language sql stable as $$select visible from ctx$$;
 create function campo_e_ufficio(uuid) returns boolean language sql stable as $$select edit from ctx$$;
 create function e_amministratore_di(uuid) returns boolean language sql stable as $$select admin from ctx$$;
 create table profiles(id uuid,first_name text,last_name text);
 insert into profiles values('${u}','Ufficio','SIM');
 create table orders(id uuid primary key, company_id uuid, assigned_to uuid,deleted_at timestamptz,order_type text);
 create table subcontractors(id uuid,company_id uuid); create table employees(id uuid,company_id uuid); create table mezzi(id uuid,company_id uuid);
 create table campo_rapportini(id uuid primary key,company_id uuid,order_id uuid,user_id uuid,ufficio_employee_id uuid,updated_at timestamptz default now(),annullato_at timestamptz,annullato_da uuid,approvato boolean,stato text,approvato_da uuid,approvato_at timestamptz,descrizione_lavori text,note text,ore_lavorate numeric,ore_straordinario numeric,presenze jsonb,fasi_lavorate jsonb,materiali_usati jsonb,mezzi_usati jsonb,pdf_url text,motivo_rifiuto text,data_lavoro date);
 create table rapportino_voci_libere(id uuid primary key default gen_random_uuid(),rapportino_id uuid,company_id uuid,order_id uuid,descrizione text,quantita numeric,unita text,costo_unitario numeric,vendita_unitaria numeric,company_cost_id uuid,appalto_tariffa_id uuid,viaggio jsonb,updated_at timestamptz default now());
 create table company_costs(id uuid primary key default gen_random_uuid(),company_id uuid,name text,cost_type text,amount numeric,recurrence text,due_date date,is_paid boolean,paid_date date,category text,notes text,order_id uuid,senza_fattura boolean);
 create table appalto_rendiconto_righe(id uuid default gen_random_uuid(),order_id uuid,data date,tariffa_id uuid,quantita numeric,employee_id uuid,fase_id uuid,origine text,rapportino_id uuid,stato text,descrizione text,unita_misura text,prezzo_unitario numeric,costo_interno numeric,note text,voce_libera_id uuid,extra_contratto boolean);
 create table giornale_lavori(order_id uuid,stato text,source_rapportini_ids uuid[]);
 create table avanzamento_dal_rapportino(rapportino_id uuid);
 create table rapportino_modifiche(company_id uuid,order_id uuid,rapportino_id uuid,fatta_da uuid,fatta_da_nome text,motivo text,prima jsonb,dopo jsonb);
 create table order_work_phases(id uuid primary key default gen_random_uuid(),company_id uuid,order_id uuid,name text,position integer,importo_venduto numeric,start_date date,end_date date);
 create table order_work_subphases(id uuid primary key default gen_random_uuid(),phase_id uuid,name text,position integer,peso integer,giorni integer,in_parallelo boolean);`);
 const original=await file('supabase/migrations/20290115160000_rapportino_voci_libere.sql');
 await pg.exec(fn(original,'rapportino_voce_ritira'));
 const recent=await file('supabase/migrations/20290318120100_rapportini_ore_in_economia_rendiconto_unita.sql');
 await pg.exec(fn(recent,'rapportino_voce_applica','$function$;'));
 const start=original.indexOf('create or replace function public.rapportino_voci_trg(');
 await pg.exec(original.slice(start,original.indexOf('-- Il quadro economico',start)));
 await pg.exec(await file('supabase/migrations/20290112110000_annullare_rapportini_conflitto_409.sql'));
 const sql=await file(proposal); await pg.exec(sql); await pg.exec(sql); // migrazione rilanciabile
},30000);
afterAll(()=>pg.close());
beforeEach(async()=>{
 await pg.exec(`truncate rapportino_voci_libere,company_costs,appalto_rendiconto_righe,campo_rapportini,orders,giornale_lavori,rapportino_modifiche,order_work_subphases,order_work_phases,employees,mezzi;
 update ctx set company='${c}',uid='${u}',admin=false,edit=true,cost=true,sale=true,visible=true,blocked=false;
 insert into orders values('${o}','${c}',null,null,'appaltatore_lavoro');
 insert into campo_rapportini(id,company_id,order_id,user_id,approvato,stato,approvato_da,approvato_at,descrizione_lavori,presenze,mezzi_usati,fasi_lavorate,materiali_usati,pdf_url,data_lavoro) values('${r}','${c}','${o}','${other}',true,'approvato','${other}',now(),'Lavori SIM','[]','[]','[]','[]','vecchio.pdf',current_date);
 insert into rapportino_voci_libere(id,rapportino_id,descrizione,quantita,unita,costo_unitario,vendita_unitaria) values('${v}','${r}','Nolo SIM',2,'h',10,20);`);
});
async function report(){return(await pg.query<Record<string,unknown>>('select * from campo_rapportini where id=$1',[r])).rows[0];}
async function line(){return(await pg.query<{updated_at:string;descrizione:string}>('select * from rapportino_voci_libere where id=$1',[v])).rows[0];}
async function edit(campi:object, motivo='Correzione SIM', version?:unknown){return pg.query('select rapportino_correggi($1,$2,$3,$4)',[r,version??(await report()).updated_at,JSON.stringify(campi),motivo]);}
async function editLine(campi:object,motivo='Prezzo errato',version?:unknown){return pg.query('select rapportino_voce_correggi($1,$2,$3,$4)',[v,version??(await line()).updated_at,JSON.stringify(campi),motivo]);}
async function total(){return(await pg.query<{n:number;totale:string}>('select count(*)::integer n, sum(amount)::text totale from company_costs')).rows[0];}
it('corregge costi e rendiconto senza duplicarli e invalida il PDF',async()=>{
 await editLine({descrizione:'Nolo corretto',quantita:3,costo_unitario:15,vendita_unitaria:30});
 expect(await total()).toEqual({n:1,totale:'45.00'});
 const rows=(await pg.query<{quantita:string;prezzo_unitario:string}>('select quantita,prezzo_unitario from appalto_rendiconto_righe')).rows;
 expect(rows).toEqual([{quantita:'3',prezzo_unitario:'30'}]);
 expect((await report()).pdf_url).toBeNull(); expect((await report()).approvato).toBe(true);
 await editLine({quantita:4}); expect(await total()).toEqual({n:1,totale:'60.00'});
});
it('il proprio approvato torna in attesa, ritira i costi e richiede un altro approvatore',async()=>{
 await pg.exec(`update campo_rapportini set user_id='${u}'`);
 await editLine({quantita:3});
 expect(await report()).toMatchObject({approvato:false,stato:'inviato',approvato_da:null,approvato_at:null});
 expect((await total()).n).toBe(0); expect((await pg.query('select * from appalto_rendiconto_righe')).rows).toHaveLength(0);
});
it('consente la correzione del proprio inviato e rimanda in revisione un rifiutato',async()=>{
 await pg.exec(`update campo_rapportini set user_id='${u}',approvato=false,stato='rifiutato',motivo_rifiuto='Errore'`);
 await edit({descrizione_lavori:'Corretto'});
 expect(await report()).toMatchObject({stato:'inviato',approvato:false,motivo_rifiuto:null,descrizione_lavori:'Corretto'});
});
it('non sovrascrive una versione della voce cambiata',async()=>{
 const old=(await line()).updated_at; await editLine({quantita:3});
 await expect(editLine({quantita:4},'Correzione',old)).rejects.toMatchObject({code:'PT409'});
 expect(await total()).toEqual({n:1,totale:'30.00'});
});
it('non sovrascrive una versione del rapportino cambiata',async()=>{
 const old=(await report()).updated_at; await edit({note:'Nuove'});
 await expect(edit({note:'Vecchie'},'Correzione',old)).rejects.toMatchObject({code:'PT409'});
 expect((await report()).note).toBe('Nuove');
});
it.each(['edit','cost','visible','blocked','company'] as const)('rifiuta la modifica senza accesso: %s',async(kind)=>{
 await pg.exec(kind==='company'?`update ctx set company='${other}'`:`update ctx set ${kind}=${kind==='blocked'?'true':'false'}`);
 await expect(editLine({quantita:3})).rejects.toMatchObject({code:'42501'});
 expect(await total()).toEqual({n:1,totale:'20.00'});
});
it('non permette di scrivere la vendita senza permesso, ma conserva quella esistente',async()=>{
 await pg.exec('update ctx set sale=false');
 await expect(editLine({vendita_unitaria:50})).rejects.toMatchObject({code:'42501'});
 await editLine({descrizione:'Solo testo'});
 expect((await pg.query<{vendita_unitaria:string}>('select vendita_unitaria from rapportino_voci_libere')).rows[0].vendita_unitaria).toBe('20');
});
it.each(['rendiconto','giornale'] as const)('blocca documenti immutabili: %s',async(kind)=>{
 await pg.exec(kind==='rendiconto'?"update appalto_rendiconto_righe set stato='confermato'":`insert into giornale_lavori values('${o}','firmata',array['${r}']::uuid[])`);
 await expect(editLine({quantita:3})).rejects.toMatchObject({code:'23514'});
 await expect(edit({note:'No'})).rejects.toMatchObject({code:'23514'});
 expect(await total()).toEqual({n:1,totale:'20.00'});
});
it('un valore non valido annulla tutta la correzione, compreso il PDF',async()=>{
 await expect(editLine({quantita:0})).rejects.toMatchObject({code:'22023'});
 expect(await total()).toEqual({n:1,totale:'20.00'}); expect((await report()).pdf_url).toBe('vecchio.pdf');
});
it('motivo obbligatorio sugli approvati e storico senza prezzi',async()=>{
 await expect(editLine({quantita:3},'')).rejects.toMatchObject({code:'22023'});
 await editLine({quantita:3,costo_unitario:98765,vendita_unitaria:123456});
 const audit=JSON.stringify((await pg.query('select prima,dopo from rapportino_modifiche')).rows);
 expect(audit).toContain('Nolo SIM'); expect(audit).not.toContain('98765'); expect(audit).not.toContain('123456');
});
it('rifiuta operai e mezzi di un’altra azienda',async()=>{
 await pg.exec(`insert into employees values('${u}','${other}'); insert into mezzi values('${u}','${other}')`);
 await expect(edit({presenze:[{employee_id:u,nome:'Estraneo',ore:8}]})).rejects.toMatchObject({code:'42501'});
 await expect(edit({mezzi_usati:[{mezzo_id:u,nome:'Estraneo',ore:8}]})).rejects.toMatchObject({code:'42501'});
});
it('rifiuta un annullato',async()=>{await pg.exec('update campo_rapportini set annullato_at=now()'); await expect(edit({note:'No'})).rejects.toMatchObject({code:'23514'});});
async function model(fasi:object[]){return(await pg.query<{n:number}>('select aggiungi_fasi_commessa($1,$2) n',[o,JSON.stringify(fasi)])).rows[0].n;}
it('riapplicare il modello, anche con maiuscole e spazi, mantiene fasi, date e venduto',async()=>{
 expect(await model([{nome:' Fase uno ',venduto:500,data_inizio:'2026-11-01',data_fine:'2026-11-10',sottofasi:[{nome:'Sotto uno'}]}])).toBe(1);
 expect(await model([{nome:'FASE   UNO',venduto:999,sottofasi:[{nome:' SOTTO UNO '},{nome:'Sotto due'}]},{nome:'Fase due'}])).toBe(1);
 expect(await model([{nome:'Fase uno'},{nome:'Fase due'}])).toBe(0);
 const phases=(await pg.query<{name:string;importo_venduto:string}>('select name,importo_venduto from order_work_phases order by position')).rows;
 expect(phases).toEqual([{name:'Fase uno',importo_venduto:'500.00'},{name:'Fase due',importo_venduto:null}]);
 expect((await pg.query('select * from order_work_subphases')).rows).toHaveLength(2);
});
it('un errore nel modello non lascia fasi inserite a metà',async()=>{
 await pg.exec('update ctx set sale=false');
 await expect(model([{nome:'Prima'},{nome:'Seconda',venduto:5}])).rejects.toMatchObject({code:'42501'});
 expect((await pg.query('select * from order_work_phases')).rows).toHaveLength(0);
});
it('modello non disponibile su commesse non visibili o nel cestino',async()=>{
 await pg.exec('update ctx set visible=false'); await expect(model([{nome:'No'}])).rejects.toMatchObject({code:'42501'});
 await pg.exec('update ctx set visible=true; update orders set deleted_at=now()'); await expect(model([{nome:'No'}])).rejects.toMatchObject({code:'42501'});
});
it('le nuove RPC sono chiuse a pubblico e anon',async()=>{
 const rows=(await pg.query<{anon:boolean;utente:boolean}>("select has_function_privilege('anon','rapportino_voce_correggi(uuid,timestamptz,jsonb,text)','execute') anon, has_function_privilege('authenticated','rapportino_voce_correggi(uuid,timestamptz,jsonb,text)','execute') utente")).rows;
 expect(rows).toEqual([{anon:false,utente:true}]);
});

async function cancel(motivo='Prova', version?:unknown){return pg.query('select campo_rapportino_annulla($1,$2,$3)',[r,version??(await report()).updated_at,motivo]);}
it('elimina un rapportino di prova senza cancellarlo fisicamente e ritira costi e rendiconto',async()=>{
 await cancel();expect(await report()).toMatchObject({stato:'rifiutato',approvato:false,annullato_da:u,pdf_url:null});expect((await report()).annullato_at).not.toBeNull();
 expect((await total()).n).toBe(0);expect((await pg.query('select * from appalto_rendiconto_righe')).rows).toHaveLength(0);await cancel();
});
it('anche un proprio rifiutato può essere eliminato',async()=>{
 await pg.exec(`update campo_rapportini set approvato=false,stato='rifiutato',user_id='${u}'`);await cancel();expect((await report()).annullato_at).not.toBeNull();
});
it('eliminazione richiede motivo, versione e documenti ancora modificabili',async()=>{
 await expect(cancel('')).rejects.toMatchObject({code:'22023'});await expect(cancel('Prova','2020-01-01')).rejects.toMatchObject({code:'PT409'});
 await pg.exec("update appalto_rendiconto_righe set stato='confermato'");await expect(cancel()).rejects.toMatchObject({code:'23514'});expect((await report()).annullato_at).toBeNull();expect((await total()).n).toBe(1);
});

it('rifiuta quantità negative anche se il client salta la validazione',async()=>{await expect(edit({materiali_usati:[{nome:'SIM',quantita:-2}]})).rejects.toMatchObject({code:'22023'});await expect(edit({ore_lavorate:25})).rejects.toMatchObject({code:'22023'});});

it('le ore già annullate dall’ufficio non si riattivano passando dalla correzione',async()=>{await pg.exec(`update campo_rapportini set approvato=false,stato='rifiutato',ufficio_employee_id='${u}'`);await expect(edit({note:'No'})).rejects.toMatchObject({code:'23514'});});

it('un autore legacy nullo non fa perdere l’approvazione durante una correzione dell’ufficio',async()=>{await pg.exec('update campo_rapportini set user_id=null');await edit({note:'Nota corretta'});expect((await report()).approvato).toBe(true);});
it('una pagina firmata protegge il rapporto anche se il suo stato è incoerente',async()=>{await pg.exec(`update campo_rapportini set approvato=false,stato='inviato';insert into giornale_lavori values('${o}','firmata',array['${r}']::uuid[])`);await expect(edit({note:'No'})).rejects.toMatchObject({code:'23514'});});
