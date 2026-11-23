import { describe, expect, it } from "vitest";
import { attraversamentiImpianto, percorsiImpianti } from "../../../shared/planimetrie/impianti.ts";
import { nuovaPlanimetria, type Apertura, type Locale, type Planimetria, type Proposta } from "../../../shared/planimetrie/modello.ts";
import { aPlanimetria, daPlanimetria } from "@/components/planimetrie/editor/adattatore";
import { comandiDaChatDisegno } from "@/components/planimetrie/editor/comandiChat";
import { muriChiusiSulPercorso, proponiPercorsoScarico } from "./percorsoScarico";

function modello() {
  const documento = nuovaPlanimetria();
  const livello = documento.livelli[0];
  const rettangolo = (id:string, sinistra:number, destra:number, destinazione:Locale["destinazione"]): Locale => ({
    id,nome:id,unita:"A",destinazione,altezza:275,origine:"rilevata",
    contorno:[{x:sinistra,y:0},{x:destra,y:0},{x:destra,y:220},{x:sinistra,y:220}],
  });
  const porta = (id:string,muroId:string): Apertura => ({
    id,muroId,tipo:"porta",offset:125,larghezza:70,altezza:210,davanzale:0,
    manovra:"battente",stato:"esistente",origine:"rilevata",
  });
  livello.fatto.locali = [rettangolo("Bagno",0,195,"bagno"),rettangolo("Antibagno",205,395,"disimpegno"),rettangolo("Cucina",405,620,"cucina")];
  livello.fatto.muri = [200,400].map((x,i)=>({id:"m"+i,p1:{x,y:0},p2:{x,y:220},tipo:"tramezzo",altezza:275,spessore:10,origine:"rilevata",stato:"esistente"}));
  livello.fatto.aperture = [porta("P1","m0"),porta("P2","m1")];
  const stato: Proposta = { ...livello.fatto, id:"A", nome:"Variante", distribuzioneBilocali:true, elementi:[
    {id:"colonna",tipo:"colonna_scarico",posizione:{x:40,y:45},rotazione:0,larghezza:12,profondita:12,stato:"nuovo",origine:"stimata"},
    {id:"lavello",tipo:"cucina",posizione:{x:560,y:45},rotazione:0,larghezza:110,profondita:60,stato:"nuovo",origine:"stimata"},
  ] };
  livello.proposte=[stato];
  return { documento, livello, stato };
}
const tubo = (stato: Proposta) => percorsiImpianti(stato).percorsi.find(p => p.linea === "scarico")!;

describe("proposta dello scarico sulla planimetria",()=>{
  it("evita le pareti chiuse usando i due vani e aggiorna soltanto la variante in anteprima",()=>{
    const { documento, livello, stato } = modello();
    expect(muriChiusiSulPercorso(tubo(stato),stato)).toHaveLength(2);
    const pianta = daPlanimetria(documento,livello.id,"A");
    const esito = comandiDaChatDisegno(pianta,"progetto","Proponi un percorso dello scarico che eviti i due incroci",{
      documento,livelloId:livello.id,propostaId:"A",
    });
    const passo=esito.passi[0];
    expect(passo.testo).toContain("2 → 0");
    expect(passo.daVerificare).toContain("quota di fondo tubo");
    expect(stato.tracciatiImpianti).toBeUndefined();
    const aggiornato=aPlanimetria(passo.pianta,documento,livello.id,"A") as Planimetria;
    const progetto=aggiornato.livelli[0].proposte[0];
    expect(progetto.tracciatiImpianti).toHaveLength(1);
    expect(attraversamentiImpianto(tubo(progetto),progetto).map(a=>a.aperturaId)).toEqual(["P1","P2"]);
  });
  it("lascia la pianta intatta se il passaggio è chiuso o attraversa un’altra unità",()=>{
    const { stato } = modello();
    const percorso=tubo(stato);
    const chiuso={...stato,aperture:[stato.aperture[0]]};
    expect(proponiPercorsoScarico(percorso,chiuso)).toBeNull();
    const altra={...stato,locali:stato.locali.map(l=>l.id==="Antibagno" ? {...l,unita:"B"} : l)};
    expect(proponiPercorsoScarico(percorso,altra)).toBeNull();
  });
});
