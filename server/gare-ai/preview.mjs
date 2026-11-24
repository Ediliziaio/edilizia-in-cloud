import { z } from 'zod';
import { draftFile } from './documents.mjs';
import { execFile } from '../gare-ai/runtime.mjs';
import { promisify } from 'node:util';
import { mkdtemp,readFile,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const exec=promisify(execFile);

// A preview renders an existing tenant-visible revision. It never creates an
// offer document, a storage object, an approval or an audit version.
export async function previewDraft(ctx,body){
 const input=z.object({draft_id:z.string().uuid(),revision:z.number().int().positive(),page:z.number().int().min(1).max(500).default(1)}).strict().parse(body);
 const{data:draft,error}=await ctx.client.from('gare_ai_drafts').select('*').eq('id',input.draft_id).eq('company_id',ctx.companyId).single();
 if(error||!draft){const e=Error('Bozza non disponibile per questa azienda.');e.status=404;throw e;}
 if(draft.revision!==input.revision){const e=Error('La bozza è cambiata: aggiorna la revisione prima dell’anteprima.');e.status=409;throw e;}
 const output=await draftFile(draft,'pdf');
 const dir=await mkdtemp(path.join(tmpdir(),'gare-draft-preview-'));
 try{
  const source=path.join(dir,'draft.pdf');await writeFile(source,output.buffer);
  const{stdout}=await exec('pdfinfo',[source],{timeout:10_000,maxBuffer:100_000});const pageCount=Number(stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
  if(!pageCount)throw Error('Numero di pagine del PDF non disponibile.');
  if(input.page>pageCount){const e=Error('La pagina richiesta non esiste in questa revisione.');e.status=400;throw e;}
  await exec('pdftoppm',['-f',String(input.page),'-l',String(input.page),'-singlefile','-scale-to','1400','-png',source,path.join(dir,'page')],{timeout:20_000,maxBuffer:100_000});
  const image=await readFile(path.join(dir,'page.png'));
  return {name:output.name,content_type:output.contentType,base64:output.buffer.toString('base64'),image_base64:image.toString('base64'),page:input.page,page_count:pageCount,revision:draft.revision,preview:true};
 }finally{await rm(dir,{recursive:true,force:true});}
}
