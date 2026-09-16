/**
 * CreatePlatformUserDialog — single-page (no wizard) form per creare un membro
 * del Team Piattaforma.
 *
 * Refactor v2 (semplificazione UX):
 *  - Da wizard 5-step → 1 pagina scrollabile con sezioni inline
 *  - Sezioni "Aziende" e "Permessi" collapsabili / condizionali
 *  - Validazione field-level inline (no "Avanti" disabled mistery)
 *  - Submit unico in fondo
 *  - Success view conservata (password temporanea + copy)
 *
 * Effetto: il super admin può creare un membro senza navigare 4 step.
 * Per ruoli senza aziende (super_admin/manager) basta scorrere, compilare,
 * cliccare. Per ruoli con permessi granulari, le sezioni si espandono solo
 * se servono — niente passi obbligatori vuoti.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
  ChevronDown, ChevronRight, Copy, CheckCircle2, AlertTriangle,
  ShieldCheck, User, TrendingUp, Phone, Users, Briefcase, Shield,
  Eye, EyeOff, Mail,
} from "lucide-react";
import { toast } from "sonner";
import { PLATFORM_ROLES, PLATFORM_ROLE_LABELS, PLATFORM_ROLE_DESCRIPTIONS, PLATFORM_ROLE_COLORS, type PlatformRole } from "@/types/auth";
import { cn } from "@/lib/utils";
import type { StaffPermissions } from "@/components/users/PermissionsDialog";
import {
  DEFAULT_PERMISSIONS, STANDALONE_SECTIONS, INTERNAL_SECTIONS, MARKETING_SECTIONS,
  ALL_PERMISSION_SECTIONS, ROLE_PRESETS, syncLegacyMarketingFlags,
  isBlockedBySolaLettura, SOLA_LETTURA_BLOCKED_NOTE,
  type PermissionSectionDef, type StaffRoleType, type BooleanPermissionKey,
} from "@/components/users/permissionsDefaults";
import { SolaLetturaToggle } from "@/components/users/SolaLetturaToggle";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CompanyAccess {
  companyId: string;
  companyName: string;
  role: string;
}

const COMPANY_ROLE_OPTIONS: { value: string; label: string; icon: React.ElementType }[] = [
  { value: "company_admin", label: "Amministratore", icon: ShieldCheck },
  { value: "company_staff", label: "Operatore", icon: User },
  { value: "salesperson", label: "Venditore", icon: TrendingUp },
  { value: "call_center", label: "Call Center", icon: Phone },
];

const ROLES_WITH_PERMISSIONS = ["company_staff", "salesperson", "call_center"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Permission Group sub-component ──────────────────────────────────────
function PermGroup({ label, icon: Icon, iconColor, sections, permissions, onToggle }: {
  label: string; icon: React.ElementType; iconColor: string;
  sections: PermissionSectionDef[]; permissions: StaffPermissions;
  onToggle: (key: keyof StaffPermissions, value: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
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
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button type="button" className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${iconColor}`} />
            <span className="text-sm font-medium">{label}</span>
            <Badge variant="secondary" className="text-xs px-1.5 py-0">{activeCount}/{totalCount}</Badge>
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
                disabled={bloccato(section.viewKey)}
                onCheckedChange={(checked) => onToggle(section.viewKey, checked)}
              />
              <Label htmlFor={`plat-${section.viewKey}`} className="text-sm cursor-pointer">{section.label}</Label>
              {(bloccato(section.viewKey) || (section.editKey && bloccato(section.editKey))) && (
                <span className="text-[11px] text-amber-600">{SOLA_LETTURA_BLOCKED_NOTE}</span>
              )}
            </div>
            {section.editKey && permissions[section.viewKey] && (
              <div className="flex items-center gap-1.5">
                <Switch
                  id={`plat-${section.editKey}`}
                  checked={permissions[section.editKey]}
                  disabled={bloccato(section.editKey)}
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

// ─── Main component ──────────────────────────────────────────────────────
export default function CreatePlatformUserDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();

  // Form state
  const [selectedRole, setSelectedRole] = useState<PlatformRole | null>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  // Password mode: "auto" → edge fn genera, "manual" → admin imposta
  const [passwordMode, setPasswordMode] = useState<"auto" | "manual">("auto");
  const [manualPassword, setManualPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  // Send welcome email default true (può essere disattivato per import bulk)
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [selectedCompanies, setSelectedCompanies] = useState<CompanyAccess[]>([]);
  const [companySearch, setCompanySearch] = useState("");
  const [companiesOpen, setCompaniesOpen] = useState(false);
  const [permissions, setPermissions] = useState<StaffPermissions>({ ...DEFAULT_PERMISSIONS });

  // Success view
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isSuccessView = !!temporaryPassword;

  const resetForm = () => {
    setSelectedRole(null);
    setEmail("");
    setEmailError("");
    setFirstName("");
    setLastName("");
    setPhone("");
    setPasswordMode("auto");
    setManualPassword("");
    setShowPw(false);
    setSendWelcomeEmail(true);
    setSelectedCompanies([]);
    setCompanySearch("");
    setCompaniesOpen(false);
    setPermissions({ ...DEFAULT_PERMISSIONS });
    setTemporaryPassword(null);
    setCopied(false);
  };

  // Companies (lazy: solo quando si apre la sezione)
  const { data: companies = [] } = useQuery({
    queryKey: ["admin-companies-for-platform-user", companySearch],
    queryFn: async () => {
      let query = supabase
        .from("companies")
        .select("id, name, logo_url")
        .eq("is_platform_admin_company", false)
        .order("name")
        .limit(50);
      if (companySearch) query = query.ilike("name", `%${companySearch}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && companiesOpen,
    staleTime: 30 * 1000,
  });

  const hasNonAdminCompanies = selectedCompanies.some(c => ROLES_WITH_PERMISSIONS.includes(c.role));
  const firstNonAdminRole = useMemo(() => {
    const found = selectedCompanies.find(c => ROLES_WITH_PERMISSIONS.includes(c.role));
    return found?.role as StaffRoleType | undefined;
  }, [selectedCompanies]);

  // Auto-apply preset quando viene aggiunta la prima azienda con ruolo non-admin
  useEffect(() => {
    if (firstNonAdminRole) {
      setPermissions((prev) => ({
        ...DEFAULT_PERMISSIONS,
        only_assigned: prev.only_assigned,
        sola_lettura: prev.sola_lettura,
        ...ROLE_PRESETS[firstNonAdminRole],
      }));
    }
  }, [firstNonAdminRole]);

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

  const totalActive = useMemo(() => {
    const excluded = new Set(["only_assigned", "sola_lettura", "can_view_marketing", "can_edit_marketing"]);
    return Object.entries(permissions).filter(([k, v]) => v === true && !excluded.has(k)).length;
  }, [permissions]);

  // Mutation: create user
  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const finalPerms = hasNonAdminCompanies ? syncLegacyMarketingFlags(permissions) : undefined;
      const res = await supabase.functions.invoke("manage-platform-users", {
        body: {
          action: "create",
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() || null,
          // Se modalità manual e password >= 8, manda quella; altrimenti edge fn auto-genera
          password: passwordMode === "manual" && manualPassword.length >= 8
            ? manualPassword
            : undefined,
          sendWelcomeEmail,
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
      // Mostra la success view solo se la password è stata auto-generata dal
      // backend (l'admin non la conosce). Se invece l'admin l'ha impostata
      // manualmente (passwordWasProvided=true), può chiudere subito.
      const showPasswordReveal = data?.temporaryPassword && !data?.passwordWasProvided;
      if (showPasswordReveal) {
        setTemporaryPassword(data.temporaryPassword);
      } else {
        toast.success(
          data?.welcomeEmailSent
            ? "Membro creato — email di benvenuto inviata"
            : "Membro del team creato con successo"
        );
        handleClose();
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Validation
  const isFormValid = useMemo(() => {
    if (!selectedRole) return false;
    if (!firstName.trim() || !lastName.trim()) return false;
    if (!email.trim() || !EMAIL_RE.test(email.trim())) return false;
    // Se modalità manuale, password DEVE essere >= 8 char
    if (passwordMode === "manual" && manualPassword.length < 8) return false;
    return true;
  }, [selectedRole, firstName, lastName, email, passwordMode, manualPassword]);

  const handleSubmit = () => {
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError("Inserisci un'email valida");
      return;
    }
    setEmailError("");
    createMutation.mutate();
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

  // ─── Success view ─────────────────────────────────────────────────────
  if (isSuccessView) {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else onOpenChange(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Membro Creato</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="font-medium text-lg">Membro creato con successo!</p>
            <div className="bg-muted rounded-lg p-4 space-y-3 text-left">
              <div className="flex justify-between items-center gap-3">
                <span className="text-sm text-muted-foreground">Email</span>
                <span className="text-sm font-mono truncate">{email}</span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-sm text-muted-foreground shrink-0">Password</span>
                <div className="flex items-center gap-2 min-w-0">
                  <code className="text-sm font-mono bg-background px-2 py-1 rounded border truncate">{temporaryPassword}</code>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={copyPassword}>
                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
            <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 text-left">
              <p className="text-xs text-destructive font-medium">
                ⚠️ Questa password viene mostrata solo una volta. Comunicala in modo sicuro all'utente prima di chiudere.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleClose} className="w-full">Chiudi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── Form view (single-page) ──────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else onOpenChange(o); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] !flex !flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Nuovo Membro del Team
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-6">
            {/* ─── 1) RUOLO PIATTAFORMA ──────────────────────────────── */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Ruolo piattaforma <span className="text-destructive">*</span></h3>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {PLATFORM_ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setSelectedRole(role)}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all",
                      selectedRole === role
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/30"
                    )}
                  >
                    <div className={cn("w-2.5 h-2.5 rounded-full shrink-0 mt-1.5", PLATFORM_ROLE_COLORS[role].split(" ")[0])} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{PLATFORM_ROLE_LABELS[role]}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2">{PLATFORM_ROLE_DESCRIPTIONS[role]}</div>
                    </div>
                    {selectedRole === role && <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
                  </button>
                ))}
              </div>
            </section>

            <Separator />

            {/* ─── 2) DATI PERSONALI ──────────────────────────────── */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Dati personali</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome <span className="text-destructive">*</span></Label>
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Mario"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Cognome <span className="text-destructive">*</span></Label>
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Rossi"
                    className="h-9"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Email <span className="text-destructive">*</span></Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                    onBlur={() => {
                      if (email && !EMAIL_RE.test(email.trim())) setEmailError("Email non valida");
                    }}
                    placeholder="mario@esempio.it"
                    className={cn("h-9", emailError && "border-destructive")}
                  />
                  {emailError && <p className="text-xs text-destructive">{emailError}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Telefono <span className="text-muted-foreground/70 font-normal">(opzionale)</span>
                  </Label>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+39 333 123 4567"
                    className="h-9"
                  />
                </div>
              </div>
              {!emailError && (
                <p className="text-xs text-muted-foreground">
                  L'email verrà usata per il login.
                </p>
              )}

              {/* ─── Password mode (auto vs manual) ─────────────── */}
              <div className="space-y-2 pt-1">
                <Label className="text-xs">Password</Label>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    type="button"
                    size="sm"
                    variant={passwordMode === "auto" ? "default" : "outline"}
                    onClick={() => setPasswordMode("auto")}
                    className="h-8 gap-1.5 text-xs"
                  >
                    {passwordMode === "auto" && <Check className="h-3 w-3" />}
                    Genera automaticamente
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={passwordMode === "manual" ? "default" : "outline"}
                    onClick={() => setPasswordMode("manual")}
                    className="h-8 gap-1.5 text-xs"
                  >
                    {passwordMode === "manual" && <Check className="h-3 w-3" />}
                    Imposta manualmente
                  </Button>
                </div>
                {passwordMode === "manual" ? (
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Input
                        type={showPw ? "text" : "password"}
                        value={manualPassword}
                        onChange={(e) => setManualPassword(e.target.value)}
                        placeholder="Min. 8 caratteri"
                        className="h-9 pr-9"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full w-9 hover:bg-transparent"
                        onClick={() => setShowPw(!showPw)}
                      >
                        {showPw ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
                      </Button>
                    </div>
                    {manualPassword.length > 0 && manualPassword.length < 8 && (
                      <p className="text-xs text-destructive">
                        Mancano {8 - manualPassword.length} caratteri (minimo 8)
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Genereremo una password sicura di 12 caratteri. La vedrai una sola volta dopo la creazione.
                  </p>
                )}
              </div>

              {/* ─── Send welcome email toggle ─────────────────── */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border">
                <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <Label
                    htmlFor="send-welcome-platform"
                    className="text-sm font-medium cursor-pointer flex items-center justify-between gap-2"
                  >
                    <span>Invia email di benvenuto</span>
                    <Switch
                      id="send-welcome-platform"
                      checked={sendWelcomeEmail}
                      onCheckedChange={setSendWelcomeEmail}
                    />
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {sendWelcomeEmail
                      ? "L'utente riceverà email con credenziali e link al portale."
                      : "Nessuna email — comunicherai tu le credenziali manualmente."}
                  </p>
                </div>
              </div>
            </section>

            <Separator />

            {/* ─── 3) ACCESSI AZIENDALI (collapsible, opzionale) ─── */}
            <Collapsible open={companiesOpen} onOpenChange={setCompaniesOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">Accessi aziendali</span>
                    {selectedCompanies.length > 0 && (
                      <Badge variant="secondary" className="text-xs">{selectedCompanies.length}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground font-normal hidden sm:inline">
                      (opzionale)
                    </span>
                  </div>
                  {companiesOpen
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Aziende a cui questo utente potrà accedere oltre al pannello piattaforma.
                </p>

                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Cerca azienda…"
                    value={companySearch}
                    onChange={(e) => setCompanySearch(e.target.value)}
                    className="pl-8 h-9 text-sm"
                  />
                </div>

                <div className="border rounded-md max-h-[260px] overflow-y-auto">
                  <div className="p-2 space-y-1">
                    {companies.map((company) => {
                      const isSelected = selectedCompanies.some(c => c.companyId === company.id);
                      const selectedEntry = selectedCompanies.find(c => c.companyId === company.id);
                      return (
                        <div key={company.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted transition-colors">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleCompany(company.id, company.name)}
                          />
                          <Building className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="flex-1 text-sm truncate">{company.name}</span>
                          {isSelected && (
                            <Select
                              value={selectedEntry?.role || "company_staff"}
                              onValueChange={(v) => updateCompanyRole(company.id, v)}
                            >
                              <SelectTrigger className="w-[130px] h-7 text-xs">
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
                      <p className="text-xs text-muted-foreground text-center py-4">
                        {companySearch ? `Nessun risultato per "${companySearch}"` : "Nessuna azienda trovata"}
                      </p>
                    )}
                  </div>
                </div>

                {selectedCompanies.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {selectedCompanies.length} aziend{selectedCompanies.length === 1 ? "a selezionata" : "e selezionate"}
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* ─── 4) PERMESSI GRANULARI (visibile solo se non-admin companies) ─── */}
            {hasNonAdminCompanies && (
              <>
                <Separator />
                <section className="space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">Permessi granulari</h3>
                    </div>
                    <Badge variant="outline" className="text-xs">{totalActive} attivi</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Si applicano alle aziende con ruolo Operatore / Venditore / Call Center.
                    Preset applicato automaticamente — espandi per personalizzare.
                  </p>
                  <div className="space-y-2">
                    <PermGroup
                      label="Cruscotto Aziendale"
                      icon={Building2}
                      iconColor="text-indigo-600"
                      sections={STANDALONE_SECTIONS}
                      permissions={permissions}
                      onToggle={handleToggle}
                    />
                    <PermGroup
                      label="Gestione Interna"
                      icon={LayoutDashboard}
                      iconColor="text-blue-600"
                      sections={INTERNAL_SECTIONS}
                      permissions={permissions}
                      onToggle={handleToggle}
                    />
                    <PermGroup
                      label="Marketing e Vendite"
                      icon={Megaphone}
                      iconColor="text-purple-600"
                      sections={MARKETING_SECTIONS}
                      permissions={permissions}
                      onToggle={handleToggle}
                    />
                  </div>
                  <SolaLetturaToggle
                    id="plat-sola_lettura"
                    checked={permissions.sola_lettura || false}
                    onCheckedChange={(checked) => setPermissions(prev => syncLegacyMarketingFlags({ ...prev, sola_lettura: checked }))}
                  />
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div>
                      <Label htmlFor="plat-only_assigned" className="text-sm font-medium cursor-pointer">
                        Solo elementi assegnati
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        L'utente vedrà solo ordini, attività e appuntamenti assegnati a lui.
                      </p>
                    </div>
                    <Switch
                      id="plat-only_assigned"
                      checked={permissions.only_assigned}
                      onCheckedChange={(checked) => setPermissions(prev => ({ ...prev, only_assigned: checked }))}
                    />
                  </div>
                </section>
              </>
            )}

            {/* ─── INFO + Riepilogo ─────────────────────────────────── */}
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <span className="text-xs text-amber-700 dark:text-amber-400">
                  Verrà generata una password temporanea. L'utente dovrà cambiarla al primo accesso.
                </span>
              </div>
              {(selectedRole || firstName || lastName || selectedCompanies.length > 0) && (
                <div className="flex flex-wrap items-center gap-1.5 pl-6 text-xs text-amber-700 dark:text-amber-400">
                  <span>Riepilogo:</span>
                  <span className="font-medium">{firstName || "—"} {lastName || ""}</span>
                  {selectedRole && (
                    <Badge className={cn("text-[10px] py-0 px-1.5", PLATFORM_ROLE_COLORS[selectedRole])}>
                      {PLATFORM_ROLE_LABELS[selectedRole]}
                    </Badge>
                  )}
                  {selectedCompanies.length > 0 && (
                    <span>· {selectedCompanies.length} azienda{selectedCompanies.length === 1 ? "" : "e"}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-3 border-t shrink-0 gap-2 bg-muted/20">
          <Button variant="ghost" onClick={handleClose} disabled={createMutation.isPending}>
            Annulla
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isFormValid || createMutation.isPending}
            className="gap-2 min-w-[140px]"
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {createMutation.isPending ? "Creazione…" : "Crea Membro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
