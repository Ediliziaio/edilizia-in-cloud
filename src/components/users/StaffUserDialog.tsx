import { useState } from "react";
import { Button } from "@/components/ui/button";
import { logger } from "@/utils/logger";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Loader2, Copy, Check, ShieldCheck, User, TrendingUp, Phone, HardHat, Building2, LayoutDashboard, Euro, Users2, Megaphone, Zap, Settings, ChevronDown, Eye, EyeOff, RefreshCw } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { StaffPermissions } from "@/components/users/PermissionsDialog";
import {
  DEFAULT_PERMISSIONS, ALL_PERMISSION_SECTIONS,
  CRUSCOTTO_SECTIONS, CANTIERI_SECTIONS, FINANZA_SECTIONS, PERSONE_SECTIONS,
  MARKETING_SECTIONS, AUTOMAZIONI_SECTIONS, IMPOSTAZIONI_SECTIONS,
} from "@/components/users/permissionsDefaults";

interface StaffUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: StaffUserFormData) => Promise<{ temporaryPassword?: string }>;
  isLoading?: boolean;
  /** Ruolo preselezionato all'apertura (default "company_staff"). */
  defaultRoleType?: StaffRoleType;
  /** Se true, il ruolo è fissato a `defaultRoleType` e il selettore è nascosto. */
  lockRoleType?: boolean;
}

export type StaffRoleType = "company_admin" | "company_staff" | "salesperson" | "call_center" | "employee" | "subcontractor";

export interface StaffUserFormData {
  first_name: string;
  last_name: string;
  email: string;
  role_type: StaffRoleType;
  /** Password temporanea definita dall'admin. Se assente, l'edge function ne genera una. */
  password?: string;
  permissions?: StaffPermissions;
}


// 7 macro-aree allineate al dialog permessi (niente lista piatta + niente
// "Cruscotto Aziendale" duplicato: il Cruscotto vive dentro CRUSCOTTO_SECTIONS).
const PERM_GROUPS: { label: string; icon: React.ElementType; sections: typeof ALL_PERMISSION_SECTIONS }[] = [
  { label: "Cruscotto", icon: LayoutDashboard, sections: CRUSCOTTO_SECTIONS },
  { label: "Cantieri & Lavori", icon: HardHat, sections: CANTIERI_SECTIONS },
  { label: "Finanza", icon: Euro, sections: FINANZA_SECTIONS },
  { label: "Persone", icon: Users2, sections: PERSONE_SECTIONS },
  { label: "Marketing & Vendita", icon: Megaphone, sections: MARKETING_SECTIONS },
  { label: "Automazioni & AI", icon: Zap, sections: AUTOMAZIONI_SECTIONS },
  { label: "Impostazioni", icon: Settings, sections: IMPOSTAZIONI_SECTIONS },
];

const ROLE_OPTIONS: { value: StaffRoleType; label: string; description: string; icon: React.ElementType }[] = [
  { value: "company_admin", label: "Amministratore", description: "Accesso completo", icon: ShieldCheck },
  { value: "company_staff", label: "Operatore", description: "Gestione interna", icon: User },
  { value: "salesperson", label: "Venditore", description: "Vendite e provvigioni", icon: TrendingUp },
  { value: "call_center", label: "Call Center", description: "Contatti e opportunità", icon: Phone },
  { value: "employee", label: "Operaio / Tecnico", description: "Area campo — solo attività assegnate", icon: HardHat },
  { value: "subcontractor", label: "Subappaltatore", description: "Commesse assegnate — visibilità limitata", icon: Building2 },
];

const ROLES_WITH_PERMISSIONS: StaffRoleType[] = ["company_staff", "salesperson", "call_center", "employee", "subcontractor"];

const ROLE_LABELS: Record<StaffRoleType, string> = {
  company_admin: "Amministratore",
  company_staff: "Operatore",
  salesperson: "Venditore",
  call_center: "Call Center",
  employee: "Operaio / Tecnico",
  subcontractor: "Subappaltatore",
};

export function StaffUserDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  defaultRoleType,
  lockRoleType,
}: StaffUserDialogProps) {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  // Init dal ruolo di default. Il reset al cambio di `defaultRoleType` tra
  // un'apertura e l'altra è gestito dal `key` sul componente (CompanyDetail),
  // che forza il remount — niente setState-in-effect.
  const [roleType, setRoleType] = useState<StaffRoleType>(defaultRoleType ?? "company_staff");
  const [permissions, setPermissions] = useState<StaffPermissions>({ ...DEFAULT_PERMISSIONS });
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleTogglePermission = (key: keyof StaffPermissions, value: boolean) => {
    setPermissions((prev) => {
      const updated = { ...prev, [key]: value };
      const section = ALL_PERMISSION_SECTIONS.find((s) => s.viewKey === key);
      if (section?.editKey && !value) {
        updated[section.editKey] = false;
      }
      return updated;
    });
  };

  const handleSelectAll = () => {
    setPermissions((prev) => {
      const allTrue: any = { ...DEFAULT_PERMISSIONS, only_assigned: prev.only_assigned };
      ALL_PERMISSION_SECTIONS.forEach(s => {
        allTrue[s.viewKey] = true;
        if (s.editKey) allTrue[s.editKey] = true;
      });
      allTrue.can_view_cruscotto = true;
      allTrue.can_view_marketing = true;
      allTrue.can_edit_marketing = true;
      return allTrue;
    });
  };

  const handleDeselectAll = () => {
    setPermissions((prev) => ({ ...DEFAULT_PERMISSIONS, only_assigned: prev.only_assigned }));
  };

  const handleGeneratePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
    const rnd = new Uint32Array(14);
    crypto.getRandomValues(rnd);
    setPassword(Array.from(rnd, (n) => chars[n % chars.length]).join(""));
    setShowPassword(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      toast({ title: "Errore", description: "Tutti i campi sono obbligatori", variant: "destructive" });
      return;
    }
    const pwd = password.trim();
    if (pwd && pwd.length < 8) {
      toast({ title: "Errore", description: "La password temporanea deve avere almeno 8 caratteri", variant: "destructive" });
      return;
    }
    try {
      const result = await onSubmit({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase(),
        role_type: roleType,
        password: pwd || undefined,
        permissions: ROLES_WITH_PERMISSIONS.includes(roleType) ? permissions : undefined,
      });
      if (result.temporaryPassword) {
        setTemporaryPassword(result.temporaryPassword);
      }
    } catch (error) {
      logger.error("Error creating user:", error);
    }
  };

  const handleCopyPassword = async () => {
    if (temporaryPassword) {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Copiato!", description: "Password copiata negli appunti" });
    }
  };

  const handleClose = () => {
    setFirstName(""); setLastName(""); setEmail("");
    setRoleType(defaultRoleType ?? "company_staff");
    setPermissions({ ...DEFAULT_PERMISSIONS });
    setTemporaryPassword(null); setCopied(false);
    setPassword(""); setShowPassword(false);
    onOpenChange(false);
  };

  const selectedRoleOption = ROLE_OPTIONS.find((o) => o.value === roleType) ?? ROLE_OPTIONS[0];

  const renderSection = (section: typeof ALL_PERMISSION_SECTIONS[0]) => (
    <div key={section.viewKey} className="space-y-1.5">
      <div className="flex items-center space-x-2">
        <Checkbox
          id={`create-${section.viewKey}`}
          checked={permissions[section.viewKey] as boolean}
          onCheckedChange={(checked) => handleTogglePermission(section.viewKey, checked as boolean)}
          disabled={isLoading}
        />
        <Label htmlFor={`create-${section.viewKey}`} className="font-medium text-sm">
          {section.label}
        </Label>
      </div>
      {section.editKey && permissions[section.viewKey] && (
        <div className="ml-6 flex items-center space-x-2">
          <Checkbox
            id={`create-${section.editKey}`}
            checked={permissions[section.editKey] as boolean}
            onCheckedChange={(checked) => handleTogglePermission(section.editKey!, checked as boolean)}
            disabled={isLoading}
          />
          <Label htmlFor={`create-${section.editKey}`} className="text-xs text-muted-foreground">
            Può modificare
          </Label>
        </div>
      )}
    </div>
  );

  if (temporaryPassword) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Utente Creato con Successo! 🎉</DialogTitle>
            <DialogDescription>
              L'utente {firstName} {lastName} è stato creato come {ROLE_LABELS[roleType]}. Comunica la password temporanea all'utente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <p className="text-sm font-medium">Credenziali di accesso:</p>
              <div className="text-sm"><span className="text-muted-foreground">Email:</span> {email}</div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Password:</span>
                <code className="px-2 py-1 bg-background rounded text-sm font-mono">{temporaryPassword}</code>
                <Button variant="ghost" size="icon" onClick={handleCopyPassword} className="h-8 w-8">
                  {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              ⚠️ Questa password viene mostrata solo una volta. Assicurati di comunicarla all'utente in modo sicuro.
            </p>
          </div>
          <DialogFooter><Button onClick={handleClose}>Chiudi</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lockRoleType ? `Nuovo ${ROLE_LABELS[roleType]}` : "Nuovo Utente Aziendale"}</DialogTitle>
          <DialogDescription>
            {lockRoleType
              ? `Crea un nuovo account "${ROLE_LABELS[roleType]}" per questa azienda. Compila i dati.`
              : "Crea un nuovo utente per la tua azienda. Scegli il tipo di ruolo e compila i dati."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {lockRoleType ? (
            <div className="space-y-2">
              <Label>Tipo utente</Label>
              <div className="flex items-center gap-3 p-3 rounded-lg border-2 border-primary bg-primary/5">
                <selectedRoleOption.icon className="h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="font-medium text-sm">{selectedRoleOption.label}</p>
                  <p className="text-xs text-muted-foreground">{selectedRoleOption.description}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Tipo utente *</Label>
              <div className="grid grid-cols-2 gap-3">
                {ROLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRoleType(opt.value)}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-colors ${roleType === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}
                    disabled={isLoading}
                  >
                    <opt.icon className={`h-5 w-5 shrink-0 ${roleType === opt.value ? "text-primary" : "text-muted-foreground"}`} />
                    <div>
                      <p className="font-medium text-sm">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Nome *</Label>
                <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Mario" disabled={isLoading} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Cognome *</Label>
                <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Rossi" disabled={isLoading} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mario.rossi@example.com" disabled={isLoading} />
              <p className="text-xs text-muted-foreground">L'utente userà questa email per accedere al sistema</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tempPassword">Password temporanea <span className="font-normal text-muted-foreground">(opzionale)</span></Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="tempPassword"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Lascia vuoto per generarla in automatico"
                    autoComplete="new-password"
                    disabled={isLoading}
                    className="pr-10 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                    aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                    disabled={isLoading}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button type="button" variant="outline" size="icon" onClick={handleGeneratePassword} disabled={isLoading} title="Genera password sicura">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Minimo 8 caratteri. Se vuota, il sistema ne genera una sicura. Verrà mostrata dopo la creazione.</p>
            </div>
          </div>

          {ROLES_WITH_PERMISSIONS.includes(roleType) && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Permessi</Label>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={handleSelectAll} disabled={isLoading}>Seleziona tutti</Button>
                    <Button type="button" variant="outline" size="sm" onClick={handleDeselectAll} disabled={isLoading}>Deseleziona tutti</Button>
                  </div>
                </div>

                <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                  {PERM_GROUPS.map((g) => {
                    const active = g.sections.filter((s) => permissions[s.viewKey]).length;
                    return (
                      <Collapsible key={g.label} defaultOpen>
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            className="w-full flex items-center justify-between p-2.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                          >
                            <span className="flex items-center gap-2">
                              <g.icon className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">{g.label}</span>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {active}/{g.sections.length}
                              </Badge>
                            </span>
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="px-2.5 pt-2 pb-1 space-y-2">
                          {g.sections.map(renderSection)}
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}

                  <Separator />

                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="create-only_assigned" checked={permissions.only_assigned || false}
                        onCheckedChange={(checked) => setPermissions((prev) => ({ ...prev, only_assigned: checked as boolean }))} disabled={isLoading} />
                      <Label htmlFor="create-only_assigned" className="font-medium text-sm">Solo elementi assegnati</Label>
                    </div>
                    <p className="text-xs text-muted-foreground ml-6">Se attivo, l'utente vedrà solo ordini, attività e appuntamenti assegnati a lui</p>
                  </div>
                </div>
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>Annulla</Button>
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
