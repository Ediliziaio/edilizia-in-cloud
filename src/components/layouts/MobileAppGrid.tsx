/**
 * MobileAppGrid — Schermata "App" full-screen per mobile.
 * Mostra tutte le sezioni accessibili all'utente in una griglia categorizzata.
 * Sostituisce la vecchia sidebar su mobile.
 *
 * v8.6.69 (2026-05-26) — UX upgrade:
 *   1) Colori per categoria (CRUSCOTTO blu, CANTIERI orange, FINANZA verde, etc.)
 *   2) Sezione "Recenti" in cima (ultime 6 app aperte, localStorage)
 *   3) Badge notifiche su icone (chat/email/attività non letti)
 *   4) Layout compatto: meno padding verticale → +30% info a colpo d'occhio
 */
import { useMemo, useEffect, useState, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { X, Search, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { macroAreas, type NavItem } from "@/lib/sidebarConfig";
import { usePermissions } from "@/hooks/usePermissions";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useBillingMode } from "@/contexts/BillingModeContext";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/hooks/useNotifications";
import { getSmartCruscottoPath } from "@/lib/dashboardRouting";
import { DEMO_COMPANY_ID } from "@/lib/constants/demoCompany";
import { canAccessMediaLibrary } from "@/lib/mediaLibrary";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

interface MobileAppGridProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Voci nascoste SOLO sul menu app mobile (la sidebar desktop le mostra
 * comunque se l'utente ha i permessi). Richiesta utente: snellire l'app
 * mobile rimuovendo tool marketing/automazione poco usati in mobilità.
 */
const MOBILE_HIDDEN_URLS = new Set<string>([
  "/azienda/marketing/pubblicita",
  "/azienda/marketing/social",
  "/azienda/marketing/reputazione",
  "/azienda/automazioni",
  "/azienda/marketing/email",
  // "/azienda/whatsapp" RIENTRA nella griglia: rispondere su WhatsApp è il caso
  // d'uso più mobile che esista — era l'unica nav completa senza percorso.
  "/azienda/agenti-ai",
  "/azienda/sms",
]);

/**
 * Palette per macroArea — ogni sezione ha il suo colore identificativo.
 * Sfondo icona pastello, icona vivace. Stato attivo: shade più scura.
 */
interface AreaTone {
  iconBg: string;
  iconColor: string;
  iconBorder: string;
  activeBg: string;
  activeColor: string;
  activeBorder: string;
  sectionLabel: string;
}

const AREA_TONES: Record<string, AreaTone> = {
  area_cruscotto: {
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    iconBorder: "border-blue-100",
    activeBg: "bg-blue-500",
    activeColor: "text-white",
    activeBorder: "border-blue-500",
    sectionLabel: "text-blue-700",
  },
  area_controllo_gestione: {
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    iconBorder: "border-violet-100",
    activeBg: "bg-violet-500",
    activeColor: "text-white",
    activeBorder: "border-violet-500",
    sectionLabel: "text-violet-700",
  },
  area_cantieri: {
    iconBg: "bg-orange-50",
    iconColor: "text-orange-600",
    iconBorder: "border-orange-100",
    activeBg: "bg-orange-500",
    activeColor: "text-white",
    activeBorder: "border-orange-500",
    sectionLabel: "text-orange-700",
  },
  area_finanza: {
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    iconBorder: "border-emerald-100",
    activeBg: "bg-emerald-500",
    activeColor: "text-white",
    activeBorder: "border-emerald-500",
    sectionLabel: "text-emerald-700",
  },
  area_persone: {
    iconBg: "bg-cyan-50",
    iconColor: "text-cyan-600",
    iconBorder: "border-cyan-100",
    activeBg: "bg-cyan-500",
    activeColor: "text-white",
    activeBorder: "border-cyan-500",
    sectionLabel: "text-cyan-700",
  },
  area_marketing: {
    iconBg: "bg-pink-50",
    iconColor: "text-pink-600",
    iconBorder: "border-pink-100",
    activeBg: "bg-pink-500",
    activeColor: "text-white",
    activeBorder: "border-pink-500",
    sectionLabel: "text-pink-700",
  },
  area_automazioni: {
    iconBg: "bg-amber-50",
    iconColor: "text-amber-700",
    iconBorder: "border-amber-100",
    activeBg: "bg-amber-500",
    activeColor: "text-white",
    activeBorder: "border-amber-500",
    sectionLabel: "text-amber-700",
  },
  area_contenuti: {
    iconBg: "bg-slate-100",
    iconColor: "text-slate-600",
    iconBorder: "border-slate-200",
    activeBg: "bg-slate-700",
    activeColor: "text-white",
    activeBorder: "border-slate-700",
    sectionLabel: "text-slate-700",
  },
};

const DEFAULT_TONE: AreaTone = {
  iconBg: "bg-muted/40",
  iconColor: "text-muted-foreground",
  iconBorder: "border-border/40",
  activeBg: "bg-blue-500",
  activeColor: "text-white",
  activeBorder: "border-blue-500",
  sectionLabel: "text-muted-foreground",
};

/* ── Recenti via localStorage ─────────────────────────────────────────── */

const RECENTS_KEY = "mobile-app-grid-recents-v1";
const RECENTS_LIMIT = 6;

function loadRecents(): string[] {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(RECENTS_KEY) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function pushRecent(url: string) {
  try {
    if (typeof window === "undefined") return;
    const current = loadRecents();
    const next = [url, ...current.filter((u) => u !== url)].slice(0, RECENTS_LIMIT);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* ignora errori storage (privato/quota) */
  }
}

/* ── Badge counts per URL ─────────────────────────────────────────────── */

interface NotificationLike {
  is_read: boolean;
  entity_type: string | null;
  type: string;
  action_url?: string | null;
}

function badgeForUrl(url: string, notifications: NotificationLike[]): number {
  if (!notifications.length) return 0;
  const unread = notifications.filter((n) => !n.is_read);
  if (!unread.length) return 0;

  // Match per entity_type / type / action_url prefix
  switch (url) {
    case "/azienda/chat":
      return unread.filter(
        (n) =>
          n.entity_type === "chat_message" ||
          n.entity_type === "chat" ||
          n.type?.toLowerCase().includes("chat") ||
          n.action_url?.startsWith("/azienda/chat"),
      ).length;
    case "/azienda/email":
      return unread.filter(
        (n) =>
          n.entity_type === "email" ||
          n.type?.toLowerCase().includes("email") ||
          n.action_url?.startsWith("/azienda/email"),
      ).length;
    case "/azienda/attivita":
      return unread.filter(
        (n) =>
          n.entity_type === "task" ||
          n.entity_type === "activity" ||
          n.type?.toLowerCase().includes("task") ||
          n.type?.toLowerCase().includes("attivit") ||
          n.action_url?.startsWith("/azienda/attivita"),
      ).length;
    default:
      return 0;
  }
}

/* ── Componente ───────────────────────────────────────────────────────── */

export function MobileAppGrid({ open, onOpenChange }: MobileAppGridProps) {
  const permissions = usePermissions();
  const { isModuleEnabled, isLoading: limitsLoading } = useSubscriptionLimits({ includeUsageCounts: false });
  const { mode: billingMode } = useBillingMode();
  const { isFeatureEnabled, isLoading: flagsLoading } = useFeatureFlags();
  const gatingLoading = limitsLoading || flagsLoading;
  const { role, effectiveCompany } = useAuth();
  const { notifications } = useNotifications();
  const isDemoBaseline = effectiveCompany?.id === DEMO_COMPANY_ID;
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [recents, setRecents] = useState<string[]>(() => loadRecents());

  // Refresh recents quando il pannello si apre (potrebbe essere cambiato altrove)
  useEffect(() => {
    if (open) setRecents(loadRecents());
  }, [open]);

  const filterNavItems = useMemo(() => {
    return (items: NavItem[]) => {
      if (permissions.isLoading) {
        return items.filter((item) => {
          if (MOBILE_HIDDEN_URLS.has(item.url)) return false;
          if (item.url === "/azienda/contenuti-multimediali") return true;
          if (item.demoCompanyOnly && !isDemoBaseline) return false;
          if (item.featureKey === "billing_external" && billingMode !== "external") return false;
          if (item.featureKey === "billing_native" && billingMode !== "native") return false;
          if (item.featureKey && item.featureKey !== "billing_external" && item.featureKey !== "billing_native" && !isFeatureEnabled(item.featureKey)) return false;
          return true;
        });
      }
      return items.filter((item) => {
        if (MOBILE_HIDDEN_URLS.has(item.url)) return false;
        if (item.url === "/azienda/contenuti-multimediali" && !canAccessMediaLibrary(permissions)) return false;
        if (item.demoCompanyOnly && !isDemoBaseline) return false;
        if (item.url === "/azienda/cruscotto") {
          if (!permissions.canViewCruscotto && !permissions.canViewDashboard && !permissions.canViewMarketingDashboard) return false;
        } else if (item.permissionKey && permissions[item.permissionKey as keyof typeof permissions] !== true) {
          return false;
        }
        if (item.moduleKey && !isModuleEnabled(item.moduleKey)) return false;
        if (item.featureKey === "billing_external" && billingMode !== "external") return false;
        if (item.featureKey === "billing_native" && billingMode !== "native") return false;
        if (item.featureKey && item.featureKey !== "billing_external" && item.featureKey !== "billing_native" && !isFeatureEnabled(item.featureKey)) return false;
        return true;
      });
    };
  }, [permissions, isModuleEnabled, billingMode, isFeatureEnabled, isDemoBaseline]);

  const filteredAreas = useMemo(() => {
    return macroAreas
      .map((area) => {
        let items = filterNavItems(area.items);
        if (search.trim()) {
          const q = search.toLowerCase();
          items = items.filter((item) => item.title.toLowerCase().includes(q));
        }
        return { ...area, items };
      })
      .filter((area) => area.items.length > 0);
  }, [filterNavItems, search]);

  /**
   * Mappa URL → { item, areaId } per risolvere i recenti alle voci attuali
   * (con tono colore corretto). Esclude voci nascoste/non più accessibili.
   */
  const itemIndex = useMemo(() => {
    const map = new Map<string, { item: NavItem; areaId: string }>();
    for (const area of filteredAreas) {
      for (const it of area.items) {
        map.set(it.url, { item: it, areaId: area.id });
      }
    }
    return map;
  }, [filteredAreas]);

  const recentsItems = useMemo(() => {
    if (search.trim()) return []; // niente recenti durante ricerca
    return recents
      .map((url) => itemIndex.get(url))
      .filter((x): x is { item: NavItem; areaId: string } => x != null)
      .slice(0, RECENTS_LIMIT);
  }, [recents, itemIndex, search]);

  const handleNavigate = useCallback((url: string) => {
    pushRecent(url);
    setRecents(loadRecents());
    onOpenChange(false);
    setSearch("");
  }, [onOpenChange]);

  /**
   * Renderizza una singola "tile" app — usata sia in Recenti che nelle aree.
   * `tone` è null per Recenti (usa tono di default neutro) oppure il tono dell'area.
   */
  const renderTile = (item: NavItem, areaId: string | null) => {
    const Icon = item.icon;
    const itemUrl =
      item.url === "/azienda/cruscotto"
        ? (permissions.isLoading ? item.url : getSmartCruscottoPath(permissions, role))
        : item.url;
    const isActive =
      location.pathname === itemUrl ||
      location.pathname.startsWith(itemUrl + "/") ||
      (item.url === "/azienda/cruscotto" && location.pathname.startsWith("/azienda/cruscotto"));
    const tone = (areaId && AREA_TONES[areaId]) || DEFAULT_TONE;
    const badge = badgeForUrl(item.url, notifications);

    return (
      <Link
        key={`${areaId ?? "recent"}-${item.url}`}
        to={itemUrl}
        onClick={() => handleNavigate(item.url)}
        className="flex flex-col items-center gap-1 min-w-0 active:scale-95 transition-transform"
      >
        <div className="relative">
          <div
            className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center border transition-colors",
              isActive ? cn(tone.activeBg, tone.activeBorder) : cn(tone.iconBg, tone.iconBorder),
            )}
          >
            <Icon
              className={cn(
                "h-5 w-5",
                isActive ? tone.activeColor : tone.iconColor,
              )}
            />
          </div>
          {badge > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white rounded-full flex items-center justify-center text-[9px] font-bold leading-none ring-2 ring-background">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </div>
        <span
          className={cn(
            "text-[11px] leading-tight text-center line-clamp-2 font-medium",
            isActive ? "text-foreground font-semibold" : "text-foreground",
          )}
        >
          {item.title}
        </span>
      </Link>
    );
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSearch(""); }}>
      <SheetContent
        side="bottom"
        className="h-[92dvh] rounded-t-3xl p-0 overflow-hidden [&>button]:hidden"
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-5 pt-4 sm:pt-5 pb-2.5">
            <h2 className="text-lg font-bold text-foreground">App</h2>
            <button
              onClick={() => { onOpenChange(false); setSearch(""); }}
              className="w-10 h-10 -mr-1 rounded-full flex items-center justify-center hover:bg-muted active:bg-muted/70 transition-colors"
              aria-label="Chiudi"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Search */}
          <div className="px-4 sm:px-5 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Cerca app"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-xl border border-border/60 bg-muted/30 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                aria-label="Cerca app"
              />
            </div>
          </div>

          {/* Grid content */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-5 pb-8">
            {gatingLoading && (
              <div className="space-y-3" aria-label="Caricamento menu">
                {Array.from({ length: 3 }).map((_, areaIdx) => (
                  <div key={areaIdx} className="bg-background border border-border/60 rounded-2xl p-3">
                    <Skeleton className="h-3 w-24 mb-3" />
                    <div className="grid grid-cols-4 gap-2">
                      {Array.from({ length: 8 }).map((_, itemIdx) => (
                        <div key={itemIdx} className="flex flex-col items-center gap-1.5">
                          <Skeleton className="w-12 h-12 rounded-2xl" />
                          <Skeleton className="h-3 w-10" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Sezione Recenti — solo se ci sono e non sto cercando */}
            {!gatingLoading && recentsItems.length > 0 && (
              <div className="mb-3">
                <div className="bg-background border border-border/60 rounded-2xl p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-2.5 flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Recenti
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {recentsItems.map(({ item, areaId }) => renderTile(item, areaId))}
                  </div>
                </div>
              </div>
            )}

            {!gatingLoading && filteredAreas.map((area) => {
              const tone = AREA_TONES[area.id] || DEFAULT_TONE;
              return (
                <div key={area.id} className="mb-3">
                  <div className="bg-background border border-border/60 rounded-2xl p-3">
                    <p className={cn(
                      "text-[11px] font-semibold uppercase tracking-wide mb-2.5",
                      tone.sectionLabel,
                    )}>
                      {area.title}
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {area.items.map((item) => renderTile(item, area.id))}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Empty state quando search non trova nulla */}
            {!gatingLoading && search.trim() && filteredAreas.length === 0 && recentsItems.length === 0 && (
              <div className="text-center py-10 text-sm text-muted-foreground">
                Nessuna app trovata per &quot;{search}&quot;
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
