import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Loader2, Copy, Check, ShieldCheck, User, TrendingUp, Phone,
  ChevronRight, ChevronLeft, ChevronDown, Building2, LayoutDashboard, Megaphone, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { StaffPermissions } from "@/components/users/PermissionsDialog";
import {
  DEFAULT_PERMISSIONS, STANDALONE_SECTIONS, INTERNAL_SECTIONS, MARKETING_SECTIONS,
  ALL_PERMISSION_SECTIONS, ROLE_PRESETS, syncLegacyMarketingFlags,
  type PermissionSectionDef, type StaffRoleType,
} from "@/components/users/permissionsDefaults";

export type { StaffRoleType };

export interface WizardUserFormData {
  first_name: string;
  last_name: string;
  email: string;
  role_type: StaffRoleType;
  permissions?: StaffPermissions;
}

interface CreateUserWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: WizardUserFormData) => Promise<{ temporaryPassword?: string }>;
  isLoading?: boolean;
}

const ROLE_OPTIONS: { value: StaffRoleType; label: string; description: string; icon: React.ElementType; color: string }[] = [
  { value: "company_admin", label: "Amministratore", description: "Accesso completo a tutto", icon: ShieldCheck, color: "text-blue-600 bg-blue-500/10 border-blue-500/20" },
  { value: "company_staff", label: "Operatore", description: "Gestione interna commesse", icon: User, color: "text-slate-600 bg-slate-500/10 border-slate-500/20" },
  { value: "salesperson", label: "Venditore", description: "Vendite e opportunità", icon: TrendingUp, color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" },
  { value: "call_center", label: "Call Center", description: "Contatti e assistenza", icon: Phone, color: "text-orange-600 bg-orange-500/10 border-orange-500/20" },
];

const ROLES_WITH_PERMISSIONS: StaffRoleType[] = ["company_staff", "salesperson", "call_center"];

const ROLE_LABELS: Record<StaffRoleType, string> = {
  company_admin: "Amministratore", company_staff: "Operatore",
  salesperson: "Venditore", call_center: "Call Center",
};

// --- Permission Group Component ---
function PermGroup({ label, icon: Icon, iconColor, sections, permissions, onToggle }: {
  label: string; icon: React.ElementType; iconColor: string;
  sections: PermissionSectionDef[]; permissions: StaffPermissions;
  onToggle: (key: keyof StaffPermissions, value: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  const activeCount = sections.reduce((c, s) => {
    let n = permissions[s.viewKey] ? 1 : 0;
    if (s.editKey && permissions[s.editKey]) n++;
    return c + n;
  }, 0);
  const totalCount = sections.reduce((c, s) => c + 1 + (s.editKey ? 1 : 0), 0);
  const allActive = activeCount === totalCount;

  const handleToggleAll = (checked: boolean) => {
    sections.forEach(s => {
      onToggle(s.viewKey, checked);
      if (s.editKey) onToggle(s.editKey, checked);
    });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button type="button" className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${iconColor}`} />
            <span className="text-sm font-medium">{label}</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{activeCount}/{totalCount}</Badge>
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Switch checked={allActive} onCheckedChange={handleToggleAll} />
            {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pt-2 pb-1 space-y-2">
        {sections.map(section => (
          <div key={section.viewKey} className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <Switch
                id={`wiz-${section.viewKey}`}
                checked={permissions[section.viewKey]}
                onCheckedChange={(checked) => onToggle(section.viewKey, checked)}
              />
              <Label htmlFor={`wiz-${section.viewKey}`} className="text-sm cursor-pointer">{section.label}</Label>
            </div>
            {section.editKey && permissions[section.viewKey] && (
              <div className="flex items-center gap-1.5">
                <Switch
                  id={`wiz-${section.editKey}`}
                  checked={permissions[section.editKey]}
                  onCheckedChange={(checked) => onToggle(section.editKey!, checked)}
                />
                <Label htmlFor={`wiz-${section.editKey}`} className="text-xs text-muted-foreground cursor-pointer">Modifica</Label>
              </div>
            )}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function CreateUserWizard({ open, onOpenChange, onSubmit, isLoading }: CreateUserWizardProps) {
  const { toast } = useToast();
  // Steps: 1=role, 2=info, 3=perms(or confirm for admin), 4=confirm(non-admin only), success=5
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [roleType, setRoleType] = useState<StaffRoleType>("company_staff");
  const [permissions, setPermissions] = useState<StaffPermissions>({ ...DEFAULT_PERMISSIONS });
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const showPermissions = ROLES_WITH_PERMISSIONS.includes(roleType);
  const totalSteps = showPermissions ? 4 : 3;
  const isConfirmStep = showPermissions ? step === 4 : step === 3;
  const isSuccessStep = step === 5;

  const resetForm = () => {
    setStep(1); setFirstName(""); setLastName(""); setEmail("");
    setRoleType("company_staff");
    setPermissions({ ...DEFAULT_PERMISSIONS, ...ROLE_PRESETS.company_staff });
    setTemporaryPassword(null); setCopied(false);
  };

  const handleClose = () => { resetForm(); onOpenChange(false); };

  const applyRolePreset = (role: StaffRoleType) => {
    setRoleType(role);
    if (ROLES_WITH_PERMISSIONS.includes(role)) {
      setPermissions({ ...DEFAULT_PERMISSIONS, ...ROLE_PRESETS[role] });
    }
  };

  const handleToggle = (key: keyof StaffPermissions, value: boolean) => {
    setPermissions(prev => {
      const updated = { ...prev, [key]: value };
      const section = ALL_PERMISSION_SECTIONS.find(s => s.viewKey === key);
      if (section?.editKey && !value) updated[section.editKey] = false;
      return updated;
    });
  };

  const handleSelectAll = () => {
    const allTrue: Partial<StaffPermissions> = {};
    ALL_PERMISSION_SECTIONS.forEach(s => {
      (allTrue as any)[s.viewKey] = true;
      if (s.editKey) (allTrue as any)[s.editKey] = true;
    });
    setPermissions(prev => ({ ...prev, ...allTrue, can_view_marketing: true, can_edit_marketing: true }));
  };

  const handleDeselectAll = () => {
    setPermissions(prev => ({ ...DEFAULT_PERMISSIONS, only_assigned: prev.only_assigned }));
  };

  const handleResetPreset = () => {
    setPermissions(prev => ({ ...DEFAULT_PERMISSIONS, only_assigned: prev.only_assigned, ...ROLE_PRESETS[roleType] }));
  };

  const handleNext = () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      if (!firstName.trim() || !lastName.trim() || !email.trim()) {
        toast({ title: "Campi obbligatori", description: "Compila nome, cognome e email.", variant: "destructive" });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        toast({ title: "Email non valida", description: "Inserisci un indirizzo email valido.", variant: "destructive" });
        return;
      }
      setStep(3);
    } else if (step === 3 && showPermissions) {
      setStep(4);
    }
  };

  const handleBack = () => {
    if (isConfirmStep && !showPermissions) {
      setStep(2); // Admin: confirm(3) -> info(2)
    } else {
      setStep(step - 1);
    }
  };

  const handleSubmit = async () => {
    try {
      const finalPerms = showPermissions ? syncLegacyMarketingFlags(permissions) : undefined;
      const result = await onSubmit({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase(),
        role_type: roleType,
        permissions: finalPerms,
      });
      if (result.temporaryPassword) {
        setTemporaryPassword(result.temporaryPassword);
        setStep(5);
      } else {
        handleClose();
      }
    } catch {
      // Error handled in parent
    }
  };

  const copyPassword = async () => {
    if (temporaryPassword) {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const totalActive = useMemo(() => {
    const excluded = new Set(["only_assigned", "can_view_marketing", "can_edit_marketing"]);
    return Object.entries(permissions).filter(([k, v]) => v === true && !excluded.has(k)).length;
  }, [permissions]);

  const stepLabels = showPermissions
    ? ["Tipo Utente", "Dati Utente", "Permessi", "Conferma"]
    : ["Tipo Utente", "Dati Utente", "Conferma"];

  const currentRoleOption = ROLE_OPTIONS.find(r => r.value === roleType);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] !flex !flex-col overflow-hidden">
        {/* Fixed header */}
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            {isSuccessStep ? "Utente Creato" : `Nuovo Utente — Step ${step}/${totalSteps}`}
          </DialogTitle>
          {!isSuccessStep && (
            <DialogDescription>{stepLabels[step - 1]}</DialogDescription>
          )}
        </DialogHeader>

        {/* Progress bar */}
        {!isSuccessStep && (
          <div className="flex gap-1.5 px-1 flex-shrink-0">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${i < step ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-2">
          {/* STEP 1: Role Selection */}
          {step === 1 && (
            <div className="grid grid-cols-2 gap-3 py-2">
              {ROLE_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const isSelected = roleType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => applyRolePreset(opt.value)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 text-center transition-all ${
                      isSelected ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className={`rounded-full p-3 ${isSelected ? "bg-primary/10" : "bg-muted"}`}>
                      <Icon className={`h-5 w-5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-primary" />}
                  </button>
                );
              })}
              {roleType === "company_admin" && (
                <div className="col-span-2 bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-700">
                    L'amministratore ha accesso completo a tutte le sezioni. Non è necessario configurare permessi specifici.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: User Info */}
          {step === 2 && (
            <div className="space-y-4 py-2">
              {currentRoleOption && (
                <Badge className={currentRoleOption.color}>
                  <currentRoleOption.icon className="h-3 w-3 mr-1" />
                  {currentRoleOption.label}
                </Badge>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Mario" />
                </div>
                <div className="space-y-2">
                  <Label>Cognome *</Label>
                  <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Rossi" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="mario.rossi@azienda.it" />
                <p className="text-xs text-muted-foreground">
                  Verrà usata per il login. La password temporanea sarà generata automaticamente.
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: Permissions (non-admin) or Confirm (admin) */}
          {step === 3 && showPermissions && (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between">
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={handleSelectAll}>Seleziona tutto</Button>
                  <Button variant="outline" size="sm" onClick={handleDeselectAll}>Deseleziona tutto</Button>
                  <Button variant="outline" size="sm" onClick={handleResetPreset}>
                    Ripristina preset {ROLE_LABELS[roleType]}
                  </Button>
                </div>
                <Badge variant="outline">{totalActive} attivi</Badge>
              </div>

              <PermGroup label="Cruscotto Aziendale" icon={Building2} iconColor="text-indigo-600"
                sections={STANDALONE_SECTIONS} permissions={permissions} onToggle={handleToggle} />
              <PermGroup label="Gestione Interna" icon={LayoutDashboard} iconColor="text-blue-600"
                sections={INTERNAL_SECTIONS} permissions={permissions} onToggle={handleToggle} />
              <PermGroup label="Marketing e Vendite" icon={Megaphone} iconColor="text-purple-600"
                sections={MARKETING_SECTIONS} permissions={permissions} onToggle={handleToggle} />

              <Separator />

              <div className="flex items-center justify-between py-2">
                <div>
                  <Label htmlFor="wiz-only_assigned" className="font-medium cursor-pointer">Solo elementi assegnati</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Se attivo, l'utente vedrà SOLO ordini, attività e appuntamenti assegnati a lui.
                  </p>
                </div>
                <Switch
                  id="wiz-only_assigned"
                  checked={permissions.only_assigned}
                  onCheckedChange={checked => setPermissions(prev => ({ ...prev, only_assigned: checked }))}
                />
              </div>
            </div>
          )}

          {/* CONFIRM STEP */}
          {isConfirmStep && (
            <div className="space-y-4 py-2">
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Nome</span>
                  <span className="text-sm font-medium">{firstName} {lastName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Email</span>
                  <span className="text-sm font-medium">{email}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Ruolo</span>
                  {currentRoleOption && (
                    <Badge className={currentRoleOption.color}>
                      <currentRoleOption.icon className="h-3 w-3 mr-1" />
                      {currentRoleOption.label}
                    </Badge>
                  )}
                </div>
                {showPermissions && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Permessi attivi</span>
                    <Badge variant="secondary">{totalActive}</Badge>
                  </div>
                )}
              </div>
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700">
                  Verrà generata una password temporanea. L'utente dovrà cambiarla al primo accesso.
                </p>
              </div>
            </div>
          )}

          {/* SUCCESS STEP */}
          {isSuccessStep && (
            <div className="space-y-4 py-4 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              </div>
              <p className="font-medium text-lg">Utente creato con successo!</p>
              {temporaryPassword && (
                <div className="bg-muted rounded-lg p-4 space-y-3 text-left">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Email</span>
                    <span className="text-sm font-mono">{email}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Password</span>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono bg-background px-2 py-1 rounded border">{temporaryPassword}</code>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyPassword}>
                        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3">
                <p className="text-xs text-destructive font-medium">
                  ⚠️ Questa password viene mostrata solo una volta. Comunica questa password all'utente in modo sicuro prima di chiudere.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Fixed footer */}
        <DialogFooter className="flex-shrink-0 gap-2 sm:gap-0">
          {isSuccessStep ? (
            <Button onClick={handleClose}>Chiudi</Button>
          ) : (
            <>
              {step > 1 && (
                <Button variant="outline" onClick={handleBack} disabled={isLoading}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Indietro
                </Button>
              )}
              {isConfirmStep ? (
                <Button onClick={handleSubmit} disabled={isLoading}>
                  {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Crea Utente
                </Button>
              ) : (
                <Button onClick={handleNext}>
                  Avanti
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
