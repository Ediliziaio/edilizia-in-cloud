import { areaPoligono, contornoIncrociato, interniSovrapposti, puntoNelPoligono, segmentiSiIncrociano } from "../../../../shared/planimetrie/geometria.ts";
import { eAmbienteInterno, funzionePareteDaVerificare, origineMisura, scalaModelloDaVerificare, TIPI_ZANZARIERA, type Livello, type TipoArea } from "../../../../shared/planimetrie/modello.ts";
import { NOMI_ZANZARIERA, zanzarieraAmmessa } from "../../../../shared/planimetrie/serramenti.ts";
import { calcolaQuantita } from "../../../../shared/planimetrie/quantita.ts";
import { chiaveTratto, eElementoElettrico, eElementoScarico, percorsiImpianti, type Percorso } from "../../../../shared/planimetrie/impianti.ts";
import { firmaRiscontroTecnico } from "../../../../shared/planimetrie/urbanistica.ts";
import { studioVariante } from "@/lib/planimetrie/studioImmobiliare";
import { muriChiusiSulPercorso, proponiPercorsoScarico } from "@/lib/planimetrie/percorsoScarico";
import { definizioneCampo, type TipoCampo } from "@/lib/planimetrie/campiSport";
import { destinazioneDa } from "../../../../supabase/functions/planimetria-genera/rispostaAI.ts";
import { aggiornaQuote, aperturaNellaVista, aPlanimetria, capovolgi, contornoInterno, contornoSullAsse, ID_PROPOSTA, quantitaLocale, SPESSORE_TRAMEZZO, type Locale, type Muro, type Pianta, type Planimetria, type Punto } from "./adattatore";
import { arredaStanza, impiantoElettrico, type EsitoArreda } from "./arreda";
import { CATALOGO } from "./catalogo";
import * as C from "./comandi";
import { direzione, dist, proiettaSuMuro, puntoSulMuro, sulSegmento } from "./geometria";
import { leggiMisura } from "./misure";
import type { Selezione, SfondoRicalco } from "./TelaPlanimetria";
import { posaCampoDaChat, sportRichiesti } from "./sportChat";
import { traslaTramezzo, type InterferenzaTramezzo } from "./traslaTramezzo";
import type { RevisioneInterventi } from "./interventiChat";

export type RenderChatDisegno = "render" | "render-edificio" | "render-sport" | `render:${TipoCampo}`;
export type VistaChatDisegno = "3d" | RenderChatDisegno | `foto:${RenderChatDisegno}`;

export interface ConfrontoTramezzoChat {
  prima: Muro;
  dopo: Muro;
  distanzaCm: number;
  ambiente: string;
  interferenze: InterferenzaTramezzo[];
  righe: { id: string; descrizione: string; unita: string; prima: number | null; dopo: number | null }[];
}

export interface PassoChatDisegno {
  pianta: Pianta;
  testo: string;
  evidenza?: Selezione;
  riferimento?: Omit<SfondoRicalco, "url"> & {
    file: Blob;
    schizzo?: string;
    proporzioneFoto?: number;
    dwg?: { nome: string; livello: Pick<Livello, "fatto" | "tavolaDwg" | "controlloDwg"> };
  };
  daVerificare?: string;
  mostraImpianti?: boolean;
  confrontoScarico?: { prima: Percorso; dopo: Percorso };
  confrontoTramezzo?: ConfrontoTramezzoChat;
  vistaRichiesta?: VistaChatDisegno;
  revisioneInterventi?: RevisioneInterventi;
}

export interface ContestoChatDisegno {
  documento: Planimetria;
  livelloId?: string;
  propostaId?: string;
  selezione?: Selezione | null;
}

const CIFRE = ["zero", "uno", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove"];
const DAI_DIECI = ["dieci", "undici", "dodici", "tredici", "quattordici", "quindici", "sedici", "diciassette", "diciotto", "diciannove"];
const DECINE = ["venti", "trenta", "quaranta", "cinquanta", "sessanta", "settanta", "ottanta", "novanta"];
const NUMERI_IN_PAROLE = new Map([...CIFRE, ...DAI_DIECI].map((n, i) => [n, i]));
for (const [i, nome] of DECINE.entries()) {
  const decina = (i + 2) * 10;
  NUMERI_IN_PAROLE.set(nome, decina);
  for (const [unita, cifra] of CIFRE.slice(1).entries()) {
    const n = unita + 1;
    const prefisso = n === 1 || n === 8 ? nome.slice(0, -1) : nome;
    NUMERI_IN_PAROLE.set(prefisso + cifra, decina + n);
    if (n === 3) NUMERI_IN_PAROLE.set(prefisso + "tré", decina + n);
  }
}
NUMERI_IN_PAROLE.set("cento", 100);
const PAROLA = `(?:${[...NUMERI_IN_PAROLE.keys()].sort((a, b) => b.length - a.length).join("|")})`;
const CIFRE_DECIMALI = String.raw`\d{1,5}(?:[.,]\d{1,3})?`;
const NUMERO = String.raw`(?:${CIFRE_DECIMALI}|${PAROLA})(?:\s+(?:virgola|e)\s+(?:\d{1,2}|${PAROLA}))?`;
const IMPERIALE = String.raw`\d{1,5}\s*(?:['’′]|ft\b)(?:\s*-?\s*${CIFRE_DECIMALI}\s*(?:["”″]|in\b))?|${CIFRE_DECIMALI}\s*(?:["”″]|in\b)`;
const MISURA = String.raw`(?:${IMPERIALE}|${NUMERO}(?:\s*(?:millimetri|millimetro|centimetri|centimetro|metri|metro|mm|cm|m)\b)?)`;
const COPPIA = new RegExp(String.raw`(?<![\p{L}\d])(${MISURA})\s*(?:×|x|\bper\b)\s*(${MISURA})(?![\p{L}\d])`, "iu");
const VERBO = /^(?:(?:puoi\s+)?(?:aggiungi|aggiungere|disegna|disegnare|crea|creare|metti|mettere|inserisci|inserire|fai|fare|genera|apri|mostra|fammi(?: vedere)?)\s+)/iu;
const ARTICOLO = /^(?:(?:il|lo|la|un|una|uno|i|gli|le)\s+|l['’])/iu;
const DIMENSIONE = /\s+(?:di|da|misura|misure|a|grande)\s*$/iu;
const RIFERIMENTO = /^(?:a\s+)?(destra|sinistra|sopra|sotto)\s+(?:(?:del|della|dello|delle|dei|degli|di|alla|al|allo|il|la|lo|le|i|gli)\s+|(?:dell|l)['’])(.+)$/iu;
const NOMI_MOVIMENTO = /^(?:ridimensiona|allarga|allunga|stringi|porta)\s+/iu;
const QUOTE = /^(?:misura|quote(?:\s+di)?|quanti metri(?:\s+ha)?)\s+/iu;
const COMANDO_SUCCESSIVO = String.raw`(?:aggiungi|disegna|crea|fai|genera|metti|apri|fammi vedere|proponi|render|arreda|misura|ridimensiona|sposta|demolisci|tramezzo|porta|finestra|zanzariera|impianto|cucina|bagno|garage|camera|soggiorno|ingresso)\s`;
// «… 3 × 1,2 m e la cameretta 3 × 2,8 m»: «e» + stanza + misure è una seconda richiesta.
const ALTRA_STANZA_CON_MISURE = String.raw`,?\s+e\s+(?=(?:(?:il|lo|la|i|gli|le)\s+|l['’])?[\p{L}' ]{2,40}?\s+(?:misura\s+|di\s+|a\s+)?${MISURA}\s*(?:×|x|\bper\b)\s*${MISURA})`;
const TAGLIO = new RegExp(String.raw`\s*(?:\r?\n|;)\s*|[.!?,]\s*(?=(?:(?:e\s+)?(?:poi|quindi|infine)\s+)?${COMANDO_SUCCESSIVO})|\s+(?:e\s+)?(?:poi|quindi|infine)\s+(?=${COMANDO_SUCCESSIVO})|${ALTRA_STANZA_CON_MISURE}`, "iu");
const DEMOLIZIONE = /^demolisci\s+(?:(?:il|la|un|una)\s+)?(?:tramezzo|parete)\s+tra\s+(.+?\s+e\s+.+)$/iu;
const DEMOLIZIONE_TRATTO = /^demolisci\s+(?:(?:il|la)\s+)?(?:tramezzo|parete)\s+([\w-]+)$/iu;
const NUOVO_TRAMEZZO = new RegExp(String.raw`^tramezzo\s+(?:in|nel|nella|nello)\s+(.+?)\s+a\s+(${MISURA})\s+dal\s+lato\s+(sinistro|destro|alto|basso)(?:\s+alto\s+(${MISURA}))?$`, "iu");
const SPOSTA_TRAMEZZO = new RegExp(String.raw`^sposta\s+(?:(?:il|la)\s+)?(?:tramezzo|parete)(?:\s+selezionat[oa])?\s+di\s+(${MISURA})\s+verso\s+(.+)$`, "iu");
const INGOMBRI_FISSI = new Set(["scala", "scala_u", "scala_chiocciola", "pilastro", "ascensore", "colonna_scarico"]);
const formato = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const metri = (cm: number) => `${formato.format(cm / 100)} m`;
const mq = (cm2: number) => `${formato.format(cm2 / 10_000)} m²`;
const nomePulito = (s: string) => s.trim().replace(ARTICOLO, "").replace(/[.?!,:]+$/u, "").trim();
const chiave = (s: string) => nomePulito(s).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("it");
const lato = (c: Punto[], i: number) => [c[i], c[(i + 1) % c.length]] as const;
const nomeLocale = (pianta: Pianta, vista: C.Vista, l: Locale) =>
  (vista === "progetto" ? pianta.nomiProgetto?.[l.id]?.nome : undefined) ?? l.nome;

function misuraDaChat(testo: string) {
  const compatta = testo.toLowerCase().trim()
    .replace(/\bmillimetr[io]$/u, "mm").replace(/\bcentimetr[io]$/u, "cm").replace(/\bmetr[io]$/u, "m");
  const diretta = leggiMisura(compatta);
  if (diretta !== null) return diretta;
  const parlata = compatta.match(/^(\p{L}+|\d+)(?:\s+(virgola|e)\s+(\p{L}+|\d{1,2}))?\s*(m|cm|mm)?$/u);
  if (!parlata) return null;
  const numero = (valore: string) => NUMERI_IN_PAROLE.get(valore) ?? Number(valore);
  const [, intera, separatore, frazione, unita = ""] = parlata;
  const i = numero(intera);
  const f = frazione ? numero(frazione) : 0;
  // «Due e quaranta» usa i centimetri dopo i metri; «due e cinque» è ambiguo.
  if (separatore === "e" && f < 10 && !/^0\d$/.test(frazione)) return null;
  const decimali = frazione ? "," + (/^\d+$/.test(frazione) ? frazione : String(f)) : "";
  return leggiMisura(`${i}${decimali}${unita}`);
}

function riquadro(punti: Punto[]) {
  const x = punti.map(p => p.x);
  const y = punti.map(p => p.y);
  return { x0: Math.min(...x), x1: Math.max(...x), y0: Math.min(...y), y1: Math.max(...y) };
}

function misure(pianta: Pianta, locale: Locale) {
  const contorno = contornoInterno(pianta, locale);
  const r = riquadro(contorno);
  return { w: r.x1 - r.x0, h: r.y1 - r.y0, area: areaPoligono(contorno) };
}

function localeConNome(pianta: Pianta, vista: C.Vista, nome: string) {
  const corrispondenze = pianta.locali.filter(l => C.visibile(l.stato, vista) && l.stato !== "da_demolire" && chiave(nomeLocale(pianta, vista, l)) === chiave(nome));
  if (corrispondenze.length === 1) return corrispondenze[0];
  throw new Error(corrispondenze.length ? `«${nome}» identifica più ambienti. Usa nomi distinti nel pannello Stanze.`
    : `«${nome}» non è presente sul piano corrente. Controlla il nome o cambia piano.`);
}

function nomiDeiDueLocali(pianta: Pianta, vista: C.Vista, frase: string) {
  const separatori = [...frase.matchAll(/\s+e\s+/giu)];
  const coppie = separatori.map(m => [frase.slice(0, m.index), frase.slice(m.index! + m[0].length)] as const);
  if (coppie.length === 1) return coppie[0];
  const nomi = new Set(pianta.locali.filter(l => C.visibile(l.stato, vista) && l.stato !== "da_demolire")
    .map(l => chiave(nomeLocale(pianta, vista, l))));
  const esatte = coppie.filter(([a, b]) => nomi.has(chiave(a)) && nomi.has(chiave(b)));
  if (esatte.length > 1) throw new Error("La frase può indicare più coppie di locali. Rinomina gli ambienti per distinguerli.");
  return esatte[0] ?? coppie[0];
}

function latiSuMuro(locale: Pick<Locale, "contorno">, muro: Muro, tolleranza = 1) {
  return locale.contorno.flatMap((_, i) => {
    const [a, b] = lato(locale.contorno, i);
    const p = proiettaSuMuro(a, muro), q = proiettaSuMuro(b, muro);
    const pa = puntoSulMuro(muro, p.tLibero), pb = puntoSulMuro(muro, q.tLibero);
    if (Math.max(dist(a, pa), dist(b, pb)) > tolleranza) return [];
    // Su una pianta salvata un vertice al giunto può restare sul filo interno.
    if (dist({ x: a.x - pa.x, y: a.y - pa.y }, { x: b.x - pb.x, y: b.y - pb.y }) > Math.max(1, .05 * dist(a, b))) return [];
    return [{ da: Math.min(p.t, q.t), a: Math.max(p.t, q.t) }];
  }).filter(s => s.a - s.da >= 1);
}

function muriVisibili(pianta: Pianta, vista: C.Vista) {
  return pianta.muri.filter(m => C.visibile(m.stato, vista) && m.stato !== "da_demolire");
}

function localiDelProgetto(pianta: Pianta, contesto?: ContestoChatDisegno) {
  const documento = aPlanimetria(pianta, contesto?.documento, contesto?.livelloId, contesto?.propostaId);
  const livello = documento.livelli.find(l => l.id === contesto?.livelloId) ?? documento.livelli[0];
  const proposta = livello.proposte.find(p => p.id === contesto?.propostaId) ?? (contesto?.propostaId ? undefined : livello.proposte[0]);
  return proposta ?? livello.fatto;
}

function spostaTramezzoDaChat(pianta: Pianta, vista: C.Vista, istruzione: string, contesto?: ContestoChatDisegno): PassoChatDisegno | null {
  const richiesta = istruzione.match(SPOSTA_TRAMEZZO);
  if (!richiesta) return null;
  if (vista !== "progetto") throw new Error("Apri «Progetto» per spostare il tramezzo della variante.");
  const distanzaCm = misuraDaChat(richiesta[1]);
  if (distanzaCm === null || distanzaCm <= 0) throw new Error("Indica uno spostamento con unità, ad esempio 20 cm.");

  const propostaId = contesto?.propostaId ?? ID_PROPOSTA;
  const prima = aPlanimetria(pianta, contesto?.documento, contesto?.livelloId, propostaId);
  const piano = prima.livelli.find(l => l.id === contesto?.livelloId) ?? prima.livelli[0];
  const locali = piano.proposte.find(p => p.id === propostaId)?.locali ?? [];
  const nome = chiave(richiesta[2]);
  const esatti = locali.filter(l => chiave(l.nome) === nome);
  const trovati = esatti.length ? esatti : locali.filter(l => l.destinazione === nome);
  if (trovati.length !== 1) throw new Error(trovati.length
    ? "Più ambienti hanno quel nome o funzione. Indica il nome completo mostrato sulla pianta."
    : "Indica il nome di un ambiente della variante verso cui spostare il tramezzo.");

  const locale = trovati[0];
  const contorno = locale.contorno.map(capovolgi);
  const candidati = pianta.muri.filter(m => m.tipo === "tramezzo" && m.stato === "nuovo" && !funzionePareteDaVerificare(m) &&
    latiSuMuro({ contorno }, m, m.spessore / 2 + 0.75).length > 0);
  const scelto = contesto?.selezione;
  const muro = scelto?.tipo === "muro" ? candidati.find(m => m.id === scelto.id) : candidati.length === 1 ? candidati[0] : undefined;
  if (!muro) throw new Error(candidati.length
    ? "Seleziona sulla pianta il tramezzo nuovo che confina con l’ambiente indicato."
    : "Il locale non confina con un tramezzo nuovo già classificato nella variante.");

  const u = direzione(muro);
  const normale = { x: -u.y, y: u.x };
  const contatti = latiSuMuro({ contorno }, muro, muro.spessore / 2 + 0.75);
  const filo = muro.spessore / 2 + 1;
  const latiInterni = new Set<number>();
  for (const tratto of contatti) {
    const punto = puntoSulMuro(muro, (tratto.da + tratto.a) / 2);
    for (const lato of [-1, 1]) {
      const campione = { x: punto.x + normale.x * filo * lato, y: punto.y + normale.y * filo * lato };
      if (puntoNelPoligono(campione, contorno)) latiInterni.add(lato);
    }
  }
  if (latiInterni.size !== 1) throw new Error("La direzione verso il locale è ambigua. Controlla il suo contorno.");
  const [latoInterno] = latiInterni;
  const d = latoInterno * distanzaCm;
  const movimento = traslaTramezzo(pianta, muro, { x: normale.x * d, y: normale.y * d });
  const nuova = aggiornaQuote(movimento.pianta);
  const dopo = aPlanimetria(nuova, prima, piano.id, propostaId);
  const voci = (doc: Planimetria) => new Map(studioVariante(doc, propostaId).righe.filter(r => r.livelloId === piano.id).map(r => [r.id, r]));
  const vociPrima = voci(prima), vociDopo = voci(dopo);
  const righe = [...new Set([...vociPrima.keys(), ...vociDopo.keys()])].flatMap(id => {
    const a = vociPrima.get(id), b = vociDopo.get(id), r = b ?? a!;
    const q1 = a?.quantita ?? null, q2 = b?.quantita ?? null;
    if (id !== muro.id && q1 === q2 && !!a === !!b) return [];
    return [{ id, descrizione: r.descrizione, unita: r.unita, prima: a ? q1 : 0, dopo: b ? q2 : 0 }];
  });
  const muriMossi = { prima: muro, dopo: movimento.dopo, distanzaCm, ambiente: locale.nome, interferenze: movimento.interferenze, righe };
  return {
    pianta: nuova, evidenza: { tipo: "muro", id: muro.id }, confrontoTramezzo: muriMossi,
    testo: `Tramezzo spostato in anteprima di ${formato.format(distanzaCm)} cm verso ${locale.nome} · ${metri(dist(movimento.dopo.p1, movimento.dopo.p2))} all’asse`,
  };
}

function misuraLocaleInVista(pianta: Pianta, vista: C.Vista, nome: string, contesto?: ContestoChatDisegno): PassoChatDisegno {
  const livello = contesto?.documento.livelli.find(l => l.id === contesto.livelloId) ?? contesto?.documento.livelli[0];
  const avvisoScala = livello && scalaModelloDaVerificare(livello) ? "Scala da riscontrare · verifica la scala del modello per leggere le misure." : null;
  if (vista === "fatto") {
    const locale = localeConNome(pianta, vista, nome);
    return { pianta, testo: avvisoScala ?? epilogoMisure(pianta, locale, vista), evidenza: { tipo: "locale", id: locale.id } };
  }
  const { locali } = localiDelProgetto(pianta, contesto);
  const corrispondenze = locali.filter(l => chiave(l.nome) === chiave(nome));
  if (corrispondenze.length !== 1) throw new Error(corrispondenze.length
    ? `«${nome}» identifica più ambienti. Assegna nomi distinti agli ambienti della variante.`
    : `«${nome}» non è visibile nella variante. Controlla il nome sulla tavola.`);
  const l = corrispondenze[0], r = riquadro(l.contorno), area = areaPoligono(l.contorno);
  return { pianta, testo: avvisoScala ?? fraseMisure(l.nome, r.x1 - r.x0, r.y1 - r.y0, area, origineMisura(l, "contorno") === "stimata"), evidenza: { tipo: "locale", id: l.id } };
}

function modificaTramezzo(pianta: Pianta, vista: C.Vista, testo: string, contesto?: ContestoChatDisegno): PassoChatDisegno | null {
  const demolizione = testo.match(DEMOLIZIONE);
  const tratto = testo.match(DEMOLIZIONE_TRATTO)?.[1];
  const costruzione = testo.match(NUOVO_TRAMEZZO);
  if (!demolizione && !tratto && !costruzione) return null;
  if (vista !== "progetto") throw new Error("Passa a «Progetto» per proporre lavori su pareti e tramezzi.");
  const muri = muriVisibili(pianta, vista);
  if (demolizione || tratto) {
    let muro = tratto ? muri.find(m => m.id.toLowerCase() === tratto.toLowerCase()) : undefined;
    let indica = muro?.id;
    if (demolizione) {
      const [nomeA, nomeB] = nomiDeiDueLocali(pianta, vista, demolizione[1]);
      const a = localeConNome(pianta, vista, nomeA), b = localeConNome(pianta, vista, nomeB);
      if (a.id === b.id) throw new Error("Scegli due ambienti diversi.");
      const locali = localiDelProgetto(pianta, contesto).locali;
      if (![a, b].every(l => locali.some(e => e.id === l.id))) throw new Error("Uno degli ambienti è cambiato. Seleziona il tratto sulla tavola per indicare la parete.");
      const condivisi = muri.filter(m => [a, b].every(l => latiSuMuro(l, m).some(t => t.da <= 1 && t.a >= dist(m.p1, m.p2) - 1)));
      if (condivisi.length !== 1) throw new Error("Seleziona il tratto sulla tavola quando i locali condividono più pareti o solo una parte della parete.");
      muro = condivisi[0];
      indica = `${nomeLocale(pianta, vista, a)} e ${nomeLocale(pianta, vista, b)}`;
    }
    if (!muro) throw new Error("Indica l’identificativo di una parete attiva della variante.");
    if (funzionePareteDaVerificare(muro)) throw new Error("La funzione della parete è da riscontrare. Selezionala in «Com’è oggi» e classificala dopo aver controllato gli elaborati strutturali.");
    if (muro.tipo !== "tramezzo" || muro.stato !== "esistente") {
      throw new Error("La demolizione richiede un tramezzo esistente. Controlla il tipo di parete nei dettagli.");
    }
    if (pianta.aperture.some(a => a.muroId === muro.id && a.stato === "nuovo")) {
      throw new Error("C’è già un’apertura nuova su quel muro. Rimuovi l’apertura dalla variante prima di proporre la demolizione.");
    }
    return {
      pianta: C.eliminaMuro(pianta, muro.id, vista), evidenza: { tipo: "muro", id: muro.id },
      testo: `Demolizione proposta · ${indica} · ${metri(dist(muro.p1, muro.p2))} × ${metri(muro.altezza)} · ${mq(dist(muro.p1, muro.p2) * muro.altezza)} lordi`,
      daVerificare: "Per la demolizione verifica funzione strutturale, impianti e altezze sul posto.",
    };
  }

  const [, nome, quota, lato, altezzaTesto] = costruzione!;
  const distanza = misuraDaChat(quota);
  const { locali, muri: muriModello } = localiDelProgetto(pianta, contesto);
  const corrispondenze = locali.filter(l => chiave(l.nome) === chiave(nome));
  if (corrispondenze.length !== 1) throw new Error("Indica il nome esatto di un solo locale visibile nella variante.");
  const l = corrispondenze[0];
  const altezza = altezzaTesto ? misuraDaChat(altezzaTesto) : l.altezza;
  if (!altezza || altezza < 50 || altezza > 800) throw new Error("Indica un’altezza del tramezzo tra 0,50 e 8 m.");
  const c = l.contorno.map(p => ({ x: p.x, y: -p.y }));
  const r = riquadro(c);
  if (l.aperto || Math.abs((r.x1 - r.x0) * (r.y1 - r.y0) - areaPoligono(c)) > 1) {
    throw new Error("Per un locale non rettangolare traccia gli estremi con lo strumento Parete.");
  }
  const a = riquadro(contornoSullAsse(l.contorno, muriModello.filter(m => m.stato !== "da_demolire")).map(p => ({ x: p.x, y: -p.y })));
  const bordi = lato.toLowerCase();
  const verticale = bordi === "sinistro" || bordi === "destro";
  const ampiezza = verticale ? r.x1 - r.x0 : r.y1 - r.y0;
  if (!distanza || distanza < 25 || ampiezza - distanza < 25) throw new Error("Lascia almeno 25 cm tra l’asse del tramezzo e i muri ai due lati.");
  const x = bordi === "destro" ? r.x1 - distanza : r.x0 + distanza;
  const y = bordi === "basso" ? r.y1 - distanza : r.y0 + distanza;
  const p1 = verticale ? { x, y: a.y0 } : { x: a.x0, y };
  const p2 = verticale ? { x, y: a.y1 } : { x: a.x1, y };
  const giuntiChiusi = [p1, p2].every(p => muri.some(m => sulSegmento(p, m.p1, m.p2, 1)));
  const incrociaMuri = muri.some(m => segmentiSiIncrociano(p1, p2, m.p1, m.p2)
    || [m.p1, m.p2].some(p => sulSegmento(p, p1, p2, 1) && dist(p, p1) > 1 && dist(p, p2) > 1)
    || [p1, p2].every(p => sulSegmento(p, m.p1, m.p2, 1)));
  if (!giuntiChiusi || incrociaMuri) throw new Error("Il tramezzo non arriva a due muri liberi oppure incrocia una parete esistente. Controlla il locale sulla tavola.");
  const intercettaApertura = [p1, p2].some(p => muri.some(m => {
    if (!sulSegmento(p, m.p1, m.p2, 1)) return false;
    const { t } = proiettaSuMuro(p, m);
    return pianta.aperture.some(a => a.muroId === m.id && a.stato !== "da_demolire" && Math.abs(a.posizione - t) <= (a.larghezza + SPESSORE_TRAMEZZO) / 2);
  }));
  if (intercettaApertura) throw new Error("Il tramezzo finirebbe su un’apertura. Sposta la quota di partenza.");
  const { id, pianta: conMuro } = C.aggiungiParete(pianta, p1, p2, { stato: "nuovo", origine: "stimata" });
  if (!id) throw new Error("Il tratto è troppo corto per disegnare il tramezzo.");
  return {
    pianta: C.modificaMuro(conMuro, id, { altezza, origineAltezza: "stimata" }), evidenza: { tipo: "muro", id },
    testo: `Nuovo tramezzo · ${l.nome} · ${metri(dist(p1, p2))} × ${metri(altezza)} · ${mq(dist(p1, p2) * altezza)} lordi`,
    daVerificare: "Verifica quota, passaggi e impianti. Per calcolare la superficie nel computo, conferma l’altezza nei dettagli della parete.",
  };
}

function postoApertura(pianta: Pianta, vista: C.Vista, locale: Locale, larghezza: number, secondo?: Locale, bordo?: string) {
  const r = riquadro(locale.contorno);
  const fissi = secondo && vista === "progetto" ? (pianta.elementi ?? []).filter(e => INGOMBRI_FISSI.has(e.tipo)
    && C.visibile(e.stato, vista) && e.stato !== "da_demolire") : [];
  let ostacolo = "";
  const libero = (muro: Muro, da: number, a: number) => {
    const asse = direzione(muro);
    const ingombri = fissi.flatMap(e => {
      const angolo = e.rotazione * Math.PI / 180;
      const cos = Math.cos(angolo), sin = Math.sin(angolo);
      const lungo = Math.abs(cos * asse.x + sin * asse.y);
      const trasversale = Math.abs(sin * asse.x - cos * asse.y);
      const deltaX = e.centro.x - muro.p1.x, deltaY = e.centro.y - muro.p1.y;
      const distanza = Math.abs(-deltaX * asse.y + deltaY * asse.x);
      const profondita = (e.larghezza * trasversale + e.profondita * lungo) / 2;
      // Controllo di ingombro sul disegno davanti al passaggio, al netto della parete.
      if (distanza - profondita > muro.spessore / 2 + 80) return [];
      const centro = deltaX * asse.x + deltaY * asse.y;
      const meta = (e.larghezza * lungo + e.profondita * trasversale) / 2;
      return [{ da: centro - meta, a: centro + meta, nome: e.etichetta || e.tipo.replaceAll("_", " ") }];
    }).filter(i => i.a > da && i.da < a);
    if (ingombri.length && a - da >= larghezza + 10) ostacolo ||= ingombri[0].nome;
    const occupati = pianta.aperture.filter(x => x.muroId === muro.id && x.stato !== "da_demolire" && C.visibile(x.stato, vista))
      .map(x => ({ da: x.posizione - x.larghezza / 2, a: x.posizione + x.larghezza / 2 }))
      .concat(ingombri).sort((p, q) => p.da - q.da);
    const intervalli: { da: number; a: number }[] = [];
    let inizio = da;
    for (const o of occupati) {
      intervalli.push({ da: inizio, a: Math.min(a, o.da) });
      inizio = Math.max(inizio, o.a);
    }
    intervalli.push({ da: inizio, a });
    return intervalli.filter(i => i.a - i.da >= larghezza + 10).map(i => ({ muro, t: (i.a + i.da) / 2, spazio: i.a - i.da }));
  };
  const candidati = muriVisibili(pianta, vista).flatMap(muro => {
    const orizzontale = Math.abs(muro.p1.y - muro.p2.y) <= 1;
    const verticale = Math.abs(muro.p1.x - muro.p2.x) <= 1;
    if (bordo && !(bordo === "alto" ? orizzontale && Math.abs(muro.p1.y - r.y0) <= 1
      : bordo === "basso" ? orizzontale && Math.abs(muro.p1.y - r.y1) <= 1
      : bordo === "destro" ? verticale && Math.abs(muro.p1.x - r.x1) <= 1 : verticale && Math.abs(muro.p1.x - r.x0) <= 1)) return [];
    const tolleranza = muro.spessore / 2 + 1;
    const lati = latiSuMuro(locale, muro, tolleranza);
    if (!secondo) {
      const confini = pianta.locali.filter(l => l.id !== locale.id && C.visibile(l.stato, vista) && l.stato !== "da_demolire")
        .flatMap(l => latiSuMuro(l, muro, tolleranza));
      return lati.filter(s => !confini.some(c => Math.min(s.a, c.a) - Math.max(s.da, c.da) > 1)).flatMap(s => libero(muro, s.da, s.a));
    }
    return lati.flatMap(s => latiSuMuro(secondo, muro, tolleranza).flatMap(q => libero(muro, Math.max(s.da, q.da), Math.min(s.a, q.a))));
  }).sort((a, b) => b.spazio - a.spazio);
  if (!candidati.length && ostacolo) throw new Error(`Il passaggio incontra «${ostacolo}». Scegli un altro punto e verifica lo spazio libero sul posto.`);
  return candidati[0];
}

const fraseMisure = (nome: string, w: number, h: number, area: number, stimata: boolean) => {
  const ingombro = Math.abs(w * h - area) > 1 ? "ingombro " : "";
  return `${nome} · ${ingombro}${metri(w)} × ${metri(h)} · ${mq(area)}${stimata ? " · stima dal disegno" : ""}`;
};
const epilogoMisure = (pianta: Pianta, locale: Locale, vista: C.Vista) => {
  const { w, h, area } = misure(pianta, locale);
  return fraseMisure(nomeLocale(pianta, vista, locale), w, h, area, quantitaLocale(pianta, locale).stimata);
};

function aggiungiApertura(pianta: Pianta, vista: C.Vista, testo: string, contesto?: ContestoChatDisegno): PassoChatDisegno | null {
  const porta = testo.match(new RegExp(String.raw`^(porta|varco|foro)\s+tra\s+(.+?\s+e\s+.+?)(?:\s+da\s+(${MISURA}))?$`, "iu"));
  const finestra = testo.match(new RegExp(String.raw`^(finestra|portafinestra)\s+(?:(?:in|nella|nel|della|del|di)\s+)?(.+?)\s+sul\s+lato\s+(alto|basso|destro|sinistro)(?:\s+da\s+(${MISURA}))?$`, "iu"));
  if (!porta && !finestra) return null;
  let riferimento = pianta;
  if (vista === "progetto") {
    const stato = localiDelProgetto(pianta, contesto);
    riferimento = { ...pianta, locali: stato.locali.map(l => ({
      ...l, stato: "esistente", contorno: (l.aperto ? l.contorno : contornoSullAsse(l.contorno, stato.muri)).map(capovolgi),
    })) };
  }
  const [scelta, nome, altro, specificata] = porta
    ? [porta[1], ...nomiDeiDueLocali(riferimento, vista, porta[2]), porta[3]]
    : finestra!.slice(1);
  const richiesto = scelta.toLowerCase();
  const tipo = richiesto === "porta" ? "porta" : richiesto === "portafinestra" ? "portafinestra" : richiesto === "finestra" ? "finestra" : "varco";
  const titolo = tipo.charAt(0).toUpperCase() + tipo.slice(1);
  const larghezza = specificata ? misuraDaChat(specificata) : C.MISURE_APERTURA[tipo].larghezza;
  if (!larghezza || larghezza < 40 || larghezza > 400) throw new Error("Indica una larghezza per l’apertura tra 40 e 400 cm.");
  const locale = localeConNome(riferimento, vista, nome);
  const secondo = porta ? localeConNome(riferimento, vista, altro) : undefined;
  if (locale.id === secondo?.id) throw new Error("Scegli due stanze diverse per la porta.");
  const posto = postoApertura(riferimento, vista, locale, larghezza, secondo, finestra ? altro.toLowerCase() : undefined);
  if (!posto) throw new Error(porta ? "Serve un tratto libero sulla parete in comune fra le stanze." : "Sul lato scelto serve una parete esterna con spazio libero per il serramento.");
  if (vista === "progetto" && posto.muro.stato === "esistente") {
    if (funzionePareteDaVerificare(posto.muro)) throw new Error("Riscontra la funzione della parete prima di proporre un nuovo vano.");
    if (posto.muro.tipo === "portante") throw new Error("La parete è indicata come portante. Fai verificare l’apertura da un tecnico prima di inserirla fra i lavori.");
  }
  const { pianta: conApertura, id } = C.aggiungiApertura(pianta, posto.muro.id, tipo, posto.t, { stato: C.statoNuovo(vista), origine: "stimata" });
  if (!id) return null;
  const risultato = C.spostaApertura(C.modificaApertura(conApertura, id, { larghezza }), id, posto.muro.id, posto.t);
  return { pianta: risultato, evidenza: { tipo: "apertura", id },
    testo: `${titolo} · ${nomeLocale(pianta, vista, locale)}${secondo ? ` e ${nomeLocale(pianta, vista, secondo)}` : ""} · ${metri(larghezza)}${specificata ? "" : " di larghezza indicativa"}`,
    ...(vista === "progetto" && posto.muro.stato === "esistente"
      ? { daVerificare: "Controlla in sopralluogo la fattibilità del vano e la parete che lo ospita." } : {}) };
}

const SPOSTA_PORTA = new RegExp("^sposta\\s+(?:la\\s+)?porta\\s+([\\w-]+)\\s+di\\s+(" + MISURA +
  ")\\s+verso\\s+(?:l['’]|la\\s+)?(inizio|fine)$", "iu");

function spostaPorta(pianta: Pianta, vista: C.Vista, istruzione: string): PassoChatDisegno | null {
  const richiesta = SPOSTA_PORTA.exec(istruzione);
  if (!richiesta) return null;
  if (vista !== "progetto") throw new Error("Passa a «Progetto» per proporre lo spostamento della porta.");
  const [, id, testoDistanza, verso] = richiesta;
  const porta = pianta.aperture.find(a => a.id.toLowerCase() === id.toLowerCase() && a.tipo === "porta" && a.stato !== "da_demolire");
  const muro = porta && muriVisibili(pianta, vista).find(m => m.id === porta.muroId);
  if (!porta || !muro) throw new Error("Indica l’identificativo completo di una porta attiva della variante.");
  if (funzionePareteDaVerificare(muro)) throw new Error("Riscontra la funzione della parete prima di spostare il vano.");
  if (muro.tipo !== "tramezzo") throw new Error("Il vano è su una parete strutturale o perimetrale. Serve il riscontro del tecnico.");
  const distanza = misuraDaChat(testoDistanza);
  if (!distanza || distanza < 1) throw new Error("Indica lo spostamento in centimetri, almeno 1 cm.");
  const posizione = porta.posizione + (verso.toLowerCase() === "inizio" ? -distanza : distanza);
  const da = posizione - porta.larghezza / 2, a = posizione + porta.larghezza / 2;
  const lunghezza = dist(muro.p1, muro.p2);
  const sovrapposta = pianta.aperture.some(v => v.muroId === muro.id && (v.id !== porta.id || porta.stato === "esistente") &&
    da < v.posizione + v.larghezza / 2 && a > v.posizione - v.larghezza / 2);
  if (da < 5 || a > lunghezza - 5 || sovrapposta) throw new Error("Scegli un tratto libero che lasci spazio al vano e all’eventuale chiusura di quello esistente.");
  if (muriVisibili(pianta, vista).some(m => m.id !== muro.id && segmentiSiIncrociano(puntoSulMuro(muro, da), puntoSulMuro(muro, a), m.p1, m.p2))) {
    throw new Error("Il nuovo vano passa per l’incrocio con un’altra parete. Scegli un tratto libero.");
  }
  const daChiudere = porta.stato === "esistente";
  const base = daChiudere ? C.eliminaApertura(pianta, porta.id, vista) : pianta;
  const aggiunta = daChiudere ? C.aggiungiApertura(base, muro.id, "porta", posizione, { stato: "nuovo", origine: "stimata" }) : { pianta: base, id: porta.id };
  if (!aggiunta.id) return null;
  const risultato = { ...aggiunta.pianta, aperture: aggiunta.pianta.aperture.map(v => v.id === aggiunta.id
    ? { ...porta, id: v.id, posizione, stato: "nuovo" as const, origine: "stimata" as const } : v) };
  return { pianta: risultato, evidenza: { tipo: "apertura", id: aggiunta.id },
    testo: `Porta ${porta.id} · spostamento di ${metri(distanza)}${daChiudere ? " · chiusura del vano esistente e apertura del nuovo" : ""}`,
    daVerificare: "Controlla luce netta, verso di apertura e percorso d’esodo sulla nuova geometria." };
}

function aggiungiZanzariera(pianta: Pianta, vista: C.Vista, istruzione: string): PassoChatDisegno | null {
  const richiesta = /^zanzariera(?:\s+(laterale|verticale|a rullo|pliss[eé]|battente|a incastro|incastro))?\s+(?:alla|sulla|per la)\s+(finestra|portafinestra)\s+(?:(?:di|del|della|in|nella|nel)\s+)?(.+?)(?:\s+sul\s+lato\s+(alto|basso|destro|sinistro))?$/iu.exec(istruzione);
  if (!richiesta) return null;
  const [, stile, tipo, nome, bordo] = richiesta;
  const locale = localeConNome(pianta, vista, nome);
  const r = riquadro(locale.contorno);
  const aperture = pianta.aperture.filter(a => {
    if (a.tipo !== tipo.toLowerCase() || a.stato === "da_demolire" && vista === "progetto" || !C.visibile(a.stato, vista) || !zanzarieraAmmessa(a.tipo)) return false;
    const muro = pianta.muri.find(m => m.id === a.muroId);
    if (!muro || !C.visibile(muro.stato, vista) || muro.stato === "da_demolire" && vista === "progetto") return false;
    const verticale = Math.abs(muro.p1.x - muro.p2.x) < 1, orizzontale = Math.abs(muro.p1.y - muro.p2.y) < 1;
    if (bordo && ({ alto: orizzontale && Math.abs(muro.p1.y - r.y0) <= 1, basso: orizzontale && Math.abs(muro.p1.y - r.y1) <= 1,
      destro: verticale && Math.abs(muro.p1.x - r.x1) <= 1, sinistro: verticale && Math.abs(muro.p1.x - r.x0) <= 1 })[bordo.toLowerCase()] !== true) return false;
    return latiSuMuro(locale, muro).some(l => a.posizione >= l.da && a.posizione <= l.a);
  });
  if (aperture.length !== 1) throw new Error(aperture.length ? "Ho trovato più serramenti. Specifica il lato oppure usa il pannello del serramento."
    : "Sul lato indicato non trovo un serramento di quel tipo. Indica la stanza e il lato dove si trova.");
  const a = aperture[0];
  const stileRichiesto = chiave(stile ?? "").replace(/^a\s+/, "");
  const tipoZanzariera = TIPI_ZANZARIERA.find(z => z === (stileRichiesto === "rullo" ? "verticale" : stileRichiesto)) ?? (a.tipo === "portafinestra" ? "laterale" : "verticale");
  const uguale = aperturaNellaVista(pianta, a, vista).zanzariera === tipoZanzariera;
  return { pianta: uguale ? pianta : C.impostaZanzariera(pianta, a.id, vista, tipoZanzariera), evidenza: { tipo: "apertura", id: a.id },
    testo: "Zanzariera · " + NOMI_ZANZARIERA[tipoZanzariera] + " · " + nomeLocale(pianta, vista, locale) + (uguale ? " · già presente" : "") };
}

function arredamentoEImpianti(pianta: Pianta, vista: C.Vista, istruzione: string, contesto?: ContestoChatDisegno): PassoChatDisegno | null {
  const arreda = /^(?:arreda\s+|(?:mobili|arredi)\s+(?:in|nel|nella|nello|per)\s+)(.+)$/iu.exec(istruzione);
  const impianto = /^impianto\s+(elettrico|idrico|idraulico)(?:\s+(?:(?:in|nel|nella|nello|per)\s+|nell['’])(.+))?$/iu.exec(istruzione);
  const singolo = /^(.+?)\s+(?:in|nel|nella|nello)\s+(.+)$/iu.exec(istruzione);
  const tipoChiesto = singolo && chiave(singolo[1]);
  const tipoSingolo = tipoChiesto === "letto" ? "letto_matrimoniale" : tipoChiesto === "lavandino" ? "lavabo" : tipoChiesto;
  const voce = tipoSingolo && CATALOGO.find(v => ["Bagno", "Cucina", "Camere", "Soggiorno"].includes(v.gruppo)
    && (chiave(v.nome) === tipoSingolo || v.tipo === tipoSingolo));
  if (!arreda && !impianto && !voce) return null;
  const richiestaImpianto = impianto?.[1].toLowerCase();
  const sistema = richiestaImpianto === "idraulico" ? "idrico" : richiestaImpianto;
  const nome = arreda?.[1] ?? impianto?.[2] ?? (voce ? singolo?.[2] : undefined);
  const tutti = !nome || /^(?:tutt[eo]\s+(?:le\s+stanze|il\s+piano|i\s+locali)|tutta\s+la\s+casa)$/iu.test(nome);
  const unitaRichiesta = impianto && /^unit[àa]\s+(.+)$/iu.exec(nome ?? "")?.[1].trim();
  const piano = contesto?.documento.livelli.find(l => l.id === contesto.livelloId) ?? contesto?.documento.livelli[0];
  const distribuzione = vista === "progetto" && piano?.proposte.find(p => p.id === contesto?.propostaId)?.distribuzioneBilocali;
  const localiDistribuiti: Locale[] | undefined = distribuzione ? localiDelProgetto(pianta, contesto).locali.map(l => ({
    id: l.id, nome: l.nome, destinazione: l.destinazione, altezza: l.altezza, finiture: l.finiture,
    aperto: l.aperto, unita: l.unita, contorno: l.contorno.map(p => ({ x: p.x, y: -p.y })), alFiloInterno: true,
    stato: "esistente", origine: l.origine,
  })) : undefined;
  const destinazione = (l: Locale) => (vista === "progetto" && pianta.nomiProgetto?.[l.id]?.destinazione) || l.destinazione;
  const unita = (l: Locale) => {
    const progetto = vista === "progetto" ? pianta.nomiProgetto?.[l.id]?.unita : undefined;
    return (progetto === undefined ? l.unita : progetto)?.trim().toLowerCase() ?? "";
  };
  const interno = (l: Locale) => eAmbienteInterno({ destinazione: destinazione(l), aperto: l.aperto });
  const eAttivo = (stato: Locale["stato"]) => C.visibile(stato, vista) && (vista === "fatto" || stato !== "da_demolire");
  const localiAttivi = (localiDistribuiti ?? pianta.locali).filter(l => interno(l) && eAttivo(l.stato));
  const locali = tutti || unitaRichiesta ? localiAttivi.filter(l => !unitaRichiesta || unita(l) === unitaRichiesta.toLowerCase())
    : [localeConNome(localiDistribuiti ? { ...pianta, locali: localiDistribuiti } : pianta, vista, nome)];
  const haCottura = (l: Locale) => (pianta.elementi ?? []).some(e => e.tipo === "cucina" && eAttivo(e.stato) && puntoNelPoligono(e.centro, l.contorno));
  const interessati = (tutti || unitaRichiesta) && sistema === "idrico" ? locali.filter(l => ["bagno", "lavanderia", "cucina"].includes(destinazione(l)) || haCottura(l)) : locali;
  if (!interessati.length || interessati.some(l => !interno(l))) throw new Error("Indica un ambiente interno con una destinazione riconoscibile sul piano corrente.");
  const aggiunti = new Set<string>();
  const saltati = new Set<string>();
  let risultato = pianta;
  const tavolaPosa = () => localiDistribuiti ? { ...risultato, locali: localiDistribuiti } : risultato;
  function raccogli(esito: EsitoArreda) {
    if (esito.aggiunti.length) risultato = localiDistribuiti ? { ...risultato, elementi: esito.pianta.elementi } : esito.pianta;
    esito.aggiunti.forEach(id => aggiunti.add(id));
    esito.saltati.forEach(n => saltati.add(n));
  }
  function posaPartenza(tipo: string, ambienti: Locale[]) {
    for (const l of ambienti) {
      const posata = arredaStanza(tavolaPosa(), l.id, vista, undefined, { programma: [{ tipo }] });
      if (posata.aggiunti.length) { raccogli(posata); return; }
    }
    saltati.add(CATALOGO.find(v => v.tipo === tipo)?.nome ?? tipo);
  }
  if (sistema) {
    const tipo = sistema === "elettrico" ? "quadro_elettrico" : "collettore";
    const compatibili = sistema === "elettrico" ? [tipo] : [tipo, "caldaia", "bollitore"];
    const ciSonoUnita = localiAttivi.some(l => unita(l));
    for (const sigla of new Set(interessati.map(unita))) {
      const gruppo = localiAttivi.filter(l => unita(l) === sigla);
      const posato = (risultato.elementi ?? []).some(e => eAttivo(e.stato) && compatibili.includes(e.tipo) &&
        (!ciSonoUnita || gruppo.some(l => puntoNelPoligono(e.centro, l.contorno))));
      const localiInteressati = interessati.filter(l => unita(l) === sigla);
      const origine = gruppo.find(l => destinazione(l) === (sistema === "idrico" ? "bagno" : "ingresso")) ??
        (sistema === "elettrico" ? gruppo.find(l => destinazione(l) === "soggiorno") : undefined) ?? localiInteressati[0];
      const partenza = [...new Set([origine, ...localiInteressati, ...gruppo])];
      if (!posato) posaPartenza(tipo, partenza);
      if (sistema !== "idrico") continue;
      const haColonna = (risultato.elementi ?? []).some(e => eAttivo(e.stato) && e.tipo === "colonna_scarico" &&
        (!ciSonoUnita || localiAttivi.some(l => (unita(l) === sigla || /comun|condominial|androne/i.test(unita(l))) && puntoNelPoligono(e.centro, l.contorno))));
      if (!haColonna) posaPartenza("colonna_scarico", [origine, ...localiInteressati.filter(l => l !== origine)]);
    }
  }
  for (const l of interessati) {
    if (sistema === "elettrico") raccogli(impiantoElettrico(tavolaPosa(), l.id, vista, destinazione(l)));
    else if (sistema === "idrico") {
      const presenti = (risultato.elementi ?? []).filter(e => eAttivo(e.stato) && puntoNelPoligono(e.centro, l.contorno));
      const sanitario = presenti.some(e => ["lavabo", "wc", "doccia", "vasca", "bidet", "lavatrice", "cucina"].includes(e.tipo));
      if (!sanitario) raccogli(arredaStanza(tavolaPosa(), l.id, vista, undefined, { programma: [{ tipo: "punto_acqua" }, { tipo: "scarico" }] }));
    } else {
      const tipo = destinazione(l);
      const nomeLocale = (vista === "progetto" ? pianta.nomiProgetto?.[l.id]?.nome : undefined) ?? l.nome;
      const tipoPerArredi = tipo === "altro" ? destinazioneDa(null, nomeLocale) : tipo;
      raccogli(arredaStanza(tavolaPosa(), l.id, vista, tipoPerArredi, voce ? { programma: [{ tipo: voce.tipo }] } : {}));
    }
  }
  const titolo = sistema === "idrico" ? "Impianto idrico e scarichi" : sistema === "elettrico" ? "Impianto elettrico" : voce ? voce.nome : "Arredi";
  const stato = aggiunti.size ? aggiunti.size + (aggiunti.size === 1 ? " elemento posato" : " elementi posati")
    : sistema ? "usa le dotazioni già presenti" : "nessun nuovo elemento da posare";
  if (aggiunti.size) risultato = { ...risultato, elementi: risultato.elementi!.map(e => aggiunti.has(e.id) ? { ...e, origine: "stimata" } : e) };
  const note = [sistema && "Percorsi e punti indicativi. Verifica sul posto partenze, passaggi e dimensionamento.",
    saltati.size && "Spazio da verificare per " + [...saltati].join(", ") + "."].filter(Boolean).join(" ");
  const ambito = unitaRichiesta ? `Unità ${unitaRichiesta} · ${interessati.length} ambienti`
    : tutti ? interessati.length + " ambienti sul piano" : nomeLocale(pianta, vista, interessati[0]);
  return { pianta: risultato, testo: titolo + " · " + ambito + " · " + stato,
    evidenza: tutti || unitaRichiesta ? undefined : { tipo: "locale", id: interessati[0].id }, mostraImpianti: !!sistema, daVerificare: note };
}

const areeChat: Record<string, TipoArea | undefined> = { prato: "prato", giardino: "prato", patio: "pavimentato", terrazzo: "pavimentato",
  pavimentazione: "pavimentato", vialetto: "vialetto", aiuola: "aiuola", parcheggio: "parcheggio", cortile: "pavimentato" };

function areaEsterna(pianta: Pianta, vista: C.Vista, istruzione: string): PassoChatDisegno | null {
  const richiesta = new RegExp(String.raw`^(${Object.keys(areeChat).join("|")})\s+(?:di\s+)?${COPPIA.source}\s+(.+)$`, "iu").exec(istruzione);
  if (!richiesta) return null;
  const [, nome, misuraX, misuraY, posizione] = richiesta;
  const riferimento = posizione.match(RIFERIMENTO);
  const w = misuraDaChat(misuraX), h = misuraDaChat(misuraY);
  if (!riferimento || !w || !h || Math.min(w, h) < 50 || Math.max(w, h) > 20000) throw new Error("Indica due lati e una posizione, ad esempio «Patio 4 × 2 m a destra della casa».");
  const muri = muriVisibili(pianta, vista);
  const confini = muri.flatMap(m => [m.p1, m.p2]);
  if (!confini.length) throw new Error("Disegna la casa prima di aggiungere un’area all’esterno.");
  const locale = !["casa", "edificio", "pianta"].includes(chiave(riferimento[2])) ? localeConNome(pianta, vista, riferimento[2]) : undefined;
  const r = riquadro(locale?.contorno ?? confini);
  const bordo = riferimento[1].toLowerCase();
  const margine = Math.max(...muri.map(m => m.spessore)) / 2;
  const x = bordo === "destra" ? r.x1 + margine : bordo === "sinistra" ? r.x0 - w - margine : r.x0;
  const y = bordo === "sotto" ? r.y1 + margine : bordo === "sopra" ? r.y0 - h - margine : r.y0;
  const contorno = C.rettangolo({ x, y }, { x: x + w, y: y + h });
  const aree = (pianta.aree ?? []).filter(a => C.visibile(a.stato, vista) && (vista === "fatto" || a.stato !== "da_demolire"));
  if (pianta.locali.some(l => C.visibile(l.stato, vista) && l.stato !== "da_demolire" && interniSovrapposti(contorno, l.contorno))
    || aree.some(a => a.tipo !== "lotto" && interniSovrapposti(contorno, a.contorno))) throw new Error("L’area si sovrappone a una zona esistente. Prova dal lato della casa con più spazio.");
  const lotti = aree.filter(a => a.tipo === "lotto");
  if (lotti.length && !lotti.some(a => contorno.every(p => puntoNelPoligono(p, a.contorno)))) throw new Error("L’area esce dal confine disegnato del lotto. Riduci le misure o cambia lato.");
  const titolo = nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase();
  const { pianta: nuova, id } = C.aggiungiArea(pianta, areeChat[nome.toLowerCase()]!, contorno, vista);
  return { pianta: C.modificaArea(nuova, id, { nome: titolo }), evidenza: { tipo: "area", id },
    testo: titolo + " · " + metri(w) + " × " + metri(h) + " · " + mq(w * h),
    daVerificare: "Controlla quota del terreno, accesso e distanze dal confine sul rilievo." };
}

function ridimensiona(pianta: Pianta, vista: C.Vista, locale: Locale, w: number, h: number) {
  if (!C.modificabile(locale.stato, vista)) throw new Error("Seleziona lo stato in cui la stanza è modificabile.");
  const c = locale.contorno;
  const orizzontale = c.findIndex((p, i) => Math.abs(p.y - c[(i + 1) % c.length].y) < .5);
  const verticale = c.findIndex((p, i) => Math.abs(p.x - c[(i + 1) % c.length].x) < .5);
  if (locale.aperto || locale.alFiloInterno || c.length !== 4 || orizzontale < 0 || verticale < 0 ||
    c.some((p, i) => Math.min(Math.abs(p.x - c[(i + 1) % c.length].x), Math.abs(p.y - c[(i + 1) % c.length].y)) >= .5)) {
    throw new Error("Per ridimensionare questa forma, seleziona una quota direttamente sulla pianta.");
  }
  const prima = misure(pianta, locale);
  const larghezza = Math.abs(prima.w - w) > .05 ? C.impostaLatoStanza(pianta, locale.id, orizzontale, w) : pianta;
  const cambiata = Math.abs(prima.h - h) > .05 ? C.impostaLatoStanza(larghezza, locale.id, verticale, h) : larghezza;
  const dopo = cambiata.locali.find(l => l.id === locale.id)!;
  const nuovaMisura = misure(cambiata, dopo);
  const altri = new Map(pianta.locali.filter(l => l.id !== locale.id).map(l => [l.id, l]));
  if (Math.abs(nuovaMisura.w - w) > 1 || Math.abs(nuovaMisura.h - h) > 1 || contornoIncrociato(dopo.contorno)
    || cambiata.locali.some(l => l.id !== locale.id && (l.contorno !== altri.get(l.id)?.contorno
      && JSON.stringify(l.contorno) !== JSON.stringify(altri.get(l.id)?.contorno) || interniSovrapposti(dopo.contorno, l.contorno)))) {
    throw new Error("La modifica interferisce con le stanze vicine o con una parete condivisa. Controlla le quote sulla pianta.");
  }
  const primaPerId = new Map(pianta.muri.map(m => [m.id, m]));
  const muri = cambiata.muri.map(muro => {
    const originale = primaPerId.get(muro.id);
    if (!originale || muro === originale) return muro;
    if (!C.modificabile(originale.stato, vista)) throw new Error("Una parete esistente verrebbe spostata. Verifica la variante nell’editor.");
    return { ...muro, origine: "stimata" as const, origineAltezza: originale.origineAltezza ?? originale.origine };
  });
  return cambiata === pianta ? pianta : { ...cambiata, muri };
}

function riepilogoLavori(pianta: Pianta, vista: C.Vista, contesto?: ContestoChatDisegno, soloImpianti = false): PassoChatDisegno {
  const documento = aPlanimetria(pianta, contesto?.documento, contesto?.livelloId, contesto?.propostaId);
  const livello = documento.livelli.find(l => l.id === contesto?.livelloId) ?? documento.livelli[0];
  const proposta = vista === "progetto" ? livello.proposte.find(p => p.id === (contesto?.propostaId ?? livello.proposte[0]?.id)) : undefined;
  const tavola = { ...documento, livelli: [livello] };
  if (proposta) {
    const { righe } = studioVariante(tavola, proposta.id);
    const voci = new Map<string, { descrizione: string; quantita: number; unita: string }>();
    const sospese = new Set<string>();
    for (const riga of righe) {
      if (soloImpianti && !riga.fase.startsWith("Impianti")) continue;
      if (riga.quantita === null) {
        if (riga.riferimento?.tipo === "muro" || riga.quantificazioneSospesa) sospese.add(`${riga.descrizione} · ${riga.criterio}`);
        continue;
      }
      const chiave = `${riga.descrizione} · ${riga.unita}`;
      const voce = voci.get(chiave);
      voci.set(chiave, { descrizione: riga.descrizione, quantita: (voce?.quantita ?? 0) + riga.quantita, unita: riga.unita });
    }
    const { puntiSenzaUnita } = percorsiImpianti(proposta);
    const daVerificare = soloImpianti ? [
      { criterio: "elettrico", tipo: eElementoElettrico, nota: "Elettrico · collega al fascicolo schema, circuiti, carichi, sezioni e protezioni." },
      { criterio: "scarichi", tipo: eElementoScarico, nota: "Scarichi · riporta nel fascicolo colonne, diametri, quote di innesto e pendenze." },
    ].filter(c => proposta.elementi.some(e => e.stato === "nuovo" && c.tipo(e.tipo))
      && !documento.urbanistica?.riscontriTecnici?.some(r => r.criterio === c.criterio && r.livelloId === livello.id
        && r.varianteId === proposta.id && r.esito === "riscontrato" && r.firma === firmaRiscontroTecnico(documento,r)))
      .map(c => c.nota).join(" ") : undefined;
    return { pianta, testo: [
      `${soloImpianti ? "Impianti" : "Riepilogo lavori"} · ${livello.nome}`,
      ...Array.from(voci.values(), v => `${v.descrizione} · ${v.quantita.toLocaleString("it-IT", { maximumFractionDigits: 2 })} ${v.unita}`),
      ...sospese,
      ...(puntiSenzaUnita.length ? [`Punti impiantistici fuori dai contorni assegnati · ${puntiSenzaUnita.length}`] : []),
      voci.size || sospese.size ? "Quantità preliminari del computo sul piano attivo." : "Aggiungi lavorazioni o punti di impianto nella variante per ricavare le quantità.",
    ].join("\n"), daVerificare };
  }
  const quantita = calcolaQuantita(tavola);
  const voci = [
    ["demolizioni.muri_mq", "Pareti da demolire", "m²"], ["costruzioni.muri_mq", "Pareti nuove", "m²"],
    ["aperture:da_demolire:porta.numero", "Porte da rimuovere", ""], ["aperture:nuovo:porta.numero", "Porte nuove", ""],
    ["impianti:elettrico.corrugato_ml", "Corrugato elettrico", "m"], ["impianti:elettrico.cavo_ml", "Cavo unipolare", "m"],
    ["impianti:acqua.tubo_ml", "Tubi acqua", "m"], ["impianti:scarico.tubo_ml", "Tubi scarico", "m"],
  ].flatMap(([chiave, nome, unita]) => {
    if (soloImpianti && !chiave.startsWith("impianti:")) return [];
    const q = quantita[`fatto:${chiave}`];
    if (!q || q.valore <= 0) return [];
    return [`${nome} · ${q.valore.toLocaleString("it-IT", { maximumFractionDigits: 2 })}${unita ? " " + unita : ""}`];
  });
  return { pianta, testo: [`${soloImpianti ? "Impianti" : "Riepilogo lavori"} · ${livello.nome}`, ...voci,
    voci.length ? "Quantità preliminari della tavola attiva." : "Aggiungi lavorazioni o punti di impianto per ricavare le quantità."].join("\n") };
}

function cercaScarico(pianta: Pianta, vista: C.Vista, istruzione: string, contesto?: ContestoChatDisegno): PassoChatDisegno {
  if (vista !== "progetto") throw new Error("Passa a Progetto per proporre un nuovo percorso dello scarico.");
  const doc = aPlanimetria(pianta, contesto?.documento, contesto?.livelloId, contesto?.propostaId);
  const livello = doc.livelli.find(l => l.id === contesto?.livelloId) ?? doc.livelli[0];
  const stato = livello.proposte.find(p => p.id === (contesto?.propostaId ?? livello.proposte[0]?.id));
  const scarichi = stato ? percorsiImpianti(stato).percorsi.filter(p => p.linea === "scarico") : [];
  if (!stato || !scarichi.length) throw new Error("Sulla variante servono una colonna e almeno un punto servito dallo scarico.");
  const unita = /\bunit[àa]\s+([\w-]+)/iu.exec(istruzione)?.[1]?.toLocaleLowerCase("it");
  const cucina = /\b(?:cucina|lavello)\b/iu.test(istruzione);
  const candidati = scarichi.flatMap(p => {
    const locale = stato.locali.find(l => puntoNelPoligono(p.a, l.contorno));
    if (unita && locale?.unita?.trim().toLocaleLowerCase("it") !== unita) return [];
    const oggetto = stato.elementi.find(e => e.id === p.aId);
    if (cucina && oggetto?.tipo !== "cucina") return [];
    const muri = muriChiusiSulPercorso(p,stato);
    return muri.length ? [{ p, muri, locale, oggetto }] : [];
  });
  const giaDisegnati = candidati.filter(c => c.p.vertici);
  const selezione = giaDisegnati.length ? giaDisegnati : candidati;
  if (!selezione.length) return { pianta, testo: "Nessun attraversamento di parete chiusa da evitare nei tratti selezionati." };
  if (selezione.length > 1) {
    const nomi = selezione.map(c => c.locale?.nome).filter(Boolean);
    throw new Error(`Ho trovato ${selezione.length} tratti. Indica l’unità o il punto servito${nomi.length ? " (" + [...new Set(nomi)].join(", ") + ")" : ""}.`);
  }
  const { p, muri, locale, oggetto } = selezione[0];
  const proposta = proponiPercorsoScarico(p,stato);
  const avvisoQuote = "Rileva la quota di fondo tubo al punto di scarico e all’innesto nella colonna sullo stesso riferimento. Verifica dislivello e pendenza su ogni tratto, spessore disponibile sotto i varchi, diametro e raccordi.";
  if (!proposta) return { pianta, testo: "Nessun percorso continuo trovato attraverso i varchi disegnati, entro i locali serviti.", daVerificare: avvisoQuote };
  const tracciati = (pianta.tracciatiImpianti ?? []).filter(t => chiaveTratto(t) !== chiaveTratto(p));
  const dopo: Pianta = { ...pianta, tracciatiImpianti: [
    ...tracciati, { linea:"scarico", daId:p.daId, aId:p.aId, vertici:(proposta.dopo.vertici ?? []).map(v=>({x:v.x,y:-v.y})) },
  ] };
  const quantita = (d: Planimetria) => studioVariante({ ...d, livelli: d.livelli.filter(l => l.id === livello.id) },stato.id).righe
    .find(r => r.id === `impianto-${livello.id}-impianti:scarico.tubo_ml`)?.quantita;
  const qPrima = quantita(doc), qDopo = quantita(aPlanimetria(dopo,doc,livello.id,stato.id));
  const nome = oggetto?.tipo === "cucina" ? "Lavello della cucina" : locale?.nome ?? "Scarico";
  return { pianta:dopo, mostraImpianti:true, confrontoScarico:{ prima:proposta.prima,dopo:proposta.dopo }, daVerificare:avvisoQuote,
    testo:[
      `Percorso alternativo · ${nome}`,
      `Attraversamenti di parete chiusa · ${muri.length} → 0`,
      `Sviluppo del tratto con calate stimate · ${metri(p.lunghezzaCm)} → ${metri(proposta.dopo.lunghezzaCm)}`,
      `Sviluppo orizzontale per verificare il dislivello · ${metri(proposta.orizzontaleCm)}`,
      ...(proposta.varchi.length ? [`Passaggi nei vani da riscontrare · ${proposta.varchi.join(", ")}`] : []),
      ...(qPrima != null && qDopo != null ? [`Computo del piano · Tubi di scarico ${formato.format(qPrima)} → ${formato.format(qDopo)} m`] : []),
    ].join("\n"),
  };
}

export function eseguiComandoChat(pianta: Pianta, vista: C.Vista, frase: string, contesto?: ContestoChatDisegno): PassoChatDisegno {
  const istruzione = frase.trim().replace(/^(?:e\s+)?(?:poi|quindi|infine)\s+/iu, "")
    .replace(/[.?!]+$/u, "").replace(VERBO, "").replace(ARTICOLO, "").replace(/^redner\b/iu,"render");
  if (/^(?:riepiloga\s+i\s+lavori|riepilogo\s+lavori|stima\s+lavori)$/iu.test(istruzione)) return riepilogoLavori(pianta, vista, contesto);
  if (/^(?:(?:controlla|verifica|riepiloga)\s+(?:gli\s+)?)?impianti$/iu.test(istruzione)) return riepilogoLavori(pianta, vista, contesto, true);
  if (/\bscaric[oi]\b/iu.test(istruzione) && /\b(?:proponi|trova|ridisegna|evita|ottimizza|cerca)\b/iu.test(istruzione)) return cercaScarico(pianta,vista,istruzione,contesto);
  const sport = sportRichiesti(istruzione);
  const foto = /\bfotorealistic[oaie]\b/iu.test(istruzione);
  const richiestaRender = (modo: RenderChatDisegno): VistaChatDisegno => foto ? `foto:${modo}` : modo;
  if (/^render\b/iu.test(istruzione) && (sport.length || /\bcampi\b|\bcentro\s+sportivo\b/iu.test(istruzione))) {
    const tipi = (pianta.elementi ?? []).filter(e=>C.visibile(e.stato,vista) && (vista==="fatto" || e.stato!=="da_demolire")).map(e=>e.tipo);
    const dichiarati = sport.length ? sport : tipi.filter(t=>definizioneCampo(t));
    if (!dichiarati.length || dichiarati.some(t=>!tipi.includes(t))) throw new Error("Aggiungi alla pianta i campi richiesti prima di aprire il render.");
    return { pianta, testo:foto ? "Render fotorealistico dei campi" : "Render 3D dei campi",
      vistaRichiesta:richiestaRender(sport.length === 1 ? `render:${sport[0]}` : "render-sport") };
  }
  if (sport.length && /^(?:camp[oi]\b|calcetto\b)/iu.test(istruzione)) {
    let disegno = pianta;
    const fatti = [];
    for (const tipo of sport) {
      const r = posaCampoDaChat(disegno,vista,tipo);
      disegno = r.pianta;
      fatti.push(r);
    }
    const unica = fatti.length === 1 ? fatti[0] : undefined;
    return { pianta:disegno, evidenza:unica ? {tipo:"elemento",id:unica.id} : undefined,
      testo:["Campi posati",...fatti.map(r=>`${r.campo.nome} · ${r.campo.gioco.map(metri).join(" × ")} di gioco`)].join("\n"),
      daVerificare:fatti.every(r=>r.nelLotto) ? "Controlla accessi, fasce libere e quote del terreno sul rilievo." : "Posizione di prova. Disegna il confine del lotto per verificare gli ingombri." };
  }
  const lotto = new RegExp(String.raw`^lotto\s+(?:di\s+)?${COPPIA.source}$`,"iu").exec(istruzione);
  if (lotto) {
    const unita = /(?:millimetr[io]|centimetr[io]|metr[io]|mm|cm|m)$/iu;
    const unitaComune = unita.exec(lotto[2])?.[0] ?? unita.exec(lotto[1])?.[0] ?? "m";
    const misuraLotto = (s: string) => misuraDaChat(unita.test(s) || /['’′"”″]|\b(?:ft|in)$/iu.test(s) ? s : `${s} ${unitaComune}`);
    const w = misuraLotto(lotto[1]), h = misuraLotto(lotto[2]);
    if (!w || !h || Math.min(w,h)<100) throw new Error("Indica due lati del lotto, ad esempio «Lotto 90 × 65 m».");
    if (pianta.muri.length || pianta.locali.length || pianta.aree?.length || pianta.elementi?.length) throw new Error("Per aggiungere un lotto a questo disegno, usa «Esterni» e indica i vertici del confine sulla pianta.");
    const r = C.aggiungiArea(pianta,"lotto",C.rettangolo({x:0,y:0},{x:w,y:h}),vista);
    return { pianta:r.pianta, evidenza:{tipo:"area",id:r.id}, testo:`Lotto di prova · ${metri(w)} × ${metri(h)}` };
  }
  const treD = /^(?:(?:in|vista|anteprima)\s+)?3\s*d(?:\s+(?:della casa|della pianta|del progetto))?$/iu.test(istruzione);
  const render = /^render(?:\s+(?:3d|locali|fotorealistic[oaie]))?(?:\s+(?:di\s+tutta\s+la\s+casa|della\s+casa|dell['’]intera\s+casa|di\s+tutte\s+le\s+stanze|dell['’]edificio))?$/iu.test(istruzione);
  const fabbricato = /^render\b.*\b(?:condominio|palazzina|facciata|edificio)\b/iu.test(istruzione);
  if (treD || render || fabbricato) {
    const haPianta = pianta.muri.length || pianta.locali.length || pianta.elementi?.length || pianta.aree?.length
      || contesto?.documento.livelli.some(l => l.fatto.muri.length || l.fatto.locali.length || l.fatto.elementi.length
      || vista === "progetto" && l.proposte.some(p => p.muri.length || p.locali.length || p.elementi.length));
    if (!haPianta) throw new Error("Disegna o importa la planimetria prima di aprire le viste 3D.");
    return { pianta, testo: treD ? "Anteprima 3D" : foto ? "Render fotorealistico dalla pianta"
      : fabbricato ? "Render 3D dell’edificio" : "Render 3D · Tutta la casa",
      vistaRichiesta: treD ? "3d" : richiestaRender(fabbricato ? "render-edificio" : "render") };
  }
  const progetto = aggiungiZanzariera(pianta, vista, istruzione) ?? arredamentoEImpianti(pianta, vista, istruzione, contesto) ?? areaEsterna(pianta, vista, istruzione);
  if (progetto) return progetto;
  const apertura = spostaPorta(pianta, vista, istruzione) ?? aggiungiApertura(pianta, vista, istruzione, contesto);
  if (apertura) return apertura;
  const spostamento = spostaTramezzoDaChat(pianta, vista, istruzione, contesto);
  if (spostamento) return spostamento;
  const tramezzo = modificaTramezzo(pianta, vista, istruzione, contesto);
  if (tramezzo) return tramezzo;
  if (QUOTE.test(istruzione)) return misuraLocaleInVista(pianta, vista, nomePulito(istruzione.replace(QUOTE, "")), contesto);
  const coppia = istruzione.match(COPPIA);
  if (!coppia || coppia.index === undefined || !coppia.index) throw new Error(
    "Prova «Misura cucina», «Arreda il soggiorno», «Impianto elettrico in cucina» o «Fai i render di tutta la casa». Per vani e pareti indica il lato o le stanze."
  );
  const w = misuraDaChat(coppia[1]), h = misuraDaChat(coppia[2]);
  if (!w || !h || Math.min(w, h) < 50 || Math.max(w, h) > 20_000) throw new Error("Scrivi due lati tra 0,50 e 200 m, con le unità.");
  const modifica = NOMI_MOVIMENTO.test(istruzione);
  const nome = nomePulito(istruzione.slice(0, coppia.index).replace(NOMI_MOVIMENTO, "").replace(DIMENSIONE, ""));
  if (!nome || nome.length > 80) throw new Error("Indica un nome breve per la stanza.");
  if (modifica) {
    const locale = localeConNome(pianta, vista, nome);
    const cambiata = ridimensiona(pianta, vista, locale, w, h);
    const dopo = cambiata.locali.find(l => l.id === locale.id)!;
    return { pianta: cambiata, evidenza: { tipo: "locale", id: locale.id }, testo: epilogoMisure(cambiata, dopo, vista) };
  }
  if (pianta.locali.some(l => C.visibile(l.stato, vista) && l.stato !== "da_demolire" && chiave(nomeLocale(pianta, vista, l)) === chiave(nome))) {
    // «Il disimpegno misura 3 × 1,2 m»: la stanza c'è già, quindi le misure sono una
    // correzione. Fino al 23/11/2026 qui si chiedeva di riscrivere «Ridimensiona …».
    const locale = localeConNome(pianta, vista, nome);
    const cambiata = ridimensiona(pianta, vista, locale, w, h);
    const dopo = cambiata.locali.find(l => l.id === locale.id)!;
    return { pianta: cambiata, evidenza: { tipo: "locale", id: locale.id }, testo: epilogoMisure(cambiata, dopo, vista) };
  }
  const posizione = istruzione.slice(coppia.index + coppia[0].length).trim();
  const riferimento = posizione.match(RIFERIMENTO);
  if (posizione && !riferimento) throw new Error("Per posizionare la stanza, indica «a destra della cucina», «a sinistra della cucina», «sopra» o «sotto».");
  const spessore = SPESSORE_TRAMEZZO;
  let origineIn: Punto | undefined;
  if (riferimento) {
    const esistente = localeConNome(pianta, vista, nomePulito(riferimento[2]));
    const r = riquadro(esistente.contorno);
    const verso = riferimento[1].toLowerCase();
    origineIn = {
      x: verso === "destra" ? r.x1 : verso === "sinistra" ? r.x0 - w - spessore : r.x0,
      y: verso === "sotto" ? r.y1 : verso === "sopra" ? r.y0 - h - spessore : r.y0,
    };
  } else {
    const occupati = [
      ...muriVisibili(pianta, vista).flatMap(m => [m.p1, m.p2]),
      ...pianta.locali.filter(l => C.visibile(l.stato, vista) && l.stato !== "da_demolire").flatMap(l => l.contorno),
    ];
    if (occupati.length) {
      const r = riquadro(occupati);
      origineIn = { x: r.x1 + 60, y: r.y0 };
    }
  }
  const prossima = C.aggiungiStanzaDaMisure(pianta, w, h, { origineIn, nome, destinazione: destinazioneDa(null, nome),
    stato: C.statoNuovo(vista), origine: "stimata" });
  const locale = prossima.pianta.locali.at(-1)!;
  const riscontro = misure(prossima.pianta, locale);
  if (pianta.locali.some(l => C.visibile(l.stato, vista) && l.stato !== "da_demolire" && interniSovrapposti(locale.contorno, l.contorno))) {
    throw new Error("In quella posizione c’è già una stanza. Scegli un altro lato.");
  }
  if (Math.abs(riscontro.w - w) > 1 || Math.abs(riscontro.h - h) > 1) {
    throw new Error("Lo spessore delle pareti esistenti cambia le misure interne. Usa il disegno con aggancio per questa stanza.");
  }
  return { pianta: prossima.pianta, evidenza: { tipo: "locale", id: prossima.id }, testo: epilogoMisure(prossima.pianta, locale, vista) };
}

/** Prepara soltanto operazioni eseguibili sull’editor. Ogni passaggio conserva la geometria risultante. */
export const istruzioniDaChat = (testo: string) => testo.split(TAGLIO).map(s => s.trim()).filter(Boolean);

export function comandiDaChatDisegno(pianta: Pianta, vista: C.Vista, testo: string, contesto?: ContestoChatDisegno): { passi: PassoChatDisegno[]; avvisi: string[] } {
  const passi: PassoChatDisegno[] = [], avvisi: string[] = [];
  let corrente = pianta;
  for (const riga of istruzioniDaChat(testo)) {
    try {
      const passo = eseguiComandoChat(corrente, vista, riga, contesto);
      corrente = passo.pianta;
      passi.push(passo);
      if (passo.daVerificare && !avvisi.includes(passo.daVerificare)) avvisi.push(passo.daVerificare);
      if (passo.confrontoTramezzo?.interferenze.length) break;
    } catch (e) {
      avvisi.push(`«${riga.slice(0, 110)}» · ${e instanceof Error ? e.message : "Comando non applicabile."}`);
    }
  }
  return { passi, avvisi };
}
