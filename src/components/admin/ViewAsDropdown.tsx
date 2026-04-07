/**
 * Dropdown "Visualizza come" nell'header di CompanyLayout.
 * Visibile SOLO quando isImpersonating === true AND role === 'super_admin'.
 *
 * Approccio A (in-app): company_admin / company_staff → chiama setViewAsRole()
 * Approccio B (nuova tab): employee / subcontractor / customer → genera token
 *   preview e apre il portale corrispondente (clienti.* o lavori.*)
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Eye, EyeOff, ExternalLink, LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
  company_admin:  "Company Admin",
  company_staff:  "Staff",
  employee:       "Dipendente",
  subcontractor:  "Subappaltatore",
  customer:       "Cliente",
};

// Ruoli simulabili nel pannello (non cambiano tab)
const IN_APP_ROLES: AppRole[] = ["company_admin", "company_staff"];
// Ruoli che richiedono apertura portale in nuova tab
const PORTAL_ROLES: AppRole[] = ["employee", "subcontractor", "customer"];

const MAX_PER_ROLE = 5;

// ─── Helpers ─────────────────────────────────────────────

function UserInitials({ name }: { name: string }) {
  const parts = name.trim().split(" ").filter(Boolean);
  const initials =
    parts.length >= 2
      ? (parts[0][0] ?? "") + (parts[1][0] ?? "")
      : (parts[0]?.slice(0, 2) ?? "?");
  return (
    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-muted text-xs font-semibold shrink-0 uppercase select-none">
      {initials}
    </span>
  );
}

function fullName(u: UserWithRole): string {
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || u.id.slice(0, 8);
}

// ─── Componente principale ───────────────────────────────

export function ViewAsDropdown() {
  const { isImpersonating, role, effectiveCompany, viewAsRole, setViewAsRole } = useAuth();
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);

  // Doppio check sicurezza: solo super_admin durante impersonazione
  if (!isImpersonating || role !== "super_admin") return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["view-as-users", effectiveCompany?.id],
    queryFn: async (): Promise<UserWithRole[]> => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, user_roles!inner(role)")
        .eq("company_id", effectiveCompany.id)
        .limit(200);
      if (error) throw new Error(error.message);

      return ((data ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        user_roles: Array<{ role: string }>;
      }>).flatMap((p) =>
        p.user_roles.map((r) => ({
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          email: p.email,
          role: r.role as AppRole,
        }))
      ).filter((u) =>
        IN_APP_ROLES.includes(u.role) || PORTAL_ROLES.includes(u.role)
      );
    },
    enabled: isImpersonating && role === "super_admin" && !!effectiveCompany?.id,
    staleTime: 60_000,
  });

  const inAppUsers = users.filter((u) => IN_APP_ROLES.includes(u.role));
  const portalUsers = users.filter((u) => PORTAL_ROLES.includes(u.role));

  // ── Apri portale separato con token monouso ───────────
  const openPreviewPortal = async (targetUser: UserWithRole) => {
    setLoadingUserId(targetUser.id);
    try {
      const { data, error } = await supabase.functions.invoke("generate-preview-token", {
        body: {
          targetUserId: targetUser.id,
          targetRole: targetUser.role,
          companyId: effectiveCompany?.id,
        },
      });
      if (error || !(data as { token?: string })?.token) {
        toast.error("Errore generazione token preview");
        return;
      }
      const token = (data as { token: string }).token;
      const subdomain = targetUser.role === "customer" ? "clienti" : "lavori";
      const basePath = targetUser.role === "customer" ? "/cliente" : "/campo";
      // Gestisce TLD multi-livello (es. .co.uk, .com.br, .com.au)
      const MULTI_LEVEL_TLDS = ["co.uk","com.br","co.nz","co.za","com.au","net.au","org.uk","me.uk"];
      const parts = window.location.hostname.split(".");
      const twoLastParts = parts.slice(-2).join(".");
      const rootDomain = MULTI_LEVEL_TLDS.includes(twoLastParts) && parts.length >= 3
        ? parts.slice(-3).join(".")
        : twoLastParts;
      const url = window.location.hostname.includes("localhost")
        ? `${basePath}?preview_token=${token}`
        : `https://${subdomain}.${rootDomain}${basePath}?preview_token=${token}`;
      window.open(url, "_blank");
    } catch {
      toast.error("Errore apertura portale preview");
    } finally {
      setLoadingUserId(null);
    }
  };

  // ── Raggruppa utenti per ruolo con max N visibili ─────
  type Extra = { __extra: true; role: string; count: number };
  function groupWithLimit(list: UserWithRole[]): Array<UserWithRole | Extra> {
    const grouped = new Map<string, UserWithRole[]>();
    for (const u of list) {
      const arr = grouped.get(u.role) ?? [];
      arr.push(u);
      grouped.set(u.role, arr);
    }
    const result: Array<UserWithRole | Extra> = [];
    grouped.forEach((roleUsers, r) => {
      result.push(...roleUsers.slice(0, MAX_PER_ROLE));
      const extra = roleUsers.length - MAX_PER_ROLE;
      if (extra > 0) result.push({ __extra: true, role: r, count: extra });
    });
    return result;
  }

  const isActive = viewAsRole !== null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={isActive ? "default" : "outline"}
          size="sm"
          className={`hidden md:flex gap-1.5 ${
            isActive
              ? "bg-amber-500 hover:bg-amber-600 border-amber-600 text-white"
              : ""
          }`}
          title="Visualizza il pannello come un ruolo specifico"
        >
          {isActive ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
          {isActive ? (ROLE_LABELS[viewAsRole!] ?? viewAsRole) : "Visualizza come"}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal pb-1">
          Seleziona utente da simulare
        </DropdownMenuLabel>

        {isLoading ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center flex items-center justify-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Caricamento utenti...
          </div>
        ) : (
          <>
            {/* ── Vista nel pannello (in-app) ─── */}
            {inAppUsers.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider py-1">
                  Vista nel pannello
                </DropdownMenuLabel>
                {groupWithLimit(inAppUsers).map((item, idx) => {
                  if ("__extra" in item) {
                    return (
                      <DropdownMenuItem key={`extra-in-${idx}`} disabled className="text-xs text-muted-foreground">
                        +{item.count} altri {ROLE_LABELS[item.role as AppRole] ?? item.role}
                      </DropdownMenuItem>
                    );
                  }
                  const u = item as UserWithRole;
                  return (
                    <DropdownMenuItem
                      key={`${u.id}-${u.role}`}
                      className="gap-2 cursor-pointer"
                      onClick={() => setViewAsRole(u.role, u.id)}
                    >
                      <UserInitials name={fullName(u)} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium truncate">{fullName(u)}</span>
                      </span>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {ROLE_LABELS[u.role] ?? u.role}
                      </Badge>
                    </DropdownMenuItem>
                  );
                })}
              </>
            )}

            {/* ── Portali separati (nuova tab) ── */}
            {portalUsers.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider py-1 flex items-center gap-1.5">
                  Portali separati
                  <ExternalLink className="h-2.5 w-2.5" />
                </DropdownMenuLabel>
                {groupWithLimit(portalUsers).map((item, idx) => {
                  if ("__extra" in item) {
                    return (
                      <DropdownMenuItem key={`extra-portal-${idx}`} disabled className="text-xs text-muted-foreground">
                        +{item.count} altri
                      </DropdownMenuItem>
                    );
                  }
                  const u = item as UserWithRole;
                  const isThisLoading = loadingUserId === u.id;
                  return (
                    <DropdownMenuItem
                      key={`${u.id}-${u.role}`}
                      className="gap-2 cursor-pointer"
                      onClick={() => void openPreviewPortal(u)}
                      disabled={isThisLoading}
                    >
                      <UserInitials name={fullName(u)} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium truncate">{fullName(u)}</span>
                      </span>
                      <Badge variant="outline" className="text-[10px] shrink-0 flex items-center gap-1">
                        {isThisLoading ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        ) : (
                          <ExternalLink className="h-2.5 w-2.5" />
                        )}
                        {ROLE_LABELS[u.role] ?? u.role}
                      </Badge>
                    </DropdownMenuItem>
                  );
                })}
              </>
            )}

            {inAppUsers.length === 0 && portalUsers.length === 0 && (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                Nessun utente trovato nella company
              </div>
            )}
          </>
        )}

        {/* ── Esci dalla preview ───────────── */}
        {isActive && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 cursor-pointer text-amber-700 focus:text-amber-800 focus:bg-amber-50"
              onClick={() => setViewAsRole(null)}
            >
              <LogOut className="h-4 w-4" />
              Esci dalla modalità preview
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
