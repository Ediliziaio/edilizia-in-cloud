import { describe, expect, it } from "vitest";
import { aPlanimetria, daPlanimetria } from "@/components/planimetrie/editor/adattatore";
import { calcolaVoce, leggiBozzaComputo, voceVuota } from "@/lib/computo/editorNativo";
import { importoLavoriDaComputo, ipotesiDaPlanimetria } from "@/lib/orders/generali/ipotesiDaPlanimetria";
import { calcolaIpotesi } from "@/lib/orders/generali/simulatore";
import { creaVarianteSpostamentoBagno } from "@/lib/planimetrie/spostamentoBagno";
import { computoStudio, studioVariante } from "@/lib/planimetrie/studioImmobiliare";
import { nuovaPlanimetria, statoVuoto, validaPlanimetria, type Locale } from "../../../shared/planimetrie/modello";

const planimetriaId = "e1f1ab9a-f16f-4a7e-83fd-d16d2bc780a6";
const contorno = (x: number, l: number, p: number) => [{x,y:0}, {x:x+l,y:0}, {x:x+l,y:p}, {x,y:p}];
const richiesta = {
  livelloId:"pt", origineId:"bagno", destinazioneId:"guardaroba",
  sanitari:["wc","lavabo","doccia"] as const, altezzaRivestimentoCm:120,
};

function casa() {
  const doc = nuovaPlanimetria("Casa di prova");
  const locale = (l: Pick<Locale,"id"|"nome"|"contorno"|"destinazione">): Locale => ({
    ...l, altezza:270, unita:"A", origine:"da_documento",
  });
  doc.livelli = [{
    id:"pt", nome:"Piano terra", quota:0, proposte:[],
    fatto:{ ...statoVuoto(),
      locali:[
        locale({id:"bagno",nome:"Bagno",destinazione:"bagno",contorno:contorno(0,200,250)}),
        locale({id:"guardaroba",nome:"Guardaroba",destinazione:"ripostiglio",contorno:contorno(220,250,300)}),
      ],
      elementi:[
        {id:"wc-fatto",tipo:"wc",posizione:{x:45,y:50},larghezza:40,profondita:55,rotazione:0,origine:"da_documento"},
        {id:"lavabo-fatto",tipo:"lavabo",posizione:{x:120,y:50},larghezza:60,profondita:45,rotazione:0,origine:"da_documento"},
      ],
    },
  }];
  return doc;
}

describe("Spostamento bagno dalla planimetria", () => {
  it("crea una variante con sanitari visibili e conserva lo stato di fatto", () => {
    const originale = casa();
    const { documento, id } = creaVarianteSpostamentoBagno(originale, richiesta);
    const [piano] = documento.livelli;
    const variante = piano.proposte.find(p => p.id === id)!;
    expect(piano.fatto).toEqual(originale.livelli[0].fatto);
    expect(variante.locali.map(l => [l.destinazione,l.contorno])).toEqual([
      ["ripostiglio",contorno(0,200,250)], ["bagno",contorno(220,250,300)],
    ]);
    expect(variante.elementi.map(e => e.tipo).sort()).toEqual(["doccia","lavabo","wc"]);
    expect(variante.elementi.every(e => e.stato === "nuovo" && e.origine === "stimata")).toBe(true);
    expect(validaPlanimetria(documento)).toMatchObject({ok:true});
    const daEditor = aPlanimetria(daPlanimetria(documento, piano.id, id), documento, piano.id, id);
    expect(studioVariante(daEditor,id).bagniDaRivedere).toEqual([]);
    expect(studioVariante(daEditor,id).bagni[0]?.nuovo.id).toBe("guardaroba");
  });

  it("misura superfici e apparecchi e lascia in sospeso i tracciati", () => {
    const { documento, id } = creaVarianteSpostamentoBagno(casa(), richiesta);
    const studio = studioVariante(documento,id);
    const trova = (testo: string) => studio.righe.find(r => r.descrizione.startsWith(testo));
    expect(trova("Rimozione sanitari")?.quantita).toBe(2);
    expect(trova("Impermeabilizzazione")?.quantita).toBe(7.5);
    expect(trova("Rivestimento pareti")?.quantita).toBe(13.2);
    expect(trova("Ripristino pavimento")?.quantita).toBe(5);
    expect(trova("Nuovi scarichi")).toMatchObject({ quantita:null, unita:"m" });
    expect(studio.righe.filter(r => r.descrizione.startsWith("Rivestimento pareti"))).toHaveLength(1);
    expect(studio.righe.filter(r=>r.quantita === null)).toHaveLength(6);
    expect(studioVariante(documento,null).unita[0]?.mqNetti).toBe(studio.unita[0]?.mqNetti);
    const fonte = {planimetriaId,versione:2,varianteId:id};
    const bozza = leggiBozzaComputo(JSON.stringify(computoStudio(fonte,"Bagno",studio.righe)));
    const voce = bozza.voci.find(v=> v.descrizione.startsWith("Impermeabilizzazione"))!;
    expect([voce.misure.length,calcolaVoce(voce).quantita,voce.prezzo]).toEqual([1,7.5,""]);
    expect(bozza.voci.find(v=>v.descrizione.startsWith("Nuovi scarichi"))?.daQuantificare).toBe(true);
  });

  it("richiede conferma quando il DWG non ha riconosciuto il bagno e attende la scala", () => {
    const doc = casa();
    doc.livelli[0].fatto.locali[0].destinazione = "altro";
    doc.livelli[0].ricalco = {percorso:"prova",x:0,y:0,larghezzaCm:500,proporzione:1,opacita:0.5,calibrata:false};
    expect(() => creaVarianteSpostamentoBagno(doc, richiesta)).toThrow("Conferma il bagno");
    const { documento, id } = creaVarianteSpostamentoBagno(doc, {...richiesta,confermaBagno:true});
    expect(documento.livelli[0].fatto.locali[0].destinazione).toBe("bagno");
    const studio = studioVariante(documento,id);
    expect(studio.righe.filter(r=>r.unita === "m²").every(r=>r.quantita === null)).toBe(true);
    expect(studio.bagni[0]?.daPosizionare).toEqual(["WC","Lavabo","Doccia"]);
    expect(() => creaVarianteSpostamentoBagno(documento,{...richiesta,daVariante:id})).toThrow();
  });

  it("trasferisce nel business plan solo un totale completo e conserva i segni delle detrazioni", () => {
    const { documento, id } = creaVarianteSpostamentoBagno(casa(), richiesta);
    const fonte = {planimetriaId,versione:2,varianteId:id,modello:"compravendita" as const};
    const bozza = computoStudio(fonte,"Bagno",studioVariante(documento,id).righe);
    expect(importoLavoriDaComputo(bozza)).toMatchObject({importo:null,incomplete:15,daPrezzare:15});
    const voci = bozza.voci.map(v => ({ ...v, daQuantificare:false, quantita:v.quantita || "1", prezzo:"10" }));
    const detrazione = {...voceVuota(),descrizione:"Detrazione",unita:"cad",quantita:"1",prezzo:"12,34",detrazione:true};
    const esclusa = {...voceVuota(),descrizione:"Opzione",opzionale:true};
    const { importo } = importoLavoriDaComputo({...bozza,voci:[...voci,detrazione,esclusa]});
    expect(importo).toBe(504.66);
    const {ipotesi} = ipotesiDaPlanimetria({documento,fonte,inizio:"2027-01",importoComputo:importo});
    expect(calcolaIpotesi(ipotesi).voci.find(v=>v.chiave==="costruzione")?.importo).toBe(importo);
  });
});
