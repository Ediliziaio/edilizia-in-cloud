// Le regole della prova di ripristino dei backup a blocchi (20/09/2026), senza
// chiamate: si provano da sole.
//
// Perché esiste. Le aziende grandi si salvano a blocchi (vedi backupBlocchi.ts):
// una cartella <azienda>/<data>/ con un indice, la riga dell'azienda e un file
// per blocco. Per quel formato la prova di ripristino non c'era, e «un backup
// che non ha passato la prova non è un backup»: BeMade, Best Infissi, Il Bagno
// Group avevano una copia che nessuno aveva mai provato a rimettere dentro.
//
// La prova la fa company-restore, un file per volta, con tre funzioni del
// database (admin_ripristino_prova_apri / _versa / _chiudi). Qui stanno le
// decisioni che non hanno bisogno né della rete né del database:
//   · dall'indice al piano di lavoro, diffidando di quello che c'è scritto;
//   · il corpo della chiamata a «versa», costruito attorno al file senza aprirlo;
//   · quando un blocco non passato va riprovato a pezzi, e come si divide;
//   · quanto lavora un giro, e quando una prova silenziosa è morta;
//   · dall'indice, dal conto tenuto da «versa» e dalle righe contate da «chiudi»
//     all'esito che la scheda Backup sa già mostrare.

// ---------------------------------------------------------------------------
// L'indice, come lo scrive company-backup
// ---------------------------------------------------------------------------

export interface VoceIndice {
  tabella: string;
  righe_attese?: number;
  righe_salvate?: number;
  file?: string[];
  errore?: string;
}

export interface IndiceABlocchi {
  esportato_il?: string;
  azienda?: { id?: string; name?: string };
  a_blocchi?: boolean;
  completo?: boolean;
  tabelle?: VoceIndice[];
}

/** Un passo della prova: un file da versare in una tabella. */
export interface Passo {
  tabella: string;
  file: string;
  /** Il file è la riga dell'azienda (un oggetto), non un blocco: va messo tra quadre. */
  azienda?: boolean;
}

const PERCORSO_INDICE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(\d{4}-\d{2}-\d{2})\/indice\.json$/;
const NOME_TABELLA = /^[a-z_][a-z0-9_]{0,62}$/;

/** <azienda>/<AAAA-MM-GG>/indice.json → i suoi pezzi; null se il percorso non è quello di un indice. */
export function leggiPercorsoIndice(percorso: string): { companyId: string; data: string; base: string } | null {
  const m = PERCORSO_INDICE.exec(percorso ?? "");
  if (!m) return null;
  return { companyId: m[1], data: m[2], base: `${m[1]}/${m[2]}` };
}

export type PianoDellaProva =
  | { ok: true; companyId: string; azienda: string | null; piano: Passo[]; tabelle: string[]; righe: number }
  | { ok: false; errore: string };

/**
 * Dall'indice al piano: prima la riga dell'azienda, poi i file di ogni tabella
 * nell'ordine in cui sono stati scritti.
 *
 * L'indice è un file, e di un file non ci si fida: deve essere di QUESTA
 * azienda, i nomi delle tabelle devono essere nomi di tabella, e ogni blocco
 * deve stare nella cartella della sua tabella. Un indice che puntasse ai file
 * di un'altra azienda li farebbe finire nella prova di questa.
 */
export function pianoDellaProva(indice: unknown, percorso: string): PianoDellaProva {
  const dove = leggiPercorsoIndice(percorso);
  if (!dove) return { ok: false, errore: "Il percorso non è quello dell'indice di un backup a blocchi" };
  const i = (indice ?? {}) as IndiceABlocchi;
  if (i.a_blocchi !== true || !Array.isArray(i.tabelle)) {
    return { ok: false, errore: "Il file non è l'indice di un backup a blocchi" };
  }
  if (String(i.azienda?.id ?? "") !== dove.companyId) {
    return { ok: false, errore: "L'indice è di un'altra azienda rispetto alla cartella in cui si trova" };
  }

  const piano: Passo[] = [{ tabella: "companies", file: `${dove.base}/azienda.json`, azienda: true }];
  const tabelle: string[] = [];
  let righe = 0;
  for (const voce of i.tabelle) {
    const tabella = String(voce?.tabella ?? "");
    if (!NOME_TABELLA.test(tabella) || tabella === "companies") {
      return { ok: false, errore: `Nome di tabella non valido nell'indice: «${tabella.slice(0, 80)}»` };
    }
    if (tabelle.includes(tabella)) {
      return { ok: false, errore: `La tabella ${tabella} compare due volte nell'indice` };
    }
    tabelle.push(tabella);
    righe += Number(voce.righe_salvate ?? 0);
    for (const file of voce.file ?? []) {
      const nome = String(file ?? "");
      const alSuoPosto = nome.startsWith(`${dove.base}/${tabella}/`) && nome.endsWith(".json") &&
        !nome.includes("..") && !nome.slice(dove.base.length + tabella.length + 2).includes("/");
      if (!alSuoPosto) {
        return { ok: false, errore: `Il file «${nome.slice(0, 120)}» non sta nella cartella di ${tabella}` };
      }
      piano.push({ tabella, file: nome });
    }
  }
  return { ok: true, companyId: dove.companyId, azienda: i.azienda?.name ?? null, piano, tabelle, righe };
}

// ---------------------------------------------------------------------------
// La chiamata a «versa»
// ---------------------------------------------------------------------------

export interface ParametriVersa {
  provaId: string;
  tabella: string;
  passo: number;
  pezzo?: number;
  ultimoPezzo?: boolean;
}

/**
 * Il corpo della chiamata attorno al file, senza aprirlo: `prima` + i byte del
 * file + `dopo` è un JSON valido con il file al posto di p_righe.
 *
 * Il file di un blocco è { n, righe: [...], finito, ultimo } e «versa» sa
 * leggerlo così com'è. Trasformarlo in oggetti per estrarre le righe e poi di
 * nuovo in testo è ciò che il 19/09 ha fatto fermare company-backup per «CPU
 * Time exceeded» a metà dei contatti. La riga dell'azienda è un oggetto solo:
 * le si mettono le quadre attorno.
 */
export function corpoAttornoAlFile(p: ParametriVersa, azienda = false): { prima: string; dopo: string } {
  const testa = JSON.stringify({
    p_prova_id: p.provaId,
    p_tabella: p.tabella,
    p_passo: p.passo,
    p_pezzo: p.pezzo ?? 0,
    p_ultimo_pezzo: p.ultimoPezzo ?? true,
  });
  return {
    prima: `${testa.slice(0, -1)},"p_righe":${azienda ? "[" : ""}`,
    dopo: `${azienda ? "]" : ""}}`,
  };
}

/**
 * Un blocco non è passato: vale la pena riprovarlo a pezzi? Sì se il guaio è
 * il peso o il tempo — gli 8 secondi di PostgREST (57014), un corpo troppo
 * grande (413), il gateway che si stanca (502-504), la rete (0). No se la
 * risposta è un rifiuto: permessi, prova chiusa, passo fuori ordine. Quelli
 * tornano uguali anche con un quarto delle righe.
 */
export function vaRiprovatoAPezzi(status: number, corpo: string): boolean {
  if (status === 0 || status === 408 || status === 413) return true;
  if (status === 502 || status === 503 || status === 504) return true;
  if (status >= 500) return /57014|statement timeout|canceling statement|timed? ?out/i.test(corpo ?? "");
  return false;
}

/**
 * Dove sta il cursore dopo una risposta buona di «versa». Di norma un posto più
 * avanti — il pezzo dopo, o il passo dopo se era l'ultimo pezzo: la stessa
 * regola con cui «versa» aggiorna il registro. Se però il blocco era già stato
 * versato (una chiamata ripetuta, un altro giro più avanti) «versa» non lo
 * rifà e dice dov'è arrivata la prova: si riparte da lì.
 */
export function cursoreDopo(
  risposta: string, passo: number, pezzo: number, ultimoPezzo: boolean,
): { passo: number; pezzo: number } {
  try {
    const esito = JSON.parse(risposta) as { gia_versato?: boolean; passo?: number; pezzo?: number };
    if (esito?.gia_versato === true && Number.isInteger(esito.passo)) {
      return { passo: Number(esito.passo), pezzo: Number.isInteger(esito.pezzo) ? Number(esito.pezzo) : 0 };
    }
  } catch { /* risposta buona ma non JSON: il blocco è entrato, si va avanti */ }
  return ultimoPezzo ? { passo: passo + 1, pezzo: 0 } : { passo, pezzo: pezzo + 1 };
}

/** «versa» risponde 409 quando la prova non è più in corso: chi versa si ferma. */
export function provaChiusa(status: number, corpo: string): boolean {
  return status === 409 || /PT409|non è più in corso/.test(corpo ?? "");
}

/** In quanti pezzi si divide un blocco che non è passato intero. */
export const PEZZI_PER_BLOCCO = 4;

/**
 * Divide le righe di un blocco in pezzi, sempre allo stesso modo: il cursore
 * della prova è (passo, pezzo), e un giro che riprende a metà di un blocco deve
 * ritrovare gli stessi pezzi di chi l'ha cominciato. Nessun pezzo vuoto; un
 * blocco di una riga sola non si divide.
 */
export function dividiInPezzi<T>(righe: T[], pezzi: number = PEZZI_PER_BLOCCO): T[][] {
  if (righe.length <= 1) return [righe];
  const misura = Math.ceil(righe.length / Math.max(1, pezzi));
  const esito: T[][] = [];
  for (let da = 0; da < righe.length; da += misura) esito.push(righe.slice(da, da + misura));
  return esito;
}

// ---------------------------------------------------------------------------
// Il tempo
// ---------------------------------------------------------------------------

/**
 * Quanto lavora un giro prima di passare il testimone alla chiamata successiva.
 * Il limite di una edge function è 400 secondi: a 240 resta il tempo di finire
 * il blocco in corso e di far partire il giro dopo.
 */
export const TETTO_GIRO_MS = 240_000;

export function giroFinito(inizioMs: number, adessoMs: number): boolean {
  return adessoMs - inizioMs > TETTO_GIRO_MS;
}

/**
 * Oltre questo silenzio una prova «in corso» è morta (funzione ritirata,
 * memoria finita): «versa» aggiorna l'ora a ogni blocco, e un blocco non dura
 * dieci minuti. Lo stesso tempo sta in admin_ripristino_prova_apri.
 */
export const SILENZIO_MASSIMO_MS = 10 * 60_000;

export function provaInterrotta(stato: string, aggiornataIl: string | null | undefined, adessoMs: number): boolean {
  if (stato !== "in_corso") return false;
  const ultima = aggiornataIl ? Date.parse(aggiornataIl) : NaN;
  if (Number.isNaN(ultima)) return true;
  return adessoMs - ultima > SILENZIO_MASSIMO_MS;
}

// ---------------------------------------------------------------------------
// L'esito
// ---------------------------------------------------------------------------

/** Il conto che «versa» tiene per ogni tabella. */
export interface VoceAvanzamento {
  nel_file?: number;
  inserite?: number;
  file_fatti?: number;
  errore?: string;
}

export interface EsitoTabella {
  tabella: string;
  nel_file: number;
  ripristinate: number;
  errore?: string;
  nota?: string;
}

/** Lo stesso formato che admin_ripristina_backup dà per il file unico, più due campi. */
export interface EsitoProva {
  modo: "prova";
  a_blocchi: true;
  percorso: string;
  azienda: string | null;
  company_id: string | null;
  esportato_il: string | null;
  /** L'indice diceva «completo»? Una prova riuscita su un backup a metà resta un backup a metà. */
  backup_completo: boolean;
  righe_nel_file: number;
  righe_ripristinate: number;
  integro: boolean;
  tabelle: EsitoTabella[];
  eseguito_il: string;
}

const n = (v: unknown) => Number(v ?? 0) || 0;
// Il punto delle migliaia messo a mano: toLocaleString("it-IT") non lo mette ai
// numeri di quattro cifre e dipende dall'ICU del runtime, e questi messaggi
// devono essere gli stessi in Deno, in Node e nei test.
const migliaia = (v: number) => String(Math.trunc(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/**
 * L'esito della prova, da tre fonti che devono andare d'accordo:
 *   · l'indice — quante righe il backup DICE di avere, tabella per tabella;
 *   · l'avanzamento — quante ne sono ARRIVATE nei file e il primo errore;
 *   · i conteggi — quante ce n'erano DAVVERO nello schema di prova alla chiusura.
 * «Integro» vuol dire che le tre coincidono su ogni tabella e che la riga
 * dell'azienda è rientrata. La riga dell'azienda si elenca ma non entra nei
 * totali, come nella prova del file unico: così «righe nel file» è lo stesso
 * numero che la scheda mostra accanto al backup.
 */
export function componiEsito(
  indice: IndiceABlocchi,
  percorso: string,
  avanzamento: Record<string, VoceAvanzamento> | null | undefined,
  conteggi: Record<string, number> | null | undefined,
  eseguitoIl: string,
): EsitoProva {
  const fatto = avanzamento ?? {};
  const contate = conteggi ?? {};

  const aziendaRientrata = n(contate.companies);
  const rigaAzienda: EsitoTabella = { tabella: "companies", nel_file: 1, ripristinate: aziendaRientrata };
  const erroreAzienda = fatto.companies?.errore ?? (aziendaRientrata === 1 ? undefined : "la riga dell'azienda non è rientrata");
  if (erroreAzienda) rigaAzienda.errore = erroreAzienda;

  const tabelle: EsitoTabella[] = [rigaAzienda];
  let righeNelFile = 0;
  let righeRipristinate = 0;

  for (const voce of indice.tabelle ?? []) {
    const dichiarate = n(voce.righe_salvate);
    const arrivate = n(fatto[voce.tabella]?.nel_file);
    const ripristinate = n(contate[voce.tabella]);
    const riga: EsitoTabella = { tabella: voce.tabella, nel_file: dichiarate, ripristinate };

    const errore = fatto[voce.tabella]?.errore ??
      (arrivate !== dichiarate
        ? `nei file ci sono ${migliaia(arrivate)} righe, l'indice ne dichiara ${migliaia(dichiarate)}`
        : ripristinate !== dichiarate
        ? `rientrate ${migliaia(ripristinate)} righe su ${migliaia(dichiarate)}`
        : undefined);
    if (errore) riga.errore = errore;

    // Cosa mancava già nel backup: non è colpa della prova, ma va detto qui,
    // dove si guarda se la copia è buona.
    if (voce.errore) riga.nota = `il backup di questa tabella si era fermato: ${voce.errore}`;
    else if (n(voce.righe_attese) > dichiarate) {
      riga.nota = `il backup ne aveva salvate ${migliaia(dichiarate)} su ${migliaia(n(voce.righe_attese))}`;
    }

    tabelle.push(riga);
    righeNelFile += dichiarate;
    righeRipristinate += ripristinate;
  }

  return {
    modo: "prova",
    a_blocchi: true,
    percorso,
    azienda: indice.azienda?.name ?? null,
    company_id: indice.azienda?.id ?? null,
    esportato_il: indice.esportato_il ?? null,
    backup_completo: indice.completo === true,
    righe_nel_file: righeNelFile,
    righe_ripristinate: righeRipristinate,
    integro: tabelle.every((t) => !t.errore && t.ripristinate === t.nel_file),
    tabelle,
    eseguito_il: eseguitoIl,
  };
}

/** A che punto è una prova in corso, per la scheda: passi fatti e righe già versate. */
export function riassuntoAvanzamento(
  riga: { passo?: number | null; passi_totali?: number | null; righe_attese?: number | null; avanzamento?: Record<string, VoceAvanzamento> | null },
): { passo: number; passi: number; righe_versate: number; righe_totali: number } {
  let versate = 0;
  for (const [tabella, voce] of Object.entries(riga.avanzamento ?? {})) {
    if (tabella !== "companies") versate += n(voce?.inserite);
  }
  return { passo: n(riga.passo), passi: n(riga.passi_totali), righe_versate: versate, righe_totali: n(riga.righe_attese) };
}
