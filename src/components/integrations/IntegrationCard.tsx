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

function IconShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-9 w-9 rounded-lg bg-white border shadow-sm flex items-center justify-center shrink-0">
      {children}
    </div>
  );
}

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function GoogleAdsLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M14.5 7l5 8.5-2.6 1.5-5-8.5L14.5 7z" fill="#4285F4" />
      <path d="M9.5 7l5 8.5-2.6 1.5-5-8.5L9.5 7z" fill="#FBBC04" />
      <circle cx="6.5" cy="17.5" r="2.5" fill="#34A853" />
    </svg>
  );
}

function ProviderIcon({ provider }: { provider: IntegrationProvider }) {
  switch (provider) {
    case "google_calendar":
      return <IconShell><GoogleLogo className="h-5 w-5" /></IconShell>;
    case "apple_calendar":
      return <IconShell><AppleLogo className="h-5 w-5 text-slate-900" /></IconShell>;
    case "google_ads":
      return <IconShell><GoogleAdsLogo className="h-5 w-5" /></IconShell>;
    case "meta":
      return <MetaIcon />;
    default:
      return <IconShell><CalendarDays className="h-5 w-5 text-primary" /></IconShell>;
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
