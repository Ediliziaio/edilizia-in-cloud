// ============================================================================
// useIndicatoriGuida — dati per "I numeri che comandano" (Cruscotto)
// ============================================================================
// I grezzi li calcola il database in una chiamata (cruscotto_indicatori,
// 20281021233000): fatturato 12 mesi senza note di credito e senza doppioni fra
// fatture dell'app e importate, venduto 12 mesi senza cestino, consegne nei
// tempi sulla chiusura vera, acconti e saldi 90 giorni, apertura → primo ordine.
// Prima erano quattro letture dalla pagina con .limit(2000/3000), senza filtro
// del cestino né del tipo di documento.
// Qui restano le fonti condivise con il resto della pagina:
//   · useMarginData           → costi fissi mensili e break-even
//   · useCruscottoWorkOrders  → cantieri in ritardo adesso
//   · get_prima_nota_saldo    → saldo di cassa (solo il saldo, non l'elenco)
//   · useCostiPersonale       → ore contrattuali e ore su commessa del mese
// La valutazione con le soglie sta nella lib pura src/lib/indicatoriGuida.ts.
// ============================================================================
import { useCruscottoWorkOrders } from "@/hooks/useCruscottoWorkOrders";
import { isLateWork } from "@/lib/cruscottoMetrics";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMarginData } from "@/hooks/useMarginData";
import { useCostiPersonale } from "@/hooks/useCostiPersonale";
import {
  valutaCopertura,
  valutaAccontiSuSaldi,
  valutaQuotaPrimoCliente,
  valutaNeiTempi,
  valutaSaturazione,
  valutaMargineSicurezza,
  valutaFirmaOrdine,
  valutaPortafoglio,
  type Indicatore,
} from "@/lib/indicatoriGuida";

export interface IndicatoriGuidaData {
  isLoading: boolean;
  /** la lettura dei numeri è fallita: niente consigli «da attivare» inventati */
  errore: boolean;
  copertura: Indicatore;
  portafoglio: Indicatore;
  accontiSuSaldi: Indicatore;
  quotaPrimoCliente: Indicatore;
  neiTempi: Indicatore;
  saturazione: Indicatore;
  margineSicurezza: Indicatore;
  firmaOrdine: Indicatore;
}

/** Risposta di cruscotto_indicatori. Importi IVA esclusa, salvo acconti e saldi (rate, IVA inclusa). */
interface IndicatoriGrezzi {
  fatturato_12m: number;
  note_credito_12m: number;
  primo_cliente: { nome: string; totale: number } | null;
  venduto_12m: number;
  /** venduto ancora da fare sulle commesse aperte, IVA esclusa (20281022110000) */
  portafoglio: number;
  portafoglio_commesse: number;
  chiuse_12m: number;
  chiuse_nei_tempi_12m: number;
  acconti_90: number;
  saldi_90: number;
  giorni_firma_ordine: number[];
}

interface SaldoCassa {
  saldo: number;
  entry_count: number;
}

/**
 * Quota dei giorni lavorativi (lun–ven) del mese già passati, oggi compreso.
 * Le ore su commessa si registrano giorno per giorno: confrontarle con le ore
 * contrattuali del mese INTERO dava, a metà mese, metà saturazione.
 */
export function quotaGiorniLavorativiTrascorsi(oggi: Date): number {
  const anno = oggi.getFullYear();
  const mese = oggi.getMonth();
  const ultimo = new Date(anno, mese + 1, 0).getDate();
  let totali = 0;
  let trascorsi = 0;
  for (let g = 1; g <= ultimo; g++) {
    const giorno = new Date(anno, mese, g).getDay();
    if (giorno === 0 || giorno === 6) continue;
    totali++;
    if (g <= oggi.getDate()) trascorsi++;
  }
  return totali > 0 ? trascorsi / totali : 1;
}

export function useIndicatoriGuida(): IndicatoriGuidaData {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // Fonti condivise (già usate altrove nella stessa pagina → nessun costo extra)
  const margin = useMarginData();
  const workQuery = useCruscottoWorkOrders(companyId);
  const personale = useCostiPersonale(companyId, new Date());

  const grezziQuery = useQuery({
    queryKey: ["indicatori-guida", "grezzi", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cruscotto_indicatori" as never, { p_company_id: companyId } as never);
      if (error) throw error;
      // le ancore temporali viaggiano con i dati (nel render sono vietate dal
      // react-compiler), come testo: la cache viene salvata nel browser e una
      // Date tornerebbe stringa
      return { grezzi: data as unknown as IndicatoriGrezzi, oggi: new Date().toISOString() };
    },
  });

  const saldoQuery = useQuery({
    queryKey: ["indicatori-guida", "saldo", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_prima_nota_saldo", { p_company_id: companyId! });
      if (error) throw error;
      return data as unknown as SaldoCassa;
    },
  });

  // La Prima Nota è tenuta se negli ultimi 60 giorni ha almeno qualche movimento
  const primaNotaRecente = useQuery({
    queryKey: ["indicatori-guida", "prima-nota-60", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const da = new Date(Date.now() - 60 * 86_400_000).toLocaleDateString("en-CA");
      const { count, error } = await supabase.from("prima_nota_entries").select("id", { count: "exact", head: true })
        .eq("company_id", companyId!).gte("entry_date", da);
      if (error) throw error;
      return count ?? 0;
    },
  });

  return useMemo<IndicatoriGuidaData>(() => {
    const g = grezziQuery.data?.grezzi;
    const oggi = grezziQuery.data?.oggi ? new Date(grezziQuery.data.oggi) : null;

    const copertura = valutaCopertura(
      saldoQuery.data?.saldo ?? 0,
      (primaNotaRecente.data ?? 0) >= 3,
      margin.totalFixedCostsMonthly,
    );

    const accontiSuSaldi = valutaAccontiSuSaldi(g?.acconti_90 ?? 0, g?.saldi_90 ?? 0);

    const fatturato12m = g?.fatturato_12m ?? 0;
    const primo = g?.primo_cliente ?? null;
    const quotaPrimoCliente = valutaQuotaPrimoCliente(
      primo && fatturato12m > 0 ? (primo.totale / fatturato12m) * 100 : null,
      primo?.nome ?? null,
      fatturato12m,
    );

    const inRitardoOra = oggi ? (workQuery.data ?? []).filter((o) => isLateWork(o, oggi)).length : 0;
    const neiTempi = valutaNeiTempi(g?.chiuse_12m ?? 0, g?.chiuse_nei_tempi_12m ?? 0, inRitardoOra);

    const dipendenti = personale.dipendenti ?? [];
    const quotaMese = oggi ? quotaGiorniLavorativiTrascorsi(oggi) : 1;
    const oreContrattuali = dipendenti.reduce((s, d) => s + d.oreContrattuali, 0) * quotaMese;
    const oreSuCommessa = dipendenti.reduce((s, d) => s + d.oreLavorate + d.oreStraordinario, 0);
    const saturazione = valutaSaturazione(oreSuCommessa, oreContrattuali);

    const margineSicurezza = valutaMargineSicurezza(g?.venduto_12m ?? 0, margin.breakEvenAnnual);
    const portafoglio = valutaPortafoglio(Number(g?.portafoglio ?? 0), g?.portafoglio_commesse ?? 0, g?.venduto_12m ?? 0);
    const firmaOrdine = valutaFirmaOrdine((g?.giorni_firma_ordine ?? []).map(Number));

    return {
      isLoading:
        workQuery.isLoading ||
        margin.isLoading ||
        saldoQuery.isLoading ||
        primaNotaRecente.isLoading ||
        personale.isLoading ||
        grezziQuery.isLoading,
      errore: grezziQuery.isError || saldoQuery.isError,
      copertura,
      portafoglio,
      accontiSuSaldi,
      quotaPrimoCliente,
      neiTempi,
      saturazione,
      margineSicurezza,
      firmaOrdine,
    };
  }, [
    grezziQuery.data, grezziQuery.isLoading, grezziQuery.isError,
    saldoQuery.data, saldoQuery.isLoading, saldoQuery.isError,
    primaNotaRecente.data, primaNotaRecente.isLoading,
    workQuery.data, workQuery.isLoading,
    margin.isLoading, margin.totalFixedCostsMonthly, margin.breakEvenAnnual,
    personale.dipendenti, personale.isLoading,
  ]);
}
