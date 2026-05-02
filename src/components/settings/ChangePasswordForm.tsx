import { useState } from "react";
import { Eye, EyeOff, Loader2, Key, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { logger } from "@/utils/logger";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface PasswordPolicy {
  password_min_length: number;
  password_require_uppercase: boolean;
  password_require_numbers: boolean;
  password_require_special: boolean;
}

export function ChangePasswordForm() {
  const { user, effectiveCompany } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch company password policy
  const { data: policy, isError: isPolicyError, error: policyError, refetch: refetchPolicy } = useQuery({
    queryKey: ["password-policy", effectiveCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("password_min_length, password_require_uppercase, password_require_numbers, password_require_special")
        .eq("id", effectiveCompany!.id)
        .single();
      if (error) throw error;
      return data as unknown as PasswordPolicy;
    },
    enabled: !!effectiveCompany?.id,
  });

  const minLength = policy?.password_min_length ?? 8;
  const requireUppercase = policy?.password_require_uppercase ?? false;
  const requireNumbers = policy?.password_require_numbers ?? false;
  const requireSpecial = policy?.password_require_special ?? false;

  const passwordChecks = [
    { label: `Almeno ${minLength} caratteri`, ok: newPassword.length >= minLength },
    ...(requireUppercase ? [{ label: "Almeno una lettera maiuscola", ok: /[A-Z]/.test(newPassword) }] : []),
    ...(requireNumbers ? [{ label: "Almeno un numero", ok: /[0-9]/.test(newPassword) }] : []),
    ...(requireSpecial ? [{ label: "Almeno un carattere speciale", ok: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword) }] : []),
  ];

  const allChecksPassed = newPassword.length > 0 && passwordChecks.every((c) => c.ok);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (currentPassword.length === 0) {
      newErrors.currentPassword = "Inserisci la password attuale";
    }

    if (newPassword.length === 0) {
      newErrors.newPassword = "Inserisci la nuova password";
    } else if (!allChecksPassed) {
      newErrors.newPassword = "La password non soddisfa i requisiti di complessità";
    }

    if (confirmPassword.length === 0) {
      newErrors.confirmPassword = "Conferma la nuova password";
    } else if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = "Le password non corrispondono";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    if (!validate()) return;

    if (!user?.email) {
      toast.error("Sessione non valida");
      return;
    }

    setIsLoading(true);

    try {
      // Verify current password by signing in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) {
        toast.error("Password attuale non corretta");
        setIsLoading(false);
        return;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        toast.error("Errore durante il cambio password");
        setIsLoading(false);
        return;
      }

      // Update password_changed_at on profile
      await supabase
        .from("profiles")
        .update({ password_changed_at: new Date().toISOString() })
        .eq("id", user.id);

      toast.success("Password cambiata con successo!");
      
      // Reset form
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setErrors({});
    } catch (error) {
      logger.error("Error changing password:", error);
      toast.error("Errore durante il cambio password");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          Cambia Password
        </CardTitle>
        <CardDescription>
          Aggiorna la password del tuo account
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPolicyError && (
          <Alert variant="destructive" className="mb-4">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Policy password non disponibile</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>
                {policyError instanceof Error
                  ? policyError.message
                  : "Non è stato possibile caricare le regole aziendali. Riprova prima di cambiare password."}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => refetchPolicy()}>
                Riprova
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
          {/* Current Password */}
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Password Attuale</Label>
            <div className="relative">
              <Input
                id="currentPassword"
                type={showCurrentPassword ? "text" : "password"}
                placeholder="Inserisci la password attuale"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                className={errors.currentPassword ? "border-destructive" : ""}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                aria-label={showCurrentPassword ? "Nascondi password attuale" : "Mostra password attuale"}
              >
                {showCurrentPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
            {errors.currentPassword && (
              <p className="text-sm text-destructive">{errors.currentPassword}</p>
            )}
          </div>

          {/* New Password */}
          <div className="space-y-2">
            <Label htmlFor="newPassword">Nuova Password</Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNewPassword ? "text" : "password"}
                placeholder={`Inserisci la nuova password (min. ${minLength} caratteri)`}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className={errors.newPassword ? "border-destructive" : ""}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowNewPassword(!showNewPassword)}
                aria-label={showNewPassword ? "Nascondi nuova password" : "Mostra nuova password"}
              >
                {showNewPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
            {errors.newPassword && (
              <p className="text-sm text-destructive">{errors.newPassword}</p>
            )}
            {/* Password strength checklist */}
            {newPassword.length > 0 && (
              <div className="space-y-1 mt-2">
                {passwordChecks.map((check, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs">
                    {check.ok ? (
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className={check.ok ? "text-emerald-600" : "text-muted-foreground"}>
                      {check.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Conferma Nuova Password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Conferma la nuova password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className={errors.confirmPassword ? "border-destructive" : ""}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? "Nascondi conferma password" : "Mostra conferma password"}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">{errors.confirmPassword}</p>
            )}
          </div>

          <Button type="submit" disabled={isLoading || isPolicyError} className="w-full sm:w-auto">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cambio in corso...
              </>
            ) : (
              "Cambia Password"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
