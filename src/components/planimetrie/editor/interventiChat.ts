import { aPlanimetria, ID_PROPOSTA, prossimaProposta, type Pianta } from "./adattatore";
import type { Planimetria, PrezzoVocePlanimetria } from "../../../../shared/planimetrie/modello.ts";
import { studioVariante } from "@/lib/planimetrie/studioImmobiliare";
import type { Vista } from "./comandi";
import { eseguiComandoChat, istruzioniDaChat, type ContestoChatDisegno, type PassoChatDisegno } from "./comandiChat";
import { direzione } from "./geometria";
import type { Selezione } from "./TelaPlanimetria";
import { traslaTramezzo } from "./traslaTramezzo";

export interface RichiestaIntervento {
  id: number;
  frase: string;
  selezionata: boolean;
  riferimento?: Selezione | null;
}

export interface InterventoChat {
  richiesta: RichiestaIntervento;
  prima: Pianta;
  passo?: PassoChatDisegno;
  errore?: string;
  /** Resta disponibile per correggere la quota se una prova successiva perde un appoggio. */
  ultimoSpostamento?: PassoChatDisegno["confrontoTramezzo"];
}

export interface RevisioneInterventi {
  base: Pianta;
  interventi: InterventoChat[];
  piantaValida: Pianta;
  prezzi?: Record<string, PrezzoVocePlanimetria>;
}

const messaggio = (e: unknown) => e instanceof Error ? e.message : "Comando non applicabile.";
const interferisce = (p?: PassoChatDisegno) => !!p?.confrontoTramezzo?.interferenze.length;
export const selezionatiInterventi = (r: RevisioneInterventi) => r.interventi.filter(i => i.richiesta.selezionata);
export const interventiApplicabili = (r: RevisioneInterventi) => r.piantaValida !== r.base &&
  selezionatiInterventi(r).every(i => !!i.passo && !i.errore && !interferisce(i.passo));
export const propostaChatApplicabile = (p: PassoChatDisegno) => !interferisce(p)
  && (!p.revisioneInterventi || interventiApplicabili(p.revisioneInterventi));

function eseguiInterventi(base: Pianta, vista: Vista, richieste: RichiestaIntervento[], contesto: ContestoChatDisegno,
  precedente?: RevisioneInterventi) {
  const note: string[] = [], passi: PassoChatDisegno[] = [], interventi: InterventoChat[] = [];
  const giaVisti = new Map(precedente?.interventi.map(i => [i.richiesta.id, i]));
  let corrente = base;
  for (const richiesta of richieste) {
    const prima = corrente;
    const vecchio = giaVisti.get(richiesta.id);
    if (!richiesta.selezionata) {
      interventi.push({ ...vecchio, richiesta, prima: vecchio?.prima ?? prima });
      continue;
    }
    try {
      const passo = vecchio?.prima === prima && vecchio.richiesta.frase === richiesta.frase && vecchio.passo && !vecchio.errore
        ? vecchio.passo
        : eseguiComandoChat(prima, vista, richiesta.frase, { ...contesto, selezione: richiesta.riferimento });
      if (!vecchio || vecchio.passo !== passo) passi.push(passo);
      if (passo.daVerificare) note.push(passo.daVerificare);
      if (passo.pianta === prima) {
        if (vecchio) interventi.push({ richiesta, prima, errore: "Rivedi l’intervento con le modifiche selezionate.", ultimoSpostamento: vecchio.ultimoSpostamento });
        continue;
      }
      interventi.push({ richiesta, prima, passo, ultimoSpostamento: passo.confrontoTramezzo });
      // Una geometria in conflitto si mostra in anteprima e resta fuori dal calcolo degli interventi successivi.
      if (!interferisce(passo)) corrente = passo.pianta;
    } catch (e) {
      const errore = messaggio(e);
      if (vecchio) interventi.push({ richiesta, prima, errore, ultimoSpostamento: vecchio.ultimoSpostamento });
      else {
        interventi.push({ richiesta: { ...richiesta, selezionata: false }, prima, errore });
        note.push(`«${richiesta.frase.slice(0, 110)}» · ${errore}`);
      }
    }
  }
  const revisione: RevisioneInterventi = { base, interventi, piantaValida: corrente, prezzi: precedente?.prezzi };
  return { revisione, passi, avvisi: [...new Set(note)] };
}

export function preparaInterventi(base: Pianta, vista: Vista, testo: string, contesto: ContestoChatDisegno, precedente?: RevisioneInterventi) {
  const usata = precedente?.base === base ? precedente : undefined;
  const richieste = usata?.interventi.map(i => i.richiesta) ?? [];
  const id = (richieste.at(-1)?.id ?? 0) + 1;
  const nuove = istruzioniDaChat(testo).map((frase, n) => ({ id: id + n, frase, selezionata: true, riferimento: contesto.selezione }));
  return eseguiInterventi(base, vista, [...richieste, ...nuove], contesto, usata);
}

export function modificaIntervento(revisione: RevisioneInterventi, vista: Vista, contesto: ContestoChatDisegno,
  id: number, modifica: Partial<Omit<RichiestaIntervento, "id">>): RevisioneInterventi {
  const richieste = revisione.interventi.map(i => i.richiesta.id === id ? { ...i.richiesta, ...modifica } : i.richiesta);
  return eseguiInterventi(revisione.base, vista, richieste, contesto, revisione).revisione;
}

/** Toglie un intervento dalla revisione (la chat della scheda: «annulla l'ultimo»); i successivi si ricalcolano. */
export function togliIntervento(revisione: RevisioneInterventi, vista: Vista, contesto: ContestoChatDisegno, id: number): RevisioneInterventi {
  const richieste = revisione.interventi.map(i => i.richiesta).filter(r => r.id !== id);
  return eseguiInterventi(revisione.base, vista, richieste, contesto, revisione).revisione;
}

export function anteprimaInterventi(revisione: RevisioneInterventi): PassoChatDisegno {
  const attivi = selezionatiInterventi(revisione);
  const bloccato = attivi.find(i => interferisce(i.passo))?.passo;
  const validi = attivi.flatMap(i => i.passo && !interferisce(i.passo) ? [i.passo] : []);
  const ultimo = validi.at(-1);
  const confrontoTramezzo = bloccato?.confrontoTramezzo ?? [...validi].reverse().find(p => p.confrontoTramezzo)?.confrontoTramezzo;
  const confrontoScarico = [...validi].reverse().find(p => p.confrontoScarico)?.confrontoScarico;
  const passo = bloccato ?? ultimo ?? { pianta: revisione.base, testo: "Interventi" };
  return {
    ...passo,
    mostraImpianti: validi.some(p => p.mostraImpianti), confrontoTramezzo, confrontoScarico, revisioneInterventi: revisione,
  };
}

export function piantaDaApplicare(passo: PassoChatDisegno, contesto: ContestoChatDisegno): Pianta {
  const prezzi = passo.revisioneInterventi?.prezzi;
  if (!prezzi || !passo.revisioneInterventi) return passo.pianta;
  const id = contesto.propostaId ?? ID_PROPOSTA;
  const pianoId = contesto.livelloId ?? contesto.documento.livelli[0].id;
  const documento = aPlanimetria(passo.pianta, contesto.documento, pianoId, id);
  const ammesse = studioVariante(documento, id).righe.filter(r => r.livelloId === pianoId);
  const selezionati = ammesse.flatMap(r => prezzi[r.id]?.unita === r.unita ? [[r.id, prezzi[r.id]] as const] : []);
  return { ...passo.pianta, prezziProgetto: { ...passo.revisioneInterventi.base.prezziProgetto, ...Object.fromEntries(selezionati) } };
}

export function creaAlternativaInterventi(documento: Planimetria, livelloId: string, partenza: string, pianta: Pianta, nome: string) {
  const id = prossimaProposta({ proposte: documento.livelli.flatMap(l => l.proposte) });
  const haPartenza = documento.livelli.some(l => l.proposte.some(p => p.id === partenza));
  const livelli = documento.livelli.map(l => {
    const esistente = l.proposte.find(p => p.id === partenza);
    if (!esistente && l.id !== livelloId) return l;
    const copia = { ...structuredClone(esistente ?? l.fatto), id, nome: nome.trim(), alternativaDi: haPartenza ? partenza : undefined };
    return { ...l, proposte: [...l.proposte, copia] };
  });
  const materiale = documento.materialiProgetto?.[`progetto:${partenza}`];
  const nuovo = { ...documento, livelli, ...(materiale ? { materialiProgetto: { ...documento.materialiProgetto, [`progetto:${id}`]: materiale } } : {}) };
  return { documento: aPlanimetria(pianta, nuovo, livelloId, id), id };
}

const passoQuoteCm = 5;
const raggioQuoteCm = 60;

export function cercaQuoteLibere(i: InterventoChat, distanzaRichiesta: number): { quote: number[]; da: number; a: number } {
  const da = Math.max(passoQuoteCm, Math.ceil((distanzaRichiesta - raggioQuoteCm) / passoQuoteCm) * passoQuoteCm);
  const a = Math.floor((distanzaRichiesta + raggioQuoteCm) / passoQuoteCm) * passoQuoteCm;
  const quote: number[] = [];
  const spostamento = i.ultimoSpostamento;
  const muro = spostamento && i.prima.muri.find(m => m.id === spostamento.prima.id);
  if (!spostamento || !muro) return { quote, da, a };
  const u = direzione(spostamento.prima);
  const normale = { x: -u.y, y: u.x };
  const lato = Math.sign((spostamento.dopo.p1.x - spostamento.prima.p1.x) * normale.x + (spostamento.dopo.p1.y - spostamento.prima.p1.y) * normale.y);
  if (!lato) return { quote, da, a };
  const candidate = Array.from({ length: (a - da) / passoQuoteCm + 1 }, (_, n) => da + n * passoQuoteCm)
    .sort((x, y) => Math.abs(x - distanzaRichiesta) - Math.abs(y - distanzaRichiesta));
  for (const cm of candidate) {
    try {
      const esito = traslaTramezzo(i.prima, muro, { x: normale.x * cm * lato, y: normale.y * cm * lato });
      if (!esito.interferenze.length) quote.push(cm);
      if (quote.length === 2) break;
    } catch { /* Al di fuori degli appoggi la distanza è esclusa. */ }
  }
  return { quote, da, a };
}
