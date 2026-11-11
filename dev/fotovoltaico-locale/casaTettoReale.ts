import {personalizzaDocumentoFv,contestoPersonalizzazioneFv,senzaPersonalizzazioniFv} from "../../supabase/functions/_shared/fvPersonalizzazioneCompleta";
import {leggiMonitoraggioFv} from "../../supabase/functions/_shared/fvMonitoraggio";
import {STILE_CHI_SIAMO,vesteChiSiamo} from "./chiSiamoEditoriale";
import {pagineConfrontoOptional,paginePagamentiProposta,STILE_OPTIONAL_PAGAMENTI,type OpzioniPropostaCasa} from "./propostaOptionalPagamenti";
import originale from "./esempi/edificio-3dbag-originale.json";
import pvgis from "./esempi/pvgis-delft-se.json";
import {facceConAreePosa} from "./areaPosa";
import {leggiEdificio3d,creaPianoReale,pannelliDalDisegnoReale,uvOrtofoto,sagomeOstacoliEdificio,type P3} from "./tettoReale";
import {disponiModuliOttimizzati,pannelliDaRivedere,type DisegnoCommercialeFv} from "../../supabase/functions/_shared/fvDisegnoCommerciale";
import {datiCasaCompleta,type PaginaCasaVisuale} from "./casaCompleta";
import {renderFvPdfHtml,FV_PDF_PAGES_DEFAULT,type FvPdfTemplateData} from "../../supabase/functions/_shared/fvHtmlTemplate";
import {htmlFlussiTettoVendita,pagineFornituraVendita,htmlDecisioneVendita,STILE_CASA_VENDITA,type VoceFornitura} from "./casaVendita";
import {svgRenderAzienda} from "./renderAzienda";

export const edificioCasaReale=leggiEdificio3d(originale);
const schema=creaPianoReale(edificioCasaReale,{corto:1.134,lungo:1.762,stimato:false});
// Esclusione prudenziale da lettura visiva dell'ortofoto: include l'elemento
// visibile intorno a pixel (430,439). Non ne inventa né altezza né ombra.
schema.ostacoli=[{id:"zona-da-rilevare",x:2.85,y:.85,w:2.05,h:3.05,tipo:"impianto"}];
export const posaCasaReale=disponiModuliOttimizzati(schema,5,"auto","faccia-22");
if(posaCasaReale.pannelli.length!==5||pannelliDaRivedere(posaCasaReale).length)throw new Error("Posa del campione reale non valida");
export const WATT_MODULO_REALE=450;
export const POTENZA_CASA_REALE=posaCasaReale.pannelli.length*WATT_MODULO_REALE/1000;
export const PRODUZIONE_CASA_REALE=Math.round(pvgis.outputs.totals.fixed.E_y*POTENZA_CASA_REALE);
export const PREZZO_CASA_REALE=Math.round((posaCasaReale.pannelli.length*(180+90)+900+1800)*1.22);
export const MESI_CASA_REALE=pvgis.outputs.monthly.fixed.map(m=>({mese:m.month,kwh:m.E_m*POTENZA_CASA_REALE}));
export function riepilogoPosaCasaReale(piano:DisegnoCommercialeFv=posaCasaReale){
 if(!piano.pannelli.length||piano.pannelli.some(m=>m.faldaId!=="faccia-22"||m.supporto)||pannelliDaRivedere(piano).length||piano.modulo.corto!==1.134||piano.modulo.lungo!==1.762)throw new Error("La stima salvata vale per moduli aderenti da 450 Wp sulla falda SE del campione.");
 const moduli=piano.pannelli.length,kwp=moduli*WATT_MODULO_REALE/1000;
 return{moduli,kwp,produzione:Math.round(pvgis.outputs.totals.fixed.E_y*kwp),prezzo:Math.round((moduli*(180+90)+900+1800)*1.22),mesi:pvgis.outputs.monthly.fixed.map(m=>({mese:m.month,kwh:m.E_m*kwp}))};
}
export const areaCasaPersonalizzata=(piano:DisegnoCommercialeFv)=>JSON.stringify(piano.falde)!==JSON.stringify(schema.falde);
const euro=(n:number)=>n.toLocaleString("it-IT",{style:"currency",currency:"EUR",maximumFractionDigits:0});
const num=(n:number)=>n.toLocaleString("it-IT",{maximumFractionDigits:2});
export function datiCasaTettoReale(piano:DisegnoCommercialeFv=posaCasaReale,finanziamento?:FvPdfTemplateData["finanziamento"]):FvPdfTemplateData{
 const q=riepilogoPosaCasaReale(piano),d=datiCasaCompleta(false),produzione=q.produzione,consumo=3500,auto=Math.round(produzione*.55),rete=consumo-auto;
 d.cliente={nome:"Edificio campione",cognome:"Delft",comune:"Delft · Paesi Bassi",indirizzo:"Campione pubblico 3DBAG",cap:"",provincia:"",tipologia_immobile:"Abitazione a schiera"};
 d.progetto={...d.progetto,numero:"FV-DELFT-REALE",titolo:"Simulazione su tetto reale",potenza_kwp:q.kwp,numero_pannelli:q.moduli,layout_overlay:piano,consumo_annuo_kwh:consumo,ore_sole_annue:pvgis.outputs.totals.fixed.E_y,inclinazione_tetto:50.9,azimut:"SE 138° da nord",fonte_dati_tetto:"3DBAG / ortofoto PDOK / PVGIS 5.3",qualita_dati_tetto:areaCasaPersonalizzata(piano)?"Area commerciale corretta sulla foto; pendenza e quote dal modello pubblico":"Geometria pubblica; ostacoli e ombre vicine da rilevare",superficie_tetto_disponibile_mq:41.43};
 d.flows={produzione_kwh:produzione,autoconsumo_kwh:auto,ceduto_rete_kwh:produzione-auto,prelievo_rete_kwh:rete,autoconsumo_pct:auto/produzione,autosufficienza_pct:auto/consumo,consumo_da_rete_pct:rete/consumo,consumo_da_fv_pct:auto/consumo};
 d.flows_senza_accumulo=undefined;
 d.costi={prezzo_vendita_iva_inclusa:q.prezzo,iva_perc:22,detrazione_eur:0,detrazione_perc:0,costo_netto_dopo_detrazione:q.prezzo};
 d.modalita_pagamento={tipo:"diretto",tranche:[{label:"Acquisto diretto · esempio",pct:100,importo_eur:q.prezzo}],note:"Prezzi e IVA sono ipotesi dimostrative, non condizioni applicabili all’immobile olandese."};
 d.componenti=d.componenti.map(c=>({...c,quantita:c.categoria==="pannello"?q.moduli:1,descrizione:c.categoria==="pannello"?"Modulo full black 450 Wp · esempio":"Inverter 2,5 kW · esempio",modello:c.categoria==="pannello"?"Modulo · esempio 450 Wp":"Inverter · esempio 2,5 kW",potenza_w:c.categoria==="pannello"?450:undefined}));
 const risparmio=auto*d.progetto.costo_kwh_attuale,cassa=[{anno:0,cumulato:-q.prezzo}];let saldo=-q.prezzo,pareggio:number|null=null;
 for(let anno=1;anno<=25;anno++){const precedente=saldo;saldo+=risparmio*.995**(anno-1)-100;cassa.push({anno,cumulato:Math.round(saldo*100)/100});if(pareggio===null&&precedente<0&&saldo>=0)pareggio=anno-1-precedente/(saldo-precedente);}
 d.scenario={...d.scenario,risparmio_anno1_eur:risparmio,risparmio_mensile_eur:risparmio/12,payback_anni:pareggio,risparmio_25_anni_eur:saldo,cassa_anno_per_anno:cassa,npv_25_anni:0};
 d.template={...d.template,
  chi_siamo_titolo:"Chi siamo",
  presentazione_impresa_html:"<p><strong>Demo Solar</strong> · presentazione di esempio, personalizzabile nel modello.</p><p>Partiamo dal tetto e dai consumi della tua casa. Ti accompagniamo nella scelta di componenti, fornitura e condizioni, con una proposta chiara prima della conferma.</p>",
  pdf_blocchi:{...d.template?.pdf_blocchi,testata_garanzie:{occhiello:"L’azienda e il tuo progetto",titolo:"Chi siamo.\nCome lavoriamo.",intro:"Conosci il metodo, il contenuto della proposta e il percorso fino alla conferma."}},
  garanzie_conversione:[{icona:"sun",titolo:"Prodotti identificati",descrizione:"Modelli e schede dei componenti indicati nella proposta; condizioni del produttore da confermare."},{icona:"tools",titolo:"Lavorazioni chiare",descrizione:"Attività previste, accessi ed eventuali opere ulteriori si definiscono prima della conferma."},{icona:"shield",titolo:"Garanzie e assistenza",descrizione:"Durate, coperture e referente si precisano con le schede e le condizioni dell’offerta definitiva."},{icona:"clock",titolo:"Un percorso concordato",descrizione:"Sopralluogo, scelta della configurazione e programma lavori seguono le verifiche del caso concreto."}],
  usp:[{titolo:"La casa prima del calcolo",descrizione:"Tetto, consumi e abitudini guidano la configurazione."},{titolo:"Una proposta leggibile",descrizione:"Prezzo, voci previste e dettagli da concordare restano distinti."}],
  faq_items:[{domanda:"Quando si confermano posa e componenti?",risposta:"Dopo la verifica del tetto e dei consumi. La disposizione disegnata è una proposta commerciale da confermare nel sopralluogo."},{domanda:"Cosa comprende il prezzo?",risposta:"Le voci indicate nella pagina Fornitura. Pratiche e attività ancora da definire si concordano e quantificano prima della conferma."},{domanda:"Il risparmio mensile è una rata?",risposta:"No. È la media del minor costo energetico stimato. Pagamenti dell’impianto, gestione e ricavi da cessione sono trattati separatamente."},{domanda:"Come si confermano garanzie e assistenza?",risposta:"Con le schede dei prodotti scelti e le condizioni dell’installatore. Nel campione non sono state attribuite durate o coperture non disponibili."}],
  pdf_pages_order:FV_PDF_PAGES_DEFAULT.map(p=>({...p,visible:PAGINE_CASA_REALE.includes(p.id as PaginaCasaReale)})),
 };

 if(finanziamento){
  const f=finanziamento;
  if(!Number.isFinite(f.rata_mensile)||f.rata_mensile<=0||!Number.isInteger(f.durata_mesi)||f.durata_mesi<=0||!Number.isFinite(f.importo_finanziato)||f.importo_finanziato<=0||f.importo_finanziato>q.prezzo)throw new Error("Condizioni del finanziamento del campione non valide");
  const anticipo=Math.round((q.prezzo-f.importo_finanziato)*100)/100;
  d.finanziamento={...f};d.modalita_pagamento={tipo:"finanziato",anticipo_pct:anticipo/q.prezzo*100,anticipo_eur:anticipo,finanziato_eur:f.importo_finanziato,rata_mensile:f.rata_mensile,durata_mesi:f.durata_mesi,tasso_zero:false,note:"Ipotesi locale di confronto, non è un’offerta finanziaria. TAN, TAEG e spese esterne alle rate da verificare."};
  let saldo=anticipo>0?-anticipo:0;const cassa=[{anno:0,cumulato:saldo}];
  for(let anno=1;anno<=25;anno++){const mesi=Math.max(0,Math.min(12,f.durata_mesi-(anno-1)*12));saldo+=risparmio*.995**(anno-1)-100-mesi*f.rata_mensile;cassa.push({anno,cumulato:Math.round(saldo*100)/100});}
  d.scenario={...d.scenario,cassa_anno_per_anno:cassa,risparmio_25_anni_eur:saldo,payback_anni:null};
 }
 return d;
}
/** Stessa vista zenitale, prima/dopo; nessuna ricostruzione generativa del tetto. */
export function svgFotoCasaReale(foto:string,conModuli=true,piano:DisegnoCommercialeFv=posaCasaReale){
 const ed=edificioCasaReale,pp=(ps:P3[])=>ps.map(p=>{const q=uvOrtofoto(ed,p);return`${(q.u*800).toFixed(2)},${((1-q.v)*800).toFixed(2)}`;}).join(" ");
 const pannelli=pannelliDalDisegnoReale(ed,piano);
 const contorno=facceConAreePosa(ed,piano).find(f=>f.id==="faccia-22")!.anelli[0];
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="300 265 290 290" role="img" aria-label="${conModuli?"Proposta di posa sulla foto reale":"Ortofoto originale del tetto"}"><image href="${foto}" width="800" height="800"/>${conModuli?`<polygon points="${pp(contorno)}" fill="none" stroke="#e9efda" stroke-width=".8"/>${pannelli.map(m=>`<polygon points="${pp(m.vertici)}" fill="#10232b" stroke="#b3c5cc" stroke-width=".6"/>`).join("")}${sagomeOstacoliEdificio(ed,piano).map(o=>`<polygon points="${pp(o.vertici)}" fill="#e5a451" fill-opacity=".27" stroke="#f7bc66" stroke-width=".9" stroke-dasharray="2 1"/>`).join("")}`:""}<g transform="translate(568 280)"><path d="M0 16V0m-4 6L0 0l4 6" fill="none" stroke="white" stroke-width="1.5"/><text y="26" text-anchor="middle" fill="white" font-size="7" font-family="Arial">N</text></g></svg>`;
}
export const renderCasaReale=(piano:DisegnoCommercialeFv=posaCasaReale)=>svgRenderAzienda(edificioCasaReale,piano,"Delft · geometria 3DBAG reale, materiali illustrativi. Zona arancione da rilevare.",60);
const crediti=`Geometria © 3DBAG by tudelft3d and 3DGI · CC BY 4.0. Ortofoto © Samenwerkingsverband Beeldmateriaal / PDOK · CC BY. Elaborazioni: falda evidenziata, zona esclusa e pannelli simulati. Foto e modello scaricati il 10/11/2026; data di ripresa non verificata.`;
const stile=`.cr h1{font-size:32pt;line-height:1.05;letter-spacing:-1.2px;margin:2mm 0 3mm;color:#203d50}.cr .intro{font-size:10pt;color:#637783;line-height:1.5;margin:0 0 5mm}.cr-pair{display:grid;grid-template-columns:1fr 1fr;gap:4mm}.cr-card{border-radius:3mm;overflow:hidden;background:#f0f3ee;border:1px solid #dce5df}.cr-card svg{display:block;width:100%;height:78mm}.cr-label{font-size:8pt;letter-spacing:.4px;font-weight:bold;padding:2mm 3mm;color:#234d45}.cr-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin:5mm 0}.cr-kpis>div{border-left:2px solid #c9d8ce;padding-left:3mm}.cr-kpis strong{font-size:23pt;color:#188569;display:block;line-height:1.2}.cr-kpis small{font-size:8pt;color:#5b717d}.cr-bottom{display:grid;grid-template-columns:58% 42%;gap:3mm;align-items:center}.cr-bottom svg{width:100%;height:65mm}.cr-note{font-size:8pt;line-height:1.55;color:#526c78}.cr-source{font-size:6.5pt;line-height:1.45;color:#71838a;margin-top:4mm}.cr-section{font-size:16pt;color:#203d50;margin:6mm 0 3mm}.cr-bars{height:58mm;display:flex;align-items:end;gap:2mm;border-bottom:1px solid #cddad4;padding:0 1mm}.cr-col{flex:1;text-align:center;min-width:0}.cr-col b{display:block;font-size:7pt;color:#234d45;margin-bottom:1mm}.cr-bar{background:#278b70;border-radius:1mm 1mm 0 0;min-height:1px}.cr-months{display:flex;gap:2mm;padding:2mm 1mm;font-size:7pt;color:#637783}.cr-months span{flex:1;text-align:center}.cr-assumptions{font-size:9pt;line-height:1.6;padding:4mm 5mm;background:#f3f6f0;border-radius:3mm;color:#526c78}.cr-assumptions p{margin:1mm 0}.cr a{color:inherit;text-decoration:underline}`;
const footer=(n:number,total:number)=>`<div class="page-footer"><span>Demo Solar · FV-DELFT-REALE · simulazione locale</span><span class="pnum">${n} / ${total}</span></div>`;
const pagina=(id:string,corpo:string,n:number,total:number)=>`<div class="page"><div class="page-header" data-fv-section="${id}"><span>DEMO SOLAR</span><span>CASA / TETTO REALE</span></div><div class="content ${["tetto_reale","ipotesi_reali"].includes(id)?"cr":""}">${corpo}</div>${footer(n,total)}</div>`;
function paginaReale(foto:string,piano:DisegnoCommercialeFv){const q=riepilogoPosaCasaReale(piano);return `<div class="eyebrow">Il progetto prende forma</div><h1>Il sole,<br/>su questo tetto.</h1><p class="intro">Delft · abitazione reale da dati pubblici.<br/>${areaCasaPersonalizzata(piano)?"Area di posa corretta sulla foto, con quote e pendenza del modello.":"La stessa geometria nella foto, nel modello e nel preventivo."}</p><div class="cr-pair"><div class="cr-card"><div class="cr-label">01 / IL TETTO OGGI</div>${svgFotoCasaReale(foto,false,piano)}</div><div class="cr-card"><div class="cr-label">02 / LA DISPOSIZIONE PROPOSTA</div>${svgFotoCasaReale(foto,true,piano)}</div></div><div class="cr-kpis"><div><strong>${q.moduli}</strong><small>moduli full black da 450 Wp</small></div><div><strong>${num(q.kwp)}</strong><small>kWp installati nella simulazione</small></div><div><strong>${num(q.produzione)}</strong><small>kWh/anno · stima PVGIS</small></div></div><div class="cr-bottom"><div>${renderCasaReale(piano)}</div><div class="cr-note"><strong>Una falda, una proposta coerente.</strong><br/>Esposizione SE · 138° da nord.<br/>Pendenza geometrica circa 51°.<br/>Bordo ipotizzato 30 cm.<br/><br/>Arancione: zona esclusa prudenzialmente dalla posa. Ingombri, ombre locali e fattibilità restano da verificare sul posto.</div></div><p class="cr-source">${crediti}</p>`;}
function paginaIpotesi(piano:DisegnoCommercialeFv,finanziamento?:FvPdfTemplateData["finanziamento"]){const q=riepilogoPosaCasaReale(piano),max=Math.max(...q.mesi.map(m=>m.kwh)),mesi=["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
 return `<div class="eyebrow">Leggere bene la simulazione</div><h1>L’energia cambia.<br/>Ogni mese.</h1><p class="intro">Stima mensile PVGIS per la falda scelta. In inverno la produzione è inferiore: il totale annuo non racconta da solo l’uso reale della casa. Valori mensili in kWh, arrotondati.</p><div class="cr-kpis"><div><strong>${num(q.produzione)}</strong><small>kWh/anno stimati</small></div><div><strong>55%</strong><small>autoconsumo ipotizzato</small></div><div><strong>0</strong><small>kWh di accumulo previsto</small></div></div><div class="cr-bars">${q.mesi.map(m=>`<div class="cr-col"><b>${Math.round(m.kwh)}</b><div class="cr-bar" style="height:${m.kwh/max*44}mm"></div></div>`).join("")}</div><div class="cr-months">${mesi.map(m=>`<span>${m}</span>`).join("")}</div><h2 class="cr-section">Dati reali e ipotesi, in chiaro.</h2><div class="cr-assumptions"><p><strong>Geometria:</strong> ${areaCasaPersonalizzata(piano)?"area di posa tracciata manualmente sulla foto; quote, pendenza e orientamento dal modello.":"contorno, pendenza e orientamento delle falde dal modello."} LoD 2.2; sorgente altimetrica AHN5, anno 2023.</p><p><strong>Produzione:</strong> PVGIS 5.3 / SARAH3, posizione 52,01169 N · 4,36783 E (punto pubblico prossimo all’edificio), moduli c-Si ventilati, perdite di sistema 14%, orizzonte DEM. Nessuna ulteriore riduzione per ombre vicine: non ancora simulate.</p><p><strong>Da confermare con il cliente:</strong> consumo 3.500 kWh/anno, autoconsumo 55% della produzione, tariffa variabile 0,32 €/kWh, quote fisse 180 €/anno. La quota di autoconsumo è un’ipotesi annuale, non un calcolo orario.</p><p><strong>Economia dimostrativa:</strong> ${euro(q.prezzo)} IVA 22% inclusa; moduli 180 € + struttura 90 € ciascuno, inverter 900 €, installazione e servizi 1.800 € (netti). IVA e prezzi sono solo un esempio commerciale, non condizioni fiscali olandesi.</p><p><strong>Proiezione a 25 anni:</strong> degrado 0,5%/anno, tariffa costante, gestione 100 €/anno. ${finanziamento?`Le rate di ${euro(finanziamento.rata_mensile)} per ${finanziamento.durata_mesi} mesi sono comprese nei flussi. Uscita iniziale: solo l’eventuale anticipo. Nessun incentivo, ricavo da cessione, costo esterno alle rate, sostituzione straordinaria o attualizzazione.`:"Nessun incentivo, ricavo da cessione, costo finanziario, sostituzione straordinaria o attualizzazione."}</p></div><p class="cr-source">Fonti: <a href="https://api.3dbag.nl/collections/pand/items/NL.IMBAG.Pand.0503100000022863">3DBAG · edificio campione</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> · <a href="https://www.pdok.nl/introductie/-/article/pdok-luchtfoto-rgb-open-">PDOK ortofoto</a> · <a href="https://re.jrc.ec.europa.eu/pvg_tools/en/">JRC PVGIS</a>. Interrogazione PVGIS salvata il 10/11/2026; normali climatiche 2005–2023. ${crediti}</p>`;
}
export function visualeRiepilogoTetto(foto:string,piano:DisegnoCommercialeFv=posaCasaReale){return{html:svgFotoCasaReale(foto,true,piano).replace('viewBox="300 265 290 290"','viewBox="330 310 245 230" preserveAspectRatio="xMidYMid slice"'),nota:"Foto del tetto campione · pannelli simulati"};}
export function fornituraCasaReale(d:FvPdfTemplateData):VoceFornitura[]{return[
 ...d.componenti.map(c=>({titolo:c.categoria==="pannello"?"Moduli fotovoltaici":c.modello||c.descrizione,dettaglio:c.categoria==="pannello"?c.modello||c.descrizione:c.descrizione,stato:"previsto" as const,quantita:c.quantita,unita:"pz",prezzoUnitarioNetto:c.categoria==="pannello"?180:c.categoria==="inverter"?900:undefined,immagine:c.image_url,immagineIllustrativa:c.image_illustrativa})),
 {titolo:"Strutture e fissaggi",dettaglio:"Struttura per modulo. Tipologia e compatibilità da confermare sulla copertura.",stato:"previsto",quantita:d.progetto.numero_pannelli,unita:"kit",prezzoUnitarioNetto:90,icona:"tools"},
 {titolo:"Installazione e servizi",dettaglio:"Attività, accessi e condizioni da dettagliare dopo il sopralluogo.",stato:"previsto",quantita:1,unita:"corpo",prezzoUnitarioNetto:1800,icona:"tools"},
 {titolo:"Pratiche e ulteriori lavorazioni",dettaglio:"Documenti di connessione e interventi ulteriori da concordare nella proposta definitiva.",stato:"da_definire",icona:"document"},
];}
export const PAGINE_CASA_REALE=["tetto_reale","garanzie","risparmio","flussi","giorno_sera","schede_prodotti","monitoraggio","fornitura_casa","confronto_optional","ipotesi_reali","cassa_25","piano_pagamento","pagamenti_scadenze","faq","decisione"] as const;
export type PaginaCasaReale=typeof PAGINE_CASA_REALE[number];
export function pagineCasaRealeDisponibili(opzioni:OpzioniPropostaCasa={}){return PAGINE_CASA_REALE.filter(id=>(id!=="confronto_optional"||!!(opzioni.confronto?.attivo&&opzioni.confronto.optional.length))&&(id!=="piano_pagamento"||!!opzioni.finanziamento)&&(id!=="monitoraggio"||!!opzioni.monitoraggio?.attivo));}
export function documentoCasaTettoReale(foto:string,paginaScelta?:PaginaCasaReale,piano:DisegnoCommercialeFv=posaCasaReale,opzioni:OpzioniPropostaCasa={}){
 const d=datiCasaTettoReale(piano,opzioni.finanziamento);
 if(opzioni.modello){
  const m=opzioni.modello,blocchi={...d.template?.pdf_blocchi,...m.pdf_blocchi};delete blocchi.modulo_intervento;
  d.template={...d.template,...m,pdf_pages_order:d.template?.pdf_pages_order,pdf_blocchi:blocchi};
  d.azienda={...d.azienda,name:m.ragione_sociale||d.azienda.name,email:m.contatto_email||d.azienda.email,phone:m.contatto_telefono||d.azienda.phone,website:m.url_sito||d.azienda.website};
 }
 if(opzioni.monitoraggio)d.template={...d.template,pdf_blocchi:{...d.template?.pdf_blocchi,monitoraggio:leggiMonitoraggioFv({monitoraggio:opzioni.monitoraggio})}};
 const completo=renderFvPdfHtml({...d,template:{...d.template,pdf_blocchi:senzaPersonalizzazioniFv(d.template?.pdf_blocchi)}}),native=completo.split(/(?=<div class="page">)/),fornitura=pagineFornituraVendita(d,fornituraCasaReale(d)),optional=pagineConfrontoOptional(d,opzioni.confronto),pagamenti=paginePagamentiProposta(d,opzioni.scadenzePagamento,optional.length>0),ids=pagineCasaRealeDisponibili(opzioni).filter(id=>!paginaScelta||id===paginaScelta).flatMap<{id:PaginaCasaReale;parte:number}>(id=>(id==="fornitura_casa"?fornitura:id==="confronto_optional"?optional:id==="pagamenti_scadenze"?pagamenti:[""]).map((_,parte)=>({id,parte}))),total=ids.length;
 const pagine=ids.map(({id,parte},i)=>{
  if(id==="tetto_reale")return pagina(id,paginaReale(foto,piano),i+1,total);
  if(id==="ipotesi_reali")return pagina(id,paginaIpotesi(piano,d.finanziamento),i+1,total);
  if(id==="flussi")return pagina(id,htmlFlussiTettoVendita(d),i+1,total);
  if(id==="fornitura_casa")return pagina(id,fornitura[parte],i+1,total);
  if(id==="confronto_optional")return pagina(id,optional[parte],i+1,total);
  if(id==="pagamenti_scadenze")return pagina(id,pagamenti[parte],i+1,total);
  if(id==="decisione")return pagina(id,htmlDecisioneVendita(d,visualeRiepilogoTetto(foto,piano)),i+1,total);
  const html=native.find(p=>p.includes(`data-fv-section="${id as PaginaCasaVisuale}"`));if(!html)throw new Error(`Pagina assente: ${id}`);const numerata=html.replace(/<\/body>[\s\S]*$/, "").replace(/<span class="pnum">[^<]*<\/span>/,`<span class="pnum">${i+1} / ${total}</span>`);return id==="garanzie"?vesteChiSiamo(numerata):numerata;
 });
 const html=`${completo.slice(0,completo.indexOf("<body")).replace("</head>",`<style>${stile}${STILE_CASA_VENDITA}${STILE_CHI_SIAMO}${STILE_OPTIONAL_PAGAMENTI}</style></head>`)}<body>${pagine.join("")}</body></html>`,contesto=contestoPersonalizzazioneFv(d);
 return {html:personalizzaDocumentoFv(html,d.template?.pdf_blocchi,contesto),pagine:total,contesto};
}
