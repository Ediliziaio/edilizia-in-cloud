/**
 * /commercialista/inbox — notifiche + inviti pending.
 * Permette accept/reject invito + mark as read / dismiss per ogni notifica.
 */

import { Link } from "react-router-dom";
import {
  Bell,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Mail,
  X,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSEO } from "@/hooks/useSEO";
import { useToast } from "@/hooks/use-toast";
import {
  useAccountantCompanies,
  useAccountantNotifications,
  useAcceptCompanyInvite,
  useRejectCompanyInvite,
  useDismissNotification,
  useMarkNotificationRead,
} from "@/hooks/accountant/useAccountantPortalData";

export default function AccountantInbox() {
  useSEO({ title: "Inbox — Studio", noindex: true });

  const { toast } = useToast();
  const { data: companies = [], isLoading: companiesLoading } = useAccountantCompanies();
  const { data: notifications = [], isLoading: notificationsLoading } =
    useAccountantNotifications();

  const acceptInvite = useAcceptCompanyInvite();
  const rejectInvite = useRejectCompanyInvite();
  const markRead = useMarkNotificationRead();
  const dismissNotif = useDismissNotification();

  // Tracciamento per-riga: disabilita/spinner solo sull'invito in elaborazione,
  // così con più inviti pending gli altri restano cliccabili.
  const acceptingId = acceptInvite.isPending ? acceptInvite.variables : undefined;
  const rejectingId = rejectInvite.isPending ? rejectInvite.variables : undefined;

  const pendingInvites = companies.filter((c) => c.status === "invited");

  async function handleAccept(accessId: string, companyName?: string) {
    try {
      await acceptInvite.mutateAsync(accessId);
      toast({
        title: "Invito accettato",
        description: companyName
          ? `Hai accettato l'accesso a ${companyName}.`
          : "Accesso attivato.",
      });
    } catch (err) {
      toast({
        title: "Errore",
        description: (err as Error).message || "Impossibile accettare l'invito.",
        variant: "destructive",
      });
    }
  }

  async function handleReject(accessId: string, companyName?: string) {
    if (!confirm(`Rifiutare l'invito di ${companyName ?? "questa azienda"}?`)) return;
    try {
      await rejectInvite.mutateAsync(accessId);
      toast({ title: "Invito rifiutato" });
    } catch (err) {
      toast({
        title: "Errore",
        description: (err as Error).message || "Impossibile rifiutare l'invito.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Inviti dalle aziende e notifiche dello studio.
        </p>
      </header>

      {/* Inviti pending */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-amber-500" />
            Inviti da accettare
            {pendingInvites.length > 0 && (
              <Badge variant="secondary">{pendingInvites.length}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Aziende che ti hanno invitato come commercialista. Accetta per iniziare a operare.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {companiesLoading && (
            <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Caricamento...
            </div>
          )}
          {!companiesLoading && pendingInvites.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nessun invito in attesa.
            </div>
          )}
          {pendingInvites.length > 0 && (
            <div className="divide-y">
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
                >
                  <div className="flex-1">
                    <p className="font-semibold">{invite.company?.name}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {invite.company?.vat_number && (
                        <span>P.IVA {invite.company.vat_number}</span>
                      )}
                      <span>Mode: {invite.access_mode}</span>
                      {invite.invited_at && (
                        <span>
                          Invitato {new Date(invite.invited_at).toLocaleDateString("it-IT")}
                        </span>
                      )}
                    </div>
                    {invite.notes && (
                      <p className="mt-1 text-xs italic text-muted-foreground">
                        "{invite.notes}"
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReject(invite.id, invite.company?.name)}
                      disabled={acceptingId === invite.id || rejectingId === invite.id}
                      className="gap-2"
                    >
                      {rejectingId === invite.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      Rifiuta
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleAccept(invite.id, invite.company?.name)}
                      disabled={acceptingId === invite.id || rejectingId === invite.id}
                      className="gap-2 bg-blue-700 hover:bg-blue-800"
                    >
                      {acceptingId === invite.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Accetta
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notifiche */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4 text-blue-500" />
            Notifiche
          </CardTitle>
          <CardDescription>Eventi recenti relativi al tuo studio.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {notificationsLoading && (
            <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Caricamento...
            </div>
          )}
          {!notificationsLoading && notifications.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <Mail className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium">Nessuna notifica</p>
              <p className="text-xs text-muted-foreground">
                Le notifiche degli eventi appariranno qui.
              </p>
            </div>
          )}
          {notifications.length > 0 && (
            <div className="divide-y">
              {notifications.map((n) => {
                const Icon = n.type === "company_invite" ? Clock : Bell;
                return (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 p-4 ${
                      !n.is_read ? "bg-blue-50/30" : ""
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        !n.is_read ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-sm ${
                            !n.is_read ? "font-semibold" : "font-medium text-muted-foreground"
                          }`}
                        >
                          {n.title}
                        </p>
                        <button
                          type="button"
                          onClick={() => void dismissNotif.mutate(n.id)}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label="Rimuovi notifica"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {n.body && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <span>
                          {new Date(n.created_at).toLocaleDateString("it-IT", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {n.action_url && (
                          <Link
                            to={n.action_url}
                            onClick={() => {
                              if (!n.is_read) void markRead.mutate(n.id);
                            }}
                            className="inline-flex items-center gap-1 font-semibold normal-case tracking-normal text-blue-700 hover:underline"
                          >
                            Apri
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                        {!n.is_read && (
                          <button
                            type="button"
                            onClick={() => void markRead.mutate(n.id)}
                            className="font-semibold normal-case tracking-normal text-muted-foreground hover:text-foreground"
                          >
                            Segna come letta
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
