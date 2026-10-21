/**
 * useProcurementAnalysis — i dati della pagina Analisi Acquisti.
 *
 * Tre letture indipendenti, ognuna col suo caricamento e il suo errore:
 *   - analisi: ordini, fatture ricevute e scadenze del periodo (e dell'anno
 *     prima), lette a pagine complete e calcolate da `calcolaAnalisiAcquisti`.
 *   - prezzi: righe degli ordini degli ultimi 12 mesi → confronto prezzi.
 *   - firma → primo ordine.
 *
 * Tutte le letture vanno a pagine (`leggiTutteLeRighe`): PostgREST si ferma a
 * mille righe e prima la pagina contava solo quelle.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { leggiTutteLeRighe } from "@/lib/impostazioni/usoTag";
import {
  calcolaAnalisiAcquisti,
  calcolaFirmaPrimoOrdine,
  computePriceBenchmarks,
  dataLocale,
  periodoAnnoPrima,
  totalPotentialSaving,
  type CommessaAnagrafica,
  type DatiGrezziAcquisti,
  type FatturaRiga,
  type FiltriAnalisi,
  type FornitoreAnagrafica,
  type OrdineAcquistoRiga,
  type Periodo,
  type PurchaseLine,
  type RigaFirmaOrdine,
  type ScadenzaRiga,
} from "@/lib/procurement/spendAnalysis";

const STALE = 5 * 60 * 1000;

interface RawPurchaseItem {
  id: string;
  description: string | null;
  sku: string | null;
  article_template_id: string | null;
  unit_of_measure: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  discount_percent: number | string | null;
  line_total: number | string | null;
  purchase_orders: {
    supplier_id: string | null;
    issue_date: string | null;
    suppliers: { name: string | null } | null;
  } | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- le query a pagine passano per un builder generico */
const db = supabase as any;

/** Ordini, fatture, scadenze e anagrafiche che servono al calcolo nel browser. */
async function leggiDatiGrezzi(companyId: string, periodo: Periodo): Promise<DatiGrezziAcquisti> {
  const prima = periodoAnnoPrima(periodo);
  const oggi = new Date();
  const tra30 = dataLocale(new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + 30));

  const [ordini, fatture, scadenze, fornitori, commesse] = await Promise.all([
    leggiTutteLeRighe<OrdineAcquistoRiga>((da, a) =>
      db
        .from("purchase_orders")
        .select("id, supplier_id, order_id, issue_date, status, subtotal, total, vat_total")
        .eq("company_id", companyId)
        .gte("issue_date", prima.dal)
        .lte("issue_date", periodo.al)
        .order("id")
        .range(da, a),
    ),
    // Senza limite superiore: una fattura arrivata dopo il periodo chiude
    // comunque un ordine del periodo («ordinato non fatturato»).
    leggiTutteLeRighe<FatturaRiga>((da, a) =>
      db
        .from("fatture_ricevute")
        .select(
          "id, purchase_order_id, cedente_ragione_sociale, cedente_piva, data_fattura, imponibile_totale, totale_documento, iva_totale, tipo_documento, stato",
        )
        .eq("company_id", companyId)
        .gte("data_fattura", prima.dal)
        .order("id")
        .range(da, a),
    ),
    leggiTutteLeRighe<ScadenzaRiga>((da, a) =>
      db
        .from("scadenze")
        .select("id, supplier_id, order_id, due_date, amount, paid_amount, status, is_previsionale, tipo, description")
        .eq("company_id", companyId)
        .eq("tipo", "pagamento_fornitore")
        .in("status", ["da_pagare", "parziale"])
        .eq("is_previsionale", false)
        .lte("due_date", tra30)
        .order("id")
        .range(da, a),
    ),
    leggiTutteLeRighe<FornitoreAnagrafica>((da, a) =>
      db
        .from("suppliers")
        .select("id, name, vat_number, product_category")
        .eq("company_id", companyId)
        .order("id")
        .range(da, a),
    ),
    leggiTutteLeRighe<CommessaAnagrafica>((da, a) =>
      db
        .from("orders")
        .select("id, order_code, client_name")
        .eq("company_id", companyId)
        .order("id")
        .range(da, a),
    ),
  ]);
  return { ordini, fatture, scadenze, fornitori, commesse };
}

export function useProcurementAnalysis(periodo: Periodo, filtri: FiltriAnalisi = {}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const analisiQuery = useQuery({
    queryKey: ["procurement", "analisi", companyId, periodo.dal, periodo.al, filtri.fornitoreId ?? "", filtri.commessaId ?? "", filtri.categoria ?? ""],
    enabled: !!companyId,
    staleTime: STALE,
    queryFn: async () => {
      const grezzi = await leggiDatiGrezzi(companyId!, periodo);
      return {
        analisi: calcolaAnalisiAcquisti(grezzi, periodo, filtri),
        fornitori: grezzi.fornitori,
        commesse: grezzi.commesse,
      };
    },
  });

  const prezziQuery = useQuery({
    queryKey: ["procurement", "confronto-prezzi", companyId],
    enabled: !!companyId,
    staleTime: STALE,
    queryFn: async () => {
      const oggi = new Date();
      const inizio = dataLocale(new Date(oggi.getFullYear() - 1, oggi.getMonth(), oggi.getDate()));
      const righe = await leggiTutteLeRighe<RawPurchaseItem>((da, a) =>
        db
          .from("purchase_order_items")
          .select(
            "id, description, sku, article_template_id, unit_of_measure, quantity, unit_price, discount_percent, line_total, purchase_orders!inner(supplier_id, issue_date, status, suppliers(name))",
          )
          .eq("company_id", companyId!)
          .gte("purchase_orders.issue_date", inizio)
          .not("purchase_orders.status", "in", "(annullato,bozza)")
          .order("id")
          .range(da, a),
      );
      const lines: PurchaseLine[] = righe.map((r) => ({
        description: r.description,
        sku: r.sku,
        article_template_id: r.article_template_id,
        unit_of_measure: r.unit_of_measure,
        quantity: r.quantity,
        unit_price: r.unit_price,
        discount_percent: r.discount_percent,
        line_total: r.line_total,
        supplier_id: r.purchase_orders?.supplier_id ?? null,
        supplier_name: r.purchase_orders?.suppliers?.name ?? null,
        issue_date: r.purchase_orders?.issue_date ?? null,
      }));
      const benchmarks = computePriceBenchmarks(lines, { oggi });
      return { benchmarks, totalSaving: totalPotentialSaving(benchmarks), analyzedLines: lines.length };
    },
  });

  // Firma → primo ordine d'acquisto: la firma vera del preventivo quando c'è,
  // altrimenti la creazione della commessa (e la pagina lo dice).
  const firmaQuery = useQuery({
    queryKey: ["procurement", "firma-ordine", companyId],
    enabled: !!companyId,
    staleTime: STALE,
    queryFn: async () => {
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 1);
      type Riga = {
        id: string;
        order_id: string;
        created_at: string;
        orders: { created_at: string; quotes: { signed_at: string | null } | null } | null;
      };
      const righe = await leggiTutteLeRighe<Riga>((da, a) =>
        db
          .from("purchase_orders")
          .select("id, order_id, created_at, orders!inner(created_at, company_id, quotes!orders_quote_id_fkey(signed_at))")
          .eq("orders.company_id", companyId!)
          .not("order_id", "is", null)
          .gte("created_at", cutoff.toISOString())
          .order("id")
          .range(da, a),
      );
      const dati: RigaFirmaOrdine[] = righe
        .filter((r) => r.orders)
        .map((r) => ({
          order_id: r.order_id,
          created_at: r.created_at,
          commessa_creata: r.orders!.created_at,
          firmato_il: r.orders!.quotes?.signed_at ?? null,
        }));
      return calcolaFirmaPrimoOrdine(dati);
    },
  });

  return { analisiQuery, prezziQuery, firmaQuery };
}
