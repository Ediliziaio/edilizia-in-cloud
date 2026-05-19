/**
 * EmailOTPLogin — v8.6.97
 *
 * Login senza password con codice OTP a 6 cifre inviato via email.
 * Più sicuro di "password riusata" + più semplice di "password complessa".
 *
 * Flusso:
 *  1. Utente inserisce email → click "Invia codice"
 *  2. Supabase invia email con OTP (TTL 15min, configurato lato dashboard)
 *  3. Utente legge email → inserisce 6 cifre → click "Verifica"
 *  4. supabase.auth.verifyOtp() autentica + Auth listener completa il login
 *
 * Va integrato accanto al form email/password classico via un bottone
 * "Accedi senza password".
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, ArrowLeft, KeyRound, CheckCircle2 } from "lucide-react";

// ─── OTP input inline (no extra deps) ──────────────────────────────────────
interface OtpInputProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  onComplete?: (v: string) => void;
}

function OtpInput({ value, onChange, disabled, onComplete }: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const chars = value.padEnd(6, " ").slice(0, 6).split("");

  const setChar = useCallback(
    (idx: number, ch: string) => {
      const digit = ch.replace(/\D/g, "").slice(-1);
      const next = chars.map((c) => c.trim()).join("");
      const arr = next.padEnd(6, " ").split("");
      arr[idx] = digit;
      const newVal = arr.join("").trim();
      onChange(newVal);
      if (digit && idx < 5) refs.current[idx + 1]?.focus();
      if (newVal.length === 6) onComplete?.(newVal);
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
          ref={(el) => (refs.current[idx] = el)}
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
          aria-label={`Cifra ${idx + 1} di 6`}
        />
      ))}
    </div>
  );
}

interface Props {
  /** Click su "Indietro" → torna al form principale. */
  onBack: () => void;
  /** Email pre-compilata dal form principale (UX continuity). */
  initialEmail?: string;
}

type Step = "request" | "verify";

const OTP_TTL_MIN = 15;

export function EmailOTPLogin({ onBack, initialEmail = "" }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef<number | null>(null);

  // Countdown re-invio
  useEffect(() => {
    if (secondsLeft <= 0) return;
    timerRef.current = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [secondsLeft]);

  // v8.6.98 — Custom OTP via edge function email-otp-send (TTL 15min server-side)
  const sendOtp = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast({ title: "Email non valida", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("email-otp-send", {
        body: { email: trimmed },
      });
      if (error) {
        toast({
          title: "Errore invio codice",
          description: error.message,
          variant: "destructive",
        });
        return;
      }
      const status = (data as { status?: string } | null)?.status;
      if (status === "user_not_found") {
        toast({
          title: "Email non registrata",
          description: "Contatta il tuo consulente per ottenere l'accesso.",
          variant: "destructive",
        });
        return;
      }
      if (status === "rate_limited") {
        const cooldown = (data as { cooldown?: number }).cooldown ?? 60;
        toast({
          title: "Troppi tentativi",
          description: `Aspetta ${cooldown}s prima di richiedere un nuovo codice.`,
          variant: "destructive",
        });
        setSecondsLeft(cooldown);
        return;
      }
      setStep("verify");
      setSecondsLeft(60);
      toast({
        title: "Codice inviato",
        description: `Controlla la casella di posta. Il codice scade tra ${OTP_TTL_MIN} minuti.`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("email-otp-verify", {
        body: { email: email.trim().toLowerCase(), code: otp },
      });
      if (error) {
        toast({ title: "Errore verifica", description: error.message, variant: "destructive" });
        setOtp("");
        return;
      }
      const result = data as { status?: string; token_hash?: string; attempts_left?: number } | null;
      if (!result || result.status !== "ok" || !result.token_hash) {
        const msg =
          result?.status === "expired"
            ? "Il codice è scaduto. Richiedine uno nuovo."
            : result?.status === "too_many_attempts"
              ? "Troppi tentativi falliti. Richiedi un nuovo codice."
              : result?.status === "no_active_code"
                ? "Nessun codice attivo per questa email."
                : `Codice non valido${result?.attempts_left !== undefined ? ` (${result.attempts_left} tentativi rimasti)` : ""}.`;
        toast({ title: "Codice non valido", description: msg, variant: "destructive" });
        setOtp("");
        return;
      }
      // Autentica con il token_hash ritornato dal magic link nativo
      const { error: vErr } = await supabase.auth.verifyOtp({
        token_hash: result.token_hash,
        type: "magiclink",
      });
      if (vErr) {
        toast({
          title: "Errore autenticazione",
          description: vErr.message,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Accesso effettuato", description: "Stai entrando…" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="animate-in fade-in-0 duration-300 space-y-5">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 -ml-2"
          onClick={onBack}
          type="button"
          aria-label="Indietro"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">
            {step === "request" ? "Accedi senza password" : "Inserisci il codice"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {step === "request"
              ? "Ti invieremo un codice via email."
              : `Codice inviato a ${email}`}
          </p>
        </div>
      </div>

      {step === "request" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendOtp();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="email-otp">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email-otp"
                type="email"
                placeholder="nome@tuaazienda.it"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
                autoComplete="email"
                required
                disabled={isLoading}
              />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={isLoading || !email}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Invio in corso…
              </>
            ) : (
              <>
                <KeyRound className="h-4 w-4 mr-2" />
                Ricevi codice via email
              </>
            )}
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Il codice è valido per {OTP_TTL_MIN} minuti. Funziona solo se la tua
            email è già registrata.
          </p>
        </form>
      )}

      {step === "verify" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-center block">Codice a 6 cifre</Label>
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
            disabled={isLoading || otp.length !== 6}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Verifica…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Verifica e accedi
              </>
            )}
          </Button>

          <div className="text-center text-xs text-muted-foreground">
            Non hai ricevuto l&apos;email?{" "}
            {secondsLeft > 0 ? (
              <span>Reinvia tra {secondsLeft}s</span>
            ) : (
              <button
                type="button"
                onClick={() => void sendOtp()}
                disabled={isLoading}
                className="text-primary hover:underline font-medium"
              >
                Reinvia codice
              </button>
            )}
          </div>

          <p className="text-[11px] text-center text-muted-foreground">
            Controlla anche spam. Il codice scade tra {OTP_TTL_MIN} minuti dall&apos;invio.
          </p>
        </div>
      )}
    </div>
  );
}
