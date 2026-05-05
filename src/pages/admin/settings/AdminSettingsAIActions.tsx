import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Zap, AlertTriangle, LockKeyhole, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ActionMode = "disabled" | "propose" | "require_confirmation" | "require_strong_confirmation" | "auto_execute";
type RiskLevel = "green" | "yellow" | "red";

interface CompanyRow {
  id: string;
  name: string;
}

interface PermissionRow {
  id: string;
  company_id: string;
  action_type: string;
  risk_level: RiskLevel;
  mode: ActionMode;
  allowed_roles: string[];
  requires_company_admin: boolean;
  max_daily_executions: number | null;
  notes: string | null;
}

const ACTIONS: Array<{
  action_type: string;
  label: string;
  description: string;
  defaultMode: ActionMode;
  risk: RiskLevel;
  roles: string[];
  maxDaily: number | null;
}> = [
  {
    action_type: "send_overdue_reminder",
    label: "Invio sollecito pagamento",
    description: "Email transazionale a cliente con rata scaduta.",
    defaultMode: "require_confirmation",
    risk: "yellow",
    roles: ["super_admin", "company_admin", "company_staff"],
    maxDaily: 50,
  },
  {
    action_type: "send_quote_followup",
    label: "Follow-up preventivo",
    description: "Email di follow-up commerciale su preventivi aperti.",
    defaultMode: "require_confirmation",
    risk: "yellow",
    roles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    maxDaily: 50,
  },
  {
    action_type: "mark_payment_received",
    label: "Segna rata pagata",
    description: "Modifica dati economici dell'ordine. Sempre ad alto controllo.",
    defaultMode: "require_strong_confirmation",
    risk: "red",
    roles: ["super_admin", "company_admin"],
    maxDaily: null,
  },
  {
    action_type: "create_purchase_order",
    label: "Crea bozza ordine fornitore",
    description: "Crea una bozza ODA da riordino magazzino.",
    defaultMode: "require_confirmation",
    risk: "yellow",
    roles: ["super_admin", "company_admin", "company_staff"],
    maxDaily: 25,
  },
  {
    action_type: "generic_email",
    label: "Invio email generica",
    description: "Invio libero verso destinatario specifico. Richiede conferma forte.",
    defaultMode: "require_strong_confirmation",
    risk: "red",
    roles: ["super_admin", "company_admin"],
    maxDaily: null,
  },
];

const MODE_LABEL: Record<ActionMode, string> = {
  disabled: "Disabilitata",
  propose: "Solo proposta",
  require_confirmation: "Conferma click",
  require_strong_confirmation: "Conferma forte",
  auto_execute: "Auto-esecuzione",
};

function riskTone(risk: RiskLevel) {
  if (risk === "red") return "border-red-200 bg-red-50 text-red-700";
  if (risk === "yellow") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export default function AdminSettingsAIActions() {
  const queryClient = useQueryClient();
  const [companyId, setCompanyId] = useState<string>("");

  const companiesQuery = useQuery({
    queryKey: ["admin-ai-action-companies"],
    queryFn: async (): Promise<CompanyRow[]> => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CompanyRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!companyId && companiesQuery.data?.[0]?.id) {
      setCompanyId(companiesQuery.data[0].id);
    }
  }, [companyId, companiesQuery.data]);

  const permissionsQuery = useQuery({
    queryKey: ["admin-ai-action-permissions", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<PermissionRow[]> => {
      const { data, error } = await (supabase as any)
        .from("ai_company_action_permissions")
        .select("*")
        .eq("company_id", companyId)
        .order("action_type", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PermissionRow[];
    },
  });

  const permissionByAction = useMemo(() => {
    return new Map((permissionsQuery.data ?? []).map((row) => [row.action_type, row]));
  }, [permissionsQuery.data]);

  const updateMutation = useMutation({
    mutationFn: async ({ actionType, mode }: { actionType: string; mode: ActionMode }) => {
      const action = ACTIONS.find((item) => item.action_type === actionType);
      if (!action || !companyId) throw new Error("Azione o azienda mancante");

      const risk = mode === "require_strong_confirmation" || action.risk === "red" ? "red" : action.risk;
      const { error } = await (supabase as any).rpc("set_ai_action_permission", {
        p_company_id: companyId,
        p_action_type: actionType,
        p_mode: mode,
        p_risk_level: risk,
        p_allowed_roles: action.roles,
        p_requires_company_admin: risk === "red",
        p_max_daily_executions: action.maxDaily,
        p_notes: `Aggiornato da Superadmin: ${MODE_LABEL[mode]}`,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Permesso AI aggiornato");
      queryClient.invalidateQueries({ queryKey: ["admin-ai-action-permissions", companyId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectedCompany = companiesQuery.data?.find((company) => company.id === companyId);
  const overridesCount = permissionsQuery.data?.length ?? 0;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-600" />
                Permessi azioni AI per azienda
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Decidi cosa Silvio può proporre, cosa richiede conferma forte e cosa va bloccato azienda per azienda.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder="Seleziona azienda" />
                </SelectTrigger>
                <SelectContent>
                  {(companiesQuery.data ?? []).map((company) => (
                    <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => permissionsQuery.refetch()}
                disabled={!companyId || permissionsQuery.isFetching}
                aria-label="Aggiorna permessi AI"
              >
                <RefreshCw className={`h-4 w-4 ${permissionsQuery.isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {permissionsQuery.isError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Matrice permessi non disponibile</AlertTitle>
              <AlertDescription>
                La migrazione locale `ai_company_action_permissions` non risulta applicata sul database collegato.
                Applica le migrazioni prima di usare questo pannello.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-blue-50 p-4 text-blue-950">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Azienda</p>
                <p className="mt-1 text-lg font-bold">{selectedCompany?.name ?? "Seleziona azienda"}</p>
              </div>
              <div className="rounded-lg border bg-emerald-50 p-4 text-emerald-950">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Override attivi</p>
                <p className="mt-1 text-lg font-bold">{overridesCount}</p>
              </div>
              <div className="rounded-lg border bg-orange-50 p-4 text-orange-950">
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Azioni governate</p>
                <p className="mt-1 text-lg font-bold">{ACTIONS.length}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Azione</TableHead>
                <TableHead>Rischio</TableHead>
                <TableHead>Modalità</TableHead>
                <TableHead>Ruoli</TableHead>
                <TableHead>Limite</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ACTIONS.map((action) => {
                const override = permissionByAction.get(action.action_type);
                const mode = override?.mode ?? action.defaultMode;
                const risk = override?.risk_level ?? action.risk;
                return (
                  <TableRow key={action.action_type}>
                    <TableCell>
                      <div className="flex items-start gap-3">
                        <div className="rounded-md bg-slate-100 p-2">
                          {risk === "red" ? <LockKeyhole className="h-4 w-4 text-red-600" /> : <Zap className="h-4 w-4 text-blue-600" />}
                        </div>
                        <div>
                          <p className="font-semibold">{action.label}</p>
                          <p className="text-xs text-muted-foreground">{action.description}</p>
                          {override && <p className="mt-1 text-xs text-blue-600">Override aziendale attivo</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={riskTone(risk)}>
                        {risk}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={mode}
                        onValueChange={(value: ActionMode) => updateMutation.mutate({ actionType: action.action_type, mode: value })}
                        disabled={!companyId || updateMutation.isPending || permissionsQuery.isError}
                      >
                        <SelectTrigger className="w-[210px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(MODE_LABEL) as ActionMode[]).map((value) => (
                            <SelectItem key={value} value={value}>{MODE_LABEL[value]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-[260px] flex-wrap gap-1">
                        {action.roles.map((role) => (
                          <Badge key={role} variant="secondary" className="font-mono text-[10px]">
                            {role}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {override?.max_daily_executions ?? action.maxDaily ?? "Nessuno"} / giorno
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
