import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Loader2, Copy, Check, ShieldCheck, User, TrendingUp, Phone,
  ChevronRight, ChevronLeft, ChevronDown, Building2, LayoutDashboard, Megaphone, CheckCircle2, AlertTriangle, Settings,
  Eye, EyeOff, Lock, HardHat, MapPin, Euro, Search, Users2, X, Info,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { StaffPermissions } from "@/components/users/PermissionsDialog";
import {
  DEFAULT_PERMISSIONS, CRUSCOTTO_SECTIONS, CANTIERI_SECTIONS, FINANZA_SECTIONS,
  PERSONE_SECTIONS, MARKETING_SECTIONS, AUTOMAZIONI_SECTIONS, IMPOSTAZIONI_SECTIONS,
  ALL_PERMISSION_SECTIONS, ROLE_PRESETS, syncLegacyMarketingFlags, syncLegacySettingsFlags,
  ECONOMIC_LEVELS, detectEconomicLevel,
  type PermissionSectionDef, type StaffRoleType, type BooleanPermissionKey,
} from "@/components/users/permissionsDefaults";

export type { StaffRoleType };

export interface WizardUserFormData {
  first_name: string;
  last_name: string;
  email: string;
  password?: string;
  role_type: StaffRoleType;
  permissions?: StaffPermissions;
  commission_percentage?: number;
  /** Stipendio lordo mensile (€). Per dipendenti (Operaio/Tecnico) e venditori assunti. */
  gross_salary?: number;
  /** Solo per venditori: "assunto" (dipendente con stipendio) vs "p_iva" (solo provvigione). */
  salesperson_type?: "assunto" | "p_iva";
}

interface CreateUserWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: WizardUserFormData) => Promise<{ temporaryPassword?: string }>;
  isLoading?: boolean;
}

const ROLE_OPTIONS: { value: StaffRoleType; label: string; description: string; icon: React.ElementType; color: string; preview?: string[] }[] = [
  { value: "company_admin", label: "Amministratore", description: "Accesso completo a tutto", icon: ShieldCheck, color: "text-blue-600 bg-blue-500/10 border-blue-500/20", preview: [] },
  { value: "company_staff", label: "Operatore", description: "Gestione interna commesse", icon: User, color: "text-slate-600 bg-slate-500/10 border-slate-500/20", preview: ["Ordini & Commesse", "Magazzino", "Calendario", "Clienti", "Fatturazione"] },
  { value: "salesperson", label: "Venditore", description: "Vendite e opportunità", icon: TrendingUp, color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20", preview: ["CRM Contatti", "Opportunità", "Preventivi CRM", "Calendar CRM", "Sales OS"] },
  { value: "call_center", label: "Call Center", description: "Contatti e assistenza", icon: Phone, color: "text-orange-600 bg-orange-500/10 border-orange-500/20", preview: ["CRM Contatti", "Opportunità (vista)", "Calendario CRM", "Appuntamenti"] },
  { value: "employee", label: "Operaio / Tecnico", description: "Accesso cantiere — solo attività assegnate", icon: HardHat, color: "text-amber-600 bg-amber-500/10 border-amber-500/20", preview: ["Calendario (propri turni)", "Giornale Lavori"] },
  { value: "subcontractor", label: "Subappaltatore", description: "Commesse assegnate — visibilità limitata", icon: Building2, color: "text-purple-600 bg-purple-500/10 border-purple-500/20", preview: ["Ordini assegnati", "Calendario", "Clienti (propri)"] },
];

const ROLES_WITH_PERMISSIONS: StaffRoleType[] = ["company_staff", "salesperson", "call_center", "employee", "subcontractor"];

const ROLE_LABELS: Record<StaffRoleType, string> = {
  company_admin: "Amministratore", company_staff: "Operatore",
  salesperson: "Venditore", call_center: "Call Center",
  employee: "Operaio / Tecnico",
  subcontractor: "Subappaltatore",
};

// --- Permission Group Component ---
function PermGroup({ label, icon: Icon, iconColor, sections, permissions, onToggle }: {
  label: string; icon: React.ElementType; iconColor: string;
  sections: PermissionSectionDef[]; permissions: StaffPermissions;
  onToggle: (key: BooleanPermissionKey, value: boolean) => void;
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
      <CollapsibleContent className="px-3 pt-2 pb-1 space-y-1">
        {sections.map(section => (
          <div key={section.viewKey} className="flex items-start justify-between gap-3 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/40">
            <div className="flex items-start gap-2.5 min-w-0">
              <Switch
                id={`wiz-${section.viewKey}`}
                className="mt-0.5"
                checked={permissions[section.viewKey]}
                onCheckedChange={(checked) => onToggle(section.viewKey, checked)}
              />
              <div className="min-w-0">
                <Label htmlFor={`wiz-${section.viewKey}`} className="text-sm cursor-pointer leading-tight">{section.label}</Label>
                {section.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{section.description}</p>
                )}
              </div>
            </div>
            {section.editKey && permissions[section.viewKey] && (
              <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
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

// Gruppi dello step permessi (stesse macro-aree della sidebar). Le 3 chiavi
// economiche sono escluse dai gruppi: le governa il selettore a livelli.
const WIZARD_GROUPS = [
  { label: "Cruscotto",           icon: Building2,       iconColor: "text-indigo-600",  sections: CRUSCOTTO_SECTIONS },
  { label: "Cantieri & Lavori",   icon: LayoutDashboard, iconColor: "text-blue-600",    sections: CANTIERI_SECTIONS },
  { label: "Finanza",             icon: Euro,            iconColor: "text-emerald-600", sections: FINANZA_SECTIONS },
  { label: "Persone",             icon: Users2,          iconColor: "text-amber-600",   sections: PERSONE_SECTIONS },
  { label: "Marketing & Vendita", icon: Megaphone,       iconColor: "text-purple-600",  sections: MARKETING_SECTIONS },
  { label: "Automazioni & AI",    icon: Building2,       iconColor: "text-orange-600",  sections: AUTOMAZIONI_SECTIONS },
  { label: "Impostazioni",        icon: Settings,        iconColor: "text-slate-600",   sections: IMPOSTAZIONI_SECTIONS },
];
const WIZARD_ECON_KEYS = new Set<string>(["can_view_order_amounts", "can_view_costs", "can_view_margins"]);

export function CreateUserWizard({ open, onOpenChange, onSubmit, isLoading }: CreateUserWizardProps) {
  const { toast } = useToast();
  // Steps: 1=role, 2=info, 3=perms(or confirm for admin), 4=confirm(non-admin only), success=5
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [roleType, setRoleType] = useState<StaffRoleType>("company_staff");
  const [permissions, setPermissions] = useState<StaffPermissions>({ ...DEFAULT_PERMISSIONS });
  const [permSearch, setPermSearch] = useState("");
  const economicLevel = detectEconomicLevel(permissions);
  const filterWizardSections = (sections: PermissionSectionDef[]) => {
    const q = permSearch.trim().toLowerCase();
    return sections
      .filter((s) => !WIZARD_ECON_KEYS.has(s.viewKey))
      .filter((s) => !q || s.label.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q));
  };
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [commissionPercentage, setCommissionPercentage] = useState<string>("");
  const [salespersonType, setSalespersonType] = useState<"assunto" | "p_iva">("p_iva");
  const [grossSalary, setGrossSalary] = useState<string>("");

  const showPermissions = ROLES_WITH_PERMISSIONS.includes(roleType);
  const totalSteps = showPermissions ? 4 : 3;
  const isConfirmStep = showPermissions ? step === 4 : step === 3;
  const isSuccessStep = step === 5;

  const resetForm = () => {
    setStep(1); setFirstName(""); setLastName(""); setEmail("");
    setRoleType("company_staff");
    setPermissions({ ...DEFAULT_PERMISSIONS, ...ROLE_PRESETS.company_staff });
    setTemporaryPassword(null); setCopied(false);
    setPassword(""); setShowPassword(false);
    setShowConfirmClose(false); setCommissionPercentage(""); setSalespersonType("p_iva"); setGrossSalary("");
  };

  // Considera "in corso" ogni stato con dati inseriti o step > 1 (tranne success).
  // Nello success step la password è già stata mostrata → chiusura diretta senza conferma.
  const isDirty =
    !isSuccessStep &&
    (step > 1 || firstName.trim() !== "" || lastName.trim() !== "" || email.trim() !== "" || password.trim() !== "");

  const handleClose = () => { resetForm(); onOpenChange(false); };

  // Chiusura "richiesta" (outside click, ESC, pulsante X): se dirty chiedi conferma
  const requestClose = () => {
    if (isDirty) {
      setShowConfirmClose(true);
    } else {
      handleClose();
    }
  };

  const confirmDiscardAndClose = () => {
    setShowConfirmClose(false);
    handleClose();
  };

  const applyRolePreset = (role: StaffRoleType) => {
    setRoleType(role);
    if (ROLES_WITH_PERMISSIONS.includes(role)) {
      setPermissions({ ...DEFAULT_PERMISSIONS, ...ROLE_PRESETS[role] });
    }
  };

  const handleToggle = (key: BooleanPermissionKey, value: boolean) => {
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
      const finalPerms = showPermissions ? syncLegacySettingsFlags(syncLegacyMarketingFlags(permissions)) : undefined;
      const commission = roleType === "salesperson" && commissionPercentage
        ? parseFloat(commissionPercentage)
        : undefined;
      // Stipendio rilevante per dipendenti (Operaio/Tecnico) e venditori ASSUNTI.
      const salaryRelevant = roleType === "employee" || (roleType === "salesperson" && salespersonType === "assunto");
      const grossSalaryNum = salaryRelevant && grossSalary.trim()
        ? parseFloat(grossSalary.replace(",", "."))
        : undefined;
      const result = await onSubmit({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase(),
        password: password.trim() || undefined,
        role_type: roleType,
        permissions: finalPerms,
        commission_percentage: commission,
        gross_salary: Number.isFinite(grossSalaryNum) ? grossSalaryNum : undefined,
        salesperson_type: roleType === "salesperson" ? salespersonType : undefined,
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
    <>
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) requestClose(); }}>
      <DialogContent
        className={`${step === 3 && showPermissions ? "sm:max-w-[820px]" : "sm:max-w-[600px]"} max-h-[85vh] !flex !flex-col overflow-hidden transition-[max-width] duration-200`}
        onPointerDownOutside={(e) => { if (isDirty) { e.preventDefault(); setShowConfirmClose(true); } }}
        onEscapeKeyDown={(e) => { if (isDirty) { e.preventDefault(); setShowConfirmClose(true); } }}
      >
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
              {(() => {
                const selectedOpt = ROLE_OPTIONS.find(o => o.value === roleType);
                return selectedOpt?.preview && selectedOpt.preview.length > 0 ? (
                  <div className="col-span-2 mt-1 bg-muted/40 rounded-lg p-3 border border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Accessi inclusi di default:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedOpt.preview.map(label => (
                        <span key={label} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{label}</span>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}
              {(roleType === "employee" || roleType === "subcontractor") && (
                <div className="col-span-2 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 flex items-start gap-2">
                  <Lock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700">
                    {roleType === "employee"
                      ? "Accede solo all'app mobile di cantiere (lavori.ediliziaincloud.com). Nessun accesso al gestionale web."
                      : "Accede solo alle commesse assegnate a lui. Nessun accesso a dati finanziari aziendali."}
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
              <div className="space-y-2">
                <Label>Password (opzionale)</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Lascia vuoto per generare automaticamente"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {password
                    ? "Password personalizzata. L'utente potrà cambiarla dopo il primo accesso."
                    : "Verrà generata automaticamente una password sicura."}
                </p>
              </div>

              {/* Venditore: tipo (assunto/P.IVA) + provvigione + stipendio se assunto */}
              {roleType === "salesperson" && (
                <div className="space-y-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                    <Label className="font-medium">Tipo venditore</Label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSalespersonType("assunto")}
                      className={`rounded-lg border p-2.5 text-left text-sm transition-colors ${salespersonType === "assunto" ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30" : "border-border hover:bg-muted/50"}`}
                    >
                      <p className="font-medium">Assunto</p>
                      <p className="text-xs text-muted-foreground">Dipendente con stipendio (+ eventuale provvigione)</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSalespersonType("p_iva")}
                      className={`rounded-lg border p-2.5 text-left text-sm transition-colors ${salespersonType === "p_iva" ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30" : "border-border hover:bg-muted/50"}`}
                    >
                      <p className="font-medium">P.IVA a provvigione</p>
                      <p className="text-xs text-muted-foreground">Esterno, solo provvigione (niente stipendio)</p>
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wiz-commission" className="font-medium text-sm">Provvigione %</Label>
                    <Input
                      id="wiz-commission"
                      type="number" min="0" max="100" step="0.5"
                      value={commissionPercentage}
                      onChange={(e) => setCommissionPercentage(e.target.value)}
                      placeholder="Es. 5"
                      className="max-w-[120px]"
                    />
                  </div>
                  {salespersonType === "assunto" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="wiz-salary-sp" className="font-medium text-sm">Stipendio lordo mensile (€)</Label>
                      <Input
                        id="wiz-salary-sp"
                        type="number" min="0" step="50"
                        value={grossSalary}
                        onChange={(e) => setGrossSalary(e.target.value)}
                        placeholder="Es. 1800"
                        className="max-w-[160px]"
                      />
                      <p className="text-xs text-muted-foreground">Verrà creata anche la scheda Dipendente collegata.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Stipendio per dipendenti (Operaio / Tecnico) */}
              {roleType === "employee" && (
                <div className="space-y-1.5 bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <HardHat className="h-4 w-4 text-amber-600" />
                    <Label htmlFor="wiz-salary" className="font-medium">Stipendio lordo mensile (€)</Label>
                  </div>
                  <Input
                    id="wiz-salary"
                    type="number" min="0" step="50"
                    value={grossSalary}
                    onChange={(e) => setGrossSalary(e.target.value)}
                    placeholder="Es. 1600"
                    className="max-w-[160px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Finisce nella scheda Dipendente (poi modificabile dal tab Dipendenti). Lascia vuoto se non lo gestisci qui.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Permissions (non-admin) or Confirm (admin) — stesso
              linguaggio della scheda utente (UserRolesPermissionsTab):
              livelli economici, blocchi visibilità, ricerca, descrizioni. */}
          {step === 3 && showPermissions && (
            <div className="space-y-3 py-2">
              {/* Visibilità dati economici — modello a 3 livelli condiviso */}
              <div className="rounded-lg border bg-gradient-to-br from-emerald-50/60 to-transparent dark:from-emerald-950/20 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Euro className="h-4 w-4 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">Visibilità dati economici</p>
                    <p className="text-xs text-muted-foreground">Cosa vede su commesse, lista, preventivi e PDF.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {ECONOMIC_LEVELS.map((lvl) => {
                    const active = economicLevel === lvl.id;
                    return (
                      <button
                        key={lvl.id}
                        type="button"
                        onClick={() => setPermissions((prev) => ({ ...prev, ...lvl.values }))}
                        className={`text-left rounded-lg border p-2.5 transition-all ${
                          active
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 ring-1 ring-emerald-500/40"
                            : "hover:bg-muted/50 border-border"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {active && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                          <span className="text-sm font-medium">{lvl.label}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{lvl.desc}</p>
                      </button>
                    );
                  })}
                </div>
                {economicLevel === "custom" && (
                  <p className="text-[11px] text-amber-600 flex items-center gap-1">
                    <Info className="h-3 w-3 shrink-0" /> Combinazione personalizzata — regola i singoli interruttori qui sotto.
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {([
                    { key: "can_view_order_amounts" as const, label: "Importi di vendita" },
                    { key: "can_view_costs" as const, label: "Costi" },
                    { key: "can_view_margins" as const, label: "Margini" },
                  ]).map((t) => (
                    <label key={t.key} className="flex items-center gap-2 rounded-md border bg-background/60 px-2.5 py-2 cursor-pointer">
                      <Switch checked={!!permissions[t.key]} onCheckedChange={(c) => handleToggle(t.key, c)} />
                      <span className="text-xs font-medium">{t.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Limita visibilità + visibilità sul team */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <Label htmlFor="wiz-only_assigned" className="font-medium flex items-center gap-2 text-sm cursor-pointer">
                      <EyeOff className="h-4 w-4" /> Limita visibilità ai dati assegnati
                    </Label>
                    <p className="text-xs text-muted-foreground">Se attivo, vedrà solo ordini, attività e appuntamenti assegnati a lui.</p>
                  </div>
                  <Switch
                    id="wiz-only_assigned"
                    checked={permissions.only_assigned}
                    onCheckedChange={checked => setPermissions(prev => ({ ...prev, only_assigned: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <Label htmlFor="wiz-team_tasks" className="font-medium flex items-center gap-2 text-sm cursor-pointer">
                      <Users2 className="h-4 w-4" /> Attività del team
                    </Label>
                    <p className="text-xs text-muted-foreground">Vede le attività (task) di tutto il team; spento vede solo le proprie.</p>
                  </div>
                  <Switch
                    id="wiz-team_tasks"
                    checked={permissions.can_view_team_tasks}
                    onCheckedChange={checked => setPermissions(prev => ({ ...prev, can_view_team_tasks: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <Label htmlFor="wiz-team_calendar" className="font-medium flex items-center gap-2 text-sm cursor-pointer">
                      <Users2 className="h-4 w-4" /> Calendario del team
                    </Label>
                    <p className="text-xs text-muted-foreground">Vede appuntamenti ed eventi di tutti nel calendario; spento vede solo i propri.</p>
                  </div>
                  <Switch
                    id="wiz-team_calendar"
                    checked={permissions.can_view_all_team_calendar}
                    onCheckedChange={checked => setPermissions(prev => ({ ...prev, can_view_all_team_calendar: checked }))}
                  />
                </div>
              </div>

              {/* Toolbar: ricerca + azioni rapide + contatore */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca modulo…"
                    value={permSearch}
                    onChange={(e) => setPermSearch(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={handleSelectAll}>
                  <Check className="h-3.5 w-3.5 mr-1" /> Tutti
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={handleDeselectAll}>
                  <X className="h-3.5 w-3.5 mr-1" /> Nessuno
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={handleResetPreset}>
                  Preset {ROLE_LABELS[roleType]}
                </Button>
                <Badge variant="outline" className="ml-auto tabular-nums">{totalActive} attivi</Badge>
              </div>

              {WIZARD_GROUPS.map((g) => {
                const sections = filterWizardSections(g.sections);
                if (sections.length === 0) return null;
                return (
                  <PermGroup key={g.label} label={g.label} icon={g.icon} iconColor={g.iconColor}
                    sections={sections} permissions={permissions} onToggle={handleToggle} />
                );
              })}
              {permSearch.trim() !== "" && WIZARD_GROUPS.every((g) => filterWizardSections(g.sections).length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-6">Nessun modulo corrisponde a "{permSearch}".</p>
              )}

              <Separator />

              <div className="space-y-3 py-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-blue-600" />
                  <Label className="font-medium">Aree visibili</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  L'utente vedrà solo i dipendenti delle aree selezionate nel calendario e nei dropdown.
                  Nessuna selezione = tutte le aree.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: "cantiere", label: "🏗️ Cantiere", desc: "Operai in cantiere" },
                    { value: "commerciale", label: "💼 Commerciale", desc: "Venditori e agenti" },
                    { value: "amministrazione", label: "🏢 Amministrazione", desc: "Staff ufficio" },
                    { value: "tecnico", label: "🔧 Tecnico", desc: "Personale tecnico" },
                  ] as const).map(area => {
                    const checked = (permissions.visible_areas || []).includes(area.value);
                    return (
                      <label
                        key={area.value}
                        className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          checked ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) => {
                            setPermissions(prev => {
                              const current = prev.visible_areas || [];
                              const next = c
                                ? [...current, area.value]
                                : current.filter(a => a !== area.value);
                              return { ...prev, visible_areas: next };
                            });
                          }}
                          className="mt-0.5"
                        />
                        <div>
                          <span className="text-sm font-medium">{area.label}</span>
                          <p className="text-xs text-muted-foreground">{area.desc}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
                {(permissions.visible_areas || []).length === 0 && (
                  <p className="text-xs text-blue-600 bg-blue-50 rounded p-2">
                    Nessuna area selezionata = accesso a tutte le aree
                  </p>
                )}
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
                {roleType === "salesperson" && commissionPercentage && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Provvigione</span>
                    <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                      {commissionPercentage}%
                    </Badge>
                  </div>
                )}
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
                  {password.trim()
                    ? "Password personalizzata impostata. Comunicala all'utente in modo sicuro."
                    : "Verrà generata una password temporanea. L'utente dovrà cambiarla al primo accesso."}
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

    {/* Conferma annullamento creazione */}
    <AlertDialog open={showConfirmClose} onOpenChange={setShowConfirmClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Annullare la creazione dell'utente?</AlertDialogTitle>
          <AlertDialogDescription>
            Hai inserito dei dati che non sono ancora stati salvati. Se esci ora, tutte le informazioni verranno perse.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continua creazione</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmDiscardAndClose}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Esci e annulla
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
