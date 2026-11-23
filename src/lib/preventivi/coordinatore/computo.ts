/**
 * Il ponte tra il coordinatore e l'editor del computo: dalla voce dell'editor alla richiesta, e dalle
 * proposte accettate alla voce.
 *
 * Due regole che non hanno eccezioni:
 * - un prezzo scritto da una persona non si tocca se la sua proposta non è stata accettata a una a una;
 * - una proposta calcolata su una voce che nel frattempo è cambiata non si applica (si conta e si dice).
 */
import { calcolaVoce, numeroEditor, type VoceEditor } from "@/lib/computo/editorNativo";
import { improntaVoce } from "./abbinamento";
import type { EsitoVoce, VoceRichiesta } from "./tipi";

export const FONTE_MANUALE = "Prezzo inserito manualmente";

export function voceRichiesta(v: VoceEditor, vediCosti: boolean): VoceRichiesta {
  const conti = calcolaVoce(v);
  const prezzo = numeroEditor(v.prezzo);
  const costo = vediCosti ? numeroEditor(v.costo ?? "") : null;
  const fonte = (v.fonte ?? "").trim();
  return {
    id: v.id, capitolo: v.capitolo, codice: v.tariffa.trim(), descrizione: v.descrizione, unita: v.unita.trim(),
    quantita: conti.quantita === null ? null : Math.abs(conti.quantita),
    prezzo: prezzo !== null && prezzo >= 0 ? prezzo : null,
    costo: costo !== null && costo > 0 ? costo : null,
    // Senza una fonte e senza una verifica registrata, un prezzo l'ha messo qualcuno (o un file importato): è suo.
    manuale: prezzo !== null && (fonte === FONTE_MANUALE || (!fonte && !v.verifica)),
    opzionale: v.opzionale === true, daQuantificare: v.daQuantificare === true,
  };
}

export const fontiDichiarate = (voci: readonly VoceEditor[]): Record<string, string> =>
  Object.fromEntries(voci.map(v => [v.id, (v.fonte ?? "").trim() === FONTE_MANUALE ? "" : (v.fonte ?? "").trim()]));

const perEditor = (n: number) => String(n).replace(".", ",");
const fotografia = (v: VoceRichiesta) => `${improntaVoce(v)}|${v.prezzo ?? ""}|${v.costo ?? ""}`;

export interface RisposteDomande { quantita?: Record<string, string>; prezzi?: Record<string, string> }

export function applicaVerifica(
  voci: readonly VoceEditor[], analizzate: readonly VoceRichiesta[], esiti: readonly EsitoVoce[],
  accettate: ReadonlySet<string>, opzioni: { vediCosti: boolean; oggi: string; risposte?: RisposteDomande },
): { voci: VoceEditor[]; applicate: number; cambiateNelFrattempo: number; risposteScritte: number } {
  const esito = new Map(esiti.map(e => [e.voceId, e]));
  const prima = new Map(analizzate.map(v => [v.id, fotografia(v)]));
  let applicate = 0, cambiateNelFrattempo = 0, risposteScritte = 0;
  const nuove = voci.map(v => {
    let voce = v;
    const quantita = opzioni.risposte?.quantita?.[v.id]?.trim();
    if (quantita && !v.misure.length && numeroEditor(quantita) !== null && numeroEditor(quantita)! > 0) { voce = { ...voce, quantita }; risposteScritte++; }
    const prezzoScritto = opzioni.risposte?.prezzi?.[v.id]?.trim();
    if (prezzoScritto && numeroEditor(prezzoScritto) !== null && numeroEditor(prezzoScritto)! >= 0) {
      // Un prezzo dato in risposta a una domanda è un prezzo scritto a mano, e resta tale.
      risposteScritte++;
      return { ...voce, prezzo: prezzoScritto, fonte: FONTE_MANUALE, verifica: undefined };
    }
    const e = esito.get(v.id); const p = e?.proposta;
    if (!e || !p || !accettate.has(v.id)) return voce;
    if (prima.get(v.id) !== fotografia(voceRichiesta(v, opzioni.vediCosti))) { cambiateNelFrattempo++; return voce; }
    const sorgente = p.prezzo !== undefined || !p.costo ? e.vendita : null;
    const verifica: VoceEditor["verifica"] = p.regola
      ? { stato: "stima", tipo: "regola", riferimento: p.regola.slice(0, 200), data: null, validoAl: null, verificataIl: opzioni.oggi }
      : sorgente ? { stato: sorgente.scaduto ? "da_confermare" : "verificata", tipo: sorgente.tipo, riferimento: sorgente.riferimento.slice(0, 200), data: sorgente.data, validoAl: sorgente.validoAl, verificataIl: opzioni.oggi }
      : voce.verifica;
    applicate++;
    return {
      ...voce,
      ...(p.prezzo !== undefined ? { prezzo: perEditor(p.prezzo) } : {}),
      ...(p.costo !== undefined && opzioni.vediCosti && !(voce.costo ?? "").trim() ? { costo: perEditor(p.costo) } : {}),
      ...(p.fonte.trim() && (p.prezzo !== undefined || sorgente) ? { fonte: p.fonte.slice(0, 500) } : {}),
      verifica,
    };
  });
  return { voci: nuove, applicate, cambiateNelFrattempo, risposteScritte };
}
