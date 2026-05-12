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

// ─── Tipi ──────────────────────────────────────────────────────────────────

export type CalcoloPrezzoResult = {
  prezzo: number;
  matchedGrigliaId: string | null;
  note: string | null;
  /** True se la misura inserita e' fuori range producibile (max o min). */
  fuoriRange?: boolean;
  /** Range disponibile dalla griglia listino, se applicabile. */
  range?: { minL: number | null; maxL: number | null; minH: number | null; maxH: number | null };
};

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
 *     (filter valore_x >= L && valore_y >= H) e prende il prezzo MIN
 *     fra i candidati. Se nessun candidato => fuoriRange=true.
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
  griglia: Array<{ id: string; valore_x: number | null; valore_y: number | null; prezzo_vendita: number | null }>,
): CalcoloPrezzoResult {
  const base = Number(family.prezzo_base_vendita ?? 0);
  const modalita = family.modalita_prezzo_base ?? "pz";

  switch (modalita) {
    case "pz":
      return { prezzo: base * quantita, matchedGrigliaId: null, note: null };
    case "mq": {
      if (!larghezza || !altezza) {
        return { prezzo: 0, matchedGrigliaId: null, note: "Inserisci larghezza e altezza per calcolo m²" };
      }
      const mq = (larghezza * altezza) / 1_000_000;
      return { prezzo: base * mq * quantita, matchedGrigliaId: null, note: `${mq.toFixed(2)} m² × €${base.toFixed(2)}/m²` };
    }
    case "misura_libera":
      return { prezzo: base * quantita, matchedGrigliaId: null, note: "Prezzo a corpo, misure indicative" };
    case "griglia": {
      const range = getGrigliaRange(griglia);
      if (!larghezza || !altezza) {
        return {
          prezzo: base * quantita, matchedGrigliaId: null,
          note: "Inserisci misure per leggere griglia",
          range,
        };
      }
      const candidates = griglia.filter((g) =>
        g.valore_x != null && g.valore_y != null && g.prezzo_vendita != null
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
          fuoriRange: true, range,
        };
      }
      const best = candidates.reduce((min, g) =>
        Number(g.prezzo_vendita ?? Infinity) < Number(min.prezzo_vendita ?? Infinity) ? g : min,
      );
      const prezzoBest = Number(best.prezzo_vendita ?? 0);
      return {
        prezzo: prezzoBest * quantita, matchedGrigliaId: best.id,
        note: `Griglia ${best.valore_x}×${best.valore_y}mm @ €${prezzoBest.toFixed(2)}`,
        range,
      };
    }
    default:
      return { prezzo: base * quantita, matchedGrigliaId: null, note: null };
  }
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
    }>;
  }>,
  L: number | null,
  H: number | null,
  quantita: number,
): number {
  let pv = prezzoBaseTotale;
  const mq = L != null && H != null ? (L / 1000) * (H / 1000) * quantita : null;
  // Nessuna misura "lunghezza_ml" disponibile su serramenti -> ml=null,
  // maggiorazioni fisso_ml vengono ignorate (skip silenzioso).
  const ml = null;

  // 1. Prima le percentuali (si applicano in cascata sul prezzo corrente).
  for (const axis of axes) {
    const valueId = selections[axis.codice];
    if (!valueId) continue;
    const val = axis.values.find((v) => v.id === valueId);
    if (!val || val.maggiorazione_tipo !== "percentuale") continue;
    pv = pv * (1 + Number(val.maggiorazione_valore) / 100);
  }

  // 2. Poi i fissi (additivi).
  for (const axis of axes) {
    const valueId = selections[axis.codice];
    if (!valueId) continue;
    const val = axis.values.find((v) => v.id === valueId);
    if (!val || val.maggiorazione_tipo === "none" || val.maggiorazione_tipo === "percentuale") continue;
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
  return pv;
}
