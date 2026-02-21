import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Copy, Check, ShieldCheck, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StaffUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: StaffUserFormData) => Promise<{ temporaryPassword?: string }>;
  isLoading?: boolean;
}

export interface StaffUserFormData {
  first_name: string;
  last_name: string;
  email: string;
  role_type: "company_admin" | "company_staff";
}

export function StaffUserDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: StaffUserDialogProps) {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [roleType, setRoleType] = useState<"company_admin" | "company_staff">("company_staff");
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      toast({
        title: "Errore",
        description: "Tutti i campi sono obbligatori",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await onSubmit({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase(),
        role_type: roleType,
      });
      
      if (result.temporaryPassword) {
        setTemporaryPassword(result.temporaryPassword);
      }
    } catch (error) {
      console.error("Error creating user:", error);
    }
  };

  const handleCopyPassword = async () => {
    if (temporaryPassword) {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copiato!",
        description: "Password copiata negli appunti",
      });
    }
  };

  const handleClose = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setRoleType("company_staff");
    setTemporaryPassword(null);
    setCopied(false);
    onOpenChange(false);
  };

  // Show password after creation
  if (temporaryPassword) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Utente Creato con Successo! 🎉</DialogTitle>
            <DialogDescription>
              L'utente {firstName} {lastName} è stato creato come {roleType === "company_admin" ? "Amministratore" : "Operatore"}. Comunica la password temporanea all'utente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <p className="text-sm font-medium">Credenziali di accesso:</p>
              <div className="text-sm">
                <span className="text-muted-foreground">Email:</span> {email}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Password:</span>
                <code className="px-2 py-1 bg-background rounded text-sm font-mono">
                  {temporaryPassword}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopyPassword}
                  className="h-8 w-8"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              ⚠️ Questa password viene mostrata solo una volta. Assicurati di comunicarla all'utente 
              in modo sicuro. L'utente potrà cambiarla dopo il primo accesso.
            </p>
          </div>

          <DialogFooter>
            <Button onClick={handleClose}>Chiudi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuovo Utente Aziendale</DialogTitle>
          <DialogDescription>
            Crea un nuovo utente per la tua azienda. Scegli il tipo di ruolo e compila i dati.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Role Type Selector */}
          <div className="space-y-2">
            <Label>Tipo utente *</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRoleType("company_admin")}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-colors ${
                  roleType === "company_admin"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/30"
                }`}
                disabled={isLoading}
              >
                <ShieldCheck className={`h-5 w-5 shrink-0 ${roleType === "company_admin" ? "text-primary" : "text-muted-foreground"}`} />
                <div>
                  <p className="font-medium text-sm">Amministratore</p>
                  <p className="text-xs text-muted-foreground">Accesso completo, può gestire utenti</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setRoleType("company_staff")}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-colors ${
                  roleType === "company_staff"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/30"
                }`}
                disabled={isLoading}
              >
                <User className={`h-5 w-5 shrink-0 ${roleType === "company_staff" ? "text-primary" : "text-muted-foreground"}`} />
                <div>
                  <p className="font-medium text-sm">Operatore</p>
                  <p className="text-xs text-muted-foreground">Accesso limitato ai permessi configurati</p>
                </div>
              </button>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Nome *</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Mario"
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Cognome *</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Rossi"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="mario.rossi@example.com"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                L'utente userà questa email per accedere al sistema
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
              Annulla
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crea Utente
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
