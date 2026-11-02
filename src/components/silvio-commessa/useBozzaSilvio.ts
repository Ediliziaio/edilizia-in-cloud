/**
 * Lo stato del popup «Crea con Silvio» (31/10/2026, fase 1, lotto 1.5): il piano con la
 * sua storia, le fonti e le loro letture, il salvataggio della bozza, «Crea».
 * Vedi docs/piano-silvio-commessa-ai.md, 3.4 e 5.2–5.3.
 *
 * - Le fonti si leggono in parallelo, al massimo 3 insieme; ogni frammento si fonde appena
 *   arriva e le variabili toccate restano evidenziate per un attimo.
 * - Le letture con l'AI aspettano un tocco («Leggi», con la stima del costo davanti);
 *   preventivi, computi e file XPWE partono subito: costano zero.
 * - Ogni modifica passa da `applica`, e l'annulla dalla storia: la stessa che si salva
 *   nella bozza, così Cmd+Z funziona anche su una bozza ripresa.
 * - La bozza si salva da sola, con un attimo d'attesa; la prima volta nasce la riga.
 *
 * Con `orderId` (fase 2, «Completa con Silvio») il piano parte dalla commessa che c'è: quello
 * che ha già (`giaNellaCommessa`) è bloccato, qui e non solo nel popup, e «Completa» chiama
 * `completaCommessa`. La lettura della commessa è la base: da sola non crea una bozza.
 *
 * Fase 3:
 * - la chat (`scrivi`): «annulla» si fa qui, senza AI; il resto va a `servizi.chat`, e gli
 *   strumenti tornano modifiche (`eseguiRisposta`) applicate insieme, che un annulla toglie
 *   insieme. Quello che la chat cambia resta segnato a destra finché non lo guardi (`visto`);
 * - prima di ogni chiamata AI (lettura, chat, dettatura) si guarda il saldo dei crediti
 *   (`controllaCrediti`): se non basta non parte niente, e lo si dice;
 * - fonti nuove: il contratto dell'app, un file già caricato (dal link della chat), un allegato
 *   di un'email; i documenti della commessa si leggono dove stanno, senza copie.
 *
 * Fase 4:
 * - le proposte di persone, ditte, mezzi e acquisti (`proposteRisorse`) si rifanno da sole
 *   quando cambiano le fasi o le date, coi dati veri dell'azienda letti una volta; quello che
 *   la persona ha già accettato non si tocca più;
 * - un'offerta di una ditta rimasta «da collegare» si collega alla sua richiesta d'offerta
 *   (`collegaOfferta`): la legge `rdo-ai-estrai-offerta` e diventa l'ordine in bozza;
 * - gli allegati delle email letti dal popup vanno con la commessa tra i suoi documenti.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Area, Conflitto, Fonte, Frammento, Modifica, PianoCommessa, Valore } from "../../../shared/silvio-commessa/piano.ts";
import type { Autonomia } from "../../../shared/silvio-commessa/autonomia.ts";
import { eAnnulla, eseguiRisposta, pianoPerLaChat, STIMA_CHAT_EUR } from "../../../shared/silvio-commessa/chat.ts";
import type { FonteDaLink, RifDocumento } from "../../../shared/silvio-commessa/ingressi.ts";
import {
  annulla, applica, conInizioUtile, conScartatiDiNuovoInGioco, fondi, giaNellaCommessa, modificaBloccata, pianoVuoto, stessoValore, storiaDopoRilettura, type Passo,
} from "../../../shared/silvio-commessa/fondi.ts";
import { riconosciDocumento } from "../../../shared/silvio-commessa/riconoscitore.ts";
import {
  contrattoSenzaFase, FONTE_RISORSE, fasiDiLavoro, frammentoDaOfferta, proposteRisorse, riassuntoRisorse,
  type ContestoRisorse, type ContrattoDelPiano, type RichiestaOfferta,
} from "../../../shared/silvio-commessa/risorse.ts";
import { oggiInItalia } from "../../../shared/silvio-commessa/date.ts";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { dateDelleFasi } from "../../../shared/silvio-commessa/modelliLavoro.ts";
import type { FaseDelPiano } from "../../../shared/silvio-commessa/piano.ts";
import { scritturaDalPiano } from "@/lib/silvio-commessa/scrittura";
import { IMPOSTAZIONI_PREDEFINITE, type ImpostazioniSilvio } from "@/lib/silvio-commessa/autonomia";
import { calendarioAzienda, inizioUtile, lavorativiTra, type CalendarioCantiere } from "../../../shared/silvio-commessa/calendario.ts";
import type { AllegatoCommessa } from "@/lib/silvio-commessa/lettori";
import type { OrigineDocumento } from "@/lib/silvio-commessa/leggiDocumento";
import {
  BOZZA_GIA_SCRITTA, completaCommessa, creaBozza, creaCommessa, ErroreBozza, messaggioErrore, salvaBozza, salvataggioConAttesa, allegaFonti, scartaAltreBozzeCrea,
  type Bozza, type EsitoCommessa, type FonteCaricata, type SalvataggioConAttesa,
} from "@/lib/silvio-commessa/bozze";
import { correzioniDalPiano } from "@/lib/silvio-commessa/correzioni";
import { erroreLeggibile } from "@/lib/silvio-commessa/testoErrore";
import { avvisiDiRipresa, conQuadratura } from "../../../shared/silvio-commessa/quadratura.ts";
import { euroAI, pianoProposto, riassuntoFrammento, riservataPerProfilo, stimaLettura, testoValore, vistaPerLaChat } from "./presentazione";
import type { ServiziSilvioCommessa } from "./servizi";

export const LETTURE_INSIEME = 3;

/** Un messaggio che dice più cose, da leggere come un documento e non come una correzione della chat. */
export function messaggioDaLeggere(testo: string): boolean {
  return testo.trim().length >= 120;
}

type FonteLetta = Pick<Fonte, "etichetta"> & { id?: string | null };

/**
 * Il piano senza quello che ha portato una fonte (revisione 2/11, P9): chi ha caricato il documento
 * sbagliato lo toglie e carica quello giusto. Non passa da una modifica «togli», che lascerebbe un
 * «tolto da te» a chiudere la strada al documento giusto. Quello che la persona ha scritto o toccato
 * resta; se le fonti erano in disaccordo resta l'altra, e quello che era stato messo da parte rientra.
 */
export function pianoSenzaFonte(
  piano: PianoCommessa, fonti: readonly FonteLetta[], storia: Passo[] = [],
): { piano: PianoCommessa; tolti: number; storia: Passo[] } {
  const sua = (x: Fonte) => fonti.some((f) => (f.id && x.id ? f.id === x.id : f.etichetta === x.etichetta));
  const daTogliere = (v: Valore) => !v.toccato && !giaNellaCommessa(piano, v) && !v.sopraCommessa && sua(v.fonte);
  const aree: PianoCommessa["aree"] = {};
  let tolti = 0;
  const svuotate = new Set<string>();
  for (const [area, valori] of Object.entries(piano.aree)) {
    aree[area as keyof PianoCommessa["aree"]] = Object.fromEntries(Object.entries(valori ?? {}).filter(([, v]) => {
      const via = daTogliere(v);
      if (via) tolti += 1;
      return !via;
    }).map(([chiave, v]) => {
      // Sotto una proposta della chat c'era il valore della fonte tolta: in vigore non resta niente,
      // e «Toglilo» non deve rimetterlo.
      const sotto = v.alPostoDi;
      if (!sotto || !daTogliere(sotto)) return [chiave, v];
      tolti += 1;
      svuotate.add(chiave);
      return [chiave, { ...v, alPostoDi: null }];
    }));
  }
  // Sopra una proposta della chat quello che resta va sotto: la proposta aspetta ancora il sì.
  const metti = (area: keyof PianoCommessa["aree"], chiave: string, v: Valore) => {
    const sopra = aree[area]?.[chiave];
    aree[area] = { ...(aree[area] ?? {}), [chiave]: sopra?.alPostoDi !== undefined ? { ...sopra, alPostoDi: v } : v };
  };
  const conflitti = piano.conflitti.flatMap((c) => {
    const restano = c.candidati.filter((x) => !sua(x.fonte));
    if (restano.length === c.candidati.length) return [c];
    if (restano.length >= 2) {
      metti(c.area, c.chiave, { ...restano[0], stato: "attenzione" });
      return [{ ...c, candidati: restano, nota: null }];
    }
    // Resta un solo candidato: è lui il valore, e il disaccordo non c'è più. Chi era stato messo
    // da parte ha di nuovo diritto di parola (quarta revisione, 6).
    if (restano.length === 1) { metti(c.area, c.chiave, restano[0]); svuotate.add(c.chiave); }
    return [];
  });
  const scartati = (piano.scartati ?? []).filter((s) => !sua(s.valore.fonte));
  const prefissi = fonti.map((f) => `${f.etichetta}: `);
  let nuovo: PianoCommessa = {
    ...piano, aree, conflitti, scartati,
    fonti: piano.fonti.filter((f) => !sua(f)),
    avvisi: (piano.avvisi ?? []).filter((a) => !prefissi.some((p) => a.startsWith(p))),
  };
  // Fusi e non messi uno sopra l'altro: due che non sono d'accordo fanno un conflitto, non si cancellano.
  const daRifondere = new Map(scartati.map((s) => [s.chiave, s.area] as [string, Area]));
  for (const [chiave, area] of daRifondere) {
    if (!aree[area]?.[chiave] || svuotate.has(chiave)) nuovo = conScartatiDiNuovoInGioco(nuovo, area, chiave);
  }
  if (!nuovo.scartati?.length) delete nuovo.scartati;
  return { tolti, piano: conQuadratura(nuovo), storia: storia.map((p) => passoSenzaFonte(p, sua, daTogliere)) };
}

const FASI = "fasi.order_work_phases";
const eModello = (f: Fonte) => f.tipo === "modello" && f.id !== FONTE_RISORSE.id;

/**
 * Il modello per tipo di lavoro serve quando nessun documento dice le fasi (prova cliccata del 2/11).
 * Un capitolato senza fasi se lo porta dietro: letto con un contratto che le fasi le ha, proponeva
 * «fine lavori 9 dicembre» contro il 21 del contratto, e «manca la misura» su fasi che non venivano
 * dal modello. Vale in tutti e due gli ordini, perché le letture finiscono quando capita.
 */
function senzaModelloContro(piano: PianoCommessa, storia: Passo[], frammenti: Frammento[]): { piano: PianoCommessa; storia: Passo[]; frammenti: Frammento[] } {
  const fasi = piano.aree.fasi?.[FASI];
  const portaFasi = frammenti.some((fr) => !eModello(fr.fonte) && fr.aree.fasi?.[FASI]);
  if (!portaFasi && (!fasi || eModello(fasi.fonte))) return { piano, storia, frammenti };
  const modelli = piano.fonti.filter(eModello);
  const senza = portaFasi && modelli.length ? pianoSenzaFonte(piano, modelli, storia) : { piano, storia };
  return { piano: senza.piano, storia: senza.storia, frammenti: frammenti.filter((fr) => !eModello(fr.fonte)) };
}

/**
 * Lo stesso per la storia (quarta revisione, 2): l'annulla non deve far rientrare dalla finestra
 * il valore di un documento tolto dalla porta. Un valore che resta senza niente diventa «non c'era».
 */
function passoSenzaFonte(passo: Passo, sua: (x: Fonte) => boolean, daTogliere: (v: Valore) => boolean): Passo {
  const conflittiPrima: Conflitto[] = [];
  const prima = passo.prima.map((voce) => {
    const c = passo.conflittiPrima.find((x) => x.area === voce.area && x.chiave === voce.chiave);
    const restano = c?.candidati.filter((x) => !sua(x.fonte));
    const cambiato = !!c && !!restano && restano.length !== c.candidati.length;
    if (c && !cambiato) conflittiPrima.push(c);
    if (c && cambiato && restano!.length >= 2) conflittiPrima.push({ ...c, candidati: restano!, nota: null });
    const alPosto: Valore | null = cambiato && restano!.length ? (restano!.length >= 2 ? { ...restano![0], stato: "attenzione" } : restano![0]) : null;
    const pulito = (v: Valore | null): Valore | null => {
      if (!v) return v;
      if (v.alPostoDi !== undefined) return { ...v, alPostoDi: pulito(v.alPostoDi) };
      if (daTogliere(v)) return alPosto;
      return cambiato && restano!.length === 1 ? alPosto : v;
    };
    return { ...voce, valore: pulito(voce.valore) };
  });
  const scartatiPrima = passo.scartatiPrima?.filter((s) => !sua(s.valore.fonte));
  const { scartatiPrima: _via, ...resto } = passo;
  return { ...resto, prima, conflittiPrima, ...(scartatiPrima?.length ? { scartatiPrima } : {}) };
}

/**
 * Quello che una modifica si porta dietro, come se lo aspetta chi la fa (01/11/2026; revisione
 * 2/11, G2, G3, G16). Vale per le modifiche a mano e per quelle della chat:
 * - la data d'inizio su un giorno chiuso va al primo giorno utile, con l'avviso nella nota;
 * - le fasi che hanno già le date si spostano perché la prima parta lì: lo scarto si misura
 *   dalla prima fase, non dall'inizio che c'era, che può essere un giorno chiuso;
 * - le fasi che hanno i giorni ma non le date le prendono (e la fine lavori, se manca);
 * - togliere una ditta toglie il suo contratto; da una sola fase, lo toglie solo per quella.
 * Tutte insieme: un annulla le toglie tutte.
 */
export function conConseguenze(piano: PianoCommessa, modifiche: Modifica[], oggi: string = oggiInItalia()): Modifica[] {
  const out: Modifica[] = [];
  let ora = piano;
  const metti = (m: Modifica) => {
    out.push(m);
    // Una modifica che non si può fare la ferma il riduttore, col suo messaggio.
    try { ora = applica(ora, m).piano; } catch { /* resta com'è */ }
  };
  for (const m of modifiche) {
    // Scelta fra due documenti: le fasi senza date le prendono, come se la data l'avesse scritta la persona.
    if (m.tipo === "scegli_fonte" && m.chiave === "fasi.work_start_date") {
      metti(m);
      const scelta = ora.aree.fasi?.[m.chiave]?.valore;
      const fasi = ora.aree.fasi?.["fasi.order_work_phases"];
      if (typeof scelta === "string" && !giaNellaCommessa(ora, fasi) && Array.isArray(fasi?.valore) && (fasi!.valore as FaseDelPiano[]).some((f) => !f.start_date && f.giorni)) {
        metti({ tipo: "cambia_valore", area: "fasi", chiave: "fasi.order_work_phases", valore: dateDelleFasi(fasi!.valore as FaseDelPiano[], scelta, ora.calendario), conservaStato: true });
      }
      continue;
    }
    // Una proposta non sposta niente: lo fa il suo «Va bene», che ripassa di qui.
    if (m.tipo === "cambia_valore" && m.chiave === "fasi.work_start_date" && typeof m.valore === "string" && !m.proposta) {
      const { data, avviso } = inizioUtile(m.valore, ora.calendario, oggi);
      const fasi = ora.aree.fasi?.["fasi.order_work_phases"];
      const bloccate = giaNellaCommessa(ora, fasi);
      const elenco = Array.isArray(fasi?.valore) ? (fasi!.valore as FaseDelPiano[]) : [];
      const prima = elenco.map((f) => f.start_date).filter((d): d is string => !!d).sort()[0];
      const n = prima && !bloccate ? lavorativiTra(prima, data, ora.calendario) : 0;
      if (n) metti({ tipo: "sposta_date", giorniLavorativi: n, daFase: null });
      metti({ ...m, valore: data, ...(avviso ? { nota: avviso } : {}) });
      // Quelle che la commessa ha già non si ridatano: le date le mette chi le ha scritte. Quelle
      // che ha senza date le prendono nella proposta (`fasi.date_fasi`), che resta una proposta.
      const chiave = bloccate ? "fasi.date_fasi" : "fasi.order_work_phases";
      const daDatare = ora.aree.fasi?.[chiave]?.valore;
      if (Array.isArray(daDatare) && (daDatare as FaseDelPiano[]).some((f) => !f.start_date && f.giorni)) {
        const datate = dateDelleFasi(daDatare as FaseDelPiano[], data, ora.calendario);
        metti({ tipo: "cambia_valore", area: "fasi", chiave, valore: datate, conservaStato: true });
        const fine = datate.map((f) => f.end_date).filter((d): d is string => !!d).sort().pop();
        if (fine && !ora.aree.fasi?.["fasi.work_end_date"]) {
          metti({ tipo: "cambia_valore", area: "fasi", chiave: "fasi.work_end_date", valore: fine });
        }
      }
      continue;
    }
    if (m.tipo === "togli" && m.chiave === "ditte.assegnate") {
      const contratti = ora.aree.ditte?.["ditte.contratti"]?.valore;
      const ditte = ora.aree.ditte?.["ditte.assegnate"]?.valore as { nome?: string; external_team_id?: string; fase?: string }[] | undefined;
      const ditta = m.indice != null ? ditte?.[m.indice] : null;
      metti(m);
      if (!Array.isArray(contratti) || !contratti.length) continue;
      if (m.indice == null) { metti({ tipo: "togli", area: "ditte", chiave: "ditte.contratti" }); continue; }
      const stessa = (x: { nome?: string; external_team_id?: string }) => (ditta?.external_team_id ? x?.external_team_id === ditta.external_team_id : x?.nome === ditta?.nome);
      const i = ditta ? (contratti as { nome?: string; external_team_id?: string }[]).findIndex(stessa) : -1;
      if (i < 0) continue;
      const restano = (ora.aree.ditte?.["ditte.assegnate"]?.valore as { nome?: string; external_team_id?: string; fase?: string }[]).filter(stessa);
      if (!restano.length) { metti({ tipo: "togli", area: "ditte", chiave: "ditte.contratti", indice: i }); continue; }
      if (ditta?.fase && !restano.some((r) => r.fase === ditta.fase)) {
        const nuovi = (contratti as ContrattoDelPiano[]).map((c, k) => (k === i ? contrattoSenzaFase(c, ditta.fase!, fasiDiLavoro(ora)) : c));
        metti({ tipo: "cambia_valore", area: "ditte", chiave: "ditte.contratti", valore: nuovi, conservaStato: true });
      }
      continue;
    }
    metti(m);
  }
  return out;
}
/** Una lettura di un'offerta con `rdo-ai-estrai-offerta`: una pagina o due, come un documento. */
export const STIMA_OFFERTA_EUR = 0.03;
/** Come `MAX_BYTE` della funzione `silvio-commessa`: oltre, caricarlo è solo tempo e traffico perso. */
export const MASSIMO_FILE_AI_BYTE = 20 * 1024 * 1024;

export type StatoFonte = "da_confermare" | "in_coda" | "in_lettura" | "fatta" | "errore" | "da_collegare";

export interface FonteNelPopup {
  id: string;
  tipo: "preventivo" | "computo" | "file" | "testo" | "ripresa" | "commessa" | "allegato" | "contratto" | "caricato" | "documento";
  etichetta: string;
  stato: StatoFonte;
  /** Id della riga (preventivo, computo). */
  refId?: string;
  file?: File;
  testo?: string;
  /** Un documento già allegato alla commessa («Completa»). */
  allegato?: AllegatoCommessa;
  /** Un file già in silvio-uploads (dal link della chat): si legge lì. */
  percorso?: string;
  /** Un documento che il browser non scarica (allegato di un'email): lo legge Silvio dove sta. */
  documento?: RifDocumento;
  mime?: string | null;
  /** L'id della fonte nei frammenti letti: la ⓘ ritrova da qui il documento. */
  idFonte?: string;
  /** Stima prima della lettura, 0 per le letture a regole. */
  stimaEur: number;
  /** Costo vero, quando la lettura l'ha detto. */
  costoEur?: number;
  avvisi: string[];
  errore?: string;
  tentativo: number;
  /** Quante variabili ha portato. */
  valori?: number;
  /** Le fonti che la lettura ha messo nel piano (un preventivo può portarsi dietro il modello): per toglierle. */
  fontiLette?: FonteLetta[];
  /** Sembrava un'offerta, ma la persona ha chiesto di leggerlo come un documento qualsiasi. */
  comeDocumento?: boolean;
}

export interface Messaggio {
  id: number;
  testo: string;
  /** «persona» = scritto (o dettato) dall'utente nella chat. */
  tono: "silvio" | "avviso" | "errore" | "persona";
  /** Le variabili che questa risposta ha cambiato: «Vedi» le mostra. */
  chiavi?: string[];
  /** Quanti passi aveva la storia dopo questa risposta: «Annulla» vale finché non ce ne sono altri. */
  passi?: number;
}

interface Stato {
  piano: PianoCommessa;
  storia: Passo[];
  fonti: FonteNelPopup[];
  caricate: FonteCaricata[];
  evidenziate: string[];
  messaggi: Messaggio[];
  /** Cresce a ogni cambiamento da salvare. */
  versione: number;
  /** I frammenti della commessa che si completa: la base, che una bozza ripresa rilegge. */
  base: Frammento[];
  /** Cambiate dalla chat e non ancora guardate: restano segnate. */
  daGuardare: string[];
  /** Una bozza ripresa: la commessa riletta dopo può far saltare i suoi conti. */
  ripresa?: boolean;
}

type Azione =
  | { tipo: "aggiungi_fonti"; fonti: FonteNelPopup[] }
  | { tipo: "aggiorna_fonte"; id: string; patch: Partial<FonteNelPopup> }
  | { tipo: "togli_fonte"; id: string }
  | {
    tipo: "frammenti"; id: string; frammenti: Frammento[]; caricata?: FonteCaricata; patch?: Partial<FonteNelPopup>;
    /** La lettura della commessa: si fonde ma non è un cambiamento da salvare. */
    base?: boolean; messaggio?: string;
    /** Le proposte rifatte da sole (fase 4): niente messaggio, niente evidenziato. */
    muto?: boolean;
  }
  | { tipo: "modifiche"; modifiche: Modifica[]; dallaChat?: { righe: string[] } }
  | { tipo: "visto"; chiavi: string[] }
  | { tipo: "annulla" }
  | { tipo: "spegni"; chiavi: string[] }
  | { tipo: "messaggio"; testo: string; tono: Messaggio["tono"]; chiavi?: string[] }
  | { tipo: "riprendi"; bozza: Bozza }
  /** Fase 5: il calendario dell'azienda per il cantiere; non è un cambiamento da salvare. */
  | { tipo: "calendario"; calendario: CalendarioCantiere };

let contatore = 0;
const nuovoId = () => `f${Date.now().toString(36)}${(contatore++).toString(36)}`;

function messaggio(s: Stato, testo: string, tono: Messaggio["tono"] = "silvio", chiavi?: string[]): Messaggio[] {
  return [...s.messaggi, { id: (s.messaggi[s.messaggi.length - 1]?.id ?? 0) + 1, testo, tono, ...(chiavi?.length ? { chiavi } : {}) }];
}

/**
 * Il frammento delle proposte cambia qualcosa? `fondi` rimette sempre un valore nuovo (anche
 * uguale), quindi si confronta il contenuto: altrimenti le proposte si rifarebbero all'infinito.
 */
function portaQualcosa(piano: PianoCommessa, fr: Frammento): boolean {
  return Object.entries(fr.aree).some(([area, valori]) => Object.entries(valori ?? {}).some(([chiave, v]) => {
    // Già fra i candidati di un conflitto aperto: si aspetta la scelta della persona.
    const conflitto = piano.conflitti.find((c) => c.chiave === chiave);
    if (conflitto?.candidati.some((c) => c.fonte.id === fr.fonte.id && stessoValore(c.valore, v.valore))) return false;
    const ora = piano.aree[area as keyof PianoCommessa["aree"]]?.[chiave];
    return !ora || ora.fonte.id !== fr.fonte.id || !stessoValore(ora.valore, v.valore) || ora.nota !== v.nota;
  }));
}

/** Un file caricato si riconosce dal percorso; un allegato di un'email dal suo riferimento. */
const chiaveCaricata = (c: FonteCaricata) => c.path || JSON.stringify(c.documento ?? null);

// Il controllo sta nel motore (fondi.ts): lo usano anche gli strumenti della chat.
export { modificaBloccata };

let gruppi = 0;

/** Le chiavi che hanno un valore diverso (per riferimento) fra due piani. */
function chiaviCambiate(prima: PianoCommessa, dopo: PianoCommessa): string[] {
  const out: string[] = [];
  for (const [area, valori] of Object.entries(dopo.aree)) {
    for (const [chiave, v] of Object.entries(valori ?? {})) {
      if (prima.aree[area as keyof PianoCommessa["aree"]]?.[chiave] !== v) out.push(chiave);
    }
  }
  return out;
}

function riduttore(s: Stato, a: Azione): Stato {
  switch (a.tipo) {
    case "aggiungi_fonti":
      return { ...s, fonti: [...s.fonti, ...a.fonti] };
    case "aggiorna_fonte":
      return { ...s, fonti: s.fonti.map((f) => (f.id === a.id ? { ...f, ...a.patch } : f)) };
    case "togli_fonte": {
      const f = s.fonti.find((x) => x.id === a.id);
      const fonti = s.fonti.filter((x) => x.id !== a.id);
      if (!f || f.stato !== "fatta") return { ...s, fonti };
      const lette: FonteLetta[] = f.fontiLette ?? [{ id: f.idFonte ?? null, etichetta: f.etichetta }];
      const { piano, tolti, storia } = pianoSenzaFonte(s.piano, lette, s.storia);
      const nomi = new Set(lette.map((x) => x.etichetta));
      return {
        ...s, piano, fonti, storia,
        // Il file non va più con la commessa.
        caricate: s.caricate.filter((c) => !nomi.has(c.fonte ?? c.nome) && !nomi.has(c.nome)),
        versione: s.versione + 1,
        messaggi: messaggio(s, tolti
          ? `Ho tolto «${f.etichetta}» e ${tolti === 1 ? "il dato che aveva portato" : `i ${tolti} dati che aveva portato`}.`
          : `Ho tolto «${f.etichetta}»: non aveva portato dati che ci sono ancora.`),
      };
    }
    case "frammenti": {
      const { piano: partenza, storia: storiaDiPartenza, frammenti } = senzaModelloContro(s.piano, s.storia, a.frammenti);
      const piano = frammenti.reduce((p, fr) => fondi(p, fr), partenza);
      const cambiate = chiaviCambiate(partenza, piano);
      const fonte = s.fonti.find((f) => f.id === a.id);
      let messaggi = s.messaggi;
      const conMessaggio = (t: string, tono: Messaggio["tono"] = "silvio") => { messaggi = messaggio({ ...s, messaggi }, t, tono); };
      if (!a.muto) conMessaggio(a.messaggio ?? riassuntoFrammento(fonte?.etichetta ?? frammenti[0]?.fonte.etichetta ?? "la fonte", cambiate));
      const nuoviConflitti = piano.conflitti.length - s.piano.conflitti.length;
      if (nuoviConflitti > 0) {
        conMessaggio(nuoviConflitti === 1
          ? "Su un valore le fonti non sono d'accordo: l'ho segnato con ⚠, scegli tu."
          : `Su ${nuoviConflitti} valori le fonti non sono d'accordo: li ho segnati con ⚠, scegli tu.`, "avviso");
      }
      // La commessa riletta dopo una ripresa può far saltare i conti della bozza: lo si dice.
      if (a.base && s.ripresa) {
        const gia = new Set(avvisiDiRipresa(s.piano));
        for (const t of avvisiDiRipresa(piano)) if (!gia.has(t)) conMessaggio(t, "avviso");
      }
      const avvisi = frammenti.flatMap((f) => f.avvisi ?? []);
      return {
        ...s,
        piano,
        // La commessa riletta vince anche sull'annulla, se arriva dopo una ripresa.
        storia: a.base ? storiaDopoRilettura(piano, storiaDiPartenza) : storiaDiPartenza,
        fonti: s.fonti.map((f) => (f.id === a.id ? { ...f, stato: "fatta", avvisi, valori: cambiate.length, fontiLette: frammenti.map((x) => x.fonte), ...a.patch } : f)),
        caricate: a.caricata ? [...s.caricate.filter((c) => chiaveCaricata(c) !== chiaveCaricata(a.caricata!)), a.caricata] : s.caricate,
        evidenziate: a.base || a.muto ? s.evidenziate : [...new Set([...s.evidenziate, ...cambiate])],
        messaggi,
        versione: a.base ? s.versione : s.versione + 1,
        base: a.base ? a.frammenti : s.base,
      };
    }
    case "modifiche": {
      const bloccata = a.modifiche.map((m) => modificaBloccata(s.piano, m)).find(Boolean);
      if (bloccata) return { ...s, messaggi: messaggio(s, bloccata, "avviso") };
      if (!a.modifiche.length) {
        return a.dallaChat ? { ...s, messaggi: messaggio(s, a.dallaChat.righe.join(" ") || "Non ho cambiato niente.", "silvio") } : s;
      }
      let bozza = { piano: s.piano, storia: s.storia };
      // Le modifiche nate insieme si annullano insieme.
      const gruppo = a.modifiche.length > 1 ? `g${Date.now().toString(36)}${(gruppi++).toString(36)}` : null;
      try {
        for (const m of a.modifiche) bozza = applica(bozza.piano, m, bozza.storia, gruppo);
      } catch (e) {
        return { ...s, messaggi: messaggio(s, erroreLeggibile(e, "Questa modifica non si può fare."), "errore") };
      }
      const cambiate = chiaviCambiate(s.piano, bozza.piano);
      return {
        ...s, ...bozza,
        evidenziate: [...new Set([...s.evidenziate, ...cambiate])],
        versione: s.versione + 1,
        ...(a.dallaChat ? {
          daGuardare: [...new Set([...s.daGuardare, ...cambiate])],
          messaggi: messaggio(s, a.dallaChat.righe.join(" "), "silvio", cambiate).map((m, i, tutti) => (i === tutti.length - 1 ? { ...m, passi: bozza.storia.length } : m)),
        } : {}),
      };
    }
    case "visto":
      return { ...s, daGuardare: s.daGuardare.filter((k) => !a.chiavi.includes(k)) };
    case "annulla": {
      if (!s.storia.length) return s;
      const bozza = annulla(s.piano, s.storia);
      const tornate = chiaviCambiate(s.piano, bozza.piano);
      const sparite = chiaviCambiate(bozza.piano, s.piano);
      return {
        ...s, ...bozza,
        evidenziate: [...new Set([...s.evidenziate, ...tornate])],
        // Tornato com'era, o sparito: «cambiato in chat» non è più vero.
        daGuardare: s.daGuardare.filter((k) => !tornate.includes(k) && !sparite.includes(k)),
        versione: s.versione + 1,
      };
    }
    case "spegni":
      return { ...s, evidenziate: s.evidenziate.filter((k) => !a.chiavi.includes(k)) };
    case "messaggio":
      return { ...s, messaggi: messaggio(s, a.testo, a.tono, a.chiavi) };
    case "calendario":
      return { ...s, piano: { ...s.piano, calendario: a.calendario } };
    case "riprendi": {
      // Una bozza che completa una commessa si rilegge sopra la commessa di adesso:
      // quello che nel frattempo qualcuno ha scritto vince.
      const ripresa = s.base.reduce((p, fr) => fondi(p, fr), a.bozza.piano);
      // Il calendario è quello di adesso, non quello salvato con la bozza.
      const piano = s.piano.calendario ? { ...ripresa, calendario: s.piano.calendario } : ripresa;
      const ripresaDetta = messaggio(s, "Ho ripreso la bozza com'era: puoi continuare da dove eri rimasto. I documenti che non avevo ancora letto non si salvano: se ne manca uno, ricaricalo.");
      return {
        ...s,
        piano,
        ripresa: true,
        storia: storiaDopoRilettura(piano, (a.bozza.storia ?? []) as Passo[]),
        caricate: a.bozza.fonti ?? [],
        // Le proposte di Silvio non sono una fonte da togliere: si rifanno da sole.
        fonti: piano.fonti.filter((f) => f.id !== FONTE_RISORSE.id).map((f) => ({
          id: nuovoId(), tipo: "ripresa", etichetta: f.etichetta, stato: "fatta", stimaEur: 0, avvisi: [] as string[], tentativo: 0,
          ...(f.id ? { idFonte: f.id } : {}),
        })),
        messaggi: avvisiDiRipresa(piano).reduce((m, t) => messaggio({ ...s, messaggi: m }, t, "avviso"), ripresaDetta),
        versione: s.versione,
      };
    }
  }
}

interface DatiBozza { piano: PianoCommessa; storia: Passo[]; caricate: FonteCaricata[]; autonomia: Autonomia }

export type StatoSalvataggio =
  | { tipo: "nuova" }
  | { tipo: "in_corso" }
  | { tipo: "salvata" }
  | { tipo: "errore"; messaggio: string };

/** Una fonte da far leggere a Silvio, come la passa il popup. */
export type FonteDaAggiungere =
  | { tipo: "commessa"; id: string; etichetta?: string }
  | { tipo: "allegato"; allegato: AllegatoCommessa }
  | { tipo: "preventivo"; id: string; etichetta?: string }
  | { tipo: "computo"; id: string; etichetta?: string }
  | { tipo: "contratto"; id: string; etichetta?: string }
  | { tipo: "file"; file: File }
  /** `daLink`: l'ha portato un link, non la persona: non ha visto il costo e non è un suo messaggio. */
  | { tipo: "testo"; testo: string; daLink?: boolean }
  /** Un file già caricato in silvio-uploads (allegato della chat). Con `confermata` la stima l'ha già vista chi l'ha mandato. */
  | { tipo: "caricato"; path: string; nome: string; mime?: string | null; confermata?: boolean }
  /** Un allegato di un'email: lo legge Silvio dove sta. */
  | { tipo: "documento"; documento: RifDocumento; nome: string; mime?: string | null; dimensione?: number | null; confermata?: boolean };

/** Le fonti di un link (chat, WhatsApp) come le aggiunge il popup. Il link non ha visto la stima: le letture AI aspettano «Leggi». */
export function fontiDaLink(fonti: readonly FonteDaLink[]): FonteDaAggiungere[] {
  return fonti.map((f): FonteDaAggiungere => {
    switch (f.tipo) {
      case "caricato": return { tipo: "caricato", path: f.path, nome: f.nome, mime: f.mime };
      case "email": return { tipo: "documento", documento: { tipo: "allegato_email", email_id: f.email_id, indice: f.indice }, nome: f.nome, mime: f.mime };
      case "contratto": return { tipo: "contratto", id: f.id };
      case "preventivo": return { tipo: "preventivo", id: f.id };
      case "testo": return { tipo: "testo", testo: f.testo, daLink: true };
    }
  });
}

/** Il saldo dei crediti si rilegge al massimo ogni 30 secondi. */
const SALDO_VALE_MS = 30_000;

export interface OpzioniBozza {
  companyId: string;
  userId: string;
  servizi: ServiziSilvioCommessa;
  /** La commessa da completare: il popup è in modo «completa». */
  orderId?: string | null;
  /** Attesa del salvataggio automatico. */
  attesaMs?: number;
  /** Il permesso «Importi di vendita»: senza, la chat non riceve gli importi. */
  vedeImporti?: boolean;
  /** Il permesso sui costi: la chat non li riceve e non li dice. */
  vedeCosti?: boolean;
}

export function useBozzaSilvio({ companyId, userId, servizi, orderId = null, attesaMs = 800, vedeImporti = true, vedeCosti = true }: OpzioniBozza) {
  const [s, invia] = useReducer(riduttore, undefined, (): Stato => ({
    piano: pianoVuoto(companyId, orderId), storia: [], fonti: [], caricate: [], evidenziate: [], messaggi: [], versione: 0, base: [],
    daGuardare: [],
  }));
  const ultimo = useRef(s);
  useLayoutEffect(() => { ultimo.current = s; }, [s]);
  const bozzaId = useRef<string | null>(null);
  const [idBozza, setIdBozza] = useState<string | null>(null);
  const [salvataggio, setSalvataggio] = useState<StatoSalvataggio>({ tipo: "nuova" });
  const avviate = useRef(new Set<string>());
  /** L'ultimo salvataggio non riuscito: «Crea» non parte da una bozza vecchia (P1). */
  const erroreSalvataggio = useRef<ErroreBozza | null>(null);

  // Non ferma niente: se non riesce, la bozza nuova c'è comunque.
  const scartaVecchie = useCallback(
    (tieni: string) => scartaAltreBozzeCrea({ companyId, userId, tieni }, servizi.db).catch(() => 0),
    [companyId, userId, servizi.db],
  );

  // Uno per popup, nato al primo uso (mai durante il render): azienda e client non cambiano.
  const salvaRef = useRef<SalvataggioConAttesa<DatiBozza> | null>(null);
  const salvatore = useCallback(() => (salvaRef.current ??= salvataggioConAttesa<DatiBozza>(
    async (d) => {
      setSalvataggio({ tipo: "in_corso" });
      if (!bozzaId.current) {
        const b = await creaBozza({ companyId, orderId, piano: d.piano, fonti: d.caricate, autonomia: d.autonomia }, servizi.db);
        bozzaId.current = b.id;
        setIdBozza(b.id);
        // La nuova c'è: quelle lasciate a metà si scartano, e chi le ignorava lo sa.
        if (!orderId) void scartaVecchie(b.id).then((n) => {
          if (n) invia({ tipo: "messaggio", tono: "avviso", testo: n === 1 ? "La commessa a metà che avevi lasciato l'ho scartata: ne tengo una sola alla volta." : `Le ${n} commesse a metà che avevi lasciato le ho scartate: ne tengo una sola alla volta.` });
        });
        if (d.storia.length) await salvaBozza(b.id, { piano: d.piano, fonti: d.caricate, storia: d.storia, autonomia: d.autonomia }, servizi.db);
        return;
      }
      await salvaBozza(bozzaId.current, { piano: d.piano, fonti: d.caricate, storia: d.storia, autonomia: d.autonomia }, servizi.db);
    },
    {
      attesaMs,
      quandoSalvato: () => { erroreSalvataggio.current = null; setSalvataggio({ tipo: "salvata" }); },
      quandoSbaglia: (e) => { erroreSalvataggio.current = e; setSalvataggio({ tipo: "errore", messaggio: e.message }); },
    },
  )), [companyId, orderId, servizi.db, attesaMs, scartaVecchie]);

  // Cosa fa Silvio da solo: decide la scrittura che si salva, e serve anche alla chat, per non
  // scrivere quello che l'azienda ha vietato (G19).
  const [impostazioni, setImpostazioni] = useState<ImpostazioniSilvio>(IMPOSTAZIONI_PREDEFINITE);
  const autonomia = impostazioni.autonomia;
  const ultimeImpostazioni = useRef(impostazioni);
  useLayoutEffect(() => { ultimeImpostazioni.current = impostazioni; }, [impostazioni]);

  // Ogni cambiamento del piano (o delle fonti caricate) va nella bozza, con l'attesa.
  useEffect(() => {
    if (s.versione === 0) return;
    salvatore().programma({ piano: s.piano, storia: s.storia, caricate: s.caricate, autonomia });
  }, [s.versione, s.piano, s.storia, s.caricate, autonomia, salvatore]);

  // Alla chiusura quello che aspetta parte subito.
  useEffect(() => () => { void salvaRef.current?.subito(); }, []);

  // L'evidenziato dura un attimo.
  useEffect(() => {
    if (!s.evidenziate.length) return;
    const chiavi = s.evidenziate;
    const t = setTimeout(() => invia({ tipo: "spegni", chiavi }), 1600);
    return () => clearTimeout(t);
  }, [s.evidenziate]);

  const inizioLavori = () => {
    const v = ultimo.current.piano.aree.fasi?.["fasi.work_start_date"]?.valore;
    return typeof v === "string" ? v : null;
  };

  // ── Crediti AI: si guardano prima di spendere ──
  const saldo = useRef<{ letto: number; esito: Awaited<ReturnType<ServiziSilvioCommessa["saldoAI"]>> } | null>(null);
  /** Null se si può spendere `stimaEur`; altrimenti il motivo, da dire all'utente. */
  const controllaCrediti = useCallback(async (stimaEur: number): Promise<string | null> => {
    if (!(stimaEur > 0)) return null;
    let esito = saldo.current && Date.now() - saldo.current.letto < SALDO_VALE_MS ? saldo.current.esito : null;
    if (!esito) {
      try {
        esito = await servizi.saldoAI(companyId);
      } catch {
        return null; // Il saldo non si legge: lo ricontrolla il router prima di chiamare il provider.
      }
      saldo.current = { letto: Date.now(), esito };
    }
    // Quello che non basta non si ricorda: chi ha appena ricaricato preme «Riprova» subito.
    if (esito.bloccato) { saldo.current = null; return "Le chiamate AI dell'azienda sono ferme per credito: ricarica i crediti e riprova."; }
    if (esito.saldoEur != null && esito.saldoEur < stimaEur) {
      saldo.current = null;
      return `I crediti AI non bastano (servono circa ${euroAI(stimaEur)}, ne restano ${euroAI(Math.max(0, esito.saldoEur))}): ricarica e riprova.`;
    }
    return null;
  }, [servizi, companyId]);
  /** Dopo una spesa il saldo si rilegge. */
  const speso = () => { saldo.current = null; };

  const leggi = useCallback(async (f: FonteNelPopup) => {
    invia({ tipo: "aggiorna_fonte", id: f.id, patch: { stato: "in_lettura", errore: undefined } });
    const opz = {
      companyId, userId, inizio: inizioLavori(), calendario: ultimo.current.piano.calendario, tentativo: f.tentativo,
      ...(f.comeDocumento ? { comeDocumento: true } : {}),
    };
    try {
      // Le letture a regole partono subito: il saldo si guarda solo per quelle che costano.
      const crediti = f.stimaEur > 0 ? await controllaCrediti(f.stimaEur) : null;
      if (crediti) throw new ErroreBozza(crediti);
      if (f.tipo === "contratto") {
        const fr = conInizioUtile(await servizi.frammentoContratto(f.refId!), opz.calendario);
        invia({ tipo: "frammenti", id: f.id, frammenti: [fr], patch: { etichetta: fr.fonte.etichetta, costoEur: 0, idFonte: fr.fonte.id ?? undefined } });
        return;
      }
      if (f.tipo === "commessa") {
        const frammenti = await servizi.frammentiCommessa(f.refId!);
        const commessa = frammenti[0];
        const scritte = Object.values(commessa?.aree ?? {}).reduce((n, area) => n + Object.keys(area ?? {}).length, 0);
        const modello = frammenti.find((x) => x.fonte.tipo === "modello");
        invia({
          tipo: "frammenti", id: f.id, frammenti, base: true,
          patch: { etichetta: commessa?.fonte.etichetta ?? f.etichetta, costoEur: 0, valori: scritte },
          messaggio: `Nella ${commessa?.fonte.etichetta ?? "commessa"} ci sono già ${scritte} cose: restano come sono. `
            + (modello ? `Non ha le fasi: te le propongo dal ${modello.fonte.etichetta}. ` : "")
            + "Ti propongo solo quello che manca; puoi farmi leggere anche i suoi documenti.",
        });
        return;
      }
      if (f.tipo === "preventivo") {
        const frammenti = await servizi.frammentiPreventivo(f.refId!, opz.inizio);
        invia({ tipo: "frammenti", id: f.id, frammenti, patch: { etichetta: frammenti[0]?.fonte.etichetta ?? f.etichetta, costoEur: 0 } });
        return;
      }
      if (f.tipo === "computo") {
        const fr = await servizi.frammentoComputo(companyId, f.refId!, opz.inizio);
        if (!fr) throw new Error("Computo non trovato, o non hai il permesso di vederlo.");
        invia({ tipo: "frammenti", id: f.id, frammenti: [fr], patch: { etichetta: fr.fonte.etichetta, costoEur: 0 } });
        return;
      }
      // Un documento che sta già da qualche parte si legge lì: niente copie in silvio-uploads.
      // Il file scaricato resta sulla fonte per la ⓘ.
      let file = f.file;
      let origine: OrigineDocumento | null = null;
      if (f.tipo === "allegato") {
        file ??= await servizi.scaricaAllegato(f.allegato!);
        origine = { documento: { tipo: "allegato_commessa", id: f.allegato!.id } };
      } else if (f.tipo === "caricato") {
        file ??= await servizi.scaricaCaricato(f.percorso!, f.etichetta, f.mime);
        origine = { percorso: f.percorso! };
      }
      if (file && file !== f.file) invia({ tipo: "aggiorna_fonte", id: f.id, patch: { file } });
      const esito = f.tipo === "documento" ? await servizi.leggiRemoto(f.documento!, { nome: f.etichetta, mime: f.mime }, opz)
        : file ? await servizi.leggiFile(file, { ...opz, origine })
          : await servizi.leggiTesto(f.testo ?? "", opz);
      if (f.stimaEur > 0) speso();
      if (esito.daCollegare) {
        invia({ tipo: "aggiorna_fonte", id: f.id, patch: { stato: "da_collegare", costoEur: 0 } });
        invia({
          tipo: "messaggio", tono: "avviso",
          testo: `«${f.etichetta}» sembra l'offerta di una ditta: il suo totale è un costo, non l'importo della commessa. `
            + "Si collega a una richiesta d'offerta e arriva con ditte e costi; se non è un'offerta, dalle Fonti si legge come un documento normale.",
        });
        return;
      }
      const costo = esito.frammenti.reduce((t, x) => t + (x.costoEur ?? 0), 0);
      // Un documento della commessa c'è già tra i suoi documenti: non si ricopia dopo «Completa».
      // Un file nuovo, o già caricato dalla chat, va con la commessa quando nasce.
      const percorso = esito.percorso ?? (f.tipo === "caricato" ? f.percorso : undefined);
      const caricata: FonteCaricata | undefined = percorso && file && (f.tipo === "file" || f.tipo === "caricato")
        ? { path: percorso, nome: file.name, mime: file.type || null, dimensione: file.size, fonte: f.etichetta }
        // Un allegato di un'email va con la commessa anche lui: lo copia la funzione dopo «Crea».
        : f.tipo === "documento" && f.documento?.tipo === "allegato_email"
          ? { path: "", documento: f.documento, nome: f.etichetta, mime: f.mime ?? null, fonte: f.etichetta }
          : undefined;
      invia({
        tipo: "frammenti", id: f.id, frammenti: esito.frammenti, caricata,
        patch: { costoEur: costo, ...(esito.idFonte ? { idFonte: esito.idFonte } : {}) },
      });
    } catch (e) {
      const testo = erroreLeggibile(e, "il servizio non ha risposto.");
      invia({ tipo: "aggiorna_fonte", id: f.id, patch: { stato: "errore", errore: testo } });
      invia({ tipo: "messaggio", tono: "errore", testo: `Non sono riuscito a leggere «${f.etichetta}»: ${/[.!?…]$/.test(testo) ? testo : `${testo}.`} Il resto va avanti; puoi riprovare.` });
    } finally {
      avviate.current.delete(f.id);
    }
  }, [companyId, userId, servizi, controllaCrediti]);

  // La coda: al massimo LETTURE_INSIEME letture alla volta.
  useEffect(() => {
    // `avviate` ha le letture partite e non finite (le toglie il `finally` di `leggi`).
    let posti = LETTURE_INSIEME - avviate.current.size;
    for (const f of s.fonti) {
      if (posti <= 0) break;
      if (f.stato !== "in_coda" || avviate.current.has(f.id)) continue;
      avviate.current.add(f.id);
      posti -= 1;
      void leggi(f);
    }
  }, [s.fonti, leggi]);

  const aggiungi = useCallback((nuove: FonteDaAggiungere[]) => {
    const fonti = nuove.map((n): FonteNelPopup => {
      const base = { id: nuovoId(), avvisi: [] as string[], tentativo: 0 };
      switch (n.tipo) {
        case "commessa":
          return { ...base, tipo: "commessa", refId: n.id, etichetta: n.etichetta ?? "la commessa", stato: "in_coda", stimaEur: 0 };
        case "allegato": {
          // Si aggiunge col tocco su «Leggi», che mostrava già la stima: parte subito.
          const r = riconosciDocumento({ nome: n.allegato.nome, mime: n.allegato.mime ?? "" });
          const comune = { ...base, tipo: "allegato" as const, allegato: n.allegato, etichetta: n.allegato.nome };
          if (r.lettore === "non_letto") return { ...comune, stato: "errore", errore: r.motivo, stimaEur: 0 };
          return { ...comune, stato: "in_coda", stimaEur: stimaLettura(r, n.allegato.dimensione ?? 0) };
        }
        case "preventivo":
          return { ...base, tipo: "preventivo", refId: n.id, etichetta: n.etichetta ?? "preventivo", stato: "in_coda", stimaEur: 0 };
        case "computo":
          return { ...base, tipo: "computo", refId: n.id, etichetta: n.etichetta ?? "computo", stato: "in_coda", stimaEur: 0 };
        case "contratto":
          return { ...base, tipo: "contratto", refId: n.id, etichetta: n.etichetta ?? "contratto", stato: "in_coda", stimaEur: 0 };
        case "caricato":
        case "documento": {
          const r = riconosciDocumento({ nome: n.nome, mime: n.mime ?? "" });
          const comune = {
            ...base, tipo: n.tipo, etichetta: n.nome, mime: n.mime ?? null,
            ...(n.tipo === "caricato" ? { percorso: n.path } : { documento: n.documento }),
          };
          if (r.lettore === "non_letto") return { ...comune, stato: "errore", errore: r.motivo, stimaEur: 0 };
          const stima = stimaLettura(r, n.tipo === "documento" ? n.dimensione ?? 0 : 0);
          return { ...comune, stato: stima > 0 && !n.confermata ? "da_confermare" : "in_coda", stimaEur: stima };
        }
        case "testo":
          // Il testo della persona parte: l'ha mandato col pulsante che mostrava già il costo. Quello di un link aspetta «Leggi».
          return { ...base, tipo: "testo", testo: n.testo, etichetta: n.daLink ? "testo dal link" : "testo scritto", stato: n.daLink ? "da_confermare" : "in_coda", stimaEur: 0.005 };
        case "file": {
          const r = riconosciDocumento({ nome: n.file.name, mime: n.file.type });
          if (r.lettore === "non_letto") {
            return { ...base, tipo: "file", file: n.file, etichetta: n.file.name, stato: "errore", errore: r.motivo, stimaEur: 0 };
          }
          if (r.ai && n.file.size > MASSIMO_FILE_AI_BYTE) {
            return { ...base, tipo: "file", file: n.file, etichetta: n.file.name, stato: "errore", stimaEur: 0,
              errore: `troppo grande (${Math.ceil(n.file.size / (1024 * 1024))} MB, il massimo è 20 MB): caricane uno più leggero` };
          }
          const stima = stimaLettura(r, n.file.size);
          return { ...base, tipo: "file", file: n.file, etichetta: n.file.name, stato: stima > 0 ? "da_confermare" : "in_coda", stimaEur: stima };
        }
      }
    });
    invia({ tipo: "aggiungi_fonti", fonti });
    // Quello che la persona ha scritto si vede come suo messaggio, anche quando diventa una fonte.
    for (const n of nuove) if (n.tipo === "testo" && !n.daLink) invia({ tipo: "messaggio", tono: "persona", testo: n.testo });
    // Sul telefono si parte dalla chat: un file rifiutato non può dirlo solo la scheda Fonti.
    for (const f of fonti) if (f.stato === "errore") invia({ tipo: "messaggio", tono: "errore", testo: `«${f.etichetta}»: ${f.errore}.` });
  }, []);

  /** «Leggi»: le fonti che aspettavano il via per il costo entrano in coda. */
  const confermaLetture = useCallback(() => {
    for (const f of ultimo.current.fonti) {
      if (f.stato === "da_confermare") invia({ tipo: "aggiorna_fonte", id: f.id, patch: { stato: "in_coda" } });
    }
  }, []);

  const riprova = useCallback((id: string) => {
    const f = ultimo.current.fonti.find((x) => x.id === id);
    if (!f || f.stato !== "errore" || (f.tipo === "file" && !f.file) || (f.tipo === "allegato" && !f.allegato)) return;
    invia({ tipo: "aggiorna_fonte", id, patch: { stato: "in_coda", errore: undefined, tentativo: f.tentativo + 1 } });
  }, []);

  const togliFonte = useCallback((id: string) => invia({ tipo: "togli_fonte", id }), []);

  /** «Leggilo come documento normale»: un'offerta da collegare che non è un'offerta (P6). */
  const leggiComeDocumento = useCallback((id: string) => {
    invia({ tipo: "aggiorna_fonte", id, patch: { stato: "in_coda", comeDocumento: true, errore: undefined } });
  }, []);

  /** Le modifiche a mano: quello che si portano dietro lo dice `conConseguenze`, come per la chat. */
  const modifica = useCallback((voluta: Modifica | Modifica[]) => {
    invia({ tipo: "modifiche", modifiche: conConseguenze(ultimo.current.piano, Array.isArray(voluta) ? [...voluta] : [voluta]) });
  }, []);

  const indietro = useCallback(() => invia({ tipo: "annulla" }), []);

  // ── La chat sulla bozza ──
  const [scrivendo, setScrivendo] = useState(false);
  const [costoChat, setCostoChat] = useState(0);
  const inviate = useRef(0);
  /** Il semaforo della chat: si prende prima di ogni await, così due invii di fila non partono due volte. */
  const inCorso = useRef(false);
  /**
   * Un messaggio a Silvio. «annulla» si fa qui; il resto va al modello, e la risposta torna
   * modifiche applicate insieme. Restituisce false se non è partito (crediti, altro in corso).
   */
  const scrivi = useCallback(async (testo: string): Promise<boolean> => {
    const t = testo.trim();
    if (!t || inCorso.current) return false;
    const precedenti = ultimo.current.messaggi;
    invia({ tipo: "messaggio", tono: "persona", testo: t });
    if (eAnnulla(t)) {
      const vuota = !ultimo.current.storia.length;
      if (!vuota) invia({ tipo: "annulla" });
      invia({ tipo: "messaggio", tono: "silvio", testo: vuota ? "Non c'è niente da annullare." : "Fatto: ho rimesso com'era prima dell'ultima modifica." });
      return true;
    }
    inCorso.current = true;
    setScrivendo(true);
    try {
      const crediti = await controllaCrediti(STIMA_CHAT_EUR);
      if (crediti) {
        invia({ tipo: "messaggio", tono: "errore", testo: crediti });
        return false;
      }
      const oggi = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
      const risposta = await servizi.chat({
        companyId, messaggio: t, contesto: pianoPerLaChat(vistaPerLaChat(ultimo.current.piano, vedeImporti, vedeCosti), oggi),
        storia: precedenti.filter((m) => m.tono === "persona" || m.tono === "silvio").slice(-6)
          .map((m) => ({ ruolo: m.tono === "persona" ? "persona" as const : "silvio" as const, testo: m.testo })),
        richiestaId: `${idBozza ?? "nuova"}-${Date.now().toString(36)}-${inviate.current++}`,
      });
      speso();
      setCostoChat((c) => c + risposta.costoEur);
      // Sulla bozza di adesso: nel frattempo può essere arrivata una lettura.
      const esito = eseguiRisposta(ultimo.current.piano, risposta.strumenti, (c, x) => testoValore(c, x, vedeCosti), {
        autonomia, riservata: (c) => riservataPerProfilo(c, vedeImporti, vedeCosti), messaggioPersona: t,
      });
      const righe = esito.righe.length ? esito.righe : [risposta.testo || "Non ho capito cosa cambiare: prova a dirlo in un altro modo."];
      invia({ tipo: "modifiche", modifiche: conConseguenze(ultimo.current.piano, esito.modifiche), dallaChat: { righe } });
      return true;
    } catch (e) {
      const m = e instanceof Error ? e.message : messaggioErrore(e);
      invia({ tipo: "messaggio", tono: "errore", testo: /credit|ricaric|402/i.test(m)
        ? `I crediti AI sono finiti: ${erroreLeggibile(m, "ricarica e riprova.")}`
        : `Non riesco a rispondere: ${erroreLeggibile(m, "il servizio non ha risposto, riprova tra poco.")}` });
      return false;
    } finally {
      inCorso.current = false;
      setScrivendo(false);
    }
  }, [controllaCrediti, servizi, companyId, idBozza, autonomia, vedeImporti, vedeCosti]);

  /** Le variabili cambiate dalla chat che l'utente ha guardato. */
  const visto = useCallback((chiavi: string | string[]) => {
    const elenco = Array.isArray(chiavi) ? chiavi : [chiavi];
    if (elenco.some((k) => ultimo.current.daGuardare.includes(k))) invia({ tipo: "visto", chiavi: elenco });
  }, []);

  /** La fonte del popup da cui viene un valore: per la ⓘ che riapre il documento. */
  const fonteDelPopup = useCallback((fonte: Fonte): FonteNelPopup | null => {
    const fonti = ultimo.current.fonti;
    return (fonte.id ? fonti.find((f) => f.idFonte === fonte.id) : undefined)
      ?? fonti.find((f) => f.etichetta === fonte.etichetta && (f.file || f.documento || f.percorso || f.allegato)) ?? null;
  }, []);

  const riprendi = useCallback((b: Bozza) => {
    bozzaId.current = b.id;
    setIdBozza(b.id);
    setSalvataggio({ tipo: "salvata" });
    invia({ tipo: "riprendi", bozza: b });
    if (b.modo === "crea") void scartaVecchie(b.id);
  }, [scartaVecchie]);

  /** «Crea» (o «Completa»): salva quello che aspetta, scrive, registra le correzioni. */
  const crea = useCallback(async (): Promise<EsitoCommessa> => {
    // L'autonomia si rilegge adesso (quarta revisione, 1): il popup può essere aperto da ore. Il
    // database toglie da solo quello che è «vietata» (`_silvio_scrittura_permessa`), ma non distingue
    // «chiede» da «da sola»: se la scrittura cambierebbe, la persona la ricontrolla prima di scrivere.
    let adesso = ultimeImpostazioni.current;
    try {
      adesso = (await servizi.impostazioni?.(companyId)) ?? adesso;
    } catch {
      // Non si legge: restano quelle di prima, e il database controlla comunque i divieti.
    }
    if (!stessoValore(adesso.autonomia, ultimeImpostazioni.current.autonomia)) {
      const cambia = !stessoValore(
        scritturaDalPiano(ultimo.current.piano, ultimeImpostazioni.current.autonomia),
        scritturaDalPiano(ultimo.current.piano, adesso.autonomia),
      );
      ultimeImpostazioni.current = adesso;
      setImpostazioni(adesso);
      if (cambia) throw new ErroreBozza("Nel frattempo sono cambiate le impostazioni di Silvio e quello che scriverebbe è diverso: ricontrolla e premi di nuovo.");
    }
    // Si salva sempre, anche una bozza ripresa senza modifiche o la sola lettura della commessa: la
    // scrittura nel database può venire da un'autonomia di allora.
    const dati = ultimo.current;
    salvatore().programma({ piano: dati.piano, storia: dati.storia, caricate: dati.caricate, autonomia: adesso.autonomia });
    await salvatore().subito();
    // `subito` non lancia: un salvataggio fallito resta in coda. Scrivere adesso vorrebbe dire
    // creare la commessa dalla versione di prima (P1). Fa eccezione la bozza già scritta: la
    // risposta di prima si è persa, e la RPC restituisce la commessa che c'è (D9).
    if (salvatore().inAttesa()) {
      if (erroreSalvataggio.current?.codice === BOZZA_GIA_SCRITTA) salvatore().annulla();
      else throw new ErroreBozza(`L'ultima modifica non si è salvata, e non creo una commessa da una bozza vecchia. ${erroreSalvataggio.current?.message ?? "Riprova tra poco."}`);
    }
    const id = bozzaId.current;
    if (!id) throw new ErroreBozza("La bozza non è ancora salvata: controlla la connessione e riprova.");
    const { piano, storia, caricate } = ultimo.current;
    const esito = await (orderId ? completaCommessa : creaCommessa)({ id, fonti: caricate, company_id: companyId }, servizi.db);
    // Una commessa già scritta ha già registrato le sue correzioni.
    if (esito.gia_creata || esito.gia_completata) return esito;
    try {
      await servizi.registraCorrezioni(correzioniDalPiano(pianoProposto(piano, storia), piano, { bozzaId: id, orderId: esito.order_id }));
    } catch {
      // La misura di Silvio non ferma la commessa, che è già nata.
    }
    return esito;
  }, [salvatore, servizi, orderId, companyId]);

  /** «Riprova» sugli allegati che non si sono copiati. */
  const riallega = useCallback(async (orderId: string, nomi: string[]) => {
    const id = bozzaId.current;
    if (!id) throw new ErroreBozza("Bozza non trovata.");
    return allegaFonti({ id, company_id: companyId, fonti: ultimo.current.caricate.filter((c) => nomi.includes(c.nome)) }, orderId, servizi.db);
  }, [servizi.db, companyId]);

  // ── Fase 4: persone, ditte, mezzi, acquisti ──
  const { data: staffUtenti } = useCompanyStaffUsers(companyId);
  const [contesto, setContesto] = useState<ContestoRisorse | null>(null);
  const contestoChiesto = useRef(false);
  const ciSonoFasi = Array.isArray(s.piano.aree.fasi?.["fasi.order_work_phases"]?.valore);
  // I dati dell'azienda si leggono una volta, quando la bozza ha le fasi (e lo staff è arrivato).
  useEffect(() => {
    if (!ciSonoFasi || !staffUtenti || contestoChiesto.current) return;
    contestoChiesto.current = true;
    const staff = staffUtenti.map((u) => ({ id: u.id, nome: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email || "Collega" }));
    servizi.contestoRisorse(companyId, staff, orderId).then(setContesto, () => {
      contestoChiesto.current = false; // Riprova al prossimo cambiamento delle fasi.
    });
  }, [ciSonoFasi, staffUtenti, servizi, companyId, orderId]);
  // ── Fase 5: cosa fa Silvio da solo, e il calendario del cantiere ──
  useEffect(() => {
    let vivo = true;
    servizi.impostazioni?.(companyId).then((i) => { if (vivo) setImpostazioni(i); }, () => { /* resta il predefinito: tutto «chiede» */ });
    return () => { vivo = false; };
  }, [servizi, companyId]);
  const indirizzoCantiere = (() => {
    const v = s.piano.aree.cantiere?.["cantiere.indirizzo"]?.valore as { indirizzo_lavori?: string; work_address?: string } | string | undefined;
    return typeof v === "string" ? v : v?.indirizzo_lavori ?? v?.work_address ?? null;
  })();
  useEffect(() => {
    const cal = calendarioAzienda(impostazioni.calendario, indirizzoCantiere);
    // Il patrono dipende dalla città del cantiere: si rimette solo se cambia davvero.
    if (JSON.stringify(cal) !== JSON.stringify(ultimo.current.piano.calendario ?? null)) invia({ tipo: "calendario", calendario: cal });
  }, [impostazioni.calendario, indirizzoCantiere]);

  // Le proposte si rifanno quando cambia quello da cui dipendono; se non cambia niente, niente.
  const primaVolta = useRef(true);
  useEffect(() => {
    if (!contesto) return;
    const fr = proposteRisorse(s.piano, contesto, autonomia);
    if (!fr || !portaQualcosa(s.piano, fr)) return;
    const muto = !primaVolta.current;
    primaVolta.current = false;
    invia({ tipo: "frammenti", id: "silvio-risorse", frammenti: [fr], muto, ...(muto ? {} : { messaggio: riassuntoRisorse(fr) }) });
  }, [s.piano, contesto, autonomia]);

  /**
   * L'offerta di una ditta, rimasta «da collegare»: si legge dentro la sua richiesta d'offerta e
   * diventa l'ordine in bozza a quel fornitore, coi prezzi e i tempi di consegna dell'offerta.
   */
  const collegaOfferta = useCallback(async (fonteId: string, richiesta: RichiestaOfferta) => {
    const f = ultimo.current.fonti.find((x) => x.id === fonteId);
    if (!f) return;
    invia({ tipo: "aggiorna_fonte", id: f.id, patch: { stato: "in_lettura", errore: undefined } });
    try {
      const crediti = await controllaCrediti(STIMA_OFFERTA_EUR);
      if (crediti) throw new ErroreBozza(crediti);
      let file = f.file;
      if (!file && f.tipo === "allegato") file = await servizi.scaricaAllegato(f.allegato!);
      if (!file && f.tipo === "caricato") file = await servizi.scaricaCaricato(f.percorso!, f.etichetta, f.mime);
      if (!file) throw new ErroreBozza("Questo allegato non si legge da qui: scaricalo e trascinalo tra le fonti, poi collegalo.");
      const { offerta, quantita } = await servizi.leggiOfferta(richiesta.id, file);
      speso();
      const fr = frammentoDaOfferta(offerta, richiesta, ultimo.current.piano, quantita, oggiInItalia());
      invia({
        tipo: "frammenti", id: f.id, frammenti: [fr],
        patch: { etichetta: fr.fonte.etichetta, idFonte: fr.fonte.id ?? undefined, costoEur: STIMA_OFFERTA_EUR },
        messaggio: `Ho letto l'${fr.fonte.etichetta}: ne ho fatto l'ordine in bozza a ${richiesta.fornitore}, coi suoi prezzi. Lo confermi tu, e lo mandi dalla pagina dell'ordine.`,
      });
    } catch (e) {
      const testo = erroreLeggibile(e, "il servizio non ha risposto.");
      invia({ tipo: "aggiorna_fonte", id: f.id, patch: { stato: "da_collegare", errore: testo } });
      invia({ tipo: "messaggio", tono: "errore", testo: `Non sono riuscito a leggere l'offerta: ${testo}` });
    }
  }, [servizi, controllaCrediti]);

  const scrittura = useMemo(() => scritturaDalPiano(s.piano, autonomia), [s.piano, autonomia]);

  return {
    piano: s.piano, storia: s.storia, fonti: s.fonti, caricate: s.caricate, evidenziate: s.evidenziate,
    messaggi: s.messaggi, scrittura, salvataggio, idBozza, daGuardare: s.daGuardare, scrivendo, costoChat,
    aggiungi, confermaLetture, riprova, togliFonte, leggiComeDocumento, modifica, indietro, riprendi, crea, riallega,
    scrivi, visto, fonteDelPopup, controllaCrediti, collegaOfferta, contesto, autonomia,
  };
}

export type BozzaSilvio = ReturnType<typeof useBozzaSilvio>;
