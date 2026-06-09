import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSEO } from "@/hooks/useSEO";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, Factory, Loader2, Lock, Mail,
} from "lucide-react";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.webp";

const ALLOWED = new Set(["produttore_admin", "super_admin"]);

/** Login portale Produttore (produttore.ediliziaincloud.com) — versione snella. */
export default function ProduttoreLogin() {
  const { user, role, isLoading, signIn, signOut } = useAuth();
  useSEO({ title: "Portale Produttore", noindex: true });

  const [view, setView] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!isLoading && user && role && ALLOWED.has(role)) return <Navigate to="/produttore" replace />;

  if (!isLoading && user && role && !ALLOWED.has(role)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
          <Factory className="mx-auto h-12 w-12 text-rose-500" />
          <h1 className="mt-4 text-xl font-bold">Accesso non autorizzato</h1>
          <p className="mt-2 text-sm text-slate-600">
            Questo portale è riservato ai produttori. Se hai un account aziendale, accedi da app.ediliziaincloud.com.
          </p>
          <Button className="mt-5 w-full" onClick={() => signOut()}>Torna al login produttore</Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const { error } = await signIn(email, password);
      if (error) { setErr("Email o password non validi."); return; }
      // Autorizzazione + redirect sono gestiti dai gate di render qui sopra
      // (<Navigate> se abilitato / "Accesso non autorizzato" altrimenti) appena il
      // context popola `role`: niente secondo getUser() né navigate manuale → no race.
    } catch {
      setErr("Si è verificato un errore. Riprova tra qualche secondo.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      setResetSent(true);
    } catch {
      setErr("Impossibile inviare il reset password. Riprova.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-950 px-5 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <img src={ediliziaLogo} alt="Edilizia in Cloud" className="h-10 object-contain brightness-0 invert" />
        </div>
        <section className="rounded-2xl bg-white p-7 shadow-xl">
          {view === "login" ? (
            <>
              <div className="mb-6">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Factory className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-bold">Area Produttore</h2>
                <p className="mt-1 text-sm text-muted-foreground">Gestisci i tuoi rivenditori, il brand e gli accessi.</p>
              </div>
              {err && (
                <div className="mb-4 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{err}
                </div>
              )}
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pl-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input id="pl-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 pl-10" required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pl-pw">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input id="pl-pw" type={showPw ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 pl-10 pr-10" required />
                    <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-label={showPw ? "Nascondi password" : "Mostra password"}>
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" disabled={submitting} className="h-11 w-full">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accedi"}
                </Button>
              </form>
              <button type="button" onClick={() => { setView("forgot"); setResetSent(false); setErr(null); }} className="mt-4 text-sm font-medium text-primary hover:underline">
                Password dimenticata?
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => { setView("login"); setErr(null); }} className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <ArrowLeft className="h-4 w-4" /> Torna al login
              </button>
              {resetSent ? (
                <div className="space-y-3 text-center">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
                  <h2 className="text-xl font-bold">Email inviata</h2>
                  <p className="text-sm text-muted-foreground">Controlla la posta e segui il link per reimpostare la password.</p>
                  <Button className="w-full" onClick={() => setView("login")}>Torna al login</Button>
                </div>
              ) : (
                <>
                  <h2 className="mb-1 text-xl font-bold">Recupera password</h2>
                  <p className="mb-4 text-sm text-muted-foreground">Inserisci l'email del tuo account produttore.</p>
                  {err && (
                    <div className="mb-4 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{err}
                    </div>
                  )}
                  <form onSubmit={handleForgot} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="pl-rl">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input id="pl-rl" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 pl-10" required />
                      </div>
                    </div>
                    <Button type="submit" disabled={submitting} className="h-11 w-full">
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Invia link di reset"}
                    </Button>
                  </form>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
