import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetaStatusBadge } from "./MetaStatusBadge";
import type { Integration, IntegrationProvider } from "@/types/integrations";
import { ExternalLink, Settings2, CalendarDays } from "lucide-react";

interface IntegrationCardProps {
  name: string;
  description: string;
  provider: IntegrationProvider;
  integration: Integration | null;
  stats: { pages: number; forms: number } | null | undefined;
  onConnect: () => void;
  onManage: () => void;
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
}: IntegrationCardProps) {
  const isConnected = integration?.status === "connected";
  const hasError = integration?.status === "error" || integration?.status === "token_expired";

  return (
    <Card className="flex flex-col">
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
          <div className="flex gap-3 text-xs text-muted-foreground">
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

        {hasError && integration?.last_error_message && (
          <p className="text-xs text-destructive line-clamp-1">{integration.last_error_message}</p>
        )}

        <div className="flex gap-2">
          {!integration || integration.status === "disconnected" ? (
            <Button onClick={onConnect} className="w-full">
              <ExternalLink className="h-4 w-4 mr-2" />
              Collega
            </Button>
          ) : (
            <Button variant="outline" onClick={onManage} className="w-full">
              <Settings2 className="h-4 w-4 mr-2" />
              Gestisci
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
