import { describe, expect, it } from "vitest";
import { piantaTrecento } from "@/test/fixtures/studioFrazionamento";
import {
  conAperturaVerificata, conQuotaVerificata, nuovaAperturaSullaTavola, posizioneVano,
  salvaRevisioneTavola, togliDallaTavola,
} from "@/lib/planimetrie/verificaTavola";
import { controllaAccessiLocali } from "@/lib/planimetrie/accessiPlanimetria";
import { distanza } from "../../../shared/planimetrie/geometria.ts";
import { origineMisura, validaPlanimetria, type Apertura, type Locale, type Muro, type Punto } from "../../../shared/planimetrie/modello.ts";

describe("Correzioni sulla tavola CAD",()=>{
  it("porta un vano sull’asse e salva le misure confermate nella nuova revisione",()=>{
    const doc=piantaTrecento();
    const piano=doc.livelli[0];
    const base=piano.fatto;
    const porta=nuovaAperturaSullaTavola(base,{x:510,y:-16},"porta",false);
    expect(porta.muroId).toBe(base.muri[0].id);
    expect(porta.offset).toBe(480);
    const primo=conAperturaVerificata(base,{...porta,larghezza:88.5},true);
    expect(origineMisura(primo.aperture[0],"larghezza")).toBe("rilevata");
    expect(primo.aperture[0].larghezza).toBe(88.5);
    expect(base.aperture).toEqual([]);
    expect(validaPlanimetria(salvaRevisioneTavola(doc,piano.id,"fatto",primo)).ok).toBe(true);
    expect(doc.livelli[0].fatto).toBe(base);
  });

  it("blocca sovrapposizioni, vani fuori parete e quote degeneri",()=>{
    const {fatto}=piantaTrecento().livelli[0];
    const a=nuovaAperturaSullaTavola(fatto,{x:510,y:-10},"finestra",false);
    const stato=conAperturaVerificata(fatto,a,false);
    expect(()=>conAperturaVerificata(stato,{...a,id:"seconda"},false)).toThrow(/sovrappone/i);
    expect(()=>conAperturaVerificata(stato,{...a,offset:-30},true)).toThrow(/lunghezza/i);
    expect(()=>conAperturaVerificata(stato,{...a,altezza:270},true)).toThrow(/davanzale/i);
    expect(()=>posizioneVano(stato,{x:500,y:400},"porta")).toThrow(/parete/i);
    expect(()=>posizioneVano(stato,{x:500,y:0},"porta",NaN)).toThrow(/larghezza/i);
    const q={id:"q",p1:{x:0,y:0},p2:{x:160,y:0},scostamento:35};
    expect(()=>conQuotaVerificata(stato,q,0,0,false)).toThrow(/positiva/i);
  });

  it("conserva il testo originale della quota e agisce solo sulla variante scelta",()=>{
    const doc=piantaTrecento();
    const p=doc.livelli[0];
    const q={id:"q",p1:{x:0,y:0},p2:{x:160,y:0},scostamento:35,testoOriginale:"1600"};
    const variante={...p.fatto,id:"A",nome:"Ristrutturazione",quote:[q]};
    p.proposte=[variante];
    const corretta=conQuotaVerificata(variante,q,168,-20,true);
    const salvata=salvaRevisioneTavola(doc,p.id,"progetto:A",corretta);
    expect(p.fatto.quote).toEqual([]);
    expect(salvata.livelli[0].fatto).toBe(p.fatto);
    const letta=salvata.livelli[0].proposte[0].quote[0];
    expect(distanza(letta.p1,letta.p2)).toBe(168);
    expect(letta).toMatchObject({testoOriginale:"1600",scostamento:-20,origine:"rilevata"});
    expect(togliDallaTavola(corretta,{tipo:"quota",id:"q"},true).quote).toHaveLength(0);
    expect(variante.quote[0]).toEqual(q);
  });
});

function vano(id:string,x:number,X:number,basso:number,alto:number):Locale {
  const contorno:Punto[]=[{x,y:basso},{x:X,y:basso},{x:X,y:alto},{x,y:alto}];
  return {id,nome:id,destinazione:"altro",contorno,altezza:270,origine:"rilevata"};
}

function separatore(id:string,p1:Punto,p2:Punto,tipo:Muro["tipo"]="tramezzo"):Muro {
  return {id,p1,p2,tipo,stato:"esistente",spessore:12,altezza:270,origine:"rilevata"};
}

function apertura(muroId:string,tipo:Apertura["tipo"],offset=50):Apertura {
  return {id:`${muroId}-${tipo}-${offset}`,muroId,tipo,offset,larghezza:80,altezza:210,davanzale:0,
    stato:"esistente",manovra:"battente",origine:"rilevata"};
}

describe("Controllo degli accessi dei nuovi ambienti",()=>{
  it("riconosce una porta verso il disimpegno e distingue un locale servito solo da una finestra",()=>{
    const {fatto}=piantaTrecento().livelli[0];
    const m1=separatore("passaggio",{x:0,y:194},{x:460,y:194});
    const m2=separatore("tramezzo",{x:225,y:200},{x:225,y:500});
    fatto.muri=[m1,m2];
    fatto.locali=[vano("Disimpegno",0,460,0,188),vano("Zona 1",0,219,200,500),vano("Zona 2",231,460,200,500)];
    fatto.aperture=[apertura(m1.id,"porta"),apertura(m1.id,"finestra",300)];
    const id=["Zona 1","Zona 2"];
    expect(controllaAccessiLocali(fatto,id).map(a=>a.esito)).toEqual(["collegato","assente"]);
    fatto.aperture.push(apertura(m2.id,"varco"));
    expect(controllaAccessiLocali(fatto,id).map(a=>a.esito)).toEqual(["collegato","collegato"]);
    fatto.aperture[0].stato="da_demolire";
    expect(controllaAccessiLocali(fatto,id).map(a=>a.esito)).toEqual(["da_verificare","da_verificare"]);
  });
});
