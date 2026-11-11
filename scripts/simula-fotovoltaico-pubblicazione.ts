import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {buildFvPreviewBase} from '../src/lib/moduli-vendita/fvPreviewData';
import {createFullFvTemplate} from '../src/lib/moduli-vendita/fullFvModules';
import {renderFvPdfHtml,getFvPdfRenderedPagesCount,type FvPdfTemplateData} from '../supabase/functions/_shared/fvHtmlTemplate';
import {creaSnapshotEconomia} from '../supabase/functions/_shared/fvEconomiaAzienda';
import {calcolaEnergyFlows} from '../supabase/functions/_shared/fvCalcoli';
import {confrontoFinanziamentoCasa,confrontoPagamentoAzienda} from '../supabase/functions/_shared/fvConfrontoPagamento';
import {leasingIniziale} from '../supabase/functions/_shared/fvLeasing';
import {MONITORAGGIO_DEMO_INCLUSO} from '../supabase/functions/_shared/fvMonitoraggio';
import {catalogoPersonalizzazioneFv,contestoPersonalizzazioneFv,BLOCCO_TESTI_FV,PREFISSO_MEDIA_FV} from '../supabase/functions/_shared/fvPersonalizzazioneCompleta';
const dir=join(process.cwd(),'output','verifica-fotovoltaico-pubblicazione');await mkdir(dir,{recursive:true});
const scenarios:Array<{nome:string;d:FvPdfTemplateData}>=[];
function casa(nome:string,kwp:number,accumulo:boolean,rate:boolean,monitoraggio:boolean,senzaMappa=false){
 const d=buildFvPreviewBase({}),moduli=Math.round(kwp*2),consumo=kwp*900,produzione=kwp*1200,totale=kwp*2200+(accumulo?4000:0);
 d.azienda={...d.azienda,name:'INSTALLATORE DIMOSTRATIVO'};d.cliente={...d.cliente,nome:'Cliente',cognome:'di prova'};
 d.progetto={...d.progetto,numero:nome,potenza_kwp:kwp,numero_pannelli:moduli,consumo_annuo_kwh:consumo,has_accumulo:accumulo,capacita_accumulo_kwh:accumulo?10:0,...(senzaMappa?{layout_overlay:{modalita:'senza_mappa' as const}}:{})};
 d.flows=calcolaEnergyFlows({potenza_kwp:kwp,has_accumulo:accumulo,capacita_accumulo_kwh:accumulo?10:0,consumo_annuo_kwh:consumo,produzione_kwh:produzione,autoconsumo_pct:accumulo?.7:.4});d.flows_senza_accumulo=undefined;
 d.costi={prezzo_vendita_iva_inclusa:totale,iva_perc:10,detrazione_eur:0,detrazione_perc:0,costo_netto_dopo_detrazione:totale};d.finanziamento=rate?{finanziaria:'ESEMPIO, NON OFFERTA',durata_mesi:84,rata_mensile:Math.round(totale/84*1.08*100)/100,tan_perc:null,taeg_perc:null,importo_finanziato:totale}:null;
 d.modalita_pagamento=rate?null:{tipo:'diretto',note:null,tranche:[{label:'Acconto',pct:30,importo_eur:totale*.3},{label:'Saldo',pct:70,importo_eur:totale*.7}]};
 const risparmio=d.flows.autoconsumo_kwh*.32;d.scenario={risparmio_mensile_eur:risparmio/12,risparmio_anno1_eur:risparmio,risparmio_25_anni_eur:0,payback_anni:null,npv_25_anni:0,cassa_anno_per_anno:[]};
 const prodotto=d.componenti.map(c=>({...c,quantita:c.categoria==='pannello'?moduli:1}));d.componenti=prodotto.filter(c=>accumulo||c.categoria!=='accumulo');
 d.template={colore_accento:'#188569',pdf_blocchi:{monitoraggio:monitoraggio?MONITORAGGIO_DEMO_INCLUSO:{attivo:false}},pdf_cta_finale_titolo:'La tua proposta.\nIl prossimo passo.'};d.anteprima_dimostrativa=true;d.foto_di_serie=null;
 scenarios.push({nome,d});
}
casa('casa-3kwp-contanti',3,false,false,false,true);casa('casa-6kwp-accumulo-rate',6,true,true,true);casa('casa-10kwp-rate',10,false,true,true,true);casa('casa-6kwp-personalizzata',6,false,false,true);
for(const[modo,kwp,netto]of [['cash',20,25000],['noleggio',60,57377.05],['leasing',100,120000],['rate',200,230000]] as const){
 const t=createFullFvTemplate({},'anteprima-modello-azienda',modo==='noleggio'?'aziendale-noleggio':'aziendale'),d=buildFvPreviewBase(t),e=d.economia_azienda!;
 d.progetto={...d.progetto,numero:'azienda-'+modo,potenza_kwp:kwp,numero_pannelli:kwp*2,consumo_annuo_kwh:kwp*1500,layout_overlay:{modalita:'senza_mappa'}};d.costi={...d.costi,prezzo_vendita_iva_inclusa:Math.round(netto*1.22*100)/100};
 const p={...e.input.parametri,modo,consumiMensili:Array.from({length:12},()=>kwp*1500/12),dataPreventivo:'2026-11-10',dataInizio:'2026-12-01',orizzonteAnni:10,quotaAutoconsumo:.8};
 if(modo==='rate')Object.assign(p,{durataFinanziamentoMesi:84,rataFinanziamento:3300,capitaleOffertaFinanziamento:netto,fonteFinanziamento:'ESEMPIO DI IMPAGINAZIONE'});
 if(modo==='leasing')Object.assign(p,{leasing:{...leasingIniziale('2026-11-10'),fonte:'ESEMPIO NON CONTRATTUALE',dal:'2026-01-01',al:'2028-12-31',capitaleBene:netto,durataMesi:60,periodoMesi:3,numeroCanoni:20,primoCanoneMese:3,canoneNetto:6000,maxicanonePct:10,fine:'riscatto',riscattoNetto:1200}});

 d.economia_azienda=creaSnapshotEconomia({...e.input,imponibile:netto,produzioneAnnua:kwp*1250,parametri:p});d.anteprima_dimostrativa=true;d.foto_di_serie=null;d.template={...t,pdf_blocchi:{...t.pdf_blocchi,monitoraggio:MONITORAGGIO_DEMO_INCLUSO}};scenarios.push({nome:'azienda-'+kwp+'kwp-'+modo,d});
}
const reports=[];
for(const {nome,d}of scenarios){
 let html=renderFvPdfHtml(d);const ctx=contestoPersonalizzazioneFv(d);
 if(nome.includes('personalizzata')){const page=catalogoPersonalizzazioneFv(html,ctx).find(p=>p.testi.some(t=>t.tipo==='h1'))!,field=page.testi.find(t=>t.tipo==='h1')!;const image=catalogoPersonalizzazioneFv(html,ctx).flatMap(p=>p.immagini).find(m=>m.tipo==='foto');d.template!.pdf_blocchi={...d.template!.pdf_blocchi,[BLOCCO_TESTI_FV]:{testi:{[field.id]:'Progetto di energia su misura.'}},...(image?{[PREFISSO_MEDIA_FV+image.id]:{foto:['/pdf-stock/fotovoltaico/monitoraggio/smartphone-app-standard.png']}}:{})};html=renderFvPdfHtml(d);assert(html.includes('Progetto di energia su misura.'));}
 const n=(html.match(/<div class="page">/g)||[]).length;assert.equal(n,getFvPdfRenderedPagesCount(d));const visible=html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi,'');assert(!/\b(?:NaN|Infinity|undefined)\b/.test(visible),nome+': '+(html.match(/.{0,90}\b(?:NaN|Infinity|undefined)\b.{0,90}/g)||[]).slice(0,5).join(' / '));
 const c=d.economia_azienda?confrontoPagamentoAzienda(d.economia_azienda):confrontoFinanziamentoCasa(d);
 if(c)assert(Math.abs(c.dopo-c.prima-c.differenza)<.001);
 if(!d.economia_azienda){assert(Math.abs(d.flows.produzione_kwh-d.flows.autoconsumo_kwh-d.flows.ceduto_rete_kwh)<.01);assert(Math.abs(d.progetto.consumo_annuo_kwh-d.flows.autoconsumo_kwh-d.flows.prelievo_rete_kwh)<.01);}
 html=html.replace(/<link[^>]+https:\/\/fonts.googleapis.com[^>]*>/g,'');
 for(const m of [...html.matchAll(/(?:src|href)="(\/(?!\/)[^"]+)"/g)]){const src=m[1];if(!/\.(png|jpe?g|webp|svg)(?:\?|$)/i.test(src))continue;const path=join(process.cwd(),'public',src),ext=src.split('.').at(-1),mime=ext==='svg'?'image/svg+xml':ext==='jpg'?'image/jpeg':`image/${ext}`;const bytes=await readFile(path);html=html.replaceAll(`="${src}"`,`="data:${mime};base64,${bytes.toString('base64')}"`);}
 await writeFile(join(dir,nome+'.html'),html);reports.push({nome,pagine:n,kwp:d.progetto.potenza_kwp,totale:d.costi.prezzo_vendita_iva_inclusa,confronto:c??null});
}
await writeFile(join(dir,'risultati.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports.map(({nome,pagine,kwp,totale})=>({nome,pagine,kwp,totale})),null,2));
