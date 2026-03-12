import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Shield, CheckCircle2, AlertTriangle, Eye, EyeOff } from "lucide-react";

type Step = "loading" | "invalid" | "register" | "already_registered" | "done";

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [step, setStep] = useState<Step>("loading");
  const [invite, setInvite] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function validateToken() {
      if (!token) { setStep("invalid"); return; }

      const { data, error } = await supabase
        .from("admin_invites")
        .select("*")
        .eq("token", token)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (error || !data) {
        setStep("invalid");
        return;
      }

      setInvite(data);
      setEmail(data.email);

      // Check if user already exists
      const { data: { user } } = await supabase.auth.getUser();
      if (user && user.email === data.email) {
        setStep("already_registered");
      } else {
        setStep("register");
      }
    }
    validateToken();
  }, [token]);

  const handleRegister = async () => {
    if (password.length < 8) {
      setError("La password deve essere almeno 8 caratteri");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Sign up with the invited email
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) throw signUpError;

      // Mark invite as accepted (will be handled server-side when user confirms email)
      await supabase
        .from("admin_invites")
        .update({ accepted_at: new Date().toISOString() })
        .eq("token", token!);

      setStep("done");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcceptExisting = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      await supabase
        .from("admin_invites")
        .update({ accepted_at: new Date().toISOString() })
        .eq("token", token!);

      setStep("done");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Shield className="h-10 w-10 text-primary mx-auto mb-2" />
          <CardTitle>
            {step === "invalid" && "Invito non valido"}
            {step === "register" && "Accetta invito Admin"}
            {step === "already_registered" && "Accetta invito Admin"}
            {step === "done" && "Invito accettato!"}
          </CardTitle>
          <CardDescription>
            {step === "invalid" && "Il link di invito è scaduto o non è valido."}
            {step === "register" && `Sei stato invitato come Super Admin. Crea il tuo account con ${email}.`}
            {step === "already_registered" && `Hai già un account con ${email}. Conferma l'accettazione.`}
            {step === "done" && "Il tuo ruolo di Super Admin è stato configurato. Controlla la tua email per verificare l'account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "invalid" && (
            <Button className="w-full" onClick={() => navigate("/admin-login")}>
              Torna al login
            </Button>
          )}

          {step === "register" && (
            <>
              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={email} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimo 8 caratteri"
                    className="pr-10"
                    onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button className="w-full gap-2" onClick={handleRegister} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                Crea account e accetta
              </Button>
            </>
          )}

          {step === "already_registered" && (
            <>
              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button className="w-full gap-2" onClick={handleAcceptExisting} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Accetta invito
              </Button>
            </>
          )}

          {step === "done" && (
            <Button className="w-full" onClick={() => navigate("/admin-login")}>
              Vai al login Admin
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
