import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Handshake,
  Link2,
  Loader2,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Trophy,
  User as UserIcon,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TwoFactorVerify } from "@/components/auth/TwoFactorVerify";
import { SSOButtons } from "@/components/auth/SSOButtons";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/hooks/useSEO";
import { supabase } from "@/integrations/supabase/client";
import { fetchWithTimeout } from "@/lib/utils/fetchWithTimeout";
import { isSuperAdminEmailAllowed } from "@/config/superAdmin";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.webp";

type ViewMode = "login" | "forgot" | "2fa" | "signup" | "signup-success";

const PARTNER_TYPE_OPTIONS = [
  { value: "partner", label: "Partner generico" },
  { value: "agency", label: "Agenzia / Studio" },
  { value: "freelancer", label: "Freelancer / Consulente" },
  { value: "consultant", label: "Consulente d'impresa" },
  { value: "influencer", label: "Influencer / Content creator" },
  { value: "company", label: "Azienda / Rete" },
];

const allowedPartnerRoles = new Set(["referrer", "super_admin"]);

const partnerHighlights = [
  {
    icon: Link2,
    title: "Link referral e campagne",
    text: "Crea link tracciati, controlla conversioni e fonti migliori.",
  },
  {
    icon: TrendingUp,
    title: "Performance sempre chiare",
    text: "Vedi clic, clienti attivati, ricavi e crescita per periodo.",
  },
  {
    icon: Wallet,
    title: "Commissioni e payout",
    text: "Tieni sotto controllo saldo, pagamenti e stato del profilo.",
  },
];

async function getLoggedUserHasPartnerAccess() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (error) return false;

  return (roles || []).some((row) => {
    if (row.role === "super_admin") return isSuperAdminEmailAllowed(user.email);
    return row.role === "referrer";
  });
}

export default function ReferralLogin() {
  const { user, role, isLoading, signIn, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useSEO({ title: "Portale Referral", noindex: true });

  const [view, setView] = useState<ViewMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Signup state
  const [signupName, setSignupName] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [signupPartnerType, setSignupPartnerType] = useState<string>("partner");
  const [signupTermsAccepted, setSignupTermsAccepted] = useState(false);
  const [signupSuccessMessage, setSignupSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const refCode = searchParams.get("ref")?.trim();
    if (!refCode) return;

    sessionStorage.setItem("referral_code", refCode);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) return;

    fetchWithTimeout(`${supabaseUrl}/functions/v1/track-referral-click`, {
      method: "POST",
      timeoutMs: 5_000,
      context: "referral-login.track-referral",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        referral_code: refCode,
        landing_page: window.location.pathname,
        utm_source: searchParams.get("utm_source") || undefined,
        utm_medium: searchParams.get("utm_medium") || undefined,
        utm_campaign: searchParams.get("utm_campaign") || undefined,
        utm_content: searchParams.get("utm_content") || undefined,
      }),
    })
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.click_id) sessionStorage.setItem("referral_click_id", payload.click_id);
      })
      .catch(() => {});
  }, [searchParams]);

  if (!isLoading && user && role && allowedPartnerRoles.has(role)) {
    return <Navigate to="/partner" replace />;
  }

  if (!isLoading && user && role && !allowedPartnerRoles.has(role)) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#0b1220] p-4">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white p-8 text-center shadow-2xl">
          <ShieldCheck className="mx-auto h-14 w-14 text-red-500" />
          <div className="mt-5 space-y-2">
            <h1 className="text-2xl font-bold text-slate-950">Accesso non autorizzato</h1>
            <p className="text-sm leading-relaxed text-slate-600">
              Questo portale e riservato ai partner referral. Se hai un account aziendale,
              accedi da <span className="font-semibold">app.ediliziaincloud.com</span>.
            </p>
          </div>
          <Button
            className="mt-6 w-full bg-[#F97415] text-white hover:bg-[#ea6506]"
            onClick={async () => {
              await signOut();
            }}
          >
            Torna al login referral
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#0b1220]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
          <p className="text-sm text-white/70">Caricamento portale referral...</p>
        </div>
      </div>
    );
  }

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const { error } = await signIn(email, password);
      if (error) {
        setFormError("Email o password non validi. Riprova.");
        return;
      }

      const hasPartnerAccess = await getLoggedUserHasPartnerAccess();
      if (!hasPartnerAccess) {
        await supabase.auth.signOut();
        setFormError("Questo account non e abilitato al portale referral.");
        return;
      }

      try {
        const totpInvoke = supabase.functions.invoke("manage-totp", {
          body: { action: "status" },
        });
        (totpInvoke as Promise<unknown>).catch(() => {});
        const result = await Promise.race([
          totpInvoke,
          new Promise<{ data: null }>((resolve) => {
            window.setTimeout(() => resolve({ data: null }), 6_000);
          }),
        ]);
        const totpStatus = (result as { data: { enabled?: boolean } | null }).data;
        if (totpStatus?.enabled) {
          setView("2fa");
          return;
        }
      } catch {
        // If the 2FA status check is unavailable, continue without blocking login.
      }

      toast({
        title: "Accesso effettuato",
        description: "Benvenuto nel portale referral.",
      });
      navigate("/partner", { replace: true });
    } catch {
      setFormError("Si e verificato un errore. Riprova tra qualche secondo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const { error } = await supabase.functions.invoke("reset-password-branded", {
        body: { email, redirect_to: window.location.origin },
      });
      if (error) {
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
      }
      setResetSent(true);
    } catch {
      setFormError("Impossibile inviare il reset password. Riprova.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchToForgot = () => {
    setView("forgot");
    setResetSent(false);
    setPassword("");
    setFormError(null);
  };

  const switchToLogin = () => {
    setView("login");
    setResetSent(false);
    setFormError(null);
    setSignupSuccessMessage(null);
  };

  const switchToSignup = () => {
    setView("signup");
    setFormError(null);
    setPassword("");
    setSignupSuccessMessage(null);
  };

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!signupTermsAccepted) {
      setFormError("Devi accettare i termini per registrarti.");
      return;
    }
    if (password.length < 8) {
      setFormError("Password troppo corta (minimo 8 caratteri).");
      return;
    }

    setIsSubmitting(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) {
        setFormError("Configurazione mancante. Contatta il supporto.");
        return;
      }

      const response = await fetchWithTimeout(
        `${supabaseUrl}/functions/v1/referral-self-signup`,
        {
          method: "POST",
          timeoutMs: 15_000,
          context: "referral-login.self-signup",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: signupName.trim(),
            email: email.trim().toLowerCase(),
            password,
            phone: signupPhone.trim() || null,
            partner_type: signupPartnerType,
            accepted_terms: signupTermsAccepted,
          }),
        },
      );

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        setFormError(payload.error || "Registrazione non riuscita. Riprova.");
        return;
      }

      setSignupSuccessMessage(
        payload.message ||
          "Registrazione completata! Controlla la tua email per confermare l'account.",
      );
      setView("signup-success");
      // Mantengo email per facilitare il login successivo
      setPassword("");
      setSignupName("");
      setSignupPhone("");
      setSignupTermsAccepted(false);

      toast({
        title: "Registrazione completata",
        description: "Controlla la tua email per confermare l'account.",
      });
    } catch {
      setFormError("Errore di rete. Verifica la connessione e riprova.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handle2FAVerified = () => {
    toast({
      title: "Accesso effettuato",
      description: "Benvenuto nel portale referral.",
    });
    navigate("/partner", { replace: true });
  };

  const handle2FACancel = async () => {
    await supabase.auth.signOut();
    setView("login");
    toast({ title: "Accesso annullato", description: "Verifica 2FA richiesta." });
  };

  return (
    <div className="min-h-dvh bg-[#0b1220] lg:grid lg:grid-cols-[minmax(420px,45%)_1fr]">
      <aside className="hidden overflow-hidden bg-[#0b1220] p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="space-y-12">
          <img loading="lazy"
            src={ediliziaLogo}
            alt="Edilizia in Cloud"
            className="h-12 w-auto object-contain brightness-0 invert"
          />

          <div className="max-w-md space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-300/25 bg-orange-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-orange-100">
              <Trophy className="h-3.5 w-3.5" />
              Portale referral
            </div>
            <div className="space-y-4">
              <h1 className="text-4xl font-bold leading-tight text-white">
                Gestisci referenze, commissioni e crescita da un unico posto.
              </h1>
              <p className="text-base leading-relaxed text-white/70">
                Accedi alla tua area partner per monitorare link, clienti portati,
                performance e pagamenti ricorrenti.
              </p>
            </div>
          </div>

          <div className="grid max-w-lg gap-4">
            {partnerHighlights.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-sm backdrop-blur"
                >
                  <div className="flex gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F97415]/20 text-[#F97415]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      <p className="text-xs leading-relaxed text-white/60">{item.text}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300">
              <Handshake className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Programma Partner</p>
              <p className="text-xs text-white/60">
                Accesso riservato ai partner approvati da Edilizia in Cloud.
              </p>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-5 py-8 lg:px-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center lg:hidden">
            <img loading="lazy" src={ediliziaLogo} alt="Edilizia in Cloud" className="h-11 w-auto object-contain" />
          </div>

          {view === "2fa" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/50">
              <div className="mb-6 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-[#F97415]">
                  <Lock className="h-7 w-7" />
                </div>
                <h2 className="mt-4 text-2xl font-bold text-slate-950">Verifica 2FA</h2>
                <p className="mt-1 text-sm text-slate-500">Completa l'accesso al portale referral.</p>
              </div>
              <TwoFactorVerify onVerified={handle2FAVerified} onCancel={handle2FACancel} />
            </section>
          )}

          {view === "login" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/50">
              <div className="mb-7 space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F97415] text-white">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-950">
                    Accedi al portale referral
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">
                    Usa le credenziali ricevute per vedere referenze, commissioni e materiali.
                  </p>
                </div>
              </div>

              {formError && (
                <div className="mb-5 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="referral-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="referral-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="partner@azienda.it"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="h-12 pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="referral-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="referral-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="La tua password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="h-12 pl-10 pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700"
                      aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-12 w-full bg-[#F97415] text-base font-semibold text-white shadow-lg shadow-orange-200 hover:bg-[#ea6506]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Accesso in corso...
                    </>
                  ) : (
                    "Accedi al portale referral"
                  )}
                </Button>
              </form>

              {/* SSO Google + Microsoft — il role check filtra chi non è referral */}
              <div className="mt-5">
                <SSOButtons disabled={isSubmitting} onError={(msg) => setFormError(msg)} />
              </div>

              <div className="mt-5 flex items-center justify-between gap-3 text-sm">
                <button
                  type="button"
                  onClick={switchToForgot}
                  className="font-medium text-[#F97415] transition-colors hover:text-[#d95b00]"
                >
                  Password dimenticata?
                </button>
                <button
                  type="button"
                  onClick={switchToSignup}
                  className="font-medium text-slate-500 transition-colors hover:text-slate-900"
                >
                  Non hai un account? Registrati
                </button>
              </div>

              <div className="mt-7 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex gap-3">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#F97415]" />
                  <p className="text-xs leading-relaxed text-slate-600">
                    Nuovo partner? Registrati in 30 secondi. Riceverai un'email di conferma
                    e potrai iniziare a generare commissioni subito.
                  </p>
                </div>
              </div>
            </section>
          )}

          {view === "signup" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/50">
              <button
                type="button"
                onClick={switchToLogin}
                className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
              >
                <ArrowLeft className="h-4 w-4" />
                Torna al login
              </button>

              <div className="mb-6 space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F97415] text-white">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-950">
                    Diventa partner referral
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">
                    Registrati e ottieni subito il tuo link referral con commissioni del 10%
                    su ogni cliente attivato.
                  </p>
                </div>
              </div>

              {formError && (
                <div className="mb-5 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Nome e cognome</Label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="signup-name"
                      type="text"
                      autoComplete="name"
                      placeholder="Mario Rossi"
                      value={signupName}
                      onChange={(event) => setSignupName(event.target.value)}
                      className="h-11 pl-10"
                      required
                      minLength={2}
                      maxLength={120}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="signup-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="tu@azienda.it"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="h-11 pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password (min. 8 caratteri)</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Scegli una password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="h-11 pl-10 pr-10"
                      required
                      minLength={8}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700"
                      aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-phone">Telefono (opzionale)</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="signup-phone"
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      placeholder="+39 333 1234567"
                      value={signupPhone}
                      onChange={(event) => setSignupPhone(event.target.value)}
                      className="h-11 pl-10"
                      maxLength={32}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-partner-type">Tipo partner</Label>
                  <Select
                    value={signupPartnerType}
                    onValueChange={setSignupPartnerType}
                  >
                    <SelectTrigger id="signup-partner-type" className="h-11">
                      <SelectValue placeholder="Seleziona il tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {PARTNER_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <label className="flex items-start gap-3 cursor-pointer text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={signupTermsAccepted}
                    onChange={(event) => setSignupTermsAccepted(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#F97415] focus:ring-[#F97415]"
                    required
                  />
                  <span>
                    Accetto i{" "}
                    <a
                      href="https://www.ediliziaincloud.com/termini-e-condizioni/"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-[#F97415] hover:underline"
                    >
                      Termini
                    </a>{" "}
                    e la{" "}
                    <a
                      href="https://www.ediliziaincloud.com/privacy-policy/"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-[#F97415] hover:underline"
                    >
                      Privacy Policy
                    </a>{" "}
                    del programma referral.
                  </span>
                </label>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-12 w-full bg-[#F97415] text-base font-semibold text-white shadow-lg shadow-orange-200 hover:bg-[#ea6506]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Registrazione in corso...
                    </>
                  ) : (
                    "Crea account referral"
                  )}
                </Button>
              </form>
            </section>
          )}

          {view === "signup-success" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/50">
              <div className="space-y-5 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-slate-950">
                    Account creato!
                  </h2>
                  <p className="text-sm leading-relaxed text-slate-500">
                    {signupSuccessMessage ||
                      "Controlla la tua email per confermare l'account, poi accedi al portale."}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left">
                  <p className="text-xs leading-relaxed text-emerald-900">
                    <span className="font-semibold">Prossimi passi:</span>
                    <br />
                    1. Apri l'email che ti abbiamo inviato a{" "}
                    <span className="font-semibold">{email}</span>
                    <br />
                    2. Clicca sul link di conferma
                    <br />
                    3. Torna qui e accedi con la password che hai scelto
                  </p>
                </div>
                <Button
                  onClick={switchToLogin}
                  className="w-full bg-[#F97415] text-white hover:bg-[#ea6506]"
                >
                  Vai al login
                </Button>
              </div>
            </section>
          )}

          {view === "forgot" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/50">
              <button
                type="button"
                onClick={switchToLogin}
                className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
              >
                <ArrowLeft className="h-4 w-4" />
                Torna al login
              </button>

              {resetSent ? (
                <div className="space-y-5 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-slate-950">Email inviata</h2>
                    <p className="text-sm leading-relaxed text-slate-500">
                      Controlla la posta e segui il link per reimpostare la password.
                    </p>
                  </div>
                  <Button onClick={switchToLogin} className="w-full bg-[#F97415] text-white hover:bg-[#ea6506]">
                    Torna al login
                  </Button>
                </div>
              ) : (
                <>
                  <div className="mb-7 space-y-2">
                    <h2 className="text-2xl font-bold text-slate-950">Recupera password</h2>
                    <p className="text-sm leading-relaxed text-slate-500">
                      Inserisci l'email del tuo account referral. Ti invieremo le istruzioni.
                    </p>
                  </div>

                  {formError && (
                    <div className="mb-5 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{formError}</span>
                    </div>
                  )}

                  <form onSubmit={handleForgotPassword} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="referral-reset-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input
                          id="referral-reset-email"
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          placeholder="partner@azienda.it"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          className="h-12 pl-10"
                          required
                        />
                      </div>
                    </div>
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="h-12 w-full bg-[#F97415] text-white hover:bg-[#ea6506]"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Invio in corso...
                        </>
                      ) : (
                        "Invia link di reset"
                      )}
                    </Button>
                  </form>
                </>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
