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
  prezzo_costo: number;
  unita: string;
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
  const subtotale_netto = subtotale * (1 - discount_global_pct / 100);

  const overhead_totale = costo_totale * (overhead_pct / 100);
  const vatFactor = 1 - discount_global_pct / 100;
  const vatAmount = Object.values(iva_breakdown).reduce((s, v) => s + v, 0) * vatFactor;
  const totale = subtotale_netto + vatAmount;

  // Il margine è calcolato sul ricavo netto effettivo (post-sconto globale)
  const margine_totale_pct =
    subtotale_netto > 0
      ? ((subtotale_netto - costo_totale - overhead_totale) / subtotale_netto) * 100
      : 0;

  return {
    subtotale,
    subtotale_netto,
    iva_breakdown,
    totale,
    costo_totale,
    overhead_totale,
    margine_totale_pct,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePreventivoCosti(companyId: string | undefined) {
  // Load impostazioni
  const { data: impostazioni = {} as PreventivoImpostazioni } = useQuery({
    queryKey: ["preventivo-impostazioni", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await (supabase.from("preventivo_impostazioni") as any)
        .select("*")
        .eq("company_id", companyId!)
        .maybeSingle();
      return (data as PreventivoImpostazioni) ?? ({} as PreventivoImpostazioni);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Load tariffe
  const { data: tariffe = [] as TariffaPro[] } = useQuery({
    queryKey: ["tariffe-aziendali", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await (supabase.from("tariffe_aziendali") as any)
        .select("*")
        .eq("company_id", companyId!)
        .order("nome");
      if (!data) return [] as TariffaPro[];
      return data.map((d: any) => ({
        ...d,
        // DB column is prezzo_costo; prezzo_vendita stays as-is
        prezzo_costo: d.prezzo_costo ?? 0,
        prezzo_vendita: d.prezzo_vendita ?? 0,
      })) as TariffaPro[];
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
      return data.map((d: any) => ({
        ...d,
        prezzo_vendita: d.prezzo_vendita ?? d.unit_price ?? 0,
        prezzo_acquisto_netto: d.prezzo_acquisto_netto ?? d.standard_cost ?? 0,
        modalita_prezzo: d.modalita_prezzo ?? "pz",
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
      const { data } = await (supabase.from("listino_categorie") as any)
        .select("*")
        .eq("company_id", companyId!)
        .order("nome");
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // trovaPrezzoGriglia: nearest neighbor Manhattan distance
  const trovaPrezzoGriglia = async (
    prodotto_id: string,
    x: number,
    y: number
  ): Promise<{ prezzo_vendita: number; prezzo_acquisto_netto: number; trovato: boolean }> => {
    const { data } = await (supabase.from("listino_griglia") as any)
      .select("prezzo_vendita,prezzo_acquisto_netto,valore_x,valore_y")
      .eq("prodotto_id", prodotto_id);

    if (!data || data.length === 0) {
      return { prezzo_vendita: 0, prezzo_acquisto_netto: 0, trovato: false };
    }

    // Exact match first
    const exact = data.find(
      (r: any) => r.valore_x === x && r.valore_y === y
    );
    if (exact) {
      return {
        prezzo_vendita: exact.prezzo_vendita,
        prezzo_acquisto_netto: exact.prezzo_acquisto_netto ?? 0,
        trovato: true,
      };
    }

    // Nearest neighbor by Manhattan distance
    let nearest = data[0];
    let minDist = Infinity;
    for (const r of data) {
      const dist = Math.abs(r.valore_x - x) + Math.abs(r.valore_y - y);
      if (dist < minDist) {
        minDist = dist;
        nearest = r;
      }
    }

    return {
      prezzo_vendita: nearest.prezzo_vendita,
      prezzo_acquisto_netto: nearest.prezzo_acquisto_netto ?? 0,
      trovato: false,
    };
  };

  // calcolaPrezzoProdotto
  const calcolaPrezzoProdotto = async (
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
  };

  // calcolaTariffaAutomatica
  const calcolaTariffaAutomatica = (
    tariffa: TariffaPro,
    qty: number,
    piano?: number
  ): { prezzo_vendita: number; prezzo_acquisto: number } => {
    if (tariffa.tipo === "tiro_piano" && piano != null) {
      // piano_base = threshold floor number (e.g. 1 = first floor)
      // prezzo_vendita = base price (ground floor / no extra)
      // prezzo_piano_aggiuntivo = extra per each floor ABOVE piano_base
      const sogliaPiano = tariffa.piano_base ?? 1;
      const extra =
        piano >= sogliaPiano
          ? (tariffa.prezzo_piano_aggiuntivo ?? 0) * (piano - sogliaPiano + 1)
          : 0;
      const prezzoUnit = (tariffa.prezzo_vendita ?? 0) + extra;
      return {
        prezzo_vendita: prezzoUnit * qty,
        prezzo_acquisto: (tariffa.prezzo_costo ?? 0) * qty,
      };
    }

    return {
      prezzo_vendita: (tariffa.prezzo_vendita ?? 0) * qty,
      prezzo_acquisto: (tariffa.prezzo_costo ?? 0) * qty,
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
