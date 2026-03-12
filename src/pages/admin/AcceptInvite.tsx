import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Shield, AlertTriangle, Eye, EyeOff } from "lucide-react";

type Step = "loading" | "invalid" | "register" | "done";

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [step, setStep] = useState<Step>("loading");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStep("invalid");
      return;
    }
    // We can't validate client-side (RLS blocks admin_invites).
    // The edge function will validate the token server-side.
    setStep("register");
  }, [token]);

  const handleAccept = async () => {
    if (password.length < 8) {
      setError("La password deve essere almeno 8 caratteri");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("accept-admin-invite", {
        body: { token, password },
      });

      if (fnError) {
        const msg = await fnError?.context?.json?.().catch(() => null);
        throw new Error(msg?.error || fnError.message);
      }
      if (data?.error) throw new Error(data.error);

      setStep("done");
    } catch (err: any) {
      if (err.message?.includes("non valido") || err.message?.includes("scaduto")) {
        setStep("invalid");
      } else {
        setError(err.message);
      }
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
            {step === "done" && "Invito accettato!"}
          </CardTitle>
          <CardDescription>
            {step === "invalid" && "Il link di invito è scaduto o non è valido."}
            {step === "register" && "Crea una password per il tuo account Super Admin."}
            {step === "done" && "Il tuo account Super Admin è stato creato. Puoi effettuare il login."}
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
                <Label>Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimo 8 caratteri"
                    className="pr-10"
                    onKeyDown={(e) => e.key === "Enter" && handleAccept()}
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
              <Button className="w-full gap-2" onClick={handleAccept} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                Crea account e accetta
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
