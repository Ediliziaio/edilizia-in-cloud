/**
 * Hook che calcola il breakdown margine di un preventivo.
 *
 * Sprint B — Varianti Costo Manodopera.
 *
 * Flow:
 *   0. fetch quotes.prezzo_manuale/subtotal/discount_amount (ricavo aggregato
 *      reale quando il prezzo è scritto a mano — 21/09/2026)
 *   1. fetch quote_items del preventivo
 *   2. fetch assegnazioni manodopera (costo bloccato per riga)
 *   3. fetch tariffe_aziendali correlate (per costo_default e varianti default)
 *   4. fetch varianti default delle tariffe usate
 *   5. computeBreakdown: priorità costo = assegnata > default tariffa variante
 *      > costo_default tariffa > fallback legacy
 *
 * Il hook è gated: ritorna null se l'utente non ha can_view_margins.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import type {
  MargineBreakdown,
  MargineQuoteItem,
  FonteCosto,
  TariffaCostoVariante,
  PreventivoManodoperaAssegnazione,
} from "@/types/costVariants";

interface QuoteItemRow {
  id: string;
  quote_id: string;
  item_type: string | null;
  item_category: string | null;
  name: string;
  quantity: number | null;
  unit_price: number | null;
  discount_percent: number | null;
  tariffa_id: string | null;
  prezzo_acquisto?: number | null;
  costo_unitario?: number | null;
}

interface TariffaLite {
  id: string;
  costo_default: number | null;
  costo_interno?: number | null;
  prezzo_costo?: number | null;
  prezzo_vendita: number | null;
}

interface QuoteRicavoManuale {
  prezzo_manuale: number | null;
  subtotal: number | null;
  discount_amount: number | null;
}

/**
 * Classifica se una riga è "assegnabile" a una variante costo manodopera.
 * Sono assegnabili solo le righe con tariffa_id valorizzato e non di tipo
 * decorativo (note/subtotali/sconti).
 */
function isAssegnabile(item: QuoteItemRow): boolean {
  if (!item.tariffa_id) return false;
  const skip = new Set(["nota", "subtotale", "sconto"]);
  if (item.item_category && skip.has(item.item_category)) return false;
  if (item.item_type === "note" || item.item_type === "subtotale" || item.item_type === "sconto") return false;
  return true;
}

/**
 * Pure function: merge items + assegnazioni + tariffe + varianti default → breakdown.
 *
 * Ordine priorità costo (§7.1 masterprompt):
 *   1. variante_assegnata  — assegnazione esistente, usa costo_bloccato
 *   2. variante_default    — variante is_default=true della tariffa (preview)
 *   3. costo_default_tariffa — tariffe_aziendali.costo_default
 *   4. stimato             — fallback legacy (costo_interno/prezzo_costo/prezzo_acquisto)
 */
export function computeBreakdown(
  items: QuoteItemRow[],
  assegnazioni: PreventivoManodoperaAssegnazione[],
  tariffe: TariffaLite[],
  varianteDefaultByTariffa: Record<string, TariffaCostoVariante | null>,
  quoteRicavo?: QuoteRicavoManuale | null,
): MargineBreakdown {
  const asgByItemId = new Map<string, PreventivoManodoperaAssegnazione>();
  for (const a of assegnazioni) asgByItemId.set(a.quote_item_id, a);

  const tariffaById = new Map<string, TariffaLite>();
  for (const t of tariffe) tariffaById.set(t.id, t);

  const righe: MargineQuoteItem[] = [];
  let totaleVendita = 0;
  let totaleCosto = 0;
  let righeAssegnabili = 0;
  let assegnazioniPresenti = 0;

  for (const item of items) {
    const qty = Number(item.quantity ?? 0);
    const scontoFactor = 1 - Number(item.discount_percent ?? 0) / 100;
    const pvUnit = Number(item.unit_price ?? 0);
    const pvUnitEff = pvUnit * scontoFactor;
    const totVend = qty * pvUnitEff;
    totaleVendita += totVend;

    let costoUnit = 0;
    let fonte: FonteCosto = "stimato";
    let varianteId: string | null = null;

    const assegnabile = isAssegnabile(item);
    if (assegnabile) {
      righeAssegnabili++;

      const asg = asgByItemId.get(item.id);
      if (asg) {
        // 1. Costo bloccato da assegnazione esplicita
        costoUnit = Number(asg.costo_bloccato);
        fonte = "variante_assegnata";
        varianteId = asg.variante_id;
        assegnazioniPresenti++;
      } else {
        // 2. Variante default della tariffa, se esiste
        const varianteDefault = item.tariffa_id
          ? varianteDefaultByTariffa[item.tariffa_id]
          : null;
        if (varianteDefault) {
          costoUnit = Number(varianteDefault.costo);
          fonte = "variante_default";
          varianteId = varianteDefault.id;
        } else {
          // 3. costo_default tariffa (o fallback legacy)
          const t = item.tariffa_id ? tariffaById.get(item.tariffa_id) : null;
          if (t) {
            const cd = t.costo_default ?? t.costo_interno ?? t.prezzo_costo ?? 0;
            costoUnit = Number(cd);
            fonte = cd > 0 ? "costo_default_tariffa" : "stimato";
          }
        }
      }
    } else if (item.item_type === "product") {
      // Per prodotti il costo arriva dal campo prezzo_acquisto / costo_unitario
      // valorizzato dal QuoteBuilder al momento dell'inserimento.
      const cu = Number(item.prezzo_acquisto ?? item.costo_unitario ?? 0);
      costoUnit = cu;
      fonte = "stimato";
    }
    // else: righe decorative (nota/subtotale/sconto) → costo 0, fonte stimato (non conta)

    const totCost = qty * costoUnit;
    totaleCosto += totCost;

    const margineEuro = totVend - totCost;
    const marginePct = totVend > 0 ? (margineEuro / totVend) * 100 : 0;

    righe.push({
      quote_item_id: item.id,
      nome: item.name,
      quantita: qty,
      prezzo_vendita_unitario: pvUnitEff,
      totale_vendita: totVend,
      tariffa_id: item.tariffa_id,
      variante_scelta_id: varianteId,
      costo_unitario: costoUnit,
      totale_costo: totCost,
      margine_euro: margineEuro,
      margine_pct: marginePct,
      fonte_costo: fonte,
    });
  }

  const stato_completezza: MargineBreakdown["stato_completezza"] =
    righeAssegnabili === 0
      ? "stimato"
      : assegnazioniPresenti === righeAssegnabili
      ? "completo"
      : assegnazioniPresenti > 0
      ? "parziale"
      : "stimato";

  // Prezzo scritto a mano (21/09/2026): con le righe a 0€ la somma sopra
  // direbbe "margine -100%" su un preventivo che invece va benissimo. Per
  // l'AGGREGATO il ricavo vero è quello autoritativo salvato su quotes
  // (subtotal - discount_amount), stessa fonte/filosofia di
  // QuoteQuickViewSheet.tsx e calcolaTotaliPreventivo(). Il dettaglio per riga
  // NON cambia: resta a 0€, è un limite noto dello strumento (assegna il
  // costo manodopera riga per riga, non il ricavo).
  const prezzoManualeAttivo = Number(quoteRicavo?.prezzo_manuale ?? 0) > 0;
  const totaleVenditaEffettivo = prezzoManualeAttivo
    ? Number(quoteRicavo?.subtotal ?? 0) - Number(quoteRicavo?.discount_amount ?? 0)
    : totaleVendita;

  const margineTotEuro = totaleVenditaEffettivo - totaleCosto;
  const margineTotPct = totaleVenditaEffettivo > 0 ? (margineTotEuro / totaleVenditaEffettivo) * 100 : 0;

  return {
    quote_id: items[0]?.quote_id ?? "",
    righe,
    totale_vendita: totaleVenditaEffettivo,
    totale_costo: totaleCosto,
    margine_totale_euro: margineTotEuro,
    margine_totale_pct: margineTotPct,
    stato_completezza,
    prezzo_manuale_attivo: prezzoManualeAttivo,
  };
}

/**
 * Hook principale. Gated da `can_view_margins`.
 */
export function useMargineBreakdown(quoteId: string | null | undefined) {
  const { data: perms } = useUserPermissions();
  const canView = perms.can_view_margins || perms.can_view_costs;

  return useQuery<MargineBreakdown | null>({
    queryKey: ["margine-breakdown", quoteId, canView],
    enabled: !!quoteId && canView,
    queryFn: async () => {
      // 0. Quote — ricavo autoritativo, serve solo se prezzo_manuale è attivo
      // (vedi QuoteQuickViewSheet.tsx, stessa query/logica).
      const { data: quoteRicavo, error: quoteErr } = await supabase
        .from("quotes")
        .select("prezzo_manuale, subtotal, discount_amount")
        .eq("id", quoteId!)
        .maybeSingle();
      if (quoteErr) throw new Error(quoteErr.message);

      // 1. Quote items
      const { data: itemsData, error: itemsErr } = await supabase
        .from("quote_items")
        .select("*")
        .eq("quote_id", quoteId!)
        .order("sort_order", { ascending: true });
      if (itemsErr) throw new Error(itemsErr.message);
      const items = (itemsData ?? []) as unknown as QuoteItemRow[];

      // 2. Assegnazioni manodopera
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: asgData, error: asgErr } = await (supabase.from as any)(
        "preventivo_manodopera_assegnazioni"
      )
        .select("*")
        .eq("quote_id", quoteId!);
      if (asgErr) throw new Error(asgErr.message);
      const assegnazioni = (asgData ?? []) as PreventivoManodoperaAssegnazione[];

      // 3. Tariffe correlate
      const tariffaIds = Array.from(
        new Set(items.map((i) => i.tariffa_id).filter(Boolean))
      ) as string[];

      let tariffe: TariffaLite[] = [];
      if (tariffaIds.length > 0) {
        const { data: tData, error: tErr } = await supabase
          .from("tariffe_aziendali")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select("id, costo_default, costo_interno, prezzo_costo, prezzo_vendita" as any)
          .in("id", tariffaIds);
        if (tErr) throw new Error(tErr.message);
        tariffe = (tData ?? []) as unknown as TariffaLite[];
      }

      // 4. Varianti default delle tariffe usate (per preview fonte=variante_default)
      const varianteDefaultByTariffa: Record<string, TariffaCostoVariante | null> = {};
      if (tariffaIds.length > 0) {
        const today = new Date().toISOString().slice(0, 10);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: vdData } = await (supabase.from as any)("tariffa_costi_varianti")
          .select("*")
          .in("tariffa_id", tariffaIds)
          .eq("is_default", true)
          .eq("attivo", true)
          .lte("valid_from", today)
          .or(`valid_to.is.null,valid_to.gte.${today}`);
        for (const v of (vdData ?? []) as TariffaCostoVariante[]) {
          varianteDefaultByTariffa[v.tariffa_id] = v;
        }
      }

      return computeBreakdown(items, assegnazioni, tariffe, varianteDefaultByTariffa, quoteRicavo);
    },
    staleTime: 30 * 1000,
  });
}
