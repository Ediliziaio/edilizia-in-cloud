import { definizioneCampo, type TipoCampo } from "@/lib/planimetrie/campiSport";
import { interniSovrapposti, puntoNelPoligono, segmentiSiIncrociano } from "../../../../shared/planimetrie/geometria.ts";
import type { Pianta, Punto } from "./adattatore";
import * as C from "./comandi";

export function sportRichiesti(testo: string): TipoCampo[] {
  const tipi: TipoCampo[] = [];
  if (/\b(?:calcio|calio|calcetto)\b/iu.test(testo)) {
    tipi.push(/\b(?:11|undici)\b/u.test(testo) ? "campo_calcio11" : /\b(?:7|sette)\b/u.test(testo) ? "campo_calcio7" : "campo_calcio5");
  }
  if (/\b(?:padel|padle|paddle|pealdle)\b/iu.test(testo)) tipi.push("campo_padel");
  if (/\btennis\b/iu.test(testo)) tipi.push("campo_tennis");
  return tipi;
}

function fascia(contorno: Punto[], asse: "x" | "y") {
  const valori = contorno.map(p => p[asse]);
  return [Math.min(...valori),Math.max(...valori)] as const;
}

function dentroLotto(poligono: Punto[], lotto: Punto[]) {
  return poligono.every(p=>puntoNelPoligono(p,lotto)) && !poligono.some((p,i)=>
    lotto.some((q,j)=>segmentiSiIncrociano(p,poligono[(i+1)%poligono.length],q,lotto[(j+1)%lotto.length]))
  );
}

/** Usa il modello sportivo esistente e cerca un’impronta libera nel lotto disegnato. */
export function posaCampoDaChat(pianta: Pianta, vista: C.Vista, tipo: TipoCampo) {
  const campo = definizioneCampo(tipo);
  if (!campo) throw new Error("Campo sportivo non disponibile.");
  const [larghezza,profondita] = campo.ingombro;
  const visibile = (o: {stato: Parameters<typeof C.visibile>[0]}) =>
    C.visibile(o.stato,vista) && (vista === "fatto" || o.stato !== "da_demolire");
  const aree = (pianta.aree ?? []).filter(visibile);
  const lotti = aree.filter(a=>a.tipo==="lotto");
  const locali = pianta.locali.filter(visibile).map(l=>l.contorno);
  const muri = pianta.muri.filter(visibile).map(m => {
    const margine = m.spessore/2;
    return C.rettangolo({x:Math.min(m.p1.x,m.p2.x)-margine,y:Math.min(m.p1.y,m.p2.y)-margine},
      {x:Math.max(m.p1.x,m.p2.x)+margine,y:Math.max(m.p1.y,m.p2.y)+margine});
  });
  const elementi = (pianta.elementi ?? []).filter(visibile).map(e=>{
    const r = e.rotazione * Math.PI / 180;
    return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([i,j])=>{
      const x=i*e.larghezza/2,y=j*e.profondita/2;
      return {x:e.centro.x+x*Math.cos(r)-y*Math.sin(r),y:e.centro.y+x*Math.sin(r)+y*Math.cos(r)};
    });
  });
  const ostacoli = [...locali,...muri,...elementi];
  const impronta = (x: number,y: number) => C.rettangolo({x,y},{x:x+larghezza,y:y+profondita});
  let origine: Punto | undefined;
  for (const lotto of lotti) {
    const [x0,x1] = fascia(lotto.contorno,"x"), [y0,y1] = fascia(lotto.contorno,"y");
    for (let y=y0+5; y+profondita<y1 && !origine; y+=100) {
      for (let x=x0+5; x+larghezza<x1; x+=100) {
        const rettangolo = impronta(x,y);
        if (!dentroLotto(rettangolo,lotto.contorno) || ostacoli.some(o=>interniSovrapposti(rettangolo,o))) continue;
        origine = {x,y};
        break;
      }
    }
    if (origine) break;
  }
  if (!origine && lotti.length) throw new Error(`Non ho trovato spazio libero per «${campo.nome}» nel lotto disegnato. L’ingombro del modello è ${larghezza/100} × ${profondita/100} m.`);
  if (!origine) {
    const occupati = ostacoli.flat();
    origine = occupati.length ? {x:fascia(occupati,"x")[1]+150,y:fascia(occupati,"y")[0]} : {x:0,y:0};
  }
  const r = C.aggiungiElemento(pianta,{tipo,larghezza,profondita,etichetta:campo.nome},
    {x:origine.x+larghezza/2,y:origine.y+profondita/2},{stato:C.statoNuovo(vista)});
  return { ...r, campo, nelLotto: lotti.length > 0 };
}
