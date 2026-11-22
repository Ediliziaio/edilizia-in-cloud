import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Clock3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";

/** Stato del servizio, senza esporre saldi o contenuti dei documenti. */
export function StatoCodaAllegati() {
  const companyId = useEffectiveCompanyId();
  const permessi = usePermissions();
  const stato = useQuery({
    queryKey: ["email-ai-coda-blocco", companyId],
    enabled: !!companyId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("email_ai_coda_blocchi")
        .select("motivo, messaggio, bloccata_il").eq("company_id", companyId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (stato.isError) return <p role="status" className="text-sm text-slate-600">Stato dell’estrazione automatica non disponibile. Puoi continuare a gestire i documenti.</p>;
  if (!stato.data) return null;
  const link = stato.data.motivo === "pagamento" ? { to: "/azienda/impostazioni/fatturazione", label: "Verifica fatturazione" }
    : stato.data.motivo === "credito_azienda" ? { to: "/azienda/impostazioni/crediti", label: "Verifica crediti AI" } : null;
  return <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
    <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
    <div className="space-y-1">
      <p className="font-medium">Lettura automatica in attesa</p>
      <p>{stato.data.messaggio}</p>
      <p>I documenti restano disponibili. La coda ricontrolla le condizioni e riprende automaticamente al prossimo giro dopo lo sblocco.</p>
      {link && (permessi.canViewBilling ? <Link to={link.to} className="inline-flex min-h-11 items-center font-medium underline underline-offset-2">{link.label}</Link> : <p>Chiedi all’amministratore di verificare fatturazione e crediti AI.</p>)}
    </div>
  </div>;
}
