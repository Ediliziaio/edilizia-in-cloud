/**
 * AutoTopupConfig — Ricarica automatica per wallet, stile GHL.
 *
 * Quando il saldo scende sotto una soglia, addebita un importo fisso sulla
 * carta salvata su Stripe. Fonte di verità: tabella company_auto_topup
 * (letta dal cron auto-topup-trigger ogni 15 min).
 *
 * UX:
 *   - Frase di anteprima in linguaggio naturale ("Quando il saldo … sotto €X,
 *     ricarico €Y")
 *   - Quick-select per soglia e importo (chip)
 *   - Stato carta (collegata / mancante) con CTA
 *   - Ultima ricarica effettuata
 */

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap, AlertCircle, CreditCard, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatEur } from "@/modules/ai-agents/lib/creditCalculator";
import type { WalletType } from "@/hooks/credits/useWallets";

interface Props {
  walletType: WalletType;
  /** Callback per aprire il dialog ricarica (per salvare la carta). */
  onRecharge?: () => void;
}

const LABELS: Record<WalletType, string> = {
  email: "Email Marketing",
  ai: "Agenti AI",
  whatsapp: "WhatsApp",
  render: "Render AI",
};

// Map walletType UI → wallet_type DB (l'auto-topup usa "ai", non "ai_agents")
const DB_WALLET: Record<WalletType, string> = {
  email: "email",
  ai: "ai",
  whatsapp: "whatsapp",
  render: "render",
};

const THRESHOLD_PRESETS = [5, 10, 20];
const AMOUNT_PRESETS = [10, 25, 50, 100];

interface AutoTopupRow {
  enabled: boolean;
  threshold_eur: number;
  topup_amount_eur: number;
  stripe_payment_method_id: string | null;
  last_topup_at: string | null;
}

export function AutoTopupConfig({ walletType, onRecharge }: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const dbWallet = DB_WALLET[walletType];

  const { data: config, isLoading } = useQuery({
    queryKey: ["auto-topup", companyId, dbWallet],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("company_auto_topup" as any)
        .select("enabled, threshold_eur, topup_amount_eur, stripe_payment_method_id, last_topup_at")
        .eq("company_id", companyId)
        .eq("wallet_type", dbWallet)
        .maybeSingle();
      return data as AutoTopupRow | null;
    },
    enabled: !!companyId,
  });

  const [enabled, setEnabled] = useState(true);
  const [threshold, setThreshold] = useState("5");
  const [amount, setAmount] = useState("25");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setThreshold(String(config.threshold_eur));
      setAmount(String(config.topup_amount_eur));
      setDirty(false);
    }
  }, [config]);

  const save = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No company");
      const payload = {
        company_id: companyId,
        wallet_type: dbWallet,
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
      toast.success(`Auto-ricarica ${LABELS[walletType]} salvata`);
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["auto-topup", companyId, dbWallet] });
    },
    onError: (e: Error) => toast.error("Errore: " + e.message),
  });

  const hasCard = Boolean(config?.stripe_payment_method_id);
  const noPaymentMethod = enabled && !hasCard;

  const onField = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setDirty(true);
  };
  const toggle = (v: boolean) => {
    setEnabled(v);
    setDirty(true);
  };

  // Render AI: auto-topup non disponibile (sistema a pacchetti)
  if (walletType === "render") {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Zap className="h-4 w-4 text-amber-600" />
            Auto-ricarica Render AI
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            I render usano pacchetti prepagati: acquistali manualmente dalla
            sezione Ricarica quando servono.
          </p>
        </CardContent>
      </Card>
    );
  }

  const thr = Number(threshold) || 0;
  const amt = Number(amount) || 0;

  return (
    <Card className={cn(enabled && hasCard && "border-emerald-200")}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Zap className={cn("h-4 w-4", enabled ? "text-emerald-600" : "text-muted-foreground")} />
            Auto-ricarica {LABELS[walletType]}
          </span>
          <Badge variant={config?.enabled ? "default" : "outline"} className="text-[10px]">
            {config?.enabled ? "Attiva" : "Disattivata"}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Toggle on/off */}
        <div
          className={cn(
            "flex items-center justify-between gap-2 rounded-lg border p-2.5",
            enabled ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50",
          )}
        >
          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={toggle} disabled={isLoading} />
            <Label className={cn("text-sm font-medium", enabled ? "text-emerald-900" : "text-amber-900")}>
              {enabled ? "Auto-ricarica attiva" : "Auto-ricarica disattivata"}
            </Label>
          </div>
          {!enabled && (
            <span className="text-[11px] text-amber-700">⚠️ Rischio servizio sospeso</span>
          )}
        </div>

        {enabled && (
          <>
            {/* Anteprima frase naturale stile GHL */}
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              Quando il saldo scende sotto{" "}
              <strong className="text-foreground">{formatEur(thr)}</strong>, ricarico
              automaticamente{" "}
              <strong className="text-emerald-700">{formatEur(amt)}</strong> sulla carta salvata.
            </div>

            {/* Soglia */}
            <div>
              <Label className="text-xs">Ricarica quando il saldo è sotto (€)</Label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="1"
                  className="w-24"
                  value={threshold}
                  onChange={(e) => onField(setThreshold)(e.target.value)}
                />
                <div className="flex gap-1">
                  {THRESHOLD_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => onField(setThreshold)(String(p))}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs transition-colors",
                        thr === p
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-input text-muted-foreground hover:bg-muted",
                      )}
                    >
                      €{p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Importo */}
            <div>
              <Label className="text-xs">Importo da ricaricare (€)</Label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  min="5"
                  step="5"
                  className="w-24"
                  value={amount}
                  onChange={(e) => onField(setAmount)(e.target.value)}
                />
                <div className="flex gap-1">
                  {AMOUNT_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => onField(setAmount)(String(p))}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs transition-colors",
                        amt === p
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-input text-muted-foreground hover:bg-muted",
                      )}
                    >
                      €{p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Stato carta */}
            {hasCard ? (
              <div className="flex items-center gap-2 rounded-md bg-emerald-50 p-2 text-xs text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>Carta collegata — la ricarica scatta in automatico.</span>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="space-y-1.5">
                  <p>
                    <strong>Nessuna carta salvata.</strong> Fai una ricarica manuale una volta: la
                    carta viene salvata e riusata per le ricariche automatiche.
                  </p>
                  {onRecharge && (
                    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={onRecharge}>
                      <CreditCard className="h-3 w-3" /> Ricarica e salva carta
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Ultima ricarica */}
            {config?.last_topup_at && (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                Ultima ricarica automatica:{" "}
                {new Intl.DateTimeFormat("it-IT", {
                  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                }).format(new Date(config.last_topup_at))}
              </p>
            )}
          </>
        )}

        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || !dirty}
          size="sm"
          className="w-full"
        >
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {dirty ? "Salva modifiche" : "Configurazione salvata"}
        </Button>
      </CardContent>
    </Card>
  );
}
