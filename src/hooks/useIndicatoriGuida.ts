// ============================================================================
// useIndicatoriGuida — dati per "I numeri che comandano" (Cruscotto)
// ============================================================================
// Compone SOLO fonti già esistenti — nessuna formula nuova sui margini:
//   · useMarginData      → costi fissi mensili e break-even (fonte unica, la
//                          stessa di Costi e Punto di Pareggio)
//   · usePrimaNota       → saldo di cassa (lo stesso del widget Prima Nota,
//                          React Query deduplica la chiamata)
//   · useCostiPersonale  → ore contrattuali e ore su commessa del mese
// più quattro letture leggere (rate incassate, fatture 12m, date commesse,
// primi ordini fornitore). La valutazione con le soglie sta nella lib pura
// src/lib/indicatoriGuida.ts; qui solo raccolta e aggregazione.
// ============================================================================
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMarginData } from "@/hooks/useMarginData";
import { usePrimaNota } from "@/hooks/usePrimaNota";
import { useCostiPersonale } from "@/hooks/useCostiPersonale";
import {
  valutaCopertura,
  valutaAccontiSuSaldi,
  valutaQuotaPrimoCliente,
  valutaNeiTempi,
  valutaSaturazione,
  valutaMargineSicurezza,
  valutaFirmaOrdine,
  type Indicatore,
} from "@/lib/indicatoriGuida";

export interface IndicatoriGuidaData {
  isLoading: boolean;
  copertura: Indicatore;
  accontiSuSaldi: Indicatore;
  quotaPrimoCliente: Indicatore;
  neiTempi: Indicatore;
  saturazione: Indicatore;
  margineSicurezza: Indicatore;
  firmaOrdine: Indicatore;
}

// Date-only in locale (en-CA = YYYY-MM-DD): mai toISOString per i confronti
// su colonne date, sennò a mezzanotte si slitta di un giorno (bug UTC noto).
function dataLocale(d: Date): string {
  return d.toLocaleDateString("en-CA");
}

function giorniFa(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dataLocale(d);
}

interface RataIncassata {
  type: string;
  amount: number | null;
  paid_date: string | null;
}

interface FatturaCliente {
  client_id: string | null;
  client_company_name: string | null;
  total: number | null;
}

interface CommessaDate {
  id: string;
  created_at: string;
  expected_date: string | null;
  work_end_date: string | null;
}

// Le ancore temporali viaggiano CON i dati: calcolarle nel render è vietato
// dal react-compiler (funzioni impure), nella queryFn no.
interface CommesseSnapshot {
  rows: Array<CommessaDate & { total_amount: number | null }>;
  oggi: string;
  unAnnoFa: string;
  dodiciMesiFaIso: string;
}

interface OdaMin {
  order_id: string | null;
  created_at: string;
}

export function useIndicatoriGuida(): IndicatoriGuidaData {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // Fonti condivise (già usate altrove nella stessa pagina → nessun costo extra)
  const margin = useMarginData();
  const { saldo, isSaldoLoading } = usePrimaNota();
  const personale = useCostiPersonale(companyId, new Date());

  // 1. Rate incassate negli ultimi 90 giorni (acconti vs saldi).
  //    order_installments non ha company_id: filtro via join sulle commesse.
  const rateQuery = useQuery({
    queryKey: ["indicatori-guida", "rate", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<RataIncassata[]> => {
      const { data, error } = await (supabase as any)
        .from("order_installments")
        .select("type, amount, paid_date, orders!inner(company_id)")
        .eq("orders.company_id", companyId!)
        .eq("is_paid", true)
        .gte("paid_date", giorniFa(90))
        .limit(2000);
      if (error) throw error;
      return (data || []) as RataIncassata[];
    },
  });

  // 2. Fatture emesse negli ultimi 12 mesi (concentrazione clienti).
  const fattureQuery = useQuery({
    queryKey: ["indicatori-guida", "fatture", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<FatturaCliente[]> => {
      const { data, error } = await supabase
        .from("invoices")
        .select("client_id, client_company_name, total")
        .eq("company_id", companyId!)
        .gte("issue_date", giorniFa(365))
        .not("status", "in", "(draft,bozza,cancelled)")
        .limit(3000);
      if (error) throw error;
      return (data || []) as FatturaCliente[];
    },
  });

  // 3. Date delle commesse (puntualità + venduto 12m + base firma→ordine).
  const commesseQuery = useQuery({
    queryKey: ["indicatori-guida", "commesse", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CommesseSnapshot> => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, created_at, expected_date, work_end_date, total_amount")
        .eq("company_id", companyId!)
        .gte("created_at", new Date(Date.now() - 730 * 86400_000).toISOString())
        .limit(3000);
      if (error) throw error;
      return {
        rows: (data || []) as CommesseSnapshot["rows"],
        oggi: dataLocale(new Date()),
        unAnnoFa: giorniFa(365),
        dodiciMesiFaIso: new Date(Date.now() - 365 * 86400_000).toISOString(),
      };
    },
  });

  // 4. Ordini fornitore degli ultimi 6 mesi collegati a una commessa.
  const odaQuery = useQuery({
    queryKey: ["indicatori-guida", "oda", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<OdaMin[]> => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("order_id, created_at")
        .eq("company_id", companyId!)
        .not("order_id", "is", null)
        .gte("created_at", new Date(Date.now() - 183 * 86400_000).toISOString())
        .limit(2000);
      if (error) throw error;
      return (data || []) as OdaMin[];
    },
  });

  return useMemo<IndicatoriGuidaData>(() => {
    const snapshot = commesseQuery.data;
    const commesse = snapshot?.rows ?? [];
    const oggi = snapshot?.oggi ?? "";
    const unAnnoFa = snapshot?.unAnnoFa ?? "";

    // ── Copertura: saldo Prima Nota ÷ fissi giornalieri ──
    const copertura = valutaCopertura(
      saldo?.saldo ?? 0,
      (saldo?.entry_count ?? 0) > 0,
      margin.totalFixedCostsMonthly,
    );

    // ── Acconti ÷ saldi incassati (90 gg): deposit vs balance, mai financing ──
    const rate = rateQuery.data ?? [];
    const acconti = rate
      .filter((r) => r.type === "deposit")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const saldi = rate
      .filter((r) => r.type === "balance")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const accontiSuSaldi = valutaAccontiSuSaldi(acconti, saldi);

    // ── Quota primo cliente sul fatturato 12m ──
    const fatture = fattureQuery.data ?? [];
    const perCliente = new Map<string, { nome: string; totale: number }>();
    let fatturato12m = 0;
    for (const f of fatture) {
      const totale = Number(f.total ?? 0);
      if (totale <= 0) continue;
      fatturato12m += totale;
      const chiave = f.client_id ?? f.client_company_name ?? "—";
      const voce = perCliente.get(chiave) ?? {
        nome: f.client_company_name ?? "Cliente senza nome",
        totale: 0,
      };
      voce.totale += totale;
      perCliente.set(chiave, voce);
    }
    let primoCliente: { nome: string; totale: number } | null = null;
    for (const voce of perCliente.values()) {
      if (!primoCliente || voce.totale > primoCliente.totale) primoCliente = voce;
    }
    const quotaPrimoCliente = valutaQuotaPrimoCliente(
      primoCliente && fatturato12m > 0 ? (primoCliente.totale / fatturato12m) * 100 : null,
      primoCliente?.nome ?? null,
      fatturato12m,
    );

    // ── Puntualità: stessa semantica del Cruscotto (expected_date = promessa,
    //    work_end_date = fine lavori effettiva; "in ritardo" = promessa
    //    superata e lavori non chiusi) ──
    const chiuse12m = commesse.filter(
      (o) => o.expected_date && o.work_end_date && o.work_end_date >= unAnnoFa,
    );
    const chiuseNeiTempi = chiuse12m.filter(
      (o) => o.work_end_date! <= o.expected_date!,
    ).length;
    const inRitardoOra = commesse.filter(
      (o) => o.expected_date && o.expected_date < oggi && !o.work_end_date,
    ).length;
    const neiTempi = valutaNeiTempi(chiuse12m.length, chiuseNeiTempi, inRitardoOra);

    // ── Saturazione squadra del mese corrente ──
    const dipendenti = personale.dipendenti ?? [];
    const oreContrattuali = dipendenti.reduce((s, d) => s + d.oreContrattuali, 0);
    const oreSuCommessa = dipendenti.reduce(
      (s, d) => s + d.oreLavorate + d.oreStraordinario,
      0,
    );
    const saturazione = valutaSaturazione(oreSuCommessa, oreContrattuali);

    // ── Margine di sicurezza: venduto commesse 12m vs break-even annuo ──
    const venduto12m = commesse
      .filter((o) => o.created_at >= (snapshot?.dodiciMesiFaIso ?? ""))
      .reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
    const margineSicurezza = valutaMargineSicurezza(venduto12m, margin.breakEvenAnnual);

    // ── Giorni apertura commessa → primo ordine fornitore (mediana, 6 mesi) ──
    const primoOdaPerCommessa = new Map<string, string>();
    for (const po of odaQuery.data ?? []) {
      if (!po.order_id) continue;
      const attuale = primoOdaPerCommessa.get(po.order_id);
      if (!attuale || po.created_at < attuale) primoOdaPerCommessa.set(po.order_id, po.created_at);
    }
    const creataPerCommessa = new Map(commesse.map((o) => [o.id, o.created_at]));
    const giorniFirmaOrdine: number[] = [];
    for (const [orderId, primoOda] of primoOdaPerCommessa) {
      const creata = creataPerCommessa.get(orderId);
      if (!creata) continue;
      const delta = (new Date(primoOda).getTime() - new Date(creata).getTime()) / 86400_000;
      if (delta >= 0) giorniFirmaOrdine.push(delta);
    }
    const firmaOrdine = valutaFirmaOrdine(giorniFirmaOrdine);

    return {
      isLoading:
        margin.isLoading ||
        isSaldoLoading ||
        personale.isLoading ||
        rateQuery.isLoading ||
        fattureQuery.isLoading ||
        commesseQuery.isLoading ||
        odaQuery.isLoading,
      copertura,
      accontiSuSaldi,
      quotaPrimoCliente,
      neiTempi,
      saturazione,
      margineSicurezza,
      firmaOrdine,
    };
  }, [
    margin.isLoading,
    margin.totalFixedCostsMonthly,
    margin.breakEvenAnnual,
    saldo,
    isSaldoLoading,
    personale.dipendenti,
    personale.isLoading,
    rateQuery.data,
    rateQuery.isLoading,
    fattureQuery.data,
    fattureQuery.isLoading,
    commesseQuery.data,
    commesseQuery.isLoading,
    odaQuery.data,
    odaQuery.isLoading,
  ]);
}
