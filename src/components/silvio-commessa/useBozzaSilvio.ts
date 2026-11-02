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
import type { Fonte, Frammento, Modifica, PianoCommessa } from "../../../shared/silvio-commessa/piano.ts";
import { eAnnulla, eseguiRisposta, pianoPerLaChat, STIMA_CHAT_EUR } from "../../../shared/silvio-commessa/chat.ts";
import type { FonteDaLink, RifDocumento } from "../../../shared/silvio-commessa/ingressi.ts";
import {
  annulla, applica, fondi, giaNellaCommessa, modificaBloccata, pianoVuoto, stessoValore, type Passo,
} from "../../../shared/silvio-commessa/fondi.ts";
import { riconosciDocumento } from "../../../shared/silvio-commessa/riconoscitore.ts";
import {
  frammentoDaOfferta, proposteRisorse, riassuntoRisorse, type ContestoRisorse, type RichiestaOfferta,
} from "../../../shared/silvio-commessa/risorse.ts";
import { oggiInItalia } from "../../../shared/silvio-commessa/date.ts";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { dateDelleFasi } from "../../../shared/silvio-commessa/modelliLavoro.ts";
import type { FaseDelPiano } from "../../../shared/silvio-commessa/piano.ts";
import { scritturaDalPiano } from "@/lib/silvio-commessa/scrittura";
import { IMPOSTAZIONI_PREDEFINITE, type ImpostazioniSilvio } from "@/lib/silvio-commessa/autonomia";
import { calendarioAzienda, lavorativiTra, type CalendarioCantiere } from "../../../shared/silvio-commessa/calendario.ts";
import type { AllegatoCommessa } from "@/lib/silvio-commessa/lettori";
import type { OrigineDocumento } from "@/lib/silvio-commessa/leggiDocumento";
import {
  completaCommessa, creaBozza, creaCommessa, ErroreBozza, messaggioErrore, salvaBozza, salvataggioConAttesa, allegaFonti,
  type Bozza, type EsitoCommessa, type FonteCaricata, type SalvataggioConAttesa,
} from "@/lib/silvio-commessa/bozze";
import { correzioniDalPiano } from "@/lib/silvio-commessa/correzioni";
import { euroAI, pianoProposto, riassuntoFrammento, stimaLettura, testoValore } from "./presentazione";
import type { ServiziSilvioCommessa } from "./servizi";

export const LETTURE_INSIEME = 3;

/**
 * Quello che una modifica si porta dietro, come se lo aspetta chi la fa (01/11/2026):
 * - la data d'inizio nuova sposta anche le fasi che hanno già le date (dello stesso numero di
 *   giorni lavorativi), prima di scriversi;
 * - togliere una ditta toglie anche il suo contratto in bozza.
 * Tutte insieme: un annulla le toglie tutte.
 */
export function conConseguenze(piano: PianoCommessa, modifiche: Modifica[]): Modifica[] {
  const out: Modifica[] = [];
  for (const m of modifiche) {
    if (m.tipo === "cambia_valore" && m.chiave === "fasi.work_start_date" && typeof m.valore === "string") {
      const prima = piano.aree.fasi?.["fasi.work_start_date"]?.valore;
      const fasi = piano.aree.fasi?.["fasi.order_work_phases"];
      const datate = Array.isArray(fasi?.valore) && (fasi!.valore as FaseDelPiano[]).some((f) => f.start_date);
      const inizio = typeof prima === "string" ? prima
        : datate ? (fasi!.valore as FaseDelPiano[]).map((f) => f.start_date).filter((d): d is string => !!d).sort()[0] : null;
      const n = inizio && datate && !giaNellaCommessa(piano, fasi) ? lavorativiTra(inizio, m.valore, piano.calendario) : 0;
      if (n) out.push({ tipo: "sposta_date", giorniLavorativi: n, daFase: null });
    }
    out.push(m);
    if (m.tipo === "togli" && m.chiave === "ditte.assegnate") {
      const contratti = piano.aree.ditte?.["ditte.contratti"]?.valore;
      if (!Array.isArray(contratti) || !contratti.length) continue;
      if (m.indice == null) { out.push({ tipo: "togli", area: "ditte", chiave: "ditte.contratti" }); continue; }
      const ditta = (piano.aree.ditte?.["ditte.assegnate"]?.valore as { nome?: string }[] | undefined)?.[m.indice]?.nome;
      const i = ditta ? (contratti as { nome?: string }[]).findIndex((c) => c?.nome === ditta) : -1;
      if (i >= 0) out.push({ tipo: "togli", area: "ditte", chiave: "ditte.contratti", indice: i });
    }
  }
  return out;
}
/** Una lettura di un'offerta con `rdo-ai-estrai-offerta`: una pagina o due, come un documento. */
export const STIMA_OFFERTA_EUR = 0.03;

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
}

export interface Messaggio {
  id: number;
  testo: string;
  /** «persona» = scritto (o dettato) dall'utente nella chat. */
  tono: "silvio" | "avviso" | "errore" | "persona";
  /** Le variabili che questa risposta ha cambiato: «Vedi» le mostra. */
  chiavi?: string[];
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
    case "togli_fonte":
      return { ...s, fonti: s.fonti.filter((f) => f.id !== a.id) };
    case "frammenti": {
      const piano = a.frammenti.reduce((p, fr) => fondi(p, fr), s.piano);
      const cambiate = chiaviCambiate(s.piano, piano);
      const fonte = s.fonti.find((f) => f.id === a.id);
      let messaggi = s.messaggi;
      const conMessaggio = (t: string, tono: Messaggio["tono"] = "silvio") => { messaggi = messaggio({ ...s, messaggi }, t, tono); };
      if (!a.muto) conMessaggio(a.messaggio ?? riassuntoFrammento(fonte?.etichetta ?? a.frammenti[0]?.fonte.etichetta ?? "la fonte", cambiate));
      const nuoviConflitti = piano.conflitti.length - s.piano.conflitti.length;
      if (nuoviConflitti > 0) {
        conMessaggio(nuoviConflitti === 1
          ? "Su un valore le fonti non sono d'accordo: l'ho segnato con ⚠, scegli tu."
          : `Su ${nuoviConflitti} valori le fonti non sono d'accordo: li ho segnati con ⚠, scegli tu.`, "avviso");
      }
      const avvisi = a.frammenti.flatMap((f) => f.avvisi ?? []);
      return {
        ...s,
        piano,
        fonti: s.fonti.map((f) => (f.id === a.id ? { ...f, stato: "fatta", avvisi, valori: cambiate.length, ...a.patch } : f)),
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
        return { ...s, messaggi: messaggio(s, e instanceof Error ? e.message : String(e), "errore") };
      }
      const cambiate = chiaviCambiate(s.piano, bozza.piano);
      return {
        ...s, ...bozza,
        evidenziate: [...new Set([...s.evidenziate, ...cambiate])],
        versione: s.versione + 1,
        ...(a.dallaChat ? {
          daGuardare: [...new Set([...s.daGuardare, ...cambiate])],
          messaggi: messaggio(s, a.dallaChat.righe.join(" "), "silvio", cambiate),
        } : {}),
      };
    }
    case "visto":
      return { ...s, daGuardare: s.daGuardare.filter((k) => !a.chiavi.includes(k)) };
    case "annulla": {
      if (!s.storia.length) return s;
      const bozza = annulla(s.piano, s.storia);
      return {
        ...s, ...bozza,
        evidenziate: [...new Set([...s.evidenziate, ...chiaviCambiate(s.piano, bozza.piano)])],
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
      return {
        ...s,
        piano,
        storia: (a.bozza.storia ?? []) as Passo[],
        caricate: a.bozza.fonti ?? [],
        fonti: piano.fonti.map((f) => ({
          id: nuovoId(), tipo: "ripresa", etichetta: f.etichetta, stato: "fatta", stimaEur: 0, avvisi: [] as string[], tentativo: 0,
          ...(f.id ? { idFonte: f.id } : {}),
        })),
        messaggi: messaggio(s, "Ho ripreso la bozza com'era: puoi continuare da dove eri rimasto."),
        versione: s.versione,
      };
    }
  }
}

interface DatiBozza { piano: PianoCommessa; storia: Passo[]; caricate: FonteCaricata[] }

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
  | { tipo: "testo"; testo: string }
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
      case "testo": return { tipo: "testo", testo: f.testo };
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
}

export function useBozzaSilvio({ companyId, userId, servizi, orderId = null, attesaMs = 800 }: OpzioniBozza) {
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

  // Uno per popup, nato al primo uso (mai durante il render): azienda e client non cambiano.
  const salvaRef = useRef<SalvataggioConAttesa<DatiBozza> | null>(null);
  const salvatore = useCallback(() => (salvaRef.current ??= salvataggioConAttesa<DatiBozza>(
    async (d) => {
      setSalvataggio({ tipo: "in_corso" });
      if (!bozzaId.current) {
        const b = await creaBozza({ companyId, orderId, piano: d.piano, fonti: d.caricate }, servizi.db);
        bozzaId.current = b.id;
        setIdBozza(b.id);
        if (d.storia.length) await salvaBozza(b.id, { piano: d.piano, fonti: d.caricate, storia: d.storia }, servizi.db);
        return;
      }
      await salvaBozza(bozzaId.current, { piano: d.piano, fonti: d.caricate, storia: d.storia }, servizi.db);
    },
    {
      attesaMs,
      quandoSalvato: () => setSalvataggio({ tipo: "salvata" }),
      quandoSbaglia: (e) => setSalvataggio({ tipo: "errore", messaggio: e.message }),
    },
  )), [companyId, orderId, servizi.db, attesaMs]);

  // Ogni cambiamento del piano (o delle fonti caricate) va nella bozza, con l'attesa.
  useEffect(() => {
    if (s.versione === 0) return;
    salvatore().programma({ piano: s.piano, storia: s.storia, caricate: s.caricate });
  }, [s.versione, s.piano, s.storia, s.caricate, salvatore]);

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
    if (esito.bloccato) return "Le chiamate AI dell'azienda sono ferme per credito: ricarica i crediti e riprova.";
    if (esito.saldoEur != null && esito.saldoEur < stimaEur) {
      return `I crediti AI non bastano (servono circa ${euroAI(stimaEur)}, ne restano ${euroAI(Math.max(0, esito.saldoEur))}): ricarica e riprova.`;
    }
    return null;
  }, [servizi, companyId]);
  /** Dopo una spesa il saldo si rilegge. */
  const speso = () => { saldo.current = null; };

  const leggi = useCallback(async (f: FonteNelPopup) => {
    invia({ tipo: "aggiorna_fonte", id: f.id, patch: { stato: "in_lettura", errore: undefined } });
    const opz = { companyId, userId, inizio: inizioLavori(), tentativo: f.tentativo };
    try {
      // Le letture a regole partono subito: il saldo si guarda solo per quelle che costano.
      const crediti = f.stimaEur > 0 ? await controllaCrediti(f.stimaEur) : null;
      if (crediti) throw new ErroreBozza(crediti);
      if (f.tipo === "contratto") {
        const fr = await servizi.frammentoContratto(f.refId!);
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
            + "Si collega a una richiesta d'offerta: arriva con ditte e costi.",
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
      const testo = e instanceof ErroreBozza ? e.message : e instanceof Error ? e.message : messaggioErrore(e);
      invia({ tipo: "aggiorna_fonte", id: f.id, patch: { stato: "errore", errore: testo } });
      invia({ tipo: "messaggio", tono: "errore", testo: `Non sono riuscito a leggere «${f.etichetta}»: ${testo} Il resto va avanti; puoi riprovare.` });
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
          // Il testo l'ha mandato la persona col pulsante che mostrava già il costo.
          return { ...base, tipo: "testo", testo: n.testo, etichetta: "testo scritto", stato: "in_coda", stimaEur: 0.005 };
        case "file": {
          const r = riconosciDocumento({ nome: n.file.name, mime: n.file.type });
          if (r.lettore === "non_letto") {
            return { ...base, tipo: "file", file: n.file, etichetta: n.file.name, stato: "errore", errore: r.motivo, stimaEur: 0 };
          }
          const stima = stimaLettura(r, n.file.size);
          return { ...base, tipo: "file", file: n.file, etichetta: n.file.name, stato: stima > 0 ? "da_confermare" : "in_coda", stimaEur: stima };
        }
      }
    });
    invia({ tipo: "aggiungi_fonti", fonti });
    // Quello che la persona ha scritto si vede come suo messaggio, anche quando diventa una fonte.
    for (const n of nuove) if (n.tipo === "testo") invia({ tipo: "messaggio", tono: "persona", testo: n.testo });
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

  /**
   * Le modifiche a mano. Con la data d'inizio, le fasi che hanno i giorni ma non le date
   * le prendono (e la fine lavori, se manca): un passo per volta, ognuno si annulla.
   */
  const modifica = useCallback((voluta: Modifica | Modifica[]) => {
    const modifiche = conConseguenze(ultimo.current.piano, Array.isArray(voluta) ? [...voluta] : [voluta]);
    const m = modifiche[modifiche.length - 1];
    if (m.tipo === "cambia_valore" && m.chiave === "fasi.work_start_date" && typeof m.valore === "string") {
      const pianoOra = ultimo.current.piano;
      const elenco = pianoOra.aree.fasi?.["fasi.order_work_phases"];
      // Le fasi che la commessa ha già non si ridatano: le date le mette chi le ha scritte.
      // Quelle che ha senza date le prendono nella proposta (`fasi.date_fasi`).
      const chiave = giaNellaCommessa(pianoOra, elenco) ? "fasi.date_fasi" : "fasi.order_work_phases";
      const fasi = pianoOra.aree.fasi?.[chiave]?.valore;
      if (Array.isArray(fasi) && (fasi as FaseDelPiano[]).some((f) => !f.start_date && f.giorni)) {
        const datate = dateDelleFasi(fasi as FaseDelPiano[], m.valore, pianoOra.calendario);
        modifiche.push({ tipo: "cambia_valore", area: "fasi", chiave, valore: datate });
        const fine = datate.map((f) => f.end_date).filter(Boolean).sort().pop();
        if (fine && !ultimo.current.piano.aree.fasi?.["fasi.work_end_date"]) {
          modifiche.push({ tipo: "cambia_valore", area: "fasi", chiave: "fasi.work_end_date", valore: fine });
        }
      }
    }
    invia({ tipo: "modifiche", modifiche });
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
        companyId, messaggio: t, contesto: pianoPerLaChat(ultimo.current.piano, oggi),
        storia: precedenti.filter((m) => m.tono === "persona" || m.tono === "silvio").slice(-6)
          .map((m) => ({ ruolo: m.tono === "persona" ? "persona" as const : "silvio" as const, testo: m.testo })),
        richiestaId: `${idBozza ?? "nuova"}-${Date.now().toString(36)}-${inviate.current++}`,
      });
      speso();
      setCostoChat((c) => c + risposta.costoEur);
      // Sulla bozza di adesso: nel frattempo può essere arrivata una lettura.
      const esito = eseguiRisposta(ultimo.current.piano, risposta.strumenti, testoValore);
      const righe = esito.righe.length ? esito.righe : [risposta.testo || "Non ho capito cosa cambiare: prova a dirlo in un altro modo."];
      invia({ tipo: "modifiche", modifiche: conConseguenze(ultimo.current.piano, esito.modifiche), dallaChat: { righe } });
      return true;
    } catch (e) {
      const m = e instanceof Error ? e.message : messaggioErrore(e);
      invia({ tipo: "messaggio", tono: "errore", testo: /credit|ricaric|402/i.test(m) ? `I crediti AI sono finiti: ${m}` : `Non riesco a rispondere: ${m}` });
      return false;
    } finally {
      inCorso.current = false;
      setScrivendo(false);
    }
  }, [controllaCrediti, servizi, companyId, idBozza]);

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
  }, []);

  /** «Crea» (o «Completa»): salva quello che aspetta, scrive, registra le correzioni. */
  const crea = useCallback(async (): Promise<EsitoCommessa> => {
    // In «completa» la sola lettura della commessa non salva: prima di scrivere la bozza deve esserci.
    if (!bozzaId.current && !salvatore().inAttesa()) {
      const { piano, storia, caricate } = ultimo.current;
      salvatore().programma({ piano, storia, caricate });
    }
    await salvatore().subito();
    const id = bozzaId.current;
    if (!id) throw new ErroreBozza("La bozza non è ancora salvata: controlla la connessione e riprova.");
    const { piano, storia, caricate } = ultimo.current;
    const esito = await (orderId ? completaCommessa : creaCommessa)({ id, fonti: caricate, company_id: companyId }, servizi.db);
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
  const [impostazioni, setImpostazioni] = useState<ImpostazioniSilvio>(IMPOSTAZIONI_PREDEFINITE);
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
  const autonomia = impostazioni.autonomia;

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
      const testo = e instanceof Error ? e.message : messaggioErrore(e);
      invia({ tipo: "aggiorna_fonte", id: f.id, patch: { stato: "da_collegare", errore: testo } });
      invia({ tipo: "messaggio", tono: "errore", testo: `Non sono riuscito a leggere l'offerta: ${testo}` });
    }
  }, [servizi, controllaCrediti]);

  const scrittura = useMemo(() => scritturaDalPiano(s.piano, autonomia), [s.piano, autonomia]);

  return {
    piano: s.piano, storia: s.storia, fonti: s.fonti, caricate: s.caricate, evidenziate: s.evidenziate,
    messaggi: s.messaggi, scrittura, salvataggio, idBozza, daGuardare: s.daGuardare, scrivendo, costoChat,
    aggiungi, confermaLetture, riprova, togliFonte, modifica, indietro, riprendi, crea, riallega,
    scrivi, visto, fonteDelPopup, controllaCrediti, collegaOfferta, contesto, autonomia,
  };
}

export type BozzaSilvio = ReturnType<typeof useBozzaSilvio>;
