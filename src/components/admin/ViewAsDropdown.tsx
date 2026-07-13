/**
 * ViewAsDropdown — "Visualizza come" nell'header di CompanyLayout.
 *
 * Visibile SOLO quando isImpersonating === true AND role === 'super_admin'.
 *
 * UX (v3, GHL-style):
 *  - Popover con barra di ricerca in testa + lista scorrevole (max 400px)
 *  - Ruoli raggruppati con header sticky e contatore
 *  - Avatar/iniziali colorati stabili per utente
 *  - Click utente → setViewAsRole(role, userId) o apertura portale in nuova tab
 *  - Customer escluso di default (sono spesso migliaia, hanno portale dedicato)
 *
 * Ruoli gestiti:
 *  - IN-APP (stessa UI /azienda): company_admin, company_staff, call_center
 *  - PORTAL (nuova tab):           employee+subcontractor -> lavori.campo,
 *                                  salesperson           -> app.venditore
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Eye, EyeOff, ExternalLink, LogOut, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/types/auth";

// ─── Tipi ────────────────────────────────────────────────

interface UserWithRole {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: AppRole;
}

// ─── Costanti ────────────────────────────────────────────

const ROLE_LABELS: Partial<Record<AppRole, string>> = {
  company_admin: "Company Admin",
  company_staff: "Staff",
  call_center:   "Call Center",
  salesperson:   "Venditore",
  employee:      "Operaio",
  subcontractor: "Subappaltatore",
};

// Ordine di visualizzazione dei gruppi (sopra i più rilevanti per l'admin)
const ROLE_ORDER: AppRole[] = [
  "company_admin",
  "company_staff",
  "call_center",
  "salesperson",
  "employee",
  "subcontractor",
];

// Ruoli simulabili nella stessa UI /azienda
const IN_APP_ROLES: AppRole[] = ["company_admin", "company_staff", "call_center"];
// Ruoli che aprono un portale separato (subdomain diverso)
const PORTAL_ROLES: AppRole[] = ["employee", "subcontractor", "salesperson"];
const ALLOWED_ROLES = new Set<AppRole>([...IN_APP_ROLES, ...PORTAL_ROLES]);

// ─── Helpers ─────────────────────────────────────────────

const AVATAR_PALETTE = [
  "bg-rose-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-violet-500", "bg-cyan-500", "bg-pink-500", "bg-teal-500",
  "bg-indigo-500", "bg-orange-500",
];

function stableColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = key.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

function initialsOf(u: UserWithRole): string {
  const fn = (u.first_name ?? "").trim();
  const ln = (u.last_name ?? "").trim();
  if (fn && ln) return (fn[0] + ln[0]).toUpperCase();
  if (fn) return fn.slice(0, 2).toUpperCase();
  if (u.email) return u.email.slice(0, 2).toUpperCase();
  return u.id.slice(0, 2).toUpperCase();
}

function fullName(u: UserWithRole): string {
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || u.id.slice(0, 8);
}

function UserAvatar({ user }: { user: UserWithRole }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center h-7 w-7 rounded-full text-white text-[11px] font-semibold shrink-0 uppercase select-none",
        stableColor(user.id)
      )}
    >
      {initialsOf(user)}
    </span>
  );
}

// ─── Componente principale ───────────────────────────────

export function ViewAsDropdown() {
  const {
    isImpersonating, role, effectiveCompany,
    viewAsRole, viewAsUserId, setViewAsRole,
  } = useAuth();
  const [open, setOpen] = useState(false);
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);

  // NB: TUTTI gli hooks (useQuery, useMemo, ...) devono essere chiamati PRIMA
  // di qualsiasi early return per rispettare le Rules of Hooks. Il guard per
  // il ruolo viene applicato sul `enabled` della query e sul return finale.
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["view-as-users", effectiveCompany?.id],
    queryFn: async (): Promise<UserWithRole[]> => {
      if (!effectiveCompany?.id) return [];

      // Due query separate: non esiste una FK diretta tra profiles.id e
      // user_roles.user_id (entrambe referenziano auth.users), quindi l'embed
      // PostgREST fallirebbe silenziosamente.
      const { data: profiles, error: profilesErr } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("company_id", effectiveCompany.id)
        .limit(1000);
      if (profilesErr) throw new Error(profilesErr.message);
      if (!profiles || profiles.length === 0) return [];

      const ids = profiles.map((p) => p.id);
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", ids);
      if (rolesErr) throw new Error(rolesErr.message);

      const profileById = new Map(profiles.map((p) => [p.id, p]));

      return (roles ?? [])
        .map((r): UserWithRole | null => {
          const p = profileById.get(r.user_id);
          const appRole = r.role as AppRole;
          if (!p || !ALLOWED_ROLES.has(appRole)) return null;
          return {
            id: p.id,
            first_name: p.first_name,
            last_name: p.last_name,
            email: p.email,
            role: appRole,
          };
        })
        .filter((u): u is UserWithRole => u !== null);
    },
    enabled: isImpersonating && role === "super_admin" && !!effectiveCompany?.id,
    staleTime: 60_000,
  });

  // Raggruppa per ruolo rispettando ROLE_ORDER
  const groupedUsers = useMemo(() => {
    const groups = new Map<AppRole, UserWithRole[]>();
    for (const u of users) {
      const arr = groups.get(u.role) ?? [];
      arr.push(u);
      groups.set(u.role, arr);
    }
    // Sort within each group by name
    for (const arr of groups.values()) {
      arr.sort((a, b) => fullName(a).localeCompare(fullName(b), "it"));
    }
    return ROLE_ORDER
      .filter((r) => groups.has(r))
      .map((r) => ({ role: r, users: groups.get(r)! }));
  }, [users]);

  // Guard: UI visibile solo per super_admin in impersonation.
  if (!isImpersonating || role !== "super_admin") return null;

  // ── Attiva view-as nel pannello ──────────────────────
  const handleInAppSwitch = (u: UserWithRole) => {
    setViewAsRole(u.role, u.id);
    setOpen(false);
  };

  // ── Apri portale separato con token monouso ───────────
  const handlePortalSwitch = async (u: UserWithRole) => {
    setLoadingUserId(u.id);
    try {
      const { data, error } = await supabase.functions.invoke("generate-preview-token", {
        body: {
          targetUserId: u.id,
          targetRole: u.role,
          companyId: effectiveCompany?.id,
        },
      });
      if (error || !(data as { token?: string })?.token) {
        toast.error("Errore generazione token preview");
        return;
      }
      const token = (data as { token: string }).token;

      const ROUTE_MAP: Partial<Record<AppRole, { subdomain: string; basePath: string }>> = {
        employee:      { subdomain: "lavori", basePath: "/campo" },
        subcontractor: { subdomain: "lavori", basePath: "/campo" },
        salesperson:   { subdomain: "app",    basePath: "/azienda" },
      };
      const route = ROUTE_MAP[u.role];
      if (!route) {
        toast.error("Ruolo non supportato per la preview");
        return;
      }

      const MULTI_LEVEL_TLDS = ["co.uk","com.br","co.nz","co.za","com.au","net.au","org.uk","me.uk"];
      const parts = window.location.hostname.split(".");
      const twoLastParts = parts.slice(-2).join(".");
      const rootDomain = MULTI_LEVEL_TLDS.includes(twoLastParts) && parts.length >= 3
        ? parts.slice(-3).join(".")
        : twoLastParts;

      const url = window.location.hostname.includes("localhost")
        ? `${route.basePath}?preview_token=${token}`
        : `https://${route.subdomain}.${rootDomain}${route.basePath}?preview_token=${token}`;

      window.open(url, "_blank");
      setOpen(false);
    } catch {
      toast.error("Errore apertura portale preview");
    } finally {
      setLoadingUserId(null);
    }
  };

  const isActive = viewAsRole !== null;
  const activeLabel = viewAsRole ? (ROLE_LABELS[viewAsRole] ?? viewAsRole) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={isActive ? "default" : "outline"}
          size="sm"
          className={cn(
            "hidden md:flex gap-1.5",
            isActive && "bg-amber-500 hover:bg-amber-600 border-amber-600 text-white"
          )}
          title="Visualizza il pannello come un utente specifico"
        >
          {isActive ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
          {isActive ? activeLabel : "Visualizza come"}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[320px] p-0" sideOffset={8}>
        <Command shouldFilter={true}>
          <CommandInput placeholder="Cerca utente per nome o email…" />
          <CommandList className="max-h-[400px]">
            {isLoading ? (
              <div className="px-3 py-6 text-xs text-muted-foreground text-center flex items-center justify-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Caricamento utenti…
              </div>
            ) : groupedUsers.length === 0 ? (
              <CommandEmpty>
                <div className="px-3 py-6 text-xs text-muted-foreground text-center">
                  Nessun utente interno in questa azienda
                </div>
              </CommandEmpty>
            ) : (
              <>
                <CommandEmpty>Nessun risultato</CommandEmpty>
                {groupedUsers.map((group, groupIdx) => {
                  const isPortal = PORTAL_ROLES.includes(group.role);
                  return (
                    <div key={group.role}>
                      {groupIdx > 0 && <CommandSeparator />}
                      <CommandGroup
                        heading={
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              {ROLE_LABELS[group.role] ?? group.role}
                              {isPortal && (
                                <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                              )}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-normal">
                              {group.users.length}
                            </span>
                          </div>
                        }
                      >
                        {group.users.map((u) => {
                          const isCurrent = viewAsUserId === u.id;
                          const isLoadingThis = loadingUserId === u.id;
                          // cmdk usa `value` sia per unicità sia per filtro: se ci mettessimo
                          // l'UUID, la ricerca fuzzy produrrebbe falsi positivi (i caratteri
                          // dell'UUID "matchano" parole reali). Quindi: value = testo pulito,
                          // uniqueness garantita dal suffisso -id. keywords aggiunge l'email.
                          const nameValue = fullName(u);
                          return (
                            <CommandItem
                              key={u.id}
                              value={`${nameValue}__${u.id.slice(0, 8)}`}
                              keywords={u.email ? [u.email] : undefined}
                              onSelect={() => {
                                if (isLoadingThis) return;
                                if (isPortal) void handlePortalSwitch(u);
                                else handleInAppSwitch(u);
                              }}
                              className={cn(
                                "gap-2 cursor-pointer",
                                isCurrent && "bg-amber-50 aria-selected:bg-amber-100"
                              )}
                            >
                              <UserAvatar user={u} />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">
                                  {fullName(u)}
                                </div>
                                {u.email && (
                                  <div className="text-[11px] text-muted-foreground truncate">
                                    {u.email}
                                  </div>
                                )}
                              </div>
                              {isCurrent ? (
                                <Check className="h-4 w-4 text-amber-600 shrink-0" />
                              ) : isPortal ? (
                                <Badge variant="outline" className="text-[10px] shrink-0 h-5 gap-1 px-1.5">
                                  {isLoadingThis ? (
                                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                  ) : (
                                    <ExternalLink className="h-2.5 w-2.5" />
                                  )}
                                  Tab
                                </Badge>
                              ) : null}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </div>
                  );
                })}
              </>
            )}

            {isActive && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value="__exit_preview__"
                    onSelect={() => {
                      setViewAsRole(null);
                      setOpen(false);
                    }}
                    className="gap-2 cursor-pointer text-amber-700 aria-selected:bg-amber-50 aria-selected:text-amber-800"
                  >
                    <LogOut className="h-4 w-4" />
                    Torna come super admin
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
