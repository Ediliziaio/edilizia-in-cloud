/**
 * I buoni pasto dell'operaio: regole dell'azienda, se la persona è abilitata e i suoi buoni dell'ultimo anno.
 * Le regole RLS danno già all'operaio solo le sue righe (`hbp_select`, `hr_profili_self_read`, `hib_select`).
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { motivoSenzaBuoni, type BuonoPasto, type RegoleBuoni } from "@/lib/campo/buoniPasto";

export function useBuoniPastoCampo() {
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const userId = user?.id;

  const base = useQuery({
    queryKey: ["campo-buoni-pasto-regole", companyId, userId],
    enabled: !!companyId && !!userId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Il profilo lo sceglie la stessa funzione delle regole RLS dei buoni (per utente, o per dipendente collegato):
      // così la pagina e i permessi non possono essere in disaccordo.
      const [regole, profiloId] = await Promise.all([
        supabase.from("hr_impostazioni_benefit")
          .select("buono_pasto_attivo, buono_pasto_modalita, buono_pasto_valore, buono_pasto_soglia_ore")
          .eq("company_id", companyId!).maybeSingle(),
        supabase.rpc("hr_profilo_da_user", { p_user_id: userId!, p_company_id: companyId! }),
      ]);
      if (regole.error) throw regole.error;
      if (profiloId.error) throw profiloId.error;
      const id = (profiloId.data as string | null) ?? null;
      // La scheda si legge solo se è collegata all'utente; se non si legge, decidono i buoni che ci sono.
      const scheda = id
        ? await supabase.from("hr_profili").select("buono_pasto_abilitato").eq("id", id).maybeSingle()
        : null;
      return {
        regole: (regole.data ?? null) as RegoleBuoni | null,
        profiloId: id,
        abilitato: !!id && (scheda?.data ? !!scheda.data.buono_pasto_abilitato : true),
      };
    },
  });

  // Finché le regole non sono lette, niente buoni: la voce di menu non compare per un istante e poi sparisce.
  const motivo = base.isSuccess ? motivoSenzaBuoni(base.data.regole, base.data.abilitato) : "azienda";
  const profiloId = base.data?.profiloId ?? null;

  const buoni = useQuery({
    queryKey: ["campo-buoni-pasto", profiloId],
    enabled: !!profiloId && base.isSuccess && motivo === null,
    queryFn: async () => {
      const unAnnoFa = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
      const { data, error } = await supabase.from("hr_buoni_pasto")
        .select("id, giorno, tipo, importo, stato")
        .eq("profilo_id", profiloId!).gte("giorno", unAnnoFa)
        .order("giorno", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as BuonoPasto[];
    },
  });

  return {
    caricamento: base.isLoading || (motivo === null && buoni.isLoading),
    errore: base.isError || buoni.isError,
    riprova: () => { void base.refetch(); void buoni.refetch(); },
    regole: base.data?.regole ?? null,
    /** null = ha i buoni; altrimenti perché no. */
    motivo,
    buoni: buoni.data ?? [],
  };
}
