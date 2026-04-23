import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ArticlePro {
  id: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  marca?: string | null;
  unit_price?: number | null;
  prezzo_vendita: number;
  prezzo_acquisto_netto: number;
  unit_of_measure?: string | null;
  vat_rate?: number | null;
  categoria_id?: string | null;
  immagine_url?: string | null;
  modalita_prezzo: "pz" | "mq" | "misura_libera" | "griglia";
  ha_montaggio?: boolean | null;
  montaggio_tipo?: string | null;
  montaggio_tariffa_id?: string | null;
}

export interface TariffaPro {
  id: string;
  nome: string;
  tipo: "posa" | "trasporto" | "smaltimento" | "nolo" | "tiro_piano" | string;
  prezzo_vendita: number;
  /** Legacy: era la colonna prezzo_costo. FASE 6: valore uguale a costo_interno. */
  prezzo_costo: number;
  /** FASE 6: nuovo costo interno (posatore, attrezzatura). Se assente, leggi prezzo_costo. */
  costo_interno?: number | null;
  /** Legacy UM. */
  unita: string;
  /** FASE 6: UM canonica di fatturazione (pz/mq/ml/mc/kg/gg/h/a_corpo/km/piano). */
  unita_fatturazione?: string | null;
  // tiro_piano fields (DB columns)
  piano_base?: number | null;
  prezzo_piano_aggiuntivo?: number | null;
}

export interface PreventivoImpostazioni {
  id?: string;
  company_id?: string;
  overhead_percentuale?: number | null;
  margine_minimo_percentuale?: number | null;
  margine_target_percentuale?: number | null;
  soglia_margine_visibile?: number | null;
  aggiungi_posa_automatica?: boolean;
  chiedi_smaltimento?: boolean;
  chiedi_piano_installazione?: boolean;
  chiedi_trasporto?: boolean;
  pdf_mostra_prezzi_per_riga?: boolean;
  pdf_mostra_solo_totale?: boolean;
  pdf_mostra_sconti?: boolean;
  pdf_mostra_immagini?: boolean;
  pdf_includi_schede_tecniche?: boolean;
  firma_digitale_abilitata?: boolean;
}

// ─── Pure functions ───────────────────────────────────────────────────────────

/**
 * Arrotondamento sicuro a 2 decimali senza errori floating-point.
 * Usa Math.round(v * 100) / 100 invece di toFixed per evitare drift cumulativi.
 */
export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function calcolaMargine(
  pv: number,
  pa: number,
  overhead_pct: number
): { margine_euro: number; margine_percentuale: number } {
  if (pv <= 0) return { margine_euro: 0, margine_percentuale: 0 };
  const overhead = pa * (overhead_pct / 100);
  const costo_totale = pa + overhead;
  const margine_euro = pv - costo_totale;
  const margine_percentuale = (margine_euro / pv) * 100;
  return { margine_euro, margine_percentuale };
}

export function semaforo(
  pct: number,
  soglia_min = 15,
  target = 25
): "red" | "yellow" | "green" {
  if (pct < soglia_min) return "red";
  if (pct < target) return "yellow";
  return "green";
}

export function calcolaTotaliPreventivo(
  items: Array<{
    quantity: number;
    unit_price: number;
    discount_percent: number;
    vat_rate: number;
    prezzo_acquisto?: number;
    is_optional?: boolean;
    item_category?: string;
  }>,
  overhead_pct: number,
  /** Sconto globale sul preventivo (%) — usato per calcolare il margine reale */
  discount_global_pct = 0
): {
  subtotale: number;
  subtotale_netto: number;
  iva_breakdown: Record<string, number>;
  totale: number;
  costo_totale: number;
  overhead_totale: number;
  margine_totale_pct: number;
} {
  // Skip optional items from totals
  const activeItems = items.filter((i) => !i.is_optional);

  let subtotale = 0;
  let costo_totale = 0;
  const iva_breakdown: Record<string, number> = {};

  for (const it of activeItems) {
    const imponibile =
      it.quantity * it.unit_price * (1 - (it.discount_percent || 0) / 100);
    subtotale += imponibile;

    const vatKey = String(it.vat_rate ?? 22);
    iva_breakdown[vatKey] = (iva_breakdown[vatKey] || 0) + imponibile * ((it.vat_rate ?? 22) / 100);

    const pa = (it.prezzo_acquisto ?? 0) * it.quantity;
    costo_totale += pa;
  }

  // subtotale_netto = ricavo reale dopo sconto globale preventivo
  const subtotale_netto = round2(subtotale * (1 - discount_global_pct / 100));

  const overhead_totale = round2(costo_totale * (overhead_pct / 100));
  const vatFactor = 1 - discount_global_pct / 100;
  const vatAmount = round2(
    Object.values(iva_breakdown).reduce((s, v) => s + v, 0) * vatFactor
  );
  // Aggiusta iva_breakdown per riflettere il fattore sconto globale
  const iva_breakdown_netto: Record<string, number> = {};
  for (const [k, v] of Object.entries(iva_breakdown)) {
    iva_breakdown_netto[k] = round2(v * vatFactor);
  }
  const totale = round2(subtotale_netto + vatAmount);

  // Il margine è calcolato sul ricavo netto effettivo (post-sconto globale)
  const margine_totale_pct =
    subtotale_netto > 0
      ? round2(((subtotale_netto - costo_totale - overhead_totale) / subtotale_netto) * 100)
      : 0;

  return {
    subtotale: round2(subtotale),
    subtotale_netto,
    iva_breakdown: iva_breakdown_netto,
    totale,
    costo_totale: round2(costo_totale),
    overhead_totale,
    margine_totale_pct,
  };
}

// ─── Margine Lordo Atteso (Serramentisti FASE 11) ─────────────────────────────

export interface MargineAttesoInput {
  quantity: number;
  unit_price: number;
  discount_percent: number;
  prezzo_acquisto?: number;
  is_optional?: boolean;
  item_category?: string;
}

export interface MargineAttesoBreakdown {
  /** Ricavo netto al netto di sconto globale (IVA esclusa) */
  ricavo_netto: number;
  /** Costo acquisto prodotti (item_category='prodotto') */
  costo_materiali: number;
  /** Costo posa/manodopera (item_category='posa') */
  costo_manodopera: number;
  /** Costo altri servizi (trasporto, smaltimento, nolo) */
  costo_altri: number;
  /** Somma costi diretti: materiali + manodopera + altri */
  costo_totale: number;
  /** Overhead azienda (costo_totale × overhead_pct/100) */
  overhead_euro: number;
  /** Provvigione commerciale (ricavo_netto × commission_pct/100) */
  provvigione_euro: number;
  /** Margine lordo prima di overhead/provvigione: ricavo - costo_totale */
  margine_lordo_euro: number;
  /** % margine lordo su ricavo */
  margine_lordo_pct: number;
  /** Margine atteso finale = lordo - overhead - provvigione */
  margine_atteso_euro: number;
  /** % margine atteso su ricavo */
  margine_atteso_pct: number;
}

/**
 * Preventivatore Serramentisti FASE 11 — Margine Lordo Atteso.
 *
 * Funzione pura: dato un preventivo (items + overhead + sconto globale +
 * eventuale provvigione commerciale), restituisce il breakdown di margine
 * atteso come PROIEZIONE (prima ancora di emettere l'ordine / incassare).
 *
 * Differenze rispetto a calcolaTotaliPreventivo:
 *  - Separa il costo in 3 categorie (materiali / manodopera / altri servizi)
 *    per rendere evidente dove va il denaro.
 *  - Introduce la provvigione commerciale come voce a se stante (neutrale se 0).
 *  - NON calcola l'IVA: per il venditore è passthrough, non entra nel margine.
 *
 * Le categorie escluse dal conteggio sono:
 *  - 'nota' / 'subtotale' / 'sconto' → righe decorative, zero impact
 *  - items con is_optional=true → opzionali, non nel totale
 */
export function calcolaMargineAtteso(
  items: MargineAttesoInput[],
  overhead_pct: number,
  discount_global_pct = 0,
  commission_pct = 0,
): MargineAttesoBreakdown {
  const ZERO: MargineAttesoBreakdown = {
    ricavo_netto: 0,
    costo_materiali: 0,
    costo_manodopera: 0,
    costo_altri: 0,
    costo_totale: 0,
    overhead_euro: 0,
    provvigione_euro: 0,
    margine_lordo_euro: 0,
    margine_lordo_pct: 0,
    margine_atteso_euro: 0,
    margine_atteso_pct: 0,
  };

  const SKIP = new Set(["nota", "subtotale", "sconto"]);
  const activeItems = items.filter(
    (i) => !i.is_optional && !SKIP.has(i.item_category ?? ""),
  );
  if (activeItems.length === 0) return ZERO;

  // Sanitize global discount to [0, 100)
  const gd = Math.max(0, Math.min(100, discount_global_pct || 0));
  const discountFactor = 1 - gd / 100;

  let ricavo = 0;
  let costo_materiali = 0;
  let costo_manodopera = 0;
  let costo_altri = 0;

  for (const it of activeItems) {
    const localDiscount = Math.max(0, Math.min(100, it.discount_percent || 0));
    const imponibile =
      (it.quantity || 0) * (it.unit_price || 0) * (1 - localDiscount / 100);
    ricavo += imponibile;

    const costoRiga = (it.prezzo_acquisto ?? 0) * (it.quantity || 0);
    const cat = it.item_category ?? "prodotto";
    if (cat === "prodotto") costo_materiali += costoRiga;
    else if (cat === "posa") costo_manodopera += costoRiga;
    else costo_altri += costoRiga; // trasporto/smaltimento/nolo/altro
  }

  const ricavo_netto = round2(ricavo * discountFactor);
  costo_materiali = round2(costo_materiali);
  costo_manodopera = round2(costo_manodopera);
  costo_altri = round2(costo_altri);
  const costo_totale = round2(costo_materiali + costo_manodopera + costo_altri);

  // Sanitize overhead/commission to non-negative
  const oh = Math.max(0, overhead_pct || 0);
  const cp = Math.max(0, commission_pct || 0);

  const overhead_euro = round2(costo_totale * (oh / 100));
  const provvigione_euro = round2(ricavo_netto * (cp / 100));

  const margine_lordo_euro = round2(ricavo_netto - costo_totale);
  const margine_lordo_pct =
    ricavo_netto > 0 ? round2((margine_lordo_euro / ricavo_netto) * 100) : 0;

  const margine_atteso_euro = round2(
    ricavo_netto - costo_totale - overhead_euro - provvigione_euro,
  );
  const margine_atteso_pct =
    ricavo_netto > 0 ? round2((margine_atteso_euro / ricavo_netto) * 100) : 0;

  return {
    ricavo_netto,
    costo_materiali,
    costo_manodopera,
    costo_altri,
    costo_totale,
    overhead_euro,
    provvigione_euro,
    margine_lordo_euro,
    margine_lordo_pct,
    margine_atteso_euro,
    margine_atteso_pct,
  };
}

// ─── IMP09: Sconti quantità ───────────────────────────────────────────────────

/**
 * Calcola lo sconto quantità applicabile a un prodotto dato la quantità e la lista di regole.
 * Restituisce la percentuale di sconto da applicare (0 se nessuna regola applicabile).
 */
export function calcolaScontoQuantita(
  prodottoId: string | undefined,
  quantita: number,
  regole: Array<{ prodotto_id: string | null; da_quantita: number; sconto_pct: number; attivo: boolean }>
): number {
  if (!regole || regole.length === 0) return 0;

  // Filtra regole applicabili: specifiche per questo prodotto O globali (prodotto_id null)
  const applicable = regole.filter(
    (r) => r.attivo && r.da_quantita <= quantita && (r.prodotto_id === prodottoId || r.prodotto_id === null)
  );
  if (applicable.length === 0) return 0;

  // Priorità: regola specifica per prodotto > regola globale
  // Tra le specifiche/globali: prende quella con da_quantita più alta (scala migliore)
  const specific = applicable.filter((r) => r.prodotto_id === prodottoId);
  const toUse = specific.length > 0 ? specific : applicable;

  return Math.max(...toUse.map((r) => r.sconto_pct));
}

export function useScontiQuantita(companyId: string | undefined) {
  return useQuery({
    queryKey: ["sconti-quantita", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("sconti_quantita")
        .select("*")
        .eq("company_id", companyId!)
        .eq("attivo", true)
        .order("da_quantita");
      return (data ?? []) as Array<{
        id: string;
        company_id: string;
        prodotto_id: string | null;
        da_quantita: number;
        sconto_pct: number;
        descrizione: string | null;
        attivo: boolean;
        created_at: string;
      }>;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

// ─── IMP09: Bundle prodotti ───────────────────────────────────────────────────

/**
 * Espande un bundle in righe di preventivo (QuoteItemPro).
 * Applica lo sconto bundle a ogni voce.
 */
export function espondiBundle(
  bundle: { id: string; nome: string; sconto_bundle_pct: number },
  voci: Array<{
    prodotto_id?: string | null;
    tariffa_id?: string | null;
    quantita: number;
    sort_order: number;
    article_templates?: { name: string; unit_price?: number | null; prezzo_vendita?: number; prezzo_acquisto_netto?: number; unit_of_measure?: string | null; vat_rate?: number | null } | null;
    tariffe_aziendali?: { nome: string; prezzo_vendita?: number; prezzo_costo?: number; unita?: string | null } | null;
  }>,
  // Parametro residuale: attualmente non impatta il calcolo del bundle (l'overhead
  // viene riapplicato dai totali del preventivo). Mantenuto nella signature per
  // retrocompatibilità con i caller esistenti.
  _overhead_pct: number
): import("@/types/quoteItem").QuoteItemPro[] {
  return voci.map((voce, idx) => {
    const isArt = !!voce.prodotto_id && !!voce.article_templates;
    const name = isArt
      ? (voce.article_templates?.name ?? "Prodotto")
      : (voce.tariffe_aziendali?.nome ?? "Servizio");
    const unitPrice = isArt
      ? (voce.article_templates?.prezzo_vendita ?? voce.article_templates?.unit_price ?? 0)
      : (voce.tariffe_aziendali?.prezzo_vendita ?? 0);
    const prezzoAcquisto = isArt
      ? (voce.article_templates?.prezzo_acquisto_netto ?? 0)
      : (voce.tariffe_aziendali?.prezzo_costo ?? 0);
    const uom = isArt
      ? (voce.article_templates?.unit_of_measure ?? "pz")
      : (voce.tariffe_aziendali?.unita ?? "servizio");
    const vatRate = isArt ? (voce.article_templates?.vat_rate ?? 22) : 22;

    return {
      id: `bundle-${bundle.id}-${idx}`,
      name,
      description: `Bundle: ${bundle.nome}`,
      quantity: voce.quantita,
      unit_price: unitPrice,
      unit_of_measure: uom,
      discount_percent: bundle.sconto_bundle_pct,
      vat_rate: vatRate,
      prezzo_acquisto: prezzoAcquisto,
      item_category: isArt ? "prodotto" : "posa",
      item_type: isArt ? "product" : "service",
      is_optional: false,
      mostra_nel_pdf: true,
      sort_order: voce.sort_order ?? idx,
    } as import("@/types/quoteItem").QuoteItemPro;
  });
}

export interface BundleConVoci {
  id: string;
  company_id: string;
  nome: string;
  descrizione: string | null;
  sconto_bundle_pct: number;
  attivo: boolean;
  created_at: string;
  bundle_voci: Array<{
    id: string;
    bundle_id: string;
    prodotto_id: string | null;
    tariffa_id: string | null;
    quantita: number;
    sort_order: number;
    article_templates: {
      name: string;
      unit_price?: number | null;
      prezzo_vendita?: number;
      prezzo_acquisto_netto?: number;
      unit_of_measure?: string | null;
      vat_rate?: number | null;
    } | null;
    tariffe_aziendali: {
      nome: string;
      prezzo_vendita?: number;
      prezzo_costo?: number;
      unita?: string | null;
    } | null;
  }>;
}

export function useBundleProdotti(companyId: string | undefined) {
  return useQuery({
    queryKey: ["bundle-prodotti", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("bundle_prodotti")
        .select(
          "*, bundle_voci(*, article_templates(name, unit_price, prezzo_vendita, prezzo_acquisto_netto, unit_of_measure, vat_rate), tariffe_aziendali(nome, prezzo_vendita, prezzo_costo, unita))"
        )
        .eq("company_id", companyId!)
        .eq("attivo", true)
        .order("nome");
      return (data ?? []) as unknown as BundleConVoci[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePreventivoCosti(companyId: string | undefined) {
  // Load impostazioni
  const { data: impostazioni = {} as PreventivoImpostazioni } = useQuery({
    queryKey: ["preventivo-impostazioni", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("preventivo_impostazioni")
        .select("*")
        .eq("company_id", companyId!)
        .maybeSingle();
      return (data as unknown as PreventivoImpostazioni) ?? ({} as PreventivoImpostazioni);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Load tariffe
  const { data: tariffe = [] as TariffaPro[] } = useQuery({
    queryKey: ["tariffe-aziendali", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tariffe_aziendali")
        .select("*")
        .eq("company_id", companyId!)
        .order("nome");
      if (!data) return [] as TariffaPro[];
      return data.map((d: Record<string, unknown>) => {
        const costoInterno = (d.costo_interno as number | null) ?? null;
        const prezzoCosto = (d.prezzo_costo as number | null) ?? 0;
        return {
          ...d,
          prezzo_costo: costoInterno ?? prezzoCosto,
          costo_interno: costoInterno,
          prezzo_vendita: (d.prezzo_vendita as number | null) ?? 0,
          unita_fatturazione: (d.unita_fatturazione as string | null) ?? null,
        };
      }) as TariffaPro[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Load articoli (prodotti P02)
  const { data: articoli = [] as ArticlePro[] } = useQuery({
    queryKey: ["article-templates-pro", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("article_templates")
        .select(
          "id, name, description, unit_price, standard_cost, unit_of_measure, vat_rate, " +
          "sku, marca, immagine_url, categoria_id, " +
          "modalita_prezzo, prezzo_vendita, prezzo_acquisto_netto, " +
          "ha_montaggio, montaggio_tipo, montaggio_tariffa_id"
        )
        .eq("company_id", companyId!)
        .order("name");
      if (!data) return [] as ArticlePro[];
      return data.map((d) => ({
        ...d,
        prezzo_vendita: d.prezzo_vendita ?? d.unit_price ?? 0,
        prezzo_acquisto_netto: d.prezzo_acquisto_netto ?? d.standard_cost ?? 0,
        modalita_prezzo: (d.modalita_prezzo ?? "pz") as ArticlePro["modalita_prezzo"],
      })) as ArticlePro[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Load categorie
  const { data: categorie = [] } = useQuery({
    queryKey: ["listino-categorie", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("listino_categorie")
        .select("*")
        .eq("company_id", companyId!)
        .order("nome");
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // P2-9: funzioni di pricing memoizzate via useCallback per garantire
  // identità di riferimento stabile. Così i useEffect nei componenti
  // consumer (es. QuickAddItem in QuoteBuilder) possono includerle nelle
  // deps senza triggerare re-run spuri ad ogni render del parent —
  // rimuovendo il bisogno di `// eslint-disable-next-line
  // react-hooks/exhaustive-deps`.
  //
  // `supabase` è un singleton importato modulo-level: dep array vuoto è safe.
  const trovaPrezzoGriglia = useCallback(async (
    prodotto_id: string,
    x: number,
    y: number
  ): Promise<{ prezzo_vendita: number; prezzo_acquisto_netto: number; trovato: boolean }> => {
    // Schema reale: `prezzo_acquisto` (senza _netto). Mappiamo al dominio.
    const { data, error } = await supabase
      .from("listino_griglia")
      .select("prezzo_vendita,prezzo_acquisto,valore_x,valore_y")
      .eq("prodotto_id", prodotto_id);
    if (error) {
      console.error("[trovaPrezzoGriglia] errore caricamento griglia:", error);
      return { prezzo_vendita: 0, prezzo_acquisto_netto: 0, trovato: false };
    }

    interface GrigliaRow {
      prezzo_vendita: number;
      prezzo_acquisto: number | null;
      valore_x: number;
      valore_y: number;
    }

    if (!data || data.length === 0) {
      return { prezzo_vendita: 0, prezzo_acquisto_netto: 0, trovato: false };
    }

    const rows = data as GrigliaRow[];

    // Exact match first
    const exact = rows.find(
      (r) => r.valore_x === x && r.valore_y === y
    );
    if (exact) {
      return {
        prezzo_vendita: exact.prezzo_vendita,
        prezzo_acquisto_netto: exact.prezzo_acquisto ?? 0,
        trovato: true,
      };
    }

    // Nearest neighbor by Manhattan distance
    let nearest = rows[0];
    let minDist = Infinity;
    for (const r of rows) {
      const dist = Math.abs(r.valore_x - x) + Math.abs(r.valore_y - y);
      if (dist < minDist) {
        minDist = dist;
        nearest = r;
      }
    }

    return {
      prezzo_vendita: nearest.prezzo_vendita,
      prezzo_acquisto_netto: nearest.prezzo_acquisto ?? 0,
      trovato: false,
    };
  }, []);

  // P2-9: calcolaPrezzoProdotto memoizzata. Deps: trovaPrezzoGriglia (già
  // stabile via useCallback). Niente altre dipendenze variabili.
  const calcolaPrezzoProdotto = useCallback(async (
    prodotto: ArticlePro,
    qty: number,
    x?: number,
    y?: number
  ): Promise<{ prezzo_vendita: number; prezzo_acquisto: number; trovato_in_griglia?: boolean }> => {
    const modalita = prodotto.modalita_prezzo ?? "pz";

    if (modalita === "pz" || modalita === "misura_libera") {
      return {
        prezzo_vendita: (prodotto.prezzo_vendita ?? 0) * qty,
        prezzo_acquisto: (prodotto.prezzo_acquisto_netto ?? 0) * qty,
      };
    }

    if (modalita === "mq") {
      // x and y in mm → convert to m
      const lx = x != null ? x / 1000 : 1;
      const ly = y != null ? y / 1000 : 1;
      const mq = lx * ly;
      return {
        prezzo_vendita: (prodotto.prezzo_vendita ?? 0) * mq * qty,
        prezzo_acquisto: (prodotto.prezzo_acquisto_netto ?? 0) * mq * qty,
      };
    }

    if (modalita === "griglia") {
      const { prezzo_vendita, prezzo_acquisto_netto, trovato } =
        await trovaPrezzoGriglia(prodotto.id, x ?? 0, y ?? 0);
      return {
        prezzo_vendita: prezzo_vendita * qty,
        prezzo_acquisto: prezzo_acquisto_netto * qty,
        trovato_in_griglia: trovato,
      };
    }

    // fallback
    return {
      prezzo_vendita: (prodotto.prezzo_vendita ?? 0) * qty,
      prezzo_acquisto: (prodotto.prezzo_acquisto_netto ?? 0) * qty,
    };
  }, [trovaPrezzoGriglia]);

  // calcolaTariffaAutomatica
  // FASE 6.4: supporta le 10 UM canoniche di unita_fatturazione.
  //  - 'a_corpo'   → prezzo fisso totale, qty sempre 1
  //  - 'km'        → prezzo × kmCantiere (se passato)
  //  - 'piano'     → sovrapprezzo a scaglioni (anche fuori dal tipo tiro_piano)
  //  - 'gg','h','mq','ml','mc','kg','pz' → prezzo × qty (qty già in UM corretta)
  const calcolaTariffaAutomatica = (
    tariffa: TariffaPro,
    qty: number,
    piano?: number,
    kmCantiere?: number,
  ): { prezzo_vendita: number; prezzo_acquisto: number } => {
    const um = (tariffa.unita_fatturazione ?? tariffa.unita ?? "pz").toLowerCase();
    const costoUnit = tariffa.costo_interno ?? tariffa.prezzo_costo ?? 0;
    const pvUnit = tariffa.prezzo_vendita ?? 0;

    // tiro_piano legacy: prezzo base + extra per piano sopra soglia
    if (tariffa.tipo === "tiro_piano" && piano != null) {
      const sogliaPiano = tariffa.piano_base ?? 1;
      const extra =
        piano >= sogliaPiano
          ? (tariffa.prezzo_piano_aggiuntivo ?? 0) * (piano - sogliaPiano + 1)
          : 0;
      const prezzoUnit = pvUnit + extra;
      return {
        prezzo_vendita: prezzoUnit * qty,
        prezzo_acquisto: costoUnit * qty,
      };
    }

    // a_corpo / fisso: importo fisso totale, ignora qty
    if (um === "a_corpo" || um === "fisso") {
      return { prezzo_vendita: pvUnit, prezzo_acquisto: costoUnit };
    }

    // km: moltiplica per kmCantiere se presente, altrimenti 0
    if (um === "km") {
      const km = kmCantiere ?? 0;
      return { prezzo_vendita: pvUnit * km, prezzo_acquisto: costoUnit * km };
    }

    // piano (generico, non tiro_piano): moltiplica per il numero di piani
    if (um === "piano") {
      const n = piano ?? qty ?? 0;
      return { prezzo_vendita: pvUnit * n, prezzo_acquisto: costoUnit * n };
    }

    // Default: pz, mq, ml, mc, kg, gg, h → × qty
    return {
      prezzo_vendita: pvUnit * qty,
      prezzo_acquisto: costoUnit * qty,
    };
  };

  return {
    impostazioni,
    tariffe,
    articoli,
    categorie,
    trovaPrezzoGriglia,
    calcolaPrezzoProdotto,
    calcolaTariffaAutomatica,
  };
}
