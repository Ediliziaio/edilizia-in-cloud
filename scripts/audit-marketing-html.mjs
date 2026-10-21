/** Audit the generated public HTML, without executing scripts or contacting services. */
import fs from 'node:fs';import path from 'node:path';import {validateJsonLd} from './validate-jsonld.mjs';
const dist=path.resolve(process.argv[2]||'dist'),files=[];
function visit(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()&&e.name!=='assets')visit(p);else if(e.isFile()&&e.name==='index.html')files.push(p)}}visit(dist);
const results=files.filter(file=>!(file===path.join(dist,'index.html')&&fs.existsSync(path.join(dist,'_home/index.html')))).map(file=>{
 const html=fs.readFileSync(file,'utf8');const route=path.relative(dist,path.dirname(file)).replaceAll(path.sep,'/');
 const h1s=[...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m=>m[1].replace(/<[^>]+>/g,'').trim());
 const title=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'';
 const errors=validateJsonLd(html);
 if(h1s.length!==1)errors.push(`Expected one H1, found ${h1s.length}`);
 if(!title)errors.push('Missing title');
 const images=[...html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);
 for(const src of images){if(src.startsWith('/')&&!src.startsWith('//')&&!fs.existsSync(path.join(dist,src.split('?')[0])))errors.push('Missing image: '+src)}
 return{route:route==='_home'?'/':'/'+route+'/',title,h1:h1s[0]||'',images:images.length,errors};
});
fs.mkdirSync('docs/marketing',{recursive:true});
fs.writeFileSync('docs/marketing/generated-page-audit.json',JSON.stringify({generatedAt:new Date().toISOString(),pages:results},null,2)+'\n');
const failures=results.filter(p=>p.errors.length);console.log(JSON.stringify({pages:results.length,failures},null,2));if(failures.length)process.exitCode=1;
