import { describe, expect, it } from "vitest";
import { spostaCucina } from "@/lib/planimetrie/spostamentoCucina";
import { studioVariante } from "@/lib/planimetrie/studioImmobiliare";
import { nuovaPlanimetria, statoVuoto, validaPlanimetria, type Locale } from "../../../shared/planimetrie/modello";

function casa() {
  const doc = nuovaPlanimetria("Casa");
  const locale = (id: string, nome: string, destinazione: Locale["destinazione"], x: number, larghezza: number): Locale => ({
    id,nome,destinazione,unita:"A",altezza:270,origine:"da_documento",
    contorno:[{x,y:0},{x:x+larghezza,y:0},{x:x+larghezza,y:350},{x,y:350}],
  });
  const fatto = { ...statoVuoto(),
    locali:[locale("cucina","Cucina attuale","cucina",0,450),locale("sala","Sala","soggiorno",470,400)],
    elementi:[{ id:"mobile",tipo:"cucina",posizione:{x:180,y:60},larghezza:220,profondita:60,rotazione:0,origine:"da_documento" as const }],
  };
  doc.livelli = [
    {id:"p0",nome:"Piano terra",quota:0,fatto,proposte:[]},
    {id:"p1",nome:"Primo piano",quota:300,fatto:statoVuoto(),proposte:[{...statoVuoto(),id:"A",nome:"Ristrutturazione"}]},
  ];
  return doc;
}

const richiesta = { livelloId:"p0",varianteId:"A",origineId:"cucina",destinazioneId:"sala" };

describe("Spostamento della cucina nella variante", () => {
  it("conserva la variante sugli altri piani e calcola le voci dal locale di arrivo", () => {
    const originale = casa();
    const {documento,id} = spostaCucina(originale,richiesta);
    const revisione = studioVariante(documento,id);
    expect(validaPlanimetria(documento)).toMatchObject({ok:true});
    expect(id).toBe("A");
    expect(documento.livelli[1]).toBe(originale.livelli[1]);
    expect(documento.livelli[0].fatto.elementi[0].id).toBe("mobile");
    expect(documento.livelli[0].proposte[0].elementi.some(e=>e.id==="mobile")).toBe(false);
    expect(revisione.cucine[0]).toMatchObject({nuovo:{destinazione:"cucina"},ex:{destinazione:"soggiorno"},lunghezza:2.4});
    expect(revisione.righe.find(r=>r.descrizione.startsWith("Posa pavimento"))?.quantita).toBe(14);
    expect(revisione.righe.find(r=>r.descrizione.startsWith("Fornitura e montaggio"))?.quantita).toBe(2.4);
    expect(revisione.righe.find(r=>r.descrizione.startsWith("Scarico lavello"))).toMatchObject({quantita:null,unita:"m"});
    expect(() => spostaCucina(documento,richiesta)).toThrow();
  });

  it("attende la scala per le misure geometriche e segnala i locali modificati", () => {
    const originale = casa();
    originale.livelli[0].ricalco = {percorso:"tavola",x:0,y:0,larghezzaCm:900,proporzione:.4,opacita:.6,calibrata:false};
    const {documento,id} = spostaCucina(originale,richiesta);
    expect(studioVariante(documento,id).righe.every(r=>r.quantita===null)).toBe(true);
    documento.livelli[0].proposte[0].locali = documento.livelli[0].proposte[0].locali.filter(l=>l.id!=="sala");
    expect(studioVariante(documento,id).cucineDaRivedere).toEqual(["Piano terra"]);
  });
});
