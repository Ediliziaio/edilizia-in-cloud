import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, CreditCard, HeadphonesIcon, Users, ShieldCheck, BarChart3, Loader2, Globe, Search, Megaphone } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "sonner";
import { SUPER_ADMIN_PERMISSION_LABELS } from "@/lib/adminConstants";
import {
  PLATFORM_ROLES,
  PLATFORM_ROLE_LABELS,
  PLATFORM_ROLE_PRESETS,
  type PlatformRole,
} from "@/types/auth";

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

const PERM_KEYS: (keyof Omit<Permissions, "allowed_company_ids">)[] = [
  "can_manage_companies",
  "can_manage_plans",
  "can_manage_tickets",
  "can_manage_referrals",
  "can_manage_admins",
  "can_view_platform_stats",
  "can_manage_marketing",
];

const permItems: { key: keyof Omit<Permissions, "allowed_company_ids">; icon: typeof Building2; label: string; desc: string }[] = [
  { key: "can_manage_companies", icon: Building2, label: SUPER_ADMIN_PERMISSION_LABELS.can_manage_companies, desc: "Creare, modificare, eliminare aziende" },
  { key: "can_manage_plans", icon: CreditCard, label: SUPER_ADMIN_PERMISSION_LABELS.can_manage_plans, desc: "Gestire piani di abbonamento" },
  { key: "can_manage_tickets", icon: HeadphonesIcon, label: SUPER_ADMIN_PERMISSION_LABELS.can_manage_tickets, desc: "Gestire ticket di supporto" },
  { key: "can_manage_referrals", icon: Users, label: SUPER_ADMIN_PERMISSION_LABELS.can_manage_referrals, desc: "Gestire programma referral" },
  { key: "can_manage_admins", icon: ShieldCheck, label: SUPER_ADMIN_PERMISSION_LABELS.can_manage_admins, desc: "Creare ed eliminare altri admin" },
  { key: "can_view_platform_stats", icon: BarChart3, label: SUPER_ADMIN_PERMISSION_LABELS.can_view_platform_stats, desc: "Visualizzare statistiche globali" },
  { key: "can_manage_marketing", icon: Megaphone, label: SUPER_ADMIN_PERMISSION_LABELS.can_manage_marketing, desc: "Gestire CRM e marketing della piattaforma" },
];

/** Detect which preset matches the current permissions, or "custom" */
function detectRole(perms: Permissions): PlatformRole | "custom" {
  for (const role of PLATFORM_ROLES) {
    const preset = PLATFORM_ROLE_PRESETS[role];
    const matches = PERM_KEYS.every((k) => perms[k] === (preset[k] ?? false));
    if (matches) return role;
  }
  return "custom";
}

export default function PlatformPermissionsDialog({ open, onOpenChange, adminId, adminName }: Props) {
  const queryClient = useQueryClient();
  const [perms, setPerms] = useState<Permissions>({
    can_manage_companies: false,
    can_manage_plans: false,
    can_manage_tickets: false,
    can_manage_referrals: false,
    can_manage_admins: false,
    can_view_platform_stats: false,
    can_manage_marketing: false,
    allowed_company_ids: null,
  });
  const [allCompanies, setAllCompanies] = useState(true);
  const [selectedRole, setSelectedRole] = useState<PlatformRole | "custom">("custom");

  const { data: currentPerms, isLoading: loadingPerms } = useQuery({
    queryKey: queryKeys.admin.superAdminPermissions(adminId),
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "get-permissions", userId: adminId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) {
        const body = await res.error.context?.json?.();
        throw new Error(body?.error || res.error.message);
      }
      return res.data?.permissions as Permissions | null;
    },
    enabled: open && !!adminId,
  });

  const { data: companies = [], isLoading: loadingCompanies } = useQuery({
    queryKey: queryKeys.admin.allCompaniesList,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  useEffect(() => {
    if (currentPerms) {
      const p: Permissions = {
        can_manage_companies: currentPerms.can_manage_companies,
        can_manage_plans: currentPerms.can_manage_plans,
        can_manage_tickets: currentPerms.can_manage_tickets,
        can_manage_referrals: currentPerms.can_manage_referrals,
        can_manage_admins: currentPerms.can_manage_admins,
        can_view_platform_stats: currentPerms.can_view_platform_stats,
        can_manage_marketing: currentPerms.can_manage_marketing,
        allowed_company_ids: currentPerms.allowed_company_ids,
      };
      setPerms(p);
      setAllCompanies(currentPerms.allowed_company_ids === null);
      setSelectedRole(detectRole(p));
    }
  }, [currentPerms, open]);

  const handleRoleChange = (role: PlatformRole | "custom") => {
    setSelectedRole(role);
    if (role !== "custom") {
      const preset = PLATFORM_ROLE_PRESETS[role];
      setPerms((prev) => ({
        ...prev,
        ...Object.fromEntries(PERM_KEYS.map((k) => [k, preset[k] ?? false])),
      }));
      toast.info(`Permessi impostati come "${PLATFORM_ROLE_LABELS[role]}"`);
    }
  };

  const handlePermToggle = (key: keyof Omit<Permissions, "allowed_company_ids">, value: boolean) => {
    const updated = { ...perms, [key]: value };
    setPerms(updated);
    setSelectedRole(detectRole(updated));
  };

  const mutation = useMutation({
    mutationFn: async (payload: { role: string; permissions: Permissions }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-platform-users", {
        body: {
          action: "update-permissions",
          userId: adminId,
          platformRole: payload.role !== "custom" ? payload.role : undefined,
          permissions: payload.permissions,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.superAdmins });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.superAdminPermissions(adminId) });
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
    mutation.mutate({ role: selectedRole, permissions: finalPerms });
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
          <DialogDescription>Seleziona un ruolo predefinito o personalizza i permessi.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="flex-1 -mx-6 px-6 overflow-y-auto" style={{ maxHeight: "60vh" }}>
            <div className="space-y-4 pb-6">
              {/* Role Select */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Ruolo piattaforma</Label>
                <Select value={selectedRole} onValueChange={(v) => handleRoleChange(v as PlatformRole | "custom")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona ruolo" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{PLATFORM_ROLE_LABELS[r]}</SelectItem>
                    ))}
                    <SelectItem value="custom">Personalizzato</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

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
                    onCheckedChange={(v) => handlePermToggle(key, v)}
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
