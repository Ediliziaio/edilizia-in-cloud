/**
 * I modelli della libreria (Tetti, Serramenti, Bagni… — local*Templates.ts e
 * localModuleDocuments.ts) si salvano per l'azienda, nella tabella
 * modelli_libreria_azienda (25/09/2026). Prima restavano nel solo browser di chi
 * li faceva: un collega su un altro computer creava i preventivi col modello di
 * serie, senza avviso, e non c'era alcun backup.
 *
 * Gli archivi dei moduli restano sincroni e leggono la copia nel browser come
 * prima: questo file è la loro «porta» (getItem/setItem). Ogni scrittura va anche
 * online; se non ci riesce (rete, spazio, permessi) il modello resta segnato «da
 * mandare online» e la libreria lo dice. `sincronizzaModelliAzienda` porta nel
 * browser le copie online più recenti e manda online quelle rimaste indietro: la
 * chiamano la libreria all'apertura e i preventivatori prima di creare un'offerta.
 * Vince la copia salvata per ultima (savedAt del record), anche nel database.
 */
type StoragePort = Pick<Storage, "getItem" | "setItem">;

/** Le copie dei modelli: `eic:<archivio>:v1:<azienda>:…`, come le scrivono gli archivi dei moduli. */
const RE_MODELLO = /^eic:(?:local-module-template|module-document|full-[a-z]+-module):v1:([^:]+):/;
/** Chiavi dei modelli salvati nel browser ma non ancora online. */
const CHIAVE_IN_SOSPESO = "eic:modelli-libreria:in-sospeso:v1";
/**
 * Evento del browser quando un modello appena salvato non arriva online: l'editor
 * ha già detto «salvato», la libreria avvisa che i colleghi non lo vedono ancora.
 */
export const MODELLO_NON_ONLINE = "eic:modelli-libreria:non-online";
/** Quanti modelli scaricare per richiesta: le chiavi vanno nell'indirizzo. */
const LOTTO_SCARICO = 20;

interface Esito<T> { data: T[] | null; error: { message: string } | null }
interface Filtro<T> extends PromiseLike<Esito<T>> {
  eq(colonna: string, valore: string): Filtro<T>;
  in(colonna: string, valori: string[]): Filtro<T>;
}
interface TabellaModelli {
  select<T>(colonne: string): Filtro<T>;
  upsert(riga: unknown, opzioni: { onConflict: string }): PromiseLike<{ error: { message: string } | null }>;
}

async function tabellaModelli(): Promise<TabellaModelli> {
  const { supabase } = await import("@/integrations/supabase/client");
  // La tabella non è ancora nei tipi generati di Supabase.
  return (supabase as unknown as { from: (tabella: string) => TabellaModelli }).from("modelli_libreria_azienda");
}

/**
 * Copie scaricate che il browser non ha spazio per tenere (le foto dei modelli
 * pesano): valgono per questa sessione, e alla prossima apertura si riscaricano.
 * Così un modello aggiornato da un collega non si legge mai nella versione vecchia.
 */
const inMemoria = new Map<string, string>();
const leggiCopia = (chiave: string) => inMemoria.get(chiave) ?? localStorage.getItem(chiave);
function tieniCopia(chiave: string, valore: string) {
  try {
    localStorage.setItem(chiave, valore);
    inMemoria.delete(chiave);
  } catch {
    inMemoria.set(chiave, valore);
  }
}

/** L'azienda a cui appartiene la copia (null se la chiave non è di un modello della libreria). */
export function aziendaDelModello(chiave: string): string | null {
  const trovata = RE_MODELLO.exec(chiave);
  if (!trovata) return null;
  try {
    return decodeURIComponent(trovata[1]);
  } catch {
    return null;
  }
}

/** Quando è stato salvato il record: savedAt degli archivi dei moduli, updatedAt dei documenti. */
function salvatoIl(valore: string | null): string | null {
  if (!valore) return null;
  try {
    const record = JSON.parse(valore) as { savedAt?: unknown; updatedAt?: unknown } | null;
    const data = typeof record?.savedAt === "string" ? record.savedAt : typeof record?.updatedAt === "string" ? record.updatedAt : null;
    return data && Number.isFinite(Date.parse(data)) ? data : null;
  } catch {
    return null;
  }
}

/** La copia del browser è salvata dopo (o insieme a) quella online? */
const localeAggiornata = (locale: string | null, onlineIl: string) => {
  const localeIl = salvatoIl(locale);
  return !!localeIl && Date.parse(localeIl) >= Date.parse(onlineIl);
};

function leggiInSospeso(): string[] {
  try {
    const elenco = JSON.parse(localStorage.getItem(CHIAVE_IN_SOSPESO) ?? "[]") as unknown;
    return Array.isArray(elenco) ? elenco.filter((c): c is string => typeof c === "string") : [];
  } catch {
    return [];
  }
}

function segnaInSospeso(chiave: string, inSospeso: boolean) {
  try {
    const elenco = new Set(leggiInSospeso());
    if (inSospeso) elenco.add(chiave);
    else elenco.delete(chiave);
    localStorage.setItem(CHIAVE_IN_SOSPESO, JSON.stringify([...elenco]));
  } catch {
    // Browser senza spazio: resta solo la copia del modello, come prima.
  }
}

/** I modelli dell'azienda salvati in questo browser ma non ancora online. */
export function modelliDaMandareOnline(companyId: string): string[] {
  return leggiInSospeso().filter((chiave) => aziendaDelModello(chiave) === companyId);
}

async function salvaOnline(chiave: string, valore: string): Promise<void> {
  const companyId = aziendaDelModello(chiave);
  if (!companyId) return;
  const riga = {
    company_id: companyId,
    chiave,
    contenuto: JSON.parse(valore) as unknown,
    salvato_il: salvatoIl(valore) ?? new Date().toISOString(),
  };
  const { error } = await (await tabellaModelli()).upsert(riga, { onConflict: "company_id,chiave" });
  if (error) throw new Error(error.message);
}

/** Manda online una copia; se non ci riesce la lascia «da mandare online». */
async function provaAMandareOnline(chiave: string, valore: string): Promise<boolean> {
  try {
    await salvaOnline(chiave, valore);
    segnaInSospeso(chiave, false);
    return true;
  } catch (e) {
    segnaInSospeso(chiave, true);
    console.warn("[modelli libreria] salvato solo in questo browser:", chiave, e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * La porta degli archivi dei moduli: legge e scrive la copia nel browser come
 * prima (sincrona, con gli stessi errori di spazio) e manda online ogni modello salvato.
 */
export const archivioModelliAzienda: StoragePort = {
  getItem: (chiave) => (aziendaDelModello(chiave) ? leggiCopia(chiave) : localStorage.getItem(chiave)),
  setItem: (chiave, valore) => {
    localStorage.setItem(chiave, valore);
    if (!aziendaDelModello(chiave)) return;
    inMemoria.delete(chiave);
    segnaInSospeso(chiave, true);
    void provaAMandareOnline(chiave, valore).then((online) => {
      if (!online) window.dispatchEvent(new CustomEvent(MODELLO_NON_ONLINE, { detail: { chiave } }));
    });
  },
};

export interface EsitoSincronizzazione {
  /** Copie online più recenti portate in questo browser. */
  scaricati: number;
  /** Copie di questo browser mandate online. */
  caricati: number;
  /** Copie rimaste solo in questo browser (salvataggio online non riuscito). */
  daMandareOnline: string[];
}

/**
 * Allinea browser e database per un'azienda: prima l'elenco (chiave e data, poche
 * righe leggere), poi scarica solo le copie online più recenti di quelle del
 * browser e manda online quelle salvate qui dopo (o rimaste indietro). Senza
 * permesso di scrittura (un venditore) scarica soltanto.
 */
export async function sincronizzaModelliAzienda(companyId: string): Promise<EsitoSincronizzazione> {
  const tabella = await tabellaModelli();
  const { data: elenco, error } = await tabella
    .select<{ chiave: string; salvato_il: string }>("chiave, salvato_il")
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);

  const online = new Map((elenco ?? []).map((riga) => [riga.chiave, riga.salvato_il]));
  const daScaricare = [...online]
    .filter(([chiave, il]) => aziendaDelModello(chiave) === companyId && !localeAggiornata(leggiCopia(chiave), il))
    .map(([chiave]) => chiave);
  let scaricati = 0;
  for (let i = 0; i < daScaricare.length; i += LOTTO_SCARICO) {
    const { data, error: erroreScarico } = await tabella
      .select<{ chiave: string; contenuto: unknown; salvato_il: string }>("chiave, contenuto, salvato_il")
      .eq("company_id", companyId)
      .in("chiave", daScaricare.slice(i, i + LOTTO_SCARICO));
    if (erroreScarico) throw new Error(erroreScarico.message);
    for (const riga of data ?? []) {
      tieniCopia(riga.chiave, JSON.stringify(riga.contenuto));
      segnaInSospeso(riga.chiave, false);
      scaricati += 1;
    }
  }

  let caricati = 0;
  const daMandare = new Set(modelliDaMandareOnline(companyId));
  // Le chiavi si raccolgono prima: mandare online riscrive l'elenco in sospeso,
  // e con localStorage.key(i) durante le scritture si salterebbero delle copie.
  const chiaviLocali = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
    .filter((chiave): chiave is string => !!chiave && aziendaDelModello(chiave) === companyId);
  for (const chiave of chiaviLocali) {
    const valore = leggiCopia(chiave);
    const localeIl = salvatoIl(valore);
    const onlineIl = online.get(chiave);
    const piuRecente = !!localeIl && (!onlineIl || Date.parse(localeIl) > Date.parse(onlineIl));
    if (valore && (piuRecente || daMandare.has(chiave)) && (await provaAMandareOnline(chiave, valore))) caricati += 1;
  }

  return { scaricati, caricati, daMandareOnline: modelliDaMandareOnline(companyId) };
}
