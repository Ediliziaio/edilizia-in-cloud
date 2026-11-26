/**
 * Le colonne di un elenco le decide l'azienda (26/11/2026).
 *
 * Ogni impresa guarda cose diverse: chi fattura a privati non guarda mai il CIG, chi
 * lavora con la PA non guarda l'IBAN. Finora le colonne erano decise nel codice, e in
 * tabella finivano colonne che nessuno leggeva mentre quelle che servono stavano fuori
 * schermo. Qui c'è la logica, senza interfaccia: una pagina dichiara le sue colonne, la
 * preferenza dice quali si vedono e in che ordine, e questo file mette insieme le due
 * cose.
 *
 * La preferenza tiene DUE elenchi, non uno:
 *   · `ordine`   — le colonne visibili, nell'ordine scelto;
 *   · `nascoste` — quelle che qualcuno ha spento a mano.
 * Serve per la cosa che succede sempre: domani la pagina guadagna una colonna nuova.
 * Con un solo elenco «quelle visibili» la colonna nuova non comparirebbe a nessuno che
 * abbia mai toccato le impostazioni — invisibile e senza che nessuno se ne accorga.
 * Con due, una colonna che non sta in nessuno dei due è NUOVA e si mostra al suo posto
 * di serie; una che sta in `nascoste` è stata spenta per scelta e resta spenta.
 *
 * Il contrario di questo file è `useCardFieldPreferences`, che fa la stessa cosa per le
 * schede delle opportunità ma senza l'ordine: quando quella pagina avrà bisogno anche
 * dell'ordine, è questo l'impianto da riusare.
 */

export interface ColonnaTabella {
  /** Chiave stabile: finisce nella preferenza salvata, quindi non si rinomina a cuor leggero. */
  chiave: string;
  /** Come si chiama nel pannellino e in testa alla colonna. */
  etichetta: string;
  /**
   * Non si può nascondere: senza di lei la riga non si legge o non si usa (il numero del
   * documento, il menù delle azioni). Resta anche se una preferenza vecchia la nasconde.
   */
  fissa?: boolean;
  /**
   * Non si sposta: sta sempre in testa (la spunta della selezione) o in coda (le azioni).
   * Le ancorate non entrano nel riordino, così non si può infilare il menù azioni in mezzo.
   */
  ancorata?: "inizio" | "fine";
  /** C'è ma di serie è spenta: si accende a mano. */
  spentaDiSerie?: boolean;
}

export interface PreferenzaColonne {
  /** Le colonne visibili, nell'ordine scelto. Solo quelle in mezzo: le ancorate non ci sono. */
  ordine: string[];
  /** Quelle spente per scelta. Una colonna che non sta né qui né in `ordine` è nuova. */
  nascoste: string[];
}

export const PREFERENZA_VUOTA: PreferenzaColonne = { ordine: [], nascoste: [] };

function inMezzo(def: ColonnaTabella[]): ColonnaTabella[] {
  return def.filter((c) => !c.ancorata);
}

/** Vera se quella colonna si può spegnere. */
export function siPuoNascondere(c: ColonnaTabella): boolean {
  return !c.fissa;
}

/**
 * Infila `chiave` fra le già disposte dove sta di serie: subito dopo la vicina che la
 * precede nella dichiarazione della pagina, o in testa se non ce n'è nessuna. Così una
 * colonna nuova — o una riaccesa — arriva dove uno se l'aspetta, non in fondo.
 */
function inserisciAlPostoDiSerie(disposte: string[], chiave: string, centrali: ColonnaTabella[]): void {
  const suoPosto = centrali.findIndex((c) => c.chiave === chiave);
  const precedente = centrali
    .slice(0, Math.max(0, suoPosto))
    .reverse()
    .find((p) => disposte.includes(p.chiave));
  const dove = precedente ? disposte.indexOf(precedente.chiave) + 1 : 0;
  disposte.splice(dove, 0, chiave);
}

/**
 * Le colonne da disegnare, nell'ordine giusto: prima le ancorate in testa, poi quelle in
 * mezzo come dice la preferenza, poi le ancorate in coda.
 *
 * Una colonna sparita dal codice ma rimasta nella preferenza viene ignorata; una colonna
 * nuova si infila dopo la vicina che la precede di serie, così arriva dove uno se
 * l'aspetta invece che in fondo.
 */
export function colonneVisibili(
  def: ColonnaTabella[],
  pref: PreferenzaColonne = PREFERENZA_VUOTA,
): ColonnaTabella[] {
  const perChiave = new Map(def.map((c) => [c.chiave, c]));
  const centrali = inMezzo(def);
  const nascoste = new Set(pref.nascoste);

  // Le scelte salvate che esistono ancora, nell'ordine salvato.
  const disposte: string[] = [];
  for (const chiave of pref.ordine) {
    const c = perChiave.get(chiave);
    if (!c || c.ancorata || disposte.includes(chiave)) continue;
    disposte.push(chiave);
  }

  // Chi non è nella preferenza: una fissa va messa comunque, una nuova pure (al suo posto
  // di serie, non in fondo), una spenta a mano o spenta di serie resta fuori.
  for (const c of centrali) {
    if (disposte.includes(c.chiave)) continue;
    const vaMessa = c.fissa || (!nascoste.has(c.chiave) && !c.spentaDiSerie);
    if (!vaMessa) continue;
    inserisciAlPostoDiSerie(disposte, c.chiave, centrali);
  }

  const visibili = disposte
    .map((k) => perChiave.get(k))
    .filter((c): c is ColonnaTabella => !!c);

  return [
    ...def.filter((c) => c.ancorata === "inizio"),
    ...visibili,
    ...def.filter((c) => c.ancorata === "fine"),
  ];
}

/** Le chiavi visibili: comodo per `if (visibili.has("cig"))` dentro la riga. */
export function chiaviVisibili(def: ColonnaTabella[], pref?: PreferenzaColonne): Set<string> {
  return new Set(colonneVisibili(def, pref).map((c) => c.chiave));
}

/** Come stanno le cose adesso, da dare al pannellino: ogni colonna in mezzo, accesa o spenta. */
export function statoColonne(
  def: ColonnaTabella[],
  pref?: PreferenzaColonne,
): { colonna: ColonnaTabella; accesa: boolean }[] {
  const accese = chiaviVisibili(def, pref);
  const ordinate = colonneVisibili(def, pref).filter((c) => !c.ancorata);
  const spente = inMezzo(def).filter((c) => !accese.has(c.chiave));
  return [
    ...ordinate.map((colonna) => ({ colonna, accesa: true })),
    ...spente.map((colonna) => ({ colonna, accesa: false })),
  ];
}

/** La preferenza che descrive lo stato attuale: il punto di partenza di ogni modifica. */
function congelata(def: ColonnaTabella[], pref?: PreferenzaColonne): PreferenzaColonne {
  const stato = statoColonne(def, pref);
  return {
    ordine: stato.filter((s) => s.accesa).map((s) => s.colonna.chiave),
    nascoste: stato.filter((s) => !s.accesa).map((s) => s.colonna.chiave),
  };
}

/** Accende o spegne una colonna. Una colonna fissa non si spegne: la preferenza non cambia. */
export function conColonnaAccesa(
  def: ColonnaTabella[],
  pref: PreferenzaColonne | undefined,
  chiave: string,
  accesa: boolean,
): PreferenzaColonne {
  const colonna = def.find((c) => c.chiave === chiave);
  if (!colonna || colonna.ancorata) return congelata(def, pref);
  if (!accesa && !siPuoNascondere(colonna)) return congelata(def, pref);

  const base = congelata(def, pref);
  if (accesa) {
    if (base.ordine.includes(chiave)) return base;
    const ordine = [...base.ordine];
    inserisciAlPostoDiSerie(ordine, chiave, inMezzo(def));
    return { ordine, nascoste: base.nascoste.filter((k) => k !== chiave) };
  }
  return {
    ordine: base.ordine.filter((k) => k !== chiave),
    nascoste: base.nascoste.includes(chiave) ? base.nascoste : [...base.nascoste, chiave],
  };
}

/** Sposta una colonna visibile nella posizione `a` fra le visibili (trascinamento o frecce). */
export function conColonnaSpostata(
  def: ColonnaTabella[],
  pref: PreferenzaColonne | undefined,
  chiave: string,
  a: number,
): PreferenzaColonne {
  const base = congelata(def, pref);
  const da = base.ordine.indexOf(chiave);
  if (da < 0) return base;
  const dove = Math.max(0, Math.min(base.ordine.length - 1, a));
  const ordine = [...base.ordine];
  ordine.splice(da, 1);
  ordine.splice(dove, 0, chiave);
  return { ordine, nascoste: base.nascoste };
}

/** Torna come l'abbiamo disegnata noi. */
export function preferenzaDiSerie(): PreferenzaColonne {
  return PREFERENZA_VUOTA;
}

/** Vera se l'azienda ha cambiato qualcosa: serve per mostrare «Ripristina predefinite». */
export function preferenzaToccata(pref?: PreferenzaColonne): boolean {
  return !!pref && (pref.ordine.length > 0 || pref.nascoste.length > 0);
}
