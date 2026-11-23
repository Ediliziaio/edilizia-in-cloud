/**
 * Il coordinatore del preventivo.
 *
 * Prende le voci, prepara un contesto comune e fa partire INSIEME gli agenti che non dipendono l'uno
 * dall'altro (profilo, listini, storico, prezzari). Poi, voce per voce: abbina le fonti, sceglie il prezzo
 * secondo la priorità dell'azienda, calcola prezzo e margine con le regole del gestionale e passa tutto
 * al controllo finale. Nessuna chiamata AI: quello che qui si ripete uguale si fa con letture e regole.
 *
 * Rifare solo ciò che è cambiato: le letture restano in `memoria` (per agente, 10 minuti) e l'abbinamento
 * di una voce si riusa finché non cambiano codice, descrizione o unità. Cambiare una quantità o un prezzo
 * rifà solo i conti e i controlli. Un agente che fallisce non ferma gli altri: si dice quale manca, e al
 * giro dopo si rilegge solo quello.
 */
import { arrotondaDecimale } from "@/lib/computo/editorNativo";
import { corrispondenza, improntaVoce } from "./abbinamento";
import { agenteListini, agentePrezzari, agenteProfilo, agenteStorico, type DbLettura, type EsitoAgente, type RigaFonte } from "./agenti";
import { controlliFinali } from "./controlli";
import { marginePct, prezzoDaMargine, testoRegola } from "./prezzoVendita";
import {
  ETICHETTE_FONTE, PRIORITA_PREDEFINITA,
  type CandidatoPrezzo, type Controllo, type EsitoVoce, type NaturaPrezzo, type ProfiloAzienda, type PropostaVoce, type TipoFonte, type VoceRichiesta,
} from "./tipi";

export const MAX_VOCI_VERIFICA = 600;
const DURATA_MEMORIA_MS = 10 * 60_000;
/** Due prezzi validi che differiscono più di così sono un conflitto da mostrare, non un arrotondamento. */
export const TOLLERANZA_CONFLITTO_PCT = 5;

type Letto<T> = { dati: T; avvisi: string[]; lettoIl: number };
export interface MemoriaCoordinatore {
  chiave: string;
  profilo?: Letto<Omit<ProfiloAzienda, "listinoPresente">>;
  listini?: Letto<RigaFonte[]>;
  storico?: Letto<RigaFonte[]>;
  prezzari: Map<string, RigaFonte[]>;
  abbinamenti: Map<string, RigaFonte[]>;
}
export const memoriaVuota = (): MemoriaCoordinatore => ({ chiave: "", prezzari: new Map(), abbinamenti: new Map() });

export interface RichiestaVerifica {
  companyId: string;
  voci: VoceRichiesta[];
  /** Le fonti dichiarate sulle voci (testo libero dell'editor), per riconoscere il prezzario già scelto. */
  fontiDichiarate?: Record<string, string>;
  permessi: { costi: boolean };
  /** Giorno di oggi (AAAA-MM-GG): arriva da fuori, così la scadenza di un listino si può provare. */
  oggi: string;
  priorita?: readonly TipoFonte[];
  escludiPreventivo?: string;
}

export interface EsitoVerifica {
  voci: EsitoVoce[];
  controlli: Controllo[];
  profilo: ProfiloAzienda;
  misure: {
    ms: number; letture: number; chiamateAi: 0;
    vociTotali: number; abbinamentiRiusati: number; abbinamentiRifatti: number; agentiRiletti: string[];
    conFonte: number; conPrezzo: number; percentualeConFonte: number | null;
  };
  /** Gli agenti che non hanno risposto: il risultato vale lo stesso, ma senza le loro fonti. */
  mancanti: string[];
}

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const dataIt = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "senza data");
export const descriviCandidato = (c: CandidatoPrezzo) =>
  `${c.etichetta}${c.riferimento && !c.etichetta.includes(c.riferimento) ? ` · ${c.riferimento}` : ""}: ${euro.format(c.valore)}/${c.unita || "unità"} (${dataIt(c.data)}${c.scaduto ? ", scaduto" : ""})`;

/** Testo della fonte che resta sulla voce e può andare nel PDF: mai costi, mai nomi di fornitori. */
export function fonteLeggibile(c: CandidatoPrezzo): string {
  const base = c.tipo === "listino_aziendale" || c.tipo === "prezzario" || c.tipo === "storico" ? c.etichetta : ETICHETTE_FONTE[c.tipo];
  return [base, c.tipo !== "storico" && c.riferimento ? c.riferimento : "", c.data ? dataIt(c.data) : ""].filter(Boolean).join(" · ").slice(0, 500);
}

export function scegli(candidati: readonly CandidatoPrezzo[], natura: NaturaPrezzo, priorita: readonly TipoFonte[]): CandidatoPrezzo | null {
  const posto = (t: TipoFonte) => { const i = priorita.indexOf(t); return i < 0 ? priorita.length : i; };
  return [...candidati].filter(c => c.natura === natura && c.selezionabile).sort((a, b) =>
    Number(a.scaduto) - Number(b.scaduto) || posto(a.tipo) - posto(b.tipo) ||
    Number(b.corrispondenza === "codice") - Number(a.corrispondenza === "codice") ||
    (b.data ?? "").localeCompare(a.data ?? "") || a.id.localeCompare(b.id))[0] ?? null;
}

function conflitti(candidati: readonly CandidatoPrezzo[], scelto: CandidatoPrezzo | null, natura: NaturaPrezzo): string[] {
  if (!scelto) return [];
  const cosa = natura === "vendita" ? "prezzo" : "costo";
  return candidati.filter(c => c.natura === natura && c.selezionabile && !c.scaduto && c.id !== scelto.id && c.tipo !== scelto.tipo &&
    Math.abs(c.valore - scelto.valore) / scelto.valore * 100 > TOLLERANZA_CONFLITTO_PCT)
    .slice(0, 3).map(c => `Due fonti per il ${cosa}: ${descriviCandidato(scelto)} e ${descriviCandidato(c)}. Uso la prima per priorità.`);
}

function candidatiDellaVoce(voce: VoceRichiesta, righe: readonly RigaFonte[], fonteDichiarata: string): { candidati: CandidatoPrezzo[]; unitaDiverse: string[] } {
  const unitaDiverse: string[] = []; const candidati: CandidatoPrezzo[] = [];
  const dichiarata = fonteDichiarata.toLocaleLowerCase("it");
  for (const r of righe) {
    // Un prezzario vale solo se è quello già scritto sulla voce: lo stesso codice esiste in più regioni.
    if (r.tipo === "prezzario" && !dichiarata.includes(r.etichetta.toLocaleLowerCase("it"))) continue;
    const c = corrispondenza(voce, r);
    if (!c) continue;
    if (c.unitaDiversa) { unitaDiverse.push(`${r.etichetta}${r.riferimento ? ` · ${r.riferimento}` : ""} è a ${r.unita}, la voce a ${voce.unita}`); continue; }
    let { selezionabile, condizioni } = r;
    if (r.tipo === "storico" && voce.quantita !== null && voce.quantita > 0 && r.quantita !== null && r.quantita > 0 &&
      (r.quantita < voce.quantita / 2 || r.quantita > voce.quantita * 2)) {
      selezionabile = false; condizioni = [condizioni, "quantità molto diversa: non confrontabile"].filter(Boolean).join("; ");
    }
    const { codice: _codice, descrizione: _descrizione, quantita: _quantita, ...resto } = r;
    candidati.push({ ...resto, selezionabile, condizioni, corrispondenza: c.modo });
  }
  // Dello storico bastano i più recenti: cinque accettati e tre no dicono già tutto.
  const recenti = (lista: CandidatoPrezzo[], quanti: number) => lista.sort((a, b) => (b.data ?? "").localeCompare(a.data ?? "")).slice(0, quanti);
  const storico = candidati.filter(c => c.tipo === "storico");
  return {
    candidati: [...candidati.filter(c => c.tipo !== "storico"), ...recenti(storico.filter(c => c.selezionabile), 5), ...recenti(storico.filter(c => !c.selezionabile), 3)].slice(0, 16),
    unitaDiverse: [...new Set(unitaDiverse)].slice(0, 3),
  };
}

const uguali = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** Solo conti e regole: stesso ingresso, stessa uscita. Qui si decide cosa proporre e cosa lasciare stare. */
export function valutaVoce(voce: VoceRichiesta, candidati: CandidatoPrezzo[], profilo: ProfiloAzienda, opzioni: { costi: boolean; priorita: readonly TipoFonte[]; fonteDichiarata: string; unitaDiverse?: string[] }): EsitoVoce {
  const vendita = scegli(candidati, "vendita", opzioni.priorita);
  const costo = opzioni.costi ? scegli(candidati, "costo", opzioni.priorita) : null;
  const avvisi = (opzioni.unitaDiverse ?? []).map(t => `Stessa voce a un'altra unità di misura: ${t}. Prezzo non usato.`);
  const costoNoto = opzioni.costi ? voce.costo ?? costo?.valore ?? null : null;
  let proposta: PropostaVoce | null = null; let stato: EsitoVoce["stato"];
  const conCosto = (p: PropostaVoce | null): PropostaVoce | null => {
    if (!opzioni.costi || voce.costo !== null || !costo) return p;
    return { ...(p ?? { fonte: opzioni.fonteDichiarata, suManuale: false }), costo: costo.valore };
  };
  if (vendita) {
    if (vendita.scaduto) avvisi.push(`Il prezzo più affidabile è scaduto il ${dataIt(vendita.validoAl)}: ${descriviCandidato(vendita)}.`);
    if (voce.prezzo === null) { stato = "da_confermare"; proposta = { prezzo: vendita.valore, fonte: fonteLeggibile(vendita), suManuale: false }; }
    else if (uguali(voce.prezzo, vendita.valore)) {
      stato = vendita.scaduto ? "da_confermare" : "verificata";
      if (!opzioni.fonteDichiarata.trim() || voce.manuale) proposta = { fonte: fonteLeggibile(vendita), suManuale: false };
    } else {
      stato = voce.manuale ? "manuale" : "da_confermare";
      proposta = { prezzo: vendita.valore, fonte: fonteLeggibile(vendita), suManuale: voce.manuale };
    }
  } else if (voce.prezzo !== null) {
    // Un prezzo che c'è già e che nessuna fonte conferma: se una persona l'ha scritto resta suo, altrimenti si dice che non è stato ritrovato.
    stato = voce.manuale ? "manuale" : opzioni.fonteDichiarata.trim() ? "da_confermare" : "senza_fonte";
  } else if (costoNoto !== null && costoNoto > 0 && profilo.margineObiettivoPct !== null) {
    const regola = { tipo: "margine" as const, pct: profilo.margineObiettivoPct };
    const prezzo = prezzoDaMargine(costoNoto, regola.pct);
    stato = prezzo === null ? "senza_fonte" : "stima";
    if (prezzo !== null) proposta = { prezzo, fonte: "Prezzo calcolato dal costo, da confermare", regola: testoRegola(costoNoto, regola), suManuale: false };
  } else stato = "senza_fonte";
  proposta = conCosto(proposta);
  const prezzoFinale = proposta?.prezzo !== undefined && !proposta.suManuale ? proposta.prezzo : voce.prezzo;
  return {
    voceId: voce.id, stato, vendita, costo, candidati, proposta, avvisi,
    conflitti: [...conflitti(candidati, vendita, "vendita"), ...(opzioni.costi ? conflitti(candidati, costo, "costo") : [])],
    marginePct: opzioni.costi ? marginePct(costoNoto, prezzoFinale) : null,
  };
}

async function conMemoria<T>(nome: string, salvato: Letto<T> | undefined, adesso: number, leggi: () => Promise<EsitoAgente<T>>, riletti: string[], mancanti: string[], conta: (n: number) => void): Promise<Letto<T> | undefined> {
  if (salvato && adesso - salvato.lettoIl < DURATA_MEMORIA_MS) return salvato;
  try {
    const esito = await leggi();
    riletti.push(nome); conta(esito.letture);
    return { dati: esito.dati, avvisi: esito.avvisi, lettoIl: adesso };
  } catch {
    mancanti.push(nome);
    return undefined;
  }
}

export async function coordinaVerifica(richiesta: RichiestaVerifica, db: DbLettura, memoria: MemoriaCoordinatore = memoriaVuota(), orologio: () => number = () => Date.now()): Promise<EsitoVerifica> {
  const inizio = orologio();
  if (richiesta.voci.length > MAX_VOCI_VERIFICA) throw new Error(`La verifica lavora fino a ${MAX_VOCI_VERIFICA} voci: questo preventivo ne ha ${richiesta.voci.length}.`);
  const priorita = richiesta.priorita ?? PRIORITA_PREDEFINITA;
  const { costi } = richiesta.permessi;
  // La memoria vale per un'azienda e per un livello di permesso: mai i costi letti da uno a chi non li vede.
  const chiave = `${richiesta.companyId}|${costi ? "costi" : "senza"}|${richiesta.escludiPreventivo ?? ""}`;
  if (memoria.chiave !== chiave) Object.assign(memoria, memoriaVuota(), { chiave, profilo: undefined, listini: undefined, storico: undefined });
  let letture = 0; const riletti: string[] = []; const mancanti: string[] = [];
  const conta = (n: number) => { letture += n; };
  const fontiDichiarate = richiesta.fontiDichiarate ?? {};
  const codiciPrezzario = richiesta.voci.filter(v => v.codice.trim() && (fontiDichiarate[v.id] ?? "").trim()).map(v => v.codice.trim()).filter(c => !memoria.prezzari.has(c));

  const [profilo, listini, storico, prezzari] = await Promise.all([
    conMemoria("impostazioni dei preventivi", memoria.profilo, inizio, () => agenteProfilo(db, richiesta.companyId), riletti, mancanti, conta),
    conMemoria("listini", memoria.listini, inizio, () => agenteListini(db, richiesta.companyId, { costi, oggi: richiesta.oggi }), riletti, mancanti, conta),
    conMemoria("storico dei preventivi", memoria.storico, inizio, () => agenteStorico(db, richiesta.companyId, { oggi: richiesta.oggi, escludiPreventivo: richiesta.escludiPreventivo }), riletti, mancanti, conta),
    codiciPrezzario.length ? conMemoria("prezzari", undefined, inizio, () => agentePrezzari(db, codiciPrezzario), riletti, mancanti, conta) : Promise.resolve(undefined),
  ]);
  const fontiCambiate = riletti.some(n => n === "listini" || n === "storico dei preventivi" || n === "prezzari");
  memoria.profilo = profilo; memoria.listini = listini; memoria.storico = storico;
  if (prezzari) {
    for (const c of codiciPrezzario) memoria.prezzari.set(c, []);
    for (const r of prezzari.dati) memoria.prezzari.set(r.codice, [...(memoria.prezzari.get(r.codice) ?? []), r]);
  }
  // Fonti rilette = abbinamenti da rifare; fonti in memoria = si rifanno solo le voci cambiate.
  if (fontiCambiate) memoria.abbinamenti.clear();
  const righe = [...(listini?.dati ?? []), ...(storico?.dati ?? []), ...[...memoria.prezzari.values()].flat()];
  const profiloCompleto: ProfiloAzienda = {
    margineObiettivoPct: profilo?.dati.margineObiettivoPct ?? null, margineMinimoPct: profilo?.dati.margineMinimoPct ?? null,
    listinoPresente: (listini?.dati ?? []).some(r => r.tipo === "listino_aziendale"),
  };

  let riusati = 0, rifatti = 0;
  const esiti = richiesta.voci.map(voce => {
    const fonteDichiarata = fontiDichiarate[voce.id] ?? "";
    const impronta = `${improntaVoce(voce)}|${fonteDichiarata.toLocaleLowerCase("it")}`;
    let abbinate = memoria.abbinamenti.get(impronta);
    if (abbinate) riusati++;
    else { abbinate = righe.filter(r => corrispondenza(voce, r) !== null); memoria.abbinamenti.set(impronta, abbinate); rifatti++; }
    const { candidati, unitaDiverse } = candidatiDellaVoce(voce, abbinate, fonteDichiarata);
    return valutaVoce(voce, candidati, profiloCompleto, { costi, priorita, fonteDichiarata, unitaDiverse });
  });

  const controlli = controlliFinali(richiesta.voci, esiti, profiloCompleto, { costi });
  for (const a of [...(listini?.avvisi ?? []), ...(storico?.avvisi ?? [])]) controlli.push({ gravita: "avviso", codice: "lettura_parziale", voceId: null, testo: a });
  for (const m of mancanti) controlli.push({ gravita: "avviso", codice: "agente_mancante", voceId: null, testo: `Non sono riuscito a leggere: ${m}. Il resto vale; riprova per completare.` });

  const conPrezzo = richiesta.voci.filter((v, i) => v.prezzo !== null || esiti[i].proposta?.prezzo !== undefined).length;
  const conFonte = esiti.filter((e, i) => e.vendita !== null || e.stato === "stima" || (richiesta.voci[i].prezzo !== null && !richiesta.voci[i].manuale && !!(fontiDichiarate[e.voceId] ?? "").trim())).length;
  return {
    voci: esiti, controlli, profilo: profiloCompleto, mancanti,
    misure: {
      ms: orologio() - inizio, letture, chiamateAi: 0, vociTotali: richiesta.voci.length,
      abbinamentiRiusati: riusati, abbinamentiRifatti: rifatti, agentiRiletti: riletti, conFonte, conPrezzo,
      percentualeConFonte: richiesta.voci.length ? arrotondaDecimale(conFonte / richiesta.voci.length * 100, 1) : null,
    },
  };
}
