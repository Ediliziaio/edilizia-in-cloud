import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createFullFvTemplate} from "../../src/lib/moduli-vendita/fullFvModules";
import {buildFvPreviewBase} from "../../src/lib/moduli-vendita/fvPreviewData";
import {fotoBlocchiDalSito,fotoPagineDalSito,renderFvPdfHtml,getFvPdfRenderedPagesCount} from "../../supabase/functions/_shared/fvHtmlTemplate";
import {FV_MODELLI_AZIENDA} from "../../supabase/functions/_shared/fvModelliAzienda";
import {AZIENDA_GRENKE} from "./grenkeScenario";
const root=new URL("../../",import.meta.url),dir=new URL("output/modelli-fotovoltaico/",root),manifest=[];
await mkdir(dir,{recursive:true});
for(const id of FV_MODELLI_AZIENDA){
 const modello=createFullFvTemplate({ragione_sociale:"Demo Azienda 2",colore_primario:"#1E3A5F",colore_accento:"#F97316"},AZIENDA_GRENKE,id),data=buildFvPreviewBase(modello);
 data.azienda={...data.azienda,name:"Demo Azienda 2"};data.blocchi_foto=fotoBlocchiDalSito("http://127.0.0.1:8087",modello);data.foto_pagine=fotoPagineDalSito("http://127.0.0.1:8087",modello);
 let html=renderFvPdfHtml(data).replace(/<link href="https:\/\/fonts.googleapis.com[^>]*>/g,"").replace(/[\u2010-\u2015]/g,"-");
 for(const match of [...html.matchAll(/src="([^"]+)"/g)]){const url=match[1];if(url.startsWith("data:"))continue;const path=new URL(url,"http://127.0.0.1:8087").pathname;if(!/^\/(pdf-stock|module-art|pdf-badges)\//.test(path))throw new Error(`Risorsa inattesa: ${path}`);const file=await readFile(new URL(`public${path}`,root)),mime=path.endsWith(".svg")?"image/svg+xml":path.endsWith(".png")?"image/png":path.endsWith(".webp")?"image/webp":"image/jpeg";html=html.replaceAll(`src="${url}"`,`src="data:${mime};base64,${file.toString("base64")}"`);}
 await writeFile(new URL(`${id}.json`,dir),JSON.stringify(modello,null,2));await writeFile(new URL(`${id}.html`,dir),html);manifest.push({id,pagine:getFvPdfRenderedPagesCount(data),pagineConfigurate:modello.pdf_pages_order?.filter(p=>p.visible).map(p=>p.id),datiDimostrativi:true});
}
await writeFile(new URL("manifest.json",dir),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest.map(m=>({id:m.id,pagine:m.pagine}))));
