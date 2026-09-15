/**
 * Offerta dell'add-on WhatsApp Business: prezzo, piani che lo includono e il
 * pagamento. Una sola, mostrata dove si scopre che manca: nella vetrina «Demo»
 * dell'area WhatsApp (UnlockFeatureDialog), nella pagina di upgrade (anche al
 * ritorno da Stripe) e nel dialog aperto da un 402 del server
 * (PaymentGateDialog).
 *
 * Prezzo e soglia non sono scritti qui: vengono da platform_feature_flags
 * (chiave "whatsapp") e dai piani che la includono.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useAttivaAddonWhatsApp } from "@/hooks/useBilling";
import { formatCurrency } from "@/lib/formatters";
import { isMobileAppRuntime } from "@/lib/mobile/platform";
import { queryKeys } from "@/lib/queryKeys";

/** Chi può comprarlo: lo stesso controllo del server (assertMetaCompanyAdminAccess). */
const RUOLI_ACQUISTO = new Set(["company_admin", "super_admin"]);

/** Dopo il pagamento il webhook di Stripe accende l'add-on: lo si ricontrolla ogni 3 s, per un minuto. */
const INTERVALLO_CONTROLLO_MS = 3000;
const CONTROLLI_MASSIMI = 20;

interface Props {
  /** Di ritorno da Stripe: il pagamento è fatto, si aspetta che l'add-on risulti acceso. */
  inAttesaDiAttivazione?: boolean;
  /** Chiamata quando, dopo il pagamento, l'add-on risulta acceso. */
  onAttivo?: () => void;
}

export function AddonWhatsAppOfferta({ inAttesaDiAttivazione = false, onAttivo }: Props) {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const accesso = useFeatureAccess("whatsapp");
  const attiva = useAttivaAddonWhatsApp();
  const [controlli, setControlli] = useState(0);
  const avvisato = useRef(false);

  const { data: offerta } = useQuery({
    queryKey: ["addon-whatsapp-offerta"],
    queryFn: async () => {
      const { data: flag, error } = await supabase
        .from("platform_feature_flags")
        .select("price_per_month, plans_included")
        .eq("key", "whatsapp")
        .maybeSingle();
      if (error) throw error;
      const inclusi = flag?.plans_included ?? [];
      let daPiano: number | null = null;
      if (inclusi.length > 0) {
        const { data: piani } = await supabase
          .from("subscription_plans")
          .select("price_monthly")
          .in("slug", inclusi);
        const prezzi = (piani ?? []).map((p) => Number(p.price_monthly)).filter((n) => n > 0);
        daPiano = prezzi.length > 0 ? Math.min(...prezzi) : null;
      }
      return {
        prezzoMese: flag?.price_per_month != null ? Number(flag.price_per_month) : null,
        daPiano,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  // Il super admin vede tutto per bypass: per lui "acceso" non dice niente dell'azienda.
  const attivo = accesso.isEnabled && accesso.source !== "bypass";

  useEffect(() => {
    if (!inAttesaDiAttivazione || attivo || controlli >= CONTROLLI_MASSIMI) return;
    const timer = window.setTimeout(() => {
      // Tutte le risoluzioni in cache, di qualunque azienda: la chiave per azienda
      // può non coincidere con quella che ha usato useFeatureAccess.
      void queryClient.invalidateQueries({ queryKey: [queryKeys.featureFlags.companyResolved(undefined)[0]] });
      void queryClient.invalidateQueries({ queryKey: ["feature-access"] });
      setControlli((n) => n + 1);
    }, INTERVALLO_CONTROLLO_MS);
    return () => window.clearTimeout(timer);
  }, [inAttesaDiAttivazione, attivo, controlli, queryClient]);

  useEffect(() => {
    if (!inAttesaDiAttivazione || !attivo || avvisato.current) return;
    avvisato.current = true;
    toast.success("WhatsApp Business è attivo: ora puoi collegare i numeri.");
    onAttivo?.();
  }, [inAttesaDiAttivazione, attivo, onAttivo]);

  if (attivo) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">WhatsApp Business è attivo per la tua azienda.</p>
        <Button asChild className="w-full" data-allow-in-preview="true">
          <Link to="/azienda/whatsapp">
            <MessageCircle className="mr-2 h-4 w-4" />
            Vai a WhatsApp
          </Link>
        </Button>
      </div>
    );
  }

  if (inAttesaDiAttivazione) {
    const lento = controlli >= CONTROLLI_MASSIMI;
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 text-sm">
          {lento ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          ) : (
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          )}
          <p>
            {lento
              ? "Il pagamento risulta fatto, ma l'attivazione sta richiedendo più del solito. Ricontrolla tra un minuto; se non si sblocca scrivi all'assistenza."
              : "Pagamento ricevuto: sto attivando WhatsApp Business…"}
          </p>
        </div>
        {lento && (
          <Button variant="outline" className="w-full" onClick={() => setControlli(0)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Ricontrolla
          </Button>
        )}
      </div>
    );
  }

  const puoAcquistare = !!role && RUOLI_ACQUISTO.has(role);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-muted/40 p-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold">Add-on WhatsApp Business</p>
          {offerta?.prezzoMese != null && (
            <p className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(offerta.prezzoMese)}/mese</p>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Collega i numeri WhatsApp Business dell'azienda: messaggi, broadcast, notifiche e risposte dal CRM.
          {offerta?.daPiano != null && ` Incluso nei piani da ${formatCurrency(offerta.daPiano)}/mese.`}
        </p>
      </div>

      {isMobileAppRuntime ? (
        <p className="text-sm text-muted-foreground">
          L'add-on si attiva dall'area riservata sul sito web, non dall'app.
        </p>
      ) : puoAcquistare ? (
        <Button
          className="w-full"
          onClick={() => attiva.mutate()}
          disabled={attiva.isPending}
          data-allow-in-preview="true"
        >
          {attiva.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <MessageCircle className="mr-2 h-4 w-4" />
          )}
          {attiva.isPending ? "Apertura del pagamento…" : "Attiva l'add-on"}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          Chiedi all'amministratore della tua azienda di attivare l'add-on.
        </p>
      )}
    </div>
  );
}
