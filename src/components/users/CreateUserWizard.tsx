import { useState, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Copy, Check, ShieldCheck, User, TrendingUp, Phone, ChevronRight, ChevronLeft, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { StaffPermissions } from "@/components/users/PermissionsDialog";
import {
  DEFAULT_PERMISSIONS,
  INTERNAL_SECTIONS,
  MARKETING_SECTIONS,
  GRANULAR_SECTIONS,
  STANDALONE_SECTIONS,
} from "@/components/users/permissionsDefaults";

export type StaffRoleType = "company_admin" | "company_staff" | "salesperson" | "call_center";

export interface WizardUserFormData {
  first_name: string;
  last_name: string;
  email: string;
  role_type: StaffRoleType;
  permissions?: StaffPermissions;
  template_id?: string;
}

interface CreateUserWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: WizardUserFormData) => Promise<{ temporaryPassword?: string }>;
  isLoading?: boolean;
}

const ROLE_OPTIONS: { value: StaffRoleType; label: string; description: string; icon: React.ElementType }[] = [
  { value: "company_admin", label: "Amministratore", description: "Accesso completo a tutte le sezioni", icon: ShieldCheck },
  { value: "company_staff", label: "Operatore", description: "Gestione operativa interna", icon: User },
  { value: "salesperson", label: "Venditore", description: "Vendite, provvigioni e CRM", icon: TrendingUp },
  { value: "call_center", label: "Call Center", description: "Contatti e lead management", icon: Phone },
];

const ROLES_WITH_PERMISSIONS: StaffRoleType[] = ["company_staff", "salesperson", "call_center"];

interface PermissionTemplate {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, boolean>;
  is_system_default: boolean;
}

export function CreateUserWizard({ open, onOpenChange, onSubmit, isLoading }: CreateUserWizardProps) {
  const { toast } = useToast();
  const { effectiveCompany } = useAuth();
  const [step, setStep] = useState(0); // 0=info, 1=role, 2=permissions, 3=confirm
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [roleType, setRoleType] = useState<StaffRoleType>("company_staff");
  const [permissions, setPermissions] = useState<StaffPermissions>({ ...DEFAULT_PERMISSIONS });
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [templates, setTemplates] = useState<PermissionTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  // Load permission templates
  useEffect(() => {
    if (open && effectiveCompany?.id) {
      supabase.functions.invoke("manage-permission-template", {
        body: { action: "list", company_id: effectiveCompany.id },
      }).then(({ data }) => {
        if (data?.templates) setTemplates(data.templates);
      });
    }
  }, [open, effectiveCompany?.id]);

  const resetForm = () => {
    setStep(0);
    setFirstName("");
    setLastName("");
    setEmail("");
    setRoleType("company_staff");
    setPermissions({ ...DEFAULT_PERMISSIONS });
    setTemporaryPassword(null);
    setCopied(false);
    setSelectedTemplateId("");
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleApplyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      const newPerms = { ...DEFAULT_PERMISSIONS };
      Object.entries(template.permissions).forEach(([key, value]) => {
        if (key in newPerms) {
          (newPerms as any)[key] = value;
        }
      });
      setPermissions(newPerms);
    }
  };

  const handleNext = () => {
    if (step === 0) {
      if (!firstName.trim() || !lastName.trim() || !email.trim()) {
        toast({ title: "Campi obbligatori", description: "Compila nome, cognome e email.", variant: "destructive" });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        toast({ title: "Email non valida", description: "Inserisci un indirizzo email valido.", variant: "destructive" });
        return;
      }
      setStep(1);
    } else if (step === 1) {
      if (roleType === "company_admin") {
        setStep(3); // Skip permissions for admin
      } else {
        setStep(2);
      }
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step === 3 && roleType === "company_admin") {
      setStep(1);
    } else {
      setStep(step - 1);
    }
  };

  const handleSubmit = async () => {
    try {
      const result = await onSubmit({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase(),
        role_type: roleType,
        permissions: ROLES_WITH_PERMISSIONS.includes(roleType) ? permissions : undefined,
        template_id: selectedTemplateId || undefined,
      });
      if (result.temporaryPassword) {
        setTemporaryPassword(result.temporaryPassword);
        setStep(4); // success step
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

  const togglePermission = (key: keyof StaffPermissions) => {
    setPermissions((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      // If disabling a view key, also disable its edit key
      const allSections = [...STANDALONE_SECTIONS, ...INTERNAL_SECTIONS, ...GRANULAR_SECTIONS, ...MARKETING_SECTIONS];
      const section = allSections.find(s => s.viewKey === key);
      if (section?.editKey && !updated[key]) {
        updated[section.editKey] = false;
      }
      return updated;
    });
  };

  const stepLabels = ["Informazioni", "Ruolo", "Permessi", "Conferma"];
  const totalSteps = roleType === "company_admin" ? 3 : 4;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {step === 4 ? "Utente Creato" : `Nuovo Utente — Step ${step + 1}/${totalSteps}`}
          </DialogTitle>
          {step < 4 && (
            <DialogDescription>
              {stepLabels[step]}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Step indicators */}
        {step < 4 && (
          <div className="flex gap-1.5 px-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0 max-h-[60vh] pr-4">
          {/* Step 0: Basic info */}
          {step === 0 && (
            <div className="space-y-4 py-2">
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
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mario.rossi@azienda.it" />
              </div>
            </div>
          )}

          {/* Step 1: Role selection */}
          {step === 1 && (
            <div className="space-y-3 py-2">
              {ROLE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = roleType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRoleType(opt.value)}
                    className={`w-full flex items-center gap-3 p-4 rounded-lg border-2 text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className={`rounded-full p-2 ${isSelected ? "bg-primary/10" : "bg-muted"}`}>
                      <Icon className={`h-5 w-5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <p className="font-medium">{opt.label}</p>
                      <p className="text-sm text-muted-foreground">{opt.description}</p>
                    </div>
                    {isSelected && <Check className="h-5 w-5 text-primary ml-auto" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Step 2: Permissions */}
          {step === 2 && (
            <div className="space-y-4 py-2">
              {/* Template selector */}
              {templates.length > 0 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <FileText className="h-4 w-4" />
                    Applica Template
                  </Label>
                  <Select value={selectedTemplateId} onValueChange={handleApplyTemplate}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona un template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} {t.is_system_default && "(Sistema)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Separator />

              {/* Standalone */}
              {STANDALONE_SECTIONS.length > 0 && (
                <div className="space-y-2">
                  {STANDALONE_SECTIONS.map((sec) => (
                    <div key={sec.viewKey} className="flex items-center gap-2">
                      <Checkbox
                        checked={permissions[sec.viewKey]}
                        onCheckedChange={() => togglePermission(sec.viewKey)}
                      />
                      <Label className="text-sm cursor-pointer" onClick={() => togglePermission(sec.viewKey)}>
                        {sec.label}
                      </Label>
                    </div>
                  ))}
                </div>
              )}

              {/* Internal sections */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Sezioni Interne</p>
                <div className="space-y-1.5">
                  {INTERNAL_SECTIONS.map((sec) => (
                    <div key={sec.viewKey} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={permissions[sec.viewKey]}
                          onCheckedChange={() => togglePermission(sec.viewKey)}
                        />
                        <Label className="text-sm cursor-pointer" onClick={() => togglePermission(sec.viewKey)}>
                          {sec.label}
                        </Label>
                      </div>
                      {sec.editKey && permissions[sec.viewKey] && (
                        <div className="flex items-center gap-1.5">
                          <Checkbox
                            checked={permissions[sec.editKey]}
                            onCheckedChange={() => togglePermission(sec.editKey!)}
                          />
                          <span className="text-xs text-muted-foreground">Modifica</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Granular permissions */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Permessi Granulari</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {GRANULAR_SECTIONS.map((sec) => (
                    <div key={sec.viewKey} className="flex items-center gap-2">
                      <Checkbox
                        checked={permissions[sec.viewKey]}
                        onCheckedChange={() => togglePermission(sec.viewKey)}
                      />
                      <Label className="text-sm cursor-pointer" onClick={() => togglePermission(sec.viewKey)}>
                        {sec.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Marketing sections */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Marketing</p>
                <div className="space-y-1.5">
                  {MARKETING_SECTIONS.map((sec) => (
                    <div key={sec.viewKey} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={permissions[sec.viewKey]}
                          onCheckedChange={() => togglePermission(sec.viewKey)}
                        />
                        <Label className="text-sm cursor-pointer" onClick={() => togglePermission(sec.viewKey)}>
                          {sec.label}
                        </Label>
                      </div>
                      {sec.editKey && permissions[sec.viewKey] && (
                        <div className="flex items-center gap-1.5">
                          <Checkbox
                            checked={permissions[sec.editKey]}
                            onCheckedChange={() => togglePermission(sec.editKey!)}
                          />
                          <span className="text-xs text-muted-foreground">Modifica</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Only assigned toggle */}
              <Separator />
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={permissions.only_assigned}
                  onCheckedChange={() => togglePermission("only_assigned")}
                />
                <Label className="text-sm cursor-pointer" onClick={() => togglePermission("only_assigned")}>
                  Mostra solo elementi assegnati
                </Label>
              </div>
            </div>
          )}

          {/* Step 3: Confirmation */}
          {step === 3 && (
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
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Ruolo</span>
                  <Badge variant="outline">
                    {ROLE_OPTIONS.find(r => r.value === roleType)?.label}
                  </Badge>
                </div>
                {ROLES_WITH_PERMISSIONS.includes(roleType) && (
                  <div>
                    <span className="text-sm text-muted-foreground">Permessi attivi</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(permissions)
                        .filter(([, v]) => v === true)
                        .map(([k]) => (
                          <Badge key={k} variant="secondary" className="text-[10px]">
                            {k.replace(/^can_(view|edit|manage|approve|export|delete)_/, "").replace(/_/g, " ")}
                          </Badge>
                        ))}
                    </div>
                  </div>
                )}
                {selectedTemplateId && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Template</span>
                    <span className="text-sm">{templates.find(t => t.id === selectedTemplateId)?.name}</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Verrà generata una password temporanea che l'utente dovrà cambiare al primo accesso.
              </p>
            </div>
          )}

          {/* Step 4: Success with password */}
          {step === 4 && (
            <div className="space-y-4 py-2 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Check className="h-6 w-6 text-emerald-600" />
              </div>
              <p className="font-medium">
                {firstName} {lastName} è stato creato con successo!
              </p>
              {temporaryPassword && (
                <div className="bg-muted rounded-lg p-4 space-y-2">
                  <p className="text-sm text-muted-foreground">Password temporanea:</p>
                  <div className="flex items-center justify-center gap-2">
                    <code className="text-lg font-mono bg-background px-3 py-1 rounded border">
                      {temporaryPassword}
                    </code>
                    <Button variant="ghost" size="icon" onClick={copyPassword}>
                      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-destructive">
                    Comunica questa password all'utente. Non sarà più visibile dopo la chiusura.
                  </p>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 4 ? (
            <Button onClick={handleClose}>Chiudi</Button>
          ) : (
            <>
              {step > 0 && (
                <Button variant="outline" onClick={handleBack} disabled={isLoading}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Indietro
                </Button>
              )}
              {step < 3 ? (
                <Button onClick={handleNext}>
                  Avanti
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={isLoading}>
                  {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Crea Utente
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
