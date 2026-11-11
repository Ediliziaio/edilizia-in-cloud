import stima from "./esempi/grenke/pvgis-verificato.json";
import originale from "./esempi/grenke/sputnik.json";
import {validaTabellaNoleggio} from "../../supabase/functions/_shared/noleggioOperativo";
import {parametriEconomiaIniziali} from "../../supabase/functions/_shared/fvEconomiaAzienda";
import {fonteCapannone,configuraCapannone,POSA_BASE} from "./capannone";
import {datiDalDisegno} from "../../src/lib/fotovoltaico/disegnoPreventivo";
import type {WizardData} from "../../src/pages/azienda/fotovoltaico/FotovoltaicoWizard/types";
export const AZIENDA_GRENKE="demo-azienda-2-locale";
export const tabellaGrenke=()=>validaTabellaNoleggio(originale);
export const fonteGrenke=fonteCapannone({copertura:"piano",larghezza:30,profondita:20,altezza:8,pendenza:12,shed:3,corridoio:1.2},"capannone-grenke-70000");
export function datiGrenke(base:WizardData):WizardData{
 const piano=configuraCapannone(fonteGrenke,{corto:1.134,lungo:1.962,stimato:false},{...POSA_BASE,posa:"est_ovest",inclinazione:10,costi:{strutturaModulo:35,inverterAggiuntivi:0,prezzoInverter:5500}},120,1.2);
 const parametri={...parametriEconomiaIniziali(90000,.22),modo:"noleggio" as const,produzionePesiMensili:stima.pesiMensili,quotaAutoconsumo:.8,costiFissiAnnui:1800,durataNoleggioMesi:60,periodoNoleggioMesi:3 as const,tabellaNoleggio:tabellaGrenke()};
 return{...base,cliente_tipo:"azienda",archetipo:"pmi",cliente_nome:"Referente",cliente_cognome:"dimostrativo",cliente_ragione_sociale:"Cliente aziendale — simulazione",indirizzo:"Località dimostrativa Roma",iva_aliquota:.22,pannello_id:"demo-500",inverter_id:"demo-industriale-50",prezzo_vendita_manuale:57377.05,consumo_annuo_kwh:90000,costo_kwh_attuale:.22,finanziamento_modalita:"noleggio",...datiDalDisegno(piano,500,[]),economia_azienda:{parametri,snapshot:null}};
}

export const stimaGrenke=stima;
export function coincideStimaGrenke(lat:number,lng:number,gruppi:unknown){return lat===stima.lat&&lng===stima.lng&&JSON.stringify(gruppi)===JSON.stringify(stima.gruppi);}
