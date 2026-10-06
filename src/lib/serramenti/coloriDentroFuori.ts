/**
 * Colore interno ed esterno di una posizione: due scelte sulla variabile «Colore» del listino.
 *
 * Il listino ha UNA variabile «Colore»: le fasce di prezzo («Colore Standard +10%», «Colore Fuori Standard
 * +15%», «Bianco») e, dentro le fasce, i colori veri («21 - Nussbaum (noce)»). Nel preventivo i lati sono due:
 * ognuno sceglie una fascia e, dentro, il colore. La riga scrive tutto quello che serve a chi la legge dopo:
 *  - `colore_interno` e `colore_esterno` (testo) dicono il colore di ogni lato: li usano il disegno, la scheda
 *    della posizione e il PDF;
 *  - `valori_assi.colore` e `scelte_assi.colore` restano UNA scelta sola, quella che decide il prezzo: quando si
 *    sceglie un colore dall'elenco vale la fascia più cara fra i due lati (a parità, l'esterno), mai un prezzo più
 *    basso del dovuto.
 *
 * La fascia della riga cambia SOLO quando si tocca una delle due tendine (o, nel popup, finché la posizione non è
 * aggiunta): mai per le misure, i pezzi o altro, e mai perché un testo scritto coincide con un colore del listino.
 * I testi si leggono per mostrare i due lati; il prezzo di una riga già salvata non si muove da solo.
 *
 * Le righe già salvate si rileggono senza perdere niente: monocolore (nessun testo: i due lati sono la variante),
 * pellicola su un lato (dentro resta il colore di serie, come lo scrive già il PDF), colori scritti a mano (restano
 * com'erano; i colori scritti tengono la fascia della riga e basta), una variante tolta dal listino (resta com'era).
 *
 * Senza React né database: la usano il listino del preventivo, la riga e le prove.
 */
import { vociDi } from "@/lib/listino/scelteVariante";

/** Il codice della variabile «Colore»: l'unica che il disegno e il preventivo leggono come colore del serramento. */
export const CODICE_ASSE_COLORE = "colore";

/**
 * Per trovare la fascia più cara quando manca un prezzo calcolabile (misure ancora da scrivere, fuori listino, griglia
 * in arrivo): si confronta su un prezzo e su misure di riferimento. Le fasce in % tengono lo stesso ordine di sempre.
 */
export const PREZZO_DI_CONFRONTO = 1000;
export const MISURA_DI_CONFRONTO_MM = 1000;

export type LatoColore = "interno" | "esterno";

export const LATI_COLORE: readonly LatoColore[] = ["interno", "esterno"];

/** Quanto serve di un valore del listino per leggere e scrivere i colori. */
export interface ValoreColore {
  id: string;
  valore: string;
  label: string;
  opzioni?: unknown;
  is_default?: boolean | null;
  attivo?: boolean | null;
}

export interface AsseColore {
  codice: string;
  values: ReadonlyArray<ValoreColore>;
}

/** Cosa si è scelto per un lato. */
export interface SceltaLato {
  /** Il valore del listino (la fascia): «Colore Standard», «Bianco». Null: ancora da scegliere. */
  valueId: string | null;
  /** Il colore dentro la fascia («21 - Nussbaum (noce)»); null: «Da decidere», o un valore senza elenco. */
  voce: string | null;
  /** Colore scritto a mano su una riga già salvata: non è nel listino e si mostra com'è. */
  scritto: string | null;
}

export type ColoriDentroFuori = Record<LatoColore, SceltaLato>;

/** Quello che la riga ricorda dei colori. */
export interface RigaColori {
  valori_assi?: Record<string, string> | null;
  scelte_assi?: Record<string, string> | null;
  colore_interno?: string | null;
  colore_esterno?: string | null;
}

/** Il testo come si confronta: maiuscole, accenti e punteggiatura non contano. */
function normalizza(testo: string | null | undefined): string {
  return (testo ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const nomeDi = (v: ValoreColore) => (v.label || v.valore).trim();

/** La pellicola su un solo lato (nella fascia o nel colore): dentro resta il colore di serie. Come schedaPosizione. */
function suUnLato(valore: ValoreColore, voce: string | null | undefined): boolean {
  const k = `${normalizza(nomeDi(valore)).replace(/ /g, "_")}_${normalizza(voce).replace(/ /g, "_")}`;
  return /(^|_)(un_lato|monolato|solo_esterno)(_|$)/.test(k);
}

/** Il colore come lo scrive la riga e il PDF: la voce, il valore, o «Valore (da scegliere)» se manca la voce di un elenco. */
export function testoColore(valore: ValoreColore, voce: string | null | undefined): string {
  const v = (voce ?? "").trim();
  if (v) return v;
  return vociDi(valore).length > 0 ? `${nomeDi(valore)} (da scegliere)` : nomeDi(valore);
}

/**
 * Dove sta un colore scritto sulla riga: prima nel valore che la riga ha già scelto, poi in un valore che si
 * chiama così, poi in un elenco. Lo stesso colore può stare in due fasce («pellicola solo un lato» ripete i
 * colori di «Colore Standard»): vince quella della riga.
 */
function cercaTesto(asse: AsseColore, testo: string, preferito: ValoreColore | null): { valueId: string; voce: string | null } | null {
  const k = normalizza(testo);
  const accesi = asse.values.filter((v) => v !== preferito && v.attivo !== false);
  const dalNome = (v: ValoreColore) => normalizza(nomeDi(v)) === k || normalizza(`${nomeDi(v)} (da scegliere)`) === k;
  const dalElenco = (v: ValoreColore) => vociDi(v).find((voce) => normalizza(voce) === k);
  if (preferito) {
    const voce = dalElenco(preferito);
    if (voce) return { valueId: preferito.id, voce };
    if (dalNome(preferito)) return { valueId: preferito.id, voce: null };
  }
  const perNome = accesi.find(dalNome);
  if (perNome) return { valueId: perNome.id, voce: null };
  for (const v of accesi) {
    const voce = dalElenco(v);
    if (voce) return { valueId: v.id, voce };
  }
  return null;
}

const NESSUNA: SceltaLato = { valueId: null, voce: null, scritto: null };

/**
 * I due colori di una riga: i testi `colore_interno` / `colore_esterno` se ci sono, altrimenti la variante
 * «Colore» della riga (la stessa sui due lati, o il colore di serie dentro con la pellicola su un lato).
 */
export function leggiColori(asse: AsseColore, riga: RigaColori): ColoriDentroFuori {
  const salvatoId = riga.valori_assi?.[asse.codice] ?? null;
  const salvato = salvatoId ? asse.values.find((v) => v.id === salvatoId) ?? null : null;
  const voceSalvata = riga.scelte_assi?.[asse.codice] || null;
  const diSerie = asse.values.find((v) => v.is_default && v.attivo !== false) ?? null;

  const dallaVariante = (lato: LatoColore): SceltaLato => {
    if (!salvatoId) return NESSUNA;
    // La variante salvata non c'è più nel listino: la riga la ricorda com'era (la tendina scrive «Scelta tolta dal
    // listino»), con il suo prezzo e i suoi dati. Non è una riga «da scegliere».
    if (!salvato) return { valueId: salvatoId, voce: voceSalvata, scritto: null };
    if (lato === "interno" && suUnLato(salvato, voceSalvata)) {
      return diSerie ? { valueId: diSerie.id, voce: null, scritto: null } : { valueId: null, voce: null, scritto: "Bianco" };
    }
    return { valueId: salvato.id, voce: voceSalvata, scritto: null };
  };

  const dalLato = (lato: LatoColore): SceltaLato => {
    const testo = (lato === "interno" ? riga.colore_interno : riga.colore_esterno)?.trim();
    if (!testo) return dallaVariante(lato);
    const trovato = cercaTesto(asse, testo, salvato);
    if (trovato) return { ...trovato, scritto: null };
    // Scritto a mano: non è nel listino. Tiene la fascia (e il colore) della riga, che decidono il prezzo.
    return { valueId: salvato?.id ?? null, voce: salvato ? voceSalvata : null, scritto: testo };
  };

  return { interno: dalLato("interno"), esterno: dalLato("esterno") };
}

/** I due lati con la stessa scelta (la variante di una riga monocolore, il valore di serie di un prodotto nuovo). */
export function stessoColore(valueId: string | null, voce: string | null): ColoriDentroFuori {
  const lato: SceltaLato = { valueId, voce, scritto: null };
  return { interno: { ...lato }, esterno: { ...lato } };
}

/** Un lato scelto dalla tendina: il colore scritto a mano, se c'era, non c'è più. */
export function cambiaLato(colori: ColoriDentroFuori, lato: LatoColore, valueId: string, voce: string | null): ColoriDentroFuori {
  return { ...colori, [lato]: { valueId, voce, scritto: null } };
}

/**
 * Un lato scritto a mano («Altro colore»): il testo resta su quel lato e tiene la fascia e il colore che decidono il
 * prezzo (`guida`: la scelta «Colore» della riga o del popup), così scrivere non cambia mai prezzo né variante.
 * Un testo vuoto lascia il lato com'era.
 */
export function scriviLato(
  colori: ColoriDentroFuori,
  lato: LatoColore,
  testo: string,
  guida: { valueId: string | null; voce: string | null } | null,
): ColoriDentroFuori {
  const scritto = testo.trim();
  if (!scritto) return colori;
  const prima = colori[lato];
  return { ...colori, [lato]: { valueId: guida?.valueId ?? prima.valueId, voce: guida ? guida.voce : prima.voce, scritto } };
}

/** I testi da scrivere sulla riga: uno per lato, o null se il lato non ha niente (né scelta né testo). */
export function testiColori(asse: { values: ReadonlyArray<ValoreColore> }, colori: ColoriDentroFuori): { interno: string | null; esterno: string | null } {
  const di = (s: SceltaLato): string | null => {
    if (s.scritto) return s.scritto;
    const valore = s.valueId ? asse.values.find((v) => v.id === s.valueId) : undefined;
    return valore ? testoColore(valore, s.voce) : null;
  };
  return { interno: di(colori.interno), esterno: di(colori.esterno) };
}

/**
 * Quale scelta decide il prezzo (`valori_assi.colore` e `scelte_assi.colore`): la fascia più cara fra i due lati,
 * a parità l'esterno. `prezzo` dice quanto costa la posizione con quel valore; senza un prezzo calcolabile
 * (misure ancora da scrivere) i valori pari valgono uguale e resta l'esterno. Un lato scritto a mano tiene la
 * fascia della riga: scrivere un colore non abbassa il prezzo.
 */
export function sceltaPerIlPrezzo(
  colori: ColoriDentroFuori,
  prezzo: (valueId: string) => number | null | undefined,
): { valueId: string; voce: string | null } | null {
  const lati = [colori.esterno, colori.interno].filter((l): l is SceltaLato & { valueId: string } => !!l.valueId);
  if (lati.length === 0) return null;
  let guida = lati[0];
  let guidaPrezzo = prezzo(guida.valueId) ?? Number.NEGATIVE_INFINITY;
  for (const l of lati.slice(1)) {
    if (l.valueId === guida.valueId) continue;
    const p = prezzo(l.valueId) ?? Number.NEGATIVE_INFINITY;
    if (p > guidaPrezzo) {
      guida = l;
      guidaPrezzo = p;
    }
  }
  return { valueId: guida.valueId, voce: guida.voce };
}

/** Di quale valore, e quale altro, il prezzo segue il più caro: serve a dirlo a chi sceglie due fasce diverse. */
export function fasceDeiLati<V extends ValoreColore>(asse: { values: ReadonlyArray<V> }, colori: ColoriDentroFuori): { interno: V; esterno: V } | null {
  const interno = colori.interno.scritto ? undefined : asse.values.find((v) => v.id === colori.interno.valueId);
  const esterno = colori.esterno.scritto ? undefined : asse.values.find((v) => v.id === colori.esterno.valueId);
  return interno && esterno && interno.id !== esterno.id ? { interno, esterno } : null;
}
