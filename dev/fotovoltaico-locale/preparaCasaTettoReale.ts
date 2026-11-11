import {mkdir,readFile,writeFile} from "node:fs/promises";
import {posaCasaTracciata,PUNTI_AREA_CASA_TRACCIATA} from "./campioneAreaTracciata";
import {documentoCasaTettoReale,svgFotoCasaReale,renderCasaReale} from "./casaTettoReale";
import {OPZIONI_CASA_DEMO} from "./propostaOptionalPagamenti";
const root=new URL("../../",import.meta.url),dir=new URL("output/pdf/",root);
await mkdir(dir,{recursive:true});
const foto=`data:image/jpeg;base64,${(await readFile(new URL("esempi/ortofoto-pdok.jpg",import.meta.url))).toString("base64")}`;
const finanziato=process.argv.includes("--finanziamento"),nome=finanziato?"fotovoltaico-casa-finanziamento":"fotovoltaico-casa-tetto-reale";
const documento=documentoCasaTettoReale(foto,undefined,posaCasaTracciata,{...OPZIONI_CASA_DEMO,...(finanziato?{finanziamento:{finanziaria:"Esempio locale · non è un’offerta",durata_mesi:60,rata_mensile:85,tan_perc:null,taeg_perc:null,importo_finanziato:4282}}:{})});
let html=documento.html.replace(/<link href="https:\/\/fonts.googleapis.com[^>]*>/g,"").replace(/[\u2010-\u2015]/g,"-");
for(const match of [...html.matchAll(/src="([^"]+)"/g)]){const src=match[1];if(src.startsWith("data:"))continue;const path=new URL(src,"http://127.0.0.1:8087").pathname;if(!path.startsWith("/templates/fotovoltaico/products/")&&!path.startsWith("/pdf-stock/fotovoltaico/monitoraggio/"))throw new Error(`Risorsa inattesa: ${src}`);const bytes=await readFile(new URL(`public${path}`,root));html=html.replaceAll(`src="${src}"`,`src="data:${path.endsWith(".png")?"image/png":"image/webp"};base64,${bytes.toString("base64")}"`);}
await writeFile(new URL(`${nome}.html`,dir),html);
await writeFile(new URL("tetto-reale-foto.svg",dir),svgFotoCasaReale(foto,true,posaCasaTracciata));
await writeFile(new URL("tetto-reale-modello.svg",dir),renderCasaReale(posaCasaTracciata));
console.log(`${documento.pagine} pagine locali preparate, app inclusa e pagamenti della formula scelta.`);

const punti=PUNTI_AREA_CASA_TRACCIATA.map((p,i)=>`<circle cx="${p.x}" cy="${p.y}" r="3" fill="white" stroke="#047857" stroke-width="1"/><text x="${p.x+5}" y="${p.y-4}" fill="white" stroke="#123847" stroke-width=".4" paint-order="stroke" font-family="Arial" font-size="9" font-weight="bold">${i+1}</text>`).join("");
await writeFile(new URL("tetto-reale-perimetro.svg",dir),svgFotoCasaReale(foto,true,posaCasaTracciata).replace("</svg>",`${punti}</svg>`));
