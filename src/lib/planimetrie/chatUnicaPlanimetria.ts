/**
 * Una sola chat sulla scheda della planimetria (24/11/2026). Prima c'erano due chat: quella del
 * disegno, nell'editor, che esegue comandi a regole; e Silvio sulla scheda, che risponde alle
 * domande e propone finiture, nomi e tramezzi per ambiente. Adesso sulla scheda si scrive in un
 * posto solo e la frase segue questa strada:
 *
 *   1. le regole del disegno (gratis): «Porta tra cucina e soggiorno da 80 cm»;
 *   2. se le regole non la capiscono e non è una domanda, l'interprete la riscrive in comandi
 *      (poco, a consumo): «fammi una porticina da ottanta fra camera e corridoio»;
 *   3. le domande sul progetto e ciò che il disegno non sa fare (finiture, nomi, «si può?»)
 *      vanno a Silvio, come prima (un credito render).
 *
 * I comandi del disegno non toccano la pianta: producono una variante nuova, con la stessa
 * anteprima, lo stesso costo e lo stesso «Salva come variante» delle proposte di Silvio.
 */
import { aPlanimetria, daPlanimetria, prossimaProposta, type Pianta } from "@/components/planimetrie/editor/adattatore";
import type { PassoChatDisegno, VistaChatDisegno } from "@/components/planimetrie/editor/comandiChat";
import { piantaDaApplicare, preparaInterventi, selezionatiInterventi, togliIntervento, type RevisioneInterventi } from "@/components/planimetrie/editor/interventiChat";
import type { Selezione } from "@/components/planimetrie/editor/TelaPlanimetria";
import { messaggioParetiBloccate, paretiBloccateToccate } from "../../../shared/planimetrie/vincoli.ts";
import type { Locale, Planimetria, Proposta } from "../../../shared/planimetrie/modello.ts";
import { MASSIMO_AMBIENTI_CHAT } from "../../../shared/planimetrie/chatProgetto.ts";
import { statoPerAmbito } from "../../../shared/render-planimetria/vincoli.ts";
import { controllaAccessiPiano, type EsitoAccesso } from "./accessiPlanimetria";
import { idAmbienteChat, type AmbitoChatProgetto, type AnteprimaChatProgetto, type PianoAnteprimaChat, type RevisioneDisegno, type RiferimentoAmbienteChat } from "./chatProgetto";

export interface EsitoDisegnoScheda {
  /** Le regole hanno riconosciuto almeno un comando (anche solo una misura o il 3D). */
  capito: boolean;
  anteprima: AnteprimaChatProgetto | null;
  fatti: string[];
  avvisi: string[];
  viste: VistaChatDisegno[];
}

const normalizza = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("it").replace(/[’']/g, " ");

/**
 * Una domanda sul progetto, da mandare a Silvio senza passare dall'interprete. Le regole hanno
 * già avuto la loro occasione: qui arrivano solo le frasi che non hanno capito.
 */
export function sembraDomanda(testo: string): boolean {
  const t = normalizza(testo.trim());
  if (/\?\s*$/.test(t)) return true;
  return /^(?:quant[oaie]|qual[ei]?|com e|come|perche|dove|cosa|che cosa|si puo|si potrebbe|posso|e possibile|serve|servono|c e|ci sono|e a norma|e conforme|verifica|controlla|spiega|dimmi|confronta|analizza|aiutami)\b/.test(t);
}

/** Gli ambienti del piano che la frase nomina, il più lungo per primo («Camera matrimoniale» prima di «Camera»). */
export function ambientiNominati(locali: readonly Locale[], testo: string): Locale[] {
  const frase = ` ${normalizza(testo).replace(/[^a-z0-9]+/g, " ")} `;
  const visti = new Set<string>();
  return [...locali].sort((a, b) => b.nome.length - a.nome.length).filter(l => {
    const nome = normalizza(l.nome).replace(/[^a-z0-9]+/g, " ").trim();
    if (!nome || visti.has(nome) || !frase.includes(` ${nome} `)) return false;
    visti.add(nome);
    return true;
  });
}

/**
 * Su quali ambienti chiedere a Silvio. Se nessuna stanza è scelta si parte da quelle nominate
 * nella frase, altrimenti da tutto il piano; se la frase nomina una stanza fuori dal gruppo,
 * per quella domanda entra anche lei. Prima, senza una stanza scelta la chat era spenta.
 */
export function selezionePerDomanda(selezione: AmbitoChatProgetto, locali: readonly Locale[], testo: string): AmbitoChatProgetto | null {
  const nominati = ambientiNominati(locali, testo);
  const scelto = selezione.localeId ? selezione : (() => {
    const primo = nominati[0] ?? locali[0];
    if (!primo) return null;
    const resto = (nominati.length ? nominati : locali).filter(l => l.id !== primo.id);
    return { ...selezione, localeId: primo.id, altri: resto.map(l => ({ livelloId: selezione.livelloId, localeId: l.id })) };
  })();
  if (!scelto) return null;
  const presenti = new Set([idAmbienteChat(scelto), ...(scelto.altri ?? []).map(idAmbienteChat)]);
  const aggiunti: RiferimentoAmbienteChat[] = nominati.map(l => ({ livelloId: selezione.livelloId, localeId: l.id })).filter(r => !presenti.has(idAmbienteChat(r)));
  return { ...scelto, altri: [...(scelto.altri ?? []), ...aggiunti].slice(0, MASSIMO_AMBIENTI_CHAT - 1) };
}

/** I nomi che l'interprete deve usare: gli ambienti del piano nella variante che si guarda. */
export function nomiAmbientiDelPiano(documento: Planimetria, livelloId: string, ambito: string): string[] {
  const piano = documento.livelli.find(l => l.id === livelloId);
  if (!piano) return [];
  return (statoPerAmbito(documento, piano.id, ambito) ?? piano.fatto).locali.map(l => l.nome);
}

/** Il documento con la variante `id` su questo piano, copiata dallo stato di partenza se non c'è ancora. */
function conVarianteSulPiano(documento: Planimetria, origine: string, livelloId: string, id: string, nome: string): Planimetria {
  const materiali = documento.materialiProgetto?.[origine];
  const conMateriali = materiali && !documento.materialiProgetto?.[`progetto:${id}`]
    ? { ...documento, materialiProgetto: { ...documento.materialiProgetto, [`progetto:${id}`]: materiali } } : documento;
  return {
    ...conMateriali,
    livelli: conMateriali.livelli.map(livello => {
      if (livello.proposte.some(p => p.id === id)) return livello;
      const partenza = livello.proposte.find(p => origine === `progetto:${p.id}`);
      if (!partenza && livello.id !== livelloId) return livello;
      const copia: Proposta = { ...structuredClone(partenza ?? livello.fatto), id, nome };
      return { ...livello, proposte: [...livello.proposte, copia] };
    }),
  };
}

function evidenze(passi: readonly PassoChatDisegno[], pianta: Pianta) {
  const locali = new Set<string>(), muri = new Set<string>();
  for (const { evidenza } of passi) {
    if (evidenza?.tipo === "locale") locali.add(evidenza.id);
    else if (evidenza?.tipo === "muro") muri.add(evidenza.id);
    else if (evidenza?.tipo === "apertura") {
      const apertura = pianta.aperture.find(a => a.id === evidenza.id);
      if (apertura) muri.add(apertura.muroId);
    }
  }
  return { evidenzaLocali: [...locali], evidenzaMuri: [...muri] };
}

/**
 * L'anteprima che corrisponde alla revisione degli interventi: le sole richieste spuntate, con i
 * prezzi scritti a mano. Null se non resta niente da mostrare.
 */
export function anteprimaDaRevisione(rd: RevisioneDisegno, nome: string, comandi: AnteprimaChatProgetto["comandi"] = []): AnteprimaChatProgetto | null {
  const { revisione, partenza, livelloId, id } = rd;
  const attivi = selezionatiInterventi(revisione).filter(i => i.passo && !i.errore);
  if (!attivi.length && !rd.modificheFisse.length) return null;
  const contesto = { documento: partenza, livelloId, propostaId: id };
  const pianta = piantaDaApplicare({ pianta: revisione.piantaValida, testo: "", revisioneInterventi: revisione }, contesto);
  const documento = aPlanimetria(pianta, partenza, livelloId, id, revisione.base);
  const piano = documento.livelli.find(l => l.id === livelloId)!;
  const prima = partenza.livelli.find(l => l.id === livelloId)!.proposte.find(p => p.id === id)!;
  const dopo = piano.proposte.find(p => p.id === id)!;
  const bloccate = paretiBloccateToccate(prima.muri, dopo.muri);
  const urta = attivi.find(i => i.passo?.confrontoTramezzo?.interferenze.length);
  const alloggio = documento.ambitoDocumento === "alloggio" && documento.livelli.length === 1;
  const accessi = controllaAccessiPiano(dopo, alloggio, piano.quota).ingressi.map((a): EsitoAccesso => ({
    localeId: `${piano.id}/${a.sigla}`, nome: a.sigla === "Alloggio" ? a.sigla : `Unità ${a.sigla}`,
    esito: a.tipo === "mancante" ? "assente" : a.ambientiScollegati.length ? "da_verificare" : "collegato",
    dettaglio: a.ambientiScollegati.length ? `Da collegare all’ingresso: ${a.ambientiScollegati.join(", ")}.` : undefined,
  }));
  const segni = evidenze(attivi.flatMap(i => i.passo ? [i.passo] : []), pianta);
  const fisso = rd.pianiFissi.find(p => p.livelloId === livelloId);
  const pianoAnteprima: PianoAnteprimaChat = {
    livelloId, nome: piano.nome, accessi,
    evidenzaLocali: [...new Set([...(fisso?.evidenzaLocali ?? []), ...segni.evidenzaLocali])],
    evidenzaMuri: [...new Set([...(fisso?.evidenzaMuri ?? []), ...segni.evidenzaMuri])],
  };
  return {
    documento, ambito: `progetto:${id}`, livelloId,
    localeId: pianoAnteprima.evidenzaLocali[0] ?? "",
    evidenzaLocali: pianoAnteprima.evidenzaLocali, evidenzaMuri: pianoAnteprima.evidenzaMuri,
    modifiche: [...rd.modificheFisse, ...attivi.map(i => ({ etichetta: i.passo!.testo, prima: "", dopo: "" }))],
    piani: [...rd.pianiFissi.filter(p => p.livelloId !== livelloId), pianoAnteprima],
    comandi, nomeVariante: nome, disegno: true, revisioneDisegno: rd,
    ...(bloccate.length ? { bloccata: messaggioParetiBloccate(bloccate) }
      : urta ? { bloccata: "Un tramezzo spostato urta altri elementi: correggi la quota nella scheda «Interventi» o togli la spunta." } : {}),
  };
}

/** Le spunte o i prezzi cambiati dalla scheda «Interventi» / «Computo». */
export function aggiornaRevisioneDisegno(anteprima: AnteprimaChatProgetto, revisione: RevisioneInterventi): AnteprimaChatProgetto | null {
  const rd = anteprima.revisioneDisegno;
  return rd ? anteprimaDaRevisione({ ...rd, revisione }, anteprima.nomeVariante, anteprima.comandi) : anteprima;
}

/** «Annulla l'ultimo»: toglie l'ultimo comando del disegno dalla variante in preparazione. */
export function annullaUltimoDisegno(anteprima: AnteprimaChatProgetto): { anteprima: AnteprimaChatProgetto | null; tolto?: string } {
  const rd = anteprima.revisioneDisegno;
  const ultimo = rd?.revisione.interventi.at(-1);
  if (!rd || !ultimo) return { anteprima };
  const revisione = togliIntervento(rd.revisione, "progetto", { documento: rd.partenza, livelloId: rd.livelloId, propostaId: rd.id }, ultimo.richiesta.id);
  return { anteprima: anteprimaDaRevisione({ ...rd, revisione }, anteprima.nomeVariante, anteprima.comandi), tolto: ultimo.richiesta.frase };
}

/** «annulla», «annulla l'ultimo», «togli l'ultimo comando»… */
export const eAnnullaUltimo = (testo: string) =>
  /^(?:annulla|togli|elimina|cancella)(?: (?:l ?)?ultim[oa](?: (?:comando|modifica|intervento))?)?$/.test(normalizza(testo.trim()).replace(/[.!\s]+$/, "").replace(/\s+/g, " "));

/**
 * Esegue la frase con le regole del disegno sulla variante che si sta preparando: la nuova se non
 * c'è un'anteprima aperta, altrimenti quella dell'anteprima, così più comandi si sommano. Come
 * nell'editor, ogni comando diventa un intervento della revisione (spunte, prezzi, annulla). Non
 * chiama nessuna AI: se le regole non capiscono, `capito` è falso e decide chi chiama.
 */
export function eseguiDisegnoSullaScheda(documento: Planimetria, selezione: AmbitoChatProgetto, testo: string,
  precedente?: AnteprimaChatProgetto | null, oggetto?: Selezione | null): EsitoDisegnoScheda {
  const continua = precedente?.revisioneDisegno?.livelloId === selezione.livelloId ? precedente.revisioneDisegno : undefined;
  const id = continua?.id ?? (precedente?.ambito.startsWith("progetto:") ? precedente.ambito.slice(9)
    : prossimaProposta({ proposte: documento.livelli.flatMap(l => l.proposte) }));
  const nome = precedente?.nomeVariante ?? `Variante ${id} · Disegno`;
  const partenza = continua?.partenza
    ?? conVarianteSulPiano(precedente?.documento ?? documento, precedente?.ambito ?? selezione.ambito, selezione.livelloId, id, nome);
  const base = continua?.revisione.base ?? daPlanimetria(partenza, selezione.livelloId, id);
  // Come nell'editor: il comando senza nomi vale per l'oggetto scelto (una stanza, una parete),
  // con «Tutto il piano» per il piano intero.
  const scelto = oggetto !== undefined ? oggetto : selezione.localeId && !selezione.altri?.length ? { tipo: "locale" as const, id: selezione.localeId } : null;
  const contesto = { documento: partenza, livelloId: selezione.livelloId, propostaId: id, selezione: scelto };
  const { revisione, passi, avvisi } = preparaInterventi(base, "progetto", testo, contesto, continua?.revisione);
  const viste = [...new Set(passi.flatMap(p => p.vistaRichiesta ? [p.vistaRichiesta] : []))];
  const sulDisegno = passi.filter(p => !p.vistaRichiesta);
  const fatti = [...new Set(sulDisegno.map(p => p.testo).filter(Boolean))];
  const esito: EsitoDisegnoScheda = { capito: passi.length > 0, anteprima: null, fatti, avvisi: [...avvisi], viste };
  if (!sulDisegno.some(p => p.pianta !== base && revisione.interventi.some(i => i.passo === p))) return esito;
  const rd: RevisioneDisegno = continua ? { ...continua, revisione } : {
    revisione, partenza, livelloId: selezione.livelloId, id,
    modificheFisse: precedente?.modifiche ?? [], pianiFissi: precedente?.piani ?? [],
  };
  esito.anteprima = anteprimaDaRevisione(rd, nome, precedente?.comandi);
  if (esito.anteprima?.bloccata) esito.avvisi.push(esito.anteprima.bloccata);
  return esito;
}

/**
 * Una proposta di Silvio fatta sopra un'anteprima del disegno: Silvio l'ha costruita come variante
 * nuova copiata da quella dell'anteprima. Qui la variante dell'anteprima si toglie e la nuova
 * prende il suo posto e il suo nome, così si salva una variante sola con tutte le modifiche.
 */
export function unisciAlDisegno(disegno: AnteprimaChatProgetto, silvio: AnteprimaChatProgetto): AnteprimaChatProgetto {
  const vecchio = disegno.ambito.slice(9), nuovo = silvio.ambito.slice(9);
  const { [`progetto:${nuovo}`]: _copia, ...materiali } = silvio.documento.materialiProgetto ?? {};
  const documento: Planimetria = {
    ...silvio.documento,
    ...(silvio.documento.materialiProgetto ? { materialiProgetto: materiali } : {}),
    livelli: silvio.documento.livelli.map(l => ({
      ...l,
      proposte: l.proposte.filter(p => p.id !== vecchio).map(p => p.id === nuovo ? { ...p, id: vecchio, nome: disegno.nomeVariante } : p),
    })),
  };
  const piani = [...disegno.piani.filter(p => !silvio.piani.some(s => s.livelloId === p.livelloId)), ...silvio.piani];
  // I comandi del disegno si fondono con la proposta di Silvio: da qui non si tolgono più uno per uno.
  return { ...silvio, documento, ambito: disegno.ambito, nomeVariante: disegno.nomeVariante, disegno: true, revisioneDisegno: undefined, bloccata: disegno.bloccata,
    modifiche: [...disegno.modifiche, ...silvio.modifiche], piani, comandi: [...disegno.comandi, ...silvio.comandi] };
}
