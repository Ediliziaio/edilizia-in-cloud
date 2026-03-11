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
import { Loader2, Search, Building } from "lucide-react";
import { toast } from "sonner";

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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [selectedCompanies, setSelectedCompanies] = useState<CompanyAccess[]>([]);
  const [companySearch, setCompanySearch] = useState("");

  const resetForm = () => {
    setStep(0);
    setEmail("");
    setPassword("");
    setFirstName("");
    setLastName("");
    setSelectedCompanies([]);
    setCompanySearch("");
  };

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
          password,
          firstName,
          lastName,
          companyAccesses: selectedCompanies.map(c => ({ companyId: c.companyId, role: c.role })),
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.superAdmins });
      onOpenChange(false);
      resetForm();
      toast.success("Utente multi-azienda creato");
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

  const canProceedStep0 = email.trim() !== "" && password.length >= 8 && firstName.trim() !== "" && lastName.trim() !== "";
  const canProceedStep1 = selectedCompanies.length > 0;

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
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mario@esempio.it" />
            </div>
            <div className="space-y-2">
              <Label>Password (min 8 caratteri)</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
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
            <Button onClick={() => setStep(1)} disabled={!canProceedStep0}>Avanti</Button>
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
