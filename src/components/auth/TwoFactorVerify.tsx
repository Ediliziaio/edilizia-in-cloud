import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Shield, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TwoFactorVerifyProps {
  onVerified: () => void;
  onCancel: () => void;
}

export function TwoFactorVerify({ onVerified, onCancel }: TwoFactorVerifyProps) {
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleVerify = async () => {
    setIsLoading(true);
    try {
      const action = mode === "totp" ? "validate" : "validate_backup";
      const body = mode === "totp" ? { action, token: code } : { action, code };

      const { data, error } = await supabase.functions.invoke("manage-totp", { body });

      if (error || data?.error) {
        toast({
          variant: "destructive",
          title: "Codice non valido",
          description: data?.error || error?.message || "Riprova",
        });
        return;
      }

      if (data?.valid) {
        onVerified();
      }
    } catch {
      toast({ variant: "destructive", title: "Errore", description: "Si è verificato un errore." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <Shield className="h-10 w-10 text-primary mx-auto" />
        <h2 className="text-2xl font-bold text-foreground">Verifica 2FA</h2>
        <p className="text-muted-foreground text-sm">
          {mode === "totp"
            ? "Inserisci il codice a 6 cifre dalla tua app di autenticazione"
            : "Inserisci un codice di backup"}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>{mode === "totp" ? "Codice TOTP" : "Codice di backup"}</Label>
          <Input
            placeholder={mode === "totp" ? "000000" : "abcd-1234"}
            value={code}
            onChange={(e) => {
              if (mode === "totp") {
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
              } else {
                setCode(e.target.value.trim());
              }
            }}
            maxLength={mode === "totp" ? 6 : 9}
            className="font-mono text-center text-lg tracking-widest h-12"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleVerify();
            }}
            autoFocus
          />
        </div>

        <Button
          className="w-full h-11"
          onClick={handleVerify}
          disabled={isLoading || (mode === "totp" ? code.length !== 6 : code.length < 4)}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Verifica in corso...
            </>
          ) : (
            "Verifica"
          )}
        </Button>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setMode(mode === "totp" ? "backup" : "totp");
              setCode("");
            }}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <KeyRound className="h-3 w-3" />
            {mode === "totp" ? "Usa codice di backup" : "Usa codice TOTP"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-muted-foreground hover:underline"
          >
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
}
