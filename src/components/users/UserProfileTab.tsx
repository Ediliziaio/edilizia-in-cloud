import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Save, KeyRound, Copy, Check, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface UserProfileTabProps {
  user: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  };
  onSave: (data: { first_name: string; last_name: string; email: string; phone: string | null }) => void;
  isLoading?: boolean;
}

export function UserProfileTab({ user, onSave, isLoading }: UserProfileTabProps) {
  const [firstName, setFirstName] = useState(user.first_name);
  const [lastName, setLastName] = useState(user.last_name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone || "");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const initials = `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase();

  const isDirty = useMemo(() => {
    return (
      firstName.trim() !== user.first_name ||
      lastName.trim() !== user.last_name ||
      email.trim() !== user.email ||
      (phone.trim() || null) !== (user.phone || null)
    );
  }, [firstName, lastName, email, phone, user]);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!firstName.trim()) errors.firstName = "Il nome è obbligatorio";
    if (!lastName.trim()) errors.lastName = "Il cognome è obbligatorio";
    if (!email.trim()) {
      errors.email = "L'email è obbligatoria";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = "Formato email non valido";
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSave({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      phone: phone.trim() || null,
    });
  };

  const handleResetPassword = async () => {
    if (newPassword.trim() && newPassword.trim().length < 8) {
      toast({ title: "Errore", description: "La password deve avere almeno 8 caratteri.", variant: "destructive" });
      return;
    }
    setResettingPassword(true);
    try {
      const body: Record<string, string> = { userId: user.id };
      if (newPassword.trim()) {
        body.new_password = newPassword.trim();
      }
      const { data, error } = await supabase.functions.invoke("reset-customer-password", { body });
      if (error) throw error;
      const pwd = newPassword.trim() || data?.temporaryPassword;
      if (pwd) {
        setGeneratedPassword(pwd);
        setPasswordDialogOpen(true);
        setNewPassword("");
      } else {
        toast({ title: "Password resettata", description: "Un'email di reset è stata inviata all'utente." });
      }
    } catch (err: any) {
      toast({ title: "Errore", description: err.message || "Impossibile resettare la password.", variant: "destructive" });
    } finally {
      setResettingPassword(false);
    }
  };

  const handleCopyPassword = async () => {
    await navigator.clipboard.writeText(generatedPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Informazioni Utente</CardTitle>
            <CardDescription>Dati personali e di contatto dell'utente</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="text-lg bg-primary/10 text-primary font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{user.first_name} {user.last_name}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>

            {/* Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Nome *</Label>
                <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={isLoading} />
                {validationErrors.firstName && <p className="text-xs text-destructive">{validationErrors.firstName}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Cognome *</Label>
                <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={isLoading} />
                {validationErrors.lastName && <p className="text-xs text-destructive">{validationErrors.lastName}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} />
              {validationErrors.email && <p className="text-xs text-destructive">{validationErrors.email}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Telefono</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+39 333 1234567" disabled={isLoading} />
            </div>

            {/* Reset Password */}
            <div className="pt-2 border-t space-y-3">
              <div>
                <p className="text-sm font-medium">Password</p>
                <p className="text-xs text-muted-foreground">Inserisci una nuova password oppure lascia vuoto per generarne una automatica</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-xs">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Nuova password (opzionale)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={resettingPassword}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleResetPassword} disabled={resettingPassword}>
                  {resettingPassword ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
                  {newPassword.trim() ? "Imposta Password" : "Genera Password"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={isLoading || !isDirty}>
            {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salva Modifiche
          </Button>
        </div>
      </form>

      {/* Password result dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Password Aggiornata</DialogTitle>
            <DialogDescription>
              La password è stata impostata con successo. Copiala e comunicala all'utente in modo sicuro.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border font-mono text-sm break-all">
            <span className="flex-1">{generatedPassword}</span>
            <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={handleCopyPassword}>
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Questa password non sarà più visibile dopo la chiusura di questa finestra.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
