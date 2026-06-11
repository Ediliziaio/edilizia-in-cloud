/**
 * PlatformSmsActivationCard — attivazione SMS per la PIATTAFORMA (super admin).
 *
 * Sostituisce l'onboarding cliente (SmsOnboarding) quando il modulo SMS è
 * aperto dall'area super admin: la piattaforma NON paga il canone €30/mese
 * (quello è il prezzo che la piattaforma rivende alle aziende) — i suoi
 * costi sono quelli wholesale Telnyx diretti.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTelnyxSetup } from "@/hooks/useTelnyxSetup";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquare, CheckCircle2 } from "lucide-react";

export function PlatformSmsActivationCard() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const { attivaAzienda, isAttivando } = useTelnyxSetup();
  const [completing, setCompleting] = useState(false);

  const handleActivate = async () => {
    if (!companyId) return;
    setCompleting(true);
    try {
      await attivaAzienda(companyId);
      // La piattaforma non passa dal wizard cliente: onboarding completato
      // subito — l'invio funziona con mittente alfanumerico, il numero
      // dedicato è opzionale.
      const { error } = await supabase
        .from("sms_provider_config")
        .upsert(
          { company_id: companyId, onboarding_completato: true } as never,
          { onConflict: "company_id" },
        );
      if (error) throw error;
      queryClient.invalidateQueries();
      toast.success("Modulo SMS piattaforma attivato");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Attivazione non riuscita");
    } finally {
      setCompleting(false);
    }
  };

  const busy = isAttivando || completing;

  return (
    <Card className="max-w-lg mx-auto">
      <CardContent className="pt-8 pb-8 text-center space-y-4">
        <div className="mx-auto h-14 w-14 rounded-full bg-blue-50 flex items-center justify-center">
          <MessageSquare className="h-7 w-7 text-[#1E3A5F]" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-center gap-2">
            <h2 className="text-lg font-semibold">Modulo SMS — Piattaforma</h2>
            <Badge variant="secondary">super admin</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Account piattaforma: <strong>nessun canone</strong> — il prezzo €30/mese è
            quello rivenduto alle aziende. I tuoi costi sono quelli wholesale Telnyx.
          </p>
        </div>
        <ul className="text-sm text-left max-w-xs mx-auto space-y-1.5">
          <li className="flex gap-2 items-center">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            Invio immediato con mittente alfanumerico
          </li>
          <li className="flex gap-2 items-center">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            Numero dedicato opzionale (costo wholesale)
          </li>
          <li className="flex gap-2 items-center">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            Report consegna in tempo reale
          </li>
        </ul>
        <Button onClick={handleActivate} disabled={busy} className="w-full max-w-xs">
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {busy ? "Attivazione…" : "Attiva modulo SMS piattaforma"}
        </Button>
      </CardContent>
    </Card>
  );
}
