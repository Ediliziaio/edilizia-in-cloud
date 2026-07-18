/**
 * Selettore azienda per il SUPER ADMIN (richiesta utente 2026-07-18):
 * "in alto vorrei un selettore che mi permette di scegliere a quale azienda
 * entrare e vedere quello che loro vedono".
 *
 * Sceglie un'azienda → entra come il suo ADMIN (o l'utente più privilegiato
 * disponibile) riusando l'edge function GIÀ deployata `sign-in-as-user`:
 * niente nuova edge function, niente deploy. Il ritorno al super admin è
 * garantito dal QuickLoginReturnBanner (stessa sessione salvata dal popover
 * "Accedi come utente").
 *
 * Complementare a QuickLoginPopover: quello impersona un UTENTE preciso,
 * questo entra in un'AZIENDA (risolve l'admin per te).
 */
import { useState, useEffect } from "react";
import { navigateToSubdomain } from "@/utils/subdomainNav";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Search, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { logger } from "@/utils/logger";
import type { AppRole } from "@/types/auth";
import { useAuth } from "@/contexts/AuthContext";
import { saveQuickLoginSession } from "@/components/admin/QuickLoginReturnBanner";

interface CompanyRow {
  id: string;
  name: string;
  logo_url: string | null;
  sector: string | null;
}

// Ordine di priorità per scegliere "chi vede l'azienda": l'admin dà la vista
// completa; a scendere staff/venditore/call center; poi qualunque utente con
// un ruolo (così anche aziende senza admin restano visitabili).
const ROLE_PRIORITY: AppRole[] = ["company_admin", "company_staff", "salesperson", "call_center"];

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
  const { profile: currentProfile, refreshAuth } = useAuth();
  const debouncedSearch = useDebounce(search, 300);

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
        // % e _ sono wildcard ilike → sanitizza per non spezzare il match.
        const term = debouncedSearch.replace(/[%_]/g, " ").trim();
        if (term) q = q.ilike("name", `%${term}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CompanyRow[];
    },
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const handleEnter = async (company: CompanyRow) => {
    setLoadingId(company.id);
    try {
      // 1) Utenti dell'azienda + relativi ruoli (globali). Due query come nel
      //    QuickLoginPopover: la embed PostgREST con filtro su tabella figlia è
      //    più fragile della coppia profiles→user_roles per user_id IN (...).
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("id, email, first_name, last_name")
        .eq("company_id", company.id);
      if (pErr) throw pErr;
      if (!profs?.length) throw new Error("Nessun utente in questa azienda");

      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", profs.map((p) => p.id));
      if (rErr) throw rErr;

      const roleByUser = new Map<string, AppRole>(
        (roles ?? []).map((r) => [r.user_id, r.role as AppRole]),
      );
      const rank = (id: string) => {
        const idx = ROLE_PRIORITY.indexOf(roleByUser.get(id) as AppRole);
        return idx < 0 ? 99 : idx;
      };
      // Solo utenti con un ruolo assegnato + un'email valida.
      const candidates = profs.filter((p) => roleByUser.has(p.id) && !!p.email);
      if (!candidates.length) throw new Error("Nessun utente con accesso in questa azienda");
      candidates.sort((a, b) => rank(a.id) - rank(b.id));
      const target = candidates[0];

      // 2) Stesso flusso del QuickLoginPopover: magic link → verifyOtp.
      const { data, error } = await supabase.functions.invoke("sign-in-as-user", {
        body: { email: target.email },
      });
      if (error) throw error;

      // Salva la sessione admin corrente per il banner "torna al super admin".
      if (currentProfile?.email) {
        const adminName = `${currentProfile.first_name || ""} ${currentProfile.last_name || ""}`.trim();
        saveQuickLoginSession(currentProfile.email, adminName || currentProfile.email);
      }

      const { error: otpError } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: data.hashed_token,
      });
      if (otpError) throw otpError;

      await refreshAuth();
      setOpen(false);
      setSearch("");
      toast.success(`Sei entrato in ${company.name}`);

      // Le aziende vivono sul subdomain "app": stesso target del QuickLogin.
      navigateToSubdomain("/azienda", "app", (path) => navigate(path, { replace: true }));
    } catch (err: any) {
      logger.error("Enter company error:", err);
      toast.error(`Errore: ${err.message || "Impossibile entrare nell'azienda"}`);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" aria-label="Entra in un'azienda">
          <Building2 className="h-4 w-4" />
          <span className="hidden sm:inline">Entra in azienda</span>
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
            Entri come admin dell'azienda per vederne la vista. Un banner in alto ti riporta al super admin.
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
