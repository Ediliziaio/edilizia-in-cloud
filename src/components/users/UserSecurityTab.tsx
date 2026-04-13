import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { queryKeys } from "@/lib/queryKeys";
import { format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { Shield, Key, Lock, LockOpen, AlertTriangle, CheckCircle2, ShieldOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface UserSecurityTabProps {
  userId: string;
  user: {
    require_2fa?: boolean;
    password_changed_at?: string | null;
    failed_login_count?: number;
    locked_until?: string | null;
    last_login_at?: string | null;
    last_login_ip?: string | null;
    is_blocked?: boolean;
    blocked_at?: string | null;
    block_reason?: string | null;
  };
  passwordExpiryDays?: number;
  isAdmin?: boolean;
  isCurrentUser?: boolean;
  isTargetAdmin?: boolean;
}

export function UserSecurityTab({ userId, user, passwordExpiryDays = 0, isAdmin, isCurrentUser, isTargetAdmin }: UserSecurityTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [require2fa, setRequire2fa] = useState(user.require_2fa || false);
  const canBlockUser = isAdmin && !isCurrentUser && !isTargetAdmin;

  const isLocked = user.locked_until && new Date(user.locked_until) > new Date();
  const failedAttempts = user.failed_login_count || 0;

  const passwordAge = user.password_changed_at
    ? differenceInDays(new Date(), new Date(user.password_changed_at))
    : null;
  const passwordExpired = passwordExpiryDays > 0 && passwordAge !== null && passwordAge > passwordExpiryDays;

  const unlockMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ locked_until: null, failed_login_count: 0 } as any)
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      toast({ title: "Account sbloccato" });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile sbloccare l'account.", variant: "destructive" });
    },
  });

  const toggle2faMutation = useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await supabase
        .from("profiles")
        .update({ require_2fa: value } as any)
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: (_, value) => {
      setRequire2fa(value);
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      toast({ title: value ? "2FA richiesta attivata" : "2FA richiesta disattivata" });
    },
    onError: () => {
      toast({ title: "Errore", variant: "destructive" });
    },
  });

  const blockAccessMutation = useMutation({
    mutationFn: async (block: boolean) => {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_blocked: block,
          blocked_at: block ? new Date().toISOString() : null,
          blocked_by: block ? userId : null, // will be overwritten by the caller's context
          block_reason: block ? "Bloccato dall'amministratore" : null,
        } as any)
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: (_, block) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      toast({ title: block ? "Accesso bloccato" : "Accesso ripristinato", description: block ? "L'utente non potrà più effettuare il login." : "L'utente può di nuovo accedere al sistema." });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile modificare lo stato dell'accesso.", variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      // Send password reset email via edge function or Supabase auth admin
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", userId)
        .single();
      if (!profile?.email) throw new Error("Email non trovata");

      const { error } = await supabase.auth.resetPasswordForEmail(profile.email);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Email di reset inviata", description: "L'utente riceverà un'email per reimpostare la password." });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile inviare l'email di reset.", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      {/* Blocco Accesso */}
      {canBlockUser && (
        <Card className={user.is_blocked ? "border-destructive/50 bg-destructive/5" : ""}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {user.is_blocked ? (
                <ShieldOff className="h-4 w-4 text-destructive" />
              ) : (
                <ShieldCheck className="h-4 w-4 text-green-600" />
              )}
              Blocco Accesso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4">
              <div>
                {user.is_blocked ? (
                  <>
                    <p className="text-sm font-medium text-destructive">Accesso bloccato</p>
                    <p className="text-xs text-muted-foreground">
                      L'utente non può effettuare il login.
                      {user.blocked_at && ` Bloccato il ${format(new Date(user.blocked_at), "dd/MM/yyyy HH:mm", { locale: it })}.`}
                    </p>
                    {user.block_reason && (
                      <p className="text-xs text-muted-foreground mt-1">Motivo: {user.block_reason}</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-green-700">Accesso consentito</p>
                    <p className="text-xs text-muted-foreground">L'utente può effettuare il login normalmente.</p>
                  </>
                )}
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  {user.is_blocked ? (
                    <Button variant="outline" size="sm" className="shrink-0">
                      <ShieldCheck className="h-4 w-4 mr-1.5 text-green-600" /> Ripristina Accesso
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10">
                      <ShieldOff className="h-4 w-4 mr-1.5" /> Blocca Accesso
                    </Button>
                  )}
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {user.is_blocked ? "Ripristinare l'accesso?" : "Bloccare l'accesso?"}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {user.is_blocked
                        ? "L'utente potrà di nuovo effettuare il login e accedere al sistema."
                        : "L'utente non potrà più effettuare il login. L'account non verrà eliminato e potrà essere riattivato in qualsiasi momento."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => blockAccessMutation.mutate(!user.is_blocked)}
                      className={user.is_blocked ? "" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
                    >
                      {user.is_blocked ? "Ripristina Accesso" : "Blocca Accesso"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Account Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> Stato Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Lock status */}
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-2">
                {isLocked ? (
                  <Lock className="h-4 w-4 text-destructive" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                )}
                <div>
                  <p className="text-sm font-medium">Stato Blocco</p>
                  <p className="text-xs text-muted-foreground">
                    {isLocked
                      ? `Bloccato fino a ${format(new Date(user.locked_until!), "dd/MM/yy HH:mm")}`
                      : "Account attivo"}
                  </p>
                </div>
              </div>
              {isLocked && (
                <Button variant="outline" size="sm" onClick={() => unlockMutation.mutate()} disabled={unlockMutation.isPending}>
                  <LockOpen className="h-3 w-3 mr-1" /> Sblocca
                </Button>
              )}
            </div>

            {/* Failed attempts */}
            <div className="flex items-center gap-2 p-3 rounded-lg border">
              {failedAttempts > 0 ? (
                <AlertTriangle className="h-4 w-4 text-orange-600" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              )}
              <div>
                <p className="text-sm font-medium">Tentativi Falliti</p>
                <p className="text-xs text-muted-foreground">{failedAttempts} tentativi</p>
              </div>
            </div>

            {/* Last login */}
            <div className="flex items-center gap-2 p-3 rounded-lg border">
              <Key className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Ultimo Login</p>
                <p className="text-xs text-muted-foreground">
                  {user.last_login_at
                    ? format(new Date(user.last_login_at), "dd/MM/yyyy HH:mm", { locale: it })
                    : "Mai"}
                </p>
              </div>
            </div>

            {/* Last login IP */}
            <div className="flex items-center gap-2 p-3 rounded-lg border">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Ultimo IP</p>
                <p className="text-xs text-muted-foreground font-mono">{user.last_login_ip || "—"}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="h-4 w-4" /> Password
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Ultimo cambio password</p>
              <p className="text-xs text-muted-foreground">
                {user.password_changed_at
                  ? `${format(new Date(user.password_changed_at), "dd/MM/yyyy")} (${passwordAge} giorni fa)`
                  : "Mai cambiata"}
              </p>
              {passwordExpired && (
                <Badge variant="destructive" className="mt-1">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Password scaduta
                </Badge>
              )}
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  Forza Reset Password
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Forzare il reset della password?</AlertDialogTitle>
                  <AlertDialogDescription>
                    L'utente riceverà un'email per reimpostare la password. Le sessioni attive rimarranno valide.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction onClick={() => resetPasswordMutation.mutate()}>
                    Invia Email Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* 2FA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> Autenticazione a Due Fattori
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="require-2fa" className="text-sm font-medium">Richiedi 2FA per questo utente</Label>
              <p className="text-xs text-muted-foreground">Al prossimo login verrà richiesta la configurazione 2FA.</p>
            </div>
            <Switch
              id="require-2fa"
              checked={require2fa}
              onCheckedChange={(v) => toggle2faMutation.mutate(v)}
              disabled={toggle2faMutation.isPending}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
