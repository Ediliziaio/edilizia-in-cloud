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
import { comandiDaChatDisegno, type PassoChatDisegno, type VistaChatDisegno } from "@/components/planimetrie/editor/comandiChat";
import { propostaChatApplicabile } from "@/components/planimetrie/editor/interventiChat";
import { messaggioParetiBloccate, paretiBloccateToccate } from "../../../shared/planimetrie/vincoli.ts";
import type { Locale, Planimetria, Proposta } from "../../../shared/planimetrie/modello.ts";
import { MASSIMO_AMBIENTI_CHAT } from "../../../shared/planimetrie/chatProgetto.ts";
import { statoPerAmbito } from "../../../shared/render-planimetria/vincoli.ts";
import { controllaAccessiPiano, type EsitoAccesso } from "./accessiPlanimetria";
import { idAmbienteChat, type AmbitoChatProgetto, type AnteprimaChatProgetto, type CambioVisibile, type PianoAnteprimaChat, type RiferimentoAmbienteChat } from "./chatProgetto";

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
 * Esegue la frase con le regole del disegno sulla variante che si sta preparando: la nuova se non
 * c'è un'anteprima aperta, altrimenti quella dell'anteprima, così più comandi si sommano. Non
 * chiama nessuna AI: se le regole non capiscono, `capito` è falso e decide chi chiama.
 */
export function eseguiDisegnoSullaScheda(documento: Planimetria, selezione: AmbitoChatProgetto, testo: string,
  precedente?: AnteprimaChatProgetto | null): EsitoDisegnoScheda {
  const id = precedente?.ambito.startsWith("progetto:") ? precedente.ambito.slice(9)
    : prossimaProposta({ proposte: documento.livelli.flatMap(l => l.proposte) });
  const nome = precedente?.nomeVariante ?? `Variante ${id} · Disegno`;
  const partenza = conVarianteSulPiano(precedente?.documento ?? documento, precedente?.ambito ?? selezione.ambito, selezione.livelloId, id, nome);
  const base = daPlanimetria(partenza, selezione.livelloId, id);
  const contesto = { documento: partenza, livelloId: selezione.livelloId, propostaId: id,
    selezione: selezione.localeId ? { tipo: "locale" as const, id: selezione.localeId } : null };
  const { passi, avvisi } = comandiDaChatDisegno(base, "progetto", testo, contesto);
  const viste = [...new Set(passi.flatMap(p => p.vistaRichiesta ? [p.vistaRichiesta] : []))];
  const sulDisegno = passi.filter(p => !p.vistaRichiesta);
  const fatti = [...new Set(sulDisegno.map(p => p.testo).filter(Boolean))];
  const esito: EsitoDisegnoScheda = { capito: passi.length > 0, anteprima: null, fatti, avvisi: [...avvisi], viste };
  const ultimo = sulDisegno.at(-1);
  if (!ultimo || ultimo.pianta === base) return esito;
  if (!propostaChatApplicabile(ultimo)) {
    esito.avvisi.push("Il tramezzo spostato urta altri elementi: correggi la misura o usa l’editor della planimetria.");
    return esito;
  }

  const risultato = aPlanimetria(ultimo.pianta, partenza, selezione.livelloId, id, base);
  const piano = risultato.livelli.find(l => l.id === selezione.livelloId)!;
  const prima = partenza.livelli.find(l => l.id === selezione.livelloId)!.proposte.find(p => p.id === id)!;
  const dopo = piano.proposte.find(p => p.id === id)!;
  const bloccate = paretiBloccateToccate(prima.muri, dopo.muri);
  if (bloccate.length) {
    esito.avvisi.push(messaggioParetiBloccate(bloccate));
    return esito;
  }
  const alloggio = risultato.ambitoDocumento === "alloggio" && risultato.livelli.length === 1;
  const accessi = controllaAccessiPiano(dopo, alloggio, piano.quota).ingressi.map((a): EsitoAccesso => ({
    localeId: `${piano.id}/${a.sigla}`, nome: a.sigla === "Alloggio" ? a.sigla : `Unità ${a.sigla}`,
    esito: a.tipo === "mancante" ? "assente" : a.ambientiScollegati.length ? "da_verificare" : "collegato",
    dettaglio: a.ambientiScollegati.length ? `Da collegare all’ingresso: ${a.ambientiScollegati.join(", ")}.` : undefined,
  }));
  const segni = evidenze(sulDisegno, ultimo.pianta);
  const vecchio = precedente?.piani.find(p => p.livelloId === piano.id);
  const pianoAnteprima: PianoAnteprimaChat = {
    livelloId: piano.id, nome: piano.nome, accessi,
    evidenzaLocali: [...new Set([...(vecchio?.evidenzaLocali ?? []), ...segni.evidenzaLocali])],
    evidenzaMuri: [...new Set([...(vecchio?.evidenzaMuri ?? []), ...segni.evidenzaMuri])],
  };
  const nuove: CambioVisibile[] = fatti.map(f => ({ etichetta: f, prima: "", dopo: "" }));
  esito.anteprima = {
    documento: risultato, ambito: `progetto:${id}`, livelloId: piano.id,
    localeId: pianoAnteprima.evidenzaLocali[0] ?? selezione.localeId,
    evidenzaLocali: pianoAnteprima.evidenzaLocali, evidenzaMuri: pianoAnteprima.evidenzaMuri,
    modifiche: [...(precedente?.modifiche ?? []), ...nuove],
    piani: [...(precedente?.piani ?? []).filter(p => p.livelloId !== piano.id), pianoAnteprima],
    comandi: precedente?.comandi ?? [], nomeVariante: nome, disegno: true,
  };
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
  return { ...silvio, documento, ambito: disegno.ambito, nomeVariante: disegno.nomeVariante, disegno: true,
    modifiche: [...disegno.modifiche, ...silvio.modifiche], piani, comandi: [...disegno.comandi, ...silvio.comandi] };
}
