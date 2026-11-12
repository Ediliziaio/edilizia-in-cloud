import{build}from'esbuild';import{mkdir,writeFile}from'node:fs/promises';import path from'node:path';
const root=process.cwd(),out='/tmp/eic-silvio-chat-runtime';await mkdir(out,{recursive:true});
const shim=path.join(root,'scripts/permissions-lab/chat/serve-shim.ts');
for(const [name,entry]of [['chat','silvio-chat'],['action','silvio-execute-action']]){
 await build({stdin:{contents:`import{takeHandler}from ${JSON.stringify(shim)};import ${JSON.stringify(path.join(root,`supabase/functions/${entry}/index.ts`))};export default takeHandler();`,resolveDir:root,sourcefile:`${name}-entry.ts`},bundle:true,platform:'node',format:'esm',target:'node22',outfile:`${out}/${name}.mjs`,packages:'external',plugins:[{name:'local-only-runtime',setup(b){
 b.onResolve({filter:/^https:\/\//},args=>{
 if(args.path.includes('supabase-js'))return{path:'@supabase/supabase-js',external:true};
 if(args.path.includes('http/server.ts'))return{path:shim};
 if(args.path.includes('/xhr@'))return{path:'empty',namespace:'local-empty'};
 if(args.path.includes('pdf-lib'))return{path:'pdf-lib',external:true};
 if(args.path.includes('mammoth@'))return{path:'mammoth',external:true};
 if(args.path.includes('xlsx@'))return{path:'xlsx',external:true};
 if(args.path.includes('fontkit'))return{path:'fontkit',external:true};
 return {errors:[{text:`Remote module not allowed in local test: ${args.path}`}]};});
 b.onLoad({filter:/.*/,namespace:'local-empty'},()=>({contents:'export{}',loader:'js'}));
 b.onResolve({filter:/\/(aiRouter|queryClassifier)\.ts$/},args=>({path:path.join(root,'scripts/permissions-lab/chat/model-local.ts')}));
 }}]});
}
await writeFile(`${out}/package.json`,JSON.stringify({type:'module'}));console.log(out);
