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
import { applicaPrezzoOpzioni } from "@/lib/listino/prezzoOpzioni";
import { assiVisibili } from "@/lib/serramenti/assiCondizionati";
import { leggiColori } from "@/lib/serramenti/coloriDentroFuori";
import { CHIAVE_CATALOGO_COLORI, leggiCatalogoColori, verificaColori } from "@/lib/serramenti/catalogoColori";

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
  /** Misura più grande della griglia: il prodotto non si fa a quella misura, il prezzo è 0. */
  fuori_listino?: boolean;
  /** False se mancano misure/griglia: i supplementi non diventano un prezzo del prodotto. */
  calcolo_disponibile?: boolean;
  costo_completo?: boolean;
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
 * La cella della griglia per una misura: quella esatta, altrimenti la più
 * piccola che la contiene (si paga la misura standard superiore, prassi dei
 * listini serramenti). Null se la misura supera la griglia.
 *
 * È la regola del preventivatore serramenti (calcolaPrezzoProdotto) e del
 * simulatore del listino. Fino al 05/10/2026 qui si usava la cella più
 * VICINA (nearestGrid): 1250×1420 prendeva 1200×1400 invece di 1500×1800,
 * cioè una finestra venduta al prezzo di una più piccola (−30% nell'esempio
 * dei test), e una misura fuori listino prendeva il prezzo della cella più
 * grande senza dirlo.
 */
export function cellaGriglia(
  punti: GridPoint[],
  x: number,
  y: number,
): { punto: GridPoint; esatta: boolean } | null {
  const esatta = punti.find((p) => p.valore_x === x && p.valore_y === y);
  if (esatta) return { punto: esatta, esatta: true };
  const contenenti = punti
    .filter((p) => p.valore_x >= x && p.valore_y >= y)
    .sort(
      (a, b) =>
        a.valore_x * a.valore_y - b.valore_x * b.valore_y ||
        a.valore_x - b.valore_x ||
        a.valore_y - b.valore_y,
    );
  return contenenti.length > 0 ? { punto: contenenti[0], esatta: false } : null;
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
  const indisponibile = (fuori_listino = false): PricingResult => ({
    unit_price_vendita: 0, unit_price_acquisto: 0, prezzo_griglia_base: null,
    mq: null, maggiorazioni_applicate: [], totale_vendita: 0, totale_acquisto: 0,
    warnings, fuori_listino, calcolo_disponibile: false, costo_completo: false,
  });
  const asseColore = assiVisibili(family.axes, selections).find(a => a.codice === "colore");
  let coloriDaVerificare = false;
  if (asseColore && (asseColore.obbligatorio || selections.colore || family.custom_field_values?.[CHIAVE_CATALOGO_COLORI] != null)) {
    const catalogo = leggiCatalogoColori(family.custom_field_values);
    if (family.custom_field_values?.[CHIAVE_CATALOGO_COLORI] != null && !catalogo) {
      warnings.push("Catalogo colori non valido: controlla le impostazioni della linea.");
      return indisponibile();
    }
    const stato = verificaColori(asseColore, leggiColori(asseColore, { valori_assi: selections }), catalogo);
    warnings.push(...stato.avvisi);
    coloriDaVerificare = stato.avvisi.length > 0;
    if (stato.blocca) return indisponibile();
    if (stato.fasciaId && selections.colore !== stato.fasciaId) {
      warnings.push("La fascia prezzo non corrisponde alla combinazione colori. Riconfigura il prodotto.");
      return indisponibile();
    }
  }
  if (!Number.isFinite(quantita) || quantita <= 0) {
    warnings.push("Inserisci una quantità valida maggiore di zero");
    return indisponibile();
  }
  if ((family.modalita_prezzo_base === "mq" || family.modalita_prezzo_base === "griglia") &&
    (larghezza_mm != null && (!Number.isFinite(larghezza_mm) || larghezza_mm <= 0) ||
     altezza_mm != null && (!Number.isFinite(altezza_mm) || altezza_mm <= 0))) {
    warnings.push("Inserisci larghezza e altezza valide maggiori di zero");
    return indisponibile();
  }

  const mq =
    larghezza_mm != null && altezza_mm != null
      ? (larghezza_mm / 1000) * (altezza_mm / 1000)
      : null;
  const ml = lunghezza_ml ?? null;

  // 1. Prezzo base unitario
  let pv = 0;
  let pa = 0;
  let prezzo_griglia_base: number | null = null;
  const fuori_listino = false;

  switch (family.modalita_prezzo_base) {
    case "pz":
    case "misura_libera":
      pv = family.prezzo_base_vendita;
      pa = family.prezzo_base_acquisto;
      break;
    case "mq":
      if (mq == null) {
        warnings.push("Misure L×H mancanti per famiglia mq");
        return indisponibile();
      }
      pv = family.prezzo_base_vendita * mq;
      pa = family.prezzo_base_acquisto * mq;
      break;
    case "griglia":
      if (larghezza_mm == null || altezza_mm == null) {
        warnings.push("Misure L×H mancanti per famiglia griglia");
        return indisponibile();
      }
      if (!griglia || griglia.length === 0) {
        warnings.push("Griglia prezzi vuota per questa famiglia");
        return indisponibile();
      }
      {
        const cella = cellaGriglia(griglia, larghezza_mm, altezza_mm);
        if (!cella) {
          const maxX = Math.max(...griglia.map((p) => p.valore_x));
          const maxY = Math.max(...griglia.map((p) => p.valore_y));
          warnings.push(
            `Misura ${larghezza_mm}×${altezza_mm} fuori listino: la griglia arriva a ${maxX}×${maxY} mm`,
          );
          return indisponibile(true);
        }
        if (!cella.esatta) {
          warnings.push(
            `Misura ${larghezza_mm}×${altezza_mm} non in griglia: prezzo della misura superiore ${cella.punto.valore_x}×${cella.punto.valore_y} mm`,
          );
        }
        pv = cella.punto.prezzo_vendita;
        pa = cella.punto.prezzo_acquisto_netto ?? 0;
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

  // Regole delle varianti condivise col simulatore e col preventivatore serramenti.
  const opzioni = applicaPrezzoOpzioni({
    vendita: pv, acquisto: pa,
    axes: assiVisibili(family.axes, selections), selections,
    modalitaPrezzoBase: family.modalita_prezzo_base, mq, ml,
  });
  pv = opzioni.vendita;
  pa = opzioni.acquisto;
  warnings.push(...opzioni.warnings);
  const maggiorazioni_applicate = opzioni.applicate;

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
    fuori_listino,
    calcolo_disponibile: true,
    costo_completo: opzioni.costoCompleto && !coloriDaVerificare,
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
    // Chiave sua (05/10/2026): sotto grid(id) c'erano anche le righe
    // dell'editor e del simulatore, senza `prezzo_acquisto_netto` → costo 0.
    queryKey: familyId
      ? queryKeys.articleFamilies.gridView(familyId, "preventivo")
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
