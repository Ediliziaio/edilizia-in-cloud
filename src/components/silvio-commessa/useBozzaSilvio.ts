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
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Fonte, Frammento, Modifica, PianoCommessa } from "../../../shared/silvio-commessa/piano.ts";
import { eAnnulla, eseguiRisposta, pianoPerLaChat, STIMA_CHAT_EUR } from "../../../shared/silvio-commessa/chat.ts";
import type { FonteDaLink, RifDocumento } from "../../../shared/silvio-commessa/ingressi.ts";
import {
  annulla, applica, fondi, giaNellaCommessa, modificaBloccata, pianoVuoto, type Passo,
} from "../../../shared/silvio-commessa/fondi.ts";
import { riconosciDocumento } from "../../../shared/silvio-commessa/riconoscitore.ts";
import { dateDelleFasi } from "../../../shared/silvio-commessa/modelliLavoro.ts";
import type { FaseDelPiano } from "../../../shared/silvio-commessa/piano.ts";
import { scritturaDalPiano } from "@/lib/silvio-commessa/scrittura";
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
  }
  | { tipo: "modifiche"; modifiche: Modifica[]; dallaChat?: { righe: string[] } }
  | { tipo: "visto"; chiavi: string[] }
  | { tipo: "annulla" }
  | { tipo: "spegni"; chiavi: string[] }
  | { tipo: "messaggio"; testo: string; tono: Messaggio["tono"]; chiavi?: string[] }
  | { tipo: "riprendi"; bozza: Bozza };

let contatore = 0;
const nuovoId = () => `f${Date.now().toString(36)}${(contatore++).toString(36)}`;

function messaggio(s: Stato, testo: string, tono: Messaggio["tono"] = "silvio", chiavi?: string[]): Messaggio[] {
  return [...s.messaggi, { id: (s.messaggi[s.messaggi.length - 1]?.id ?? 0) + 1, testo, tono, ...(chiavi?.length ? { chiavi } : {}) }];
}

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
      conMessaggio(a.messaggio ?? riassuntoFrammento(fonte?.etichetta ?? a.frammenti[0]?.fonte.etichetta ?? "la fonte", cambiate));
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
        caricate: a.caricata ? [...s.caricate.filter((c) => c.path !== a.caricata!.path), a.caricata] : s.caricate,
        evidenziate: a.base ? s.evidenziate : [...new Set([...s.evidenziate, ...cambiate])],
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
    case "riprendi": {
      // Una bozza che completa una commessa si rilegge sopra la commessa di adesso:
      // quello che nel frattempo qualcuno ha scritto vince.
      const piano = s.base.reduce((p, fr) => fondi(p, fr), a.bozza.piano);
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
    const modifiche: Modifica[] = Array.isArray(voluta) ? [...voluta] : [voluta];
    const m = modifiche[0];
    if (modifiche.length === 1 && m.tipo === "cambia_valore" && m.chiave === "fasi.work_start_date" && typeof m.valore === "string") {
      const pianoOra = ultimo.current.piano;
      const elenco = pianoOra.aree.fasi?.["fasi.order_work_phases"];
      // Le fasi che la commessa ha già non si ridatano: le date le mette chi le ha scritte.
      // Quelle che ha senza date le prendono nella proposta (`fasi.date_fasi`).
      const chiave = giaNellaCommessa(pianoOra, elenco) ? "fasi.date_fasi" : "fasi.order_work_phases";
      const fasi = pianoOra.aree.fasi?.[chiave]?.valore;
      if (Array.isArray(fasi) && (fasi as FaseDelPiano[]).some((f) => !f.start_date && f.giorni)) {
        const datate = dateDelleFasi(fasi as FaseDelPiano[], m.valore);
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
  /**
   * Un messaggio a Silvio. «annulla» si fa qui; il resto va al modello, e la risposta torna
   * modifiche applicate insieme. Restituisce false se non è partito (crediti, altro in corso).
   */
  const scrivi = useCallback(async (testo: string): Promise<boolean> => {
    const t = testo.trim();
    if (!t || scrivendo) return false;
    const precedenti = ultimo.current.messaggi;
    invia({ tipo: "messaggio", tono: "persona", testo: t });
    if (eAnnulla(t)) {
      const vuota = !ultimo.current.storia.length;
      if (!vuota) invia({ tipo: "annulla" });
      invia({ tipo: "messaggio", tono: "silvio", testo: vuota ? "Non c'è niente da annullare." : "Fatto: ho rimesso com'era prima dell'ultima modifica." });
      return true;
    }
    const crediti = await controllaCrediti(STIMA_CHAT_EUR);
    if (crediti) {
      invia({ tipo: "messaggio", tono: "errore", testo: crediti });
      return false;
    }
    setScrivendo(true);
    try {
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
      invia({ tipo: "modifiche", modifiche: esito.modifiche, dallaChat: { righe } });
      return true;
    } catch (e) {
      const m = e instanceof Error ? e.message : messaggioErrore(e);
      invia({ tipo: "messaggio", tono: "errore", testo: /credit|ricaric|402/i.test(m) ? `I crediti AI sono finiti: ${m}` : `Non riesco a rispondere: ${m}` });
      return false;
    } finally {
      setScrivendo(false);
    }
  }, [scrivendo, controllaCrediti, servizi, companyId, idBozza]);

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
    const esito = await (orderId ? completaCommessa : creaCommessa)({ id, fonti: caricate }, servizi.db);
    try {
      await servizi.registraCorrezioni(correzioniDalPiano(pianoProposto(piano, storia), piano, { bozzaId: id, orderId: esito.order_id }));
    } catch {
      // La misura di Silvio non ferma la commessa, che è già nata.
    }
    return esito;
  }, [salvatore, servizi, orderId]);

  /** «Riprova» sugli allegati che non si sono copiati. */
  const riallega = useCallback(async (orderId: string, nomi: string[]) => {
    const id = bozzaId.current;
    if (!id) throw new ErroreBozza("Bozza non trovata.");
    return allegaFonti({ id, fonti: ultimo.current.caricate.filter((c) => nomi.includes(c.nome)) }, orderId, servizi.db);
  }, [servizi.db]);

  const scrittura = useMemo(() => scritturaDalPiano(s.piano), [s.piano]);

  return {
    piano: s.piano, storia: s.storia, fonti: s.fonti, caricate: s.caricate, evidenziate: s.evidenziate,
    messaggi: s.messaggi, scrittura, salvataggio, idBozza, daGuardare: s.daGuardare, scrivendo, costoChat,
    aggiungi, confermaLetture, riprova, togliFonte, modifica, indietro, riprendi, crea, riallega,
    scrivi, visto, fonteDelPopup, controllaCrediti,
  };
}

export type BozzaSilvio = ReturnType<typeof useBozzaSilvio>;
