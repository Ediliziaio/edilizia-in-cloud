import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserCog, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { AppRole } from "@/types/auth";
import { useAuth } from "@/contexts/AuthContext";
import { saveQuickLoginSession } from "@/components/admin/QuickLoginReturnBanner";

const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  company_admin: "Admin Azienda",
  company_staff: "Staff",
  customer: "Cliente",
  employee: "Dipendente",
  salesperson: "Venditore",
  call_center: "Call Center",
  referrer: "Partner",
};

const ROLE_COLORS: Record<AppRole, string> = {
  super_admin: "bg-red-100 text-red-800",
  company_admin: "bg-blue-100 text-blue-800",
  company_staff: "bg-purple-100 text-purple-800",
  customer: "bg-green-100 text-green-800",
  employee: "bg-amber-100 text-amber-800",
  salesperson: "bg-cyan-100 text-cyan-800",
  call_center: "bg-indigo-100 text-indigo-800",
};

const ROLE_ORDER: AppRole[] = [
  "super_admin",
  "company_admin",
  "company_staff",
  "customer",
  "employee",
  "salesperson",
  "call_center",
];

const AVATAR_COLORS = [
  "bg-rose-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-violet-500", "bg-cyan-500", "bg-pink-500", "bg-teal-500",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const REDIRECT_MAP: Record<AppRole, string> = {
  super_admin: "/admin",
  company_admin: "/azienda",
  company_staff: "/azienda",
  call_center: "/azienda",
  customer: "/cliente",
  employee: "/dipendente",
  salesperson: "/venditore",
};

interface UserWithRole {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: AppRole;
  company_name: string | null;
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function QuickLoginPopover() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const { profile: currentProfile, refreshAuth } = useAuth();
  const debouncedSearch = useDebounce(search, 300);

  const { data: users = [] } = useQuery({
    queryKey: ["admin-all-users-for-login", debouncedSearch],
    queryFn: async () => {
      // Build profiles query with server-side filtering + limit
      let profilesQuery = supabase
        .from("profiles")
        .select("id, first_name, last_name, email, company_id")
        .order("first_name")
        .limit(50);

      if (debouncedSearch) {
        profilesQuery = profilesQuery.or(
          `first_name.ilike.%${debouncedSearch}%,last_name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%`
        );
      }

      const { data: profiles, error: profilesError } = await profilesQuery;
      if (profilesError) throw profilesError;

      const profileIds = profiles.map((p) => p.id);
      if (profileIds.length === 0) return [];

      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", profileIds);

      if (rolesError) throw rolesError;

      // Collect unique company_ids to fetch names
      const companyIds = [...new Set(profiles.map((p) => p.company_id).filter(Boolean))] as string[];
      let companyMap = new Map<string, string>();

      if (companyIds.length > 0) {
        const { data: companies, error: companiesError } = await supabase
          .from("companies")
          .select("id, name")
          .in("id", companyIds);
        if (companiesError) throw companiesError;
        companyMap = new Map(companies.map((c) => [c.id, c.name]));
      }

      const roleMap = new Map(roles.map((r) => [r.user_id, r.role as AppRole]));

      return profiles
        .filter((p) => roleMap.has(p.id))
        .map((p) => ({
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          email: p.email,
          role: roleMap.get(p.id)!,
          company_name: p.company_id ? companyMap.get(p.company_id) || null : null,
        })) as UserWithRole[];
    },
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const grouped = ROLE_ORDER.map((role) => ({
    role,
    label: ROLE_LABELS[role],
    users: users.filter((u) => u.role === role),
  })).filter((g) => g.users.length > 0);

  const handleSignInAs = async (user: UserWithRole) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("sign-in-as-user", {
        body: { email: user.email },
      });

      if (error) throw error;

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
      toast.success(`Accesso effettuato come ${user.first_name} ${user.last_name}`);

      const target = REDIRECT_MAP[user.role] || "/";
      navigate(target, { replace: true });
    } catch (err: any) {
      console.error("Sign in as user error:", err);
      toast.error(`Errore: ${err.message || "Impossibile accedere come utente"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <UserCog className="h-4 w-4" />
          <span className="hidden sm:inline">Accedi come utente</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end" sideOffset={8}>
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cerca per nome, email o azienda..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
              autoFocus
            />
          </div>
        </div>
        <Separator />
        <div className="max-h-[400px] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Accesso in corso...</span>
            </div>
          )}
          {!loading && grouped.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nessun utente trovato
            </p>
          )}
          {!loading &&
            grouped.map((group) => (
              <div key={group.role}>
                <div className="px-3 py-2">
                  <p className="text-[11px] font-semibold text-muted-foreground tracking-wider uppercase">
                    {group.label} ({group.users.length})
                  </p>
                </div>
                <div className="px-1 pb-1">
                  {group.users.map((user) => {
                    const fullName = `${user.first_name} ${user.last_name}`;
                    return (
                      <button
                        key={user.id}
                        onClick={() => handleSignInAs(user)}
                        disabled={loading}
                        className="w-full flex items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback
                            className={`${getAvatarColor(fullName)} text-white text-xs font-semibold`}
                          >
                            {user.first_name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{fullName}</span>
                            <Badge
                              variant="secondary"
                              className={`text-[10px] px-1.5 py-0 shrink-0 ${ROLE_COLORS[user.role]}`}
                            >
                              {ROLE_LABELS[user.role]}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                          {user.company_name && (
                            <p className="text-xs text-muted-foreground/70 truncate">
                              {user.company_name}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
