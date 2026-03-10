import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Building2, CreditCard, HeadphonesIcon, Users, ShieldCheck, BarChart3, Loader2, Globe, Search, Megaphone } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "sonner";
import { SUPER_ADMIN_PERMISSION_LABELS } from "@/lib/adminConstants";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adminId: string;
  adminName: string;
}

interface Permissions {
  can_manage_companies: boolean;
  can_manage_plans: boolean;
  can_manage_tickets: boolean;
  can_manage_referrals: boolean;
  can_manage_admins: boolean;
  can_view_platform_stats: boolean;
  can_manage_marketing: boolean;
  allowed_company_ids: string[] | null;
}

const defaults: Permissions = {
  can_manage_companies: true,
  can_manage_plans: true,
  can_manage_tickets: true,
  can_manage_referrals: true,
  can_manage_admins: true,
  can_view_platform_stats: true,
  can_manage_marketing: true,
  allowed_company_ids: null,
};

const permItems: { key: keyof Omit<Permissions, "allowed_company_ids">; icon: typeof Building2; label: string; desc: string }[] = [
  { key: "can_manage_companies", icon: Building2, label: SUPER_ADMIN_PERMISSION_LABELS.can_manage_companies, desc: "Creare, modificare, eliminare aziende" },
  { key: "can_manage_plans", icon: CreditCard, label: SUPER_ADMIN_PERMISSION_LABELS.can_manage_plans, desc: "Gestire piani di abbonamento" },
  { key: "can_manage_tickets", icon: HeadphonesIcon, label: SUPER_ADMIN_PERMISSION_LABELS.can_manage_tickets, desc: "Gestire ticket di supporto" },
  { key: "can_manage_referrals", icon: Users, label: SUPER_ADMIN_PERMISSION_LABELS.can_manage_referrals, desc: "Gestire programma referral" },
  { key: "can_manage_admins", icon: ShieldCheck, label: SUPER_ADMIN_PERMISSION_LABELS.can_manage_admins, desc: "Creare ed eliminare altri super admin" },
  { key: "can_view_platform_stats", icon: BarChart3, label: SUPER_ADMIN_PERMISSION_LABELS.can_view_platform_stats, desc: "Visualizzare statistiche globali" },
  { key: "can_manage_marketing", icon: Megaphone, label: SUPER_ADMIN_PERMISSION_LABELS.can_manage_marketing, desc: "Gestire CRM e marketing della piattaforma" },
];

export default function SuperAdminPermissionsDialog({ open, onOpenChange, adminId, adminName }: Props) {
  const queryClient = useQueryClient();
  const [perms, setPerms] = useState<Permissions>(defaults);
  const [allCompanies, setAllCompanies] = useState(true);

  const { data: currentPerms, isLoading: loadingPerms } = useQuery({
    queryKey: ["super-admin-permissions", adminId],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "get-permissions", userId: adminId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      return res.data?.permissions as Permissions | null;
    },
    enabled: open && !!adminId,
  });

  const { data: companies = [], isLoading: loadingCompanies } = useQuery({
    queryKey: ["all-companies-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  useEffect(() => {
    if (currentPerms) {
      setPerms({
        can_manage_companies: currentPerms.can_manage_companies,
        can_manage_plans: currentPerms.can_manage_plans,
        can_manage_tickets: currentPerms.can_manage_tickets,
        can_manage_referrals: currentPerms.can_manage_referrals,
        can_manage_admins: currentPerms.can_manage_admins,
        can_view_platform_stats: currentPerms.can_view_platform_stats,
        allowed_company_ids: currentPerms.allowed_company_ids,
      });
      setAllCompanies(currentPerms.allowed_company_ids === null);
    } else {
      setPerms(defaults);
      setAllCompanies(true);
    }
  }, [currentPerms, open]);

  const mutation = useMutation({
    mutationFn: async (updatedPerms: Permissions) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-super-admins", {
        body: {
          action: "update-permissions",
          userId: adminId,
          permissions: updatedPerms,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admins"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin-permissions", adminId] });
      onOpenChange(false);
      toast.success("Permessi aggiornati");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSave = () => {
    const finalPerms: Permissions = {
      ...perms,
      allowed_company_ids: allCompanies ? null : (perms.allowed_company_ids || []),
    };
    mutation.mutate(finalPerms);
  };

  const toggleCompany = (companyId: string) => {
    const current = perms.allowed_company_ids || [];
    const updated = current.includes(companyId)
      ? current.filter((id) => id !== companyId)
      : [...current, companyId];
    setPerms({ ...perms, allowed_company_ids: updated });
  };

  const isLoading = loadingPerms || loadingCompanies;

  const [companySearch, setCompanySearch] = useState("");
  const debouncedCompanySearch = useDebounce(companySearch, 300);

  const filteredCompanies = useMemo(() => {
    if (!debouncedCompanySearch.trim()) return companies;
    const q = debouncedCompanySearch.toLowerCase();
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, debouncedCompanySearch]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Permessi di {adminName}
          </DialogTitle>
          <DialogDescription>Configura cosa questo admin può fare e quali aziende può visualizzare.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="flex-1 -mx-6 px-6 overflow-y-auto" style={{ maxHeight: "60vh" }}>
            <div className="space-y-4 pb-6">
              <p className="text-sm font-medium text-muted-foreground">Azioni consentite</p>
              {permItems.map(({ key, icon: Icon, label, desc }) => (
                <div key={key} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-primary/10 p-2 mt-0.5"><Icon className="h-4 w-4 text-primary" /></div>
                    <div>
                      <Label className="text-sm font-medium">{label}</Label>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                  <Switch
                    checked={perms[key]}
                    onCheckedChange={(v) => setPerms({ ...perms, [key]: v })}
                  />
                </div>
              ))}

              <Separator className="my-4" />

              <p className="text-sm font-medium text-muted-foreground">Aziende visibili</p>
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2 mt-0.5"><Globe className="h-4 w-4 text-primary" /></div>
                  <div>
                    <Label className="text-sm font-medium">Tutte le aziende</Label>
                    <p className="text-xs text-muted-foreground">Accesso a tutte le aziende registrate</p>
                  </div>
                </div>
                <Switch checked={allCompanies} onCheckedChange={setAllCompanies} />
              </div>

              {!allCompanies && (
                <div className="rounded-lg border p-3 space-y-2">
                  {companies.length > 5 && (
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Cerca azienda..."
                        value={companySearch}
                        onChange={(e) => setCompanySearch(e.target.value)}
                        className="pl-9 h-8 text-sm"
                      />
                    </div>
                  )}
                  {filteredCompanies.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">Nessuna azienda trovata</p>
                  ) : (
                    <div className="max-h-[200px] overflow-y-auto space-y-0.5">
                      {filteredCompanies.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-muted/50 rounded px-2">
                          <Checkbox
                            checked={(perms.allowed_company_ids || []).includes(c.id)}
                            onCheckedChange={() => toggleCompany(c.id)}
                          />
                          <span className="text-sm">{c.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Annulla</Button>
          <Button onClick={handleSave} disabled={mutation.isPending || isLoading}>
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salva permessi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
