import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, X, Search } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/useDebounce";

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
  const [companySearch, setCompanySearch] = useState("");
  const debouncedSearch = useDebounce(companySearch, 250);
  const [selectedCompany, setSelectedCompany] = useState("");
  // Default sensato: "Operatore" è il ruolo più comune per partner/consulenti
  const [selectedRole, setSelectedRole] = useState<string>("company_staff");

  const { data: companies = [], isLoading: loadingCompanies } = useQuery({
    queryKey: ["companies-for-access", userId, debouncedSearch],
    queryFn: async () => {
      let q = supabase
        .from("companies")
        .select("id, name")
        .eq("is_platform_admin_company", false)
        .order("name")
        .limit(50);
      if (debouncedSearch.trim()) {
        q = q.ilike("name", `%${debouncedSearch.trim()}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: open,
    staleTime: 30 * 1000,
  });

  const availableCompanies = useMemo(
    () => companies.filter((c) => !existingCompanyIds.includes(c.id)),
    [companies, existingCompanyIds]
  );

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
      setSelectedRole("company_staff");
      setCompanySearch("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleCancel = () => {
    setOpen(false);
    setSelectedCompany("");
    setSelectedRole("company_staff");
    setCompanySearch("");
  };

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
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCancel}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Server-side search per scaling oltre 50 aziende */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={companySearch}
          onChange={(e) => setCompanySearch(e.target.value)}
          placeholder="Cerca azienda…"
          className="pl-8 h-9 text-sm"
        />
      </div>

      <Select value={selectedCompany} onValueChange={setSelectedCompany}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder={loadingCompanies ? "Caricamento…" : "Seleziona azienda"} />
        </SelectTrigger>
        <SelectContent>
          {loadingCompanies ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Caricamento…
            </div>
          ) : availableCompanies.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              {debouncedSearch ? `Nessun risultato per "${debouncedSearch}"` : "Nessuna azienda disponibile"}
            </div>
          ) : (
            availableCompanies.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))
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
        Aggiungi accesso
      </Button>
    </div>
  );
}
