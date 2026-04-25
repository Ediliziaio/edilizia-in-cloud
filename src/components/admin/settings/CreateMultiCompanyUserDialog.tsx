import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, Building, Eye, EyeOff, Mail, Check } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

// Validation regex (RFC 5322 simplified — basta per UX warning)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score: 20, label: "Debole", color: "bg-destructive" };
  if (score <= 2) return { score: 40, label: "Scarsa", color: "bg-orange-500" };
  if (score <= 3) return { score: 60, label: "Media", color: "bg-yellow-500" };
  if (score <= 4) return { score: 80, label: "Buona", color: "bg-primary" };
  return { score: 100, label: "Forte", color: "bg-green-500" };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CompanyAccess {
  companyId: string;
  companyName: string;
  role: string;
}

export default function CreateMultiCompanyUserDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  // Password mode: "auto" → edge fn genera, "manual" → admin imposta
  const [passwordMode, setPasswordMode] = useState<"auto" | "manual">("auto");
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [selectedCompanies, setSelectedCompanies] = useState<CompanyAccess[]>([]);
  const [companySearch, setCompanySearch] = useState("");
  const [emailError, setEmailError] = useState<string>("");

  const resetForm = () => {
    setStep(0);
    setEmail("");
    setPassword("");
    setShowPw(false);
    setFirstName("");
    setLastName("");
    setPhone("");
    setPasswordMode("auto");
    setSendWelcomeEmail(true);
    setSelectedCompanies([]);
    setCompanySearch("");
    setEmailError("");
  };

  const passwordStrength = getPasswordStrength(password);

  const { data: companies = [] } = useQuery({
    queryKey: ["admin-companies-for-multi", companySearch],
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
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-platform-users", {
        body: {
          action: "create-multi-company",
          email,
          // Manda password solo se modalità manuale (e valida); altrimenti
          // l'edge fn auto-genera 12 caratteri sicuri
          password: passwordMode === "manual" && password.length >= 8 ? password : undefined,
          firstName,
          lastName,
          phone: phone.trim() || null,
          sendWelcomeEmail,
          companyAccesses: selectedCompanies.map(c => ({ companyId: c.companyId, role: c.role })),
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data as { temporaryPassword?: string; passwordWasProvided?: boolean; welcomeEmailSent?: boolean };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.superAdmins });
      onOpenChange(false);
      resetForm();
      // Toast intelligente: se auto-generata, ricorda di copiarla; se welcome email inviata, conferma
      if (data?.temporaryPassword && !data?.passwordWasProvided) {
        toast.success("Utente creato", {
          description: `Password generata: ${data.temporaryPassword}${data.welcomeEmailSent ? " · Email inviata" : ""}`,
          duration: 12000,
        });
      } else {
        toast.success(
          data?.welcomeEmailSent
            ? "Utente creato — email di benvenuto inviata"
            : "Utente multi-azienda creato"
        );
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleCompany = (companyId: string, companyName: string) => {
    setSelectedCompanies(prev => {
      const exists = prev.find(c => c.companyId === companyId);
      if (exists) return prev.filter(c => c.companyId !== companyId);
      return [...prev, { companyId, companyName, role: "company_staff" }];
    });
  };

  const updateRole = (companyId: string, role: string) => {
    setSelectedCompanies(prev =>
      prev.map(c => c.companyId === companyId ? { ...c, role } : c)
    );
  };

  const canProceedStep0 =
    email.trim() !== "" &&
    EMAIL_RE.test(email.trim()) &&
    firstName.trim() !== "" &&
    lastName.trim() !== "" &&
    // Password obbligatoria solo in modalità manual (>= 8 char)
    (passwordMode === "auto" || password.length >= 8);
  const canProceedStep1 = selectedCompanies.length > 0;

  const handleNextFromStep0 = () => {
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError("Inserisci un'email valida");
      return;
    }
    setEmailError("");
    setStep(1);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuovo Utente Multi-Azienda</DialogTitle>
          <DialogDescription>
            {step === 0 ? "Inserisci i dati dell'utente" : "Seleziona le aziende a cui avrà accesso"}
          </DialogDescription>
        </DialogHeader>

        {step === 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Mario" />
              </div>
              <div className="space-y-2">
                <Label>Cognome</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Rossi" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                onBlur={() => {
                  if (email && !EMAIL_RE.test(email.trim())) setEmailError("Inserisci un'email valida");
                }}
                placeholder="mario@esempio.it"
                className={emailError ? "border-destructive" : ""}
              />
              {emailError && <p className="text-xs text-destructive">{emailError}</p>}
            </div>
            <div className="space-y-2">
              <Label>Telefono <span className="text-muted-foreground/70 font-normal">(opzionale)</span></Label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+39 333 123 4567"
              />
            </div>
            {/* Password mode selector */}
            <div className="space-y-2">
              <Label>Password</Label>
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
                <>
                  <div className="relative">
                    <Input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 8 caratteri"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowPw(!showPw)}
                    >
                      {showPw
                        ? <EyeOff className="h-4 w-4 text-muted-foreground" />
                        : <Eye className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                  </div>
                  {password.length > 0 && (
                    <div className="space-y-1 mt-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Sicurezza</span>
                        <span>{passwordStrength.label}</span>
                      </div>
                      <Progress value={passwordStrength.score} className="h-1.5" />
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Genereremo una password sicura. La vedrai nel toast dopo la creazione.
                </p>
              )}
            </div>
            {/* Welcome email toggle */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border">
              <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <Label
                  htmlFor="send-welcome-multi"
                  className="text-sm font-medium cursor-pointer flex items-center justify-between gap-2"
                >
                  <span>Invia email di benvenuto</span>
                  <Switch
                    id="send-welcome-multi"
                    checked={sendWelcomeEmail}
                    onCheckedChange={setSendWelcomeEmail}
                  />
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {sendWelcomeEmail
                    ? "L'utente riceverà email con credenziali e link al portale."
                    : "Nessuna email automatica."}
                </p>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cerca azienda..."
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <ScrollArea className="h-[300px] border rounded-md">
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
                          onValueChange={(v) => updateRole(company.id, v)}
                        >
                          <SelectTrigger className="w-[140px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="company_admin">Admin</SelectItem>
                            <SelectItem value="company_staff">Staff</SelectItem>
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
              <p className="text-sm text-muted-foreground">{selectedCompanies.length} aziende selezionate</p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(0)}>Indietro</Button>
          )}
          {step === 0 ? (
            <Button onClick={handleNextFromStep0} disabled={!canProceedStep0}>Avanti</Button>
          ) : (
            <Button onClick={() => createMutation.mutate()} disabled={!canProceedStep1 || createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crea Utente
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
