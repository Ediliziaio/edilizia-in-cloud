/**
 * I numeri in cima al magazzino e l'«in arrivo» per articolo, calcolati dal
 * database (magazzino_riepilogo, magazzino_in_arrivo) su TUTTI i dati
 * dell'azienda e del magazzino scelto.
 *
 * Prima i riquadri delle commesse si contavano sulle 50 righe della pagina
 * mostrata — cliccandone uno, gli altri andavano a zero — e quelli
 * dell'inventario ignoravano il magazzino selezionato.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface ConteggioRighe { n: number; commesse: number; valore?: number }

export interface MagazzinoRiepilogo {
  righe: {
    in_ritardo: ConteggioRighe;
    in_magazzino: ConteggioRighe;
    ordinato: ConteggioRighe;
    da_ordinare: ConteggioRighe;
  };
  articoli: {
    n: number;
    con_giacenza: number;
    valore: number;
    senza_costo: number;
    negativi: number;
    sotto_scorta: number;
    impegnato: number;
  };
  in_arrivo: { quantita: number; articoli: number };
}

export interface InArrivoArticolo {
  quantita: number;
  ordini: Array<{ id: string; numero: string; consegna: string | null }>;
}

// sotto ["warehouse"]: ogni movimento che invalida il magazzino rinfresca anche questi numeri
export const magazzinoRiepilogoKeys = {
  all: ["warehouse", "riepilogo"] as const,
  riepilogo: (companyId?: string, warehouseId?: string | null) => ["warehouse", "riepilogo", companyId, warehouseId ?? "tutti"] as const,
  inArrivo: (companyId?: string) => ["warehouse", "riepilogo", "in-arrivo", companyId] as const,
};

/**
 * Questi numeri dipendono da tutto il magazzino: righe di commessa, giacenze,
 * ordini fornitore. Invece di ricordarsi di invalidarli in ognuno dei punti che
 * cambiano qualcosa (carico rapido, stato delle righe, arrivi, zone…), li si
 * rinfresca quando QUALSIASI lettura del magazzino o degli ordini fornitore
 * viene invalidata. Con un piccolo ritardo, per non ricalcolarli dieci volte
 * di seguito dopo un'azione che ne invalida dieci.
 */
function useRinfrescaRiepilogo() {
  const queryClient = useQueryClient();
  useEffect(() => {
    let attesa: ReturnType<typeof setTimeout> | null = null;
    const stacca = queryClient.getQueryCache().subscribe((evento) => {
      if (evento.type !== "updated" || evento.action.type !== "invalidate") return;
      const chiave = evento.query.queryKey;
      const radice = chiave[0];
      if (radice === "warehouse" && chiave[1] === "riepilogo") return;
      if (radice !== "warehouse" && radice !== "purchase-orders") return;
      if (attesa) clearTimeout(attesa);
      attesa = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: magazzinoRiepilogoKeys.all });
        // anche gli avvisi «sotto scorta» del banner e del riordino: restavano
        // vecchi fino a 5 minuti dopo uno scarico
        queryClient.invalidateQueries({ queryKey: ["magazzino-live"] });
      }, 300);
    });
    return () => {
      stacca();
      if (attesa) clearTimeout(attesa);
    };
  }, [queryClient]);
}

export function useMagazzinoRiepilogo(warehouseId?: string | null) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  useRinfrescaRiepilogo();
  return useQuery({
    queryKey: magazzinoRiepilogoKeys.riepilogo(companyId, warehouseId),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("magazzino_riepilogo" as never, {
        p_company_id: companyId,
        p_warehouse_id: warehouseId ?? null,
      } as never);
      if (error) throw error;
      return data as unknown as MagazzinoRiepilogo;
    },
  });
}

/** Per articolo: quanto è in arrivo dagli ordini fornitore aperti, e da quali. */
export function useMagazzinoInArrivo() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: magazzinoRiepilogoKeys.inArrivo(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("magazzino_in_arrivo" as never, { p_company_id: companyId } as never);
      if (error) throw error;
      const mappa = new Map<string, InArrivoArticolo>();
      for (const r of (data ?? []) as unknown as Array<{ stock_item_id: string; quantita: number; ordini: InArrivoArticolo["ordini"] }>) {
        mappa.set(r.stock_item_id, { quantita: Number(r.quantita), ordini: r.ordini ?? [] });
      }
      return mappa;
    },
  });
}
