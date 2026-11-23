import { describe, expect, it } from "vitest";
import { nuovaPlanimetria, scalaModelloDaVerificare, type Apertura, type Elemento, type Locale, type Muro } from "../../../shared/planimetrie/modello.ts";
import { areaPoligono } from "../../../shared/planimetrie/geometria.ts";
import { percorsiImpianti } from "../../../shared/planimetrie/impianti.ts";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita.ts";
import { firmaRiscontroTecnico, nuovoFascicoloUrbanistico, urbanisticaValida, valutaUrbanistica,
  type FonteUrbanistica, type RegolaUrbanistica } from "../../../shared/planimetrie/urbanistica.ts";
import { esigiVerificaDocumento } from "../../../shared/planimetrie/verificaDocumento.ts";
import { aPlanimetria, daPlanimetria, piantaVuota } from "@/components/planimetrie/editor/adattatore";
import { comandiDaChatDisegno } from "@/components/planimetrie/editor/comandiChat";
import { controllaIngressiUnita } from "@/lib/planimetrie/accessiPlanimetria";
import { simulaBilocali } from "@/lib/planimetrie/studioBilocali";
import { computoStudio, differenzeLavorazioni, percorsoMisuraSullaPianta, studioVariante } from "@/lib/planimetrie/studioImmobiliare";
import { importoLavoriDaComputo } from "@/lib/orders/generali/ipotesiDaPlanimetria";
import { esempioBilocali } from "../fixtures/studioBilocali";

const oggi = "2026-11-21";
const fonte = (id:string,tipo:FonteUrbanistica["tipo"]): FonteUrbanistica => ({
  id,tipo,titolo:"Riferimento fittizio per il test",ente:"Comune di prova",url:"https://example.com/atti",
  acquisitaIl:oggi,stato:"efficace",versione:"1",efficaceDal:oggi,pubblicazione:"https://example.com/albo",
});
const regola = (id:string,metrica:RegolaUrbanistica["metrica"],soglia:number,extra:Partial<RegolaUrbanistica> = {}): RegolaUrbanistica => ({
  id,metrica,soglia,fonteId:"norme",riferimento:"Articolo di prova",condizione:"Condizione fittizia",confermata:true,...extra,
});
const muro: Muro = { id:"m1",p1:{x:0,y:0},p2:{x:500,y:0},tipo:"esterno",stato:"esistente",altezza:300,spessore:30,origine:"rilevata" };
const varco: Apertura = { id:"a1",muroId:"m1",offset:100,larghezza:300,altezza:200,davanzale:0,tipo:"varco",manovra:"nessuna",stato:"esistente",origine:"rilevata" };

function esempio() {
  const doc = nuovaPlanimetria("Riscontri");
  const piano = doc.livelli[0];
  piano.fatto = { ...piano.fatto,muri:[{...muro}],aperture:[{...varco}] };
  const proposta = { ...structuredClone(piano.fatto),id:"A",nome:"Variante A" };
  piano.proposte = [proposta];
  const dati = { ...nuovoFascicoloUrbanistico(),posizione:{lat:45.46,lng:9.19,confermata:true},
    zona:"Zona fittizia",fonteZona:"tavola",riferimentoZona:"01",fonti:[fonte("tavola","tavola"),fonte("norme","norme")] };
  doc.urbanistica = dati;
  return {doc,piano,proposta,dati};
}

function stanza(id:string,destinazione:Locale["destinazione"],x:number,w:number,h:number): Locale {
  return {id,nome:id,destinazione,unita:"A",altezza:270,origine:"rilevata",
    contorno:[{x,y:15},{x:x+w,y:15},{x:x+w,y:15+h},{x,y:15+h}]};
}

describe("controlli e misure professionali della variante",()=>{
  it("conserva l’accesso e i punti della stessa unità dopo la demolizione di un tramezzo su una tavola importata",()=>{
    const {doc,piano,proposta} = esempio();
    const tramezzo: Muro = { ...muro, id:"tramezzo", tipo:"tramezzo", spessore:10, altezza:270, origineMisure:{altezza:"stimata"}, p2:{x:400,y:0} };
    const lato: Muro = { ...tramezzo, id:"lato-b", p1:{x:0,y:-200}, p2:{x:0,y:155} };
    const esterno: Muro = { ...lato, id:"esterno", tipo:"esterno", p1:{x:-205,y:-200}, p2:{x:-205,y:-5} };
    const rett = (id:string, unita:string, x:number, y:number, w:number, h:number): Locale => ({
      ...stanza(id,id==="camera" ? "camera" : "disimpegno",x,w,h),unita,
      contorno:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}],
    });
    const camera = rett("camera","B",5,5,390,150);
    const ingresso = rett("disimpegno","B",5,-175,390,170);
    ingresso.contorno.splice(2,0,{x:395,y:-145},{x:480,y:-145},{x:480,y:-75},{x:395,y:-75});
    const comune = rett("comune","Parti comuni",-200,-190,195,185);
    const porta = (id:string,muroId:string): Apertura => ({...varco,id,muroId,tipo:"porta",manovra:"battente",offset:60,larghezza:80});
    const simbolo = (id:string,tipo:Elemento["tipo"],x:number,y:number): Elemento => ({
      id,tipo,posizione:{x,y},rotazione:0,larghezza:10,profondita:10,origine:"stimata",stato:"nuovo",
    });
    piano.fatto = { ...piano.fatto, locali:[camera,ingresso,comune], muri:[tramezzo,lato,esterno], aperture:[porta("P1","esterno"),porta("P2","lato-b")] };
    Object.assign(proposta, structuredClone(piano.fatto), {
      distribuzioneBilocali:true, elementi:[simbolo("board","quadro_elettrico",10,-70),simbolo("presa","presa",100,80)],
    });
    const esegui = (richiesta:string, documento=doc) => {
      const pianta = daPlanimetria(documento,piano.id,"A");
      const esito = comandiDaChatDisegno(pianta,"progetto",richiesta,{documento,livelloId:piano.id,propostaId:"A"});
      expect(esito.passi).toHaveLength(1);
      return esito.passi[0];
    };
    const dopo = aPlanimetria(esegui("Demolisci il tramezzo tramezzo").pianta,doc,piano.id,"A");
    const stato = dopo.livelli[0].proposte[0];
    expect(stato.locali.find(l=>l.id==="comune")).toEqual(comune);
    const localeB = stato.locali.filter(l=>l.unita==="B");
    expect(localeB).toHaveLength(1);
    expect(areaPoligono(localeB[0].contorno)).toBeCloseTo(areaPoligono(camera.contorno)+areaPoligono(ingresso.contorno)+3900);
    expect(controllaIngressiUnita(stato).ingressi).toMatchObject([{sigla:"B",tipo:"comune",porta:{id:"P2"},ambientiScollegati:[]}]);
    const reti = percorsiImpianti(stato);
    expect(reti.puntiSenzaUnita).toEqual([]);
    expect(reti.percorsi).toContainEqual(expect.objectContaining({linea:"elettrica",daId:"board",aId:"presa"}));
    expect(esegui("Riepiloga i lavori",dopo).testo).toContain("altezza da verificare");
    expect(esegui("Controlla gli impianti",dopo).testo).toContain("Cavo unipolare");
    Object.assign(dopo.livelli[0].fatto.muri[0],{altezza:292,origineMisure:{altezza:"rilevata"}});
    expect(esegui("Riepiloga i lavori",dopo).testo).toContain("Demolizione tramezzo · 11,68 m²");

    proposta.locali[0].unita = "A";
    const unitaDistinte = aPlanimetria(esegui("Demolisci il tramezzo tramezzo").pianta,doc,piano.id,"A");
    expect(unitaDistinte.livelli[0].proposte[0].locali.map(l=>l.unita)).toEqual(["A","B","Parti comuni"]);
  });

  it("chiede uno schema elettrico consultabile e riapre il riscontro quando si sposta una presa",()=>{
    const {doc,piano,proposta,dati} = esempio();
    dati.fonti.push(fonte("schema","relazione"),{...fonte("senza-schema","relazione"),url:""});
    const presa: Elemento = {
      id:"presa",tipo:"presa",posizione:{x:60,y:40},rotazione:0,larghezza:10,profondita:10,origine:"stimata",stato:"nuovo",
    };
    proposta.elementi = [presa];
    const r = {varianteId:"A",livelloId:piano.id,criterio:"elettrico" as const,fonteId:"schema"};
    expect(firmaRiscontroTecnico(doc,{...r,fonteId:"norme"})).toBeNull();
    expect(firmaRiscontroTecnico(doc,{...r,fonteId:"senza-schema"})).toBeNull();
    const firma = firmaRiscontroTecnico(doc,r);
    expect(firma).toBeTruthy();
    presa.posizione.x += 10;
    expect(firmaRiscontroTecnico(doc,r)).not.toBe(firma);
  });

  it("esclude le pertinenze dalla superficie abitativa e permette di selezionare un garage come locale singolo",()=>{
    const {doc,proposta,dati} = esempio();
    proposta.locali = [stanza("Soggiorno","soggiorno",0,600,500),stanza("Autorimessa","garage",650,300,400)];
    dati.regole = [regola("abitabile","superficie",40),regola("interna","superficie",40,{criterioSuperficie:"interna"}),
      regola("garage","superficie",10,{criterioSuperficie:"locale",destinazione:"garage"})];
    const esiti = valutaUrbanistica(doc,"A",dati,oggi);
    expect(esiti).toMatchObject([
      {stato:"Criticità rilevata",dato:"A 30 m² · minimo 40 m²",riferimenti:[{oggettoId:"Soggiorno"}]},
      {stato:"Verificato sulla fonte",dato:"A 42 m² · minimo 40 m²"},
      {stato:"Verificato sulla fonte",dato:"Autorimessa 12 m² · minimo 10 m²"},
    ]);
  });

  it("chiede la luce netta della porta e la parte realmente apribile della finestra",()=>{
    const {doc,piano,proposta,dati} = esempio();
    proposta.locali = [stanza("Soggiorno","soggiorno",15,450,400)];
    const porta: Apertura = {...varco,id:"porta",tipo:"porta",manovra:"battente",larghezza:90,offset:45};
    const finestra: Apertura = {...varco,id:"finestra",tipo:"finestra",manovra:"battente",larghezza:150,altezza:140,offset:220,davanzale:100};
    proposta.aperture = [porta,finestra];
    dati.regole = [regola("porta","accessi",75,{aperturaId:"porta"}),regola("rapporto","finestre",10,{destinazione:"soggiorno"})];
    expect(valutaUrbanistica(doc,"A",dati,oggi).map(e=>e.stato)).toEqual(["Dato mancante","Dato mancante"]);
    porta.luceNettaCm=74;
    finestra.superficieApribileMq=1.8;
    expect(valutaUrbanistica(doc,"A",dati,oggi)).toMatchObject([
      {stato:"Criticità rilevata",dato:"Luce netta della porta 74 cm · minimo 75 cm",riferimenti:[{livelloId:piano.id,oggettoId:"porta"}]},
      {stato:"Verificato sulla fonte",dato:"Soggiorno (1,8 m² apribili su 18 m²) 10 % · minimo 10 %"},
    ]);
    finestra.sistema="fisso";
    finestra.superficieIlluminanteMq=1.8;
    dati.regole.push(regola("illuminazione","finestre",10,{destinazione:"soggiorno",criterioFinestre:"illuminante"}));
    expect(valutaUrbanistica(doc,"A",dati,oggi).slice(1)).toMatchObject([
      {stato:"Criticità rilevata",dato:"Soggiorno (0 m² apribili su 18 m²) 0 % · minimo 10 %"},
      {stato:"Verificato sulla fonte",dato:"Soggiorno (1,8 m² illuminanti su 18 m²) 10 % · minimo 10 %"},
    ]);
  });

  it("misura la chiusura sul vano originale e le demolizioni sulla parete esistente",()=>{
    const {doc,proposta} = esempio();
    proposta.aperture[0].stato="da_demolire";
    proposta.aperture[0].larghezza=250;
    const q = calcolaQuantita(doc);
    expect(q["fatto:muro:m1.superficie_mq"].valore).toBe(9);
    expect(q["progetto:A:muro:m1.superficie_mq"].valore).toBe(15);
    const [r] = studioVariante(doc,"A").righe;
    expect(r).toMatchObject({descrizione:"Chiusura varco",unita:"m²",quantita:6,chiave:"fatto:apertura:a1.superficie_mq"});
    const indirizzo = percorsoMisuraSullaPianta({planimetriaId:"prova",versione:1,varianteId:"A"},r);
    expect(indirizzo).toContain("ambito=fatto&apertura=a1&sezione=verifica");
    proposta.muri[0].stato="da_demolire";
    proposta.muri[0].altezza=270;
    expect(calcolaQuantita(doc)["progetto:A:demolizioni.muri_mq"].valore).toBe(9);
    expect(studioVariante(doc,"A").righe).toMatchObject([
      {quantita:9,criterio:"5 m × 3 m − 6 m² di vuoti detraibili"},{descrizione:"Rimozione varco",quantita:1},
      {id:"m1-macerie",unita:"a corpo",criterio:"4,5 m³ di macerie · 5 m × 3 m × 30 cm"},{id:"m1-ripristino",quantita:1.5},
    ]);
  });

  it("richiede un riscontro vettoriale dopo una modifica alla scala del fondo",()=>{
    const {doc,piano,proposta} = esempio();
    proposta.aperture[0].stato="da_demolire";
    piano.ricalco = {percorso:"rilievo.png",x:0,y:0,larghezzaCm:900,proporzione:1,opacita:.5,calibrata:true};
    piano.riscontroScala = {stato:"da_verificare"};
    expect(()=>esigiVerificaDocumento(doc,"computo")).toThrow(/scala del modello/i);
    expect(studioVariante(doc,"A").righe[0]).toMatchObject({quantita:null,quantificazioneSospesa:true});
    piano.riscontroScala = {stato:"confermata",muroId:"m1",distanzaCm:500,verificataIl:oggi};
    expect(scalaModelloDaVerificare(piano)).toBe(false);
    expect(studioVariante(doc,"A").righe[0].quantita).toBe(6);
    piano.fatto.muri[0].p2 = {x:520,y:0};
    expect(scalaModelloDaVerificare(piano)).toBe(true);
  });

  it("rileva il cortile senza cancello e riconosce il passaggio disegnato sul perimetro del lotto",()=>{
    const piano = esempioBilocali().livelli[0];
    piano.fatto.aree = [{id:"lotto",nome:"Cortile",tipo:"lotto",recinzione:true,stato:"esistente",
      contorno:[{x:700,y:-300},{x:1150,y:-300},{x:1150,y:0},{x:700,y:0}]}];
    expect(controllaIngressiUnita(piano.fatto).recinzioniChiuse).toEqual(["Cortile"]);
    expect(simulaBilocali(piano,{unita:3,profilo:"milano"})).toMatchObject({
      ok:true,alternative:[],omesse:expect.arrayContaining([expect.stringMatching(/cancello/i)]),
    });
    piano.fatto.elementi.push({id:"cancello",tipo:"cancello_pedonale",posizione:{x:920,y:-300},rotazione:0,larghezza:100,profondita:12,origine:"rilevata"});
    expect(controllaIngressiUnita(piano.fatto).recinzioniChiuse).toEqual([]);
    expect(simulaBilocali(piano,{unita:3,profilo:"milano"})).toMatchObject({
      ok:true,alternative:expect.arrayContaining([expect.objectContaining({unita:expect.arrayContaining([expect.objectContaining({ingresso:expect.objectContaining({tipo:"comune"})})])})]),
    });
  });

  it("riconosce l’ingresso attraverso una veranda a terra, rispettando il confine del lotto", () => {
    const { fatto } = esempioBilocali().livelli[0];
    for (const ambiente of fatto.locali) ambiente.unita = "A";
    fatto.locali.push({
      id: "veranda", nome: "Veranda", destinazione: "terrazzo", aperto: true, altezza: 270, origine: "da_documento",
      contorno: [{ x: 700, y: -300 }, { x: 1150, y: -300 }, { x: 1150, y: -15 }, { x: 700, y: -15 }],
    });
    expect(controllaIngressiUnita(fatto).ingressi[0]).toMatchObject({ tipo: "diretto", porta: { id: "accesso-principale" } });
    expect(controllaIngressiUnita(fatto, undefined, 300).ingressi[0].tipo).toBe("mancante");
    fatto.aree = [{ id: "lotto", nome: "Cortile", tipo: "lotto", recinzione: true, contorno: fatto.locali.at(-1)!.contorno }];
    expect(controllaIngressiUnita(fatto).recinzioniChiuse).toEqual(["Cortile"]);
    expect(controllaIngressiUnita(fatto).ingressi[0].tipo).toBe("mancante");
  });

  it("ferma la porta automatica su un portante e vincola il computo della modifica alla relazione",()=>{
    const ambienti = comandiDaChatDisegno(piantaVuota(),"fatto","Cucina 3 × 4 m\nSoggiorno 3 × 4 m a destra della cucina").passi.at(-1)!.pianta;
    const comando = "Porta tra cucina e soggiorno da 90 cm";
    const id = comandiDaChatDisegno(ambienti,"progetto",comando).passi[0].pianta.aperture[0].muroId;
    const portante = {...ambienti,muri:ambienti.muri.map(m=>m.id===id ? {...m,tipo:"portante" as const} : m)};
    const risposta = comandiDaChatDisegno(portante,"progetto",comando);
    expect(risposta.passi).toHaveLength(0);
    expect(JSON.stringify(risposta)).toMatch(/portante/i);

    const {doc,piano,proposta,dati} = esempio();
    piano.fatto.muri[0].tipo="portante";
    proposta.aperture[0].stato="da_demolire";
    const prima = studioVariante(doc,"A");
    expect(prima.righe[0]).toMatchObject({quantita:null,quantificazioneSospesa:true});
    expect(prima.paretiDaRiscontrare).toHaveLength(1);
    dati.fonti.push(fonte("relazione","relazione"));
    const base = {varianteId:"A",livelloId:piano.id,criterio:"struttura" as const,muroId:"m1",fonteId:"relazione",
      tecnico:"Tecnico di prova",riferimento:"Relazione di prova §3",data:oggi,esito:"riscontrato" as const};
    const firma = firmaRiscontroTecnico(doc,base)!;
    expect(firma).toBeTruthy();
    doc.urbanistica = {...dati,riscontriTecnici:[{...base,firma}]};
    expect(urbanisticaValida(doc.urbanistica)).toBe(true);
    const dopo = studioVariante(doc,"A");
    expect(dopo.righe[0].quantita).toBe(6);
    expect(differenzeLavorazioni(prima.righe,dopo.righe)).toMatchObject([{prima:{quantita:null},dopo:{quantita:6},delta:null}]);
    const bozza = computoStudio({planimetriaId:"demo",versione:1,varianteId:"A"},"Prova",dopo.righe);
    bozza.voci[0].prezzo="10";
    expect(importoLavoriDaComputo(bozza)).toMatchObject({importo:60,incomplete:0});
    expect(importoLavoriDaComputo(bozza,new Set(["a1"]))).toMatchObject({importo:null,daMisurare:1});
    proposta.aperture[0].offset+=10;
    expect(firmaRiscontroTecnico(doc,base)).not.toBe(firma);
    expect(studioVariante(doc,"A").righe[0].quantita).toBeNull();
  });
});
