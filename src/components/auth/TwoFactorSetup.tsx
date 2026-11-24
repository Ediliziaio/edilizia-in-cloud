import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, ShieldCheck, ShieldOff, Copy, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const TOTP_TIMEOUT_MS = 15_000;

async function callTotp(action: string, extra: Record<string, string> = {}) {
  const request = supabase.functions.invoke("manage-totp", {
    body: { action, ...extra },
  });
  const timeout = new Promise<never>((_, reject) => {
    window.setTimeout(() => {
      reject(new Error("Servizio 2FA momentaneamente non disponibile. Riprova tra qualche secondo."));
    }, TOTP_TIMEOUT_MS);
  });
  const { data, error } = await Promise.race([request, timeout]);
  if (error) throw new Error(error.message || "Errore TOTP");
  if (data?.error) throw new Error(data.error);
  return data;
}

type SetupStep = "idle" | "qr" | "verify" | "backup" | "done";

export function TwoFactorSetup() {
  const t = useT();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<SetupStep>("idle");
  const [secret, setSecret] = useState("");
  const [otpauthUri, setOtpauthUri] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disableCode, setDisableCode] = useState("");
  const [showDisableDialog, setShowDisableDialog] = useState(false);

  const {
    data: status,
    error: statusError,
    isFetching: statusFetching,
    isLoading: statusLoading,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ["totp-status"],
    queryFn: () => callTotp("status"),
    retry: 1,
  });

  const setupMutation = useMutation({
    mutationFn: () => callTotp("setup"),
    onSuccess: (data) => {
      setSecret(data.secret);
      setOtpauthUri(data.otpauth_uri);
      setStep("qr");
    },
    onError: (err: Error) => toast({ title: t("Errore"), description: err.message, variant: "destructive" }),
  });

  const verifyMutation = useMutation({
    mutationFn: (token: string) => callTotp("verify", { token }),
    onSuccess: (data) => {
      setBackupCodes(data.backup_codes || []);
      setStep("backup");
      queryClient.invalidateQueries({ queryKey: ["totp-status"] });
      toast({ title: t("2FA attivata con successo!") });
    },
    onError: (err: Error) => toast({ title: t("Codice non valido"), description: err.message, variant: "destructive" }),
  });

  const disableMutation = useMutation({
    mutationFn: (token: string) => callTotp("disable", { token }),
    onSuccess: () => {
      setShowDisableDialog(false);
      setDisableCode("");
      queryClient.invalidateQueries({ queryKey: ["totp-status"] });
      toast({ title: t("2FA disattivata") });
    },
    onError: (err: Error) => toast({ title: t("Errore"), description: err.message, variant: "destructive" }),
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: t("Copiato negli appunti") });
  };

  if (statusLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            {t("Autenticazione a Due Fattori (2FA)")}
          </CardTitle>
          <CardDescription>
            {t("Verifico lo stato della protezione TOTP del tuo account.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (statusError) {
    const message = statusError instanceof Error
      ? statusError.message
      : t("Impossibile leggere lo stato 2FA in questo momento.");

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            {t("Autenticazione a Due Fattori (2FA)")}
          </CardTitle>
          <CardDescription>
            {t("Proteggi il tuo account con un codice TOTP da Google Authenticator o app simile.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {message}
          </div>
          <Button variant="outline" size="sm" onClick={() => refetchStatus()} disabled={statusFetching}>
            {statusFetching ? (
              <Loader2 className="h-3 w-3 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-2" />
            )}
            {t("Riprova controllo 2FA")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isEnabled = status?.enabled;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4" />
          {t("Autenticazione a Due Fattori (2FA)")}
        </CardTitle>
        <CardDescription>
          {t("Proteggi il tuo account con un codice TOTP da Google Authenticator o app simile.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isEnabled ? (
              <ShieldCheck className="h-5 w-5 text-green-600" />
            ) : (
              <ShieldOff className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="font-medium text-sm">
              {isEnabled ? t("2FA Attiva") : t("2FA Non attiva")}
            </span>
            {isEnabled && (
              <Badge variant="secondary" className="text-xs">{t("{backup_codes_remaining}/{backup_codes_total} codici backup", { backup_codes_remaining: String(status.backup_codes_remaining ?? ""), backup_codes_total: String(status.backup_codes_total ?? "") })}</Badge>
            )}
          </div>
          {isEnabled ? (
            <Button variant="outline" size="sm" onClick={() => setShowDisableDialog(true)}>
              {t("Disattiva")}
            </Button>
          ) : step === "idle" ? (
            <Button size="sm" onClick={() => setupMutation.mutate()} disabled={setupMutation.isPending}>
              {setupMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              {t("Configura 2FA")}
            </Button>
          ) : null}
        </div>

        {/* Step: QR Code */}
        {step === "qr" && (
          <div className="border rounded-lg p-4 space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("1. Scansiona il QR code con la tua app di autenticazione")}</p>
              <div className="flex justify-center p-4 bg-white rounded-lg">
                <img loading="lazy"
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUri)}`}
                  alt={t("QR Code TOTP")}
                  className="w-48 h-48"
                />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("Oppure inserisci manualmente questo codice:")}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded text-xs font-mono break-all">{secret}</code>
                <Button variant="ghost" size="icon" onClick={() => copyToClipboard(secret)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <Button onClick={() => setStep("verify")} className="w-full">
              {t("Continua")}
            </Button>
          </div>
        )}

        {/* Step: Verify */}
        {step === "verify" && (
          <div className="border rounded-lg p-4 space-y-4">
            <p className="text-sm font-medium">{t("2. Inserisci il codice a 6 cifre dalla tua app")}</p>
            <div className="flex gap-2">
              <Input
                placeholder="000000"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                className="font-mono text-center text-lg tracking-widest"
              />
              <Button
                onClick={() => verifyMutation.mutate(verifyCode)}
                disabled={verifyCode.length !== 6 || verifyMutation.isPending}
              >
                {verifyMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                {t("Verifica")}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Backup Codes */}
        {step === "backup" && (
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">{t("3. Salva i codici di backup")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("Questi codici possono essere usati al posto del TOTP se perdi l'accesso alla tua app. Ogni codice può essere usato una sola volta.")}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 bg-muted p-3 rounded-lg">
              {backupCodes.map((code, i) => (
                <code key={i} className="text-sm font-mono text-center py-1">{code}</code>
              ))}
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => copyToClipboard(backupCodes.join("\n"))}
            >
              <Copy className="h-4 w-4 mr-2" /> {t("Copia tutti i codici")}
            </Button>
            <Button className="w-full" onClick={() => { setStep("done"); }}>
              {t("Ho salvato i codici")}
            </Button>
          </div>
        )}

        {/* Disable dialog */}
        <AlertDialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("Disattivare 2FA?")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("Inserisci il codice corrente dalla tua app per confermare la disattivazione.")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              placeholder="000000"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              className="font-mono text-center text-lg tracking-widest"
            />
            <AlertDialogFooter>
              <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => disableMutation.mutate(disableCode)}
                disabled={disableCode.length !== 6 || disableMutation.isPending}
              >
                {disableMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                {t("Disattiva")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
