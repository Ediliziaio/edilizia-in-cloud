// Prove del vero importatore con archivio in memoria: nessuna chiamata remota.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const company = 'palma-test', altra = 'altra-azienda';
let handler, autorizzata;
let archivio = [
  {id:'1',company_id:company,vertical:'generico',attivo:true,deleted_at:null,categoria_id:'tipologia-esistente',nome:'Collante rinominato',prezzo_base_vendita:150,prezzo_base_acquisto:20,custom_field_values:{palma_source_sku:'A1',provenienza:'da-conservare'}},
  {id:'2',company_id:altra,vertical:'generico',attivo:true,deleted_at:null,categoria_id:'altra',nome:'Collante rinominato',prezzo_base_vendita:999,custom_field_values:{palma_source_sku:'A1'}},
];
const db = { from(table) {
  const filtri = []; let modifica, nuovi, intervallo;
  const q = {
    select(){return q;},eq(k,v){filtri.push(r=>r[k]===v);return q;},is(k,v){filtri.push(r=>r[k]===v);return q;},
    order(){return q;},range(da,a){intervallo=[da,a];return q;},
    update(p){modifica=p;return q;},insert(p){nuovi=p;return q;},
    maybeSingle:async()=>({data:{company_id:altra}}),
    then(resolve){
      let data = table === 'suppliers' ? [] : archivio.filter(r=>filtri.every(f=>f(r)));
      if(intervallo) data=data.slice(intervallo[0],intervallo[1]+1);
      if(modifica) data.forEach(r=>Object.assign(r,modifica));
      if(nuovi) { archivio.push(...nuovi.map((r,i)=>({...r,id:`nuovo-${archivio.length+i}`,deleted_at:null,categoria_id:null}))); data=[]; }
      return Promise.resolve({data,error:null}).then(resolve);
    },
  };return q;
}};
const cache = new Map();
function load(file) {
  if(cache.has(file)) return cache.get(file);
  const entry = file.endsWith('/catalog-import-batch/index.ts');
  const source = fs.readFileSync(file,'utf8');
  const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  const req=ref=>{
    if(ref.includes('/xhr@'))return {};
    if(ref.includes('/http/server'))return {serve:fn=>handler=fn};
    if(ref.endsWith('/headers.ts'))return {getCorsHeaders:()=>({}),jsonResponse:(d,status=200)=>new Response(JSON.stringify(d),{status}),errorResponse:(error,status)=>new Response(JSON.stringify({error}),{status})};
    if(ref.endsWith('/auth.ts'))return {requireAuth:async()=>({userId:'superadmin-test',supabaseAdmin:db}),requireCompanyAccess:async(_db,_user,id)=>{if(![company,altra].includes(id))throw new Response('Vietato',{status:403});autorizzata=id;}};
    if(ref.startsWith('.'))return load(path.resolve(path.dirname(file),ref));
    throw new Error(`Dipendenza inattesa ${ref}`);
  };
  new Function('require','module','exports',code+(entry?'\nmodule.exports.importFamilies=importFamilies;':''))(req,module,module.exports);
  cache.set(file,module.exports);return module.exports;
}
const {importFamilies}=load(path.resolve('supabase/functions/catalog-import-batch/index.ts'));
const {prezziPerImport}=load(path.resolve('src/lib/catalogo/prezziImport.ts'));
const righe=[prezziPerImport({code:'A1',name:'Nome originale da fattura',cost:40,list_price:300},false),prezziPerImport({code:'B1',name:'Nuovo prodotto',cost:80,list_price:100},false)];
assert.deepEqual(await importFamilies(db,company,righe),{inserted:1,updated:1,skipped:0,errors:[]});
assert.deepEqual(await importFamilies(db,company,righe),{inserted:0,updated:2,skipped:0,errors:[]});
assert.equal(archivio.length,3);
assert.equal(archivio[0].categoria_id,'tipologia-esistente');
assert.equal(archivio[0].prezzo_base_vendita,150);
assert.equal(archivio[0].prezzo_base_acquisto,40);
assert.equal(archivio[0].custom_field_values.provenienza,'da-conservare');
assert.equal(archivio[1].prezzo_base_vendita,999);
assert.equal(archivio[2].prezzo_base_vendita,0);
const duplicati=await importFamilies(db,company,[...righe,{code:'B1',name:'Altro nome ma stesso codice'}]);
assert.equal(duplicati.inserted,0);assert.equal(duplicati.skipped,1);
const req=(id)=>new Request('https://example.invalid',{method:'POST',body:JSON.stringify({company_id:id,object_type:'family',rows:[]})});
assert.equal((await handler(req(company))).status,200);
assert.equal(autorizzata,company);
assert.equal((await handler(req('azienda-vietata'))).status,403);
assert.equal(archivio.length,3);
archivio.push({id:'archiviato',company_id:company,vertical:'generico',attivo:false,deleted_at:null,categoria_id:'tipologia-esistente',nome:'Archiviato',custom_field_values:{catalog_import_sku:'C1'}});
assert.equal((await importFamilies(db,company,[{code:'C1',name:'Archiviato',cost:12}])).updated,1);
assert.equal(archivio.find(r=>r.id==='archiviato').attivo,false);
archivio.push(...Array.from({length:600},(_,i)=>({id:`grande-${i}`,company_id:company,vertical:'generico',attivo:true,deleted_at:null,categoria_id:'tipologia-esistente',nome:`Prodotto ${i}`,custom_field_values:{catalog_import_sku:`L${i}`}})));
assert.equal((await importFamilies(db,company,[{code:'L599',name:'Prodotto 599',cost:45}])).updated,1);
assert.equal(archivio.length,604);
console.log('Import OK: reimport idempotente, prodotti classificati riconosciuti per codice, acquisto/vendita separati, metadati preservati, isolamento azienda e accessi verificati.');
