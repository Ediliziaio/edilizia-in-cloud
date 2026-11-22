export const ROMA_ISTAT = "058091";
export const TESTO_UNICO_EDILIZIA = "https://www.normattiva.it/eli/id/2001/10/20/001G0429/CONSOLIDATED";
export const LINEE_GUIDA_MIT = "https://www.mit.gov.it/linee-guida-dl-salva-casa";
export const ELENCO_COMUNI_ISTAT = "https://www.istat.it/classificazione/codici-dei-comuni-delle-province-e-delle-regioni/";
export const INDICE_PA = "https://www.indicepa.gov.it/ipa-portale/";
export const RICERCA_RNDT = "https://geodati.gov.it/geoportale/ricerca-dettagliata";
export const GEOPORTALE_CATASTALE = "https://geoportale.cartografia.agenziaentrate.gov.it/";
export const PGT_LOMBARDIA = "https://www.cartografia.servizirl.it/arcgis1/rest/services/territorio/tav_previsioni_b/MapServer";
export const CATASTO_LOMBARDIA = "https://www.cartografia.servizirl.it/arcgis7/rest/services/catasto/catastoRL/MapServer";
export const SIBA_LOMBARDIA = "https://www.cartografia.servizirl.it/arcgis2/rest/services/sistemiverdi/vincoli_paesaggistici/MapServer";
export const VINCOLI_LOMBARDIA = "https://www.cartografia.servizirl.it/vincolviewer/";
export const GEOROMA = "https://geoportale.comune.roma.it/georoma/#/";
export const GEOROMA_CATALOGO = "https://geoportale.comune.roma.it/catalogo/";
export const GEOROMA_WFS = "https://geoportale.comune.roma.it/geoserver/ows";
export const GEOROMA_WMS = "https://geoportale.comune.roma.it/geoserver/DIPAU/wms";
export const PRG_ROMA = "https://www.comune.roma.it/web/it/su-piano-regolatore-generale.page";
export const NTA_ROMA_COORDINATE = "https://www.comune.roma.it/web/it/informazione-di-servizio.page?contentId=IDS1633394";
export const PTPR_LAZIO = "https://www.regione.lazio.it/cittadini/urbanistica/pianificazione-paesaggistica/ptpr-approvato-rettificato";
export const SITAP = "https://cultura.gov.it/sitap-sistema-informativo-territoriale-ambientale-e-paesaggistico";
export const IDROGEO = "https://idrogeo.isprambiente.it/app/";

export function riferimentoCatastale(codiceIstat: string) {
  if (codiceIstat.startsWith("021")) return { nome: "GeoBrowser · Catasto di Bolzano", url: "https://natura-territorio.provincia.bz.it/it/geobrowser-maps" };
  if (codiceIstat.startsWith("022")) return { nome: "Cartografia catastale · Provincia di Trento", url: "https://www.provincia.tn.it/Servizi/Scarico-banca-dati-catasto-geometrico" };
  return { nome: "Geoportale cartografico catastale", url: GEOPORTALE_CATASTALE };
}
