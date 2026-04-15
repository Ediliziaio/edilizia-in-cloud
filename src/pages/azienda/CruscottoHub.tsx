/**
 * CruscottoHub — Sprint 5
 *
 * Comportamento:
 * - Ogni utente viene reindirizzato alla dashboard associata al suo ruolo
 *   (company_role_dashboards). Se nessuna è configurata:
 *   - Admin → pannello di configurazione ruoli + template library
 *   - Altri  → vecchio hub (selezione manuale)
 *
 * Admin possono configurare la mappa ruolo→dashboard e clonare template
 * direttamente da questa pagina.
 */

import { useState, useMemo } from "react";
import { Navigate, Link } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useMyCruscottoDashboard,
  useCompanyRoleDashboards,
  useDashboardTemplates,
  useSetCompanyRoleDashboard,
  useUnsetCompanyRoleDashboard,
  useCloneTemplateToCompany,
  useDashboards,
} from "@/lib/dashboardBuilder/hooks";
import type { AppRole, DashboardTemplate } from "@/lib/dashboardBuilder/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LayoutGrid,
  HardHat,
  TrendingUp,
  ArrowRight,
  Settings,
  Copy,
  Trash2,
  LayoutDashboard,
  Loader2,
  CheckCircle2,
  BookTemplate,
} from "lucide-react";
import { toast } from "sonner";

// ─── Costanti ruoli ──────────────────────────────────────────────────────────
const ALL_ROLES: Array<{ role: AppRole; label: string }> = [
  { role: "company_admin",  label: "Amministratore" },
  { role: "company_staff",  label: "Staff" },
  { role: "salesperson",    label: "Commerciale" },
  { role: "call_center",    label: "Call Center" },
  { role: "employee",       label: "Dipendente" },
];

// ─── Fallback hub (vecchio comportamento) ────────────────────────────────────
const FALLBACK_DASHBOARDS = [
  {
    title: "Cruscotto Aziendale",
    description: "KPI strategici, cash flow, marketing e operazioni",
    url: "/azienda/cruscotto/aziendale",
    icon: LayoutGrid,
    permKey: "canViewCruscotto" as const,
  },
  {
    title: "Dashboard Gestione",
    description: "Ordini, cantieri, magazzino e scadenze operative",
    url: "/azienda",
    icon: HardHat,
    permKey: "canViewDashboard" as const,
  },
  {
    title: "Dashboard Marketing",
    description: "Pipeline, lead, opportunità e performance commerciale",
    url: "/azienda/marketing",
    icon: TrendingUp,
    permKey: "canViewMarketingDashboard" as const,
  },
];

// ─── Template card ───────────────────────────────────────────────────────────
function TemplateCard({
  template,
  onClone,
  cloning,
}: {
  template: DashboardTemplate;
  onClone: (t: DashboardTemplate, scope: string) => void;
  cloning: boolean;
}) {
  const roleLabels = (template.target_roles ?? [])
    .map((r) => ALL_ROLES.find((x) => x.role === r)?.label ?? r)
    .join(", ");

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <LayoutDashboard className="h-5 w-5 text-primary" />
          </div>
          {template.category && (
            <Badge variant="secondary" className="text-xs capitalize">
              {template.category}
            </Badge>
          )}
        </div>
        <CardTitle className="text-base mt-2">{template.name}</CardTitle>
        {template.description && (
          <CardDescription className="text-xs leading-relaxed">
            {template.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="mt-auto space-y-3 pt-0">
        {roleLabels && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Ruoli: </span>
            {roleLabels}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5"
            disabled={cloning}
            onClick={() => onClone(template, "personal")}
          >
            {cloning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            Copia personale
          </Button>
          <Button
            size="sm"
            className="flex-1 gap-1.5"
            disabled={cloning}
            onClick={() => onClone(template, "company")}
          >
            {cloning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Usa per azienda
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Pannello admin: mappa ruoli ─────────────────────────────────────────────
function AdminRolePanel() {
  const { data: roleMap = [], isLoading: mapLoading } = useCompanyRoleDashboards();
  const { data: dashboards = [], isLoading: dashLoading } = useDashboards();
  const { data: templates = [], isLoading: tplLoading } = useDashboardTemplates();
  const setRole = useSetCompanyRoleDashboard();
  const unsetRole = useUnsetCompanyRoleDashboard();
  const cloneTpl = useCloneTemplateToCompany();

  const [cloningId, setCloningId] = useState<string | null>(null);

  const mapByRole = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of roleMap) m[r.role] = r.dashboard_id;
    return m;
  }, [roleMap]);

  const handleSetRole = (role: AppRole, dashboardId: string) => {
    if (dashboardId === "__none__") {
      unsetRole.mutate(role, {
        onSuccess: () => toast.success("Mappatura rimossa"),
        onError: (e) => toast.error(String(e)),
      });
    } else {
      setRole.mutate(
        { role, dashboardId },
        {
          onSuccess: () => toast.success("Dashboard associata al ruolo"),
          onError: (e) => toast.error(String(e)),
        },
      );
    }
  };

  const handleClone = (template: DashboardTemplate, scope: string) => {
    setCloningId(template.id);
    cloneTpl.mutate(
      { templateId: template.id, scope: scope as "personal" | "company", name: template.name },
      {
        onSuccess: (newId) => {
          toast.success(`Dashboard "${template.name}" creata`, {
            action: {
              label: "Apri",
              onClick: () => window.open(`/azienda/dashboards/${newId}`, "_blank"),
            },
          });
        },
        onError: (e) => toast.error(String(e)),
        onSettled: () => setCloningId(null),
      },
    );
  };

  const isLoading = mapLoading || dashLoading || tplLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Mappa ruoli ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Mappa Ruolo → Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            Scegli quale dashboard personalizzata mostrare a ciascun ruolo.
            Se non configurata, l'utente vede il cruscotto classico.
          </p>
        </div>

        <div className="rounded-lg border divide-y">
          {ALL_ROLES.map(({ role, label }) => {
            const currentId = mapByRole[role] ?? "__none__";
            const currentDash = dashboards.find((d) => d.id === currentId);
            return (
              <div
                key={role}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground font-mono">{role}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Select
                    value={currentId}
                    onValueChange={(v) => handleSetRole(role, v)}
                    disabled={setRole.isPending || unsetRole.isPending}
                  >
                    <SelectTrigger className="w-56 text-sm">
                      <SelectValue placeholder="— Nessuna dashboard —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Nessuna dashboard —</SelectItem>
                      {dashboards.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {currentDash && (
                    <Link
                      to={`/azienda/dashboards/${currentId}`}
                      className="shrink-0"
                      target="_blank"
                    >
                      <Button variant="ghost" size="icon" title="Apri dashboard">
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  )}
                  {currentId !== "__none__" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Rimuovi mappatura"
                      onClick={() => handleSetRole(role, "__none__")}
                      disabled={unsetRole.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Template Library ─────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <BookTemplate className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold leading-none">Template Library</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Clona un template per creare rapidamente una dashboard per la tua azienda.
            </p>
          </div>
        </div>

        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Nessun template disponibile.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {templates.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                onClone={handleClone}
                cloning={cloningId === tpl.id}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function CruscottoHub() {
  const permissions = usePermissions();
  const { data: roleDashId, isLoading: roleLoading } = useMyCruscottoDashboard();
  const [adminOpen, setAdminOpen] = useState(false);

  // Loading
  if (permissions.isLoading || roleLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <div className="h-7 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 rounded-xl border bg-muted/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // ── Utente con dashboard ruolo configurata → redirect diretto ──────────────
  if (roleDashId) {
    return <Navigate to={`/azienda/dashboards/${roleDashId}`} replace />;
  }

  // ── Admin senza dashboard ruolo configurata → pannello config ─────────────
  if (permissions.isAdmin) {
    return (
      <div className="space-y-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Cruscotto per Ruolo</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configura quale dashboard mostri a ciascun ruolo della tua azienda.
            </p>
          </div>
          <Link to="/azienda/cruscotto/aziendale">
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
              <LayoutGrid className="h-4 w-4" />
              Cruscotto classico
            </Button>
          </Link>
        </div>

        {/* Admin panel inline */}
        <AdminRolePanel />
      </div>
    );
  }

  // ── Non-admin senza dashboard ruolo → fallback classico ───────────────────
  const visibleDashboards = FALLBACK_DASHBOARDS.filter(
    (d) => permissions[d.permKey],
  );

  if (visibleDashboards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
        <LayoutGrid className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground max-w-xs">
          Non hai accesso a nessuna dashboard. Contatta l&apos;amministratore.
        </p>
      </div>
    );
  }

  if (visibleDashboards.length === 1) {
    return <Navigate to={visibleDashboards[0].url} replace />;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Cruscotto</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Seleziona la dashboard che vuoi visualizzare
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleDashboards.map((dash) => {
          const Icon = dash.icon;
          return (
            <Link key={dash.url} to={dash.url} className="group">
              <Card className="h-full transition-all duration-150 hover:shadow-md hover:border-primary/40 cursor-pointer group-hover:bg-primary/5">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-transform duration-150 group-hover:translate-x-1 group-hover:text-primary mt-1" />
                  </div>
                  <CardTitle className="text-base mt-3">{dash.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-xs leading-relaxed">
                    {dash.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
