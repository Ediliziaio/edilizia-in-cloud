import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { queryKeys } from "@/lib/queryKeys";
import { userErrorMessage } from "@/lib/userErrorMessage";
import { format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { Shield, ShieldOff, Key, Lock, LockOpen, AlertTriangle, CheckCircle2 } from "lucide-react";
import { BloccoAccessoCard } from "./BloccoAccessoCard";
import { Button } from "@/components/ui/button";
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
  /** Chi può cambiare le cose: l'amministratore. Gli altri guardano. */
  isAdmin?: boolean;
  isCurrentUser?: boolean;
  isTargetAdmin?: boolean;
}

/**
 * Sicurezza di una persona: se può entrare, la password, la verifica in due
 * passaggi. «Stato dell'accesso» dice una cosa sola e vera: prima il riquadro
 * guardava solo il blocco per password sbagliate e a una persona bloccata
 * dall'amministratore scriveva «Account attivo» con la spunta verde, due righe
 * sotto la scheda rossa «Accesso bloccato».
 */
export function UserSecurityTab({ userId, user, isAdmin, isCurrentUser, isTargetAdmin }: UserSecurityTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [require2fa, setRequire2fa] = useState(user.require_2fa || false);
  const canBlockUser = isAdmin && !isCurrentUser && !isTargetAdmin;

  const isLocked = !!user.locked_until && new Date(user.locked_until) > new Date();
  const isBlocked = !!user.is_blocked;
  const failedAttempts = user.failed_login_count || 0;

  const passwordAge = user.password_changed_at
    ? differenceInDays(new Date(), new Date(user.password_changed_at))
    : null;

  const unlockMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ locked_until: null, failed_login_count: 0 } as never)
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      toast({ title: "Blocco tolto", description: "Può riprovare a entrare." });
    },
    onError: (e: unknown) => {
      toast({ title: "Non sono riuscito a togliere il blocco", description: userErrorMessage(e, "Riprova tra un attimo."), variant: "destructive" });
    },
  });

  const toggle2faMutation = useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await supabase
        .from("profiles")
        .update({ require_2fa: value } as never)
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: (_, value) => {
      setRequire2fa(value);
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      toast({ title: value ? "L'app di verifica sarà richiesta" : "L'app di verifica non è più richiesta" });
    },
    onError: (e: unknown) => {
      toast({ title: "Non sono riuscito a cambiare la richiesta", description: userErrorMessage(e, "Riprova tra un attimo."), variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      // Manda solo un link: la password di prima resta valida finché la persona non lo usa.
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", userId)
        .single();
      if (!profile?.email) throw new Error("Email non trovata");

      // Senza redirectTo si finisce sul Site URL del progetto: il link
      // apre una sessione e porta dritti nell'app, senza mai mostrare il
      // form della nuova password. L'utente entra una volta e alla
      // successiva e' di nuovo chiuso fuori.
      const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Link inviato", description: "La persona riceverà un'email per scegliere una nuova password." });
    },
    onError: (e: unknown) => {
      toast({ title: "Non sono riuscito a mandare l'email", description: userErrorMessage(e, "Riprova tra un attimo."), variant: "destructive" });
    },
  });

  /** Una frase sola sul blocco: l'amministratore vince sul blocco per password sbagliate. */
  const bloccoTesto = isBlocked
    ? "Accesso bloccato dall'amministratore"
    : isLocked
      ? `Bloccato fino alle ${format(new Date(user.locked_until!), "HH:mm 'del' dd/MM", { locale: it })} per password sbagliate`
      : "Nessun blocco";

  return (
    <div className="space-y-6 max-sm:space-y-3">
      <BloccoAccessoCard
        userId={userId}
        isBlocked={isBlocked}
        blockedAt={user.blocked_at}
        blockReason={user.block_reason}
        puoBloccare={!!canBlockUser}
      />

      {/* Stato dell'accesso */}
      <Card>
        <CardHeader className="max-sm:p-4 max-sm:pb-1">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" aria-hidden="true" /> Stato dell'accesso
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 max-sm:p-4 max-sm:pt-0">
          {/* Mobile: righe etichetta/valore al posto dei quattro riquadri. */}
          <dl className="divide-y divide-border text-sm sm:hidden">
            <div className="flex items-center justify-between gap-2 py-2">
              <dt className={isBlocked || isLocked ? "flex items-center gap-1.5 text-destructive" : "text-muted-foreground"}>
                {isBlocked || isLocked ? <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
                {bloccoTesto}
              </dt>
              <dd>
                {isLocked && !isBlocked && isAdmin && (
                  <Button variant="outline" size="sm" className="tap-compact h-8" onClick={() => unlockMutation.mutate()} disabled={unlockMutation.isPending}>
                    Togli il blocco
                  </Button>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2 py-2">
              <dt className="text-muted-foreground">Password sbagliate di fila</dt>
              <dd className={failedAttempts > 0 ? "font-medium text-orange-600" : ""}>{failedAttempts}</dd>
            </div>
            <div className="flex items-center justify-between gap-2 py-2">
              <dt className="text-muted-foreground">Ultimo accesso</dt>
              <dd>
                {user.last_login_at
                  ? format(new Date(user.last_login_at), "dd/MM/yyyy HH:mm", { locale: it })
                  : "Mai"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2 py-2">
              <dt className="text-muted-foreground">Ultimo indirizzo (IP)</dt>
              <dd className="truncate font-mono text-xs">{user.last_login_ip || "—"}</dd>
            </div>
          </dl>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-sm:hidden">
            {/* Blocco */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg border">
              <div className="flex items-center gap-2">
                {isBlocked ? (
                  <ShieldOff className="h-4 w-4 text-destructive" aria-hidden="true" />
                ) : isLocked ? (
                  <Lock className="h-4 w-4 text-destructive" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
                )}
                <div>
                  <p className="text-sm font-medium">Blocco</p>
                  <p className={`text-xs ${isBlocked || isLocked ? "text-destructive" : "text-muted-foreground"}`}>{bloccoTesto}</p>
                </div>
              </div>
              {isLocked && !isBlocked && isAdmin && (
                <Button variant="outline" size="sm" onClick={() => unlockMutation.mutate()} disabled={unlockMutation.isPending}>
                  <LockOpen className="h-3 w-3 mr-1" aria-hidden="true" /> Togli il blocco
                </Button>
              )}
            </div>

            {/* Password sbagliate */}
            <div className="flex items-center gap-2 p-3 rounded-lg border">
              {failedAttempts > 0 ? (
                <AlertTriangle className="h-4 w-4 text-orange-600" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
              )}
              <div>
                <p className="text-sm font-medium">Password sbagliate di fila</p>
                <p className="text-xs text-muted-foreground">{failedAttempts}</p>
              </div>
            </div>

            {/* Ultimo accesso */}
            <div className="flex items-center gap-2 p-3 rounded-lg border">
              <Key className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Ultimo accesso</p>
                <p className="text-xs text-muted-foreground">
                  {user.last_login_at
                    ? format(new Date(user.last_login_at), "dd/MM/yyyy HH:mm", { locale: it })
                    : "Mai"}
                </p>
              </div>
            </div>

            {/* Ultimo indirizzo */}
            <div className="flex items-center gap-2 p-3 rounded-lg border">
              <Shield className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Ultimo indirizzo di rete (IP)</p>
                <p className="text-xs text-muted-foreground font-mono">{user.last_login_ip || "—"}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Password */}
      {/* Mobile: niente titoli su Password e verifica, la riga dice già cosa sono. */}
      <Card>
        <CardHeader className="max-sm:hidden">
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="h-4 w-4" aria-hidden="true" /> Password
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 max-sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Ultimo cambio password</p>
              <p className="text-xs text-muted-foreground">
                {user.password_changed_at
                  ? `${format(new Date(user.password_changed_at), "dd/MM/yyyy")} (${passwordAge === 0 ? "oggi" : passwordAge === 1 ? "ieri" : `${passwordAge} giorni fa`})`
                  : "Mai cambiata"}
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline" size="sm" className="shrink-0" disabled={!isAdmin || resetPasswordMutation.isPending}
                  aria-label="Invia il link per scegliere una nuova password"
                >
                  <span className="max-sm:hidden">Invia il link per scegliere una nuova password</span>
                  <span className="sm:hidden">Invia il link</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Mandare il link per cambiare la password?</AlertDialogTitle>
                  <AlertDialogDescription>
                    La persona riceve un'email con un link per scegliere una nuova password. Quella di prima continua a
                    funzionare finché non lo usa. Per chiudere gli accessi già aperti vai in «Sessioni».
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction onClick={() => resetPasswordMutation.mutate()}>
                    Invia il link
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <p className="text-xs text-muted-foreground max-sm:hidden">
            Per cambiare la password subito e mandarla alla persona per email, vai in «Dati».
          </p>
        </CardContent>
      </Card>

      {/* Verifica in due passaggi */}
      <Card>
        <CardHeader className="max-sm:hidden">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" aria-hidden="true" /> Verifica in due passaggi
          </CardTitle>
        </CardHeader>
        <CardContent className="max-sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="require-2fa" className="text-sm font-medium">Chiedi l'app di verifica</Label>
              <p id="require-2fa-descrizione" className="text-xs text-muted-foreground max-sm:hidden">
                Al prossimo accesso dovrà collegare un'app (Google Authenticator o simili). Se la persona la disattiva, la richiesta si spegne.
              </p>
            </div>
            <Switch
              id="require-2fa"
              aria-describedby="require-2fa-descrizione"
              checked={require2fa}
              onCheckedChange={(v) => toggle2faMutation.mutate(v)}
              disabled={!isAdmin || toggle2faMutation.isPending}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
