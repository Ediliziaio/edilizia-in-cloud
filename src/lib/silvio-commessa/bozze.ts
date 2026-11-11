/**
 * La bozza della commessa che Silvio prepara (31/10/2026, fase 1, lotto 1.4, e fase 2,
 * lotto 2.2). Tabella `commessa_bozze` e RPC della migrazione 20281112100000. Vedi
 * docs/piano-silvio-commessa-ai.md, 3.4 (punti 6 e 8), 3.5 e 5.2.
 *
 * - `creaBozza`, `salvaBozza`, `salvataggioConAttesa`: il popup scrive la bozza a ogni
 *   modifica, con un attimo d'attesa; col piano salva la scrittura (`scritturaDalPiano`).
 * - `bozzeDaRiprendere`, `leggiBozza`: «Riprendi la commessa Rossi».
 * - `creaCommessa`, `completaCommessa`: una RPC, tutto o niente; poi le fonti caricate
 *   passano da silvio-uploads ai documenti della commessa (`allegaFonti`).
 * - `annullaSilvio`: toglie quello che Silvio ha fatto, file compresi, se nessuno ci ha
 *   lavorato sopra.
 *
 * Ogni errore arriva come `ErroreBozza`, con un messaggio in italiano da mostrare così.
 * Le RPC si chiamano sempre come metodo del client (`db.rpc(…)`): staccata dall'oggetto
 * `supabase.rpc` perde il `this` e non parte.
 */
import { supabase } from "@/integrations/supabase/client";
import type { PianoCommessa } from "../../../shared/silvio-commessa/piano.ts";
import type { RifDocumento } from "../../../shared/silvio-commessa/ingressi.ts";
import { scritturaDalPiano, type ScritturaCommessa } from "./scrittura";
import type { Autonomia } from "../../../shared/silvio-commessa/autonomia.ts";
import { BUCKET_DOCUMENTI_COMMESSA } from "./leggiDocumento";
import { percorsoDocumento } from "@/lib/commesse/documentiCommessa";
import { erroreLeggibile } from "./testoErrore";

export const BUCKET_ALLEGATI_COMMESSA = "order-attachments";

/**
 * Un file caricato nella bozza, in silvio-uploads. Fase 4: anche un allegato di un'email letto
 * dove sta (`documento`, senza `path`): dopo «Crea» lo copia la funzione `silvio-commessa`.
 */
export interface FonteCaricata {
  path: string;
  documento?: RifDocumento | null;
  nome: string;
  mime?: string | null;
  dimensione?: number | null;
  /** L'etichetta della fonte nel piano («Contratto.pdf»). */
  fonte?: string | null;
}

export interface Bozza {
  id: string;
  company_id: string;
  created_by: string;
  modo: "crea" | "completa";
  piano: PianoCommessa;
  scrittura: ScritturaCommessa | null;
  fonti: FonteCaricata[];
  storia: unknown[];
  order_id: string | null;
  stato: "bozza" | "creata" | "completata";
  eseguita_il: string | null;
  scade_il: string;
  updated_at: string;
}

export interface EsitoScrittura {
  order_id: string;
  customer_id?: string;
  colonne: number;
  fasi: number;
  voci: number;
  rate: number;
  contratto: boolean;
  righe_registrate: number;
  /** Fase 4: quante persone, ditte, mezzi, ordini, contratti e promemoria; i mezzi non prenotati col motivo. */
  risorse?: {
    persone: number; ditte: number; mezzi: number; oda: number; contratti: number; promemoria: number;
    non_prenotati: { mezzo_id: string; motivo: string }[];
    saltati: { contratto: string; motivo: string }[];
  };
  /** Quello che la RPC ha tolto perché la persona non ha il permesso, o perché l'azienda l'ha vietato a Silvio. */
  tolte_permessi?: string[];
  tolte_autonomia?: string[];
  /** La risposta di prima si era persa: la commessa c'era già (D9). */
  gia_creata?: boolean;
  gia_completata?: boolean;
}

export interface EsitoCommessa extends EsitoScrittura {
  /** Le fonti diventate documenti della commessa, e quelle rimaste fuori col motivo. */
  allegati: number;
  allegatiNonRiusciti: { nome: string; motivo: string }[];
}

export interface EsitoAnnulla {
  righe_tolte: number;
  commessa_tolta: boolean;
  file_da_togliere: string[];
}

interface Risposta<T> { data: T | null; error: { message: string; code?: string } | null }

/** Quel che serve del client di Supabase: le tabelle, le RPC, lo storage. */
export interface ClientBozze {
  from: (tabella: string) => unknown;
  rpc: (nome: string, args: Record<string, unknown>) => PromiseLike<Risposta<unknown>>;
  storage: {
    from: (bucket: string) => {
      download: (path: string) => PromiseLike<Risposta<Blob | { arrayBuffer: () => Promise<ArrayBuffer>; size?: number }>>;
      upload: (path: string, body: Blob | ArrayBuffer | Uint8Array, opz?: { contentType?: string; upsert?: boolean }) => PromiseLike<Risposta<unknown>>;
      remove: (paths: string[]) => PromiseLike<Risposta<unknown>>;
    };
  };
  /** Le edge function: gli allegati delle email li copia `silvio-commessa` (fase 4). */
  functions?: { invoke: (nome: string, opz: { body: Record<string, unknown> }) => PromiseLike<Risposta<unknown>> };
}

// Le tabelle nuove non sono ancora nei tipi generati: si passa da un client senza tipi.
const clientVero = supabase as unknown as ClientBozze;

/** Le query che il modulo usa, nella forma di supabase-js. */
interface Query {
  select: (c?: string) => Query;
  insert: (r: Record<string, unknown>) => Query;
  update: (r: Record<string, unknown>) => Query;
  delete: () => Query;
  eq: (c: string, v: unknown) => Query;
  neq: (c: string, v: unknown) => Query;
  gt: (c: string, v: unknown) => Query;
  order: (c: string, o?: { ascending?: boolean }) => Query;
  limit: (n: number) => Query;
  single: () => PromiseLike<Risposta<unknown>>;
  maybeSingle: () => PromiseLike<Risposta<unknown>>;
  then: PromiseLike<Risposta<unknown>>["then"];
}
const tabella = (db: ClientBozze) => db.from("commessa_bozze") as Query;

export class ErroreBozza extends Error {
  constructor(messaggio: string, readonly codice: string | null = null) {
    super(messaggio);
    this.name = "ErroreBozza";
  }
}

/**
 * Il messaggio da mostrare per un errore del database o della rete. I messaggi delle RPC
 * di Silvio sono già in italiano e restano; i tecnici diventano frasi.
 */
export function messaggioErrore(err: unknown): string {
  const e = (err ?? {}) as { message?: unknown; code?: unknown };
  const msg = typeof e.message === "string" ? e.message : "";
  const codice = typeof e.code === "string" ? e.code : "";
  if (/failed to fetch|network|load failed|fetch failed/i.test(msg)) {
    // Non «la bozza è salva»: lo stesso messaggio arriva quando è proprio il salvataggio a non partire.
    return "Connessione assente: riprova appena torna la rete.";
  }
  if (codice === "PGRST202" || /could not find the function/i.test(msg)) {
    return "Questa funzione di Silvio non è ancora attiva su questo gestionale.";
  }
  if (codice === "PGRST116") return "Bozza non trovata: forse è scaduta o è stata eliminata.";
  if (/row-level security|permission denied/i.test(msg) || (codice === "42501" && !msg)) {
    return "Non hai il permesso di modificare le commesse di questa azienda.";
  }
  if (codice === "55P03" || /lock timeout|canceling statement due to lock/i.test(msg)) {
    return "Qualcun altro sta modificando questa commessa proprio ora: riprova tra qualche secondo.";
  }
  if (codice === "57014" || /statement timeout/i.test(msg)) {
    return "Il database ci ha messo troppo: riprova tra poco.";
  }
  if (codice === "23505") {
    return msg.startsWith("Esiste già") || msg.startsWith("Il preventivo") ? msg : "Esiste già una commessa con questo numero: cambialo e riprova.";
  }
  // Le RPC di Silvio e della creazione parlano già alle persone: 42501 (permesso),
  // 22023 (dato da sistemare), 55000 (annullamento rifiutato), P0001 (raise semplice).
  if (msg && ["42501", "22023", "55000", "P0001"].includes(codice)) return msg;
  return "Non è andata: riprova. Se succede ancora, scrivi all'assistenza.";
}

function lancia(err: unknown): never {
  const codice = (err as { code?: unknown } | null)?.code;
  throw new ErroreBozza(messaggioErrore(err), typeof codice === "string" ? codice : null);
}

/** Una bozza nuova: per una commessa da creare, o (con `orderId`) da completare. */
export async function creaBozza(
  dati: { companyId: string; orderId?: string | null; piano: PianoCommessa; fonti?: FonteCaricata[]; autonomia?: Autonomia | null },
  db: ClientBozze = clientVero,
): Promise<Bozza> {
  const { data, error } = await tabella(db)
    .insert({
      company_id: dati.companyId,
      modo: dati.orderId ? "completa" : "crea",
      order_id: dati.orderId ?? null,
      piano: dati.piano,
      scrittura: scritturaDalPiano(dati.piano, dati.autonomia ?? null),
      fonti: dati.fonti ?? [],
    })
    .select()
    .single();
  if (error || !data) lancia(error);
  return data as Bozza;
}

/** Il codice di un salvataggio rifiutato perché la commessa è già stata scritta: «Crea» la riprende (D9). */
export const BOZZA_GIA_SCRITTA = "bozza_gia_scritta";

/**
 * Salva piano, fonti e storia; la scrittura si ricalcola dal piano, sempre insieme, con la stessa
 * autonomia del popup (quarta revisione, 1): senza, quello che Silvio fa «da solo» si perdeva.
 */
export async function salvaBozza(
  id: string,
  dati: { piano: PianoCommessa; fonti?: FonteCaricata[]; storia?: unknown[]; autonomia?: Autonomia | null },
  db: ClientBozze = clientVero,
): Promise<void> {
  const riga: Record<string, unknown> = { piano: dati.piano, scrittura: scritturaDalPiano(dati.piano, dati.autonomia ?? null) };
  if (dati.fonti) riga.fonti = dati.fonti;
  if (dati.storia) riga.storia = dati.storia;
  const { data, error } = await tabella(db).update(riga).eq("id", id).eq("stato", "bozza").select("id").maybeSingle();
  if (error) lancia(error);
  if (!data) throw new ErroreBozza("Questa bozza non si può più modificare: la commessa è già stata scritta.", BOZZA_GIA_SCRITTA);
}

export interface SalvataggioConAttesa<T> {
  /** Ricorda l'ultima versione e la salva dopo `attesaMs` senza modifiche. */
  programma: (dati: T) => void;
  /** Salva subito quello che aspetta (prima di «Crea» o alla chiusura). */
  subito: () => Promise<void>;
  /** Lascia perdere quello che aspetta. */
  annulla: () => void;
  /** C'è qualcosa non ancora salvato? */
  inAttesa: () => boolean;
}

/**
 * Salvataggio con attesa: a ogni tasto si riprogramma, si salva solo l'ultima versione.
 * Mai due salvataggi in parallelo: se uno è in corso, il successivo parte quando finisce.
 */
export function salvataggioConAttesa<T>(
  salva: (dati: T) => Promise<void>,
  opz: { attesaMs?: number; quandoSbaglia?: (e: ErroreBozza) => void; quandoSalvato?: () => void } = {},
): SalvataggioConAttesa<T> {
  const attesa = opz.attesaMs ?? 800;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let prossimo: { dati: T } | null = null;
  let inCorso: Promise<void> | null = null;

  const esegui = async (): Promise<void> => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (inCorso) await inCorso;
    if (!prossimo) return;
    const { dati } = prossimo;
    prossimo = null;
    inCorso = (async () => {
      try {
        await salva(dati);
        opz.quandoSalvato?.();
      } catch (e) {
        // Quello che non è partito torna in coda, se nel frattempo non è arrivato di meglio.
        prossimo ??= { dati };
        opz.quandoSbaglia?.(e instanceof ErroreBozza ? e : new ErroreBozza(messaggioErrore(e)));
      } finally {
        inCorso = null;
      }
    })();
    await inCorso;
  };

  return {
    programma(dati) {
      prossimo = { dati };
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void esegui(); }, attesa);
    },
    subito: esegui,
    annulla() {
      if (timer) clearTimeout(timer);
      timer = null;
      prossimo = null;
    },
    inAttesa: () => prossimo !== null || inCorso !== null,
  };
}

/**
 * Le bozze aperte dell'utente in questa azienda, dalla più recente: «Riprendi…». Col filtro
 * si separano le due strade: `{ modo: "crea" }` per Nuova commessa, `{ modo: "completa",
 * orderId }` per «Completa con Silvio» su quella commessa.
 */
export async function bozzeDaRiprendere(
  companyId: string,
  db: ClientBozze = clientVero,
  adesso: Date = new Date(),
  filtro: { modo?: Bozza["modo"]; orderId?: string; userId?: string } = {},
): Promise<Bozza[]> {
  let q = tabella(db)
    .select("*")
    .eq("company_id", companyId)
    .eq("stato", "bozza")
    .gt("scade_il", adesso.toISOString());
  if (filtro.modo) q = q.eq("modo", filtro.modo);
  if (filtro.orderId) q = q.eq("order_id", filtro.orderId);
  if (filtro.userId) q = q.eq("created_by", filtro.userId);
  const { data, error } = await q.order("updated_at", { ascending: false }).limit(20);
  if (error) lancia(error);
  return (data ?? []) as Bozza[];
}

/**
 * Eliminazione esplicita della sola bozza scelta; iniziarne un'altra non elimina le precedenti.
 * Solo una bozza ancora aperta: quella che ha già scritto una commessa serve all'annullamento.
 * I file caricati restano nel loro spazio: lo stesso file può servire a un'altra bozza.
 */
export async function scartaBozza(id: string, db: ClientBozze = clientVero): Promise<void> {
  const { error } = await tabella(db).delete().eq("id", id).eq("stato", "bozza");
  if (error) lancia(error);
}

export async function leggiBozza(id: string, db: ClientBozze = clientVero): Promise<Bozza> {
  const { data, error } = await tabella(db).select("*").eq("id", id).single();
  if (error || !data) lancia(error ?? { code: "PGRST116" });
  return data as Bozza;
}

async function chiama<T>(db: ClientBozze, nome: string, args: Record<string, unknown>): Promise<T> {
  let risposta: Risposta<unknown>;
  try {
    risposta = await db.rpc(nome, args);
  } catch (e) {
    lancia(e);
  }
  if (risposta.error) lancia(risposta.error);
  if (risposta.data == null) throw new ErroreBozza("Risposta vuota dal database: riprova.");
  return risposta.data as T;
}

/**
 * Le fonti caricate diventano documenti della commessa: ogni file si copia da
 * silvio-uploads a order-attachments (orders/<commessa>/…, come la pagina Nuova commessa)
 * e la RPC le registra, così entrano nell'annullamento. Un file che non si copia non
 * ferma niente: torna nell'elenco dei non riusciti, e l'originale resta nella bozza.
 */
export async function allegaFonti(
  bozza: Pick<Bozza, "id" | "fonti"> & { company_id?: string | null },
  orderId: string,
  db: ClientBozze = clientVero,
): Promise<{ allegati: number; nonRiusciti: { nome: string; motivo: string }[] }> {
  const copiati: { path: string; nome: string; mime: string | null; dimensione: number }[] = [];
  const nonRiusciti: { nome: string; motivo: string }[] = [];
  // Gli allegati delle email: il browser non li scarica, li copia la funzione.
  const remoti = (bozza.fonti ?? []).filter((f) => f?.documento && !f.path);
  let remotiAllegati = 0;
  if (remoti.length) {
    const r = await allegaDocumentiRemoti(bozza, remoti, db);
    remotiAllegati = r.allegati;
    nonRiusciti.push(...r.nonRiusciti);
  }
  for (const f of bozza.fonti ?? []) {
    if (!f?.path) continue;
    const giu = await db.storage.from(BUCKET_DOCUMENTI_COMMESSA).download(f.path);
    if (giu.error || !giu.data) {
      nonRiusciti.push({ nome: f.nome, motivo: "file non trovato tra quelli caricati" });
      continue;
    }
    const destinazione = percorsoDocumento(orderId, f.nome);
    const contenuto = await giu.data.arrayBuffer();
    const su = await db.storage.from(BUCKET_ALLEGATI_COMMESSA)
      .upload(destinazione, contenuto, { contentType: f.mime ?? undefined, upsert: false });
    if (su.error) {
      nonRiusciti.push({ nome: f.nome, motivo: "non si è potuto copiare tra i documenti della commessa" });
      continue;
    }
    copiati.push({ path: destinazione, nome: f.nome, mime: f.mime ?? null, dimensione: f.dimensione ?? contenuto.byteLength });
  }
  if (!copiati.length) return { allegati: remotiAllegati, nonRiusciti };
  try {
    await chiama<number>(db, "commessa_bozza_allega", { p_bozza_id: bozza.id, p_allegati: copiati });
  } catch (e) {
    // Senza la riga i file copiati sarebbero orfani: si tolgono.
    await db.storage.from(BUCKET_ALLEGATI_COMMESSA).remove(copiati.map((c) => c.path));
    const motivo = e instanceof ErroreBozza ? e.message : messaggioErrore(e);
    return { allegati: remotiAllegati, nonRiusciti: [...nonRiusciti, ...copiati.map((c) => ({ nome: c.nome, motivo }))] };
  }
  return { allegati: copiati.length + remotiAllegati, nonRiusciti };
}

/** Gli allegati delle email letti dal popup: li copia e li registra `silvio-commessa` (modo «allega»). */
async function allegaDocumentiRemoti(
  bozza: Pick<Bozza, "id"> & { company_id?: string | null }, fonti: FonteCaricata[], db: ClientBozze,
): Promise<{ allegati: number; nonRiusciti: { nome: string; motivo: string }[] }> {
  const tutti = (motivo: string) => ({ allegati: 0, nonRiusciti: fonti.map((f) => ({ nome: f.nome, motivo })) });
  if (!db.functions || !bozza.company_id) return tutti("non si è potuto copiare tra i documenti della commessa");
  try {
    const { data, error } = await db.functions.invoke("silvio-commessa", {
      body: { modo: "allega", company_id: bozza.company_id, bozza_id: bozza.id, documenti: fonti.map((f) => ({ documento: f.documento, nome: f.nome })) },
    });
    if (error) return tutti(erroreLeggibile(error, "non si è potuto copiare tra i documenti della commessa"));
    const r = (data ?? {}) as { allegati?: number; non_riusciti?: { nome: string; motivo: string }[] };
    return { allegati: Number(r.allegati) || 0, nonRiusciti: Array.isArray(r.non_riusciti) ? r.non_riusciti : [] };
  } catch (e) {
    return tutti(messaggioErrore(e));
  }
}

type BozzaDaScrivere = Pick<Bozza, "id" | "fonti"> & { company_id?: string | null };

async function scrivi(
  rpc: "commessa_crea_con_silvio" | "commessa_completa_con_silvio",
  bozza: BozzaDaScrivere,
  db: ClientBozze,
): Promise<EsitoCommessa> {
  const esito = await chiama<EsitoScrittura>(db, rpc, { p_bozza_id: bozza.id });
  const { allegati, nonRiusciti } = await allegaFonti(bozza, esito.order_id, db);
  return { ...esito, allegati, allegatiNonRiusciti: nonRiusciti };
}

/** «Crea»: la commessa nasce in una transazione, poi le fonti diventano suoi documenti. */
export function creaCommessa(bozza: BozzaDaScrivere, db: ClientBozze = clientVero): Promise<EsitoCommessa> {
  return scrivi("commessa_crea_con_silvio", bozza, db);
}

/** «Completa»: solo aggiunte alla commessa che c'è; quello che una persona ha scritto resta. */
export function completaCommessa(bozza: BozzaDaScrivere, db: ClientBozze = clientVero): Promise<EsitoCommessa> {
  return scrivi("commessa_completa_con_silvio", bozza, db);
}

/**
 * «Annulla tutto quello che ha fatto Silvio»: il database toglie righe e colonne, qui si
 * tolgono i file copiati. Se qualcuno ci ha già lavorato sopra il database rifiuta, e il
 * messaggio dice dove.
 */
export async function annullaSilvio(bozzaId: string, db: ClientBozze = clientVero): Promise<EsitoAnnulla> {
  const esito = await chiama<EsitoAnnulla>(db, "commessa_annulla_silvio", { p_bozza_id: bozzaId });
  const file = esito.file_da_togliere ?? [];
  // Le righe sono già sparite: un file rimasto nello storage non fa danni, si ignora l'errore.
  if (file.length) await db.storage.from(BUCKET_ALLEGATI_COMMESSA).remove(file);
  return esito;
}
