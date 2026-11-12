import{assertLocalFixture,rest,sql,userId,companyId,orderId}from'./backend.mjs';
import{writeFileSync}from'node:fs';
assertLocalFixture();const checks=[];
function check(n,name,expected,actual){const ok=expected===actual;checks.push({actor:n,name,expected,actual,ok});console.log(`${ok?'PASS':'FAIL'} ${n} ${name}`)}
for(const n of [6,12]){
 const id=`dd000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
 const payload={id,company_id:companyId,order_id:orderId,user_id:userId(n),role_type:n===6?'employee':'subcontractor',ore_lavorate:8,descrizione_lavori:'Prova campo sintetica',stato:'bozza'};
 try{
  const created=rest(n,'/campo_rapportini_visibili','POST',payload,{Prefer:'return=representation'});
  check(n,'crea il proprio rapportino senza accedere alle tariffe',201,created.status);
  rest(n,`/campo_rapportini_visibili?id=eq.${id}`,'PATCH',{ore_lavorate:7});
  check(n,'modifica le proprie ore',7,Number(sql(`select ore_lavorate from campo_rapportini where id='${id}'`)));
  rest(n,`/campo_rapportini?id=eq.${id}`,'PATCH',{costo_manodopera:123456},{Prefer:'return=minimal'});
  check(n,'non forza un costo del personale',false,Number(sql(`select costo_manodopera from campo_rapportini where id='${id}'`))===123456);
  sql(`begin;set local session_replication_role=replica;delete from campo_rapportini where id='${id}';commit;`);
  for(const [scenario,extra]of [['altro autore',{user_id:userId(1)}],['commessa non assegnata',{order_id:'d0000000-0000-4000-a000-000000000004'}],['altra azienda',{company_id:'b0000000-0000-4000-a000-000000000001',order_id:'d0000000-0000-4000-a000-000000000002'}]]){
   rest(n,'/campo_rapportini_visibili','POST',{...payload,...extra},{Prefer:'return=minimal'});
   check(n,`non crea rapportino per ${scenario}`,0,Number(sql(`select count(*) from campo_rapportini where id='${id}'`)));
   sql(`begin;set local session_replication_role=replica;delete from campo_rapportini where id='${id}';commit;`);
  }
 }finally{sql(`begin;set local session_replication_role=replica;delete from campo_rapportini where id='${id}';commit;`)}
}
const result={checks:checks.length,passed:checks.every(c=>c.ok),details:checks};writeFileSync('/tmp/eic-allroles-field.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
