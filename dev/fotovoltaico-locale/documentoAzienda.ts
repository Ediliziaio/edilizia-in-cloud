import {contestoPersonalizzazioneFv} from "../../supabase/functions/_shared/fvPersonalizzazioneCompleta";
import {createFullFvTemplate,type FullFvTemplate} from "../../src/lib/moduli-vendita/fullFvModules";
import {renderFvPdfHtml,getFvPdfRenderedPagesCount,type FvPdfTemplateData} from "../../supabase/functions/_shared/fvHtmlTemplate";
import {creaSnapshotEconomia,riferimentoClienteEconomia} from "../../supabase/functions/_shared/fvEconomiaAzienda";
import {stimaProduzioneFv} from "../../src/lib/fotovoltaico/anteprima";
import {leggiDisegnoCommerciale,svgDisegnoCommerciale} from "../../supabase/functions/_shared/fvDisegnoCommerciale";
import type {WizardData} from "../../src/pages/azienda/fotovoltaico/FotovoltaicoWizard/types";
import {AZIENDA_GRENKE} from "./grenkeScenario";
import type {EdificioReale} from "./tettoReale";
import {svgRenderAzienda} from "./renderAzienda";
export function documentoAziendaLocale(data:WizardData,edificio:EdificioReale,modello?:FullFvTemplate){
 const p=data.economia_azienda?.parametri,piano=leggiDisegnoCommerciale(data.layout_overlay);if(!p||!piano||!data.prezzo_vendita_manuale)throw new Error("Completa la configurazione e la simulazione economica.");
 const snapshot=creaSnapshotEconomia({companyId:AZIENDA_GRENKE,clienteRiferimento:riferimentoClienteEconomia(data),imponibile:data.prezzo_vendita_manuale,iva:data.iva_aliquota,produzioneAnnua:Math.round(stimaProduzioneFv(data)*100)/100,parametri:p});
 if(modello&&modello.company_id!==AZIENDA_GRENKE)throw new Error("Il modello appartiene a un’altra azienda.");
 const r=snapshot.risultato,render=svgRenderAzienda(edificio,piano),dataImg=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(render.replace(/<text[\s\S]*?<\/text>/g,""))}`;
 const doc:FvPdfTemplateData={
 azienda:{name:"Demo Azienda 2",tagline:"SIMULAZIONE LOCALE",company_id:AZIENDA_GRENKE},
 cliente:{nome:data.cliente_ragione_sociale||"Cliente aziendale dimostrativo",cognome:"",indirizzo:data.indirizzo,comune:data.comune,provincia:data.provincia,tipologia_immobile:"Capannone dimostrativo"},
 progetto:{numero:"FV-DEMO2-70000",titolo:"Simulazione impianto aziendale",creato_il:new Date().toISOString(),valido_giorni:0,potenza_kwp:data.potenza_kwp??0,numero_pannelli:data.numero_pannelli_scelti??0,has_accumulo:false,capacita_accumulo_kwh:0,consumo_annuo_kwh:data.consumo_annuo_kwh??0,costo_kwh_attuale:data.costo_kwh_attuale??0,layout_overlay:piano,fonte_dati_tetto:"pvgis",qualita_dati_tetto:"schema dimostrativo",ore_sole_annue:data.ore_sole_annue},
 costi:{prezzo_vendita_iva_inclusa:Math.round(data.prezzo_vendita_manuale*(1+data.iva_aliquota)*100)/100,iva_perc:data.iva_aliquota*100,prezzo_a_corpo:true,detrazione_eur:0,detrazione_perc:0,costo_netto_dopo_detrazione:data.prezzo_vendita_manuale*(1+data.iva_aliquota)},
 scenario:{risparmio_mensile_eur:r.risparmioPrimoAnno/12,risparmio_anno1_eur:r.risparmioPrimoAnno,risparmio_25_anni_eur:0,payback_anni:null,npv_25_anni:0,cassa_anno_per_anno:[]},
 flows:{produzione_kwh:snapshot.input.produzioneAnnua,autoconsumo_kwh:0,ceduto_rete_kwh:0,prelievo_rete_kwh:0,autoconsumo_pct:p.quotaAutoconsumo,autosufficienza_pct:0,consumo_da_rete_pct:0,consumo_da_fv_pct:0},
 simulazione_azienda:true,simulazione_azienda_compatta:false,economia_azienda:snapshot,economia_azienda_richiesta:true,
 render_impianto:{img:dataImg,didascalia:"Modello dimostrativo: capannone 30 × 20 m, altezza 8 m. Disposizione e quantità coerenti con il preventivo. Non rappresenta un rilievo del cliente né una verifica strutturale, elettrica o antincendio."},
 componenti:[{categoria:"pannello",descrizione:"Modulo full black 500 Wp · modello da selezionare nel listino",quantita:piano.pannelli.length,potenza_w:500},{categoria:"inverter",descrizione:"Inverter trifase 50 kW · dimensionamento tecnico da verificare",quantita:1},{categoria:"altro",descrizione:"Strutture di supporto est-ovest e fissaggi · schema dimostrativo",quantita:1}],
 servizi:[{descrizione:"Installazione e servizi · inclusioni da confermare nell’offerta definitiva"}],
 template:modello??createFullFvTemplate({colore_primario:"#1E3A5F",colore_accento:"#F97316"},AZIENDA_GRENKE,p.modo==="noleggio"?"aziendale-noleggio":"aziendale"),
 };
 const html=renderFvPdfHtml(doc).replace(/<link href="https:\/\/fonts.googleapis.com[^>]+>/g,"").replace(/[\u2010-\u2015]/g,"-");
 return{html,contesto:contestoPersonalizzazioneFv(doc),pages:getFvPdfRenderedPagesCount(doc),snapshot,render,pianta:svgDisegnoCommerciale(piano)};
}
