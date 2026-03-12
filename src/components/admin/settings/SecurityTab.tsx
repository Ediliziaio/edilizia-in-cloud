import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminSessions, useRevokeSession } from "@/hooks/useAdminSessions";
import { toast } from "sonner";
import {
  Lock, Eye, EyeOff, Shield, Monitor, Trash2, Loader2,
  RefreshCw, AlertTriangle, CheckCircle2, Smartphone, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

// ─── STRENGTH INDICATOR ───────────────────────────────────────────────────────

function getPasswordStrength(pwd: string): { level: number; label: string } {
  if (pwd.length < 6) return { level: 0, label: "Troppo corta" };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;

  const levels = [
    { level: 1, label: "Debole" },
    { level: 2, label: "Scarsa" },
    { level: 3, label: "Media" },
    { level: 4, label: "Buona" },
    { level: 5, label: "Ottima" },
  ];
  return levels[Math.min(score, 5) - 1] ?? levels[0];
}

function strengthColor(level: number): string {
  if (level <= 1) return "bg-destructive";
  if (level === 2) return "bg-orange-400";
  if (level === 3) return "bg-yellow-400";
  if (level === 4) return "bg-blue-400";
  return "bg-green-500";
}

function strengthTextColor(level: number): string {
  if (level >= 4) return "text-green-600";
  if (level === 3) return "text-yellow-600";
  return "text-destructive";
}

// ─── SESSIONI CARD ─────────────────────────────────────────────────────────────

function SessionsCard() {
  const { data: sessions, isLoading, refetch, isFetching } = useAdminSessions();
  const { mutate: revoke, isPending: isRevoking } = useRevokeSession();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Monitor className="h-4 w-4" />
              Sessioni attive
            </CardTitle>
            <CardDescription>
              Dispositivi con accesso al tuo account Super Admin
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : !sessions || sessions.length === 0 ? (
          <div className="text-center py-6 space-y-2">
            <Info className="h-5 w-5 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nessuna sessione attiva registrata.
            </p>
            <p className="text-xs text-muted-foreground">
              Le sessioni verranno tracciate automaticamente dal prossimo accesso.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-muted p-2">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {session.deviceHint ?? "Dispositivo sconosciuto"}
                      </span>
                      {session.isCurrent && (
                        <Badge variant="secondary" className="text-xs">
                          Sessione corrente
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {session.ipAddress ?? "IP sconosciuto"} •{" "}
                      {formatDistanceToNow(new Date(session.lastSeenAt), {
                        addSuffix: true,
                        locale: it,
                      })}
                    </p>
                  </div>
                </div>
                {!session.isCurrent && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => revoke(session.id)}
                    disabled={isRevoking}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {sessions.length > 1 && (
              <>
                <Separator />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => {
                    const others = sessions.filter((s) => !s.isCurrent);
                    others.forEach((s) => revoke(s.id));
                  }}
                  disabled={isRevoking}
                >
                  Revoca tutte le altre sessioni
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── PASSWORD CARD ─────────────────────────────────────────────────────────────

function PasswordCard() {
  const { user } = useAuth();
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = getPasswordStrength(newPwd);
  const canSubmit = newPwd.length >= 8 && newPwd === confirmPwd;

  const handleSubmit = async () => {
    setError(null);
    if (newPwd !== confirmPwd) {
      setError("Le password non coincidono");
      return;
    }
    if (newPwd.length < 8) {
      setError("La password deve essere almeno 8 caratteri");
      return;
    }

    setIsLoading(true);
    try {
      // updateUser requires a valid session — no need to re-authenticate separately.
      // The nonce/old_password check is handled server-side by Supabase.
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPwd,
      });
      if (updateError) {
        if (updateError.message?.includes("same")) {
          setError("La nuova password deve essere diversa da quella attuale");
        } else {
          throw updateError;
        }
        return;
      }

      toast.success("Password aggiornata con successo");
      setNewPwd("");
      setConfirmPwd("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="h-4 w-4" />
          Cambia password
        </CardTitle>
        <CardDescription>
          Usa una password forte e unica per proteggere il tuo account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label>Nuova password</Label>
          <div className="relative">
            <Input
              type={showNew ? "text" : "password"}
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder="Minimo 8 caratteri"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {newPwd.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      i <= strength.level ? strengthColor(strength.level) : "bg-muted"
                    }`}
                  />
                ))}
              </div>
              <p className={`text-xs ${strengthTextColor(strength.level)}`}>
                Password {strength.label}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Conferma nuova password</Label>
          <div className="relative">
            <Input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              placeholder="Ripeti la nuova password"
              className={confirmPwd && newPwd !== confirmPwd ? "border-destructive" : ""}
            />
            {confirmPwd && newPwd === confirmPwd && (
              <CheckCircle2 className="absolute right-3 top-2.5 h-4 w-4 text-green-500" />
            )}
          </div>
          {confirmPwd && newPwd !== confirmPwd && (
            <p className="text-xs text-destructive">Le password non coincidono</p>
          )}
        </div>

        <Separator />

        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={!canSubmit || isLoading} className="gap-2">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Shield className="h-4 w-4" />
            )}
            Aggiorna password
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── PAGINA SICUREZZA ─────────────────────────────────────────────────────────

export default function SecurityTab() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sicurezza</h1>
        <p className="text-muted-foreground">
          Gestisci la tua password e controlla i dispositivi connessi al tuo account.
        </p>
      </div>

      <PasswordCard />
      <SessionsCard />
    </div>
  );
}
