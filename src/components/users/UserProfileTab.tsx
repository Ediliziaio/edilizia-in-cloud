import { useState, useMemo, useEffect } from "react";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, KeyRound, Copy, Check, Eye, EyeOff, ShieldCheck, UserCheck, TrendingUp, Phone, HardHat, Building2, ShieldOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { NOME_RUOLO } from "@/lib/permessi/ruoliUtente";
import { messaggioErrorePersone } from "@/lib/users/erroriPersone";

type EffectiveRole = "company_admin" | "company_staff" | "salesperson" | "call_center" | "employee" | "subcontractor";

const ROLE_CONFIG: Record<EffectiveRole, { label: string; icon: React.ElementType; color: string }> = {
  company_admin: { label: NOME_RUOLO.company_admin, icon: ShieldCheck, color: "bg-primary/10 text-primary border-primary/20" },
  company_staff: { label: NOME_RUOLO.company_staff, icon: UserCheck, color: "bg-slate-100 text-slate-700 border-slate-200" },
  salesperson: { label: NOME_RUOLO.salesperson, icon: TrendingUp, color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  call_center: { label: NOME_RUOLO.call_center, icon: Phone, color: "bg-blue-50 text-blue-700 border-blue-200" },
  employee: { label: NOME_RUOLO.employee, icon: HardHat, color: "bg-amber-50 text-amber-700 border-amber-200" },
  subcontractor: { label: NOME_RUOLO.subcontractor, icon: Building2, color: "bg-purple-50 text-purple-700 border-purple-200" },
};

interface UserProfileTabProps {
  user: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  };
  role?: EffectiveRole;
  isBlocked?: boolean;
  onSave: (data: { first_name: string; last_name: string; email: string; phone: string | null }) => void;
  isLoading?: boolean;
  /** Chi non è amministratore guarda: campi spenti, niente «Salva», niente cambio password. */
  readOnly?: boolean;
  /** Dice alla pagina se ci sono modifiche non salvate (per avvisare prima di cambiare scheda). */
  onDirtyChange?: (dirty: boolean) => void;
}

export function UserProfileTab({ user, role, isBlocked, onSave, isLoading, readOnly = false, onDirtyChange }: UserProfileTabProps) {
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
  const nomeCompleto = `${user.first_name} ${user.last_name}`.trim();

  const isDirty = useMemo(() => {
    return (
      firstName.trim() !== user.first_name ||
      lastName.trim() !== user.last_name ||
      email.trim() !== user.email ||
      (phone.trim() || null) !== (user.phone || null)
    );
  }, [firstName, lastName, email, phone, user]);

  // La pagina lo usa per chiedere conferma prima di cambiare scheda con modifiche in sospeso.
  useEffect(() => {
    onDirtyChange?.(isDirty && !readOnly);
    return () => onDirtyChange?.(false);
  }, [isDirty, readOnly, onDirtyChange]);

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
    if (readOnly || !validate()) return;
    onSave({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      phone: phone.trim() || null,
    });
  };

  /**
   * Cambia la password adesso: quella di prima smette di funzionare e la
   * nuova arriva alla persona per email (reset-customer-password). Se non se ne
   * scrive una, la genera il sistema e l'amministratore non la vede.
   */
  const handleResetPassword = async () => {
    if (readOnly) return;
    if (newPassword.trim() && newPassword.trim().length < 8) {
      toast({ title: "Password troppo corta", description: "Servono almeno 8 caratteri.", variant: "destructive" });
      return;
    }
    setResettingPassword(true);
    try {
      const body: Record<string, string> = { userId: user.id };
      if (newPassword.trim()) {
        body.new_password = newPassword.trim();
      }
      const { data, error } = await supabase.functions.invoke("reset-customer-password", { body });
      // Il messaggio vero della funzione sta nel body, non in error.message:
      // senza questo passaggio l'utente legge solo "Edge Function returned a
      // non-2xx status code" e non sa se è un permesso, un ruolo o altro.
      if (error) throw new Error(await edgeErrorMessage(error, "Impossibile cambiare la password."));
      const pwd = newPassword.trim() || data?.temporaryPassword;
      if (pwd) {
        setGeneratedPassword(pwd);
        setPasswordDialogOpen(true);
        setNewPassword("");
      } else {
        toast({ title: "Password cambiata", description: "La nuova password è arrivata alla persona per email." });
      }
    } catch (err) {
      toast({
        title: "Non sono riuscito a cambiare la password",
        description: messaggioErrorePersone(err, "Riprova tra un attimo."),
        variant: "destructive",
      });
    } finally {
      setResettingPassword(false);
    }
  };

  const handleCopyPassword = async () => {
    await navigator.clipboard.writeText(generatedPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const bloccoGenerale = isLoading || readOnly;

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          {/* Mobile: niente titolo né avatar, nome ed email sono già in testata. */}
          <CardHeader className="max-md:hidden">
            <CardTitle>Dati</CardTitle>
            <CardDescription>Dati personali e di contatto della persona.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 max-md:space-y-4 max-md:p-4">
            {/* Avatar + Role */}
            <div className="flex items-center gap-4 max-md:hidden">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="text-lg bg-primary/10 text-primary font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium">{nomeCompleto}</p>
                  {role && ROLE_CONFIG[role] && (() => {
                    const { label, icon: RIcon, color } = ROLE_CONFIG[role];
                    return (
                      <Badge className={`${color} font-normal gap-1 text-xs`}>
                        <RIcon className="h-3 w-3" aria-hidden="true" /> {label}
                      </Badge>
                    );
                  })()}
                  {isBlocked && (
                    <Badge variant="destructive" className="gap-1 text-xs">
                      <ShieldOff className="h-3 w-3" aria-hidden="true" /> Accesso bloccato
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>

            {/* Campi */}
            <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1 max-sm:gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName">Nome *</Label>
                <Input
                  id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={bloccoGenerale}
                  autoComplete="off" aria-invalid={!!validationErrors.firstName}
                  aria-describedby={validationErrors.firstName ? "firstName-errore" : undefined}
                />
                {validationErrors.firstName && <p id="firstName-errore" role="alert" className="text-xs text-destructive">{validationErrors.firstName}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Cognome *</Label>
                <Input
                  id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={bloccoGenerale}
                  autoComplete="off" aria-invalid={!!validationErrors.lastName}
                  aria-describedby={validationErrors.lastName ? "lastName-errore" : undefined}
                />
                {validationErrors.lastName && <p id="lastName-errore" role="alert" className="text-xs text-destructive">{validationErrors.lastName}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={bloccoGenerale}
                autoComplete="off" aria-invalid={!!validationErrors.email}
                aria-describedby={validationErrors.email ? "email-errore" : "email-aiuto"}
              />
              {validationErrors.email
                ? <p id="email-errore" role="alert" className="text-xs text-destructive">{validationErrors.email}</p>
                : <p id="email-aiuto" className="text-xs text-muted-foreground max-md:hidden">È anche l'indirizzo con cui entra. Se la cambi, ti chiediamo di confermare.</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Telefono</Label>
              <Input
                id="phone" type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="+39 333 1234567" disabled={bloccoGenerale}
              />
            </div>

            {/* Password: cambia subito */}
            <div className="pt-2 border-t space-y-3">
              <div>
                <p className="text-sm font-medium">Password</p>
                <p id="password-aiuto" className="text-xs text-muted-foreground max-md:hidden">
                  La password cambia adesso: quella di prima smette di funzionare e la nuova arriva alla persona per email.
                  Se non ne scrivi una, la genera il sistema e tu non la vedi. Per mandare solo un link, senza cambiarla
                  adesso, vai in «Sicurezza».
                </p>
              </div>
              <div className="flex items-center gap-3 max-sm:flex-col max-sm:items-stretch max-sm:gap-2">
                <div className="relative flex-1 max-w-xs max-sm:max-w-none">
                  <Input
                    type={showPassword ? "text" : "password"}
                    aria-label="Nuova password (se vuoi scriverla tu)"
                    aria-describedby="password-aiuto"
                    autoComplete="new-password"
                    placeholder="Nuova password (se vuoi scriverla tu)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={resettingPassword || readOnly}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Nascondi la password" : "Mostra la password"}
                    aria-pressed={showPassword}
                    disabled={readOnly}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
                  </Button>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="outline" size="sm" disabled={resettingPassword || readOnly} className="max-sm:h-10">
                      {resettingPassword ? <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4 mr-2" aria-hidden="true" />}
                      Cambia subito la password
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cambiare la password{nomeCompleto ? ` a ${nomeCompleto}` : ""}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Quella di prima smette di funzionare subito. La nuova arriva alla persona per email.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annulla</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void handleResetPassword()}>Cambia la password</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Mobile: la barra compare solo quando c'è qualcosa da salvare. */}
        {!readOnly && (
          <div className={`flex items-center justify-between ${isDirty ? "" : "max-md:hidden"}`}>
            {isDirty ? (
              <span role="status" className="text-xs text-amber-600 font-medium flex items-center gap-1 max-md:hidden">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                Modifiche non salvate
              </span>
            ) : <span />}
            <Button type="submit" disabled={isLoading || !isDirty} className="max-md:flex-1">
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4 mr-2" aria-hidden="true" />}
              Salva le modifiche
            </Button>
          </div>
        )}
      </form>

      {/* Password scritta dall'amministratore */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Password cambiata</DialogTitle>
            <DialogDescription>
              La nuova password è già arrivata alla persona per email. Se vuoi dargliela anche a voce, eccola: comunicala in modo sicuro.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border font-mono text-sm break-all">
            <span className="flex-1">{generatedPassword}</span>
            <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={handleCopyPassword} aria-label={copied ? "Password copiata" : "Copia la password"}>
              {copied ? <Check className="h-4 w-4 text-green-500" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
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
