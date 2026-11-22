import { apertureDelLocale, areaPoligono, contornoIncrociato, interniSovrapposti } from "./geometria.ts";
import { eElementoElettrico } from "./impianti.ts";
import { DESTINAZIONI, eAmbienteInterno, origineMisura, scalaModelloDaVerificare, type Destinazione, type Livello, type Planimetria, type Punto, type StatoPianta } from "./modello.ts";

export type TipoFonteUrbanistica = "archivio" | "bollettino" | "tavola" | "norme" | "relazione";
export type StatoAtto = "da_verificare" | "adottato" | "efficace" | "superato";
export const RUOLI_TAVOLA = { rilievo: "Rilievo", titolo: "Tavola allegata al titolo edilizio", catasto: "Planimetria catastale", esodo: "Tavola d’esodo" } as const;
export type RuoloTavola = keyof typeof RUOLI_TAVOLA;
export interface InquadramentoTavola {
  livelloId: string;
  pagina: number;
  larghezzaCm: number;
  x: number;
  y: number;
  rotazione?: number;
}

export interface FonteUrbanistica {
  id: string;
  ente: string;
  titolo: string;
  tipo: TipoFonteUrbanistica;
  url?: string;
  acquisitaIl: string;
  versione?: string;
  stato: StatoAtto;
  efficaceDal?: string;
  pubblicazione?: string;
  allegato?: { percorso: string; nome: string };
  ruoloTavola?: RuoloTavola;
  inquadramento?: InquadramentoTavola;
}

export interface PosizioneImmobile { lat: number; lng: number; confermata: boolean }
export type CategoriaCartografica = "zona" | "tutela";
export interface AmbitoCartografico { codiceIstat: string; comune: string; descrizione: string; tavola: string; scheda?: string; categoria?: CategoriaCartografica }
export interface StratoCartografico {
  titolo: string;
  fonte: string;
  categoria: CategoriaCartografica;
  esito: "trovato" | "assente" | "parziale" | "indisponibile";
}
export interface RiscontroCartografico {
  data: string;
  esito: "trovato" | "discordante" | "assente" | "parziale";
  ambiti: AmbitoCartografico[];
  strati?: StratoCartografico[];
}

export type TipoInterventoUrbanistico = "frazionamento" | "cambio_uso";
export type OriginePosizioneUrbanistica = "indirizzo" | "catasto";
export const PIANI_INTERVENTO = ["interrato", "seminterrato", "terra", "superiore", "sottotetto"] as const;
export interface InterventoUrbanistico {
  tipo: TipoInterventoUrbanistico;
  unitaPreviste?: number;
  usoFrazionamento?: "invariato" | "variato";
  usoAttuale?: string;
  usoPrevisto?: string;
  piano?: typeof PIANI_INTERVENTO[number];
  opere?: "con_opere" | "senza_opere";
  volume?: "invariato" | "variato";
}
export interface ParticellaIndividuata {
  foglio: string;
  numero: string;
  sezione: string;
  fonte: string;
  data: string;
}

export const DATI_URBANISTICI = {
  superficie: "Superfici utili",
  altezza: "Altezze dei locali",
  finestre: "Finestre e rapporti aeroilluminanti",
  accessi: "Accessi e dotazioni",
  manovra: "Spazi di manovra",
  scarichi: "Percorso e fattibilità degli scarichi",
  uso: "Destinazione d’uso",
  vincoli: "Vincoli e stato legittimo",
} as const;
export type MetricaUrbanistica = keyof typeof DATI_URBANISTICI;
export const CRITERI_SUPERFICIE = {
  abitativa: "Superficie interna residenziale per unità, esclusi garage e cantine",
  interna: "Superficie interna per unità, incluse le pertinenze chiuse",
  locale: "Superficie per singolo locale",
} as const;
export type CriterioSuperficie = keyof typeof CRITERI_SUPERFICIE;
export const CRITERI_FINESTRE = { apribile: "Superficie apribile", illuminante: "Superficie illuminante" } as const;
export type CriterioFinestre = keyof typeof CRITERI_FINESTRE;
export const METODO_VERIFICA_URBANISTICA = 2;
export interface RegolaUrbanistica {
  id: string;
  metrica: MetricaUrbanistica;
  fonteId: string;
  riferimento: string;
  condizione: string;
  estratto?: string;
  soglia?: number;
  criterioSuperficie?: CriterioSuperficie;
  criterioFinestre?: CriterioFinestre;
  destinazione?: Destinazione;
  aperturaId?: string;
  confermata: boolean;
  intervento?: TipoInterventoUrbanistico;
}
export type StatoVerificaUrbanistica = "Verificato sulla fonte" | "Dato mancante" | "Da verificare dal tecnico" | "Criticità rilevata";
export interface RiferimentoVerificaUrbanistica { livelloId: string; oggettoId: string; tipo: "locale" | "apertura" }
export interface EsitoRegolaUrbanistica {
  regolaId: string; stato: StatoVerificaUrbanistica; dato: string;
  riferimenti?: RiferimentoVerificaUrbanistica[];
}
export interface ValutazioneUrbanistica {
  varianteId: string;
  intervento?: TipoInterventoUrbanistico;
  versione: number;
  metodo?: number;
  data: string;
  esiti: EsitoRegolaUrbanistica[];
  notaTecnico: string;
}
export interface PraticaImmobiliare {
  id: string;
  titolo: string;
  varianteId: string;
  versione?: number;
  stato: "bozza" | "presentata" | "integrazione" | "conclusa";
  protocollo: string;
  presentataIl?: string;
  scadenza?: string;
  responsabile: string;
  nota: string;
  unita: string[];
  fonti: string[];
}
export const RISCONTRI_TECNICI = {
  struttura: "Intervento su parete portante",
  percorso: "Percorso dalla strada e collegamenti fra piani",
  esodo: "Via d’esodo",
  manovra: "Spazi di manovra",
  elettrico: "Schema e dimensionamento elettrico",
  scarichi: "Percorso e pendenza degli scarichi",
} as const;
export type TipoRiscontroTecnico = keyof typeof RISCONTRI_TECNICI;
export interface TracciatoEsodo { nome: string; punti: Punto[] }
export interface EsodoDelPiano {
  tracciati: TracciatoEsodo[];
  prosegueAl?: string;
  uscita?: string;
  simulazione?: boolean;
}
export interface RiscontroTecnico {
  varianteId: string;
  livelloId: string;
  criterio: TipoRiscontroTecnico;
  muroId?: string;
  fonteId: string;
  riferimento: string;
  tecnico: string;
  data: string;
  esito: "riscontrato" | "criticita";
  firma: string;
  esodo?: EsodoDelPiano;
}

export interface DatiUrbanistici {
  regione: string;
  comune: string;
  codiceIstat: string;
  indirizzo: string;
  foglio: string;
  particella: string;
  sezioneCatastale?: string;
  originePosizione?: OriginePosizioneUrbanistica;
  particellaIndividuata?: ParticellaIndividuata;
  intervento?: InterventoUrbanistico;
  posizione?: PosizioneImmobile;
  fonti: FonteUrbanistica[];
  attiDiscordanti: boolean;
  cartografia?: RiscontroCartografico;
  zona: string;
  fonteZona: string;
  riferimentoZona: string;
  regole: RegolaUrbanistica[];
  valutazioni: ValutazioneUrbanistica[];
  pratiche?: PraticaImmobiliare[];
  riscontriTecnici?: RiscontroTecnico[];
}

const oggetto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const testo = (v: unknown, max = 240): v is string => typeof v === "string" && v.length <= max;
const inLista = (v: unknown, a: readonly string[]) => typeof v === "string" && a.includes(v);
const facoltativo = <T>(v: unknown, controllo: (valore: unknown) => boolean): v is T | undefined => v === undefined || controllo(v);
const lista = (v: unknown, max: number, controllo: (valore: unknown) => boolean) => Array.isArray(v) && v.length <= max && v.every(controllo);
const positivo = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0;
const istat = (v: unknown) => typeof v === "string" && /^\d{6}$/.test(v);
const giorno = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v))
  && new Date(v).toISOString().slice(0,10) === v;
const tipiFonte = ["archivio","bollettino","tavola","norme","relazione"] as const;
const coordinataEsodo = (v: unknown) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 10_000_000;
function tracciatoEsodoValido(t: unknown): boolean {
  if (!oggetto(t) || !testo(t.nome, 80) || !t.nome.trim() || !Array.isArray(t.punti) || t.punti.length < 2) return false;
  if (!lista(t.punti, 80, p => oggetto(p) && coordinataEsodo(p.x) && coordinataEsodo(p.y))) return false;
  const [primo, ...altri] = t.punti as Punto[];
  return altri.some(p => p.x !== primo.x || p.y !== primo.y);
}

export function esodoValido(v: unknown): v is EsodoDelPiano {
  return oggetto(v) && Array.isArray(v.tracciati) && v.tracciati.length > 0 && lista(v.tracciati, 16, tracciatoEsodoValido) &&
    facoltativo(v.prosegueAl, p => testo(p, 64) && !!p.trim()) &&
    facoltativo(v.uscita, s => testo(s, 200) && !!s.trim()) && !(v.prosegueAl && v.uscita) &&
    facoltativo(v.simulazione, s => typeof s === "boolean");
}
const statiAtto = ["da_verificare","adottato","efficace","superato"] as const;
const statiEsito = ["Verificato sulla fonte","Dato mancante","Da verificare dal tecnico","Criticità rilevata"] as const;
const categorieCartografiche = ["zona", "tutela"] as const;

export function urlFonteUrbanistica(url: unknown): url is string {
  if (!testo(url, 2000)) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch { return false; }
}

export function coordinateImmobile(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180;
}

export function urbanisticaValida(d: unknown): d is DatiUrbanistici {
  if (!oggetto(d)) return false;
  return testo(d.regione) && testo(d.comune) && (d.codiceIstat === "" || istat(d.codiceIstat)) && testo(d.indirizzo)
    && testo(d.foglio,40) && testo(d.particella,40) && typeof d.attiDiscordanti === "boolean"
    && facoltativo(d.sezioneCatastale,v=>testo(v,16))
    && facoltativo(d.originePosizione,v=>inLista(v,["indirizzo","catasto"]))
    && facoltativo(d.particellaIndividuata,v=>oggetto(v) && testo(v.foglio,40) && testo(v.numero,40) && testo(v.sezione,16)
      && urlFonteUrbanistica(v.fonte) && giorno(v.data))
    && facoltativo(d.intervento,v=>oggetto(v) && inLista(v.tipo,["frazionamento","cambio_uso"])
      && facoltativo(v.unitaPreviste,n=>Number.isSafeInteger(n) && Number(n)>=2 && Number(n)<=80)
      && facoltativo(v.usoFrazionamento,x=>inLista(x,["invariato","variato"]))
      && facoltativo(v.usoAttuale,x=>testo(x,120)) && facoltativo(v.usoPrevisto,x=>testo(x,120))
      && facoltativo(v.piano,x=>inLista(x,PIANI_INTERVENTO)) && facoltativo(v.opere,x=>inLista(x,["con_opere","senza_opere"]))
      && facoltativo(v.volume,x=>inLista(x,["invariato","variato"])))
    && testo(d.zona) && testo(d.fonteZona) && testo(d.riferimentoZona)
    && facoltativo(d.posizione, p => oggetto(p) && typeof p.lat === "number" && typeof p.lng === "number"
      && coordinateImmobile(p.lat,p.lng) && typeof p.confermata === "boolean")
    && lista(d.fonti,40,f => oggetto(f) && testo(f.id,80) && testo(f.ente) && testo(f.titolo)
      && inLista(f.tipo,tipiFonte) && facoltativo(f.url,urlFonteUrbanistica) && (f.url !== undefined || f.allegato !== undefined) && giorno(f.acquisitaIl)
      && inLista(f.stato,statiAtto) && facoltativo(f.versione,testo) && facoltativo(f.efficaceDal,giorno)
      && facoltativo(f.pubblicazione,urlFonteUrbanistica) && facoltativo(f.allegato,a => oggetto(a)
        && testo(a.nome) && typeof a.percorso === "string" && /^[\w-]+\/urbanistica\/[\w-]+\/[\w-]+\.pdf$/.test(a.percorso))
      && facoltativo(f.ruoloTavola,v=>f.tipo==="tavola" && inLista(v,Object.keys(RUOLI_TAVOLA)))
      && facoltativo(f.inquadramento,v=>!!f.ruoloTavola && !!f.allegato && oggetto(v) && testo(v.livelloId,64)
        && Number.isSafeInteger(v.pagina) && Number(v.pagina)>0 && Number(v.pagina)<=10000
        && positivo(v.larghezzaCm) && Number(v.larghezzaCm)<=10_000_000
        && [v.x,v.y].every(n=>typeof n==="number" && Number.isFinite(n) && Math.abs(n)<=10_000_000)
        && facoltativo(v.rotazione,n=>typeof n==="number" && Number.isFinite(n) && Math.abs(n)<=360)))
    && facoltativo(d.cartografia, c => oggetto(c) && giorno(c.data)
      && inLista(c.esito,["trovato","discordante","assente","parziale"])
      && lista(c.ambiti,40,a => oggetto(a) && istat(a.codiceIstat) && testo(a.comune) && testo(a.descrizione,500)
        && urlFonteUrbanistica(a.tavola) && facoltativo(a.scheda,urlFonteUrbanistica) && facoltativo(a.categoria,v=>inLista(v,categorieCartografiche)))
      && facoltativo(c.strati,s=>lista(s,32,v=>oggetto(v) && testo(v.titolo) && urlFonteUrbanistica(v.fonte)
        && inLista(v.categoria,categorieCartografiche) && inLista(v.esito,["trovato","assente","parziale","indisponibile"]))))
    && lista(d.regole,40,r => oggetto(r) && testo(r.id,80) && inLista(r.metrica,Object.keys(DATI_URBANISTICI)) && testo(r.fonteId,80)
      && testo(r.riferimento) && testo(r.condizione,1000) && facoltativo(r.estratto,v=>testo(v,500)) && facoltativo(r.soglia,positivo) && typeof r.confermata === "boolean"
      && facoltativo(r.criterioSuperficie,v=>inLista(v,Object.keys(CRITERI_SUPERFICIE))) && facoltativo(r.destinazione,v=>inLista(v,DESTINAZIONI))
      && facoltativo(r.criterioFinestre,v=>inLista(v,Object.keys(CRITERI_FINESTRE)))
      && facoltativo(r.aperturaId,v=>testo(v,64))
      && facoltativo(r.intervento,v=>inLista(v,["frazionamento","cambio_uso"])))
    && lista(d.valutazioni,60,v => oggetto(v) && testo(v.varianteId,80) && Number.isSafeInteger(v.versione) && Number(v.versione) > 0
      && facoltativo(v.metodo,m=>m===METODO_VERIFICA_URBANISTICA)
      && facoltativo(v.intervento,x=>inLista(x,["frazionamento","cambio_uso"]))
      && giorno(v.data) && testo(v.notaTecnico,2000) && lista(v.esiti,40,e => oggetto(e) && testo(e.regolaId,80)
        && inLista(e.stato,statiEsito) && testo(e.dato,4000)
        && facoltativo(e.riferimenti,a=>lista(a,20,r=>oggetto(r) && testo(r.livelloId,64) && testo(r.oggettoId,64) && inLista(r.tipo,["locale","apertura"])))))
    && facoltativo(d.riscontriTecnici,p=>lista(p,200,r=>oggetto(r) && testo(r.varianteId,80) && testo(r.livelloId,64)
      && inLista(r.criterio,Object.keys(RISCONTRI_TECNICI)) && (r.criterio==="struttura" ? testo(r.muroId,64) : r.muroId===undefined)
      && (r.criterio==="esodo" ? !!r.fonteId && esodoValido(r.esodo) : r.esodo===undefined)
      && (r.criterio!=="elettrico" || !!r.fonteId)
      && testo(r.fonteId,80) && testo(r.riferimento,1500) && !!r.riferimento.trim() && testo(r.tecnico,160) && !!r.tecnico.trim()
      && giorno(r.data) && inLista(r.esito,["riscontrato","criticita"]) && testo(r.firma,64) && /^v1:\d+:[a-f0-9]+$/.test(r.firma)))
    && facoltativo(d.pratiche,p=>lista(p,30,r=>oggetto(r) && testo(r.id,80) && testo(r.titolo) && testo(r.varianteId,80)
      && facoltativo(r.versione,v=>Number.isSafeInteger(v) && Number(v)>0)
      && inLista(r.stato,["bozza","presentata","integrazione","conclusa"]) && testo(r.protocollo,100) && testo(r.responsabile)
      && testo(r.nota,2000) && facoltativo(r.presentataIl,giorno) && facoltativo(r.scadenza,giorno)
      && lista(r.unita,80,u=>testo(u,40)) && lista(r.fonti,40,f=>testo(f,80))));
}

export const nuovoFascicoloUrbanistico = (): DatiUrbanistici => ({
  regione: "Lombardia", comune: "", codiceIstat: "", indirizzo: "", foglio: "", particella: "",
  fonti: [], attiDiscordanti: false, zona: "", fonteZona: "", riferimentoZona: "", regole: [], valutazioni: [],
});

export function valutazionePerVariante(d: DatiUrbanistici | undefined, varianteId: string) {
  if (!d) return undefined;
  const tipo = d.intervento?.tipo;
  return d.valutazioni.find(v => v.varianteId === varianteId && v.intervento === tipo)
    ?? (tipo === "frazionamento" ? d.valutazioni.find(v => v.varianteId === varianteId && !v.intervento) : undefined);
}

export function verificaUrbanisticaAperta(d: DatiUrbanistici | undefined, varianteId: string, versione: number) {
  const v = valutazionePerVariante(d,varianteId);
  return v?.versione !== versione || v.metodo !== METODO_VERIFICA_URBANISTICA || !v.esiti.length
    || v.esiti.some(e=>e.stato !== "Verificato sulla fonte");
}

function geometriaParete(stato: StatoPianta, muroId: string) {
  const m = stato.muri.find(m=>m.id===muroId);
  return m ? [
    [m.id,m.tipo,m.p1.x,m.p1.y,m.p2.x,m.p2.y,m.spessore,m.altezza,m.stato],
    stato.aperture.filter(a=>a.muroId===muroId).map(a=>[a.id,a.offset,a.larghezza,a.altezza,a.davanzale,a.tipo,a.stato]),
  ] : null;
}

export function muriPortantiModificati(piano: Livello, varianteId: string) {
  const progetto = piano.proposte.find(p=>p.id===varianteId);
  if (!progetto) return [];
  return progetto.muri.filter(m=>(m.tipo==="portante" || piano.fatto.muri.some(prima=>prima.id===m.id && prima.tipo==="portante"))
    && JSON.stringify(geometriaParete(piano.fatto,m.id))!==JSON.stringify(geometriaParete(progetto,m.id)));
}

type DatiFirmaRiscontro = Pick<RiscontroTecnico,"varianteId"|"livelloId"|"criterio"|"muroId"|"fonteId"|"esodo">;

/** Riapre il riscontro quando cambia il disegno rilevante o il documento su cui si basa. */
export function firmaRiscontroTecnico(doc: Planimetria, riscontro: DatiFirmaRiscontro, dati = doc.urbanistica): string | null {
  const { varianteId, livelloId, criterio, muroId, fonteId, esodo } = riscontro;
  const piano = doc.livelli.find(l=>l.id===livelloId);
  const progetto = piano?.proposte.find(p=>p.id===varianteId);
  const fonte = dati?.fonti.find(f=>f.id===fonteId);
  if (!piano || (fonteId && !fonte)) return null;
  if (!progetto && (criterio!=="esodo" || !doc.livelli.some(l=>l.proposte.some(p=>p.id===varianteId)))) return null;
  let geometria: unknown;
  if (criterio==="struttura") {
    if (!progetto || !muroId || fonte?.tipo!=="relazione" || !muriPortantiModificati(piano,varianteId).some(m=>m.id===muroId)) return null;
    geometria = [piano.quota,geometriaParete(piano.fatto,muroId),geometriaParete(progetto,muroId)];
  } else if (criterio==="esodo") {
    if (!esodoValido(esodo) || fonte?.tipo!=="tavola" || (!fonte.allegato && !fonte.url) ||
      (fonte.inquadramento && fonte.inquadramento.livelloId!==livelloId) ||
      (esodo.prosegueAl && (esodo.prosegueAl===livelloId || !doc.livelli.some(l=>l.id===esodo.prosegueAl)))) return null;
    geometria = [esodo, fonte.inquadramento, doc.livelli.map(l => {
      const s = l.proposte.find(p=>p.id===varianteId) ?? l.fatto;
      return [l.id, l.quota, l.riscontroScala, scalaModelloDaVerificare(l),
        s.muri.map(m=>[m.id,m.p1,m.p2,m.tipo,m.spessore,m.stato]),
        s.locali.map(a=>[a.id,a.contorno,a.destinazione,a.unita,a.aperto]),
        s.aperture.filter(a=>a.tipo!=="finestra").map(a=>[a.id,a.muroId,a.tipo,a.offset,a.larghezza,a.altezza,a.davanzale,a.luceNettaCm,a.manovra,a.sistema,a.verso,a.stato]),
        s.elementi.filter(e=>e.larghezza>=35 && e.profondita>=25).map(e=>[e.id,e.tipo,e.posizione,e.larghezza,e.profondita,e.altezza,e.rotazione,e.stato]),
        s.aree];
    })];
  } else if (criterio === "elettrico") {
    if (!progetto || fonte?.tipo !== "relazione" || (!fonte.allegato && !fonte.url)) return null;
    const tracciati = progetto.tracciatiImpianti?.filter(t=>t.linea==="elettrica");
    geometria = [piano.quota, piano.riscontroScala, scalaModelloDaVerificare(piano),
      progetto.muri.map(m=>[m.id,m.p1,m.p2,m.spessore,m.altezza,m.tipo,m.stato]),
      progetto.locali.map(l=>[l.id,l.contorno,l.unita,l.destinazione,l.altezza]),
      progetto.aperture.map(a=>[a.id,a.muroId,a.offset,a.larghezza,a.altezza,a.davanzale,a.stato]),
      progetto.elementi.filter(e=>eElementoElettrico(e.tipo)).map(e=>[e.id,e.tipo,e.posizione,e.altezza,e.rotazione,e.stato]),
      ...(tracciati?.length ? [tracciati] : [])];
  } else {
    geometria = (criterio==="percorso" ? doc.livelli : [piano]).map(l=>{
      const s = l.proposte.find(p=>p.id===varianteId) ?? l.fatto;
      const tracciati = criterio==="scarichi" ? s.tracciatiImpianti?.filter(t=>t.linea==="scarico") : undefined;
      return [l.id,l.quota,scalaModelloDaVerificare(l),s.muri.map(m=>[m.id,m.p1,m.p2,m.altezza,m.spessore,m.stato]),
        s.locali.map(a=>[a.id,a.contorno,a.destinazione,a.unita]),s.aperture,
        s.elementi.map(e=>[e.id,e.tipo,e.posizione,e.larghezza,e.profondita,e.rotazione,e.stato]),s.aree,
        ...(tracciati?.length ? [tracciati] : [])];
    });
  }
  const s = JSON.stringify([varianteId,livelloId,criterio,geometria,fonte && [fonte.titolo,fonte.ente,fonte.versione,fonte.url,fonte.allegato?.percorso]]);
  let h = 2166136261;
  for (let i=0;i<s.length;i++) h = Math.imul(h ^ s.charCodeAt(i),16777619);
  return `v1:${s.length}:${(h >>> 0).toString(16)}`;
}

export const STATI_ESODO = {
  mancante: "Traccia da registrare",
  da_rinnovare: "Verifica riaperta",
  simulazione: "Collaudo registrato",
  riscontrato: "Riscontro registrato",
  criticita: "Criticità registrata",
} as const;

export function esodoDellaVariante(doc: Planimetria, varianteId: string, dati = doc.urbanistica) {
  if (!doc.livelli.some(l=>l.proposte.some(p=>p.id===varianteId))) return [];
  return [...doc.livelli].sort((a,b)=>b.quota-a.quota).map(livello=>{
    const riscontro = dati?.riscontriTecnici?.find(r=>r.criterio==="esodo" && r.varianteId===varianteId && r.livelloId===livello.id);
    const stato: keyof typeof STATI_ESODO = !riscontro ? "mancante" : firmaRiscontroTecnico(doc,riscontro,dati)!==riscontro.firma
      ? "da_rinnovare" : riscontro.esito==="criticita" ? "criticita" : riscontro.esodo?.simulazione ? "simulazione" : "riscontrato";
    return {livello, riscontro, stato, fonte:dati?.fonti.find(f=>f.id===riscontro?.fonteId)};
  });
}

export function fonteEfficace(f: FonteUrbanistica | undefined, data: string): boolean {
  return !!(f?.stato === "efficace" && f.versione?.trim() && f.efficaceDal && f.efficaceDal <= data && f.pubblicazione);
}

export function esitiInquadramento(d: DatiUrbanistici, data: string) {
  const elaborati = d.fonti.some(f => f.tipo === "norme" || f.tipo === "tavola");
  const efficace = d.fonti.some(f => (f.tipo === "norme" || f.tipo === "tavola") && fonteEfficace(f,data));
  const tavola = d.fonti.find(f => f.id === d.fonteZona && f.tipo === "tavola" && !f.ruoloTavola);
  return {
    documenti: elaborati ? "Elaborati collegati" : "Elaborati da individuare",
    atti: d.attiDiscordanti ? "Atti discordanti" : efficace ? "Efficacia documentata per gli atti registrati" : "Efficacia da documentare",
    zona: !d.posizione?.confermata ? "Posizione da confermare" : d.zona.trim() && tavola && d.riferimentoZona.trim()
      ? d.zona : d.cartografia?.esito === "discordante" ? "Ambiti intersecati da confrontare" : "Zona da verificare sulla tavola comunale",
    zonaConfermata: !!(d.posizione?.confermata && d.zona.trim() && d.riferimentoZona.trim() && tavola),
  };
}

const mq = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 2 });
const pertinenza = (destinazione: Destinazione) => destinazione === "garage" || destinazione === "cantina";

/** Verifica solo soglie annotate e confermate. L'esito resta riferito al criterio indicato sulla fonte. */
export function valutaUrbanistica(doc: Planimetria, varianteId: string, d: DatiUrbanistici, data: string): EsitoRegolaUrbanistica[] {
  const piani = doc.livelli.map(piano=>({ piano, stato:piano.proposte.find(p=>p.id===varianteId) ?? piano.fatto }));
  const locali = piani.flatMap(({piano,stato}) => stato.locali.filter(eAmbienteInterno)
    .map(l=>({l,stato,piano,rif:{livelloId:piano.id,oggettoId:l.id,tipo:"locale" as const}})));
  const privati = locali.filter(({l}) => !l.unita?.trim() || !/comun|condominial|androne/i.test(l.unita));
  return d.regole.filter(r => !r.intervento || r.intervento === d.intervento?.tipo).map(r => {
    const esito = (stato: StatoVerificaUrbanistica, dato: string, riferimenti: RiferimentoVerificaUrbanistica[] = []): EsitoRegolaUrbanistica =>
      ({regolaId:r.id,stato,dato:dato.slice(0,4000),...(riferimenti.length ? {riferimenti:riferimenti.slice(0,20)} : {})});
    const fonte = d.fonti.find(f => f.id === r.fonteId && f.tipo === "norme");
    if (!fonte || !r.riferimento.trim() || !r.condizione.trim()) return esito("Dato mancante","Serve la norma con articolo o pagina e condizione di applicabilità.");
    if (!r.confermata || !fonteEfficace(fonte,data) || d.attiDiscordanti || !esitiInquadramento(d,data).zonaConfermata
      || !fonteEfficace(d.fonti.find(f=>f.id===d.fonteZona),data)) {
      return esito("Da verificare dal tecnico","Consulta efficacia, inquadramento e condizione sulla fonte collegata.");
    }
    const areaInterna = r.metrica === "superficie" && r.criterioSuperficie === "interna";
    const verificaLocale = r.metrica !== "superficie" || r.criterioSuperficie === "locale";
    const bersagli = privati.filter(({l}) => (areaInterna || (verificaLocale && r.destinazione) || !pertinenza(l.destinazione))
      && (!verificaLocale || !r.destinazione || l.destinazione === r.destinazione));
    const misura = (valori: { nome: string; valore: number; riferimenti: RiferimentoVerificaUrbanistica[] }[], unita: string) => {
      if (!r.soglia || !valori.length) return esito("Dato mancante","Indica la soglia e gli elementi a cui si applica.");
      const carenti = valori.filter(v=>v.valore < r.soglia!);
      return esito(carenti.length ? "Criticità rilevata" : "Verificato sulla fonte",
        `${valori.map(v=>`${v.nome} ${mq(v.valore)} ${unita}`).join(" · ")} · minimo ${mq(r.soglia)} ${unita}`,
        (carenti.length ? carenti : valori).flatMap(v=>v.riferimenti));
    };
    if (r.metrica === "superficie") {
      if (verificaLocale && !r.destinazione) return esito("Dato mancante","Indica la destinazione dei locali da verificare.");
      const daCorreggere = bersagli.filter(({l,stato})=>contornoIncrociato(l.contorno) || stato.locali.some(altro=>
        altro.id!==l.id && eAmbienteInterno(altro) && interniSovrapposti(l.contorno,altro.contorno)));
      if (daCorreggere.length) return esito("Dato mancante","Correggi i perimetri sovrapposti o incrociati prima di verificare le superfici.",daCorreggere.map(b=>b.rif));
      const incerti = bersagli.filter(({l,piano})=> (!verificaLocale && !l.unita?.trim()) || scalaModelloDaVerificare(piano) || origineMisura(l,"contorno") === "stimata");
      if (incerti.length) return esito("Dato mancante","Riscontra le superfici e, per il totale per unità, assegna i locali.",incerti.map(b=>b.rif));
      if (verificaLocale) return misura(bersagli.map(({l,rif})=>({nome:l.nome,valore:areaPoligono(l.contorno)/10000,riferimenti:[rif]})), "m²");
      const superfici = new Map<string,{ nome: string; valore: number; riferimenti: RiferimentoVerificaUrbanistica[] }>();
      for (const {l,rif} of bersagli) {
        const sigla = l.unita!.trim();
        const misuraUnita = superfici.get(sigla) ?? {nome:sigla,valore:0,riferimenti:[]};
        misuraUnita.valore += areaPoligono(l.contorno)/10000;
        misuraUnita.riferimenti.push(rif);
        superfici.set(sigla,misuraUnita);
      }
      return misura([...superfici.values()], "m²");
    }
    if (r.metrica === "altezza") {
      const daRilevare = bersagli.filter(({l,piano})=>origineMisura(l,"altezza") === "stimata" || (piano.tetto && piano.tetto.tipo !== "piano"));
      if (daRilevare.length) return esito("Dato mancante","Riscontra le altezze, con un controllo specifico dei locali sotto falda.",daRilevare.map(b=>b.rif));
      return misura(bersagli.map(({l,rif})=>({nome:l.nome,valore:l.altezza/100,riferimenti:[rif]})), "m");
    }
    if (r.metrica === "accessi" && r.soglia && r.aperturaId) {
      for (const {piano,stato} of piani) {
        const porta = stato.aperture.find(a=>a.id===r.aperturaId && a.tipo==="porta" && a.stato!=="da_demolire");
        if (!porta || !stato.muri.some(m=>m.id===porta.muroId && m.stato!=="da_demolire")) continue;
        const rif = {livelloId:piano.id,oggettoId:porta.id,tipo:"apertura" as const};
        if (porta.luceNettaCm === undefined) return esito("Dato mancante","Inserisci la luce netta misurata nelle proprietà della porta.",[rif]);
        return misura([{nome:"Luce netta della porta",valore:porta.luceNettaCm,riferimenti:[rif]}],"cm");
      }
      return esito("Dato mancante","Seleziona una porta presente nella variante.");
    }
    if (r.metrica === "finestre" && r.soglia && r.destinazione) {
      const criterio = r.criterioFinestre ?? "apribile";
      const campo = criterio==="illuminante" ? "superficieIlluminanteMq" : "superficieApribileMq";
      const rapporti = [];
      for (const {l,piano,stato,rif} of bersagli) {
        const finestre = apertureDelLocale(l,stato).filter(a=>(a.tipo==="finestra" || a.tipo==="portafinestra")
          && stato.muri.some(m=>m.id===a.muroId && m.tipo==="esterno") && (criterio==="illuminante" || a.sistema!=="fisso"));
        const riferimenti = [rif,...finestre.map(a=>({livelloId:piano.id,oggettoId:a.id,tipo:"apertura" as const}))];
        const superficie = areaPoligono(l.contorno)/10000;
        if (!superficie || contornoIncrociato(l.contorno) || stato.locali.some(altro=>altro.id!==l.id && eAmbienteInterno(altro) && interniSovrapposti(l.contorno,altro.contorno))
          || scalaModelloDaVerificare(piano) || origineMisura(l,"contorno")==="stimata" || finestre.some(a=>a[campo]===undefined)) {
          return esito("Dato mancante",`Riscontra il contorno del locale e la superficie ${criterio} dei serramenti.`,riferimenti);
        }
        const utile = finestre.reduce((n,a)=>n+(a[campo] ?? 0),0);
        rapporti.push({nome:`${l.nome} (${mq(utile)} m² ${criterio==="apribile" ? "apribili" : "illuminanti"} su ${mq(superficie)} m²)`,
          valore:100*utile/superficie,riferimenti});
      }
      return misura(rapporti,"%");
    }
    if (r.metrica==="manovra" || r.metrica==="scarichi") {
      const tecnici = (d.riscontriTecnici ?? []).filter(t=>t.varianteId===varianteId && t.criterio===r.metrica && t.firma===firmaRiscontroTecnico(doc,t,d));
      if (tecnici.length) return esito(tecnici.some(t=>t.esito==="criticita") ? "Criticità rilevata" : "Da verificare dal tecnico",
        tecnici.map(t=>`${piani.find(p=>p.piano.id===t.livelloId)?.piano.nome ?? "Piano"} · ${t.riferimento} · ${t.tecnico}, ${t.data}`).join(" · "));
    }
    return esito("Da verificare dal tecnico","Registra il riscontro del tecnico per questa condizione.");
  });
}
