import { messaggioParetiBloccate, paretiBloccateToccate } from "../../../shared/planimetrie/vincoli.ts";
import { areaPoligono } from "../../../shared/planimetrie/geometria.ts";
import { PAVIMENTI_STANZA } from "../../../shared/planimetrie/finiture.ts";
import { ambitiDi, origineMisura, scalaModelloDaVerificare, type Locale, type Planimetria, type Proposta, type Punto, type StatoPianta } from "../../../shared/planimetrie/modello.ts";
import { controllaDisposizioneStato } from "../../../shared/planimetrie/controlloDisposizione.ts";
import { statoPerAmbito } from "../../../shared/render-planimetria/vincoli.ts";
import { descrizionePavimento } from "../../../shared/planimetrie/materialiProgetto.ts";
import {
  AMBIENTE_PRINCIPALE_CHAT, MASSIMO_AMBIENTI_CHAT, leggiRispostaChatProgetto, type ContestoAmbienteChat,
  type ContestoChatProgetto, type ModificaAmbiente, type RispostaChatProgetto,
} from "../../../shared/planimetrie/chatProgetto.ts";
import { prossimaProposta } from "@/components/planimetrie/editor/adattatore";
import { alternativeFrazionamento, frazionaContorno, inserisciFrazionamento } from "./frazionamento";
import { controllaAccessiLocali, controllaAccessiPiano, type EsitoAccesso } from "./accessiPlanimetria";
import { analizzaProgetto, type CorrezioneSegnalazioneProgetto, type SegnalazioneProgetto } from "./analisiProgetto";

export interface RiferimentoAmbienteChat { livelloId: string; localeId: string }
export interface AmbitoChatProgetto extends RiferimentoAmbienteChat { ambito: string; altri?: RiferimentoAmbienteChat[] }
export interface CambioVisibile { etichetta: string; prima: string; dopo: string; ambiente?: string }
export interface CorrezioneSullaTavola extends CorrezioneSegnalazioneProgetto {
  tratto: { da: Punto; a: Punto };
  prima: string;
  dopo: string;
}
export interface PianoAnteprimaChat {
  livelloId: string;
  nome: string;
  evidenzaLocali: string[];
  evidenzaMuri: string[];
  accessi: EsitoAccesso[];
  correzioni?: CorrezioneSullaTavola[];
}
export interface AnteprimaChatProgetto {
  documento: Planimetria;
  ambito: string;
  livelloId: string;
  localeId: string;
  evidenzaLocali: string[];
  evidenzaMuri: string[];
  modifiche: CambioVisibile[];
  piani: PianoAnteprimaChat[];
  comandi: ModificaAmbiente[];
  nomeVariante: string;
}

const mq = (n: number) => `${n.toLocaleString("it-IT",{ maximumFractionDigits:2 })} m²`;
const arrotonda = (n: number) => Math.round(n * 100) / 100;
const titoloDestinazione = (s: string) => s.charAt(0).toUpperCase()+s.slice(1).replaceAll("_"," ");
export const idAmbienteChat = ({livelloId,localeId}:RiferimentoAmbienteChat) => `${livelloId}/${localeId}`;

function pavimentoAttuale(documento: Planimetria, ambito: string, locale: Locale) {
  const comune=documento.materialiProgetto?.[ambito]?.pavimento;
  return comune && !locale.finiture?.pavimentoSpecifico ? descrizionePavimento(comune) : locale.finiture?.pavimento;
}

function leggiSelezione(documento: Planimetria, selezione: AmbitoChatProgetto) {
  const piano = documento.livelli.find(l => l.id === selezione.livelloId);
  if (!piano) return null;
  const stato = statoPerAmbito(documento, piano.id, selezione.ambito) ?? piano.fatto;
  const locale = stato.locali.find(l => l.id === selezione.localeId);
  return locale ? {piano, stato, locale} : null;
}

function leggiContestoDellaStanza(documento:Planimetria, selezione: AmbitoChatProgetto, id: string) {
  const scelto = leggiSelezione(documento,selezione);
  if (!scelto) return null;
  const {piano,stato,locale} = scelto;
  const superficie = areaPoligono(locale.contorno)/10000;
  if (!(superficie > 0)) return null;
  const proposte = [alternativeFrazionamento(stato,locale,"x",[50]), alternativeFrazionamento(stato,locale,"x",[33.33,66.67])];
  const alternative = proposte.flatMap(t => [...t.filter(a=>a.asse==="x").slice(0,3), ...t.filter(a=>a.asse==="y").slice(0,3)]);
  const pavimento = pavimentoAttuale(documento,selezione.ambito,locale);
  const contesto: ContestoAmbienteChat = {
    piano:piano.nome.slice(0,120),
    ambiente: {
      nome:locale.nome.slice(0,160), destinazione:locale.destinazione, superficieMq:Math.max(.01,arrotonda(superficie)),
      origineSuperficie:scalaModelloDaVerificare(piano) ? "stimata" : origineMisura(locale,"contorno"),
      altezzaCm:locale.altezza, origineAltezza:origineMisura(locale,"altezza"),
      ...(locale.superficieDichiarataMq ? {superficieTavolaMq:locale.superficieDichiarataMq} : {}),
      ...(locale.unita ? {unita:locale.unita} : {}),
      ...(pavimento ? {pavimento:pavimento.slice(0,220)} : {}),
    },
    alternative:alternative.map((a,i)=>({...a,id:String(i+1)})),
  };
  return {id,contesto,...scelto};
}

function preparaContesto(documento: Planimetria, selezione: AmbitoChatProgetto) {
  const principale=leggiContestoDellaStanza(documento,selezione,AMBIENTE_PRINCIPALE_CHAT);
  if (!principale) return null;
  const visti=new Set([idAmbienteChat(selezione)]);
  const altri=(selezione.altri ?? []).slice(0,MASSIMO_AMBIENTI_CHAT-1).flatMap(r=>{
    const chiave=idAmbienteChat(r);
    if (visti.has(chiave)) return [];
    visti.add(chiave);
    const dato=leggiContestoDellaStanza(documento,{...r,ambito:selezione.ambito},chiave);
    return dato ? [dato] : [];
  });
  const contesto: ContestoChatProgetto = {
    ...principale.contesto,
    stato:(ambitiDi(documento).find(a=>a.chiave===selezione.ambito)?.nome || "Stato di fatto").slice(0,120),
    ...(altri.length ? {altriAmbienti:altri.map(a=>({...a.contesto,id:a.id}))} : {}),
  };
  return {principale,altri,contesto};
}

export function contestoChatProgetto(documento: Planimetria, selezione: AmbitoChatProgetto): ContestoChatProgetto | null {
  return preparaContesto(documento,selezione)?.contesto ?? null;
}

function modificaStanza(documento:Planimetria, ambito:string, locale:Locale, contesto:ContestoAmbienteChat, base:Proposta,
  comandi:ModificaAmbiente[], richiesta:string, motivazione:string) {
  const modifiche: CambioVisibile[] = [];
  let aggiornato: Locale = locale;
  for (const m of comandi) {
    if (m.tipo==="rinomina" && m.valore!==locale.nome) {
      modifiche.push({etichetta:"Nome",prima:locale.nome,dopo:m.valore});
      aggiornato = {...aggiornato,nome:m.valore};
    } else if (m.tipo==="destinazione" && m.valore!==locale.destinazione) {
      modifiche.push({etichetta:"Destinazione",prima:titoloDestinazione(locale.destinazione),dopo:titoloDestinazione(m.valore)});
      aggiornato = {...aggiornato,destinazione:m.valore};
    } else if (m.tipo==="pavimento") {
      const finitura=PAVIMENTI_STANZA.find(p=>p.id===m.valore)!;
      const pavimento=pavimentoAttuale(documento,ambito,locale);
      if ([finitura.descrizione,finitura.id,finitura.nome].includes(pavimento ?? "")) continue;
      const prima=PAVIMENTI_STANZA.find(p=>p.descrizione===pavimento)?.nome ?? pavimento;
      modifiche.push({etichetta:"Pavimento",prima:prima ?? "Da definire",dopo:finitura.nome});
      aggiornato = {...aggiornato,finiture:{...aggiornato.finiture,pavimento:finitura.descrizione,pavimentoSpecifico:true}};
    } else if (m.tipo==="unita" && m.valore!==locale.unita) {
      modifiche.push({etichetta:"Unità",prima:locale.unita ?? "Da assegnare",dopo:m.valore});
      aggiornato = {...aggiornato,unita:m.valore};
    }
  }

  let proposta: Proposta = {...base,locali:base.locali.map(l=>l.id===locale.id ? aggiornato : l)};
  let evidenzaLocali = [locale.id];
  let evidenzaMuri: string[] = [];
  const taglio=comandi.find(m=>m.tipo==="tramezzo");
  if (taglio) {
    const scelta=contesto.alternative.find(a=>a.id===taglio.valore);
    if (!scelta) return null;
    const divisione=frazionaContorno(proposta,aggiornato,scelta.asse,scelta.percentuali);
    if (!divisione.ok) return null;
    proposta=inserisciFrazionamento(proposta,aggiornato,divisione,divisione.parti.map((_,i)=>({
      nome:`${aggiornato.nome.slice(0,145)} · ${i+1}`, ...(aggiornato.unita ? {unita:aggiornato.unita} : {}),
    })),{richiesta,motivazione});
    const traccia=proposta.frazionamenti?.at(-1);
    evidenzaLocali=traccia?.parti ?? [];
    evidenzaMuri=traccia?.pareti ?? [];
    modifiche.push({etichetta:"Suddivisione",prima:`Un ambiente · ${mq(contesto.ambiente.superficieMq)}`,dopo:scelta.superfici.map(mq).join(" + ")});
  }
  return {proposta,evidenzaLocali,evidenzaMuri,modifiche};
}

/**
 * Gli accessi delle stanze nuove, più un controllo che prima mancava: se il tramezzo
 * taglia fuori una parte della casa (per esempio separa la stanza con l'ingresso dal
 * resto) le parti risultano «da verificare» e si dice che serve una porta nel tramezzo.
 * Il 23/11/2026 un soggiorno diviso senza porta risultava «Collegamento disegnato».
 */
export function accessiDopoLaDivisione(prima: StatoPianta, dopo: StatoPianta, parti: readonly string[]): EsitoAccesso[] {
  const esiti = controllaAccessiLocali(dopo, parti);
  if (!parti.length) return esiti;
  const giaIsolate = new Set(controllaDisposizioneStato(prima).filter(p => p.codice !== "finestra_interna").map(p => p.localeId));
  const nuove = controllaDisposizioneStato(dopo).filter(p => ["stanza_isolata", "porta_su_esterno", "senza_ingresso"].includes(p.codice) && !giaIsolate.has(p.localeId));
  if (!nuove.length) return esiti;
  return esiti.map(e => e.esito === "assente" ? e : { ...e, esito: "da_verificare" as const,
    dettaglio: "Il tramezzo chiude un passaggio: una parte della casa non comunica più con l'ingresso. Aggiungi una porta nel tramezzo dall'editor." });
}

function documentoConVariante(documento: Planimetria, origine: string, id: string, nome: string, modificati: ReadonlyMap<string, Proposta>): Planimetria {
  const materiali = documento.materialiProgetto?.[origine];
  return {
    ...documento,
    ...(materiali ? { materialiProgetto: { ...documento.materialiProgetto, [`progetto:${id}`]: materiali } } : {}),
    livelli: documento.livelli.map(livello => {
      const base = modificati.get(livello.id) ?? livello.proposte.find(p => origine === `progetto:${p.id}`);
      return base ? { ...livello, proposte: [...livello.proposte, { ...base, id, nome }] } : livello;
    }),
  };
}

const chiaveSegnalazione = (e: SegnalazioneProgetto) =>
  JSON.stringify([e.area, e.titolo, e.posizione?.livelloId ?? e.piano]);
const esitoBloccante = (e: SegnalazioneProgetto) => e.priorita === "problema" || (e.area === "Struttura" && e.priorita === "tecnico");
const chiaveEsitoBloccante = (e: SegnalazioneProgetto) => JSON.stringify([chiaveSegnalazione(e), e.descrizione]);

/** Prepara una variante dai soli ripristini individuati e controllati sul modello. */
export function anteprimaCorrezioniProgetto(documento: Planimetria, selezione: AmbitoChatProgetto): AnteprimaChatProgetto | null {
  const prima = analizzaProgetto(documento, selezione.ambito);
  const bersagli = prima.flatMap(e => e.correzione && e.posizione?.tratto
    ? [{ ...e.correzione, posizione: e.posizione, tratto: e.posizione.tratto, esito: e }] : []);
  if (!bersagli.length) return null;
  const id = prossimaProposta({ proposte: documento.livelli.flatMap(l => l.proposte) });
  const nome = `Variante ${id} · Correzioni di progetto`;
  const modificati = new Map<string, Proposta>();
  const piani: PianoAnteprimaChat[] = [];
  const modifiche: CambioVisibile[] = [];
  const alloggio = documento.ambitoDocumento === "alloggio" && documento.livelli.length === 1;

  for (const livello of documento.livelli) {
    const interventi = bersagli.filter(b => b.posizione.livelloId === livello.id);
    const base = livello.proposte.find(p => selezione.ambito === `progetto:${p.id}`);
    if (!base || !interventi.length) continue;
    const daMantenere = new Set(interventi.filter(b => b.tipo === "mantieni-parete").map(b => b.id));
    const daRipristinare = new Set(interventi.filter(b => b.tipo === "ripristina-apertura").map(b => b.id));
    const aperture = new Map(base.aperture.map(a => [a.id, a]));
    for (const apertura of livello.fatto.aperture) {
      if (daRipristinare.has(apertura.id)) aperture.set(apertura.id, apertura);
    }
    const proposta: Proposta = {
      ...base,
      aperture: [...aperture.values()],
      muri: base.muri.map(m => daMantenere.has(m.id) ? { ...m, stato: "esistente" } : m),
    };
    modificati.set(livello.id, proposta);
    const correzioni = interventi.map(({ id, tipo, tratto, esito }) => {
      const porta = tipo === "ripristina-apertura";
      modifiche.push({
        etichetta: porta ? `Ingresso ${esito.titolo} · ${id}` : `Parete portante · ${id}`,
        prima: porta ? "Ingresso mancante" : "Demolizione prevista",
        dopo: porta ? "Vano originale ripristinato" : "Parete mantenuta",
        ambiente: livello.nome,
      });
      return {
        id, tipo, tratto,
        prima: porta ? `Ingresso ${esito.titolo} mancante` : "Demolizione prevista",
        dopo: porta ? `Ingresso ${esito.titolo} ripristinato` : "Parete mantenuta",
      };
    });
    const accessi = controllaAccessiPiano(proposta, alloggio, livello.quota).ingressi.map((a): EsitoAccesso => ({
      localeId: `${livello.id}/${a.sigla}`, nome: `Unità ${a.sigla}`,
      esito: a.tipo === "mancante" ? "assente" : a.ambientiScollegati.length ? "da_verificare" : "collegato",
      dettaglio: a.porta?.id,
    }));
    piani.push({ livelloId: livello.id, nome: livello.nome, evidenzaLocali: [], evidenzaMuri: [], correzioni, accessi });
  }
  if (!piani.length) return null;

  const corretto = documentoConVariante(documento, selezione.ambito, id, nome, modificati);
  const ambito = `progetto:${id}`;
  const dopo = analizzaProgetto(corretto, ambito);
  const daRisolvere = new Set(bersagli.map(b => chiaveSegnalazione(b.esito)));
  const problemiGiaPresenti = new Set(prima.filter(esitoBloccante).map(chiaveEsitoBloccante));
  if (dopo.some(e => daRisolvere.has(chiaveSegnalazione(e)) ||
    (esitoBloccante(e) && !problemiGiaPresenti.has(chiaveEsitoBloccante(e))))) return null;

  const piano = piani.find(p => p.livelloId === selezione.livelloId) ?? piani[0];
  return {
    documento: corretto, ambito, livelloId: piano.livelloId,
    localeId: piano.livelloId === selezione.livelloId ? selezione.localeId : "",
    evidenzaLocali: [], evidenzaMuri: [], modifiche, piani, comandi: [], nomeVariante: nome,
  };
}

/** Accumula le modifiche ai soli ambienti selezionati in un'unica variante, anche su più piani. */
export function anteprimaDaChatProgetto(documento: Planimetria, selezione: AmbitoChatProgetto, risposta: RispostaChatProgetto, richiesta: string, precedente?: AnteprimaChatProgetto | null): AnteprimaChatProgetto | null {
  const dati=preparaContesto(documento,selezione);
  if (!dati) return null;
  const nuova=leggiRispostaChatProgetto(risposta,dati.contesto);
  if (!nuova?.modifiche.length) return null;
  const idComando=(m:ModificaAmbiente)=>JSON.stringify([m.ambienteId ?? AMBIENTE_PRINCIPALE_CHAT,m.tipo]);
  const perTipo=new Map((precedente?.comandi ?? []).map(m=>[idComando(m),m]));
  nuova.modifiche.forEach(m=>perTipo.set(idComando(m),m));
  const comandi=[...perTipo.values()];
  const id=prossimaProposta({proposte:documento.livelli.flatMap(l=>l.proposte)});
  const nome=nuova.nomeVariante || precedente?.nomeVariante ||
    (dati.altri.length ? `Variante ${id} · Silvio` : `Variante ${id} · ${dati.principale.locale.nome}`.slice(0,100));
  const modifiche:CambioVisibile[]=[];
  const aggiornati=new Map<string,{proposta:Proposta; piano:PianoAnteprimaChat; parti:string[]; base:StatoPianta}>();
  for (const bersaglio of [dati.principale,...dati.altri]) {
    const istruzioni=comandi.filter(m=>(m.ambienteId ?? AMBIENTE_PRINCIPALE_CHAT)===bersaglio.id);
    if (!istruzioni.length) continue;
    const {piano,locale,stato,contesto}=bersaglio;
    const corrente=aggiornati.get(piano.id);
    const cambi=modificaStanza(documento,selezione.ambito,locale,contesto,corrente?.proposta ?? {...stato,id,nome},
      istruzioni,richiesta,risposta.testo);
    if (!cambi) return null;
    if (!cambi.modifiche.length) continue;
    modifiche.push(...cambi.modifiche.map(m=>dati.altri.length ? {...m,ambiente:`${locale.nome} · ${piano.nome}`} : m));
    const evidenzaLocali=[...(corrente?.piano.evidenzaLocali ?? []),...cambi.evidenzaLocali];
    const evidenzaMuri=[...(corrente?.piano.evidenzaMuri ?? []),...cambi.evidenzaMuri];
    const parti=[...(corrente?.parti ?? []),...(cambi.evidenzaMuri.length ? cambi.evidenzaLocali : [])];
    aggiornati.set(piano.id,{proposta:cambi.proposta,piano:{livelloId:piano.id,nome:piano.nome,evidenzaLocali,evidenzaMuri,accessi:[]},parti,base:corrente?.base ?? stato});
  }
  if (!modifiche.length) return null;
  // Una parete che l'utente ha bloccato non la tocca nemmeno Silvio: la proposta si ferma qui, con il motivo.
  const bloccate=[...aggiornati.values()].flatMap(v=>paretiBloccateToccate(v.base.muri,v.proposta.muri));
  if (bloccate.length) throw new Error(messaggioParetiBloccate(bloccate));
  const piani=[...aggiornati.values()].map(v=>({...v.piano,accessi:accessiDopoLaDivisione(v.base,v.proposta,v.parti)}));
  const primo=piani.find(p=>p.livelloId===selezione.livelloId) ?? piani[0];

  const ambito = `progetto:${id}`;
  return {
    documento: documentoConVariante(documento, selezione.ambito, id, nome,
      new Map([...aggiornati].map(([livelloId, valore]) => [livelloId, valore.proposta]))),
    ambito,livelloId:primo.livelloId,localeId:primo.evidenzaLocali[0],
    evidenzaLocali:primo.evidenzaLocali,evidenzaMuri:primo.evidenzaMuri,modifiche,comandi,piani,nomeVariante:nome,
  };
}
