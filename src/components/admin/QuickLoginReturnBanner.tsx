import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const ORIGINAL_EMAIL_KEY = "quick_login_original_email";
const ORIGINAL_NAME_KEY = "quick_login_original_name";

export function clearQuickLoginSession() {
  sessionStorage.removeItem(ORIGINAL_EMAIL_KEY);
  sessionStorage.removeItem(ORIGINAL_NAME_KEY);
}

export function saveQuickLoginSession(email: string, name: string) {
  sessionStorage.setItem(ORIGINAL_EMAIL_KEY, email);
  sessionStorage.setItem(ORIGINAL_NAME_KEY, name);
}

export function QuickLoginReturnBanner() {
  const navigate = useNavigate();
  const [originalName, setOriginalName] = useState<string | null>(null);
  const [originalEmail, setOriginalEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setOriginalEmail(sessionStorage.getItem(ORIGINAL_EMAIL_KEY));
    setOriginalName(sessionStorage.getItem(ORIGINAL_NAME_KEY));
  }, []);

  if (!originalEmail || !originalName) return null;

  const handleReturn = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("sign-in-as-user", {
        body: { email: originalEmail },
      });

      if (error) throw error;
      if (!data?.hashed_token) throw new Error("No token received");

      await supabase.auth.signOut();

      const { error: otpError } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: data.hashed_token,
      });

      if (otpError) throw otpError;

      clearQuickLoginSession();
      toast.success(`Bentornato, ${originalName}`);
      window.location.href = "/admin";
    } catch (err: any) {
      console.error("Return to admin error:", err);
      clearQuickLoginSession();
      toast.error("Sessione scaduta. Effettua il login manualmente.");
      navigate("/login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-primary text-primary-foreground px-4 py-2 flex items-center justify-between">
      <span className="text-sm font-medium">
        Sessione Quick Login attiva
      </span>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleReturn}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : (
          <ArrowLeft className="h-4 w-4 mr-2" />
        )}
        Torna come {originalName}
      </Button>
    </div>
  );
}
