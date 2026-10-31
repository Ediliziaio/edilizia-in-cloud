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
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Frammento, Modifica, PianoCommessa } from "../../../shared/silvio-commessa/piano.ts";
import { annulla, applica, fondi, pianoVuoto, type Passo } from "../../../shared/silvio-commessa/fondi.ts";
import { riconosciDocumento } from "../../../shared/silvio-commessa/riconoscitore.ts";
import { dateDelleFasi } from "../../../shared/silvio-commessa/modelliLavoro.ts";
import type { FaseDelPiano } from "../../../shared/silvio-commessa/piano.ts";
import { scritturaDalPiano } from "@/lib/silvio-commessa/scrittura";
import {
  creaBozza, creaCommessa, ErroreBozza, messaggioErrore, salvaBozza, salvataggioConAttesa, allegaFonti,
  type Bozza, type EsitoCommessa, type FonteCaricata, type SalvataggioConAttesa,
} from "@/lib/silvio-commessa/bozze";
import { correzioniDalPiano } from "@/lib/silvio-commessa/correzioni";
import { pianoProposto, riassuntoFrammento, stimaLettura } from "./presentazione";
import type { ServiziSilvioCommessa } from "./servizi";

export const LETTURE_INSIEME = 3;

export type StatoFonte = "da_confermare" | "in_coda" | "in_lettura" | "fatta" | "errore" | "da_collegare";

export interface FonteNelPopup {
  id: string;
  tipo: "preventivo" | "computo" | "file" | "testo" | "ripresa";
  etichetta: string;
  stato: StatoFonte;
  /** Id della riga (preventivo, computo). */
  refId?: string;
  file?: File;
  testo?: string;
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
  tono: "silvio" | "avviso" | "errore";
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
}

type Azione =
  | { tipo: "aggiungi_fonti"; fonti: FonteNelPopup[] }
  | { tipo: "aggiorna_fonte"; id: string; patch: Partial<FonteNelPopup> }
  | { tipo: "togli_fonte"; id: string }
  | { tipo: "frammenti"; id: string; frammenti: Frammento[]; caricata?: FonteCaricata; patch?: Partial<FonteNelPopup> }
  | { tipo: "modifiche"; modifiche: Modifica[] }
  | { tipo: "annulla" }
  | { tipo: "spegni"; chiavi: string[] }
  | { tipo: "messaggio"; testo: string; tono: Messaggio["tono"] }
  | { tipo: "riprendi"; bozza: Bozza };

let contatore = 0;
const nuovoId = () => `f${Date.now().toString(36)}${(contatore++).toString(36)}`;

function messaggio(s: Stato, testo: string, tono: Messaggio["tono"] = "silvio"): Messaggio[] {
  return [...s.messaggi, { id: (s.messaggi[s.messaggi.length - 1]?.id ?? 0) + 1, testo, tono }];
}

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
      conMessaggio(riassuntoFrammento(fonte?.etichetta ?? a.frammenti[0]?.fonte.etichetta ?? "la fonte", cambiate));
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
        evidenziate: [...new Set([...s.evidenziate, ...cambiate])],
        messaggi,
        versione: s.versione + 1,
      };
    }
    case "modifiche": {
      let bozza = { piano: s.piano, storia: s.storia };
      try {
        for (const m of a.modifiche) bozza = applica(bozza.piano, m, bozza.storia);
      } catch (e) {
        return { ...s, messaggi: messaggio(s, e instanceof Error ? e.message : String(e), "errore") };
      }
      return {
        ...s, ...bozza,
        evidenziate: [...new Set([...s.evidenziate, ...chiaviCambiate(s.piano, bozza.piano)])],
        versione: s.versione + 1,
      };
    }
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
      return { ...s, messaggi: messaggio(s, a.testo, a.tono) };
    case "riprendi": {
      const piano = a.bozza.piano;
      return {
        ...s,
        piano,
        storia: (a.bozza.storia ?? []) as Passo[],
        caricate: a.bozza.fonti ?? [],
        fonti: piano.fonti.map((f) => ({
          id: nuovoId(), tipo: "ripresa", etichetta: f.etichetta, stato: "fatta", stimaEur: 0, avvisi: [] as string[], tentativo: 0,
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
  | { tipo: "preventivo"; id: string; etichetta?: string }
  | { tipo: "computo"; id: string; etichetta?: string }
  | { tipo: "file"; file: File }
  | { tipo: "testo"; testo: string };

export interface OpzioniBozza {
  companyId: string;
  userId: string;
  servizi: ServiziSilvioCommessa;
  /** Attesa del salvataggio automatico. */
  attesaMs?: number;
}

export function useBozzaSilvio({ companyId, userId, servizi, attesaMs = 800 }: OpzioniBozza) {
  const [s, invia] = useReducer(riduttore, undefined, (): Stato => ({
    piano: pianoVuoto(companyId), storia: [], fonti: [], caricate: [], evidenziate: [], messaggi: [], versione: 0,
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
        const b = await creaBozza({ companyId, piano: d.piano, fonti: d.caricate }, servizi.db);
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
  )), [companyId, servizi.db, attesaMs]);

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

  const leggi = useCallback(async (f: FonteNelPopup) => {
    invia({ tipo: "aggiorna_fonte", id: f.id, patch: { stato: "in_lettura", errore: undefined } });
    const opz = { companyId, userId, inizio: inizioLavori(), tentativo: f.tentativo };
    try {
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
      const esito = f.tipo === "file" ? await servizi.leggiFile(f.file!, opz) : await servizi.leggiTesto(f.testo ?? "", opz);
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
      const caricata: FonteCaricata | undefined = esito.percorso && f.file
        ? { path: esito.percorso, nome: f.file.name, mime: f.file.type || null, dimensione: f.file.size, fonte: f.etichetta }
        : undefined;
      invia({ tipo: "frammenti", id: f.id, frammenti: esito.frammenti, caricata, patch: { costoEur: costo } });
    } catch (e) {
      const testo = e instanceof ErroreBozza ? e.message : e instanceof Error ? e.message : messaggioErrore(e);
      invia({ tipo: "aggiorna_fonte", id: f.id, patch: { stato: "errore", errore: testo } });
      invia({ tipo: "messaggio", tono: "errore", testo: `Non sono riuscito a leggere «${f.etichetta}»: ${testo} Il resto va avanti; puoi riprovare.` });
    } finally {
      avviate.current.delete(f.id);
    }
  }, [companyId, userId, servizi]);

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
        case "preventivo":
          return { ...base, tipo: "preventivo", refId: n.id, etichetta: n.etichetta ?? "preventivo", stato: "in_coda", stimaEur: 0 };
        case "computo":
          return { ...base, tipo: "computo", refId: n.id, etichetta: n.etichetta ?? "computo", stato: "in_coda", stimaEur: 0 };
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
    if (!f || f.stato !== "errore" || (f.tipo === "file" && !f.file)) return;
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
      const fasi = ultimo.current.piano.aree.fasi?.["fasi.order_work_phases"]?.valore;
      if (Array.isArray(fasi) && (fasi as FaseDelPiano[]).some((f) => !f.start_date && f.giorni)) {
        const datate = dateDelleFasi(fasi as FaseDelPiano[], m.valore);
        modifiche.push({ tipo: "cambia_valore", area: "fasi", chiave: "fasi.order_work_phases", valore: datate });
        const fine = datate.map((f) => f.end_date).filter(Boolean).sort().pop();
        if (fine && !ultimo.current.piano.aree.fasi?.["fasi.work_end_date"]) {
          modifiche.push({ tipo: "cambia_valore", area: "fasi", chiave: "fasi.work_end_date", valore: fine });
        }
      }
    }
    invia({ tipo: "modifiche", modifiche });
  }, []);

  const indietro = useCallback(() => invia({ tipo: "annulla" }), []);

  const riprendi = useCallback((b: Bozza) => {
    bozzaId.current = b.id;
    setIdBozza(b.id);
    setSalvataggio({ tipo: "salvata" });
    invia({ tipo: "riprendi", bozza: b });
  }, []);

  /** «Crea»: salva quello che aspetta, crea, registra le correzioni. */
  const crea = useCallback(async (): Promise<EsitoCommessa> => {
    await salvatore().subito();
    const id = bozzaId.current;
    if (!id) throw new ErroreBozza("La bozza non è ancora salvata: controlla la connessione e riprova.");
    const { piano, storia, caricate } = ultimo.current;
    const esito = await creaCommessa({ id, fonti: caricate }, servizi.db);
    try {
      await servizi.registraCorrezioni(correzioniDalPiano(pianoProposto(piano, storia), piano, { bozzaId: id, orderId: esito.order_id }));
    } catch {
      // La misura di Silvio non ferma la commessa, che è già nata.
    }
    return esito;
  }, [salvatore, servizi]);

  /** «Riprova» sugli allegati che non si sono copiati. */
  const riallega = useCallback(async (orderId: string, nomi: string[]) => {
    const id = bozzaId.current;
    if (!id) throw new ErroreBozza("Bozza non trovata.");
    return allegaFonti({ id, fonti: ultimo.current.caricate.filter((c) => nomi.includes(c.nome)) }, orderId, servizi.db);
  }, [servizi.db]);

  const scrittura = useMemo(() => scritturaDalPiano(s.piano), [s.piano]);

  return {
    piano: s.piano, storia: s.storia, fonti: s.fonti, caricate: s.caricate, evidenziate: s.evidenziate,
    messaggi: s.messaggi, scrittura, salvataggio, idBozza,
    aggiungi, confermaLetture, riprova, togliFonte, modifica, indietro, riprendi, crea, riallega,
  };
}

export type BozzaSilvio = ReturnType<typeof useBozzaSilvio>;
