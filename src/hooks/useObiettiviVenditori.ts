import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { toast } from "sonner";
import { userErrorMessage } from "@/lib/userErrorMessage";

/*
 * Obiettivi mensili per venditore (sales_targets, 20280915410010): un importo e
 * un numero di contratti per persona e per mese. Li scrive un amministratore;
 * li vede chi vede i report, e il venditore i propri.
 *
 * Il confronto si fa con «fatturato generato» del report Venditori: il valore
 * delle opportunità vinte nel mese.
 */

export interface ObiettivoMese {
  user_id: string;
  anno: number;
  mese: number;
  fatturato: number;
  contratti: number;
}

/** I mesi (anno, mese) toccati dal periodo, estremi compresi. */
export function mesiDelPeriodo(inizio: Date, fine: Date): { anno: number; mese: number }[] {
  const mesi: { anno: number; mese: number }[] = [];
  const cursore = new Date(inizio.getFullYear(), inizio.getMonth(), 1);
  const ultimo = new Date(fine.getFullYear(), fine.getMonth(), 1);
  while (cursore <= ultimo && mesi.length < 60) {
    mesi.push({ anno: cursore.getFullYear(), mese: cursore.getMonth() + 1 });
    cursore.setMonth(cursore.getMonth() + 1);
  }
  return mesi;
}

function chiave(anno: number, mese: number) {
  return anno * 12 + mese;
}

/** Obiettivi dei mesi che toccano il periodo, sommati per venditore. */
export function useObiettiviVenditori(inizio: Date, fine: Date) {
  const companyId = useEffectiveCompanyId();
  const mesi = mesiDelPeriodo(inizio, fine);
  const anni = [...new Set(mesi.map((m) => m.anno))];
  const da = mesi.length ? chiave(mesi[0].anno, mesi[0].mese) : 0;
  const a = mesi.length ? chiave(mesi[mesi.length - 1].anno, mesi[mesi.length - 1].mese) : 0;

  return useQuery({
    queryKey: ["obiettivi-venditori", companyId, da, a],
    enabled: !!companyId && mesi.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_targets")
        .select("user_id, year, month, target_revenue, target_contracts")
        .eq("company_id", companyId!)
        .in("year", anni)
        .not("month", "is", null);
      if (error) throw error;
      const somma = new Map<string, { fatturato: number; contratti: number }>();
      for (const r of (data ?? []) as any[]) {
        const k = chiave(Number(r.year), Number(r.month));
        if (k < da || k > a) continue;
        const prima = somma.get(r.user_id) ?? { fatturato: 0, contratti: 0 };
        somma.set(r.user_id, {
          fatturato: prima.fatturato + (Number(r.target_revenue) || 0),
          contratti: prima.contratti + (Number(r.target_contracts) || 0),
        });
      }
      return somma;
    },
  });
}

/** Gli obiettivi di UN mese, per la finestra che li imposta. */
export function useObiettiviDelMese(anno: number, mese: number, abilitata = true) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["obiettivi-venditori-mese", companyId, anno, mese],
    enabled: !!companyId && abilitata,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_targets")
        .select("user_id, year, month, target_revenue, target_contracts")
        .eq("company_id", companyId!)
        .eq("year", anno)
        .eq("month", mese);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        user_id: r.user_id as string,
        anno: Number(r.year),
        mese: Number(r.month),
        fatturato: Number(r.target_revenue) || 0,
        contratti: Number(r.target_contracts) || 0,
      })) as ObiettivoMese[];
    },
  });
}

export function useSalvaObiettivi() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ anno, mese, righe }: { anno: number; mese: number; righe: ObiettivoMese[] }) => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      // Un obiettivo a zero non è un obiettivo: la riga si toglie.
      const daScrivere = righe.filter((r) => r.fatturato > 0 || r.contratti > 0);
      const daTogliere = righe.filter((r) => r.fatturato <= 0 && r.contratti <= 0).map((r) => r.user_id);

      if (daScrivere.length > 0) {
        const { error } = await supabase.from("sales_targets").upsert(
          daScrivere.map((r) => ({
            company_id: companyId,
            user_id: r.user_id,
            year: anno,
            month: mese,
            period_type: "monthly",
            target_revenue: r.fatturato,
            target_contracts: r.contratti,
            target_appointments: 0,
            target_calls: 0,
          })) as any,
          { onConflict: "company_id,user_id,year,month" },
        );
        if (error) throw error;
      }
      if (daTogliere.length > 0) {
        const { error } = await supabase
          .from("sales_targets")
          .delete()
          .eq("company_id", companyId)
          .eq("year", anno)
          .eq("month", mese)
          .in("user_id", daTogliere);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Obiettivi salvati");
      queryClient.invalidateQueries({ queryKey: ["obiettivi-venditori"] });
      queryClient.invalidateQueries({ queryKey: ["obiettivi-venditori-mese"] });
    },
    onError: (e) => toast.error(userErrorMessage(e, "Non sono riuscito a salvare gli obiettivi")),
  });
}
