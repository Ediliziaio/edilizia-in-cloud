/**
 * Selettore azienda per il SUPER ADMIN nell'header admin (richiesta utente
 * 2026-07-18): "in alto un selettore per scegliere a quale azienda entrare".
 *
 * v2 (2026-07-18): usa lo STESSO meccanismo del flusso "Accedi" della lista
 * aziende e dello SuperAdminCompanySwitcher → `impersonateCompany()` +
 * relay dei token nell'hash URL verso il subdomain `app`. Prima usava
 * `sign-in-as-user` (sostituiva l'intera sessione con l'admin dell'azienda:
 * più pesante, niente switcher ⇅ dentro l'azienda, ritorno via "Quick Login").
 * Ora l'ingresso è una vera IMPERSONAZIONE: resti super_admin, dentro l'azienda
 * compare il ⇅ SuperAdminCompanySwitcher per saltare tra aziende e "Torna a
 * Admin" per uscire. Niente più doppio meccanismo.
 */
import { useState, useEffect } from "react";
import { navigateToSubdomain, getSubdomainUrl } from "@/utils/subdomainNav";
import { safeRedirect } from "@/utils/safeRedirect";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Search, Loader2, LogIn, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { logger } from "@/utils/logger";
import { useAuth, getCachedTokens } from "@/contexts/AuthContext";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";

interface CompanyRow {
  id: string;
  name: string;
  logo_url: string | null;
  sector: string | null;
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function CompanyQuickEnterPopover() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const { impersonateCompany, profile, role, company: adminCompany } = useAuth();
  const { permissions } = useSuperAdminPermissions();
  const debouncedSearch = useDebounce(search, 300);

  // Mostrato solo a chi può davvero impersonare (super_admin / platform con
  // permesso). Gli altri admin di piattaforma non vedono il selettore.
  const canImpersonate = !!permissions?.impersonation;

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["admin-company-quick-enter", debouncedSearch],
    queryFn: async () => {
      let q = supabase
        .from("companies")
        .select("id, name, logo_url, sector")
        .eq("is_platform_admin_company", false)
        .order("name")
        .limit(50);
      if (debouncedSearch) {
        const term = debouncedSearch.replace(/[%_]/g, " ").trim();
        if (term) q = q.ilike("name", `%${term}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      let list = (data ?? []) as CompanyRow[];
      // Rispetta il perimetro per admin di piattaforma con scope ristretto.
      if (permissions?.allowed_company_ids && permissions.allowed_company_ids.length > 0) {
        const allowed = new Set(permissions.allowed_company_ids);
        list = list.filter((c) => allowed.has(c.id));
      }
      return list;
    },
    staleTime: 5 * 60 * 1000,
    enabled: open && canImpersonate,
  });

  const handleEnter = async (company: CompanyRow) => {
    if (permissions?.allowed_company_ids?.length && !permissions.allowed_company_ids.includes(company.id)) {
      toast.error("Permesso negato", { description: "Questa azienda non rientra nel tuo perimetro." });
      return;
    }
    setLoadingId(company.id);
    try {
      // Stesso flusso canonico di CompaniesList.handleImpersonate: impersonation
      // token + relay (_at/_rt/_it/_ic/_pr) nell'hash → il subdomain app ricostruisce
      // sessione + impersonazione senza perdere il token (sessionStorage non
      // attraversa i subdomain).
      const impToken = await impersonateCompany(company.id, permissions ?? undefined);
      if (impToken) {
        const { accessToken, refreshToken } = getCachedTokens();
        if (accessToken && refreshToken) {
          let pr: string | undefined;
          if (profile && role) {
            try {
              const relay = JSON.stringify({ profile, role, company: adminCompany ?? null });
              pr = btoa(relay).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
            } catch {
              // serializzazione fallita → si procede senza relay (degradazione)
            }
          }
          const params = new URLSearchParams({
            _at: accessToken,
            _rt: refreshToken,
            _it: impToken,
            _ic: company.id,
            ...(pr ? { _pr: pr } : {}),
          });
          setOpen(false);
          setSearch("");
          // Ogni accesso all'app azienda atterra su Attività (regola fissa).
          safeRedirect(getSubdomainUrl(`/azienda/attivita#${params.toString()}`, "app"));
          return;
        }
      }
      // Fallback: nessun token in cache o impersonation non riuscita → naviga
      // comunque (AuthContext riproverà a ricostruire l'impersonazione).
      setOpen(false);
      setSearch("");
      navigateToSubdomain("/azienda/attivita", "app", (path) => navigate(path, { replace: true }));
    } catch (err) {
      logger.error("Enter company error:", err);
      toast.error("Impossibile entrare nell'azienda");
    } finally {
      setLoadingId(null);
    }
  };

  if (!canImpersonate) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 max-w-[200px]" aria-label="Entra in un'azienda">
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden truncate text-sm sm:inline">Entra in azienda</span>
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
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            Entri in impersonazione: dentro l'azienda puoi saltare ad un'altra col selettore ⇅ e uscire con "Torna a Admin".
          </p>
        </div>
        <Separator />
        <div className="max-h-[360px] overflow-y-auto p-1">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && companies.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Nessuna azienda trovata</p>
          )}
          {!isLoading &&
            companies.map((c) => (
              <button
                key={c.id}
                onClick={() => handleEnter(c)}
                disabled={loadingId !== null}
                className="w-full flex items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted transition-colors disabled:opacity-50"
              >
                <Avatar className="h-9 w-9 shrink-0 rounded-lg">
                  {c.logo_url && <AvatarImage src={c.logo_url} alt="" className="object-contain" />}
                  <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-xs font-semibold">
                    {(c.name || "?").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  {c.sector && <p className="text-xs text-muted-foreground truncate capitalize">{c.sector}</p>}
                </div>
                {loadingId === c.id ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <LogIn className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
