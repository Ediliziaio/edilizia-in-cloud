import { describe, expect,it } from "vitest";
import { piantaTrecento } from "@/test/fixtures/studioFrazionamento";
import { alternativeFrazionamento, frazionaContorno, inserisciFrazionamento } from "@/lib/planimetrie/frazionamento";
import { computoStudio,computoStudioRevisionato,idComputoStudio,studioVariante } from "@/lib/planimetrie/studioImmobiliare";
import { ipotesiDaPlanimetria } from "@/lib/orders/generali/ipotesiDaPlanimetria";
import { calcolaIpotesi } from "@/lib/orders/generali/simulatore";
import { operazioneDaIpotesi } from "@/lib/orders/generali/simulatoreOperazione";
import { calcolaVoce,leggiBozzaComputo } from "@/lib/computo/editorNativo";
import { verificaComputoConPlanimetria, vociPerCommessaDallaVariante } from "@/lib/planimetrie/computoConPlanimetria";
import { improntaVoci, rigaDaVoce } from "@/lib/computo/computoDaVoci";
import { aPlanimetria, daPlanimetria, piantaVuota } from "@/components/planimetrie/editor/adattatore";
import { aggiungiStanza, modificaMuro } from "@/components/planimetrie/editor/comandi";
import { areaPoligono } from "../../../shared/planimetrie/geometria";
import { validaPlanimetria } from "../../../shared/planimetrie/modello";
import { leggiRispostaFrazionamento,leggiRispostaUrbanistica } from "../../../shared/planimetrie/assistenzaStudio";
import { esitiInquadramento,nuovoFascicoloUrbanistico,valutaUrbanistica,type FonteUrbanistica } from "../../../shared/planimetrie/urbanistica";

const planimetriaId = "e1f1ab9a-f16f-4a7e-83fd-d16d2bc780a6";

function conVarianti(comune = false) {
  const doc = piantaTrecento(), livello = doc.livelli[0], locale = livello.fatto.locali[0];
  const due = frazionaContorno(livello.fatto,locale,"x",[42]);
  const tre = frazionaContorno(livello.fatto,locale,"x",[33.33,66.67]);
  if (!due.ok || !tre.ok) throw new Error("Geometria del caso di prova");
  livello.proposte = [
    inserisciFrazionamento({...livello.fatto,id:"A",nome:"2 unità"},locale,due,["A","B"]),
    inserisciFrazionamento({...livello.fatto,id:"B",nome:"3 porzioni"},locale,tre,["A","B",comune ? "Parti comuni" : "C"]),
  ];
  return doc;
}

describe("Frazionamento prima dell’acquisto",()=>{
  it("conserva il contorno netto del CAD durante un cambio di pavimento e aggiorna la quantità se cambiano le pareti", () => {
    const perimetro = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }];
    const disegno = aggiungiStanza(piantaVuota(), perimetro, { nome: "Garage", spessore: 20 }).pianta;
    const originale = aPlanimetria(disegno);
    const piano = originale.livelli[0];
    piano.id = "cad-1";
    const [locale] = piano.fatto.locali;
    locale.contorno = locale.contorno.map((p, i) => ({ x: p.x, y: p.y + (i < 2 ? 0.35 : 0) }));
    locale.superficieDichiarataMq = 11;
    const editor = daPlanimetria(originale, piano.id);
    const variante = { ...editor, nomiProgetto: { [locale.id]: {
      nome: locale.nome, destinazione: locale.destinazione, finiture: { pavimento: "Gres" },
    } } };
    const salvataggio = aPlanimetria(variante, originale, piano.id);
    expect(salvataggio.livelli[0].fatto.locali[0].contorno).toEqual(locale.contorno);
    expect(salvataggio.livelli[0].proposte[0].locali[0].contorno).toEqual(locale.contorno);
    expect(studioVariante(salvataggio, "A").righe[0]?.quantita).toBe(Math.round(areaPoligono(locale.contorno) / 100) / 100);
    const paretePiuSpessa = modificaMuro(variante, piano.fatto.muri[0].id, { spessore: 30 });
    const diversa = aPlanimetria(paretePiuSpessa, originale, piano.id);
    expect(studioVariante(diversa, "A").righe[0]?.quantita).toBeLessThan(studioVariante(salvataggio, "A").righe[0]?.quantita ?? 0);
  });

  it("blocca un taglio sulla scala e ammette alternative che la conservano",()=>{
    const {fatto}=piantaTrecento().livelli[0], [locale]=fatto.locali;
    expect(frazionaContorno(fatto,locale,"x",[50])).toEqual({ok:false,motivo:"Il tramezzo incontra Scala esistente."});
    const alternative=alternativeFrazionamento(fatto,locale,"x",[50]);
    expect(alternative.some(a=>a.asse==="x" && a.percentuali.includes(50))).toBe(false);
    expect(leggiRispostaFrazionamento({suggerimenti:[{id:"99",motivazione:"Invalida",verifiche:[]},{id:alternative[0].id,motivazione:"Conserva la scala",verifiche:[]}]},alternative)).toHaveLength(1);
  });

  it("misura due e tre unità al netto dei tramezzi, con una voce per ciascun muro",()=>{
    const doc=conVarianti(), due=studioVariante(doc,"A"), tre=studioVariante(doc,"B");
    expect(validaPlanimetria(doc)).toMatchObject({ok:true});
    expect(due.unita.map(u=>u.mqNetti)).toEqual([125.4,173.4]);
    expect(tre.unita.map(u=>u.mqNetti)).toEqual([99.39,98.82,99.39]);
    expect(tre.muriMq).toBe(2.4);
    expect(tre.righe.map(r=>[r.gruppo,r.quantita])).toEqual([["Parti comuni",27],["Parti comuni",27]]);
    expect(doc.livelli[0].fatto.locali).toHaveLength(1);
  });

  it("sospende il computo di una demolizione CAD già salvata finché la parete è da classificare", () => {
    const doc = conVarianti(), piano = doc.livelli[0], muro = piano.fatto.muri[0];
    muro.tipo = "tramezzo";
    muro.funzioneDaVerificare = true;
    const proposta = piano.proposte[0];
    proposta.muri = proposta.muri.map(m => m.id === muro.id ? { ...muro, stato: "da_demolire" } : m);
    const riga = () => studioVariante(doc, proposta.id).righe.find(r => r.id === muro.id);
    expect(riga()).toMatchObject({ descrizione: "Demolizione parete", quantita: null, quantificazioneSospesa: true });
    muro.funzioneDaVerificare = false;
    expect(riga()).toMatchObject({ descrizione: "Demolizione tramezzo", quantita: expect.any(Number) });
  });

  it("conserva la variante nel passaggio documento → editor → documento",()=>{
    const doc=conVarianti(), id=doc.livelli[0].id;
    const ricalcolato=aPlanimetria(daPlanimetria(doc,id,"B"),doc,id,"B");
    const tre=studioVariante(ricalcolato,"B");
    expect(tre.sovrapposti).toEqual([]);
    expect(tre.senzaUnita).toBe(0);
    expect(tre.unita.map(u=>u.mqNetti)).toEqual([99.39,98.82,99.39]);
    expect(ricalcolato.livelli[0].fatto.locali).toHaveLength(1);
    expect(ricalcolato.livelli[0].proposte[1].elementi.find(e=>e.id==="scala")?.posizione).toEqual({x:1500,y:240});
  });

  it("salva l’altezza della parete esistente in ogni variante e ricalcola la demolizione", () => {
    const doc = conVarianti(), piano = doc.livelli[0], muro = piano.fatto.muri[0];
    muro.origineMisure = { lunghezza: "da_documento", altezza: "stimata" };
    for (const p of piano.proposte) {
      p.muri = p.muri.map(m => m.id === muro.id ? { ...muro, stato: "da_demolire" } : m);
    }
    expect(studioVariante(doc, "A").righe.find(r => r.id === muro.id)?.quantita).toBeNull();
    const pianta = modificaMuro(daPlanimetria(doc, piano.id, "A"), muro.id, { altezza: 285, origineAltezza: "rilevata" });
    const aggiornata = aPlanimetria(pianta, doc, piano.id, "A");
    for (const p of aggiornata.livelli[0].proposte) {
      expect(p.muri.find(m => m.id === muro.id)).toMatchObject({ altezza: 285, origineMisure: { lunghezza: "da_documento", altezza: "rilevata" } });
      expect(studioVariante(aggiornata, p.id).righe.find(r => r.id === muro.id)).toMatchObject({ quantita: expect.any(Number), criterio: expect.stringContaining("2,85 m") });
    }
    expect(muro.origineMisure.altezza).toBe("stimata");
  });

  it("conta la superficie comune una volta e lascia i prezzi mancanti da compilare",()=>{
    const doc=conVarianti(true), studio=studioVariante(doc,"B");
    expect(studio.comuni).toBe(99.39);
    expect(studio.unita.map(u=>u.sigla)).toEqual(["A","B"]);
    const fonte = {planimetriaId,varianteId:"B",versione:7};
    const bozza=leggiBozzaComputo(JSON.stringify(computoStudio(fonte, "Tre porzioni",studio.righe)));
    expect(bozza.fontePlanimetria).toEqual(fonte);
    expect(bozza.voci).toHaveLength(2);
    expect(calcolaVoce(bozza.voci[0]).importo).toBeNull();
    expect(calcolaVoce({...bozza.voci[0],prezzo:"0"}).importo).toBe(0);
  });

  it("esplicita una tavola senza scala e mantiene distinte le bozze salvate",async()=>{
    const doc=conVarianti();
    doc.livelli[0].ricalco={percorso:"prova",x:0,y:0,larghezzaCm:1000,proporzione:.5,opacita:.6,calibrata:false};
    const studio=studioVariante(doc,"B");
    expect(studio.scalaIncerta).toBe(true);
    expect(studio.righe.map(r=>r.quantita)).toEqual([null,null]);
    const fonte={planimetriaId,versione:2,varianteId:"B"};
    expect(await idComputoStudio(fonte)).toBe(await idComputoStudio({...fonte}));
    expect(await idComputoStudio(fonte)).not.toBe(await idComputoStudio({...fonte,versione:3}));
    expect(await idComputoStudio(fonte)).not.toBe(await idComputoStudio({...fonte,varianteId:"A"}));
  });

  it("riporta prezzi, fonte e misure corrette a mano senza sostituire il computo precedente",()=>{
    const studio=studioVariante(conVarianti(),"B");
    const fonte={planimetriaId,versione:3,varianteId:"B"};
    const base=computoStudio(fonte,"Variante",studio.righe);
    const precedente={...base,voci:[
      {...base.voci[0],prezzo:"100",tariffa:"PROVA-01",fonte:"Offerta di prova",misure:[],quantita:"30"},
      base.voci[1],
    ]};
    const nuova=computoStudio({...fonte,versione:4},"Variante",studio.righe.map(r=>({...r,quantita:24})));
    const aggiornata=computoStudioRevisionato(nuova,precedente,base);
    expect(aggiornata.voci[0]).toMatchObject({prezzo:"100",fonte:"Offerta di prova",tariffa:"PROVA-01",quantita:"30"});
    expect(aggiornata.voci[0].noteMisure).toMatch(/Quantità ripresa/);
    expect(calcolaVoce(aggiornata.voci[1]).quantita).toBe(24);
    expect(calcolaVoce(precedente.voci[1]).quantita).toBe(27);
  });

  it("confronta le quantità della bozza con la variante e riconosce le misure modificate", () => {
    const { righe } = studioVariante(conVarianti(), "B");
    const riga = { ...righe[0], stimata: false };
    const bozza = computoStudio({ planimetriaId, versione: 7, varianteId: "B" }, "Tre porzioni", [riga]);
    const [voce] = bozza.voci;
    expect(verificaComputoConPlanimetria([voce], [riga])[0]).toMatchObject({ stato: "pianta", quantita: 27 });
    expect(verificaComputoConPlanimetria([voce], [{ ...riga, stimata: true }])[0].stato).toBe("indicativa");
    expect(verificaComputoConPlanimetria([{ ...voce, misure: [], quantita: "30" }], [riga])[0]).toMatchObject({ stato: "manuale", quantita: 30 });
    expect(verificaComputoConPlanimetria([{ ...voce, daQuantificare: true }], [riga])[0].stato).toBe("daMisurare");
  });

  it("porta in commessa misure tracciabili e sospende i numeri senza una scala verificata", () => {
    const doc = conVarianti();
    const fonte = { planimetriaId, versione: 3, varianteId: "B" };
    const bozza = computoStudio(fonte, "Tre porzioni", studioVariante(doc, "B").righe);
    const [prima, seconda] = bozza.voci;
    bozza.voci = [
      { ...prima, prezzo: "45", fonte: "Offerta di prova" },
      { ...seconda, id: "manuale", misure: [], quantita: "-1.5", prezzo: "10" },
      { ...seconda, opzionale: true },
    ];
    const voci = vociPerCommessaDallaVariante(bozza, doc);
    expect(voci).toHaveLength(2);
    expect(rigaDaVoce(voci[0], 0)).toMatchObject({
      voce: { importo_computo: 1215, descrizione_estesa: expect.stringContaining("Offerta di prova") },
      misure: [{ planimetria_id: planimetriaId, planimetria_versione: 3 }],
    });
    expect(rigaDaVoce(voci[1], 1).voce).toMatchObject({ is_detrazione: true, quantita: 1.5, importo_computo: 15 });
    expect(improntaVoci(voci, true)).not.toBe(improntaVoci([{ ...voci[0], fonte: "Offerta aggiornata" }, voci[1]], true));
    doc.livelli[0].ricalco = { percorso: "prova", x: 0, y: 0, larghezzaCm: 1000, proporzione: .5, opacita: .6, calibrata: false };
    const [sospesa] = vociPerCommessaDallaVariante(bozza, doc);
    expect(rigaDaVoce(sospesa, 0)).toMatchObject({ voce: { quantita: null, importo_computo: null }, misure: [] });
  });

  it("trasferisce unità e computo al simulatore e conserva le superfici e la fonte in commessa",()=>{
    const documento=conVarianti();
    const {ipotesi}=ipotesiDaPlanimetria({documento,inizio:"2027-01",fonte:{planimetriaId,varianteId:"B",versione:7,modello:"compravendita"},importoComputo:5400});
    expect(ipotesi.planimetria).toMatchObject({confermata:false,computoImportato:true});
    expect(ipotesi.tipologie.map(u=>[u.sigla,u.prezzoMq])).toEqual([["A",0],["B",0],["C",0]]);
    const scenario={...ipotesi,inizio:"2027-01" as const,acquisto:500_000,tipologie:ipotesi.tipologie.map(t=>({...t,prezzoMq:2_500}))};
    const risultato=calcolaIpotesi(scenario);
    expect(risultato.numeri.capitaleMassimo).toBeGreaterThan(0);
    expect(risultato.piano.confronto.totali.ricavi.previsto).toBeCloseTo(744000);
    const op=operazioneDaIpotesi(scenario,{nome:"Caso residenziale",conUnita:true});
    expect(op.unita.map(u=>u.sigla)).toEqual(["A","B","C"]);
    expect(op.dati.area).toMatchObject({planimetria_id:planimetriaId,planimetria_versione:7,variante:"B"});
  });
});

describe("Verifiche urbanistiche legate agli atti",()=>{
  const giorno="2026-11-20";
  const fonte: FonteUrbanistica={id:"fonte",tipo:"norme",titolo:"Regolamento di prova",ente:"Comune di prova",url:"https://example.org/regole",stato:"efficace",
    acquisitaIl:giorno,versione:"revisione 1",efficaceDal:"2024-01-08",pubblicazione:"https://example.org/pubblicazione"};
  const tavola: FonteUrbanistica={...fonte,id:"tavola",tipo:"tavola",titolo:"Planimetria",url:"https://example.org/tavola"};
  it("separa documento, efficacia e zona, lasciando aperte le regole senza fonte",()=>{
    const fascicolo = nuovoFascicoloUrbanistico();
    fascicolo.regole=[{id:"r",metrica:"superficie",fonteId:"",riferimento:"",condizione:"Requisito da cercare",confermata:false}];
    expect(esitiInquadramento(fascicolo,giorno)).toMatchObject({documenti:"Elaborati da individuare",zonaConfermata:false});
    expect(valutaUrbanistica(conVarianti(),"B",fascicolo,giorno)[0].stato).toBe("Dato mancante");
    fascicolo.fonti=[{...fonte,stato:"adottato"}];
    expect(esitiInquadramento(fascicolo,giorno).atti).toBe("Efficacia da documentare");
  });

  it("verifica la misura di prova solo dopo avere acquisito atto e tavola",()=>{
    const fascicolo = {...nuovoFascicoloUrbanistico(),posizione:{lat:45.46,lng:9.19,confermata:true},fonti:[fonte,tavola],zona:"Zona di prova",fonteZona:"tavola",riferimentoZona:"Tavola 1"};
    fascicolo.regole=[{id:"r",metrica:"superficie",fonteId:"fonte",riferimento:"Art. di prova",condizione:"90 m² per nuova unità",soglia:90,confermata:true}];
    expect(valutaUrbanistica(conVarianti(),"B",fascicolo,giorno)[0].stato).toBe("Verificato sulla fonte");
    const conTerrazzo = conVarianti();
    const variante = conTerrazzo.livelli[0].proposte.find(p => p.id === "B")!;
    variante.locali.push({
      id:"terrazzo", nome:"Terrazzo", destinazione:"terrazzo", altezza:280, aperto:true, origine:"rilevata",
      contorno:[{x:4000,y:0},{x:5000,y:0},{x:5000,y:1000},{x:4000,y:1000}],
    });
    expect(valutaUrbanistica(conTerrazzo,"B",fascicolo,giorno)[0].stato).toBe("Verificato sulla fonte");
    variante.locali.at(-1)!.unita = "C";
    fascicolo.regole[0].soglia=100;
    expect(valutaUrbanistica(conTerrazzo,"B",fascicolo,giorno)[0].stato).toBe("Criticità rilevata");
    fascicolo.attiDiscordanti=true;
    expect(valutaUrbanistica(conVarianti(),"B",fascicolo,giorno)[0].stato).toBe("Da verificare dal tecnico");
  });

  it("accetta soltanto passaggi presenti nell’estratto fornito all’AI",()=>{
    const estratto="La superficie netta è di almeno 45 m² per unità.";
    expect(leggiRispostaUrbanistica({requisiti:[
      {metrica:"superficie",estratto,condizione:"Per unità",soglia:45},
      {metrica:"altezza",estratto:"Altezza minima 2,70 metri.",condizione:"Per piano",soglia:2.7},
    ]},estratto)).toEqual([{metrica:"superficie",estratto,condizione:"Per unità",soglia:45}]);
  });
});
