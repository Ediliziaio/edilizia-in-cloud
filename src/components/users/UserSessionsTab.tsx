import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { queryKeys } from "@/lib/queryKeys";
import { formatDistanceToNow, format } from "date-fns";
import { it } from "date-fns/locale";
import { Loader2, Monitor, Smartphone, Tablet, Wifi, WifiOff, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface UserSessionsTabProps {
  userId: string;
}

const deviceIcon = (type: string | null) => {
  if (type === "mobile") return <Smartphone className="h-4 w-4" />;
  if (type === "tablet") return <Tablet className="h-4 w-4" />;
  return <Monitor className="h-4 w-4" />;
};

export function UserSessionsTab({ userId }: UserSessionsTabProps) {
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
      const { error } = await supabase.functions.invoke("revoke-user-session", {
        body: { session_id: sessionId, reason: "Revoked by admin" },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-sessions", userId] });
      toast({ title: "Sessione revocata" });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile revocare la sessione.", variant: "destructive" });
    },
  });

  const revokeAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("revoke-user-session", {
        body: { revoke_all_for_user: userId, reason: "All sessions revoked by admin" },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-sessions", userId] });
      toast({ title: "Tutte le sessioni revocate" });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile revocare le sessioni.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
            <CardTitle className="text-base">Sessioni Attive</CardTitle>
            <CardDescription>{activeSessions.length} sessioni attive</CardDescription>
          </div>
          {activeSessions.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={revokeAllMutation.isPending}>
                  Revoca Tutte
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revocare tutte le sessioni?</AlertDialogTitle>
                  <AlertDialogDescription>
                    L'utente verrà disconnesso da tutti i dispositivi.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction onClick={() => revokeAllMutation.mutate()}>
                    Revoca Tutte
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Button variant={!showAll ? "default" : "outline"} size="sm" onClick={() => setShowAll(false)}>
              Attive ({activeSessions.length})
            </Button>
            <Button variant={showAll ? "default" : "outline"} size="sm" onClick={() => setShowAll(true)}>
              Tutte ({sessions?.length || 0})
            </Button>
          </div>

          {(!displaySessions || displaySessions.length === 0) ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nessuna sessione trovata.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dispositivo</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Inizio</TableHead>
                  <TableHead>Ultima Attività</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displaySessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {deviceIcon(session.device_type)}
                        <div>
                          <p className="text-sm font-medium">{session.browser || "Sconosciuto"}</p>
                          <p className="text-xs text-muted-foreground">{session.os || "—"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{String(session.ip_address) || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {format(new Date(session.started_at), "dd/MM/yy HH:mm")}
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatDistanceToNow(new Date(session.last_active_at), { addSuffix: true, locale: it })}
                    </TableCell>
                    <TableCell>
                      {session.is_active ? (
                        <Badge variant="default" className="bg-green-600/10 text-green-700 border-green-600/20">
                          <Wifi className="h-3 w-3 mr-1" /> Attiva
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <WifiOff className="h-3 w-3 mr-1" /> Terminata
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {session.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => revokeMutation.mutate(session.id)}
                          disabled={revokeMutation.isPending}
                        >
                          <XCircle className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                      {!session.is_active && session.revoke_reason && (
                        <span className="text-xs text-muted-foreground">{session.revoke_reason}</span>
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
