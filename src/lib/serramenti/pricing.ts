/**
 * src/lib/serramenti/pricing.ts — funzioni di calcolo prezzo del listino
 * serramenti. Estratte da `ListinoPickerDialog.tsx` per pulizia di
 * separazione e per silenziare i warning `react-refresh` (HMR non
 * supporta moduli che esportano sia componenti che helper).
 *
 * Sono tutte FUNZIONI PURE (no side-effect, no DB) -> testabili
 * facilmente in isolamento. Usate da `ListinoPickerDialog` (picker
 * commerciale) e `StepBom.SerramentoRow` (ricalcolo on-change).
 */
import type { ListinoFamily } from "./api";
import { formatEuro, formatNumero } from "./format";
import { applyMarkup, applyScontiFornitore } from "@/lib/priceMarkup";
import type { MarkupTipo } from "@/types/articleFamily";

// ─── Tipi ──────────────────────────────────────────────────────────────────

export type CalcoloPrezzoResult = {
  prezzo: number;
  matchedGrigliaId: string | null;
  note: string | null;
  supplierCatalogId?: string | null;
  supplierProductLineId?: string | null;
  /** True quando una griglia contiene piu' linee fornitore e la UI deve far scegliere quale usare. */
  requiresSupplierLine?: boolean;
  /** True se la linea selezionata non e' caricata: evitiamo ricalcoli al buio. */
  missingSupplierLinePricing?: boolean;
  availableSupplierProductLineIds?: string[];
  /** True se la misura inserita e' fuori range producibile (max o min). */
  fuoriRange?: boolean;
  /** Range disponibile dalla griglia listino, se applicabile. */
  range?: { minL: number | null; maxL: number | null; minH: number | null; maxH: number | null };
};

export type SupplierLinePricing = {
  id: string;
  supplier_catalog_id?: string | null;
  nome?: string | null;
  /** 0..N, es. 1 = +100% */
  ricarico_default?: number | null;
};

type GrigliaPricingItem = {
  id: string;
  valore_x: number | null;
  valore_y: number | null;
  prezzo_vendita: number | null;
  prezzo_acquisto?: number | null;
  supplier_catalog_id?: string | null;
  supplier_product_line_id?: string | null;
};

export type CalcolaPrezzoOptions = {
  supplierProductLineId?: string | null;
  supplierLines?: Map<string, SupplierLinePricing> | SupplierLinePricing[];
};

function supplierLineMapFrom(
  supplierLines?: Map<string, SupplierLinePricing> | SupplierLinePricing[],
): Map<string, SupplierLinePricing> {
  if (!supplierLines) return new Map();
  return supplierLines instanceof Map
    ? supplierLines
    : new Map(supplierLines.map((line) => [line.id, line]));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Il prezzo di vendita salvato o, per un prodotto a ricarico che non l'ha (0),
 * quello che viene dall'acquisto con sconti fornitore e ricarico, come fa
 * calcolaPrezzoFamiglia. Prima un prodotto a ricarico senza vendita salvata
 * finiva nel preventivo a 0 €.
 *
 * Il salvato ha la precedenza: è il prezzo che il preventivatore ha sempre
 * usato. Ricalcolarlo qui avrebbe cambiato i preventivi delle griglie salvate
 * prima di un cambio di sconti (a Ke Bei 154 celle, fino a un terzo in meno).
 */
function venditaOAcquisto(
  family: ListinoFamily,
  vendita: number | null | undefined,
  acquisto: number | null | undefined,
): number {
  const salvata = Number(vendita ?? 0);
  const lordo = Number(acquisto ?? 0);
  if (salvata > 0 || family.prezzo_base_mode !== "acquisto_markup" || !(lordo > 0)) return salvata;
  const netto = applyScontiFornitore(lordo, Number(family.sconto_fornitore_1 ?? 0), Number(family.sconto_fornitore_2 ?? 0));
  return round2(
    applyMarkup({
      prezzoAcquisto: netto,
      markupTipo: (family.markup_tipo ?? "none") as MarkupTipo,
      markupValore: Number(family.markup_valore ?? 0),
    }).prezzoVendita,
  );
}

// ─── Range griglia ─────────────────────────────────────────────────────────

/**
 * Estrae le misure MIN e MAX disponibili nella griglia listino. Usate per
 * comunicare chiaramente all'utente quali misure sono producibili.
 * Esempio: "Disponibile da 500×600 mm a 2400×2400 mm".
 */
export function getGrigliaRange(
  griglia: Array<{ valore_x: number | null; valore_y: number | null; prezzo_vendita: number | null }>,
): { minL: number | null; maxL: number | null; minH: number | null; maxH: number | null } {
  const xs = griglia.map((g) => g.valore_x).filter((v): v is number => v != null);
  const ys = griglia.map((g) => g.valore_y).filter((v): v is number => v != null);
  return {
    minL: xs.length ? Math.min(...xs) : null,
    maxL: xs.length ? Math.max(...xs) : null,
    minH: ys.length ? Math.min(...ys) : null,
    maxH: ys.length ? Math.max(...ys) : null,
  };
}

// ─── Calcolo prezzo prodotto (BASE) ────────────────────────────────────────

/**
 * Strategia di pricing griglia consolidata col picker:
 *   - case "griglia": trova il "quadrante che contiene le misure"
 *     (filter valore_x >= L && valore_y >= H) e prende la cella contenente
 *     piu' piccola. Se nessun candidato => fuoriRange=true.
 *   - case "mq": prezzo_base × L × H × Q.
 *   - case "pz"/"misura_libera": prezzo_base × Q.
 *
 * Le maggiorazioni delle Variabili Prodotto si applicano DOPO via
 * `applyMaggiorazioniAssi`, non qui.
 */
export function calcolaPrezzoProdotto(
  family: ListinoFamily,
  larghezza: number | null,
  altezza: number | null,
  quantita: number,
  griglia: GrigliaPricingItem[],
  options: CalcolaPrezzoOptions = {},
): CalcoloPrezzoResult {
  const base = venditaOAcquisto(family, family.prezzo_base_vendita, family.prezzo_base_acquisto);
  const modalita = family.modalita_prezzo_base ?? "pz";

  switch (modalita) {
    case "pz":
      return { prezzo: base * quantita, matchedGrigliaId: null, note: null };
    case "mq": {
      if (!larghezza || !altezza) {
        return { prezzo: 0, matchedGrigliaId: null, note: "Inserisci larghezza e altezza per calcolo m²" };
      }
      const mq = (larghezza * altezza) / 1_000_000;
      return { prezzo: base * mq * quantita, matchedGrigliaId: null, note: `${formatNumero(mq, 2)} m² × ${formatEuro(base, 2)}/m²` };
    }
    case "misura_libera":
      return { prezzo: base * quantita, matchedGrigliaId: null, note: "Prezzo a corpo, misure indicative" };
    case "griglia": {
      const supplierLineMap = supplierLineMapFrom(options.supplierLines);
      const availableSupplierProductLineIds = Array.from(
        new Set(griglia.map((g) => g.supplier_product_line_id).filter((v): v is string => !!v)),
      );
      const requiresSupplierLine =
        availableSupplierProductLineIds.length > 1 && !options.supplierProductLineId;
      const grigliaFiltrata = options.supplierProductLineId
        ? griglia.filter((g) => g.supplier_product_line_id === options.supplierProductLineId)
        : griglia;
      const range = getGrigliaRange(grigliaFiltrata);

      if (requiresSupplierLine) {
        return {
          prezzo: 0,
          matchedGrigliaId: null,
          note: "Scegli la linea prodotto fornitore per calcolare il prezzo corretto.",
          requiresSupplierLine: true,
          availableSupplierProductLineIds,
          range,
        };
      }

      if (!larghezza || !altezza) {
        return {
          prezzo: base * quantita, matchedGrigliaId: null,
          note: "Inserisci misure per leggere griglia",
          availableSupplierProductLineIds,
          range,
        };
      }
      const candidates = grigliaFiltrata.filter((g) =>
        g.valore_x != null && g.valore_y != null
        && (g.prezzo_vendita != null || g.prezzo_acquisto != null)
        && g.valore_x >= larghezza && g.valore_y >= altezza
      );
      if (candidates.length === 0) {
        // Misura FUORI RANGE: l'articolo non e' producibile a queste misure.
        // Prima si applicava silenziosamente il prezzo max -> rischio di
        // vendere a un prezzo qualunque misure che la fabbrica non puo' fare.
        // Ora segnaliamo esplicitamente con `fuoriRange=true` e il range
        // disponibile, cosi' la UI puo' bloccare/avvisare l'utente.
        const fmtMis = (x: number | null, y: number | null) =>
          x != null && y != null ? `${x}×${y} mm` : "—";
        const noteMsg = `Misura non producibile. Range disponibile: da ${fmtMis(range.minL, range.minH)} a ${fmtMis(range.maxL, range.maxH)}.`;
        return {
          prezzo: 0, matchedGrigliaId: null, note: noteMsg,
          fuoriRange: true, range, availableSupplierProductLineIds,
        };
      }
      const best = [...candidates].sort((a, b) => {
        const areaA = Number(a.valore_x ?? 0) * Number(a.valore_y ?? 0);
        const areaB = Number(b.valore_x ?? 0) * Number(b.valore_y ?? 0);
        if (areaA !== areaB) return areaA - areaB;
        if (Number(a.valore_x ?? 0) !== Number(b.valore_x ?? 0)) {
          return Number(a.valore_x ?? 0) - Number(b.valore_x ?? 0);
        }
        return Number(a.valore_y ?? 0) - Number(b.valore_y ?? 0);
      })[0];
      const supplierProductLineId = best.supplier_product_line_id ?? null;
      const supplierLine = supplierProductLineId
        ? supplierLineMap.get(supplierProductLineId)
        : undefined;
      if (supplierProductLineId && best.prezzo_acquisto != null && best.prezzo_acquisto > 0 && !supplierLine) {
        return {
          prezzo: 0,
          matchedGrigliaId: best.id,
          note: "Configurazione fornitore non caricata: aggiorna e riprova il calcolo.",
          supplierCatalogId: best.supplier_catalog_id ?? null,
          supplierProductLineId,
          missingSupplierLinePricing: true,
          availableSupplierProductLineIds,
          range,
        };
      }
      const prezzoBest = supplierLine && best.prezzo_acquisto != null && best.prezzo_acquisto > 0
        ? round2(Number(best.prezzo_acquisto) * (1 + Number(supplierLine.ricarico_default ?? 0)))
        : venditaOAcquisto(family, best.prezzo_vendita, best.prezzo_acquisto);
      return {
        prezzo: prezzoBest * quantita, matchedGrigliaId: best.id,
        note: `Griglia ${best.valore_x}×${best.valore_y} mm @ ${formatEuro(prezzoBest, 2)}`,
        supplierCatalogId: best.supplier_catalog_id ?? supplierLine?.supplier_catalog_id ?? null,
        supplierProductLineId,
        availableSupplierProductLineIds,
        range,
      };
    }
    default:
      return { prezzo: base * quantita, matchedGrigliaId: null, note: null };
  }
}

/**
 * Un prodotto di listino "pz"/"mq" senza prezzo di vendita né di acquisto
 * configurato (o "misura libera"): il prezzo resta sempre 0 per costruzione,
 * non perché manchino le misure. Chi lo usa (es. Infissi e Living) scrive il
 * prezzo a mano nel BOM — vedi isListinoManualPrice in StepBom.tsx, stessa
 * logica estratta qui per essere riusata anche da chi aggiunge la posizione
 * (ListinoPickerDialog), che altrimenti bloccava "Aggiungi al preventivo" per
 * sempre su questi prodotti scambiando "0 perché non prezzato" per "0 perché
 * mancano le misure".
 */
export function listinoSenzaPrezzoDiVendita(family: ListinoFamily | null | undefined): boolean {
  if (!family) return false;
  const modalita = family.modalita_prezzo_base;
  if (modalita === "misura_libera") return true;
  if (modalita !== "pz" && modalita !== "mq") return false;
  const prezzoBase = calcolaPrezzoProdotto(family, 1000, 1000, 1, []).prezzo;
  return !(prezzoBase > 0);
}

// ─── Posa inclusa ──────────────────────────────────────────────────────────

/**
 * Calcolo posa inclusa nel prezzo della posizione. Usata sia dal picker
 * (Listino) sia da StepBom (al ricalcolo on-change L/H/Q) per garantire
 * che la posa configurata sull'articolo NON sparisca silenziosamente dal
 * prezzo (bug fixato).
 */
export function calcolaPosaInclusa(
  family: ListinoFamily,
  quantita: number,
  tariffePrezzi: Map<string, number>,
): number {
  const modalita = family.manodopera_modalita;
  if (!modalita || modalita === "nessuna") return 0;
  const qtyDefault = Number(family.posa_quantita_default ?? 1);
  const qtyTotale = quantita * qtyDefault;
  if (modalita === "tariffa" && family.posa_tariffa_default_id) {
    const prezzoTariffa = tariffePrezzi.get(family.posa_tariffa_default_id) ?? 0;
    return prezzoTariffa * qtyTotale;
  }
  if (modalita === "manuale") {
    return Number(family.manodopera_prezzo_vendita ?? 0) * qtyTotale;
  }
  return 0;
}

// ─── Maggiorazioni assi (Variabili Prodotto) ──────────────────────────────

/**
 * Applica le maggiorazioni degli ASSI (Variabili Prodotto) al prezzo base
 * prodotto. Replica la logica di `calcolaPrezzoFamiglia` (in useFamilyPricing)
 * ma sopra un prezzo BASE gia' calcolato (es. da `calcolaPrezzoProdotto`),
 * cosi' la strategia di lookup griglia resta coerente col picker (filtro
 * "quadrante che contiene le misure", min prezzo) invece di switchare a
 * nearestGrid (punto piu' vicino) che dava risultati molto diversi.
 *
 * Ordine applicazione (stesso pattern del helper esistente):
 *   1. Tutte le percentuali (`maggiorazione_tipo='percentuale'`)
 *   2. Tutti i fissi (fisso_pz, fisso_mq, fisso_ml)
 *
 * Ritorna prezzo TOTALE (gia' moltiplicato per quantita), come
 * `calcolaPrezzoProdotto` -> divide /Q nel chiamante per ottenere unitario.
 */
export function applyMaggiorazioniAssi(
  prezzoBaseTotale: number,
  selections: Record<string, string>,
  axes: Array<{
    codice: string;
    values: Array<{
      id: string;
      maggiorazione_tipo: "none" | "percentuale" | "fisso_pz" | "fisso_mq" | "fisso_ml" | "fisso_mc";
      maggiorazione_valore: number;
      prezzo_vendita?: number | null;
    }>;
  }>,
  L: number | null,
  H: number | null,
  quantita: number,
  modalitaPrezzoBase?: string | null,
): number {
  let pv = prezzoBaseTotale;
  const mq = L != null && H != null ? (L / 1000) * (H / 1000) * quantita : null;
  // Per i serramenti non esiste una colonna "lunghezza_ml" dedicata: usiamo
  // la larghezza come sviluppo lineare principale, evitando che maggiorazioni
  // fisso_ml configurate sul listino vengano ignorate silenziosamente.
  const ml = L != null ? (L / 1000) * quantita : null;

  // 0. Prezzo assoluto per-valore (Variabili Prodotto): un valore d'asse col
  // proprio prezzo_vendita SOSTITUISCE il prezzo base invece di applicarci
  // sopra una maggiorazione — stesso "prezzo proprio" di ordini/commesse
  // (ArticleCombobox.variantPrice), qui attivo anche nel preventivatore. Non
  // si applica in modalità "griglia" (il prezzo dipende dalla cella L×H).
  const assiPrezzoAssoluto = new Set<string>();
  if (modalitaPrezzoBase !== "griglia") {
    for (const axis of axes) {
      const valueId = selections[axis.codice];
      if (!valueId) continue;
      const val = axis.values.find((v) => v.id === valueId);
      if (!val || val.prezzo_vendita == null || !(val.prezzo_vendita > 0)) continue;
      pv = modalitaPrezzoBase === "mq" && mq != null ? val.prezzo_vendita * mq : val.prezzo_vendita * quantita;
      assiPrezzoAssoluto.add(axis.codice);
    }
  }

  // 1. Prima le percentuali (si applicano in cascata sul prezzo corrente).
  for (const axis of axes) {
    const valueId = selections[axis.codice];
    if (!valueId) continue;
    const val = axis.values.find((v) => v.id === valueId);
    if (!val || assiPrezzoAssoluto.has(axis.codice) || val.maggiorazione_tipo !== "percentuale") continue;
    pv = pv * (1 + Number(val.maggiorazione_valore) / 100);
  }

  // 2. Poi i fissi (additivi).
  for (const axis of axes) {
    const valueId = selections[axis.codice];
    if (!valueId) continue;
    const val = axis.values.find((v) => v.id === valueId);
    if (!val || assiPrezzoAssoluto.has(axis.codice) || val.maggiorazione_tipo === "none" || val.maggiorazione_tipo === "percentuale") continue;
    const valoreNum = Number(val.maggiorazione_valore);
    switch (val.maggiorazione_tipo) {
      case "fisso_pz":
        pv += valoreNum * quantita;
        break;
      case "fisso_mq":
        if (mq != null) pv += valoreNum * mq;
        break;
      case "fisso_ml":
        if (ml != null) pv += valoreNum * ml;
        break;
      case "fisso_mc":
        // mc non supportato per serramenti.
        break;
    }
  }
  // Le riduzioni delle varianti (−20 €) non portano mai il prezzo sotto zero.
  return Math.max(0, pv);
}

// ─── Costo d'acquisto della posizione (per il margine) ────────────────────

/** Le varianti come servono al costo: prezzo e maggiorazioni dal lato acquisto. */
export type AsseCosto = {
  codice: string;
  values: Array<{
    id: string;
    maggiorazione_tipo: "none" | "percentuale" | "fisso_pz" | "fisso_mq" | "fisso_ml" | "fisso_mc";
    maggiorazione_acquisto?: number | null;
    prezzo_vendita?: number | null;
    prezzo_acquisto?: number | null;
  }>;
};

export type CostoPosizione = {
  /** Costo del prodotto (varianti comprese) per tutta la quantità; null se il listino non ce l'ha. */
  prodotto: number | null;
  /** Costo della posa compresa nel prezzo (0 se esclusa o assente). */
  posa: number;
};

/** I campi del prodotto che servono al costo: vanno bene sia ListinoFamily sia FamilyWithAxes. */
export type FamigliaCosto = Pick<
  ListinoFamily,
  | "modalita_prezzo_base"
  | "prezzo_base_mode"
  | "prezzo_base_acquisto"
  | "sconto_fornitore_1"
  | "sconto_fornitore_2"
  | "manodopera_modalita"
  | "posa_tariffa_default_id"
  | "posa_quantita_default"
  | "manodopera_costo_acquisto"
>;

/**
 * Il costo d'acquisto di una posizione del preventivo, con le stesse regole
 * del suo prezzo di vendita (calcolaPrezzoProdotto, applyMaggiorazioniAssi,
 * calcolaPosaInclusa) ma dal lato acquisto (05/10/2026). Prima il margine
 * del preventivo prendeva il costo solo dalla cella della griglia: un
 * prodotto a pezzo o al metro quadro risultava sempre «senza costo» anche
 * col costo scritto nel listino, e la cella si leggeva al lordo degli sconti
 * fornitore che il prezzo di vendita invece toglie.
 *
 *  - pz / misura libera: costo × pezzi; mq: costo × m² × pezzi;
 *  - griglia: il costo della cella usata dalla riga;
 *  - prodotto «acquisto + ricarico»: il costo salvato è il lordo di listino,
 *    si tolgono gli sconti fornitore come per il prezzo (non per le celle di
 *    una linea fornitore, che hanno il costo netto e il loro ricarico);
 *  - varianti: prezzo d'acquisto proprio, maggiorazioni d'acquisto % e fisse;
 *  - posa: costo della tariffa o importo manuale, se la riga non la esclude.
 *
 * `prodotto` è null quando il listino non ha un costo: il margine resta
 * «incompleto» invece di valere il 100%.
 */
export function calcolaCostoPosizione(args: {
  family: FamigliaCosto;
  larghezza: number | null;
  altezza: number | null;
  quantita: number;
  /** La cella della griglia usata dalla riga (solo per i prodotti a griglia). */
  cella?: { prezzo_acquisto: number | null; supplier_product_line_id?: string | null } | null;
  selections?: Record<string, string> | null;
  axes?: AsseCosto[] | null;
  posaEsclusa?: boolean | null;
  /** Tariffa → costo per unità (tariffe_aziendali.prezzo_costo). */
  tariffeCosti?: Map<string, number>;
}): CostoPosizione {
  const { family, larghezza: L, altezza: H } = args;
  const quantita = args.quantita > 0 ? args.quantita : 1;
  const modalita = family.modalita_prezzo_base ?? "pz";
  const mq = L && H ? (L / 1000) * (H / 1000) * quantita : null;
  const ml = L ? (L / 1000) * quantita : null;
  const conSconti = family.prezzo_base_mode === "acquisto_markup";
  const netto = (lordo: number) =>
    conSconti
      ? applyScontiFornitore(lordo, Number(family.sconto_fornitore_1 ?? 0), Number(family.sconto_fornitore_2 ?? 0))
      : lordo;

  // 1. Costo base, come il prezzo base.
  let costo: number | null = null;
  if (modalita === "griglia") {
    const cella = args.cella;
    const acquisto = Number(cella?.prezzo_acquisto ?? 0);
    if (acquisto > 0) costo = (cella?.supplier_product_line_id ? acquisto : netto(acquisto)) * quantita;
  } else {
    const acquisto = netto(Number(family.prezzo_base_acquisto ?? 0));
    if (acquisto > 0) {
      if (modalita === "mq") costo = mq != null ? acquisto * mq : null;
      else costo = acquisto * quantita;
    }
  }

  // 2. Varianti: stesse regole di applyMaggiorazioniAssi, coi valori d'acquisto.
  const selections = args.selections ?? {};
  const axes = args.axes ?? [];
  const scelto = (axis: AsseCosto) => {
    const valueId = selections[axis.codice];
    return valueId ? axis.values.find((v) => v.id === valueId) ?? null : null;
  };
  const assiPrezzoAssoluto = new Set<string>();
  if (modalita !== "griglia") {
    for (const axis of axes) {
      const val = scelto(axis);
      if (!val || val.prezzo_vendita == null || !(val.prezzo_vendita > 0)) continue;
      assiPrezzoAssoluto.add(axis.codice);
      // Il prezzo proprio della variante sostituisce la base; il costo solo
      // se la variante ne ha uno (come calcolaPrezzoFamiglia).
      const acquisto = Number(val.prezzo_acquisto ?? 0);
      if (acquisto > 0) costo = modalita === "mq" && mq != null ? acquisto * mq : acquisto * quantita;
    }
  }
  if (costo != null) {
    for (const axis of axes) {
      const val = scelto(axis);
      if (!val || assiPrezzoAssoluto.has(axis.codice) || val.maggiorazione_tipo !== "percentuale") continue;
      costo *= 1 + Number(val.maggiorazione_acquisto ?? 0) / 100;
    }
    for (const axis of axes) {
      const val = scelto(axis);
      if (!val || assiPrezzoAssoluto.has(axis.codice)) continue;
      const delta = Number(val.maggiorazione_acquisto ?? 0);
      if (val.maggiorazione_tipo === "fisso_pz") costo += delta * quantita;
      else if (val.maggiorazione_tipo === "fisso_mq" && mq != null) costo += delta * mq;
      else if (val.maggiorazione_tipo === "fisso_ml" && ml != null) costo += delta * ml;
    }
    // Come il prezzo: le riduzioni non portano il costo sotto zero.
    costo = Math.max(0, costo);
  }

  // 3. Posa compresa nel prezzo: stesso calcolo di calcolaPosaInclusa, col costo.
  let posa = 0;
  if (!args.posaEsclusa) {
    const qtyTotale = quantita * Number(family.posa_quantita_default ?? 1);
    if (family.manodopera_modalita === "tariffa" && family.posa_tariffa_default_id) {
      posa = (args.tariffeCosti?.get(family.posa_tariffa_default_id) ?? 0) * qtyTotale;
    } else if (family.manodopera_modalita === "manuale") {
      posa = Number(family.manodopera_costo_acquisto ?? 0) * qtyTotale;
    }
  }

  return { prodotto: costo != null ? round2(costo) : null, posa: round2(posa) };
}
