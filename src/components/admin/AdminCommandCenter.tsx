import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, LifeBuoy, Radar, RefreshCw, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminCommandCenterData, type AdminActionItem, type AdminActionSeverity } from "@/hooks/useAdminCommandCenterData";
import { cn } from "@/lib/utils";

const severityLabel: Record<AdminActionSeverity, string> = {
  critical: "Critico",
  high: "Alta",
  medium: "Media",
  low: "Bassa",
};

const severityClass: Record<AdminActionSeverity, string> = {
  critical: "border-red-200 bg-red-50 text-red-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  medium: "border-blue-200 bg-blue-50 text-blue-700",
  low: "border-slate-200 bg-slate-50 text-slate-700",
};

const sourceIcon: Record<AdminActionItem["source"], typeof AlertTriangle> = {
  support: LifeBuoy,
  trial: Clock3,
  sync: RefreshCw,
  revenue: Radar,
  system: AlertTriangle,
};

function ActionRow({ item }: { item: AdminActionItem }) {
  const Icon = sourceIcon[item.source] || AlertTriangle;
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-foreground">{item.title}</p>
          <Badge variant="outline" className={cn("text-[10px]", severityClass[item.severity])}>
            {severityLabel[item.severity]}
          </Badge>
          {item.meta && (
            <span className="text-xs text-muted-foreground">{item.meta}</span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
      </div>
      <Button asChild variant="outline" size="sm" className="shrink-0">
        <Link to={item.href}>
          {item.cta}
          <ArrowRight className="ml-2 h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

export function AdminCommandCenter() {
  const { data, isLoading, isError, refetch, isFetching } = useAdminCommandCenterData();
  const items = data?.items ?? [];
  const summary = data?.summary;

  return (
    <Card className="overflow-hidden border-primary/20">
      <CardHeader className="border-b bg-gradient-to-r from-primary/10 via-background to-orange-50/80 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Rocket className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-xl">Centro operativo Superadmin</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Priorità, aziende da seguire, assistenza e sync in una sola vista.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} />
              Aggiorna
            </Button>
            <Button asChild size="sm">
              <Link to="/admin/attivita">
                Apri attività
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-background p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Da gestire</p>
            <p className="mt-1 text-2xl font-bold">{summary?.total ?? 0}</p>
          </div>
          <div className="rounded-lg border bg-red-50 p-3 text-red-800">
            <p className="text-xs font-semibold uppercase tracking-wide">Critiche</p>
            <p className="mt-1 text-2xl font-bold">{summary?.critical ?? 0}</p>
          </div>
          <div className="rounded-lg border bg-orange-50 p-3 text-orange-800">
            <p className="text-xs font-semibold uppercase tracking-wide">Alta priorità</p>
            <p className="mt-1 text-2xl font-bold">{summary?.high ?? 0}</p>
          </div>
          <div className="rounded-lg border bg-blue-50 p-3 text-blue-800">
            <p className="text-xs font-semibold uppercase tracking-wide">Assistenza</p>
            <p className="mt-1 text-2xl font-bold">{summary?.support ?? 0}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <div className="h-16 rounded-lg bg-muted animate-pulse" />
            <div className="h-16 rounded-lg bg-muted animate-pulse" />
          </div>
        ) : isError ? (
          <div className="flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            Non riesco a caricare il centro operativo. Riprova o verifica i permessi Supabase.
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border bg-emerald-50 p-4 text-emerald-800">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            Nessuna priorità aperta: assistenza, trial e sync sono sotto controllo.
          </div>
        ) : (
          <div className="space-y-2">
            {items.slice(0, 5).map((item) => (
              <ActionRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
