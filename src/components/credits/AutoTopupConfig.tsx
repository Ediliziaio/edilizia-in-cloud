/**
 * AutoTopupConfig — Configurazione ricarica automatica per ogni wallet.
 *
 * Sostituisce la sezione auto top-up sparsa nel SettingsCredits originale
 * (era solo per email). Ora supporta tutti i wallet con un componente unico.
 *
 * Workflow:
 *   - Soglia EUR sotto cui scatta il top-up
 *   - Importo in EUR da ricaricare
 *   - Toggle on/off
 *   - Salvataggio in tabella company_auto_topup (chiave: company_id + wallet_type)
 *
 * Backend: il cron / webhook stripe legge company_auto_topup e attiva la
 * ricarica via Stripe quando saldo < soglia.
 */

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import type { WalletType } from "@/hooks/credits/useWallets";

interface Props {
  walletType: WalletType;
}

const LABELS: Record<WalletType, string> = {
  email:    "Email Marketing",
  ai:       "Agenti AI",
  whatsapp: "WhatsApp",
  render:   "Render AI",
};

export function AutoTopupConfig({ walletType }: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["auto-topup", companyId, walletType],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("company_auto_topup" as any)
        .select("*")
        .eq("company_id", companyId)
        .eq("wallet_type", walletType)
        .maybeSingle();
      return data as {
        enabled: boolean;
        threshold_eur: number;
        topup_amount_eur: number;
        stripe_payment_method_id: string | null;
      } | null;
    },
    enabled: !!companyId,
  });

  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState("5");
  const [amount, setAmount] = useState("25");

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setThreshold(String(config.threshold_eur));
      setAmount(String(config.topup_amount_eur));
    }
  }, [config]);

  const save = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No company");
      const payload = {
        company_id: companyId,
        wallet_type: walletType,
        enabled,
        threshold_eur: Number(threshold) || 5,
        topup_amount_eur: Number(amount) || 25,
      };
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("company_auto_topup" as any)
        .upsert(payload, { onConflict: "company_id,wallet_type" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Auto top-up ${LABELS[walletType]} salvato`);
      queryClient.invalidateQueries({ queryKey: ["auto-topup", companyId, walletType] });
    },
    onError: (e: Error) => toast.error("Errore: " + e.message),
  });

  const noPaymentMethod = enabled && !config?.stripe_payment_method_id;

  if (walletType === "render") {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Zap className="h-4 w-4 text-amber-600" />
            Auto Top-up Render AI
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            L'auto top-up per i render non è ancora disponibile. Acquista pacchetti
            manualmente dalla sezione Ricarica.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Auto Top-up {LABELS[walletType]}
          </span>
          <Badge
            variant={config?.enabled ? "default" : "outline"}
            className="text-[10px]"
          >
            {config?.enabled ? "Attivo" : "Disattivato"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Quando il saldo scende sotto la soglia, ricarica automaticamente l'importo specificato
          dalla carta salvata su Stripe.
        </p>

        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={isLoading}
          />
          <Label className="text-sm">{enabled ? "Abilitato" : "Disabilitato"}</Label>
        </div>

        {enabled && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Soglia (€)</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                />
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Saldo minimo prima della ricarica
                </p>
              </div>
              <div>
                <Label className="text-xs">Importo ricarica (€)</Label>
                <Input
                  type="number"
                  min="5"
                  step="5"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Quanto addebitare sulla carta
                </p>
              </div>
            </div>

            {noPaymentMethod && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>
                  <strong>Nessun metodo di pagamento salvato.</strong> Effettua una ricarica manuale
                  almeno una volta — la carta verrà salvata e usata per i top-up successivi.
                </p>
              </div>
            )}
          </>
        )}

        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          size="sm"
        >
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salva configurazione
        </Button>
      </CardContent>
    </Card>
  );
}
