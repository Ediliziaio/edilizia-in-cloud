import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetaStatusBadge } from "./MetaStatusBadge";
import type { Integration, IntegrationProvider } from "@/types/integrations";
import { ExternalLink, Settings2, CalendarDays, Clock, ShieldAlert, TestTube2 } from "lucide-react";

interface IntegrationCardProps {
  name: string;
  description: string;
  provider: IntegrationProvider;
  integration: Integration | null;
  stats: { pages: number; forms: number } | null | undefined;
  onConnect: () => void;
  onManage: () => void;
  onTest?: () => void;
  canManage?: boolean;
  disabledReason?: string;
  accountLabel?: string | null;
}

function MetaIcon() {
  return (
    <svg viewBox="0 0 36 36" className="h-8 w-8" fill="none">
      <defs>
        <linearGradient id="meta-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0081FB" />
          <stop offset="100%" stopColor="#0064E0" />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="8" fill="url(#meta-grad)" />
      <text x="18" y="24" textAnchor="middle" fill="white" fontSize="18" fontWeight="700" fontFamily="system-ui">M</text>
    </svg>
  );
}

function GoogleCalendarIcon() {
  return (
    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
      <CalendarDays className="h-5 w-5 text-primary" />
    </div>
  );
}

function ProviderIcon({ provider }: { provider: IntegrationProvider }) {
  switch (provider) {
    case "google_calendar":
      return <GoogleCalendarIcon />;
    default:
      return <MetaIcon />;
  }
}

export function IntegrationCard({
  name,
  description,
  provider,
  integration,
  stats,
  onConnect,
  onManage,
  onTest,
  canManage = true,
  disabledReason,
  accountLabel,
}: IntegrationCardProps) {
  const isConnected = integration?.status === "connected";
  const hasError = integration?.status === "error" || integration?.status === "token_expired";
  const updatedAt = integration?.updated_at ? new Date(integration.updated_at) : null;

  return (
    <Card className="flex flex-col overflow-hidden border-l-4 border-l-muted data-[state=connected]:border-l-emerald-500 data-[state=error]:border-l-destructive" data-state={hasError ? "error" : isConnected ? "connected" : "idle"}>
      <CardHeader className="flex-row items-start gap-3 space-y-0">
        <ProviderIcon provider={provider} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-base">{name}</CardTitle>
            {integration && <MetaStatusBadge status={integration.status} health={integration.health} />}
          </div>
          <CardDescription className="mt-1 line-clamp-2">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-end gap-3">
        {isConnected && stats && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{stats.pages} {stats.pages === 1 ? "pagina" : "pagine"}</span>
            <span>·</span>
            <span>{stats.forms} {stats.forms === 1 ? "modulo attivo" : "moduli attivi"}</span>
            {integration.last_sync_at && (
              <>
                <span>·</span>
                <span>Sync: {new Date(integration.last_sync_at).toLocaleDateString("it-IT")}</span>
              </>
            )}
          </div>
        )}

        {accountLabel && (
          <p className="text-xs text-muted-foreground truncate">Account: {accountLabel}</p>
        )}

        {updatedAt && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Aggiornata: {updatedAt.toLocaleDateString("it-IT")}
          </p>
        )}

        {hasError && integration?.last_error_message && (
          <p className="text-xs text-destructive line-clamp-2 flex gap-1">
            <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {integration.last_error_message}
          </p>
        )}

        {!canManage && disabledReason && (
          <p className="text-xs text-muted-foreground">{disabledReason}</p>
        )}

        <div className="flex flex-wrap gap-2">
          {!integration || integration.status === "disconnected" ? (
            <Button onClick={onConnect} className="flex-1 min-w-[130px]" disabled={!canManage}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Collega
            </Button>
          ) : (
            <Button variant="outline" onClick={onManage} className="flex-1 min-w-[130px]" disabled={!canManage}>
              <Settings2 className="h-4 w-4 mr-2" />
              Gestisci
            </Button>
          )}
          {isConnected && onTest && (
            <Button variant="secondary" onClick={onTest} disabled={!canManage} className="min-w-[104px]">
              <TestTube2 className="h-4 w-4 mr-2" />
              Test
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
