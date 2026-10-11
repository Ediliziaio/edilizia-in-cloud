/** Same emitted invoice in the legacy UI: link its native PDF, do not issue twice. */
import {createClient} from '@supabase/supabase-js';
import {execFileSync} from 'node:child_process';
import {C,q,sql,guard,context,read,save,has} from './demo-company-accounting-audit.mjs';
guard();
const rows=sql(`select i.id,d.pdf_url from invoices i join documenti_fiscali d on d.id=i.id and d.company_id=i.company_id where i.company_id=${q(C)} and i.pdf_url is null and not i.status in('draft','cancelled') and i.deleted_at is null and d.pdf_url is not null order by i.id`);
const keys=JSON.parse(execFileSync('supabase',['projects','api-keys','--project-ref','rsbrguhkodgnqfomrevo','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})),key=keys.find(k=>k.name==='service_role')?.api_key;if(!key)throw Error('No storage authorization');
const host='rsbrguhkodgnqfomrevo.supabase.co',client=createClient('https://'+host,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.timeout(25000)})}});
const log=has('pdf-mirrors')?read('pdf-mirrors'):{company:C,completed:[]};
for(let i=0;i<rows.length;i+=16){
 const entries=await Promise.all(rows.slice(i,i+16).map(async x=>{
  let url;
  if(x.pdf_url.startsWith('https://')){const u=new URL(x.pdf_url);if(u.hostname!==host||!u.pathname.includes('/documenti-fiscali/'))throw Error('Unexpected PDF origin '+x.id);url=x.pdf_url;}
  else{if(!x.pdf_url.startsWith(C+'/'))throw Error('Unexpected tenant PDF path '+x.id);const {data,error}=await client.storage.from('documenti-fiscali').createSignedUrl(x.pdf_url,31536000);if(error)throw Error('Native PDF missing '+x.id);url=data.signedUrl;}
  return {id:x.id,statement:`update invoices set pdf_url=${q(url)},pdf_generated_at=now() where company_id=${q(C)} and id=${q(x.id)} and pdf_url is null;`};
 }));
 sql(`begin;${context}${entries.map(x=>x.statement).join('\n')}commit;`);log.completed.push(...entries.map(x=>x.id));save('pdf-mirrors',log);if(i%80===0||i+16>=rows.length)console.log(`PDF MIRRORS ${i+entries.length}/${rows.length}`);
}
