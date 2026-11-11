import {mkdir,readFile,writeFile} from "node:fs/promises";
import {documentoCasaCompleta} from "./casaCompleta";
const root=new URL("../../",import.meta.url),dir=new URL("output/pdf/",root);
await mkdir(dir,{recursive:true});
let html=documentoCasaCompleta().html.replace(/<link href="https:\/\/fonts.googleapis.com[^>]*>/g,"").replace(/[\u2010-\u2015]/g,"-");
for(const match of [...html.matchAll(/src="([^"]+)"/g)]){
 const src=match[1];if(src.startsWith("data:"))continue;
 const path=new URL(src,"http://127.0.0.1:8087").pathname;
 if(!path.startsWith("/templates/fotovoltaico/products/"))throw new Error(`Risorsa inattesa: ${src}`);
 const bytes=await readFile(new URL(`public${path}`,root));html=html.replaceAll(`src="${src}"`,`src="data:image/webp;base64,${bytes.toString("base64")}"`);
}
await writeFile(new URL("fotovoltaico-casa-design.html",dir),html);console.log("Pagine native e riepilogo preparati");
