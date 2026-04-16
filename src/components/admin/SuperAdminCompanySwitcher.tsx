/**
 * SuperAdminCompanySwitcher — selettore veloce azienda in stile GHL.
 *
 * Visibile solo durante l'impersonazione di un super_admin nel CompanyLayout.
 * Permette di passare da un'azienda all'altra senza tornare al pannello admin:
 * - Click sul trigger → popover con ricerca
 * - Click su azienda → `impersonateCompany(newId)` sostituisce il token
 *   secure e ricarica automaticamente effectiveCompany via fetchImpersonatedCompany.
 * - `queryClient.clear()` dentro `impersonateCompany` pulisce tutti i dati
 *   della vecchia azienda.
 *
 * Rispetta `allowed_company_ids` per admin di piattaforma con scope ristretto.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { queryKeys } from "@/lib/queryKeys";
import { ADMIN_PLATFORM_ROLES } from "@/types/auth";
import { Building2, Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function avatarColor(name: string) {
  const palette = [
    "bg-rose-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
    "bg-violet-500", "bg-cyan-500", "bg-pink-500", "bg-teal-500",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

export function SuperAdminCompanySwitcher() {
  const { role, isImpersonating, impersonatedCompany, impersonateCompany } = useAuth();
  const { permissions } = useSuperAdminPermissions();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [switching, setSwitching] = useState(false);
  const debouncedSearch = useDebounce(search, 250);

  const canSwitchCompanies =
    !!role &&
    (role === "super_admin" || ADMIN_PLATFORM_ROLES.includes(role)) &&
    isImpersonating &&
    permissions.can_manage_companies;

  const { data: companies = [], isLoading } = useQuery({
    queryKey: queryKeys.admin.superAdminSwitcher(debouncedSearch),
    queryFn: async () => {
      let q = supabase
        .from("companies")
        .select("id, name, logo_url, status")
        .order("name", { ascending: true })
        .limit(50);
      if (debouncedSearch.trim()) {
        q = q.ilike("name", `%${debouncedSearch.trim()}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      let list = (data ?? []) as Array<{ id: string; name: string; logo_url: string | null; status: string | null }>;
      if (permissions.allowed_company_ids && permissions.allowed_company_ids.length > 0) {
        const allowed = new Set(permissions.allowed_company_ids);
        list = list.filter((c) => allowed.has(c.id));
      }
      return list;
    },
    enabled: open && canSwitchCompanies,
    staleTime: 60 * 1000,
  });

  if (!canSwitchCompanies) return null;

  const handleSwitch = async (newCompanyId: string) => {
    if (newCompanyId === impersonatedCompany?.id) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      const token = await impersonateCompany(newCompanyId, permissions);
      if (!token) {
        toast.error("Impossibile cambiare azienda");
        return;
      }
      setOpen(false);
      setSearch("");
      toast.success("Azienda cambiata");
    } finally {
      setSwitching(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 max-w-[220px]"
          aria-label="Cambia azienda"
          disabled={switching}
        >
          {switching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          ) : (
            <Building2 className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate text-sm">
            {impersonatedCompany?.name ?? "Seleziona azienda"}
          </span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end" sideOffset={8}>
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cerca azienda..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
              autoFocus
            />
          </div>
        </div>
        <Separator />
        <ScrollArea className="max-h-[320px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : companies.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nessuna azienda trovata
            </p>
          ) : (
            <div className="px-1 py-1">
              {companies.map((c) => {
                const isCurrent = c.id === impersonatedCompany?.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => handleSwitch(c.id)}
                    disabled={switching}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors",
                      "hover:bg-muted disabled:opacity-50",
                      isCurrent && "bg-primary/10"
                    )}
                  >
                    <Avatar className="h-7 w-7 shrink-0">
                      {c.logo_url ? <AvatarImage src={c.logo_url} alt={c.name} /> : null}
                      <AvatarFallback className={`${avatarColor(c.name)} text-white text-[10px] font-semibold`}>
                        {c.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className={cn("flex-1 truncate", isCurrent && "font-semibold")}>
                      {c.name}
                    </span>
                    {isCurrent && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
