import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Settings2, AlertTriangle, CheckCircle2, Clock, Mail,
  Ban, RefreshCw, ChevronRight,
} from "lucide-react";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────

interface DunningStep {
  day: number;
  label: string;
  subject: string;
  description: string;
  color: string;
  isAction?: boolean;
}

interface DunningAttempt {
  id: string;
  company_id: string;
  dunning_day: string;
  status: string;
  sent_at: string | null;
  retry_count: number;
  permanently_failed: boolean;
  error_message: string | null;
  companies?: { name: string; email: string } | null;
}

// ─── Constants ────────────────────────────────────────────

const DUNNING_SEQUENCE: DunningStep[] = [
  {
    day: 0,
    label: "Giorno 0 — Primo avviso",
    subject: "Il tuo abbonamento è scaduto",
    description: "Email soft: abbonamento scaduto, invito a rinnovare. Triggered immediatamente da Stripe payment_failed.",
    color: "text-blue-600 bg-blue-50 border-blue-200",
  },
  {
    day: 3,
    label: "Giorno 3 — Urgenza",
    subject: "Rinnova il tuo abbonamento — accesso a rischio",
    description: "Email urgente: accesso sospeso a breve se non si rinnova entro 11 giorni.",
    color: "text-yellow-600 bg-yellow-50 border-yellow-200",
  },
  {
    day: 7,
    label: "Giorno 7 — Ultimo avviso",
    subject: "Ultimo avviso: account verrà sospeso tra 7 giorni",
    description: "Email critica: sospensione imminente in 7 giorni.",
    color: "text-orange-600 bg-orange-50 border-orange-200",
  },
  {
    day: 14,
    label: "Giorno 14 — Sospensione automatica",
    subject: "Account sospeso",
    description: "Account sospeso automaticamente. Super admin notificato.",
    color: "text-red-600 bg-red-50 border-red-200",
    isAction: true,
  },
];

const TRIAL_SEQUENCE = [
  {
    key: "trial_expiring_3d",
    label: "Trial — 3 giorni prima della scadenza",
    subject: "Il tuo trial scade tra 3 giorni",
    description: "Reminder upsell per trial in scadenza.",
    color: "text-purple-600 bg-purple-50 border-purple-200",
  },
  {
    key: "trial_expired_email",
    label: "Trial — Scaduto",
    subject: "Il tuo periodo di prova è terminato",
    description: "Invito a scegliere un piano. Trigger: cron giornaliero.",
    color: "text-pink-600 bg-pink-50 border-pink-200",
  },
];

// ─── Hooks ────────────────────────────────────────────────

function useDunningAttempts() {
  return useQuery({
    queryKey: ["admin", "dunning-attempts"],
    queryFn: async (): Promise<DunningAttempt[]> => {
      const { data, error } = await (supabase
        .from("dunning_attempts" as never)
        .select("*, companies(name, email)")
        .order("sent_at", { ascending: false })
        .limit(100) as unknown as Promise<{ data: DunningAttempt[] | null; error: { message: string } | null }>);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

function useDunningStats() {
  return useQuery({
    queryKey: ["admin", "dunning-stats"],
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data, error } = await (supabase
        .from("dunning_attempts" as never)
        .select("status, permanently_failed")
        .gte("sent_at" as never, sevenDaysAgo) as unknown as Promise<{
          data: Array<{ status: string; permanently_failed: boolean }> | null;
          error: { message: string } | null;
        }>);
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      return {
        total: rows.length,
        sent: rows.filter((r) => r.status === "sent").length,
        failed: rows.filter((r) => r.status === "failed").length,
        permanent: rows.filter((r) => r.permanently_failed).length,
      };
    },
    staleTime: 60_000,
  });
}

function useDunningSettings() {
  return useQuery({
    queryKey: ["admin", "dunning-settings"],
    queryFn: async () => {
      const keys = ["dunning_grace_days", "dunning_max_retries", "dunning_retry_delay_hours"];
      const { data, error } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", keys);
      if (error) throw new Error(error.message);
      const map: Record<string, string> = {};
      for (const row of data ?? []) {
        const r = row as { key: string; value: string };
        map[r.key] = r.value;
      }
      return {
        graceDays: map["dunning_grace_days"] ?? "14",
        maxRetries: map["dunning_max_retries"] ?? "3",
        retryDelayHours: map["dunning_retry_delay_hours"] ?? "2",
      };
    },
    staleTime: 60_000,
  });
}

// ─── Status Badge ─────────────────────────────────────────

function StatusBadge({ status, permanent }: { status: string; permanent?: boolean }) {
  if (permanent) return <Badge variant="destructive">Fallito definitivo</Badge>;
  switch (status) {
    case "sent": return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-300">Inviato</Badge>;
    case "failed": return <Badge variant="destructive">Fallito</Badge>;
    case "skipped": return <Badge variant="secondary">Saltato</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

// ─── Main Page ────────────────────────────────────────────

export default function AdminDunningConfig() {
  const { permissions } = useSuperAdminPermissions();
  const qc = useQueryClient();
  const { data: stats } = useDunningStats();
  const { data: attempts = [], isLoading: attemptsLoading } = useDunningAttempts();
  const { data: settings, isLoading: settingsLoading } = useDunningSettings();
  const [settingsForm, setSettingsForm] = useState<Record<string, string>>({});

  const saveSettings = useMutation({
    mutationFn: async (updates: Record<string, string>) => {
      const rows = Object.entries(updates).map(([key, value]) => ({
        key,
        value,
        label: key,
        category: "dunning",
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from("platform_settings")
        .upsert(rows, { onConflict: "key" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Parametri dunning salvati");
      setSettingsForm({});
      void qc.invalidateQueries({ queryKey: ["admin", "dunning-settings"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const triggerDunning = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-dunning`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
          body: JSON.stringify({ triggered_by: "manual_admin" }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<{ emails_sent?: number; processed?: number }>;
    },
    onSuccess: (data) => {
      toast.success(`Dunning eseguito: ${data.emails_sent ?? 0} email inviate`);
      void qc.invalidateQueries({ queryKey: ["admin", "dunning-attempts"] });
      void qc.invalidateQueries({ queryKey: ["admin", "dunning-stats"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const permanentFails = attempts.filter((a) => a.permanently_failed);

  // Guard DOPO tutti gli hooks (Rules of Hooks)
  if (!permissions.billing_write) return <AccessDenied />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dunning — Recupero Pagamenti</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Sequenza email automatica per abbonamenti scaduti e trial esauriti
          </p>
        </div>
        <Button
          onClick={() => triggerDunning.mutate()}
          disabled={triggerDunning.isPending}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${triggerDunning.isPending ? "animate-spin" : ""}`} />
          Esegui ora
        </Button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Email inviate (7gg)", value: stats?.sent ?? "—", danger: false },
          { label: "Fallite (7gg)", value: stats?.failed ?? "—", danger: (stats?.failed ?? 0) > 0 },
          { label: "Definitivamente fallite", value: stats?.permanent ?? "—", danger: (stats?.permanent ?? 0) > 0 },
          { label: "Totale tentativi (7gg)", value: stats?.total ?? "—", danger: false },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
            <p className={`text-2xl font-bold mt-1 ${kpi.danger ? "text-destructive" : ""}`}>
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      {permanentFails.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {permanentFails.length} email fallite definitivamente — verifica il provider email e risolvi manualmente.
          </AlertDescription>
        </Alert>
      )}

      {/* Sequenza Dunning Abbonamenti */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Sequenza Abbonamenti Scaduti
          </CardTitle>
          <CardDescription>
            Avviata automaticamente da Stripe webhook (invoice.payment_failed) e dal cron giornaliero
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {DUNNING_SEQUENCE.map((step, idx) => (
            <div key={step.day}>
              <div className={`flex items-start gap-3 p-3 rounded-lg border ${step.color}`}>
                <div className="mt-0.5">
                  {step.isAction ? <Ban className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{step.label}</span>
                    {step.day === 0 && (
                      <Badge variant="outline" className="text-xs">Trigger: payment_failed</Badge>
                    )}
                    {step.isAction && (
                      <Badge variant="outline" className="text-xs border-red-300">Azione automatica</Badge>
                    )}
                  </div>
                  <p className="text-xs opacity-75 mt-0.5">{step.description}</p>
                  {!step.isAction && (
                    <p className="text-xs font-mono opacity-60 mt-0.5">"{step.subject}"</p>
                  )}
                </div>
                {idx < DUNNING_SEQUENCE.length - 1 && (
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    +{DUNNING_SEQUENCE[idx + 1].day - step.day}gg
                  </Badge>
                )}
              </div>
              {idx < DUNNING_SEQUENCE.length - 1 && (
                <div className="flex justify-center my-1">
                  <ChevronRight className="h-3.5 w-3.5 rotate-90 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}

          <Separator className="my-4" />

          <p className="text-sm font-medium flex items-center gap-2 mb-3">
            <Mail className="h-4 w-4" /> Sequenza Trial
          </p>
          <div className="space-y-2">
            {TRIAL_SEQUENCE.map((step) => (
              <div key={step.key} className={`flex items-start gap-3 p-3 rounded-lg border ${step.color}`}>
                <Mail className="h-4 w-4 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-sm">{step.label}</p>
                  <p className="text-xs opacity-75">{step.description}</p>
                  <p className="text-xs font-mono opacity-60">"{step.subject}"</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Parametri */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Parametri di Configurazione
          </CardTitle>
        </CardHeader>
        <CardContent>
          {settingsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Giorni grazia (sospensione)</Label>
                <Input
                  type="number"
                  min={7}
                  max={30}
                  value={settingsForm["dunning_grace_days"] ?? settings?.graceDays ?? "14"}
                  onChange={(e) =>
                    setSettingsForm((p) => ({ ...p, dunning_grace_days: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">Default: 14 giorni</p>
              </div>
              <div className="space-y-1.5">
                <Label>Tentativi massimi per email</Label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={settingsForm["dunning_max_retries"] ?? settings?.maxRetries ?? "3"}
                  onChange={(e) =>
                    setSettingsForm((p) => ({ ...p, dunning_max_retries: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">Default: 3</p>
              </div>
              <div className="space-y-1.5">
                <Label>Ore tra retry</Label>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={settingsForm["dunning_retry_delay_hours"] ?? settings?.retryDelayHours ?? "2"}
                  onChange={(e) =>
                    setSettingsForm((p) => ({ ...p, dunning_retry_delay_hours: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">Default: 2 ore</p>
              </div>
            </div>
          )}
          <Button
            className="mt-4"
            onClick={() => {
              if (Object.keys(settingsForm).length === 0) return;
              saveSettings.mutate(settingsForm);
            }}
            disabled={saveSettings.isPending || Object.keys(settingsForm).length === 0}
          >
            {saveSettings.isPending ? "Salvataggio..." : "Salva Parametri"}
          </Button>
        </CardContent>
      </Card>

      {/* Log tentativi */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Log Tentativi Dunning</CardTitle>
          <CardDescription>Ultimi 100 tentativi (aggiornamento ogni 60s)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {attemptsLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : attempts.length === 0 ? (
            <div className="p-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">Nessun tentativo registrato</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Azienda</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Inviato</TableHead>
                  <TableHead className="text-right">Retry</TableHead>
                  <TableHead>Errore</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attempts.map((a) => (
                  <TableRow key={a.id} className={a.permanently_failed ? "bg-destructive/5" : ""}>
                    <TableCell className="font-medium text-sm">
                      {a.companies?.name ?? a.company_id.slice(0, 8)}
                      {a.companies?.email && (
                        <p className="text-xs text-muted-foreground">{a.companies.email}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">{a.dunning_day}</Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={a.status} permanent={a.permanently_failed} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {a.sent_at ? format(new Date(a.sent_at), "dd/MM HH:mm", { locale: it }) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {a.retry_count > 0 ? <Badge variant="secondary">{a.retry_count}×</Badge> : "—"}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-destructive">
                      {a.error_message ?? "—"}
                    </TableCell>
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
