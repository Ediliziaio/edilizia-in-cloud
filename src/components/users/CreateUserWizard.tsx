import { useState, useMemo, useRef, useEffect } from "react";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Loader2, Copy, Check, ShieldCheck, User, TrendingUp, Phone,
  ChevronRight, ChevronLeft, ChevronDown, Building2, LayoutDashboard, Megaphone, CheckCircle2, Settings,
  Eye, EyeOff, HardHat, Euro, Search, Users2, X, Share2, SlidersHorizontal,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { StaffPermissions } from "@/components/users/PermissionsDialog";
import {
  DEFAULT_PERMISSIONS, CRUSCOTTO_SECTIONS, CANTIERI_SECTIONS, FINANZA_SECTIONS,
  PERSONE_SECTIONS, MARKETING_SECTIONS, AUTOMAZIONI_SECTIONS, IMPOSTAZIONI_SECTIONS,
  ALL_PERMISSION_SECTIONS, ROLE_PRESETS, syncLegacyMarketingFlags, syncLegacySettingsFlags,
  ECONOMIC_LEVELS, detectEconomicLevel, isBlockedBySolaLettura, SOLA_LETTURA_BLOCKED_NOTE,
  type PermissionSectionDef, type StaffRoleType, type BooleanPermissionKey,
} from "@/components/users/permissionsDefaults";
import { SolaLetturaToggle } from "@/components/users/SolaLetturaToggle";
import { cn } from "@/lib/utils";

export type { StaffRoleType };

export interface WizardUserFormData {
  first_name: string;
  last_name: string;
  email: string;
  password?: string;
  role_type: StaffRoleType;
  permissions?: StaffPermissions;
  commission_percentage?: number;
  /** Stipendio lordo mensile (€) — OPZIONALE. Per Operaio/Tecnico o per chi ha il flag "è anche dipendente". */
  gross_salary?: number;
  /** Flag "è anche un dipendente in organico" (per Operatore/Amministratore/Venditore).
   *  Se true si crea anche la scheda Dipendente collegata. Per il Venditore, true = assunto, false = P.IVA a provvigione. */
  also_employee?: boolean;
}

interface CreateUserWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: WizardUserFormData) => Promise<{ temporaryPassword?: string }>;
  isLoading?: boolean;
}

/*
 * Nuovo utente (ridisegnato il 25/09/2026, richiesta «migliorala notevolmente»).
 *
 * Prima: quattro passi (tipo → dati → una pagina di permessi con sette gruppi
 * aperti, livelli economici, aree → riepilogo) e sei riquadri da 160px per il
 * ruolo. La maggior parte degli utenti si crea col preset del ruolo, e il
 * riepilogo ripeteva quello appena scritto.
 *
 * Ora: 1) chi è — nome, email e ruolo su una schermata, con il riassunto dei
 * permessi del ruolo e «Crea utente» subito; 2) permessi, FACOLTATIVO («Personalizza»):
 * prima le tre scelte che contano (importi, solo i suoi dati, sola lettura),
 * poi i moduli in gruppi chiusi con la ricerca, poi le avanzate; 3) fatto — le
 * credenziali, da condividere o copiare in un colpo.
 */

const ROLE_OPTIONS: { value: StaffRoleType; label: string; description: string; icon: React.ElementType; preview?: string[] }[] = [
  { value: "company_admin", label: "Amministratore", description: "Accesso completo a tutto", icon: ShieldCheck, preview: [] },
  { value: "company_staff", label: "Operatore", description: "Gestione interna commesse", icon: User, preview: ["Ordini & Commesse", "Magazzino", "Calendario", "Clienti", "Fatturazione"] },
  { value: "salesperson", label: "Venditore", description: "Vendite e opportunità", icon: TrendingUp, preview: ["CRM Contatti", "Opportunità", "Preventivi CRM", "Calendar CRM", "Sales OS"] },
  { value: "call_center", label: "Call Center", description: "Contatti e assistenza", icon: Phone, preview: ["CRM Contatti", "Opportunità (sposta le fasi)", "Calendario CRM", "Appuntamenti"] },
  { value: "employee", label: "Operaio / Tecnico", description: "Solo app di cantiere", icon: HardHat, preview: ["Calendario (propri turni)", "Giornale Lavori"] },
  { value: "subcontractor", label: "Subappaltatore", description: "Solo commesse assegnate", icon: Building2, preview: ["Ordini assegnati", "Calendario", "Clienti (propri)"] },
];

/** Una riga sotto l'elenco dei ruoli, solo dove cambia qualcosa di importante. */
const NOTA_RUOLO: Partial<Record<StaffRoleType, string>> = {
  company_admin: "Vede e modifica tutto: non ci sono permessi da scegliere.",
  employee: "Entra solo dall'app di cantiere (lavori.ediliziaincloud.com), non dal gestionale.",
  subcontractor: "Vede solo le commesse assegnate a lui, nessun dato economico dell'azienda.",
};

/** Gli importi in parole, per il riassunto del primo passo (anche quando il
 *  preset non coincide con un livello: «personalizzati» non diceva niente). */
function descriviImporti(p: StaffPermissions): string {
  const visti = [
    p.can_view_order_amounts && "vendite",
    p.can_view_costs && "costi",
    p.can_view_margins && "margini",
  ].filter(Boolean) as string[];
  if (visti.length === 0) return "nessuno";
  if (visti.length === 1) return visti[0];
  return `${visti.slice(0, -1).join(", ")} e ${visti[visti.length - 1]}`;
}

const ROLES_WITH_PERMISSIONS: StaffRoleType[] = ["company_staff", "salesperson", "call_center", "employee", "subcontractor"];
const ROLES_WITH_EMPLOYEE_FLAG: StaffRoleType[] = ["company_staff", "company_admin", "salesperson"];

const ROLE_LABELS: Record<StaffRoleType, string> = {
  company_admin: "Amministratore", company_staff: "Operatore",
  salesperson: "Venditore", call_center: "Call Center",
  employee: "Operaio / Tecnico",
  subcontractor: "Subappaltatore",
};

const EMAIL_VALIDA = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- Gruppo di permessi (chiuso: si apre a richiesta o con la ricerca) ---
function PermGroup({ label, icon: Icon, iconColor, sections, permissions, onToggle, forzaAperto }: {
  label: string; icon: React.ElementType; iconColor: string;
  sections: PermissionSectionDef[]; permissions: StaffPermissions;
  onToggle: (key: BooleanPermissionKey, value: boolean) => void;
  /** Aperto d'ufficio mentre si cerca: si vedono subito i moduli trovati. */
  forzaAperto?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const aperto = !!forzaAperto || open;
  const activeCount = sections.reduce((c, s) => {
    let n = permissions[s.viewKey] ? 1 : 0;
    if (s.editKey && permissions[s.editKey]) n++;
    return c + n;
  }, 0);
  const totalCount = sections.reduce((c, s) => c + 1 + (s.editKey ? 1 : 0), 0);
  const allActive = activeCount === totalCount;
  const bloccato = (key: BooleanPermissionKey) => !!permissions.sola_lettura && isBlockedBySolaLettura(key);

  const handleToggleAll = (checked: boolean) => {
    sections.forEach(s => {
      if (!(checked && bloccato(s.viewKey))) onToggle(s.viewKey, checked);
      if (s.editKey && !(checked && bloccato(s.editKey))) onToggle(s.editKey, checked);
    });
  };

  return (
    <Collapsible open={aperto} onOpenChange={setOpen}>
      {/* Lo switch "attiva tutto" NON può stare dentro il bottone che apre il
          gruppo: un <button> dentro un <button> è HTML non valido. La riga è
          un contenitore, e i due comandi (apri/chiudi e attiva-tutto) sono fratelli. */}
      <div className="flex w-full items-center justify-between rounded-lg bg-muted/50 px-3 py-2 transition-colors hover:bg-muted">
        <CollapsibleTrigger asChild>
          <button type="button" className="tap-compact flex min-w-0 flex-1 items-center gap-2 text-left">
            <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
            <span className="truncate text-sm font-medium">{label}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{activeCount}/{totalCount}</span>
          </button>
        </CollapsibleTrigger>
        <div className="flex items-center gap-2 pl-2">
          <Switch checked={allActive} onCheckedChange={handleToggleAll} aria-label={`Attiva tutti i permessi di ${label}`} />
          <CollapsibleTrigger asChild>
            <button type="button" aria-label={aperto ? `Comprimi ${label}` : `Espandi ${label}`} className="tap-compact text-muted-foreground">
              {aperto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          </CollapsibleTrigger>
        </div>
      </div>
      <CollapsibleContent className="space-y-0.5 px-1 pb-1 pt-1.5">
        {sections.map(section => (
          <div key={section.viewKey} className="flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/40">
            <div className="flex min-w-0 items-start gap-2.5">
              <Switch
                id={`wiz-${section.viewKey}`}
                className="mt-0.5"
                checked={permissions[section.viewKey]}
                disabled={bloccato(section.viewKey)}
                onCheckedChange={(checked) => onToggle(section.viewKey, checked)}
              />
              <div className="min-w-0">
                <Label htmlFor={`wiz-${section.viewKey}`} className="cursor-pointer text-sm leading-tight">{section.label}</Label>
                {/* Mobile: basta il nome del modulo. */}
                {section.description && (
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground max-sm:hidden">{section.description}</p>
                )}
                {(bloccato(section.viewKey) || (section.editKey && bloccato(section.editKey))) && (
                  <p className="mt-0.5 text-[11px] text-amber-600">{SOLA_LETTURA_BLOCKED_NOTE}</p>
                )}
              </div>
            </div>
            {section.editKey && permissions[section.viewKey] && (
              <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                <Switch
                  id={`wiz-${section.editKey}`}
                  checked={permissions[section.editKey]}
                  disabled={bloccato(section.editKey)}
                  onCheckedChange={(checked) => onToggle(section.editKey!, checked)}
                />
                <Label htmlFor={`wiz-${section.editKey}`} className="cursor-pointer text-xs text-muted-foreground">Modifica</Label>
              </div>
            )}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

// Gruppi dei permessi (stesse macro-aree della sidebar). Le 3 chiavi
// economiche sono escluse dai gruppi: le governa il selettore «Importi».
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
  // Passi: 1 = chi è (e si può già creare), 2 = permessi (facoltativo), 3 = fatto.
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [roleType, setRoleType] = useState<StaffRoleType>("company_staff");
  // Parte col preset del ruolo già selezionato: prima «Operatore» risultava
  // scelto ma, senza un click sulla card, l'utente nasceva coi soli default.
  const [permissions, setPermissions] = useState<StaffPermissions>({ ...DEFAULT_PERMISSIONS, ...ROLE_PRESETS.company_staff });
  const [permSearch, setPermSearch] = useState("");
  const [avanzateAperte, setAvanzateAperte] = useState(false);
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
  const [scegliPassword, setScegliPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [commissionPercentage, setCommissionPercentage] = useState<string>("");
  const [alsoEmployee, setAlsoEmployee] = useState<boolean>(false);
  const [grossSalary, setGrossSalary] = useState<string>("");
  // Ogni passo parte dall'alto: prima «Personalizza» apriva i permessi già
  // scorsi in fondo, con lo scorrimento rimasto dal passo precedente.
  const corpoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    corpoRef.current?.scrollTo?.({ top: 0 });
  }, [step]);

  const showPermissions = ROLES_WITH_PERMISSIONS.includes(roleType);
  const isSuccessStep = step === 3;
  const conFlagDipendente = ROLES_WITH_EMPLOYEE_FLAG.includes(roleType);
  const stipendioRilevante = roleType === "employee" || (conFlagDipendente && alsoEmployee);

  // Permessi diversi dal preset del ruolo? Il riassunto lo dice.
  const permessiPersonalizzati = useMemo(() => {
    if (!showPermissions) return false;
    const preset = { ...DEFAULT_PERMISSIONS, ...ROLE_PRESETS[roleType] } as Record<string, unknown>;
    const attuali = permissions as unknown as Record<string, unknown>;
    return Object.keys(preset).some((k) => JSON.stringify(attuali[k]) !== JSON.stringify(preset[k]));
  }, [permissions, roleType, showPermissions]);

  const resetForm = () => {
    setStep(1); setFirstName(""); setLastName(""); setEmail("");
    setRoleType("company_staff");
    setPermissions({ ...DEFAULT_PERMISSIONS, ...ROLE_PRESETS.company_staff });
    setPermSearch(""); setAvanzateAperte(false);
    setTemporaryPassword(null); setCopied(false);
    setPassword(""); setScegliPassword(false); setShowPassword(false);
    setShowConfirmClose(false); setCommissionPercentage(""); setAlsoEmployee(false); setGrossSalary("");
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
      allTrue[s.viewKey] = true;
      if (s.editKey) allTrue[s.editKey] = true;
    });
    // syncLegacyMarketingFlags rispegne ciò che la sola lettura blocca.
    setPermissions(prev => syncLegacyMarketingFlags({ ...prev, ...allTrue, can_view_marketing: true }));
  };

  const handleDeselectAll = () => {
    setPermissions(prev => ({ ...DEFAULT_PERMISSIONS, only_assigned: prev.only_assigned, sola_lettura: prev.sola_lettura }));
  };

  const handleResetPreset = () => {
    setPermissions(prev => ({ ...DEFAULT_PERMISSIONS, only_assigned: prev.only_assigned, sola_lettura: prev.sola_lettura, ...ROLE_PRESETS[roleType] }));
  };

  /** Nome, cognome ed email: servono sia per creare sia per passare ai permessi. */
  const datiValidi = (): boolean => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      toast({ title: "Campi obbligatori", description: "Compila nome, cognome e email.", variant: "destructive" });
      return false;
    }
    if (!EMAIL_VALIDA.test(email.trim())) {
      toast({ title: "Email non valida", description: "Inserisci un indirizzo email valido.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const vaiAiPermessi = () => {
    if (datiValidi()) setStep(2);
  };

  const handleSubmit = async () => {
    if (!datiValidi()) {
      setStep(1);
      return;
    }
    try {
      const finalPerms = showPermissions ? syncLegacySettingsFlags(syncLegacyMarketingFlags(permissions)) : undefined;
      const commission = roleType === "salesperson" && commissionPercentage
        ? parseFloat(commissionPercentage)
        : undefined;
      // "È anche un dipendente": per Operatore/Amministratore/Venditore col flag ON;
      // l'Operaio/Tecnico è sempre un dipendente. Lo stipendio è OPZIONALE.
      const alsoEmp = conFlagDipendente ? alsoEmployee : false;
      const grossSalaryNum = stipendioRilevante && grossSalary.trim()
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
        also_employee: alsoEmp,
      });
      if (result.temporaryPassword) {
        setTemporaryPassword(result.temporaryPassword);
        setStep(3);
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

  // Le credenziali in un messaggio pronto da mandare: dal telefono si apre il
  // foglio di condivisione (WhatsApp, SMS, email), dal computer si copiano.
  const indirizzoAccesso = roleType === "employee" || roleType === "subcontractor"
    ? "https://lavori.ediliziaincloud.com"
    : "https://app.ediliziaincloud.com";
  const testoAccesso = [
    `Ciao ${firstName.trim()}, ecco il tuo accesso a EdiliziaInCloud:`,
    indirizzoAccesso,
    `Email: ${email.trim().toLowerCase()}`,
    `Password: ${temporaryPassword ?? ""}`,
    "Al primo accesso ti verrà chiesto di cambiarla.",
  ].join("\n");
  const puoCondividere = typeof navigator !== "undefined" && typeof (navigator as Navigator & { share?: unknown }).share === "function";

  const condividiAccesso = async () => {
    if (puoCondividere) {
      try {
        await navigator.share({ title: "Accesso EdiliziaInCloud", text: testoAccesso });
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(testoAccesso);
      toast({ title: "Accesso copiato", description: "Incollalo in WhatsApp o in una email." });
    } catch {
      toast({ title: "Copia non riuscita", description: "Seleziona e copia la password a mano.", variant: "destructive" });
    }
  };

  const totalActive = useMemo(() => {
    const excluded = new Set(["only_assigned", "sola_lettura", "can_view_marketing", "can_edit_marketing"]);
    return Object.entries(permissions).filter(([k, v]) => v === true && !excluded.has(k)).length;
  }, [permissions]);

  const currentRoleOption = ROLE_OPTIONS.find(r => r.value === roleType);
  const livelloAttivo = ECONOMIC_LEVELS.find((l) => l.id === economicLevel);

  return (
    <>
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) requestClose(); }}>
      <DialogContent
        className={cn(
          step === 2 ? "sm:max-w-[720px]" : "sm:max-w-[560px]",
          "max-h-[85vh] !flex !flex-col overflow-hidden transition-[max-width] duration-200",
        )}
        onPointerDownOutside={(e) => { if (isDirty) { e.preventDefault(); setShowConfirmClose(true); } }}
        onEscapeKeyDown={(e) => { if (isDirty) { e.preventDefault(); setShowConfirmClose(true); } }}
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            {isSuccessStep ? "Utente creato" : step === 2 ? `Permessi · ${ROLE_LABELS[roleType]}` : "Nuovo utente"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isSuccessStep ? "Credenziali del nuovo utente" : step === 2 ? "Permessi del nuovo utente" : "Nome, email e ruolo del nuovo utente"}
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable body */}
        <div ref={corpoRef} className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {/* ── PASSO 1: chi è ── */}
          {step === 1 && (
            <div className="space-y-4 py-1 max-sm:space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="nu-nome">Nome</Label>
                  <Input id="nu-nome" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Mario" autoComplete="off" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nu-cognome">Cognome</Label>
                  <Input id="nu-cognome" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Rossi" autoComplete="off" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nu-email">Email</Label>
                <Input
                  id="nu-email"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoComplete="off"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="mario.rossi@azienda.it"
                />
              </div>

              <div className="space-y-1.5">
                <Label id="nu-ruolo">Ruolo</Label>
                <div role="radiogroup" aria-labelledby="nu-ruolo" className="grid gap-1.5 sm:grid-cols-2">
                  {ROLE_OPTIONS.map(opt => {
                    const Icon = opt.icon;
                    const isSelected = roleType === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => applyRolePreset(opt.value)}
                        className={cn(
                          "tap-compact flex min-h-[48px] items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
                          isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50",
                        )}
                      >
                        <Icon className={cn("h-4 w-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium leading-tight">{opt.label}</span>
                          <span className="block truncate text-[11px] leading-tight text-muted-foreground">{opt.description}</span>
                        </span>
                        {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                      </button>
                    );
                  })}
                </div>
                {NOTA_RUOLO[roleType] && (
                  <p className="text-[11px] leading-snug text-muted-foreground">{NOTA_RUOLO[roleType]}</p>
                )}
              </div>

              {/* Venditore: provvigione accanto al flag «assunto». */}
              {roleType === "salesperson" && (
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-commission">Provvigione %</Label>
                  <Input
                    id="wiz-commission"
                    type="number" min="0" max="100" step="0.5" inputMode="decimal"
                    value={commissionPercentage}
                    onChange={(e) => setCommissionPercentage(e.target.value)}
                    placeholder="Es. 5"
                    className="max-w-[120px]"
                  />
                </div>
              )}

              {/* «È anche un dipendente»: crea anche la scheda in Personale. */}
              {conFlagDipendente && (
                <label htmlFor="nu-dipendente" className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{roleType === "salesperson" ? "Assunto" : "È anche un dipendente"}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {roleType === "salesperson" ? "Spento se lavora in P.IVA a provvigione." : "Crea anche la sua scheda in Personale."}
                    </span>
                  </span>
                  <Switch id="nu-dipendente" checked={alsoEmployee} onCheckedChange={setAlsoEmployee} />
                </label>
              )}

              {stipendioRilevante && (
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-salary">
                    Stipendio lordo mensile (€) <span className="font-normal text-muted-foreground">· facoltativo</span>
                  </Label>
                  <Input
                    id="wiz-salary"
                    type="number" min="0" step="50" inputMode="decimal"
                    value={grossSalary}
                    onChange={(e) => setGrossSalary(e.target.value)}
                    placeholder={roleType === "employee" ? "Es. 1600" : "Es. 1800"}
                    className="max-w-[160px]"
                  />
                </div>
              )}

              {/* Password: generata di default, sceglierla è un'eccezione. */}
              {scegliPassword ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="nu-password">Password</Label>
                    <button
                      type="button"
                      className="tap-compact text-xs text-muted-foreground hover:text-foreground hover:underline"
                      onClick={() => { setScegliPassword(false); setPassword(""); }}
                    >
                      Generala in automatico
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="nu-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Scegli una password"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => !p)}
                      aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                      className="tap-compact absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  La password la generiamo noi e te la mostriamo alla fine.{" "}
                  <button type="button" className="tap-compact font-medium text-primary hover:underline" onClick={() => setScegliPassword(true)}>
                    Scegli tu
                  </button>
                </p>
              )}

              {/* Cosa potrà fare: il riassunto dei permessi, con «Personalizza». */}
              {showPermissions && (
                <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {permessiPersonalizzati ? "Permessi personalizzati" : `Permessi da ${ROLE_LABELS[roleType]}`}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-snug">
                      {permessiPersonalizzati
                        ? `${totalActive} permessi attivi`
                        : (currentRoleOption?.preview ?? []).join(" · ")}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Importi: {descriviImporti(permissions)}
                      {permissions.only_assigned ? " · solo i suoi dati" : ""}
                      {permissions.sola_lettura ? " · sola lettura" : ""}
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="tap-compact h-8 shrink-0 gap-1.5" onClick={vaiAiPermessi}>
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Personalizza
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── PASSO 2: permessi (facoltativo) ── */}
          {step === 2 && showPermissions && (
            <div className="space-y-4 py-1 max-sm:space-y-3">
              {/* Le tre scelte che contano, in cima. */}
              <section className="space-y-1.5">
                <p className="text-sm font-semibold">Importi</p>
                <div role="radiogroup" aria-label="Importi" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                  {ECONOMIC_LEVELS.map((lvl) => {
                    const active = economicLevel === lvl.id;
                    return (
                      <button
                        key={lvl.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setPermissions((prev) => ({ ...prev, ...lvl.values }))}
                        className={cn(
                          "tap-compact rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
                          active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {lvl.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {livelloAttivo ? livelloAttivo.desc : "Combinazione personalizzata: la regoli in «Avanzate»."}
                </p>
              </section>

              <label htmlFor="wiz-only_assigned" className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Solo i dati assegnati a lui</span>
                  <span className="block text-[11px] text-muted-foreground">Commesse, attività e appuntamenti suoi, non quelli degli altri.</span>
                </span>
                <Switch
                  id="wiz-only_assigned"
                  checked={permissions.only_assigned}
                  onCheckedChange={checked => setPermissions(prev => ({ ...prev, only_assigned: checked }))}
                />
              </label>

              <SolaLetturaToggle
                id="wiz-sola_lettura"
                checked={permissions.sola_lettura || false}
                onCheckedChange={checked => setPermissions(prev => syncLegacyMarketingFlags({ ...prev, sola_lettura: checked }))}
              />

              {/* Cosa vede: moduli in gruppi chiusi, la ricerca li apre. */}
              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Cosa vede</p>
                  <span className="text-xs tabular-nums text-muted-foreground">{totalActive} attivi</span>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Cerca modulo…"
                    value={permSearch}
                    onChange={(e) => setPermSearch(e.target.value)}
                    className="h-9 pl-8"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" variant="outline" size="sm" className="tap-compact h-7 gap-1 px-2 text-xs" onClick={handleSelectAll}>
                    <Check className="h-3.5 w-3.5" /> Tutti
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="tap-compact h-7 gap-1 px-2 text-xs" onClick={handleDeselectAll}>
                    <X className="h-3.5 w-3.5" /> Nessuno
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="tap-compact h-7 px-2 text-xs" onClick={handleResetPreset}>
                    Come {ROLE_LABELS[roleType]}
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {WIZARD_GROUPS.map((g) => {
                    const sections = filterWizardSections(g.sections);
                    if (sections.length === 0) return null;
                    return (
                      <PermGroup key={g.label} label={g.label} icon={g.icon} iconColor={g.iconColor}
                        sections={sections} permissions={permissions} onToggle={handleToggle}
                        forzaAperto={permSearch.trim() !== ""} />
                    );
                  })}
                </div>
                {permSearch.trim() !== "" && WIZARD_GROUPS.every((g) => filterWizardSections(g.sections).length === 0) && (
                  <p className="py-4 text-center text-sm text-muted-foreground">Nessun modulo corrisponde a "{permSearch}".</p>
                )}
              </section>

              {/* Avanzate: dettaglio importi, visibilità sul team, aree. */}
              <Collapsible open={avanzateAperte} onOpenChange={setAvanzateAperte}>
                <CollapsibleTrigger asChild>
                  <button type="button" className="tap-compact flex w-full items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm font-medium">
                    Avanzate
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", avanzateAperte && "rotate-180")} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-2">
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                    {([
                      { key: "can_view_order_amounts" as const, label: "Importi di vendita" },
                      { key: "can_view_costs" as const, label: "Costi" },
                      { key: "can_view_margins" as const, label: "Margini" },
                    ]).map((t) => (
                      <label key={t.key} className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2">
                        <Switch checked={!!permissions[t.key]} onCheckedChange={(c) => handleToggle(t.key, c)} />
                        <span className="text-xs font-medium">{t.label}</span>
                      </label>
                    ))}
                  </div>
                  <label htmlFor="wiz-team_tasks" className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">Attività del team</span>
                      <span className="block text-[11px] text-muted-foreground">Spento vede solo le sue.</span>
                    </span>
                    <Switch
                      id="wiz-team_tasks"
                      checked={permissions.can_view_team_tasks}
                      onCheckedChange={checked => setPermissions(prev => ({ ...prev, can_view_team_tasks: checked }))}
                    />
                  </label>
                  <label htmlFor="wiz-team_calendar" className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">Calendario del team</span>
                      <span className="block text-[11px] text-muted-foreground">Spento vede solo i suoi appuntamenti.</span>
                    </span>
                    <Switch
                      id="wiz-team_calendar"
                      checked={permissions.can_view_all_team_calendar}
                      onCheckedChange={checked => setPermissions(prev => ({ ...prev, can_view_all_team_calendar: checked }))}
                    />
                  </label>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium">
                      Aree visibili <span className="font-normal text-muted-foreground">· nessuna scelta = tutte</span>
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {([
                        { value: "cantiere", label: "Cantiere" },
                        { value: "commerciale", label: "Commerciale" },
                        { value: "amministrazione", label: "Amministrazione" },
                        { value: "tecnico", label: "Tecnico" },
                      ] as const).map(area => {
                        const checked = (permissions.visible_areas || []).includes(area.value);
                        return (
                          <label
                            key={area.value}
                            className={cn(
                              "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors",
                              checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                            )}
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
                            />
                            {area.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

          {/* ── FATTO: credenziali ── */}
          {isSuccessStep && (
            <div className="space-y-3 py-1">
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                {firstName.trim()} {lastName.trim()} può entrare.
              </p>
              {temporaryPassword && (
                <div className="divide-y rounded-lg border bg-muted/30 text-sm">
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-muted-foreground">Email</span>
                    <span className="truncate font-mono text-xs">{email.trim().toLowerCase()}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-muted-foreground">Password</span>
                    <span className="flex items-center gap-1">
                      <code className="rounded border bg-background px-2 py-0.5 font-mono text-xs">{temporaryPassword}</code>
                      <Button variant="ghost" size="icon" className="tap-compact h-7 w-7" onClick={copyPassword} aria-label="Copia la password">
                        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </span>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-amber-700">La password si vede solo ora: mandala adesso a {firstName.trim() || "chi la usa"}.</p>
            </div>
          )}
        </div>

        {/* Fixed footer */}
        <DialogFooter className="flex-shrink-0 gap-2 sm:gap-2">
          {isSuccessStep ? (
            <>
              <Button variant="outline" onClick={handleClose}>Chiudi</Button>
              <Button onClick={() => { void condividiAccesso(); }} className="gap-1.5">
                {puoCondividere ? <Share2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {puoCondividere ? "Condividi accesso" : "Copia accesso"}
              </Button>
            </>
          ) : (
            <>
              {step === 2 && (
                <Button variant="outline" onClick={() => setStep(1)} disabled={isLoading}>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Indietro
                </Button>
              )}
              <Button onClick={() => { void handleSubmit(); }} disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crea utente
              </Button>
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
