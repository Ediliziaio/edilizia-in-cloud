import { describe, expect, it } from "vitest";
import { anteprimaDaChatProgetto, contestoChatProgetto, idAmbienteChat } from "@/lib/planimetrie/chatProgetto";
import { studioVariante } from "@/lib/planimetrie/studioImmobiliare";
import { vistaPerAnteprima } from "@/lib/planimetrie/anteprime";
import { piantaTrecento } from "@/test/fixtures/studioFrazionamento";
import { leggiContestoChatProgetto, leggiCronologiaChatProgetto, leggiRispostaChatProgetto } from "../../../shared/planimetrie/chatProgetto";
import { materialiDellaStanza, pavimentoDaCampione, statoConMateriali } from "../../../shared/planimetrie/materialiProgetto";
import { validaPlanimetria, type StatoPianta } from "../../../shared/planimetrie/modello";

function pianta(ambito = "fatto") {
  const documento = piantaTrecento("stimata");
  const piano = documento.livelli[0];
  const ambiente = piano.fatto.locali[0];
  ambiente.superficieDichiarataMq = 312.5;
  return {documento,piano,ambiente,selezione:{ambito,livelloId:piano.id,localeId:ambiente.id}};
}

describe("Silvio nel progetto della planimetria", () => {
  it("passa le due misure con la rispettiva provenienza e rifiuta comandi non supportati", () => {
    const {documento,selezione} = pianta();
    const contesto = contestoChatProgetto(documento,selezione)!;
    expect(leggiContestoChatProgetto(contesto)).toMatchObject({
      ambiente:{superficieMq:300,superficieTavolaMq:312.5,origineSuperficie:"stimata",origineAltezza:"stimata"},
    });
    expect(leggiRispostaChatProgetto({testo:"Misura",modifiche:[]},contesto)).toEqual({testo:"Misura",modifiche:[]});
    for (const m of [
      [{tipo:"tramezzo",valore:"999"}],
      [{tipo:"pavimento",valore:"materiale non disponibile"}],
      [{tipo:"demolisci",valore:"contorno-1"}],
      [{tipo:"rinomina",valore:"A"},{tipo:"rinomina",valore:"B"}],
    ]) {
      expect(leggiRispostaChatProgetto({testo:"Proposta",modifiche:m},contesto)).toBeNull();
    }
    expect(leggiCronologiaChatProgetto([{ruolo:"sistema",testo:"Scarta"},{ruolo:"utente",testo:"Cucina"}])).toEqual([{ruolo:"utente",testo:"Cucina"}]);
  });

  it("accumula le modifiche, sostituisce una finitura riaffermata e conserva la pianta di partenza", () => {
    const {documento,piano,ambiente,selezione} = pianta("progetto:A");
    piano.proposte = [{...structuredClone(piano.fatto),id:"A",nome:"Progetto A"}];
    const fattoAlto: StatoPianta = {
      ...structuredClone(piano.fatto),
      muri:piano.fatto.muri.map(m=>({...m,id:"alto-"+m.id})),
      locali:[{...structuredClone(ambiente),id:"vano-alto"}],
      elementi:[],
    };
    const altroPiano = {id:"piano-alto",nome:"Primo piano",quota:320,fatto:fattoAlto,proposte:[{...structuredClone(fattoAlto),id:"A",nome:"Progetto A"}]};
    altroPiano.proposte[0].locali[0].nome = "Camera al primo piano";
    documento.livelli.push(altroPiano);
    documento.materialiProgetto = {"progetto:A":{pavimento:pavimentoDaCampione("cemento")}};
    const prima = structuredClone(documento);
    const finitura = anteprimaDaChatProgetto(documento,selezione,{
      testo:"Parquet per questa stanza",modifiche:[{tipo:"pavimento",valore:"rovere"}],
    },"Metti il rovere");
    expect(finitura?.ambito).toBe("progetto:B");
    expect(vistaPerAnteprima(finitura!.documento,piano.id,"progetto:B").locali[0].pavimento).toBe("parquet");
    const dopo = anteprimaDaChatProgetto(documento,selezione,{
      testo:"Marmo e nuovo nome",modifiche:[{tipo:"rinomina",valore:"Sala da pranzo"},{tipo:"pavimento",valore:"marmo"}],
    },"Chiamala sala da pranzo e prova marmo",finitura)!;
    const conUso = anteprimaDaChatProgetto(documento,selezione,{
      testo:"Destinazione pranzo",modifiche:[{tipo:"destinazione",valore:"soggiorno"}],
    },"Cambia anche la destinazione",dopo)!;
    expect(conUso.modifiche.map(m=>m.etichetta)).toEqual(["Pavimento","Nome","Destinazione"]);
    expect(conUso.documento.livelli[0].proposte[1].locali[0]).toMatchObject({
      nome:"Sala da pranzo",destinazione:"soggiorno",contorno:ambiente.contorno,finiture:{pavimentoSpecifico:true},
    });
    expect(vistaPerAnteprima(conUso.documento,piano.id,"progetto:B").locali[0].pavimento).toBe("marmo");
    expect(vistaPerAnteprima(conUso.documento,altroPiano.id,"progetto:B").locali[0]).toMatchObject({nome:"Camera al primo piano",pavimento:"resina"});
    const finiture = conUso.documento.livelli[0].proposte[1].locali[0].finiture;
    expect(materialiDellaStanza(conUso.documento,"progetto:B",finiture).pavimento).toEqual(pavimentoDaCampione("marmo"));
    expect(materialiDellaStanza(conUso.documento,"progetto:B").pavimento).toEqual(pavimentoDaCampione("cemento"));
    expect(studioVariante(conUso.documento,"B").righe.some(r=>/pavimento/i.test(r.descrizione))).toBe(true);
    expect(validaPlanimetria(conUso.documento)).toMatchObject({ok:true});
    expect(documento).toEqual(prima);
  });

  it("genera un nuovo tramezzo validato e mantiene la scala e l'unità esistente", () => {
    const {documento,piano,ambiente,selezione} = pianta();
    ambiente.unita = "A";
    const opzioni = contestoChatProgetto(documento,selezione)!.alternative;
    expect(opzioni.some(o=>o.asse==="x" && o.percentuali.includes(50))).toBe(false);
    const scelta = opzioni.find(a=>a.percentuali.length===1)!;
    const risultato = anteprimaDaChatProgetto(documento,selezione,{
      testo:"Suddivisione preliminare",modifiche:[{tipo:"tramezzo",valore:scelta.id}],
    },"Dividi la stanza in due")!;
    const proposta = risultato.documento.livelli[0].proposte[0];
    expect(risultato.evidenzaMuri).toHaveLength(1);
    expect(risultato.evidenzaLocali).toHaveLength(2);
    expect(risultato.piani[0].accessi.map(a=>a.esito)).toEqual(["assente","assente"]);
    expect(proposta.locali.map(l=>l.unita)).toEqual(["A","A"]);
    expect(proposta.locali.every(l=>l.superficieDichiarataMq===undefined)).toBe(true);
    expect(proposta.elementi[0].posizione).toEqual(piano.fatto.elementi[0].posizione);
    expect(proposta.muri.slice(0,4)).toEqual(piano.fatto.muri);
    expect(validaPlanimetria(risultato.documento)).toMatchObject({ok:true});
    expect(piano.proposte).toHaveLength(0);
  });

  it("non crea versioni per una domanda, una scelta identica o una stanza scomparsa", () => {
    const {documento,piano,ambiente,selezione} = pianta();
    expect(anteprimaDaChatProgetto(documento,selezione,{testo:"Area",modifiche:[]},"Quanto misura?")).toBeNull();
    expect(anteprimaDaChatProgetto(documento,selezione,{testo:"Nome",modifiche:[{tipo:"rinomina",valore:ambiente.nome}]},"Lascia questo nome")).toBeNull();
    const comune = {pavimento:pavimentoDaCampione("rovere")};
    expect(statoConMateriali(piano.fatto,comune).locali[0].finiture?.pavimento).toMatch(/rovere/i);
    expect(contestoChatProgetto(documento,{...selezione,localeId:"assente"})).toBeNull();
  });

  it("applica lo stesso tipo di modifica su due piani mediante ID distinti", () => {
    const {documento,piano,ambiente,selezione}=pianta();
    const altroLocale={...ambiente,id:"camera-alta",nome:"Camera",destinazione:"camera" as const};
    documento.livelli.push({
      id:"alto",nome:"Piano superiore",quota:310,proposte:[],
      fatto:{...piano.fatto,muri:[],elementi:[],locali:[altroLocale]},
    });
    const altro={livelloId:"alto",localeId:altroLocale.id};
    const ambito={...selezione,altri:[altro]};
    const id=idAmbienteChat(altro);
    const contesto=contestoChatProgetto(documento,ambito)!;
    expect(leggiContestoChatProgetto(contesto)?.altriAmbienti?.[0]).toMatchObject({id,piano:"Piano superiore"});
    expect(leggiRispostaChatProgetto({testo:"Ambigua",modifiche:[{tipo:"rinomina",valore:"A"}]},contesto)).toBeNull();
    expect(leggiRispostaChatProgetto({testo:"Id estraneo",modifiche:[{ambienteId:"sconosciuto",tipo:"rinomina",valore:"A"}]},contesto)).toBeNull();
    const proposta=anteprimaDaChatProgetto(documento,ambito,{
      testo:"Due finiture",modifiche:[
        {ambienteId:"principale",tipo:"pavimento",valore:"rovere"},
        {ambienteId:id,tipo:"pavimento",valore:"marmo"},
      ],
    },"Cambia i pavimenti")!;
    expect(proposta.piani.map(p=>p.livelloId)).toEqual([piano.id,"alto"]);
    expect(proposta.documento.livelli.map(l=>l.proposte[0].id)).toEqual(["A","A"]);
    expect(proposta.modifiche.map(c=>c.dopo)).toEqual(["Parquet rovere naturale","Marmo bianco venato"]);
    expect(proposta.modifiche.every(c=>!!c.ambiente)).toBe(true);
    expect(validaPlanimetria(proposta.documento).ok).toBe(true);
    expect(documento.livelli.every(l=>!l.proposte.length)).toBe(true);
  });
});
