import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Check, ChevronsUpDown, Clock3, Search, Star } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getCompanyAccessRoleLabel } from "@/lib/auth/multiCompany";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function getCompanyInitials(name?: string | null) {
  const words = (name ?? "Azienda").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "AZ";
}

const COMPANY_SWITCHER_PREFS_KEY = "multi_company_switcher_preferences_v1";
const MAX_RECENT_COMPANIES = 5;

type CompanySwitcherPreferences = {
  favoriteCompanyIds: string[];
  recentCompanyIds: string[];
};

function uniqueKnownCompanyIds(ids: unknown, knownIds: Set<string>) {
  if (!Array.isArray(ids)) return [];
  const unique: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || !knownIds.has(id) || unique.includes(id)) continue;
    unique.push(id);
  }
  return unique;
}

function readCompanySwitcherPreferences(userId: string | null | undefined, knownIds: Set<string>): CompanySwitcherPreferences {
  if (!userId) return { favoriteCompanyIds: [], recentCompanyIds: [] };

  try {
    const raw = localStorage.getItem(`${COMPANY_SWITCHER_PREFS_KEY}:${userId}`);
    if (!raw) return { favoriteCompanyIds: [], recentCompanyIds: [] };
    const parsed = JSON.parse(raw);
    return {
      favoriteCompanyIds: uniqueKnownCompanyIds(parsed.favoriteCompanyIds, knownIds),
      recentCompanyIds: uniqueKnownCompanyIds(parsed.recentCompanyIds, knownIds).slice(0, MAX_RECENT_COMPANIES),
    };
  } catch {
    return { favoriteCompanyIds: [], recentCompanyIds: [] };
  }
}

function writeCompanySwitcherPreferences(userId: string | null | undefined, preferences: CompanySwitcherPreferences) {
  if (!userId) return;

  try {
    localStorage.setItem(
      `${COMPANY_SWITCHER_PREFS_KEY}:${userId}`,
      JSON.stringify({
        favoriteCompanyIds: preferences.favoriteCompanyIds,
        recentCompanyIds: preferences.recentCompanyIds.slice(0, MAX_RECENT_COMPANIES),
      }),
    );
  } catch {
    // localStorage non disponibile: lo switch resta funzionante senza preferenze.
  }
}

type CompanyContextSwitcherProps = {
  isCollapsed?: boolean;
  className?: string;
  showSecurityNote?: boolean;
};

export const CompanyContextSwitcher = memo(function CompanyContextSwitcher({
  isCollapsed = false,
  className,
  showSecurityNote = true,
}: CompanyContextSwitcherProps) {
  const { user, effectiveCompany, multiCompanyAccesses, selectedMultiCompanyId, switchMultiCompany } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [favoriteCompanyIds, setFavoriteCompanyIds] = useState<string[]>([]);
  const [recentCompanyIds, setRecentCompanyIds] = useState<string[]>([]);

  const hasMultipleCompanies = multiCompanyAccesses.length > 1;
  const activeCompanyName = effectiveCompany?.name ?? "Azienda";
  const activeAccess = multiCompanyAccesses.find((access) => access.company_id === selectedMultiCompanyId);
  const activeRoleLabel = getCompanyAccessRoleLabel(activeAccess?.access_role);
  const knownCompanyIds = useMemo(
    () => new Set(multiCompanyAccesses.map((access) => access.company_id)),
    [multiCompanyAccesses],
  );

  useEffect(() => {
    const preferences = readCompanySwitcherPreferences(user?.id, knownCompanyIds);
    setFavoriteCompanyIds(preferences.favoriteCompanyIds);
    setRecentCompanyIds(preferences.recentCompanyIds);
  }, [knownCompanyIds, user?.id]);

  const persistPreferences = useCallback((next: CompanySwitcherPreferences) => {
    const sanitized = {
      favoriteCompanyIds: uniqueKnownCompanyIds(next.favoriteCompanyIds, knownCompanyIds),
      recentCompanyIds: uniqueKnownCompanyIds(next.recentCompanyIds, knownCompanyIds).slice(0, MAX_RECENT_COMPANIES),
    };
    setFavoriteCompanyIds(sanitized.favoriteCompanyIds);
    setRecentCompanyIds(sanitized.recentCompanyIds);
    writeCompanySwitcherPreferences(user?.id, sanitized);
  }, [knownCompanyIds, user?.id]);

  const favoriteCompanySet = useMemo(() => new Set(favoriteCompanyIds), [favoriteCompanyIds]);
  const recentCompanySet = useMemo(() => new Set(recentCompanyIds), [recentCompanyIds]);

  const filteredAccesses = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return multiCompanyAccesses;
    return multiCompanyAccesses.filter((access) => {
      const companyName = access.company?.name ?? access.company_id;
      const roleLabel = getCompanyAccessRoleLabel(access.access_role);
      return `${companyName} ${roleLabel}`.toLowerCase().includes(term);
    });
  }, [multiCompanyAccesses, query]);

  const groupedAccesses = useMemo(() => {
    const term = query.trim();
    if (term) {
      return [{ label: "Risultati", icon: Search, accesses: filteredAccesses }];
    }

    const byId = new Map(filteredAccesses.map((access) => [access.company_id, access]));
    const selected = selectedMultiCompanyId ? byId.get(selectedMultiCompanyId) : undefined;
    const favorites = favoriteCompanyIds
      .map((id) => byId.get(id))
      .filter((access): access is NonNullable<typeof access> => !!access && access.company_id !== selectedMultiCompanyId);
    const recents = recentCompanyIds
      .map((id) => byId.get(id))
      .filter((access): access is NonNullable<typeof access> => (
        !!access &&
        access.company_id !== selectedMultiCompanyId &&
        !favoriteCompanySet.has(access.company_id)
      ));
    const other = filteredAccesses.filter((access) => (
      access.company_id !== selectedMultiCompanyId &&
      !favoriteCompanySet.has(access.company_id) &&
      !recentCompanySet.has(access.company_id)
    ));

    return [
      selected ? { label: "Attiva", icon: Check, accesses: [selected] } : null,
      favorites.length ? { label: "Preferite", icon: Star, accesses: favorites } : null,
      recents.length ? { label: "Recenti", icon: Clock3, accesses: recents } : null,
      other.length ? { label: "Altre aziende", icon: Building2, accesses: other } : null,
    ].filter((group): group is { label: string; icon: typeof Building2; accesses: typeof filteredAccesses } => !!group);
  }, [
    favoriteCompanyIds,
    favoriteCompanySet,
    filteredAccesses,
    query,
    recentCompanyIds,
    recentCompanySet,
    selectedMultiCompanyId,
  ]);

  const handleSwitchCompany = useCallback((companyId: string) => {
    switchMultiCompany(companyId);
    const nextRecentIds = [companyId, ...recentCompanyIds.filter((id) => id !== companyId)].slice(0, MAX_RECENT_COMPANIES);
    persistPreferences({
      favoriteCompanyIds,
      recentCompanyIds: nextRecentIds,
    });
    setQuery("");
    setOpen(false);
  }, [favoriteCompanyIds, persistPreferences, recentCompanyIds, switchMultiCompany]);

  const toggleFavoriteCompany = useCallback((companyId: string) => {
    const isFavorite = favoriteCompanySet.has(companyId);
    const nextFavoriteIds = isFavorite
      ? favoriteCompanyIds.filter((id) => id !== companyId)
      : [companyId, ...favoriteCompanyIds];

    persistPreferences({
      favoriteCompanyIds: nextFavoriteIds,
      recentCompanyIds,
    });
  }, [favoriteCompanyIds, favoriteCompanySet, persistPreferences, recentCompanyIds]);

  const brandMark = (
    <Avatar className="h-8 w-8 rounded-lg border border-sidebar-border bg-sidebar-background">
      <AvatarImage src={effectiveCompany?.logo_url ?? undefined} alt={activeCompanyName} />
      <AvatarFallback className="rounded-lg bg-sidebar-primary/10 text-[11px] font-bold text-sidebar-primary">
        {getCompanyInitials(activeCompanyName)}
      </AvatarFallback>
    </Avatar>
  );

  if (!hasMultipleCompanies) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-11 min-w-0 justify-start gap-2 rounded-xl border border-sidebar-border/70 bg-sidebar-background/70 px-2 text-sidebar-foreground shadow-sm transition-all hover:bg-sidebar-accent/70",
            isCollapsed ? "w-10 justify-center px-0" : "w-full",
            className,
          )}
          title="Cambia azienda"
          aria-label="Cambia azienda"
        >
          {brandMark}
          {!isCollapsed && (
            <>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-semibold leading-tight">{activeCompanyName}</span>
                <span className="block truncate text-[11px] leading-tight text-sidebar-foreground/60">
                  {activeRoleLabel} · {multiCompanyAccesses.length} aziende
                </span>
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50" />
            </>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side={isCollapsed ? "right" : "bottom"}
        sideOffset={8}
        className="w-[22rem] max-w-[calc(100vw-1rem)] p-2"
      >
        <div className="px-2 py-2">
          <p className="text-sm font-semibold">Cambia azienda</p>
          <p className="text-xs text-muted-foreground">Dati, permessi e moduli si aggiornano sul contesto scelto.</p>
        </div>
        <div className="relative mb-2 px-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca azienda o ruolo..."
            className="h-9 pl-8 text-sm"
          />
        </div>
        <div className="max-h-72 overflow-y-auto pr-1">
          {filteredAccesses.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Nessuna azienda trovata
            </div>
          ) : (
            groupedAccesses.map((group) => {
              const GroupIcon = group.icon;
              return (
                <div key={group.label} className="space-y-1 pb-2 last:pb-0">
                  <div className="flex items-center gap-1.5 px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <GroupIcon className="h-3 w-3" />
                    {group.label}
                  </div>
                  {group.accesses.map((access) => {
                    const selected = access.company_id === selectedMultiCompanyId;
                    const favorite = favoriteCompanySet.has(access.company_id);
                    const companyName = access.company?.name ?? access.company_id;
                    return (
                      <div
                        key={access.company_id}
                        className={cn(
                          "flex items-center rounded-lg transition-colors hover:bg-accent",
                          selected && "bg-accent",
                        )}
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-l-lg px-2.5 py-2 text-left"
                          onClick={() => handleSwitchCompany(access.company_id)}
                        >
                          <Avatar className="h-8 w-8 rounded-lg border">
                            <AvatarImage src={access.company?.logo_url ?? undefined} alt={companyName} />
                            <AvatarFallback className="rounded-lg bg-primary/10 text-[11px] font-semibold text-primary">
                              {getCompanyInitials(companyName)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{companyName}</span>
                            <span className="mt-0.5 inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {getCompanyAccessRoleLabel(access.access_role)}
                            </span>
                          </span>
                          {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-amber-500",
                            favorite && "text-amber-500",
                          )}
                          onClick={() => toggleFavoriteCompany(access.company_id)}
                          aria-label={favorite ? `Rimuovi ${companyName} dai preferiti` : `Aggiungi ${companyName} ai preferiti`}
                          title={favorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
                        >
                          <Star className={cn("h-3.5 w-3.5", favorite && "fill-current")} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
        {showSecurityNote && (
          <div className="mt-2 rounded-lg bg-muted/60 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
            Il cambio azienda resetta cache, permessi e dati caricati per evitare contaminazioni tra società.
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
});
