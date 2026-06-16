/**
 * StripePaymentsCard — Pagamenti con carta (Stripe Connect) per l'azienda.
 * Onboarding del "connected account": l'azienda incassa carta/link e EiC
 * trattiene una commissione (markup, modello tipo TS Pay). Tutto via edge
 * function sicura `payments-connect`. Qui solo onboarding/stato.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CreditCard, Loader2, CheckCircle2, ExternalLink } from "lucide-react";

export default function StripePaymentsCard() {
  const { canViewTesoreria, isAdmin, isLoading: permsLoading } = usePermissions();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connecting, setConnecting] = useState(false);
  const refreshedRef = useRef(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ["stripe-connect-status"],
    enabled: canViewTesoreria && !permsLoading,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("payments-connect", { body: { action: "status" } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      return data as { connected: boolean; charges_enabled: boolean; details_submitted?: boolean };
    },
  });

  // Al ritorno dall'onboarding Stripe (?stripe=connected) → rinfresca lo stato.
  useEffect(() => {
    if (refreshedRef.current) return;
    const s = searchParams.get("stripe");
    if (s === "connected" || s === "refresh") {
      refreshedRef.current = true;
      qc.invalidateQueries({ queryKey: ["stripe-connect-status"] });
      const next = new URLSearchParams(searchParams);
      next.delete("stripe");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, qc, setSearchParams]);

  const startOnboarding = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("payments-connect", { body: { action: "onboard" } });
      if (error || data?.error || !data?.url) throw new Error(data?.error || error?.message || "Errore");
      window.location.href = data.url; // pagina sicura Stripe per completare l'onboarding
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore avvio configurazione pagamenti");
      setConnecting(false);
    }
  };

  if (permsLoading) return null;
  if (!canViewTesoreria) return null;

  const active = status?.charges_enabled === true;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-4 w-4 text-indigo-600" />
          Pagamenti con carta <span className="text-xs font-normal text-muted-foreground">(Stripe)</span>
        </CardTitle>
        {active && <Badge className="text-[10px] px-1.5 py-0 border-0 bg-emerald-100 text-emerald-700">Attivi</Badge>}
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-3"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : active ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Account collegato: puoi incassare con carta e link di pagamento. La commissione di piattaforma è inclusa.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Abilita gli incassi con carta e link di pagamento sulle fatture. Verrai portato su Stripe per la verifica (IBAN, dati azienda).
              {status?.connected && status?.details_submitted === false && " Onboarding non ancora completato."}
            </p>
            {isAdmin ? (
              <Button size="sm" onClick={startOnboarding} disabled={connecting}>
                {connecting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-1" />}
                {status?.connected ? "Completa configurazione" : "Abilita incassi con carta"}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">Solo un amministratore può configurare i pagamenti.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
