/**
 * SmsWalletCard — card SMS nel Portafoglio azienda
 * (/azienda/impostazioni/abbonamento?tab=portafoglio).
 *
 * Mostra: crediti SMS residui, SMS inviati nel mese, spesa del mese,
 * totale storico. Il wallet SMS è un sistema separato dai wallet
 * Email/AI/WhatsApp (tabella sms_wallet, ricarica a pacchetti nel
 * modulo SMS) — la card rimanda lì per la ricarica.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { startOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSmsWallet } from "@/hooks/useSmsWallet";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, ArrowRight } from "lucide-react";

const eur = (v: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(v);

export function SmsWalletCard() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { wallet } = useSmsWallet();

  // Statistiche mese corrente (RLS: solo la propria azienda)
  const { data: stats } = useQuery({
    queryKey: ["sms-wallet-card-stats", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const meseInizio = startOfMonth(new Date()).toISOString();

      const [campagne, transazionali, spesa] = await Promise.all([
        supabase
          .from("sms_log")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .neq("stato", "fallito")
          .gte("created_at", meseInizio),
        supabase
          .from("sms_messages")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("direction", "outbound")
          .neq("status", "failed")
          .gte("created_at", meseInizio),
        supabase
          .from("sms_log")
          .select("costo_cliente")
          .eq("company_id", companyId)
          .neq("stato", "fallito")
          .gte("created_at", meseInizio),
      ]);

      const smsMese = (campagne.count ?? 0) + (transazionali.count ?? 0);
      const spesaMese = (spesa.data ?? []).reduce(
        (s, r) => s + Number((r as { costo_cliente: number | null }).costo_cliente ?? 0),
        0,
      );
      return { smsMese, spesaMese };
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });

  const crediti = Number(wallet?.crediti ?? 0);
  const speso = Number(wallet?.totale_speso ?? 0);

  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/40">
              <MessageSquare className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            </div>
            <span className="text-sm font-semibold">SMS</span>
          </div>
          {crediti <= 0.5 && (
            <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px]">
              Crediti bassi
            </Badge>
          )}
        </div>

        <div>
          <p className="text-2xl font-bold tabular-nums">{eur(crediti)}</p>
          <p className="text-xs text-muted-foreground">crediti residui</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-muted/50 p-2">
            <p className="font-semibold tabular-nums">{(stats?.smsMese ?? 0).toLocaleString("it-IT")}</p>
            <p className="text-muted-foreground">SMS questo mese</p>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <p className="font-semibold tabular-nums">{eur(stats?.spesaMese ?? 0)}</p>
            <p className="text-muted-foreground">spesa del mese</p>
          </div>
        </div>

        {speso > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Totale storico: {eur(speso)}
          </p>
        )}

        <Button asChild size="sm" variant="outline" className="mt-auto w-full">
          <Link to="/azienda/sms">
            Gestisci e ricarica <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
