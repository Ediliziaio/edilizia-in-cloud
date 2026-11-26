/**
 * Legge i tre numeri della cassa libera dell'azienda: saldo dei conti, uscite
 * già registrate e non pagate, saldo dei cantieri aperti.
 *
 * Le fonti sono quelle che l'app già usa altrove, non definizioni nuove:
 * - `bank_accounts_operativi.current_balance` (conti attivi), come il Controllo
 *   di Gestione e la Tesoreria;
 * - `scadenze` aperte e non previsionali, come il «netto a 30 giorni»;
 * - `v_ordine_esposizione`, la stessa vista di «Chi finanzia il cantiere».
 *
 * Il saldo dei conti lo vede solo chi ha il permesso: senza, l'hook non chiede
 * niente e il riquadro non compare.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { allPaymentRows } from "@/hooks/useSupplierPayments";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";
import { leggiIdGenerali } from "@/hooks/useCommesseGenerali";
import { cassaLiberaAzienda, type CassaLiberaAzienda, type ScadenzaCassa } from "@/lib/tesoreria/cassaLiberaAzienda";

export function useCassaLiberaAzienda() {
  const companyId = useEffectiveCompanyId();
  const { canViewBankBalances } = usePermissions();
  return useQuery({
    queryKey: ["cassa-libera-azienda", companyId] as const,
    enabled: !!companyId && canViewBankBalances,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CassaLiberaAzienda> => {
      const oggi = new Date().toLocaleDateString("en-CA"); // data locale, no drift UTC
      const [conti, scadenze, cantieri, generali] = await Promise.all([
        supabase
          .from("bank_accounts_operativi")
          .select("current_balance")
          .eq("company_id", companyId!)
          .eq("is_active", true),
        // A pagine: con un limite fisso un'azienda con molte scadenze aperte
        // perderebbe in silenzio una parte del debito, e la cassa libera
        // risulterebbe più alta del vero — l'errore peggiore qui.
        allPaymentRows<ScadenzaCassa>((from, to) =>
          supabase
            .from("scadenze")
            .select("direction, amount, paid_amount, due_date")
            .eq("company_id", companyId!)
            .in("status", ["da_pagare", "parziale"])
            .or("is_previsionale.is.null,is_previsionale.eq.false")
            .order("id")
            .range(from, to),
        ),
        // Vista fuori dai tipi generati (migrazione recente).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        allPaymentRows<{ id: string; saldo: number | null }>((from, to) =>
          (supabase as any)
            .from("v_ordine_esposizione")
            .select("id, saldo")
            .eq("company_id", companyId!)
            .lt("saldo", -0.5)
            .order("id")
            .range(from, to),
        ).catch((): { id: string; saldo: number | null }[] => []),
        // Una commessa generale non è un cantiere: i suoi costi comuni non sono
        // un anticipo. Stessa esclusione della fascia «Cantieri che stai
        // finanziando tu», così i due numeri si somigliano.
        leggiIdGenerali(companyId!),
      ]);
      if (conti.error) throw conti.error;
      const fuori = new Set(generali);

      return cassaLiberaAzienda({
        saldiConti: (conti.data ?? []).map((riga) => riga.current_balance),
        scadenzeAperte: scadenze,
        saldiCantieriAperti: cantieri.filter((riga) => !fuori.has(riga.id)).map((riga) => riga.saldo),
        oggi,
      });
    },
  });
}
