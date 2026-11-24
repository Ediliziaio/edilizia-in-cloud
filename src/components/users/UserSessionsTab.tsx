import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { queryKeys } from "@/lib/queryKeys";
import { formatDistanceToNow, format } from "date-fns";
import { Loader2, Monitor, Smartphone, Tablet, Wifi, WifiOff, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { userErrorMessage } from "@/lib/userErrorMessage";
import { motivoChiusuraLeggibile } from "@/lib/users/collegamento";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

interface UserSessionsTabProps {
  userId: string;
  /** Chiudere le sessioni di un'altra persona: solo l'amministratore (lo rifiuta il server a chiunque altro). */
  puoChiudere?: boolean;
}

const deviceIcon = (type: string | null) => {
  if (type === "mobile") return <Smartphone className="h-4 w-4" aria-hidden="true" />;
  if (type === "tablet") return <Tablet className="h-4 w-4" aria-hidden="true" />;
  return <Monitor className="h-4 w-4" aria-hidden="true" />;
};

export function UserSessionsTab({ userId, puoChiudere = true }: UserSessionsTabProps) {
  const t = useT();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);

  const { data: sessions, isLoading } = useQuery({
    queryKey: queryKeys.userSessions.byUser(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_sessions")
        .select("*")
        .eq("user_id", userId)
        .order("started_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const { data, error } = await supabase.functions.invoke("revoke-user-session", {
        body: { session_id: sessionId, reason: "Chiusa dall'amministratore" },
      });
      if (error) throw error;
      return data as { tutti_i_dispositivi?: boolean } | null;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userSessions.byUser(userId) });
      toast({
        title: t("Sessione chiusa"),
        // Una sessione non collegata a un dispositivo preciso chiude tutti gli accessi.
        description: data?.tutti_i_dispositivi ? t("L'utente è stato disconnesso da tutti i dispositivi.") : undefined,
      });
    },
    onError: (e: unknown) => {
      toast({ title: t("Non sono riuscito a chiudere la sessione"), description: userErrorMessage(e, "Riprova tra un attimo."), variant: "destructive" });
    },
  });

  const revokeAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("revoke-user-session", {
        body: { revoke_all_for_user: userId, reason: "Tutte le sessioni chiuse dall'amministratore" },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userSessions.byUser(userId) });
      toast({ title: t("Tutte le sessioni chiuse") });
    },
    onError: (e: unknown) => {
      toast({ title: t("Non sono riuscito a chiudere le sessioni"), description: userErrorMessage(e, "Riprova tra un attimo."), variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div role="status" className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">{t("Caricamento delle sessioni…")}</span>
      </div>
    );
  }

  const activeSessions = sessions?.filter((s) => s.is_active) || [];
  const inactiveSessions = sessions?.filter((s) => !s.is_active) || [];
  const displaySessions = showAll ? sessions : activeSessions;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">{t("Sessioni")}</CardTitle>
            <CardDescription className="mt-1.5">
              {activeSessions.length === 1 ? t("1 sessione aperta") : t("{n} sessioni aperte", { n: activeSessions.length })}
              {" "}{t("(una sessione resta aperta finché la persona non esce o non la chiudi tu)")}
            </CardDescription>
          </div>
          {puoChiudere && activeSessions.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={revokeAllMutation.isPending}>
                  {t("Chiudi tutte")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("Chiudere tutte le sessioni?")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("La persona esce da tutti i dispositivi.")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => revokeAllMutation.mutate()}>
                    {t("Chiudi tutte")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Button variant={!showAll ? "default" : "outline"} size="sm" onClick={() => setShowAll(false)}>{t("Aperte ({n})", { n: activeSessions.length })}</Button>
            <Button variant={showAll ? "default" : "outline"} size="sm" onClick={() => setShowAll(true)}>
              {t("Tutte ({n})", { n: sessions?.length || 0 })}
            </Button>
          </div>

          {(!displaySessions || displaySessions.length === 0) ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t("Nessuna sessione trovata.")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Dispositivo")}</TableHead>
                  <TableHead>{t("Indirizzo (IP)")}</TableHead>
                  <TableHead>{t("Iniziata")}</TableHead>
                  <TableHead>{t("Ultima attività")}</TableHead>
                  <TableHead>{t("Stato")}</TableHead>
                  <TableHead className="text-right"><span className="sr-only">{t("Azioni")}</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displaySessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {deviceIcon(session.device_type)}
                        <div>
                          <p className="text-sm font-medium">{session.browser || t("Sconosciuto")}</p>
                          <p className="text-xs text-muted-foreground">{session.os || "—"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{String(session.ip_address) || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {format(new Date(session.started_at), "dd/MM/yy HH:mm")}
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatDistanceToNow(new Date(session.last_active_at), { addSuffix: true, locale: dateFnsCampo() })}
                    </TableCell>
                    <TableCell>
                      {session.is_active ? (
                        <Badge variant="default" className="bg-green-600/10 text-green-700 border-green-600/20">
                          <Wifi className="h-3 w-3 mr-1" aria-hidden="true" /> {t("Aperta")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <WifiOff className="h-3 w-3 mr-1" aria-hidden="true" /> {t("Chiusa")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {puoChiudere && session.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => revokeMutation.mutate(session.id)}
                          disabled={revokeMutation.isPending}
                          aria-label={t("Chiudi questa sessione")}
                          title={t("Chiudi questa sessione")}
                        >
                          <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
                        </Button>
                      )}
                      {!session.is_active && session.revoke_reason && (
                        <span className="text-xs text-muted-foreground">{motivoChiusuraLeggibile(session.revoke_reason)}</span>
                      )}
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
