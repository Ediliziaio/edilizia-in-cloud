import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calculator,
  CheckCircle2,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  WalletCards,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import {
  DEFAULT_REFERRAL_COMMISSION_POLICY,
  REFERRAL_COMMISSION_POLICY_KEY,
  normalizeReferralCommissionPolicy,
  parseReferralCommissionPolicy,
  simulateReferralCommission,
  type ReferralCommissionPolicy,
} from "@/lib/referralRules";
import { toast } from "sonner";
import type { ReferralFraudLog, ReferralLedgerEntry, ReferralPayout, Referrer } from "@/pages/admin/ReferralDashboard";

interface Props {
  referrers: Referrer[];
  ledger: ReferralLedgerEntry[];
  payouts: ReferralPayout[];
  fraudLogs: ReferralFraudLog[];
}

type NumericPolicyKey = {
  [K in keyof ReferralCommissionPolicy]: ReferralCommissionPolicy[K] extends number ? K : never;
}[keyof ReferralCommissionPolicy];

type BooleanPolicyKey = {
  [K in keyof ReferralCommissionPolicy]: ReferralCommissionPolicy[K] extends boolean ? K : never;
}[keyof ReferralCommissionPolicy];

function toNumber(value: string, fallback = 0) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function policyToJson(policy: ReferralCommissionPolicy) {
  return JSON.stringify(normalizeReferralCommissionPolicy(policy), null, 2);
}

export function ReferralRulesPanel({ referrers, ledger, payouts, fraudLogs }: Props) {
  const queryClient = useQueryClient();
  const [policy, setPolicy] = useState<ReferralCommissionPolicy>(DEFAULT_REFERRAL_COMMISSION_POLICY);
  const [referrerId, setReferrerId] = useState(referrers[0]?.id || "");
  const [mrr, setMrr] = useState("249");
  const [monthsActive, setMonthsActive] = useState("2");
  const [qualityScore, setQualityScore] = useState("85");
  const [errorRate, setErrorRate] = useState("0");
  const [volume, setVolume] = useState("1");
  const [hasFraud, setHasFraud] = useState("no");

  const { data: savedPolicy, isError: policyError, isLoading: policyLoading } = useQuery({
    queryKey: ["platform_settings", REFERRAL_COMMISSION_POLICY_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", REFERRAL_COMMISSION_POLICY_KEY)
        .maybeSingle();
      if (error) throw error;
      return parseReferralCommissionPolicy(data?.value);
    },
    staleTime: 60000,
  });

  useEffect(() => {
    if (savedPolicy) setPolicy(savedPolicy);
  }, [savedPolicy]);

  useEffect(() => {
    if (!referrerId && referrers[0]?.id) setReferrerId(referrers[0].id);
  }, [referrerId, referrers]);

  const savePolicyMutation = useMutation({
    mutationFn: async (nextPolicy: ReferralCommissionPolicy) => {
      const { error } = await supabase.from("platform_settings").upsert(
        {
          key: REFERRAL_COMMISSION_POLICY_KEY,
          value: policyToJson(nextPolicy),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform_settings", REFERRAL_COMMISSION_POLICY_KEY] });
      toast.success("Regole referral salvate");
    },
    onError: (error: unknown) => {
      toast.error("Salvataggio non riuscito", {
        description: error instanceof Error ? error.message : "Controlla i permessi SuperAdmin.",
      });
    },
  });

  const selectedReferrer = referrers.find((referrer) => referrer.id === referrerId) || referrers[0];

  const simulation = useMemo(() => {
    const monthlyRevenue = Math.max(0, toNumber(mrr));
    const base = selectedReferrer?.commission_type === "percentage"
      ? monthlyRevenue * (Number(selectedReferrer.commission_value || 0) / 100)
      : Number(selectedReferrer?.commission_value || 0);

    return simulateReferralCommission({
      baseAmount: base,
      qualityScore: toNumber(qualityScore, 100),
      errorRate: toNumber(errorRate),
      volumeDeals: toNumber(volume, 1),
      monthsActive: toNumber(monthsActive, 0),
      hasFraud: hasFraud === "yes",
      policy,
    });
  }, [errorRate, hasFraud, monthsActive, mrr, policy, qualityScore, selectedReferrer, volume]);

  const updateNumericPolicy = (key: NumericPolicyKey, value: string) => {
    setPolicy((current) => normalizeReferralCommissionPolicy({
      ...current,
      [key]: toNumber(value, current[key]),
    }));
  };

  const updateBooleanPolicy = (key: BooleanPolicyKey, value: string) => {
    setPolicy((current) => ({ ...current, [key]: value === "yes" }));
  };

  const pendingLedger = ledger.filter((row) => row.status === "pending");
  const openPayouts = payouts.filter((payout) => payout.status === "pending" || payout.status === "approved" || payout.status === "processing");
  const policyIsDefault = policyToJson(policy) === policyToJson(DEFAULT_REFERRAL_COMMISSION_POLICY);

  const rules = [
    {
      title: "Attribuzione",
      value: `${policy.attributionWindowDays} giorni`,
      description: "Finestra massima tra click e conversione.",
      icon: CheckCircle2,
    },
    {
      title: "Clawback",
      value: `${policy.clawbackDays} giorni`,
      description: "Blocca payout se il cliente e' troppo recente.",
      icon: ShieldCheck,
    },
    {
      title: "Soglia payout",
      value: formatCurrency(policy.minPayoutAmount),
      description: "Importo minimo prima di pagare il partner.",
      icon: WalletCards,
    },
    {
      title: "Anomalie",
      value: policy.autoBlockFraud ? "Blocco auto" : "Solo alert",
      description: `${fraudLogs.length} log frode disponibili.`,
      icon: SlidersHorizontal,
    },
  ];

  return (
    <div className="space-y-6">
      {policyError && (
        <Alert>
          <SlidersHorizontal className="h-4 w-4" />
          <AlertDescription>
            Policy non caricata da platform_settings: sto usando i valori standard finche' non viene salvata.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        {rules.map((rule) => (
          <Card key={rule.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{rule.title}</CardTitle>
              <rule.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{rule.value}</div>
              <p className="text-xs text-muted-foreground">{rule.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5" />
                Regole commissioni salvabili
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPolicy(DEFAULT_REFERRAL_COMMISSION_POLICY)}
                  disabled={policyIsDefault || savePolicyMutation.isPending}
                >
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  Reset
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => savePolicyMutation.mutate(policy)}
                  disabled={savePolicyMutation.isPending || policyLoading}
                >
                  <Save className="mr-1.5 h-4 w-4" />
                  Salva regole
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Finestra attribuzione (giorni)</Label>
                <Input
                  value={policy.attributionWindowDays}
                  onChange={(event) => updateNumericPolicy("attributionWindowDays", event.target.value)}
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Clawback (giorni)</Label>
                <Input
                  value={policy.clawbackDays}
                  onChange={(event) => updateNumericPolicy("clawbackDays", event.target.value)}
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Soglia payout</Label>
                <Input
                  value={policy.minPayoutAmount}
                  onChange={(event) => updateNumericPolicy("minPayoutAmount", event.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Soglia qualita lead</Label>
                <Input
                  value={policy.qualityThreshold}
                  onChange={(event) => updateNumericPolicy("qualityThreshold", event.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Penalita qualita %</Label>
                <Input
                  value={policy.qualityPenaltyPct}
                  onChange={(event) => updateNumericPolicy("qualityPenaltyPct", event.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Soglia errori %</Label>
                <Input
                  value={policy.errorThresholdPct}
                  onChange={(event) => updateNumericPolicy("errorThresholdPct", event.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Penalita errori %</Label>
                <Input
                  value={policy.errorPenaltyPct}
                  onChange={(event) => updateNumericPolicy("errorPenaltyPct", event.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Bonus da vendite</Label>
                <Input
                  value={policy.volumeBonusMinDeals}
                  onChange={(event) => updateNumericPolicy("volumeBonusMinDeals", event.target.value)}
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Bonus volume %</Label>
                <Input
                  value={policy.volumeBonusPct}
                  onChange={(event) => updateNumericPolicy("volumeBonusPct", event.target.value)}
                  inputMode="decimal"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Frode/anomalie</Label>
                <Select value={policy.autoBlockFraud ? "yes" : "no"} onValueChange={(value) => updateBooleanPolicy("autoBlockFraud", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Blocca payout</SelectItem>
                    <SelectItem value="no">Solo avviso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Termini partner</Label>
                <Select value={policy.requireAcceptedTerms ? "yes" : "no"} onValueChange={(value) => updateBooleanPolicy("requireAcceptedTerms", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Obbligatori</SelectItem>
                    <SelectItem value="no">Non obbligatori</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Dati pagamento</Label>
                <Select value={policy.requirePayoutDetails ? "yes" : "no"} onValueChange={(value) => updateBooleanPolicy("requirePayoutDetails", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Obbligatori</SelectItem>
                    <SelectItem value="no">Non obbligatori</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Simulatore policy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label>Partner</Label>
              <Select value={selectedReferrer?.id || ""} onValueChange={setReferrerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona partner" />
                </SelectTrigger>
                <SelectContent>
                  {referrers.map((referrer) => (
                    <SelectItem key={referrer.id} value={referrer.id}>{referrer.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>MRR cliente</Label>
                <Input value={mrr} onChange={(event) => setMrr(event.target.value)} inputMode="decimal" />
              </div>
              <div className="space-y-1.5">
                <Label>Mesi attivo</Label>
                <Input value={monthsActive} onChange={(event) => setMonthsActive(event.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-1.5">
                <Label>Qualita lead</Label>
                <Input value={qualityScore} onChange={(event) => setQualityScore(event.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-1.5">
                <Label>Errori dati %</Label>
                <Input value={errorRate} onChange={(event) => setErrorRate(event.target.value)} inputMode="decimal" />
              </div>
              <div className="space-y-1.5">
                <Label>Vendite mese</Label>
                <Input value={volume} onChange={(event) => setVolume(event.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-1.5">
                <Label>Anomalia</Label>
                <Select value={hasFraud} onValueChange={setHasFraud}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Si</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Commissione base</p>
                <p className="text-2xl font-bold">{formatCurrency(simulation.baseAmount)}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Commissione finale</p>
                <p className="text-2xl font-bold">{formatCurrency(simulation.finalAmount)}</p>
              </div>
            </div>

            {simulation.adjustments.length > 0 ? (
              <Alert variant={simulation.blocked ? "destructive" : "default"}>
                <SlidersHorizontal className="h-4 w-4" />
                <AlertDescription>
                  {simulation.adjustments.join(" · ")}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>Nessuna rettifica applicata dalla policy.</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Controllo ciclo payout</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Ledger pending</span>
              <Badge variant={pendingLedger.length > 0 ? "outline" : "secondary"}>{pendingLedger.length}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatCurrency(pendingLedger.reduce((sum, row) => sum + Number(row.commission_amount || 0), 0))}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Payout aperti</span>
              <Badge variant={openPayouts.length > 0 ? "outline" : "secondary"}>{openPayouts.length}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatCurrency(openPayouts.reduce((sum, row) => sum + Number(row.amount || 0), 0))}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Frode log</span>
              <Badge variant={fraudLogs.length > 0 ? "destructive" : "secondary"}>{fraudLogs.length}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Le anomalie bloccano il simulatore se il blocco auto e' attivo.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
