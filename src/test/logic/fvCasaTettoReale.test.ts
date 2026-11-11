import {describe,it,expect} from "vitest";
import {datiCasaTettoReale,posaCasaReale,edificioCasaReale,PRODUZIONE_CASA_REALE,POTENZA_CASA_REALE,PREZZO_CASA_REALE,MESI_CASA_REALE,documentoCasaTettoReale,svgFotoCasaReale,renderCasaReale} from "../../../dev/fotovoltaico-locale/casaTettoReale";
import {pannelliDaRivedere,ingombroModulo,rettangoliSovrapposti} from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import {pannelliDalDisegnoReale} from "../../../dev/fotovoltaico-locale/tettoReale";
import pvgis from "../../../dev/fotovoltaico-locale/esempi/pvgis-delft-se.json";
describe("simulazione casa sul tetto pubblico reale",()=>{
 it("conserva il contorno 3DBAG, posa cinque moduli e lascia libera la zona visibile da rilevare",()=>{
  expect(edificioCasaReale.id).toContain("0503100000022863");
  expect(posaCasaReale.pannelli).toHaveLength(5);expect(pannelliDaRivedere(posaCasaReale)).toEqual([]);
  for(const m of posaCasaReale.pannelli){expect(m.faldaId).toBe("faccia-22");for(const o of posaCasaReale.ostacoli)expect(rettangoliSovrapposti(ingombroModulo(m,posaCasaReale.modulo),o,.3)).toBe(false);}
  for(const m of pannelliDalDisegnoReale(edificioCasaReale,posaCasaReale)){expect(m.larghezza).toBeCloseTo(1.134,3);expect(m.lunghezza).toBeCloseTo(1.762,3);}
 });
 it("collega quantità, potenza e produzione alla risposta PVGIS della località",()=>{
  const d=datiCasaTettoReale();expect(d.progetto.numero_pannelli).toBe(5);expect(POTENZA_CASA_REALE).toBe(2.25);
  expect(d.componenti.find(c=>c.categoria==="pannello")).toMatchObject({quantita:5,potenza_w:450});
  expect(PRODUZIONE_CASA_REALE).toBe(Math.round(pvgis.outputs.totals.fixed.E_y*2.25));
  expect(MESI_CASA_REALE.reduce((s,m)=>s+m.kwh,0)).toBeCloseTo(PRODUZIONE_CASA_REALE,0);
  expect(pvgis.inputs.location.latitude).toBeCloseTo(52.01169,4);expect(pvgis.inputs.mounting_system.fixed.azimuth.value).toBe(-42);
  expect(d.flows.autoconsumo_kwh+d.flows.ceduto_rete_kwh).toBe(PRODUZIONE_CASA_REALE);
  expect(d.flows.autoconsumo_kwh+d.flows.prelievo_rete_kwh).toBe(d.progetto.consumo_annuo_kwh);
 });
 it("ricalcola prezzo e percorso economico senza trascinare il campione precedente",()=>{
  const d=datiCasaTettoReale();expect(PREZZO_CASA_REALE).toBe(Math.round((5*270+900+1800)*1.22));
  expect(d.scenario.cassa_anno_per_anno[0].cumulato).toBe(-PREZZO_CASA_REALE);
  expect(d.scenario.cassa_anno_per_anno[1].cumulato).toBeCloseTo(-PREZZO_CASA_REALE+d.flows.autoconsumo_kwh*.32-100,2);
  expect(d.scenario.risparmio_25_anni_eur).toBeCloseTo(d.scenario.cassa_anno_per_anno.at(-1)!.cumulato,2);
  expect(d.progetto.has_accumulo).toBe(false);expect(d.finanziamento).toBeNull();
 });
 it("esporta undici pagine, fonti, ipotesi e foto realmente sovrapposta senza aggiungere la copertina",()=>{
  const doc=documentoCasaTettoReale("data:image/jpeg;base64,FAKE");expect(doc.pagine).toBe(12);
  expect(doc.html.match(/<div class="page">/g)).toHaveLength(12);expect(doc.html).toContain("12 / 12");expect(doc.html).toContain("2,25 kWp");
  expect(doc.html).toContain("normali climatiche");expect(doc.html).toContain("© 3DBAG by tudelft3d and 3DGI");expect(doc.html).toContain("non un calcolo orario");
  expect(doc.html).not.toContain('data-fv-section="copertina"');expect(doc.html).not.toContain("74.000");
  expect(svgFotoCasaReale("foto",false)).not.toContain("<polygon");expect(svgFotoCasaReale("foto")).toContain("stroke-dasharray");
  expect(renderCasaReale()).not.toContain("Schema di capannone");
 });
});
