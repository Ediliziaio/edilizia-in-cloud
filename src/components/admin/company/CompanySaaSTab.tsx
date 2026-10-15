import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CompanyFeatureOverridesCard } from "./CompanyFeatureOverridesCard";
import { CompanyOverrideAuditLogCard } from "./CompanyOverrideAuditLogCard";
import { useIncludedWhitelabel } from "@/hooks/useIncludedWhitelabel";
import type { Company } from "@/types/auth";

interface Props {
  currentPlan: {
    id?: string;
    slug?: string;
    name?: string;
    max_orders?: number;
    max_users?: number;
    max_storage_mb?: number;
  } | null;
  stats: { ordersCount: number; customersCount: number } | null;
  totalUsers: number;
  includedModules?: string[];
  plans?: unknown[];
  companyPlanId?: string | null;
  companyId?: string;
  company?: Company | null;
  onNavigateToTab?: (tab: string) => void;
}
const limit = (value: number | undefined) =>
  value == null
    ? "Non specificato"
    : value === -1
      ? "Illimitati"
      : value.toLocaleString("it-IT");
export function CompanySaaSTab({
  currentPlan,
  stats,
  totalUsers,
  companyId,
  company,
  onNavigateToTab,
}: Props) {
  const included = useIncludedWhitelabel(company?.subscription_plan_id);
  if (!companyId) return null;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Account con accesso</p>
            <p className="mt-1 text-2xl font-semibold">{totalUsers}</p>
            <p className="text-sm text-muted-foreground">
              Limite piano: {limit(currentPlan?.max_users)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Ordini e commesse</p>
            <p className="mt-1 text-2xl font-semibold">
              {stats ? stats.ordersCount : "—"}
            </p>
            <p className="text-sm text-muted-foreground">
              Limite piano: {limit(currentPlan?.max_orders)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Spazio incluso nel piano
            </p>
            <p className="mt-1 text-2xl font-semibold">
              {currentPlan?.max_storage_mb === -1
                ? "Illimitato"
                : currentPlan?.max_storage_mb != null
                  ? `${(currentPlan.max_storage_mb / 1024).toLocaleString("it-IT", { maximumFractionDigits: 1 })} GB`
                  : "Non specificato"}
            </p>
            <p className="text-sm text-muted-foreground">
              Capacità disponibile, non spazio utilizzato
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">White label</CardTitle>
          <CardDescription>
            Logo, colori e dominio hanno una gestione dedicata.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <Badge
            variant={company?.white_label_enabled ? "default" : "secondary"}
          >
            {included.isLoading
              ? "Verifica del piano…"
              : included.isError
                ? "Inclusione nel piano non verificabile"
                : included.isIncluded
              ? `Incluso nel piano ${included.planName}`
              : company?.white_label_enabled
                ? "Attivo per concessione manuale"
                : "Non attivo"}
          </Badge>
          <Button
            variant="outline"
            onClick={() => onNavigateToTab?.("whitelabel")}
          >
            Gestisci marchio e dominio
          </Button>
        </CardContent>
      </Card>
      <CompanyFeatureOverridesCard
        companyId={companyId}
        companyName={company?.name ?? "Azienda"}
        planId={currentPlan?.id ?? null}
        planSlug={currentPlan?.slug ?? null}
      />
      <CompanyOverrideAuditLogCard companyId={companyId} />
    </div>
  );
}
