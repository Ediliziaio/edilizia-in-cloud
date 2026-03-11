import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

const ROLE_OPTIONS = [
  { value: "company_admin", label: "Amministratore" },
  { value: "company_staff", label: "Operatore" },
  { value: "salesperson", label: "Venditore" },
  { value: "call_center", label: "Call Center" },
] as const;

interface AddCompanyAccessFormProps {
  userId: string;
  existingCompanyIds: string[];
}

export default function AddCompanyAccessForm({ userId, existingCompanyIds }: AddCompanyAccessFormProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [selectedRole, setSelectedRole] = useState("");

  const { data: companies = [], isLoading: loadingCompanies } = useQuery({
    queryKey: ["companies-for-access", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .eq("is_platform_admin_company", false)
        .order("name")
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const availableCompanies = companies.filter((c) => !existingCompanyIds.includes(c.id));

  const addMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-platform-users", {
        body: { action: "update-company-access", userId, companyId: selectedCompany, accessRole: selectedRole, operation: "add" },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) {
        const body = await res.error.context?.json?.();
        throw new Error(body?.error || res.error.message);
      }
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.superAdmins });
      toast.success("Accesso aggiunto");
      setOpen(false);
      setSelectedCompany("");
      setSelectedRole("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5 mr-1.5" /> Aggiungi Azienda
      </Button>
    );
  }

  return (
    <div className="border rounded-lg p-3 mt-2 space-y-3 bg-muted/30">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Aggiungi accesso</p>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setOpen(false); setSelectedCompany(""); setSelectedRole(""); }}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Select value={selectedCompany} onValueChange={setSelectedCompany}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder={loadingCompanies ? "Caricamento..." : "Seleziona azienda"} />
        </SelectTrigger>
        <SelectContent>
          {availableCompanies.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
          {availableCompanies.length === 0 && !loadingCompanies && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">Nessuna azienda disponibile</div>
          )}
        </SelectContent>
      </Select>

      <Select value={selectedRole} onValueChange={setSelectedRole}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="Seleziona ruolo" />
        </SelectTrigger>
        <SelectContent>
          {ROLE_OPTIONS.map((r) => (
            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        size="sm"
        className="w-full"
        disabled={!selectedCompany || !selectedRole || addMutation.isPending}
        onClick={() => addMutation.mutate()}
      >
        {addMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
        Aggiungi
      </Button>
    </div>
  );
}
