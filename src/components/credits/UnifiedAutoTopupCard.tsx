/**
 * UnifiedAutoTopupCard — Ricarica automatica UNICA per tutti i servizi.
 *
 * Una sola regola ("sotto €X ricarica €Y") applicata a email, AI e WhatsApp:
 * il salvataggio scrive la stessa configurazione su company_auto_topup per
 * tutti i wallet ricaricabili. Il cron auto-topup-trigger controlla ogni
 * wallet e ricarica quello che scende sotto la soglia.
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

/** Wallet coperti dalla regola unica (render usa pacchetti, escluso). */
// Dal 07/09/2026 il credito e' UNO SOLO (company_credit_pool): basta una riga
// di ricarica per azienda. Prima erano tre — una per borsellino — e con i saldi
// a zero partivano tutte insieme: tre addebiti da 25 EUR nello stesso minuto.
// La riga si chiama ancora "email" perche' e' quella che l'automatismo legge.
const RIGA_UNICA = "email";

const THRESHOLD_PRESETS = [5, 10, 20];
const AMOUNT_PRESETS = [10, 25, 50, 100];

interface TopupRow {
  wallet_type: string;
  enabled: boolean;
  threshold_eur: number;
  topup_amount_eur: number;
  stripe_payment_method_id: string | null;
  last_topup_at: string | null;
}

interface Props {
  /** Apre il dialog di ricarica manuale (per salvare la carta su Stripe). */
  onRecharge?: () => void;
}

export function UnifiedAutoTopupCard({ onRecharge }: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["auto-topup-unified", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("company_auto_topup" as any)
        .select("wallet_type, enabled, threshold_eur, topup_amount_eur, stripe_payment_method_id, last_topup_at")
        .eq("company_id", companyId!)
        .eq("wallet_type", RIGA_UNICA);
      // `as unknown` di mezzo: con due .eq() il client non riesce a
      // inferire il tipo della riga e restituisce un SelectQueryError.
      return (data ?? []) as unknown as TopupRow[];
    },
  });

  const [enabled, setEnabled] = useState(true);
  const [threshold, setThreshold] = useState("5");
  const [amount, setAmount] = useState("25");
  const [dirty, setDirty] = useState(false);

  // Riga canonica: email (tutte vengono scritte identiche al salvataggio)
  const canonical = rows?.[0] ?? null;
  const hasCard = (rows ?? []).some((r) => r.stripe_payment_method_id);
  const lastTopup = (rows ?? [])
    .map((r) => r.last_topup_at)
    .filter(Boolean)
    .sort()
    .pop() ?? null;

  useEffect(() => {
    if (canonical) {
      setEnabled(canonical.enabled);
      setThreshold(String(canonical.threshold_eur));
      setAmount(String(canonical.topup_amount_eur));
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canonical?.enabled, canonical?.threshold_eur, canonical?.topup_amount_eur]);

  const save = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non disponibile");
      if (enabled && !hasCard) {
        throw new Error("Aggiungi prima una carta (con una ricarica o l'abbonamento): senza carta l'auto-ricarica non può partire.");
      }
      const base = {
        company_id: companyId,
        enabled,
        threshold_eur: Number(threshold) || 5,
        topup_amount_eur: Number(amount) || 25,
      };
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("company_auto_topup" as any)
        .upsert(
          // Una riga sola: ricrearne tre farebbe tornare il triplo addebito.
          [{ ...base, wallet_type: RIGA_UNICA }],
          { onConflict: "company_id,wallet_type" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ricarica automatica salvata");
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["auto-topup-unified", companyId] });
    },
    onError: (e: Error) => toast.error("Errore: " + e.message),
  });

  const thr = Number(threshold) || 0;
  const amt = Number(amount) || 0;

  const onField = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setDirty(true);
  };

  return (
    <Card className={cn("border-l-4", enabled ? "border-l-emerald-500" : "border-l-amber-400")}>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Zap className={cn("h-5 w-5", enabled ? "text-emerald-600" : "text-muted-foreground")} />
            Ricarica automatica
          </span>
          <div className="flex items-center gap-2">
            <Badge variant={canonical?.enabled ? "default" : "outline"}>
              {canonical?.enabled ? "Attiva" : "Disattivata"}
            </Badge>
            <Switch checked={enabled} onCheckedChange={(v) => { setEnabled(v); setDirty(true); }} disabled={isLoading} />
          </div>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Una sola regola per tutti i servizi: Email, AI e WhatsApp. Niente più servizi
          bloccati per saldo esaurito.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {enabled && (
          <>
            {/* Frase naturale */}
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              Quando il saldo di un servizio scende sotto{" "}
              <strong className="text-foreground">{formatEur(thr)}</strong>, ricarico
              automaticamente <strong className="text-emerald-700">{formatEur(amt)}</strong>{" "}
              su quel servizio dalla carta salvata.
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            </div>

            {/* Stato carta */}
            {hasCard ? (
              <div className="flex items-center gap-2 rounded-md bg-emerald-50 p-2 text-xs text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>Carta collegata — le ricariche partono in automatico.</span>
                {lastTopup && (
                  <span className="ml-auto flex items-center gap-1 text-emerald-700">
                    <Clock className="h-3 w-3" />
                    Ultima:{" "}
                    {new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(lastTopup))}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="space-y-1.5">
                  <p>
                    <strong>Nessuna carta salvata.</strong> Fai una ricarica manuale una
                    volta: la carta viene memorizzata e riusata per le ricariche automatiche.
                  </p>
                  {onRecharge && (
                    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={onRecharge}>
                      <CreditCard className="h-3 w-3" /> Ricarica e salva carta
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {!enabled && (
          <p className="text-sm text-amber-700">
            ⚠️ Con l'auto-ricarica spenta i servizi si fermano quando il saldo arriva a zero.
          </p>
        )}

        <Button onClick={() => save.mutate()} disabled={save.isPending || !dirty} size="sm">
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {dirty ? "Salva per tutti i servizi" : "Configurazione salvata"}
        </Button>
      </CardContent>
    </Card>
  );
}
