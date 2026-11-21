import { describe, expect, it } from "vitest";
import { inquadraturaSatellitePdf, svgSatelliteDocumento } from "../../../supabase/functions/_shared/fvSatelliteDocumento";
import { leggiDisegnoCommerciale, disponiModuliAutomaticamente } from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { vistePdfTetto } from "../../../supabase/functions/_shared/fvVistePdf";
import { pianoDaMappaFv, edificioDaMappaFv } from "../../components/fotovoltaico/tetto/mappaGeometria";
import { pannelliDalDisegnoReale } from "../../components/fotovoltaico/tetto/tettoReale";
import { riferimentoMappaGoogleFv } from "../../components/fotovoltaico/tetto/riferimentoMappaGoogle";
import { mondoPixel } from "../../components/fotovoltaico/tetto/rilievoLocale";
const piano = () => disponiModuliAutomaticamente(pianoDaMappaFv({ versione: 1, origine: {lat:45.46378,lng:9.18983}, ricerca: {indirizzo:"Collaudo",posizione:{lat:45.46378,lng:9.18983}}, distanzaOstacoli:.3, falde:[{id:"f1",nome:"Falda 1",punti:[{x:-6,y:-4},{x:6,y:-4},{x:6,y:4},{x:-6,y:4}],inclinazione:30,azimut:180,inclinazioneStimata:true}] }, {corto:1.134,lungo:2.165,stimato:false}),18);

describe("Satellite PDF e viste effettivamente preparate", () => {
  it("non inventa il 3D se è stata disegnata soltanto la mappa", () => {
    const p=piano();
    expect(vistePdfTetto(p)).toEqual({satellite:true,pianta:true,treD:false});
    expect(vistePdfTetto({...p,schema3d:{altezza:12,pendenza:30}}).treD).toBe(true);
    expect(vistePdfTetto({...p,schema3d:{altezza:12,pendenza:30},vistePdf:{satellite:true,pianta:true,treD:false}}).treD).toBe(false);
    expect(vistePdfTetto({...p,mappa:undefined}).satellite).toBe(false);
  });
  it("conserva le tre scelte nel salvataggio JSON e rifiuta valori ambigui", () => {
    const p={...piano(),vistePdf:{satellite:false,pianta:true,treD:true}};
    expect(leggiDisegnoCommerciale(JSON.parse(JSON.stringify(p)))?.vistePdf).toEqual(p.vistePdf);
    expect(leggiDisegnoCommerciale({...p,vistePdf:{...p.vistePdf,treD:"true"}})).toBeNull();
  });
  it("allinea i vertici dei 18 moduli alla medesima foto Google usata nell’editor", () => {
    const p=piano(),vista=inquadraturaSatellitePdf(p)!;
    const svg=svgSatelliteDocumento(p,{...vista,img:"data:image/png;base64,QUJD",provider:"google"});
    const reali=pannelliDalDisegnoReale(edificioDaMappaFv(p.mappa!),p);
    const orto=riferimentoMappaGoogleFv(p.mappa!.origine,vista.centro,vista.zoom,{w:vista.w,h:vista.h});
    const moduli=[...svg.matchAll(/data-fv-satellite-panel="true" points="([^"]+)"/g)];
    expect(moduli).toHaveLength(18);
    moduli.forEach((m,i)=>m[1].split(" ").forEach((xy,j)=>{
      const [x,y]=xy.split(",").map(Number),atteso=mondoPixel(orto.affine,reali[i].vertici[j]);
      expect(x).toBeCloseTo(atteso.x,2);expect(y).toBeCloseTo(atteso.y,2);
      expect(x).toBeGreaterThan(0);expect(x).toBeLessThan(vista.w);
      expect(y).toBeGreaterThan(0);expect(y).toBeLessThan(vista.h);
    }));
    expect(svg).toContain('preserveAspectRatio="none"');
    expect(svg).not.toMatch(/NaN|Infinity/);
    expect(svgSatelliteDocumento(p,{...vista,img:'https://evil.invalid/x',provider:'google'})).toBe('');
  });
});
