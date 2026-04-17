/**
 * SuperAdmin → CompanyDetail → "Email" tab.
 *
 * GHL-style per-company email control center. From here a super_admin can:
 *   • See the company's active plan and the monthly email quota + overage price
 *     included by that plan.
 *   • See current-month usage, remaining quota, and wallet balance (email_credits).
 *   • Override the monthly limit (cap) and the overage price for that specific company.
 *   • Flag the company as "Email gratuite" (no wallet deduction even when over quota).
 *   • Browse the most recent email delivery log entries filtered to this company.
 *
 * Data sources (single source of truth):
 *   - RPC `get_company_email_quota(company_id)`  → limit / price / usage / wallet
 *   - RPC `get_company_email_usage_breakdown(company_id, months)` → monthly trend
 *   - Table `email_delivery_log`                 → recent per-recipient log
 *   - Table `company_billing_overrides`          → override write target (service='email')
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Mail,
  Package,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Wallet,
  Shield,
  Save,
  Info,
  AtSign,
  RefreshCw,
  Trash2,
} from "lucide-react";

type EmailQuota = {
  company_id: string;
  plan_id: string | null;
  plan_name: string | null;
  plan_slug: string | null;
  plan_limit: number | null;
  plan_price_eur: number | null;
  override_limit: number | null;
  override_price_eur: number | null;
  is_free: boolean;
  effective_limit: number;
  effective_price_eur: number;
  sent_this_month: number;
  remaining: number;
  over_quota: boolean;
  wallet_balance_eur: number;
  wallet_sends_blocked: boolean;
  computed_at: string;
};

type UsageBreakdown = {
  per_month: Array<{
    month: string;
    total: number;
    delivered: number;
    failed: number;
    charged_eur: number;
  }> | null;
  per_stream_current_month: Array<{
    stream: string;
    total: number;
    charged_eur: number;
  }> | null;
};

interface Props {
  companyId: string;
  companyName: string;
}

const fmtEur = (n: number | null | undefined) =>
  `€${(Number(n ?? 0)).toLocaleString("it-IT", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })}`;

const fmtEurShort = (n: number | null | undefined) =>
  `€${(Number(n ?? 0)).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtInt = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("it-IT");

const fmtLimit = (n: number | null | undefined) =>
  n === -1 ? "Illimitato" : n == null ? "—" : fmtInt(n);

const statusBadge = (s: string) => {
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
    sent:      { variant: "default",     icon: <CheckCircle2 className="h-3 w-3" /> },
    delivered: { variant: "default",     icon: <CheckCircle2 className="h-3 w-3" /> },
    queued:    { variant: "secondary",   icon: <Clock className="h-3 w-3" /> },
    failed:    { variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
    bounced:   { variant: "destructive", icon: <AlertTriangle className="h-3 w-3" /> },
  };
  const cfg = map[s] ?? { variant: "outline" as const, icon: null };
  return (
    <Badge variant={cfg.variant} className="gap-1 capitalize text-xs">
      {cfg.icon}
      {s}
    </Badge>
  );
};

export function CompanyEmailTab({ companyId, companyName }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── Quota via RPC ─────────────────────────────────────────────────────────
  const {
    data: quota,
    isLoading: quotaLoading,
    refetch: refetchQuota,
  } = useQuery<EmailQuota>({
    queryKey: ["company-email-quota", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_company_email_quota" as never,
        { p_company_id: companyId } as never
      );
      if (error) throw error;
      return data as EmailQuota;
    },
    staleTime: 30_000,
  });

  // ── Usage breakdown (last 3 months + per-stream current month) ───────────
  const { data: breakdown } = useQuery<UsageBreakdown>({
    queryKey: ["company-email-usage-breakdown", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_company_email_usage_breakdown" as never,
        { p_company_id: companyId, p_months: 3 } as never
      );
      if (error) throw error;
      return (data ?? { per_month: [], per_stream_current_month: [] }) as UsageBreakdown;
    },
    staleTime: 60_000,
  });

  // ── Custom sender domain (Sprint 7) ──────────────────────────────────────
  const { data: domainData, refetch: refetchDomain } = useQuery({
    queryKey: ["company-email-domain", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-email-domain", {
        body: { action: "get_status", company_id: companyId },
      });
      if (error) throw error;
      return data as {
        domain: null | {
          id: string;
          domain: string;
          from_email: string;
          from_name: string | null;
          ee_spf_verified: boolean;
          ee_dkim_verified: boolean;
          ee_tracking_verified: boolean;
          sg_cname_1_valid: boolean;
          sg_cname_2_valid: boolean;
          sg_cname_3_valid: boolean;
          is_verified: boolean;
          is_active: boolean;
          verified_at: string | null;
        };
      };
    },
    staleTime: 30_000,
  });

  const reverifyDomainMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-email-domain", {
        body: { action: "verify_domain", company_id: companyId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Verifica DNS rilanciata");
      refetchDomain();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error("Errore verifica dominio", { description: msg });
    },
  });

  const toggleDomainActiveMutation = useMutation({
    mutationFn: async (active: boolean) => {
      const { error } = await supabase
        .from("company_email_domains")
        .update({ is_active: active })
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: (_, active) => {
      toast.success(active ? "Dominio custom riattivato" : "Dominio custom disattivato");
      refetchDomain();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error("Errore aggiornamento stato", { description: msg });
    },
  });

  const removeDomainMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-email-domain", {
        body: { action: "remove_domain", company_id: companyId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Dominio custom rimosso");
      refetchDomain();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error("Errore rimozione dominio", { description: msg });
    },
  });

  // ── Delivery log (last 20 for this company) ──────────────────────────────
  const { data: recentLog = [], isLoading: logLoading } = useQuery({
    queryKey: ["company-email-delivery-log", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_delivery_log")
        .select("id, recipient, subject, status, provider, template_type, sent_at, error_message")
        .eq("company_id", companyId)
        .order("sent_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  // ── Local form state (prefilled from quota) ──────────────────────────────
  const [isFree, setIsFree] = useState(false);
  const [customLimit, setCustomLimit] = useState<string>("");
  const [customPrice, setCustomPrice] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!quota) return;
    setIsFree(quota.is_free);
    setCustomLimit(
      quota.override_limit == null ? "" : String(quota.override_limit)
    );
    setCustomPrice(
      quota.override_price_eur == null
        ? ""
        : String(quota.override_price_eur)
    );
  }, [quota]);

  // ── Mutation: upsert override into company_billing_overrides ─────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Utente non autenticato");
      const parsedLimit =
        customLimit.trim() === "" ? null : parseInt(customLimit, 10);
      if (parsedLimit != null && Number.isNaN(parsedLimit)) {
        throw new Error("Limite mensile non valido");
      }
      const parsedPrice =
        customPrice.trim() === "" ? null : Number(customPrice);
      if (parsedPrice != null && Number.isNaN(parsedPrice)) {
        throw new Error("Prezzo per email non valido");
      }

      const payload: Record<string, unknown> = {
        company_id: companyId,
        service: "email",
        is_enabled: true,
        is_free:  isFree,
        custom_monthly_email_limit: parsedLimit,
        price_per_unit_eur:         parsedPrice,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("company_billing_overrides" as never)
        .upsert(payload as never, {
          onConflict: "company_id,service",
        } as never);
      if (error) throw error;

      // Audit trail
      await supabase.from("company_flag_audit_log").insert({
        company_id: companyId,
        changed_by: user.id,
        field_name: "email_overrides",
        new_value: {
          is_free: isFree,
          custom_monthly_email_limit: parsedLimit,
          price_per_unit_eur: parsedPrice,
        },
        reason: "Override email da SuperAdmin (CompanyEmailTab)",
      });
    },
    onMutate: () => setSaving(true),
    onSuccess: () => {
      toast.success("Override email salvato");
      queryClient.invalidateQueries({ queryKey: ["company-email-quota", companyId] });
      queryClient.invalidateQueries({ queryKey: ["company-email-usage-breakdown", companyId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error("Errore nel salvataggio", { description: msg });
    },
    onSettled: () => setSaving(false),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("company_billing_overrides" as never)
        .delete()
        .eq("company_id", companyId)
        .eq("service" as never, "email");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Override rimosso — l'azienda torna al piano standard");
      refetchQuota();
      queryClient.invalidateQueries({ queryKey: ["company-email-quota", companyId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error("Errore rimozione override", { description: msg });
    },
  });

  if (quotaLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!quota) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Impossibile caricare la quota email per questa azienda.</AlertDescription>
      </Alert>
    );
  }

  const hasActiveOverride =
    quota.override_limit != null ||
    quota.override_price_eur != null ||
    quota.is_free;

  const usagePct =
    quota.effective_limit === -1
      ? 0
      : quota.effective_limit > 0
      ? Math.min(100, (quota.sent_this_month / quota.effective_limit) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* ── Header card: plan + wallet ───────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Sistema Email — {companyName}</CardTitle>
                <CardDescription className="text-sm">
                  Gestione limiti mensili, prezzo overage e log di consegna.
                </CardDescription>
              </div>
            </div>
            {hasActiveOverride && (
              <Badge variant="outline" className="border-amber-400 text-amber-700">
                <Shield className="h-3 w-3 mr-1" />
                Override attivi
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Package className="h-3.5 w-3.5" /> Piano attuale
              </div>
              <div className="text-base font-semibold">
                {quota.plan_name ?? "Nessuno"}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <TrendingUp className="h-3.5 w-3.5" /> Limite effettivo
              </div>
              <div className="text-base font-semibold">
                {fmtLimit(quota.effective_limit)}
                <span className="text-xs text-muted-foreground font-normal ml-1">
                  /mese
                </span>
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Mail className="h-3.5 w-3.5" /> Prezzo overage
              </div>
              <div className="text-base font-semibold">
                {quota.is_free ? (
                  <span className="text-emerald-700">Gratis</span>
                ) : (
                  fmtEur(quota.effective_price_eur)
                )}
                {!quota.is_free && (
                  <span className="text-xs text-muted-foreground font-normal ml-1">/email</span>
                )}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Wallet className="h-3.5 w-3.5" /> Saldo wallet
              </div>
              <div className="text-base font-semibold">
                {fmtEurShort(quota.wallet_balance_eur)}
                {quota.wallet_sends_blocked && (
                  <Badge variant="destructive" className="ml-2 text-xs">
                    Bloccato
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Usage this month ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Utilizzo mese corrente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-bold">{fmtInt(quota.sent_this_month)}</span>
              <span className="text-sm text-muted-foreground ml-2">
                /{" "}
                {quota.effective_limit === -1
                  ? "∞"
                  : fmtInt(quota.effective_limit)}{" "}
                email inviate
              </span>
            </div>
            {quota.over_quota && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                Oltre quota — addebito attivo
              </Badge>
            )}
          </div>
          {quota.effective_limit !== -1 && (
            <Progress
              value={usagePct}
              className={usagePct >= 90 ? "bg-red-100" : usagePct >= 70 ? "bg-amber-100" : ""}
            />
          )}
          <div className="text-xs text-muted-foreground">
            {quota.effective_limit === -1 ? (
              <>Piano con email transazionali illimitate.</>
            ) : quota.over_quota ? (
              <>
                Quota esaurita. Ogni ulteriore email costa{" "}
                <strong>{fmtEur(quota.effective_price_eur)}</strong> e viene addebitata sul wallet.
              </>
            ) : (
              <>
                Restano <strong>{fmtInt(quota.remaining)}</strong> email gratuite questo mese.
              </>
            )}
          </div>

          {/* Per-stream breakdown */}
          {breakdown?.per_stream_current_month && breakdown.per_stream_current_month.length > 0 && (
            <div className="pt-2">
              <Separator className="mb-3" />
              <div className="text-xs font-medium mb-2">Per tipologia (mese corrente)</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {breakdown.per_stream_current_month.map((s) => (
                  <div key={s.stream} className="rounded border p-2 bg-background">
                    <div className="text-xs text-muted-foreground capitalize">
                      {s.stream === "transactional"
                        ? "Transazionali"
                        : s.stream === "marketing"
                        ? "Marketing"
                        : s.stream}
                    </div>
                    <div className="text-sm font-semibold">{fmtInt(s.total)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {fmtEurShort(s.charged_eur)} addebitati
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Override form ────────────────────────────────────────────────── */}
      <Card className="border-amber-200/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-amber-600" />
            Override SuperAdmin
          </CardTitle>
          <CardDescription className="text-xs">
            Sovrascrivi il limite mensile e il prezzo per email di questa azienda.
            Lascia vuoto un campo per ripristinare il default del piano.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3 bg-background">
            <div>
              <div className="text-sm font-medium flex items-center gap-2">
                Email gratuite
                {isFree && <Badge className="bg-emerald-100 text-emerald-800">Attivo</Badge>}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Nessun addebito anche al superamento della quota (utile per demo / trial).
              </div>
            </div>
            <Switch checked={isFree} onCheckedChange={setIsFree} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Limite mensile custom
                <span className="text-muted-foreground font-normal ml-1">
                  (default: {fmtLimit(quota.plan_limit)})
                </span>
              </Label>
              <Input
                type="number"
                placeholder={quota.plan_limit != null ? String(quota.plan_limit) : "500"}
                value={customLimit}
                onChange={(e) => setCustomLimit(e.target.value)}
                className="h-9"
              />
              <p className="text-[11px] text-muted-foreground">
                -1 = illimitato. Vuoto = usa piano.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Prezzo per email (overage)
                <span className="text-muted-foreground font-normal ml-1">
                  (default: {fmtEur(quota.plan_price_eur)})
                </span>
              </Label>
              <Input
                type="number"
                step="0.0001"
                placeholder={
                  quota.plan_price_eur != null ? String(quota.plan_price_eur) : "0.0015"
                }
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                className="h-9"
              />
              <p className="text-[11px] text-muted-foreground">
                EUR per email addebitata dopo la quota. Vuoto = usa piano.
              </p>
            </div>
          </div>

          <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
            <Info className="h-4 w-4 text-blue-700" />
            <AlertDescription className="text-xs text-blue-900 dark:text-blue-200">
              Le modifiche entrano in vigore immediatamente. L'override viene salvato su{" "}
              <code className="text-[11px] bg-blue-100 dark:bg-blue-900 px-1 rounded">
                company_billing_overrides (service='email')
              </code>{" "}
              e tracciato nell'audit log.
            </AlertDescription>
          </Alert>

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => resetMutation.mutate()}
              disabled={!hasActiveOverride || resetMutation.isPending || saving}
              className="text-muted-foreground hover:text-destructive"
            >
              {resetMutation.isPending && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
              Rimuovi override
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvataggio…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salva override
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Custom sender domain (Sprint 7) ──────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <AtSign className="h-4 w-4" />
                Dominio email custom
              </CardTitle>
              <CardDescription className="text-xs">
                Il cliente invia email dal proprio dominio (es. <code className="text-[11px]">noreply@tuaazienda.it</code>)
                una volta verificati i record DNS su Elastic Email + SendGrid.
              </CardDescription>
            </div>
            {domainData?.domain && (
              domainData.domain.is_verified && domainData.domain.is_active ? (
                <Badge className="bg-green-600 hover:bg-green-700 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Attivo
                </Badge>
              ) : domainData.domain.is_verified ? (
                <Badge variant="outline">Verificato, disattivato</Badge>
              ) : (
                <Badge variant="outline" className="text-amber-700 border-amber-400">
                  <Clock className="h-3 w-3 mr-1" /> Verifica DNS pendente
                </Badge>
              )
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!domainData?.domain ? (
            <div className="text-xs text-muted-foreground">
              Nessun dominio custom configurato. L'azienda può registrarne uno dalla sezione{" "}
              <em>Impostazioni → Dominio Email</em> del proprio portale.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border p-3 bg-muted/20 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground mb-0.5">Dominio</div>
                  <div className="font-mono font-semibold">{domainData.domain.domain}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Mittente</div>
                  <div className="font-mono">
                    {domainData.domain.from_name
                      ? `${domainData.domain.from_name} <${domainData.domain.from_email}@${domainData.domain.domain}>`
                      : `${domainData.domain.from_email}@${domainData.domain.domain}`}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                {([
                  ["EE SPF", domainData.domain.ee_spf_verified],
                  ["EE DKIM", domainData.domain.ee_dkim_verified],
                  ["EE Track", domainData.domain.ee_tracking_verified],
                  ["SG CNAME 1", domainData.domain.sg_cname_1_valid],
                  ["SG CNAME 2", domainData.domain.sg_cname_2_valid],
                  ["SG CNAME 3", domainData.domain.sg_cname_3_valid],
                ] as Array<[string, boolean]>).map(([label, ok]) => (
                  <div
                    key={label}
                    className={`rounded border px-2 py-1.5 flex items-center gap-1.5 ${
                      ok ? "bg-green-50 border-green-200 text-green-900" : "bg-amber-50 border-amber-200 text-amber-900"
                    }`}
                  >
                    {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    <span className="text-[11px]">{label}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap pt-2">
                <div className="flex items-center gap-3">
                  <Label className="text-xs flex items-center gap-2">
                    <Switch
                      checked={domainData.domain.is_active}
                      onCheckedChange={(v) => toggleDomainActiveMutation.mutate(v)}
                      disabled={!domainData.domain.is_verified || toggleDomainActiveMutation.isPending}
                    />
                    Dominio attivo
                  </Label>
                  {!domainData.domain.is_verified && (
                    <span className="text-[11px] text-muted-foreground">
                      (attivabile solo dopo la verifica DNS completa)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => reverifyDomainMutation.mutate()}
                    disabled={reverifyDomainMutation.isPending}
                  >
                    {reverifyDomainMutation.isPending ? (
                      <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-2" />
                    )}
                    Re-verifica DNS
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeDomainMutation.mutate()}
                    disabled={removeDomainMutation.isPending}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3 mr-2" />
                    Rimuovi
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Monthly trend table ──────────────────────────────────────────── */}
      {breakdown?.per_month && breakdown.per_month.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Storico ultimi 3 mesi</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mese</TableHead>
                  <TableHead className="text-right">Inviate</TableHead>
                  <TableHead className="text-right">Consegnate</TableHead>
                  <TableHead className="text-right">Fallite</TableHead>
                  <TableHead className="text-right">Addebitato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breakdown.per_month.map((row) => (
                  <TableRow key={row.month}>
                    <TableCell className="font-medium">
                      {new Date(row.month).toLocaleDateString("it-IT", {
                        month: "long",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-right">{fmtInt(row.total)}</TableCell>
                    <TableCell className="text-right text-emerald-700">
                      {fmtInt(row.delivered)}
                    </TableCell>
                    <TableCell className="text-right text-red-700">
                      {fmtInt(row.failed)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {fmtEurShort(row.charged_eur)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Recent delivery log ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Ultime consegne
          </CardTitle>
          <CardDescription className="text-xs">
            Ultimi 20 invii email per questa azienda (qualsiasi stream).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {logLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : recentLog.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              Nessuna email registrata per questa azienda.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">Quando</TableHead>
                  <TableHead>Destinatario</TableHead>
                  <TableHead>Oggetto</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead className="w-[110px]">Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLog.map((row: {
                  id: string;
                  recipient: string;
                  subject: string | null;
                  status: string;
                  provider: string | null;
                  template_type: string | null;
                  sent_at: string;
                  error_message: string | null;
                }) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(row.sent_at).toLocaleString("it-IT", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate" title={row.recipient}>
                      {row.recipient}
                    </TableCell>
                    <TableCell className="text-xs max-w-[260px] truncate" title={row.subject ?? ""}>
                      {row.subject ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.template_type ?? "—"}
                    </TableCell>
                    <TableCell>{statusBadge(row.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
