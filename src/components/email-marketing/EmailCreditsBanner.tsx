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

/**
 * @param warnBelowEur soglia opzionale: se il saldo e' sotto (ma gli invii non
 * sono ancora bloccati) mostra un avviso giallo PRIMA di compilare la campagna
 * — cosi' l'utente non scopre il problema solo al momento dell'invio.
 */
export function EmailCreditsBanner({ warnBelowEur }: { warnBelowEur?: number } = {}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: credits } = useQuery({
    queryKey: ["email-credits-banner", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("email_credits")
        .select("sends_blocked, balance_eur")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data as { sends_blocked: boolean; balance_eur: number | null } | null;
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  if (!companyId) return null;

  // Alert critico: invii bloccati, la campagna non partira'.
  if (credits?.sends_blocked) {
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

  // Avviso preventivo (solo dove richiesto con warnBelowEur): saldo basso ma
  // non azzerato — meglio saperlo ORA che dopo mezz'ora di editor.
  const balance = credits?.balance_eur;
  if (warnBelowEur != null && balance != null && balance < warnBelowEur) {
    return (
      <Alert className="rounded-2xl border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>
            <strong>Crediti email in esaurimento</strong> — saldo{" "}
            {balance.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}: con un
            invio grande potrebbe non bastare.
          </span>
          <Link
            to="/azienda/impostazioni/crediti"
            className="shrink-0 text-sm font-semibold underline underline-offset-2"
          >
            Ricarica <ArrowRight className="ml-1 inline h-3 w-3" />
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  // Stato normale: nessun banner (saldo/quota vivono in Impostazioni → Crediti).
  return null;
}
