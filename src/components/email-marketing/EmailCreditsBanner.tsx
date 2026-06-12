/**
 * EmailCreditsBanner — Alert critico sopra Email Marketing.
 *
 * v8.7 — Mostra SOLO l'alert critico (invii bloccati per saldo esaurito).
 * Il saldo, la quota e i dettagli NON compaiono più qui: vivono nella pagina
 * dedicata Impostazioni → Crediti & Saldo. In stato normale il banner non
 * renderizza nulla, così la home Email Marketing resta pulita.
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, ArrowRight } from "lucide-react";

export function EmailCreditsBanner() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: credits } = useQuery({
    queryKey: ["email-credits-banner", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("email_credits")
        .select("sends_blocked")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data as { sends_blocked: boolean } | null;
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  // Stato normale: nessun banner. Il saldo/quota vivono solo nella pagina
  // Impostazioni → Crediti & Saldo. Qui mostriamo SOLO l'alert critico,
  // perché senza saldo le campagne non partono e l'utente deve saperlo.
  if (!companyId || !credits?.sends_blocked) return null;

  return (
    <Alert variant="destructive" className="rounded-2xl">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between gap-3">
        <span>
          <strong>Invii email bloccati</strong> — saldo crediti esaurito.
        </span>
        <Link
          to="/azienda/impostazioni/crediti"
          className="shrink-0 text-sm font-semibold underline underline-offset-2"
        >
          Ricarica ora <ArrowRight className="ml-1 inline h-3 w-3" />
        </Link>
      </AlertDescription>
    </Alert>
  );
}
