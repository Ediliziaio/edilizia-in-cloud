import { nuovaPlanimetria, type Muro, type Origine, type Punto } from "../../../shared/planimetrie/modello";
import { frazionaContorno, inserisciFrazionamento } from "@/lib/planimetrie/frazionamento";

/** Capannone rettangolare sintetico, 30 × 10 m al filo interno. */
export function piantaTrecento(origine: Origine = "rilevata") {
  const documento = nuovaPlanimetria("Studio di prova · 300 m²");
  const piano = documento.livelli[0];
  const asse = [{x:-10,y:-10},{x:3010,y:-10},{x:3010,y:1010},{x:-10,y:1010}];
  const muro = (p1: Punto,p2: Punto,i: number): Muro => ({
    id:`contorno-${i+1}`,p1,p2,spessore:20,altezza:270,tipo:"esterno",stato:"esistente",origine,
  });
  piano.fatto.muri = asse.map((p,i)=>muro(p,asse[(i+1)%4],i));
  piano.fatto.locali = [{id:"open-space",nome:"Ambiente da dividere",destinazione:"altro",origine,altezza:270,
    contorno:[{x:0,y:0},{x:3000,y:0},{x:3000,y:1000},{x:0,y:1000}]}];
  piano.fatto.elementi = [{id:"scala",tipo:"scala",etichetta:"Scala esistente",posizione:{x:1500,y:240},rotazione:0,larghezza:110,profondita:220,
    altezza:270,origine,localeId:"open-space",stato:"esistente"}];
  return documento;
}

export function piantaDueUnita() {
  const documento = piantaTrecento();
  const livello = documento.livelli[0];
  const locale = livello.fatto.locali[0];
  const taglio = frazionaContorno(livello.fatto, locale, "x", [42]);
  if (!taglio.ok) throw new Error("La planimetria di prova non si può dividere in due unità.");
  livello.proposte = [inserisciFrazionamento({ ...livello.fatto, id: "B", nome: "Due unità" }, locale, taglio, ["A", "B"])];
  return documento;
}
