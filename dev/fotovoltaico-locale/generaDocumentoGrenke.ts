import {createFullFvTemplate} from "../../src/lib/moduli-vendita/fullFvModules";
import {MONITORAGGIO_DEMO_INCLUSO} from "../../supabase/functions/_shared/fvMonitoraggio";
import{readFile,writeFile,mkdir}from"node:fs/promises";
import{datiGrenke,fonteGrenke,stimaGrenke,AZIENDA_GRENKE}from"./grenkeScenario";
import{INITIAL}from"../../src/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";
import{documentoAziendaLocale}from"./documentoAzienda";
const data={...datiGrenke(INITIAL),latitudine:stimaGrenke.lat,longitudine:stimaGrenke.lng,comune:"Roma",indirizzo:"Località dimostrativa Roma",ore_sole_annue:stimaGrenke.ore};
const modello=createFullFvTemplate({colore_primario:"#1E3A5F",colore_accento:"#F97316"},AZIENDA_GRENKE,"aziendale-noleggio");
modello.pdf_blocchi={...modello.pdf_blocchi,monitoraggio:MONITORAGGIO_DEMO_INCLUSO};
modello.pdf_pages_order=modello.pdf_pages_order?.map(p=>p.id==="monitoraggio"?{...p,visible:true}:p);
const doc=documentoAziendaLocale(data,fonteGrenke.edificioBase,modello);
let html=doc.html.replace(/[ \t]+\n/g,"\n");
for(const src of new Set([...html.matchAll(/src="([^"]+)"/g)].map(m=>m[1]))){
 if(src.startsWith("data:"))continue;
 const path=new URL(src,"http://127.0.0.1:8087").pathname;
 if(!/^\/(pdf-stock|cover-stock|module-art|pdf-badges|templates)\//.test(path)||path.includes(".."))throw new Error(`Risorsa locale inattesa: ${path}`);
 const bytes=await readFile(new URL(`../../public${path}`,import.meta.url)),mime=path.endsWith(".png")?"image/png":path.endsWith(".webp")?"image/webp":path.endsWith(".svg")?"image/svg+xml":"image/jpeg";
 html=html.replaceAll(`src="${src}"`,`src="data:${mime};base64,${bytes.toString("base64")}"`);
}
await mkdir("output/pdf",{recursive:true});
await writeFile("output/pdf/simulazione-azienda-grenke-70000.html",html);
await writeFile("output/pdf/render-capannone-60kwp.svg",doc.render);
await writeFile("output/pdf/pianta-capannone-60kwp.svg",doc.pianta);
await writeFile("output/pdf/simulazione-azienda-grenke-70000.json",JSON.stringify({pagine:doc.pages,snapshot:doc.snapshot},null,2));
console.log(JSON.stringify({pagine:doc.pages,potenza:data.potenza_kwp,moduli:data.numero_pannelli_scelti,netto:data.prezzo_vendita_manuale,produzione:doc.snapshot.input.produzioneAnnua,canoneTrimestrale:doc.snapshot.risultato.canonePeriodo,saldo:doc.snapshot.risultato.saldoFinale}));
