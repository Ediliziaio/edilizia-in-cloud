/**
 * /commercialista — Cruscotto generale studio.
 * Mostra KPI aggregate su tutte le aziende clienti, ultime notifiche,
 * inviti in attesa e shortcut alle aziende più recenti.
 */

import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Building2,
  CheckCircle2,
  Clock,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSEO } from "@/hooks/useSEO";
import {
  useAccountantCompanies,
  useAccountantFirm,
  useAccountantNotifications,
} from "@/hooks/accountant/useAccountantPortalData";

export default function AccountantDashboard() {
  useSEO({ title: "Cruscotto studio", noindex: true });

  const { data: firm } = useAccountantFirm();
  const { data: companies = [], isLoading: companiesLoading } = useAccountantCompanies();
  const { data: notifications = [] } = useAccountantNotifications();

  const stats = useMemo(() => {
    const active = companies.filter((c) => c.status === "active");
    const invited = companies.filter((c) => c.status === "invited");
    const suspended = companies.filter((c) => c.status === "suspended");
    return {
      total: companies.length,
      active: active.length,
      invited: invited.length,
      suspended: suspended.length,
    };
  }, [companies]);

  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !n.is_read).slice(0, 5),
    [notifications],
  );

  const pendingInvites = useMemo(
    () => companies.filter((c) => c.status === "invited").slice(0, 3),
    [companies],
  );

  const recentActive = useMemo(
    () => companies.filter((c) => c.status === "active").slice(0, 6),
    [companies],
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Cruscotto studio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Benvenuto in <span className="font-semibold">{firm?.name}</span>. Qui vedi una
          panoramica di tutte le aziende che hai in gestione.
        </p>
      </header>

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Aziende totali
                </p>
                <p className="mt-1 text-2xl font-bold">{stats.total}</p>
              </div>
              <Building2 className="h-6 w-6 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Attive
                </p>
                <p className="mt-1 text-2xl font-bold text-emerald-600">{stats.active}</p>
              </div>
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Inviti in attesa
                </p>
                <p className="mt-1 text-2xl font-bold text-amber-600">{stats.invited}</p>
              </div>
              <Clock className="h-6 w-6 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Notifiche nuove
                </p>
                <p className="mt-1 text-2xl font-bold">{unreadNotifications.length}</p>
              </div>
              <Bell className="h-6 w-6 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Aziende recenti */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Aziende attive</CardTitle>
              <CardDescription>Apri il cruscotto di un cliente</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="gap-2">
              <Link to="/commercialista/aziende">
                Tutte
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {companiesLoading && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Caricamento aziende...
              </div>
            )}
            {!companiesLoading && recentActive.length === 0 && (
              <div className="flex flex-col items-center gap-2 p-8 text-center">
                <Building2 className="h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm font-medium">Nessuna azienda attiva</p>
                <p className="text-xs text-muted-foreground">
                  {stats.invited > 0
                    ? "Hai inviti in attesa: accettali dalla sezione Inbox."
                    : "Le aziende che ti delegheranno l'accesso appariranno qui."}
                </p>
              </div>
            )}
            {recentActive.length > 0 && (
              <div className="divide-y">
                {recentActive.map((access) => (
                  <Link
                    key={access.id}
                    to={`/commercialista/aziende/${access.company_id}`}
                    className="flex items-center gap-3 p-4 transition-colors hover:bg-slate-50"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-bold text-blue-700">
                      {access.company?.name
                        ?.split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((p) => p[0]?.toUpperCase())
                        .join("") || "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {access.company?.name ?? "Azienda"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {access.company?.vat_number
                          ? `P.IVA ${access.company.vat_number}`
                          : access.company?.legal_city || "—"}
                      </p>
                    </div>
                    <Badge variant="outline" className="font-normal">
                      {access.access_mode === "read_only"
                        ? "Sola lettura"
                        : access.access_mode === "operational"
                          ? "Operativo"
                          : "Approvazione"}
                    </Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Inviti pending + notifiche */}
        <div className="space-y-4">
          {pendingInvites.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4 text-amber-500" />
                  Inviti da accettare
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-3 pt-0">
                {pendingInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className="rounded-lg border border-amber-200 bg-amber-50/50 p-3"
                  >
                    <p className="text-sm font-medium">{invite.company?.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Mode: {invite.access_mode}
                    </p>
                    <Button asChild variant="link" size="sm" className="mt-1 h-auto p-0">
                      <Link to="/commercialista/inbox">Apri inbox →</Link>
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {unreadNotifications.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bell className="h-4 w-4 text-blue-500" />
                  Ultime notifiche
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-3 pt-0">
                {unreadNotifications.map((n) => (
                  <Link
                    key={n.id}
                    to={n.action_url || "/commercialista/inbox"}
                    className="block rounded-lg border bg-white p-3 transition-colors hover:bg-slate-50"
                  >
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {n.body}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {new Date(n.created_at).toLocaleDateString("it-IT", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {pendingInvites.length === 0 && unreadNotifications.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
                Tutto sotto controllo. Nessuna notifica nuova.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Hint */}
      {stats.total === 0 && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
            <div className="text-sm">
              <p className="font-medium text-blue-900">Come collegare la tua prima azienda</p>
              <p className="mt-1 text-blue-700">
                Le aziende ti invitano dal loro pannello{" "}
                <span className="font-mono text-xs">Impostazioni → Persone & Utenti → Commercialista</span>{" "}
                inserendo la tua email. Riceverai notifica qui appena qualcuno ti invita.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
