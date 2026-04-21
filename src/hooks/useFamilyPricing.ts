/**
 * Preventivatore Verticalizzato Serramentisti — FASE 5
 *
 * Motore di calcolo prezzo per le famiglie articolo.
 *
 * Funzioni pure + wrapper React Query:
 *  - nearestGrid(): ricerca Manhattan in griglia prezzi L×H.
 *  - calcolaPrezzoFamiglia(): algoritmo vendita/acquisto.
 *  - useFamilyGrid(): carica i punti griglia cachati (5 min).
 *
 * L'algoritmo segue masterprompt sezione 9 (FASE 5.1):
 *   1. prezzo base unitario dalla modalita_prezzo_base
 *   2. maggiorazioni PERCENTUALI in ordine sort_order degli assi
 *   3. maggiorazioni FISSE (pz/mq/ml/mc) nello stesso ordine
 *   4. totale = unit × quantita
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FamilyWithAxes, AxisSelection } from "@/types/articleFamily";
import { queryKeys } from "@/lib/queryKeys";
import { applyScontiFornitore, applyMarkup } from "@/lib/priceMarkup";
import { round2 } from "./usePreventivoCosti";

export interface GridPoint {
  valore_x: number;
  valore_y: number;
  prezzo_vendita: number;
  prezzo_acquisto_netto: number | null;
  /**
   * STEP 6 Serramenti Avanzati: fornitore sorgente della cella. NULL per
   * griglia "base" senza supplier (caso di aziende che non usano listini
   * avanzati). Serve al wizard per filtrare e applicare sconto/ricarico.
   */
  supplier_catalog_id?: string | null;
  supplier_product_line_id?: string | null;
}

export interface PricingInput {
  family: FamilyWithAxes;
  selections: AxisSelection;
  larghezza_mm?: number;
  altezza_mm?: number;
  lunghezza_ml?: number;
  quantita: number;
}

export interface AppliedMaggiorazione {
  axis_codice: string;
  value_valore: string;
  tipo: string;
  valore: number;
  delta_vendita: number;
  delta_acquisto: number;
}

export interface PricingResult {
  unit_price_vendita: number;
  unit_price_acquisto: number;
  prezzo_griglia_base: number | null;
  mq: number | null;
  maggiorazioni_applicate: AppliedMaggiorazione[];
  totale_vendita: number;
  totale_acquisto: number;
  warnings: string[];
}

/**
 * Ricerca nearest-neighbor Manhattan in una lista di punti griglia.
 * Se esiste match esatto viene restituito con found=true.
 * Se la lista è vuota ritorna {0,0,false}.
 */
export function nearestGrid(
  punti: GridPoint[],
  x: number,
  y: number,
): { pv: number; pa: number; found: boolean } {
  if (!punti.length) return { pv: 0, pa: 0, found: false };
  const exact = punti.find((p) => p.valore_x === x && p.valore_y === y);
  if (exact) {
    return {
      pv: exact.prezzo_vendita,
      pa: exact.prezzo_acquisto_netto ?? 0,
      found: true,
    };
  }
  let nearest = punti[0];
  let minDist = Infinity;
  for (const p of punti) {
    const d = Math.abs(p.valore_x - x) + Math.abs(p.valore_y - y);
    if (d < minDist) {
      minDist = d;
      nearest = p;
    }
  }
  return {
    pv: nearest.prezzo_vendita,
    pa: nearest.prezzo_acquisto_netto ?? 0,
    found: false,
  };
}

/**
 * Calcola prezzo vendita + acquisto per un'istanza di famiglia.
 * Funzione PURA: nessun side-effect, deterministica dati gli input.
 */
export function calcolaPrezzoFamiglia(
  input: PricingInput,
  griglia?: GridPoint[],
): PricingResult {
  const {
    family,
    selections,
    larghezza_mm,
    altezza_mm,
    lunghezza_ml,
    quantita,
  } = input;
  const warnings: string[] = [];

  const mq =
    larghezza_mm != null && altezza_mm != null
      ? (larghezza_mm / 1000) * (altezza_mm / 1000)
      : null;
  const ml = lunghezza_ml ?? null;

  // 1. Prezzo base unitario
  let pv = 0;
  let pa = 0;
  let prezzo_griglia_base: number | null = null;

  switch (family.modalita_prezzo_base) {
    case "pz":
    case "misura_libera":
      pv = family.prezzo_base_vendita;
      pa = family.prezzo_base_acquisto;
      break;
    case "mq":
      if (mq == null) {
        warnings.push("Misure L×H mancanti per famiglia mq");
        break;
      }
      pv = family.prezzo_base_vendita * mq;
      pa = family.prezzo_base_acquisto * mq;
      break;
    case "griglia":
      if (larghezza_mm == null || altezza_mm == null) {
        warnings.push("Misure L×H mancanti per famiglia griglia");
        break;
      }
      if (!griglia || griglia.length === 0) {
        warnings.push("Griglia prezzi vuota per questa famiglia");
        break;
      }
      {
        const n = nearestGrid(griglia, larghezza_mm, altezza_mm);
        if (!n.found) {
          warnings.push(
            `Misura ${larghezza_mm}×${altezza_mm} non in griglia, usata più vicina`,
          );
        }
        pv = n.pv;
        pa = n.pa;
        prezzo_griglia_base = pv;
      }
      break;
  }

  // 1.5. Cascata sconti fornitore + markup on-read (mode=acquisto_markup)
  //
  //   La config famiglia (sconti + markup) è la SOURCE OF TRUTH: il cache
  //   `cell.prezzo_vendita` (FamilyGridEditor) e `family.prezzo_base_vendita`
  //   potrebbero essere stale se l'utente cambia markup/sconti SENZA
  //   risalvare griglia/prezzi. Qui ricalcoliamo pv partendo dall'acquisto
  //   LORDO (che resta invariato in DB), garantendo che il preventivo usi
  //   SEMPRE la policy corrente.
  //
  //   Per mode="vendita" (prezzo diretto cliente) non tocchiamo nulla:
  //   l'utente ha già definito pv esplicitamente.
  if (family.prezzo_base_mode === "acquisto_markup") {
    const s1 = Number(family.sconto_fornitore_1 ?? 0);
    const s2 = Number(family.sconto_fornitore_2 ?? 0);
    // pa qui può essere:
    //  - LORDO (se sconti attivi: FamilyGridEditor scrive acquisto=lordo)
    //  - NETTO (se sconti 0/0: retrocompat)
    // applyScontiFornitore con 0/0 è identità → stesso risultato.
    const nettoAcquisto = applyScontiFornitore(pa, s1, s2);
    pv = applyMarkup({
      prezzoAcquisto: nettoAcquisto,
      markupTipo: family.markup_tipo,
      markupValore: Number(family.markup_valore ?? 0),
    }).prezzoVendita;
    pa = nettoAcquisto;
    // Aggiorna cache grid_base per il wizard
    if (family.modalita_prezzo_base === "griglia") {
      prezzo_griglia_base = pv;
    }
  }

  // 2. + 3. Maggiorazioni in ordine sort_order degli assi
  const maggiorazioni_applicate: AppliedMaggiorazione[] = [];
  const axesSorted = [...family.axes].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  // Prima tutte le percentuali
  for (const axis of axesSorted) {
    const selectedValueId = selections[axis.codice];
    if (!selectedValueId) {
      if (axis.obbligatorio) {
        warnings.push(`Asse "${axis.nome}" obbligatorio non selezionato`);
      }
      continue;
    }
    const val = axis.values.find((v) => v.id === selectedValueId);
    if (!val) {
      warnings.push(`Valore non trovato per asse ${axis.nome}`);
      continue;
    }
    if (val.maggiorazione_tipo !== "percentuale") continue;
    const prev_pv = pv;
    const prev_pa = pa;
    pv = pv * (1 + val.maggiorazione_valore / 100);
    pa = pa * (1 + val.maggiorazione_acquisto / 100);
    maggiorazioni_applicate.push({
      axis_codice: axis.codice,
      value_valore: val.valore,
      tipo: val.maggiorazione_tipo,
      valore: val.maggiorazione_valore,
      delta_vendita: round2(pv - prev_pv),
      delta_acquisto: round2(pa - prev_pa),
    });
  }

  // Poi i fissi
  for (const axis of axesSorted) {
    const selectedValueId = selections[axis.codice];
    if (!selectedValueId) continue;
    const val = axis.values.find((v) => v.id === selectedValueId);
    if (
      !val ||
      val.maggiorazione_tipo === "none" ||
      val.maggiorazione_tipo === "percentuale"
    ) {
      continue;
    }
    let dpv = 0;
    let dpa = 0;
    switch (val.maggiorazione_tipo) {
      case "fisso_pz":
        dpv = val.maggiorazione_valore;
        dpa = val.maggiorazione_acquisto;
        break;
      case "fisso_mq":
        if (mq == null) {
          warnings.push(
            `Maggiorazione mq su asse ${axis.nome} ma mq non calcolabile`,
          );
          break;
        }
        dpv = val.maggiorazione_valore * mq;
        dpa = val.maggiorazione_acquisto * mq;
        break;
      case "fisso_ml":
        if (ml == null) {
          warnings.push(
            `Maggiorazione ml su asse ${axis.nome} ma ml non calcolabile`,
          );
          break;
        }
        dpv = val.maggiorazione_valore * ml;
        dpa = val.maggiorazione_acquisto * ml;
        break;
      case "fisso_mc":
        warnings.push(
          `Maggiorazione mc non ancora supportata (asse ${axis.nome})`,
        );
        break;
    }
    pv += dpv;
    pa += dpa;
    maggiorazioni_applicate.push({
      axis_codice: axis.codice,
      value_valore: val.valore,
      tipo: val.maggiorazione_tipo,
      valore: val.maggiorazione_valore,
      delta_vendita: round2(dpv),
      delta_acquisto: round2(dpa),
    });
  }

  const unit_price_vendita = round2(pv);
  const unit_price_acquisto = round2(pa);

  return {
    unit_price_vendita,
    unit_price_acquisto,
    prezzo_griglia_base:
      prezzo_griglia_base != null ? round2(prezzo_griglia_base) : null,
    mq: mq != null ? round2(mq) : null,
    maggiorazioni_applicate,
    totale_vendita: round2(unit_price_vendita * quantita),
    totale_acquisto: round2(unit_price_acquisto * quantita),
    warnings,
  };
}

/**
 * Hook React Query: carica i punti griglia di una famiglia (cachati 5 min).
 * Invalidato automaticamente al salvataggio famiglia/griglia via
 * queryKeys.articleFamilies.grid(id).
 *
 * STEP 6: include supplier_catalog_id e supplier_product_line_id nel payload
 * per permettere al wizard di filtrare per linea prodotto e applicare
 * sconto/ricarico corretto lato client.
 */
export function useFamilyGrid(familyId: string | undefined) {
  return useQuery({
    queryKey: familyId
      ? queryKeys.articleFamilies.grid(familyId)
      : ["article-families", "grid", "disabled"],
    enabled: !!familyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<GridPoint[]> => {
      if (!familyId) return [];
      // Schema reale listino_griglia: `prezzo_acquisto` (non `_netto`).
      // Mappiamo qui al dominio GridPoint.prezzo_acquisto_netto.
      const { data, error } = await (supabase as never as typeof supabase)
        .from("listino_griglia" as never)
        .select(
          "valore_x, valore_y, prezzo_vendita, prezzo_acquisto, supplier_catalog_id, supplier_product_line_id",
        )
        .eq("family_id" as never, familyId);
      if (error) throw error;
      return ((data ?? []) as Array<{
        valore_x: number;
        valore_y: number;
        prezzo_vendita: number;
        prezzo_acquisto: number | null;
        supplier_catalog_id: string | null;
        supplier_product_line_id: string | null;
      }>).map((r) => ({
        valore_x: Number(r.valore_x),
        valore_y: Number(r.valore_y),
        prezzo_vendita: Number(r.prezzo_vendita),
        prezzo_acquisto_netto: r.prezzo_acquisto != null ? Number(r.prezzo_acquisto) : 0,
        supplier_catalog_id: r.supplier_catalog_id,
        supplier_product_line_id: r.supplier_product_line_id,
      }));
    },
  });
}

/**
 * STEP 6 Serramenti Avanzati — adatta i GridPoint al prezzo vendita reale.
 *
 * Nel MatriceEditor (STEP 4) salviamo in listino_griglia:
 *   - prezzo_vendita   = listino fornitore (PRE sconto)
 *   - prezzo_acquisto  = listino × (1 − sconto) = quanto l'azienda paga
 *
 * Il prezzo di vendita REALE al cliente è invece:
 *   prezzo_acquisto × (1 + ricarico_linea)
 *
 * Questa funzione riproduce tale trasformazione in lettura: restituisce una
 * nuova lista di GridPoint dove `prezzo_vendita` è già il valore che il
 * wizard deve mostrare al cliente (prima delle maggiorazioni assi).
 *
 * Se `ricarico` è null/undefined/0 ritorna la lista invariata (retro-compat
 * con griglie legacy dove prezzo_vendita era già il finale).
 */
export function adjustGridForRicarico(
  points: GridPoint[],
  ricarico: number | null | undefined,
): GridPoint[] {
  if (ricarico == null || !Number.isFinite(ricarico) || ricarico <= 0) {
    return points;
  }
  return points.map((p) => ({
    ...p,
    prezzo_vendita:
      p.prezzo_acquisto_netto != null && p.prezzo_acquisto_netto > 0
        ? round2(p.prezzo_acquisto_netto * (1 + ricarico))
        : p.prezzo_vendita,
  }));
}
