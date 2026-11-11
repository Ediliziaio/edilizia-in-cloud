import "fake-indexeddb/auto";
import {File as FileNode} from "node:buffer";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {afterEach,describe,expect,it,vi} from "vitest";
import * as THREE from "three";
import {centraRaster,leggiWorldFile,pixelMondo,mondoPixel,nuovaFalda,faldaDaOrto,edificioDaFalde,edificioCorretto,pianoDelRilievo,quoteEdificio,conservaPosaDopoCorrezione,ALLINEAMENTO_BASE,type RilievoLocale} from "../../../dev/fotovoltaico-locale/rilievoLocale";
import {affineGeoTiff} from "../../../dev/fotovoltaico-locale/importaOrtofoto";
import {fromArrayBuffer} from "../../../dev/fotovoltaico-locale/dependencies/geotiff";
import {salvaRilievoLocale,leggiRilievoLocale} from "../../../dev/fotovoltaico-locale/archivioRilievi";
import {caricaModelloLocale,correggiAltezzaMesh,rilasciaModello,centraOBJ,puntoSulModello} from "../../../dev/fotovoltaico-locale/importaModello";
import {leggiDisegnoCommerciale,pannelliDaRivedere} from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import {cambiaModalitaProgettazione} from "../../../supabase/functions/_shared/fvModalitaProgettazione";
const f1=nuovaFalda([{x:-5,y:-4,z:4},{x:5,y:-4,z:4},{x:5,y:0,z:6},{x:-5,y:0,z:6}],"falda-1","Sud"),f2=nuovaFalda([{x:-5,y:0,z:6},{x:5,y:0,z:6},{x:5,y:4,z:4},{x:-5,y:4,z:4}],"falda-2","Nord");
const crea=():RilievoLocale=>({versione:1,id:`test-${crypto.randomUUID()}`,nome:"Cliente test",creato:"2026-11-10",edificioBase:edificioDaFalde([f1,f2],true),orto:null,modello:null,altezzaManuale:null,allineamentoConfermato:true,provenienza:"importato"});
afterEach(()=>vi.unstubAllGlobals());
describe("Importazione locale di rilievi e correzione altezza",()=>{
 it("interpreta world file e conserva la trasformazione pixel/coordinate, anche ruotata",()=>{
  const a=leggiWorldFile("0.1\n0.02\n0.03\n-0.1\n500000.05\n4640000.05"),q=centraRaster(a,200,100);
  for(const p of [{x:0,y:0},{x:200,y:100},{x:53.5,y:12.5}]){const torna=mondoPixel(q.affine,pixelMondo(q.affine,p));expect(torna.x).toBeCloseTo(p.x,8);expect(torna.y).toBeCloseTo(p.y,8);}
  expect(()=>leggiWorldFile("0 0 0 0 0 0")).toThrow();expect(()=>leggiWorldFile("1 2 NaN")).toThrow();
 });
 it("conserva trasformazione GeoTIFF, raster point e matrici ruotate",()=>{
  const a=affineGeoTiff({scala:[.1,.1,0],legame:[0,0,0,500000,4640000,0]});expect(a).toEqual([.1,0,500000,0,-.1,4640000]);
  const p=affineGeoTiff({scala:[.1,.1,0],legame:[0,0,0,500000,4640000,0],pixelPunto:true});expect(p[2]).toBeCloseTo(499999.95);expect(p[5]).toBeCloseTo(4640000.05);
  expect(affineGeoTiff({matrice:[.1,.02,0,10,.01,-.1,0,20,0,0,1,0,0,0,0,1]})).toEqual([.1,.02,10,.01,-.1,20]);
 });
 it("decodifica il GeoTIFF RGB metrico di prova senza trattarlo come un raster di quote",async()=>{
  const bytes=await readFile(resolve("dev/fotovoltaico-locale/esempi/importazione-test/ortofoto-test.tif")),t=await fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),image=await t.getImage();
  expect(image.getGeoKeys()?.ProjectedCSTypeGeoKey).toBe(32632);expect(image.getBoundingBox()).toEqual([500000,4639980,500020,4640000]);const rgb=await image.readRGB({interleave:true,width:20,height:20});expect(rgb).toHaveLength(1200);
 });
 it("rifiuta pareti verticali, superfici non planari e contorni incrociati",()=>{
  expect(()=>nuovaFalda([{x:0,y:0,z:0},{x:4,y:0,z:0},{x:4,y:0,z:4}],"v","parete")).toThrow(/verticale/);
  expect(()=>nuovaFalda([{x:0,y:0,z:4},{x:4,y:0,z:4},{x:4,y:4,z:6},{x:0,y:4,z:4}],"v","non piano")).toThrow();
  expect(()=>nuovaFalda([{x:0,y:0,z:4},{x:4,y:4,z:4},{x:4,y:0,z:4},{x:0,y:4,z:4}],"v","incrocio")).toThrow();
 });
 it("costruisce una falda su ortofoto usando quota e pendenza inserite, senza inventare quote dal raster",()=>{
  const f=faldaDaOrto([{x:-5,y:-4},{x:5,y:-4},{x:5,y:0},{x:-5,y:0}],4,Math.atan(.5)*180/Math.PI,180,"sud");expect(Math.min(...f.anelli[0].map(p=>p.z))).toBeCloseTo(4);expect(Math.max(...f.anelli[0].map(p=>p.z))).toBeCloseTo(6);
 });
 it("porta una casa a 18 m conservando tetto, posa, quantità e originale",()=>{
  const fonte=crea(),originale=structuredClone(fonte),p=pianoDelRilievo(fonte,{corto:1.134,lungo:1.762,stimato:false},16),r={...fonte,altezzaManuale:18},ed=edificioCorretto(r),next=conservaPosaDopoCorrezione(p,fonte.edificioBase,ed);
  expect(quoteEdificio(ed)).toEqual({gronda:16,altezza:18});expect(next.pannelli.length).toBe(p.pannelli.length);expect(pannelliDaRivedere(next)).toEqual([]);expect(fonte).toEqual(originale);expect(()=>edificioCorretto({...fonte,altezzaManuale:1})).toThrow();
 });
 it("usa l’altezza completa del modello anche quando il contorno tracciato è interno al colmo",()=>{
  const fonte=crea();fonte.edificioBase.attributi.altezzaModello=7;const r={...fonte,altezzaManuale:18};expect(quoteEdificio(edificioCorretto(r)).altezza).toBe(18);expect(Math.max(...edificioCorretto(r).facce.filter(f=>f.tipo==="RoofSurface").flatMap(f=>f.anelli.flat().map(p=>p.z)))).toBe(17);
 });
 it("sottrae coordinate geografiche grandi prima della conversione in Float32",()=>{
  const obj=centraOBJ("v 500000.01 4640000.01 100\nv 500000.06 4640000.06 103\nv 500002.01 4640002.01 100\nf 1 2 3\n","z"),linee=obj.split("\n").filter(l=>l.startsWith("v ")).map(l=>l.split(" ").slice(1).map(Number));expect(linee[1][0]-linee[0][0]).toBeCloseTo(.05,7);expect(linee[1][2]).toBe(3);expect(()=>centraOBJ("v NaN 0 0","z")).toThrow();
 });
 it("conserva il riferimento al rilievo durante serializzazione e cambio modalità PDF",()=>{
  const fonte=crea(),p=pianoDelRilievo(fonte,{corto:1.134,lungo:1.762,stimato:false},8);expect(leggiDisegnoCommerciale(JSON.parse(JSON.stringify(p)))?.rilievo).toEqual(p.rilievo);
  const senza=cambiaModalitaProgettazione(p,true),ripreso=cambiaModalitaProgettazione(senza,false);expect(leggiDisegnoCommerciale(ripreso)?.rilievo).toEqual(p.rilievo);
  expect(leggiDisegnoCommerciale({...p,rilievo:{versione:2,id:"x",nome:"nome"}})).toBeNull();
 });
 it("salva e riapre geometria e correzioni nello stesso archivio locale",async()=>{
  const f=crea();await salvaRilievoLocale(f);expect(await leggiRilievoLocale(f.id)).toEqual(f);expect(await leggiRilievoLocale("inesistente")).toBeNull();
 });
 it("carica OBJ in unità note, applica l’asse verticale e conserva le dimensioni in metri",async()=>{
  vi.stubGlobal("URL",{createObjectURL:()=>"blob:modello-test",revokeObjectURL:()=>{}});
  const text=await readFile(resolve("dev/fotovoltaico-locale/esempi/importazione-test/casa-test.obj"),"utf8"),file=new FileNode([text],"casa.obj") as unknown as File;
  const g=await caricaModelloLocale({nome:"casa",files:[file],allineamento:{...ALLINEAMENTO_BASE,asseSu:"z"}}),box=new THREE.Box3().setFromObject(g),d=box.getSize(new THREE.Vector3());expect(d.x).toBeCloseTo(10);expect(d.y).toBeCloseTo(6);expect(d.z).toBeCloseTo(8);expect(puntoSulModello(g,{x:0,y:2})?.z).toBeCloseTo(5);expect(puntoSulModello(g,{x:100,y:100})).toBeNull();rilasciaModello(g);
 });
 it("corregge le istanze di geometria condivisa senza accumulare deformazioni",()=>{
  const geo=new THREE.BoxGeometry(2,4,2),mat=new THREE.MeshBasicMaterial(),g=new THREE.Group(),a=new THREE.Mesh(geo,mat),b=new THREE.Mesh(geo,mat);a.position.y=b.position.y=2;b.position.x=5;g.add(a,b);correggiAltezzaMesh(g,z=>z*2);const da=new THREE.Box3().setFromObject(a).getSize(new THREE.Vector3()),db=new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3());expect(da.y).toBeCloseTo(8);expect(db.y).toBeCloseTo(8);rilasciaModello(g);
 });
});
