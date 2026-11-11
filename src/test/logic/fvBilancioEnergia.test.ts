import {describe,it,expect} from "vitest";
import {datiBilancioEnergia,svgBilancioEnergia,htmlBilancioEnergia,svgScenaEnergia} from "../../../supabase/functions/_shared/fvBilancioEnergia";
import type {FvFlows} from "../../../supabase/functions/_shared/fvCalcoli";
const flows=(produzione=75000,autoconsumo=60000,ceduto=15000,prelievo=30000):FvFlows=>({produzione_kwh:produzione,autoconsumo_kwh:autoconsumo,ceduto_rete_kwh:ceduto,prelievo_rete_kwh:prelievo,autoconsumo_pct:0,autosufficienza_pct:0,consumo_da_fv_pct:0,consumo_da_rete_pct:0});
describe("Bilancio energetico aziendale leggibile",()=>{
 it("deriva le percentuali dai diversi denominatori e non dai campi percentuali salvati",()=>{const d=datiBilancioEnergia(flows(),90000);expect(d.quotaUso).toBe(.8);expect(d.quotaCopertura).toBeCloseTo(2/3);const a=svgBilancioEnergia(flows(),90000,"produzione"),b=svgBilancioEnergia(flows(),90000,"consumo");expect(a).toContain("80%");expect(a).toContain("20%");expect(b).toContain("67%");expect(b).toContain("33%");for(const v of ["75.000","60.000","15.000"])expect(a).toContain(v);for(const v of ["90.000","60.000","30.000"])expect(b).toContain(v);expect(a).not.toMatch(/linearGradient|filter=/);});
 it("non inventa percentuali o flussi quando i dati sono nulli",()=>{const z=flows(0,0,0,0),d=datiBilancioEnergia(z,0);expect(d.quotaUso).toBeNull();expect(d.quotaCopertura).toBeNull();const s=svgBilancioEnergia(z,0,"produzione");expect(s).not.toContain(">100%</text>");expect(s).not.toContain('fill="#DCE4EE"');expect(s).not.toContain('fill="#CFE6DD"');});
 it("gestisce senza produzione il fabbisogno coperto interamente dalla rete",()=>{const f=flows(0,0,0,90000);expect(svgBilancioEnergia(f,90000,"consumo")).toContain("100%");expect(datiBilancioEnergia(f,90000).quotaCopertura).toBe(0);});
 it.each([flows(75000,61000,15000,30000),flows(75000,60000,15000,20000),flows(-1,0,0,0),flows(Number.NaN,0,0,0)])("rifiuta un bilancio incoerente senza correggere silenziosamente i valori",f=>{expect(()=>datiBilancioEnergia(f,90000)).toThrow(/non coerente/);});
 it("spiega il significato delle percentuali e i rapporti numerici",()=>{const h=htmlBilancioEnergia(flows(),90000);expect(h).toContain("60.000 / 75.000 kWh");expect(h).toContain("60.000 / 90.000 kWh");expect(h).toContain("Quota della produzione");expect(h).toContain("Quota dei consumi");});
});

describe("Scena del capannone con bilancio dinamico",()=>{
 it("aggiorna quantità e percentuali con un diverso impianto, senza conservare i valori dimostrativi",()=>{
  const f=flows(1000000,700000,300000,500000),s=svgScenaEnergia(f,1200000),h=htmlBilancioEnergia(f,1200000);
  for(const value of ["1.000.000","700.000","300.000","500.000","1.200.000"])expect(s).toContain(value);
  expect(h).toContain("70%");expect(h).toContain("58%");expect(h).not.toContain("75.000");
  expect(s.match(/marker-end=/g)).toHaveLength(3);
 });
 it("mostra soltanto le direzioni con energia positiva",()=>{
  const tuttoInRete=svgScenaEnergia(flows(75000,0,75000,90000),90000);
  expect(tuttoInRete).not.toContain('marker-end="url(#fe-arrow-auto)"');
  expect(tuttoInRete).toContain('marker-end="url(#fe-arrow-out)"');
  const soloAuto=svgScenaEnergia(flows(75000,75000,0,0),75000);
  expect(soloAuto.match(/marker-end=/g)).toHaveLength(1);
  expect(soloAuto).toContain('marker-end="url(#fe-arrow-auto)"');
  expect(svgScenaEnergia(flows(0,0,0,0),0)).not.toContain("marker-end=");
 });
 it("distingue lo schema illustrativo dai dati energetici e mantiene una sola scena",()=>{
  const h=htmlBilancioEnergia(flows(),90000);
  expect(h.match(/<svg /g)).toHaveLength(1);
  expect(h).toContain("Edificio e pannelli illustrativi");expect(h).toContain("non rappresentano scambi simultanei");
  expect(()=>svgScenaEnergia(flows(75000,60000,16000,30000),90000)).toThrow(/non coerente/);
 });
});

describe("Bilancio energetico della casa privata",()=>{
 const casa=flows(7400,4200,3200,900);
 it("usa una casa e i suoi dati senza ereditare testi o numeri aziendali",()=>{
  const h=htmlBilancioEnergia(casa,5100,{tipo:"casa"});
  expect(h).toContain("La tua casa ne beneficia.");expect(h).toContain("La casa e i flussi");
  expect(h).toContain("4.200 / 7.400 kWh");expect(h).toContain("4.200 / 5.100 kWh");
  expect(h).toContain("57%");expect(h).toContain("82%");
  expect(h).not.toMatch(/capannone|tua attività/);expect(h).not.toContain(">75.000<");
 });
 it("mostra l'accumulo solo quando previsto senza inventare una quota di transito",()=>{
  const con=htmlBilancioEnergia(casa,5100,{tipo:"casa",hasAccumulo:true}),senza=htmlBilancioEnergia(casa,5100,{tipo:"casa",hasAccumulo:false});
  expect(con).toContain("ACCUMULO PREVISTO");expect(senza).not.toContain("ACCUMULO PREVISTO");
  expect(con).toContain("non separano utilizzo diretto");
  expect(con.match(/marker-end=/g)).toHaveLength(3);expect(senza.match(/marker-end=/g)).toHaveLength(3);
  expect(con).not.toContain("utilizzata direttamente");
 });
});
