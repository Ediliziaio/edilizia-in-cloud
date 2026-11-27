import { describe, expect, it } from "vitest";
import { puntiFaldaInQuota } from "../../../supabase/functions/_shared/fvGeometriaFalda";
import { geometriaTettoDocumento, svgTettoDocumento } from "../../../supabase/functions/_shared/fvTettoDocumento";
import { svgVistaTetto } from "../../../supabase/functions/_shared/fvRenderCommerciale";
import { disponiModuliAutomaticamente } from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import type { MappaFv } from "../../../supabase/functions/_shared/fvMappa";
import { edificioDaMappaFv, pianoDaMappaFv } from "@/components/fotovoltaico/tetto/mappaGeometria";

const mappa = (): MappaFv => ({
  versione: 1, origine: {lat:45,lng:9}, ricerca: {indirizzo:"Tetto di collaudo",posizione:{lat:45,lng:9}}, distanzaOstacoli:.3,
  falde: [{id:"falda-elle",nome:"Falda a L del cliente",punti:[{x:0,y:0},{x:14,y:0},{x:14,y:5},{x:8,y:5},{x:8,y:10},{x:0,y:10}],inclinazione:25,azimut:213,inclinazioneStimata:false,dislivelloGronda:1.25}],
});
const modulo={corto:1.134,lungo:1.762,stimato:false};

describe("casa e 3D derivati dalla falda dell’immobile",()=>{
  it.each([[0,0],[.5,32],[25,213],[60,89]])("conserva ogni vertice della falda a L con pendenza %s e azimut %s",(pendenza,azimut)=>{
    const m=mappa();m.falde[0].inclinazione=pendenza;m.falde[0].azimut=azimut;
    const piano={...pianoDaMappaFv(m,modulo),schema3d:{altezza:11,pendenza:0}};
    const edificio=edificioDaMappaFv(m,11),pdf=geometriaTettoDocumento(piano)!;
    const tetto=edificio.facce.filter(f=>f.tipo==="RoofSurface");
    expect(tetto).toHaveLength(1);expect(tetto[0].anelli[0]).toHaveLength(6);
    m.falde[0].punti.forEach((p,i)=>{
      expect(tetto[0].anelli[0][i].x).toBeCloseTo(p.x,8);expect(tetto[0].anelli[0][i].y).toBeCloseTo(p.y,8);
      expect(pdf.falde[0].punti[i].x).toBe(p.x);expect(pdf.falde[0].punti[i].y).toBe(p.y);
      expect(pdf.falde[0].punti[i].z).toBeCloseTo(tetto[0].anelli[0][i].z,8);
    });
    expect(Math.min(...pdf.falde[0].punti.map(p=>p.z))).toBeCloseTo(12.25,8);
  });
  it("la vista della casa e il PDF mostrano lo stesso tetto e gli stessi pannelli, anche ruotando la camera",()=>{
    const p=disponiModuliAutomaticamente(pianoDaMappaFv(mappa(),modulo),6,false,undefined,23);
    const geo=geometriaTettoDocumento(p)!;
    for(const lato of [0,1,2,3]){
      const casa=svgVistaTetto(p,lato);
      expect(casa).toBe(svgTettoDocumento(geo,"3d",lato));
      expect(casa).toContain('data-fv-roof="falda-elle"');
      expect(casa.match(/data-fv-panel=/g)).toHaveLength(p.pannelli.length);
      expect(casa).not.toContain("NaN");
    }
    expect(svgVistaTetto(p,0)).not.toBe(svgVistaTetto(p,1));
  });
  it("non inventa una casa se la mappa contiene una falda degenere",()=>{
    const p=pianoDaMappaFv(mappa(),modulo);
    p.mappa!.falde[0].punti=[{x:0,y:0},{x:1,y:0},{x:2,y:0}];
    expect(svgVistaTetto(p)).toContain("Controlla i contorni");
    expect(svgVistaTetto(p)).not.toContain("data-fv-roof");
  });
  it("interpreta la quota come gronda, senza sostituirla all’altezza del colmo",()=>{
    const ps=[{x:0,y:0},{x:8,y:0},{x:8,y:6},{x:0,y:6}];
    const falda=puntiFaldaInQuota(ps,9,30,180);
    expect(falda[0].z).toBeCloseTo(9,8);
    expect(falda[3].z).toBeCloseTo(9+6*Math.tan(Math.PI/6),8);
    expect(falda.map(({x,y})=>({x,y}))).toEqual(ps);
  });
});
