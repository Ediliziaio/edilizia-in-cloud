import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";
import { Badge } from "@/components/ui/badge";
import { BloccoAccessoCard } from "@/components/users/BloccoAccessoCard";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export interface AccessoOperaio {
  profilo_id: string;
  utente_id: string | null;
  stato: "attivo" | "bloccato" | "mai_dato" | "revocato";
  ripristinabile: boolean;
}

export function useStatiAppOperai() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["stati-app-operai", companyId],
    enabled: !!companyId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("stati_app_operai", { p_company_id: companyId! });
      if (error) throw error;
      const righe = data as unknown as AccessoOperaio[];
      return Object.fromEntries(righe.map(r => [r.profilo_id, r])) as Record<string, AccessoOperaio>;
    },
  });
}

const etichette = { attivo: "App attiva", bloccato: "App bloccata", mai_dato: "Accesso mai dato", revocato: "Accesso revocato" };

export function StatoAppOperaio({ accesso }: { accesso?: AccessoOperaio }) {
  const t = useT();
  return <Badge variant="outline" className={accesso?.stato === "attivo" ? "text-emerald-700" : accesso?.stato === "bloccato" ? "text-red-700" : "text-muted-foreground"}>
    {accesso ? t(etichette[accesso.stato]) : t("Stato app da verificare")}
  </Badge>;
}

export function AccessoAppInScheda({ profiloId }: { profiloId: string }) {
  const { data } = useStatiAppOperai();
  const permessi = usePermissions();
  const accesso = data?.[profiloId];
  return <div className="flex flex-wrap items-center gap-2">
    <StatoAppOperaio accesso={accesso} />
    {accesso?.ripristinabile && accesso.utente_id && permessi.isAdmin && !permessi.solaLettura &&
      <BloccoAccessoCard compatto isBlocked puoBloccare userId={accesso.utente_id} />}
  </div>;
}
