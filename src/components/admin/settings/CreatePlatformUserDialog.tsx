import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Loader2, Check, Search, Building, Building2, LayoutDashboard, Megaphone,
  ChevronDown, ChevronRight, ChevronLeft, Copy, CheckCircle2, AlertTriangle,
  ShieldCheck, User, TrendingUp, Phone,
} from "lucide-react";
import { toast } from "sonner";
import { PLATFORM_ROLES, PLATFORM_ROLE_LABELS, PLATFORM_ROLE_DESCRIPTIONS, PLATFORM_ROLE_COLORS, type PlatformRole } from "@/types/auth";
import { cn } from "@/lib/utils";
import type { StaffPermissions } from "@/components/users/PermissionsDialog";
import {
  DEFAULT_PERMISSIONS, STANDALONE_SECTIONS, INTERNAL_SECTIONS, MARKETING_SECTIONS,
  ALL_PERMISSION_SECTIONS, ROLE_PRESETS, syncLegacyMarketingFlags,
  type PermissionSectionDef, type StaffRoleType,
} from "@/components/users/permissionsDefaults";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CompanyAccess {
  companyId: string;
  companyName: string;
  role: string; // "company_admin" | "company_staff" | "salesperson" | "call_center"
}

const COMPANY_ROLE_OPTIONS: { value: string; label: string; icon: React.ElementType }[] = [
  { value: "company_admin", label: "Amministratore", icon: ShieldCheck },
  { value: "company_staff", label: "Operatore", icon: User },
  { value: "salesperson", label: "Venditore", icon: TrendingUp },
  { value: "call_center", label: "Call Center", icon: Phone },
];

const ROLES_WITH_PERMISSIONS = ["company_staff", "salesperson", "call_center"];

const COMPANY_ROLE_LABELS: Record<string, string> = {
  company_admin: "Admin",
  company_staff: "Operatore",
  salesperson: "Venditore",
  call_center: "Call Center",
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
                id={`plat-${section.viewKey}`}
                checked={permissions[section.viewKey]}
                onCheckedChange={(checked) => onToggle(section.viewKey, checked)}
              />
              <Label htmlFor={`plat-${section.viewKey}`} className="text-sm cursor-pointer">{section.label}</Label>
            </div>
            {section.editKey && permissions[section.viewKey] && (
              <div className="flex items-center gap-1.5">
                <Switch
                  id={`plat-${section.editKey}`}
                  checked={permissions[section.editKey]}
                  onCheckedChange={(checked) => onToggle(section.editKey!, checked)}
                />
                <Label htmlFor={`plat-${section.editKey}`} className="text-xs text-muted-foreground cursor-pointer">Modifica</Label>
              </div>
            )}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function CreatePlatformUserDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [selectedRole, setSelectedRole] = useState<PlatformRole | null>(null);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  // Step 2: Company selection
  const [selectedCompanies, setSelectedCompanies] = useState<CompanyAccess[]>([]);
  const [companySearch, setCompanySearch] = useState("");

  // Step 3: Granular permissions for non-admin companies
  const [permissions, setPermissions] = useState<StaffPermissions>({ ...DEFAULT_PERMISSIONS });

  // Success state
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isSuccessStep = step === 99;

  const resetForm = () => {
    setStep(0);
    setSelectedRole(null);
    setEmail("");
    setFirstName("");
    setLastName("");
    setSelectedCompanies([]);
    setCompanySearch("");
    setPermissions({ ...DEFAULT_PERMISSIONS });
    setTemporaryPassword(null);
    setCopied(false);
  };

  // Fetch companies for step 2
  const { data: companies = [] } = useQuery({
    queryKey: ["admin-companies-for-platform-user", companySearch],
    queryFn: async () => {
      let query = supabase
        .from("companies")
        .select("id, name, logo_url")
        .eq("is_platform_admin_company", false)
        .order("name")
        .limit(50);
      if (companySearch) {
        query = query.ilike("name", `%${companySearch}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: open && step === 2,
  });

  const hasNonAdminCompanies = selectedCompanies.some(c => ROLES_WITH_PERMISSIONS.includes(c.role));

  // Determine first non-admin role for preset
  const firstNonAdminRole = useMemo(() => {
    const found = selectedCompanies.find(c => ROLES_WITH_PERMISSIONS.includes(c.role));
    return found?.role as StaffRoleType | undefined;
  }, [selectedCompanies]);

  // Determine total steps: skip permissions step if no non-admin companies
  const totalSteps = hasNonAdminCompanies ? 5 : 4;
  const getStepLabel = (s: number) => {
    const labels = ["Ruolo Piattaforma", "Dati Personali", "Aziende", ...(hasNonAdminCompanies ? ["Permessi"] : []), "Conferma"];
    return labels[s] || "";
  };
  const confirmStep = hasNonAdminCompanies ? 4 : 3;

  const toggleCompany = (companyId: string, companyName: string) => {
    setSelectedCompanies(prev => {
      const exists = prev.find(c => c.companyId === companyId);
      if (exists) return prev.filter(c => c.companyId !== companyId);
      return [...prev, { companyId, companyName, role: "company_staff" }];
    });
  };

  const updateCompanyRole = (companyId: string, role: string) => {
    setSelectedCompanies(prev =>
      prev.map(c => c.companyId === companyId ? { ...c, role } : c)
    );
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
    if (firstNonAdminRole) {
      setPermissions(prev => ({
        ...DEFAULT_PERMISSIONS,
        only_assigned: prev.only_assigned,
        ...ROLE_PRESETS[firstNonAdminRole],
      }));
    }
  };

  const totalActive = useMemo(() => {
    const excluded = new Set(["only_assigned", "can_view_marketing", "can_edit_marketing"]);
    return Object.entries(permissions).filter(([k, v]) => v === true && !excluded.has(k)).length;
  }, [permissions]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const finalPerms = hasNonAdminCompanies ? syncLegacyMarketingFlags(permissions) : undefined;
      const res = await supabase.functions.invoke("manage-platform-users", {
        body: {
          action: "create",
          email,
          firstName,
          lastName,
          platformRole: selectedRole,
          companyAccesses: selectedCompanies.map(c => ({ companyId: c.companyId, role: c.role })),
          companyPermissions: finalPerms,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) {
        const body = await res.error.context?.json?.();
        throw new Error(body?.error || res.error.message);
      }
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.superAdmins });
      if (data?.temporaryPassword) {
        setTemporaryPassword(data.temporaryPassword);
        setStep(99); // success step
      } else {
        onOpenChange(false);
        resetForm();
        toast.success("Membro del team creato con successo");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canProceedStep0 = !!selectedRole;
  const canProceedStep1 = email.trim() !== "" && firstName.trim() !== "" && lastName.trim() !== "";

  const handleNext = () => {
    if (step === 1) {
      if (!firstName.trim() || !lastName.trim() || !email.trim()) return;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        toast.error("Inserisci un indirizzo email valido");
        return;
      }
    }
    if (step === 2 && !hasNonAdminCompanies) {
      setStep(confirmStep);
    } else if (step === 2 && hasNonAdminCompanies) {
      // Apply preset for first non-admin role when entering permissions step
      if (firstNonAdminRole) {
        setPermissions(prev => ({ ...DEFAULT_PERMISSIONS, only_assigned: prev.only_assigned, ...ROLE_PRESETS[firstNonAdminRole] }));
      }
      setStep(3);
    } else {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step === confirmStep && !hasNonAdminCompanies) {
      setStep(2);
    } else {
      setStep(step - 1);
    }
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const copyPassword = async () => {
    if (temporaryPassword) {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const nonAdminCompanyNames = selectedCompanies.filter(c => ROLES_WITH_PERMISSIONS.includes(c.role)).map(c => c.companyName);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] !flex !flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            {isSuccessStep ? "Membro Creato" : "Nuovo Membro del Team"}
          </DialogTitle>
          {!isSuccessStep && (
            <DialogDescription>{getStepLabel(step)}</DialogDescription>
          )}
        </DialogHeader>

        {/* Progress bar */}
        {!isSuccessStep && (
          <div className="flex gap-1.5 px-1 flex-shrink-0">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-2">
          {/* STEP 0: Platform Role */}
          {step === 0 && (
            <div className="grid gap-3">
              {PLATFORM_ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setSelectedRole(role)}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-lg border-2 text-left transition-all",
                    selectedRole === role
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/30"
                  )}
                >
                  <div className={cn("w-3 h-3 rounded-full shrink-0", PLATFORM_ROLE_COLORS[role].split(" ")[0])} />
                  <div className="flex-1">
                    <div className="font-medium">{PLATFORM_ROLE_LABELS[role]}</div>
                    <div className="text-sm text-muted-foreground">{PLATFORM_ROLE_DESCRIPTIONS[role]}</div>
                  </div>
                  {selectedRole === role && <Check className="h-5 w-5 text-primary" />}
                </button>
              ))}
            </div>
          )}

          {/* STEP 1: Personal Data (no password) */}
          {step === 1 && (
            <div className="space-y-4 py-2">
              {selectedRole && (
                <Badge className={PLATFORM_ROLE_COLORS[selectedRole]}>
                  {PLATFORM_ROLE_LABELS[selectedRole]}
                </Badge>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Mario" />
                </div>
                <div className="space-y-2">
                  <Label>Cognome *</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Rossi" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mario@esempio.it" />
                <p className="text-xs text-muted-foreground">
                  Verrà usata per il login. La password temporanea sarà generata automaticamente.
                </p>
              </div>
            </div>
          )}

          {/* STEP 2: Company Selection + Role */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Seleziona le aziende a cui questo utente avrà accesso e scegli il ruolo per ciascuna.
              </p>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Cerca azienda..."
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <ScrollArea className="h-[280px] border rounded-md">
                <div className="p-2 space-y-1">
                  {companies.map((company) => {
                    const isSelected = selectedCompanies.some(c => c.companyId === company.id);
                    const selectedEntry = selectedCompanies.find(c => c.companyId === company.id);
                    return (
                      <div key={company.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted transition-colors">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleCompany(company.id, company.name)}
                        />
                        <Building className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="flex-1 text-sm truncate">{company.name}</span>
                        {isSelected && (
                          <Select
                            value={selectedEntry?.role || "company_staff"}
                            onValueChange={(v) => updateCompanyRole(company.id, v)}
                          >
                            <SelectTrigger className="w-[140px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {COMPANY_ROLE_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  <div className="flex items-center gap-2">
                                    <opt.icon className="h-3.5 w-3.5" />
                                    {opt.label}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    );
                  })}
                  {companies.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Nessuna azienda trovata</p>
                  )}
                </div>
              </ScrollArea>

              {selectedCompanies.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {selectedCompanies.length} aziend{selectedCompanies.length === 1 ? "a selezionata" : "e selezionate"}
                </p>
              )}
            </div>
          )}

          {/* STEP 3: Granular Permissions (only if non-admin companies exist) */}
          {step === 3 && hasNonAdminCompanies && (
            <div className="space-y-3">
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Questi permessi si applicano alle aziende con ruolo non-admin:
                  {" "}{nonAdminCompanyNames.join(", ")}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={handleSelectAll}>Seleziona tutto</Button>
                  <Button variant="outline" size="sm" onClick={handleDeselectAll}>Deseleziona tutto</Button>
                  {firstNonAdminRole && (
                    <Button variant="outline" size="sm" onClick={handleResetPreset}>
                      Ripristina preset {COMPANY_ROLE_LABELS[firstNonAdminRole]}
                    </Button>
                  )}
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
                  <Label htmlFor="plat-only_assigned" className="font-medium cursor-pointer">Solo elementi assegnati</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    L'utente vedrà solo ordini, attività e appuntamenti assegnati a lui.
                  </p>
                </div>
                <Switch
                  id="plat-only_assigned"
                  checked={permissions.only_assigned}
                  onCheckedChange={checked => setPermissions(prev => ({ ...prev, only_assigned: checked }))}
                />
              </div>
            </div>
          )}

          {/* CONFIRM STEP */}
          {step === confirmStep && selectedRole && (
            <div className="space-y-4 py-2">
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Ruolo Piattaforma</span>
                  <Badge className={PLATFORM_ROLE_COLORS[selectedRole]}>{PLATFORM_ROLE_LABELS[selectedRole]}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Nome</span>
                  <span className="text-sm font-medium">{firstName} {lastName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Email</span>
                  <span className="text-sm font-medium">{email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Aziende</span>
                  <span className="text-sm font-medium">{selectedCompanies.length || "Nessuna"}</span>
                </div>
              </div>

              {selectedCompanies.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Accessi aziendali</p>
                  {selectedCompanies.map(c => (
                    <div key={c.companyId} className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/30">
                      <div className="flex items-center gap-2">
                        <Building className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">{c.companyName}</span>
                      </div>
                      <Badge variant={c.role === "company_admin" ? "default" : "secondary"} className="text-[10px]">
                        {COMPANY_ROLE_LABELS[c.role] || c.role}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {hasNonAdminCompanies && (
                <div className="flex justify-between items-center px-3 py-2 bg-muted/30 rounded-md">
                  <span className="text-sm text-muted-foreground">Permessi attivi</span>
                  <Badge variant="secondary">{totalActive}</Badge>
                </div>
              )}

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
              <p className="font-medium text-lg">Membro creato con successo!</p>
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

        <DialogFooter className="gap-2 flex-shrink-0">
          {isSuccessStep ? (
            <Button onClick={handleClose}>Chiudi</Button>
          ) : (
            <>
              {step > 0 && (
                <Button variant="outline" onClick={handleBack}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Indietro
                </Button>
              )}
              {step < confirmStep ? (
                <Button
                  onClick={handleNext}
                  disabled={step === 0 ? !canProceedStep0 : step === 1 ? !canProceedStep1 : false}
                >
                  Avanti
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Crea Membro
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
