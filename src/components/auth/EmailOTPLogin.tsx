/**
 * EmailOTPLogin — v8.6.99
 *
 * 2FA via codice email (6 cifre, TTL 15min). Mostrato DOPO il login con
 * email+password ha avuto successo. L'utente HA GIÀ la sessione Supabase
 * attiva — questa UI è il secondo step di verifica.
 *
 * Flusso:
 *   1. LoginForm fa signInWithPassword OK → mostra questa view
 *   2. Subito al mount: chiama email-otp-send (codice arriva in email)
 *   3. Utente inserisce 6 cifre → email-otp-verify → status ok
 *   4. onSuccess (=login completato) → redirect alla dashboard
 *   5. onBack/cancel → signOut + return to login
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  /** Email dell'utente appena loggato (per mostrare conferma + invio OTP). */
  email: string;
  /** Click su "Annulla" → signOut + torna a login. */
  onCancel: () => void;
  /** OTP verificato → naviga alla dashboard. */
  onVerified: () => void;
}

const OTP_TTL_MIN = 15;
const RESEND_COOLDOWN_SEC = 60;

// ─── OTP input inline (no extra deps) ──────────────────────────────────────
interface OtpInputProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  onComplete?: (v: string) => void;
}

function OtpInput({ value, onChange, disabled, onComplete }: OtpInputProps) {
  const t = useT();
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const chars = value.padEnd(6, " ").slice(0, 6).split("");

  const setChar = useCallback(
    (idx: number, ch: string) => {
      const digit = ch.replace(/\D/g, "").slice(-1);
      const arr = chars.map((c) => c.trim());
      while (arr.length < 6) arr.push("");
      arr[idx] = digit;
      const newVal = arr.join("");
      onChange(newVal);
      if (digit && idx < 5) refs.current[idx + 1]?.focus();
      if (newVal.replace(/\s/g, "").length === 6) onComplete?.(newVal);
    },
    [chars, onChange, onComplete],
  );

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !chars[idx].trim() && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && idx > 0) refs.current[idx - 1]?.focus();
    if (e.key === "ArrowRight" && idx < 5) refs.current[idx + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length === 6) {
      e.preventDefault();
      onChange(text);
      onComplete?.(text);
      refs.current[5]?.focus();
    }
  };

  return (
    <div className="flex items-center justify-center gap-2">
      {chars.map((ch, idx) => (
        <Input
          key={idx}
          ref={(el) => { refs.current[idx] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={ch.trim()}
          onChange={(e) => setChar(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={handlePaste}
          disabled={disabled}
          className="h-12 w-10 text-center text-lg font-bold tabular-nums"
          autoComplete="one-time-code"
          aria-label={t("Cifra {idx} di 6", { idx: idx + 1 })}
        />
      ))}
    </div>
  );
}

export function EmailOTPLogin({ email, onCancel, onVerified }: Props) {
  const t = useT();
  const { toast } = useToast();
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SEC);
  // Codice demo per account *@azienda.srl: l'edge function lo ritorna direttamente
  // (no email reale) e qui lo mostriamo + auto-fill per evitare lockout.
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const sentOnceRef = useRef(false);

  // Countdown reinvio
  useEffect(() => {
    if (secondsLeft <= 0) return;
    timerRef.current = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [secondsLeft]);

  // Invia codice al mount (1 volta sola)
  const sendCode = useCallback(async (showToast = true) => {
    if (!email) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("email-otp-send", {
        body: { email: email.trim().toLowerCase() },
      });
      if (error) {
        toast({ title: t("Errore invio codice"), description: error.message, variant: "destructive" });
        return;
      }
      const result = data as { status?: string; cooldown?: number; demo?: boolean; demo_code?: string } | null;
      const status = result?.status;
      if (status === "rate_limited") {
        const cooldown = result?.cooldown ?? RESEND_COOLDOWN_SEC;
        setSecondsLeft(cooldown);
        toast({
          title: t("Codice già inviato"),
          description: t("Aspetta {cooldown}s prima di richiederne uno nuovo.", { cooldown: String(cooldown ?? "") }),
        });
        return;
      }
      setSecondsLeft(RESEND_COOLDOWN_SEC);
      // Account demo: edge function ha bypassato l'invio email e ritorna il codice
      // direttamente. Lo mostriamo in UI + auto-fill per evitare lockout su mailbox
      // inesistenti (@azienda.srl).
      if (result?.demo && result?.demo_code) {
        setDemoCode(result.demo_code);
        setOtp(result.demo_code);
        if (showToast) {
          toast({
            title: t("Account demo — codice automatico"),
            description: t("Codice {demo_code} inserito. Premi \"Conferma e accedi\".", { demo_code: String(result.demo_code ?? "") }),
          });
        }
        return;
      }
      if (showToast) {
        toast({
          title: t("Codice inviato"),
          description: t("Controlla la casella di posta (anche spam). Valido {OTP_TTL_MIN} minuti.", { OTP_TTL_MIN: String(OTP_TTL_MIN ?? "") }),
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [email, toast, t]);

  useEffect(() => {
    if (sentOnceRef.current) return;
    sentOnceRef.current = true;
    void sendCode(true);
  }, [sendCode]);

  const verifyOtp = async () => {
    const cleanOtp = otp.replace(/\D/g, "");
    if (cleanOtp.length !== 6) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("email-otp-verify", {
        body: { email: email.trim().toLowerCase(), code: cleanOtp },
      });
      if (error) {
        toast({ title: t("Errore verifica"), description: error.message, variant: "destructive" });
        setOtp("");
        return;
      }
      const result = data as { status?: string; attempts_left?: number } | null;
      if (!result || result.status !== "ok") {
        const msg =
          result?.status === "expired"
            ? t("Il codice è scaduto. Richiedine uno nuovo.")
            : result?.status === "too_many_attempts"
              ? t("Troppi tentativi falliti. Richiedi un nuovo codice.")
              : result?.status === "no_active_code"
                ? t("Nessun codice attivo. Richiedine uno nuovo.")
                : result?.attempts_left !== undefined
                  ? t("Codice non valido ({n} tentativi rimasti).", { n: result.attempts_left })
                  : t("Codice non valido.");
        toast({ title: t("Codice non valido"), description: msg, variant: "destructive" });
        setOtp("");
        return;
      }
      toast({ title: t("Accesso confermato"), description: t("Stai entrando…") });
      onVerified();
    } finally {
      setIsLoading(false);
    }
  };

  const maskedEmail = (() => {
    const at = email.indexOf("@");
    if (at <= 0) return email;
    const local = email.slice(0, at);
    const domain = email.slice(at);
    const masked = local.slice(0, 2) + "•".repeat(Math.max(1, local.length - 2));
    return masked + domain;
  })();

  return (
    <div className="animate-in fade-in-0 duration-300 space-y-5">
      <div className="text-center space-y-2">
        <div className="mx-auto h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <ShieldCheck className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <h2 className="text-xl font-bold text-foreground">{t("Verifica di sicurezza")}</h2>
        <p className="text-sm text-muted-foreground">
          {demoCode ? (
            <>
              {t("Account demo — nessuna email inviata a")}{" "}
              <strong className="text-foreground">{maskedEmail}</strong>
            </>
          ) : (
            <>
              {t("Abbiamo inviato un codice a")} <strong className="text-foreground">{maskedEmail}</strong>
            </>
          )}
        </p>
      </div>

      {demoCode && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 text-center">
          <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300 font-semibold mb-1">
            {t("Codice demo")}
          </p>
          <p className="text-2xl font-mono font-bold tracking-[0.4em] text-amber-900 dark:text-amber-100">
            {demoCode}
          </p>
          <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-1.5">
            {t("Già inserito sotto · premi \"Conferma e accedi\"")}
          </p>
        </div>
      )}

      <div className="space-y-3">
        <Label className="text-center block">{t("Inserisci il codice a 6 cifre")}</Label>
        <OtpInput
          value={otp}
          onChange={setOtp}
          disabled={isLoading}
          onComplete={() => void verifyOtp()}
        />
      </div>

      <Button
        onClick={() => void verifyOtp()}
        className="w-full"
        disabled={isLoading || otp.replace(/\D/g, "").length !== 6}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {t("Verifica…")}
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {t("Conferma e accedi")}
          </>
        )}
      </Button>

      <div className="text-center text-xs text-muted-foreground space-y-2">
        <div>
          {t("Non hai ricevuto l'email?")}{" "}
          {secondsLeft > 0 ? (
            <span>{t("Reinvia tra {secondsLeft}s", { secondsLeft: String(secondsLeft ?? "") })}</span>
          ) : (
            <button
              type="button"
              onClick={() => void sendCode(true)}
              disabled={isLoading}
              className="text-primary hover:underline font-medium"
            >
              {t("Reinvia codice")}
            </button>
          )}
        </div>
        <p className="text-[11px]">
          <Mail className="inline h-3 w-3 mr-1" />
          {t("Controlla anche spam. Valido {OTP_TTL_MIN} minuti.", { OTP_TTL_MIN: String(OTP_TTL_MIN ?? "") })}
        </p>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onCancel}
        className="w-full text-muted-foreground"
        type="button"
        disabled={isLoading}
      >
        <ArrowLeft className="h-3.5 w-3.5 mr-1" />
        {t("Annulla e torna al login")}
      </Button>
    </div>
  );
}
