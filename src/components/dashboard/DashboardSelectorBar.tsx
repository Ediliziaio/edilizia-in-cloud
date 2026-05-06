/**
 * DashboardSelectorBar
 *
 * Barra superiore persistente con selettore dropdown (stile GHL) per navigare
 * tra le dashboard (predefinite di sistema + personalizzate), impostare la default
 * ed eliminare quelle custom.
 *
 * Usato in: CruscottoDashboardPage, CruscottoAziendale, CompanyDashboard, MarketingDashboard
 */
import { useState, useMemo } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  ChevronDown,
  LayoutGrid,
  HardHat,
  TrendingUp,
  Plus,
  Search,
  Star,
  Trash2,
  Settings,
} from "lucide-react";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useDashboards,
  useSetDefaultDashboard,
  useDeleteDashboard,
} from "@/lib/dashboardBuilder/hooks";
import type { DashboardListItem } from "@/lib/dashboardBuilder/types";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { getSmartCruscottoPath } from "@/lib/dashboardRouting";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Dashboard predefinite di sistema ─────────────────────────────────────────
interface SystemDash {
  id: string;
  label: string;
  url: string;
  icon: React.ElementType;
  permKey:
    | "canViewCruscotto"
    | "canViewDashboard"
    | "canViewMarketingDashboard"
    | "canViewControlloGestione";
  /** Se valorizzato, la dashboard è visibile solo se il flag è attivo per la company. */
  featureKey?: string;
}

const SYSTEM_DASHBOARDS: SystemDash[] = [
  { id: "sys-aziendale", label: "Cruscotto Aziendale", url: "/azienda/cruscotto/aziendale", icon: LayoutGrid,  permKey: "canViewCruscotto"          },
  { id: "sys-gestione",  label: "Dashboard Gestione",  url: "/azienda",                     icon: HardHat,     permKey: "canViewDashboard"          },
  // Controllo di Gestione rimosso dal selector Cruscotto: non e' una dashboard
  // ma un modulo dedicato con sidebar voce propria → l'utente lo trova li.
  { id: "sys-marketing", label: "Dashboard Marketing", url: "/azienda/marketing",            icon: TrendingUp,  permKey: "canViewMarketingDashboard" },
];

function isSystemActive(pathname: string, url: string) {
  if (url === "/azienda") return pathname === "/azienda" || pathname === "/azienda/";
  return pathname.startsWith(url);
}

// ── Picker item (dashboard personalizzata) ────────────────────────────────────
function PickerItem({
  dash,
  isActive,
  onSelect,
  onSetDefault,
  onDelete,
  isDefaultPending,
  isDeletePending,
}: {
  dash: DashboardListItem;
  isActive: boolean;
  onSelect: () => void;
  onSetDefault: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  isDefaultPending: boolean;
  isDeletePending: boolean;
}) {
  return (
    <div
      className={cn(
        "group w-full flex items-center rounded-lg text-left transition-colors",
        isActive ? "bg-primary/10 text-foreground" : "hover:bg-muted/60 text-foreground",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
      >
        <div className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
          isActive ? "bg-primary/10 border-primary/20" : "bg-muted border-border",
        )}>
          <LayoutGrid className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
        </div>

        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium truncate leading-tight">
            {dash.is_default && (
              <span className="text-[10px] font-medium text-muted-foreground italic mr-1">
                (Predefinita)
              </span>
            )}
            {dash.name}
          </p>
        </div>
      </button>

      {/* Azioni su hover */}
      <div className="flex items-center gap-0.5 pr-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          disabled={dash.is_default || isDefaultPending}
          onClick={(e) => { e.stopPropagation(); if (!dash.is_default) onSetDefault(e); }}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded hover:bg-background/80 transition-colors disabled:cursor-default sm:h-8 sm:w-8",
            dash.is_default && "!opacity-100",
          )}
          title={dash.is_default ? "Dashboard predefinita" : "Imposta come predefinita"}
          aria-label={dash.is_default ? "Dashboard predefinita" : `Imposta ${dash.name} come predefinita`}
        >
          <Star className={cn(
            "h-3.5 w-3.5 transition-all",
            dash.is_default
              ? "fill-amber-400 stroke-amber-400"
              : "stroke-muted-foreground/60 fill-transparent hover:stroke-amber-400 hover:fill-amber-200",
            isDefaultPending && "animate-pulse",
          )} />
        </button>

        {dash.is_owner && (
          <button
            type="button"
            disabled={isDeletePending}
            onClick={(e) => { e.stopPropagation(); onDelete(e); }}
            className="flex h-9 w-9 items-center justify-center rounded hover:bg-destructive/10 transition-colors disabled:cursor-wait disabled:opacity-60 sm:h-8 sm:w-8"
            title="Elimina dashboard"
            aria-label={`Elimina ${dash.name}`}
          >
            <Trash2 className={cn(
              "h-3.5 w-3.5 stroke-muted-foreground/60 hover:stroke-destructive transition-colors",
              isDeletePending && "animate-pulse",
            )} />
          </button>
        )}
      </div>

      {dash.is_default && (
        <Star className="hidden h-3.5 w-3.5 shrink-0 fill-amber-400 stroke-amber-400 sm:block sm:group-hover:hidden" />
      )}
    </div>
  );
}

// ── Sezione lista ─────────────────────────────────────────────────────────────
function PickerSection({
  title, items, activeDashId, onSelect, onSetDefault, onDelete, defaultPendingId, deletePendingId,
}: {
  title: string;
  items: DashboardListItem[];
  activeDashId: string | null;
  onSelect: (id: string) => void;
  onSetDefault: (e: React.MouseEvent, id: string) => void;
  onDelete: (e: React.MouseEvent, dash: DashboardListItem) => void;
  defaultPendingId: string | null;
  deletePendingId: string | null;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </p>
      {items.map((d) => (
        <PickerItem
          key={d.id}
          dash={d}
          isActive={d.id === activeDashId}
          onSelect={() => onSelect(d.id)}
          onSetDefault={(e) => onSetDefault(e, d.id)}
          onDelete={(e) => onDelete(e, d)}
          isDefaultPending={defaultPendingId === d.id}
          isDeletePending={deletePendingId === d.id}
        />
      ))}
    </div>
  );
}

// ── Props pubbliche ───────────────────────────────────────────────────────────
interface DashboardSelectorBarProps {
  /** Titolo mostrato accanto al bottone picker */
  title: string;
  /** ID della dashboard custom attiva (solo in CruscottoDashboardPage) */
  activeDashId?: string | null;
  /** Callback quando l'utente sceglie una dashboard custom dal picker */
  onSelectCustomDash?: (id: string) => void;
  /** Slot per azioni aggiuntive (periodo, refresh, modifica) — destra */
  actions?: React.ReactNode;
}

// ── Componente principale ─────────────────────────────────────────────────────
export function DashboardSelectorBar({
  title,
  activeDashId = null,
  onSelectCustomDash,
  actions,
}: DashboardSelectorBarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const { data: dashboards = [], isLoading: dashboardsLoading, error: dashboardsError } = useDashboards();
  const setDefault = useSetDefaultDashboard();
  const deleteDash = useDeleteDashboard();
  const permissions = usePermissions();
  const { role } = useAuth();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DashboardListItem | null>(null);
  const defaultPendingId = setDefault.isPending ? setDefault.variables ?? null : null;
  const deletePendingId = deleteDash.isPending ? deleteDash.variables ?? null : null;

  const featureFlags = useFeatureFlags();
  // Dashboard di sistema filtrate per permessi + feature flag (add-on)
  const visibleSystem = useMemo(
    () =>
      permissions.isLoading
        ? []
        : SYSTEM_DASHBOARDS.filter((s) => {
            const hasPerm = permissions.isAdmin || permissions[s.permKey];
            if (!hasPerm) return false;
            if (s.featureKey && !featureFlags.isFeatureEnabled(s.featureKey)) return false;
            return true;
          }),
    [permissions, featureFlags],
  );

  // Filtro ricerca
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? dashboards.filter((d) => d.name.toLowerCase().includes(q)) : dashboards;
  }, [dashboards, search]);

  const mine   = filtered.filter((d) => d.is_owner);
  const shared = filtered.filter((d) => !d.is_owner);

  const handleSetDefault = (e: React.MouseEvent, dashId: string) => {
    e.stopPropagation();
    setDefault.mutate(dashId, {
      onSuccess: () => toast.success("Dashboard impostata come predefinita"),
      onError: () => toast.error("Non sono riuscito a impostare la dashboard predefinita"),
    });
  };

  const handleSelectCustom = (id: string) => {
    setSearch("");
    setOpen(false);
    if (onSelectCustomDash) {
      onSelectCustomDash(id);
    } else {
      // Se non c'è callback, naviga alla pagina cruscotto con il param
      navigate(`/azienda/cruscotto?d=${id}`);
    }
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    deleteDash.mutate(target.id, {
      onSuccess: () => {
        toast.success(`"${target.name}" eliminata`);
        setDeleteTarget(null);
        if (target.id === activeDashId) {
          navigate(getSmartCruscottoPath(permissions, role), { replace: true });
        }
      },
      onError: (err) => {
        toast.error((err as Error).message || "Non sono riuscito a eliminare la dashboard");
        setDeleteTarget(null);
      },
    });
  };

  return (
    <>
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 border-b bg-background shrink-0 min-w-0">
        {/* Picker */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 font-normal shrink-0"
              aria-label="Seleziona dashboard"
            >
              <LayoutGrid className="h-4 w-4 text-muted-foreground" />
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </PopoverTrigger>

          <PopoverContent align="start" className="w-[calc(100vw-2rem)] sm:w-80 p-2" sideOffset={6}>
            {/* Ricerca */}
            <div className="relative mb-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Cerca una dashboard"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
                autoFocus
              />
            </div>

            {/* Aggiungi */}
            <button
              type="button"
              onClick={() => { setOpen(false); navigate("/azienda/cruscotto/gestisci"); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5 rounded-md transition-colors"
            >
              <Plus className="h-4 w-4" />
              Aggiungi dashboard
            </button>

            <div className="my-1.5 border-t" />

            <div className="space-y-1 max-h-80 overflow-y-auto">
              {/* Dashboard di sistema */}
              {permissions.isLoading ? (
                <p className="px-3 py-3 text-sm text-center text-muted-foreground">
                  Caricamento dashboard…
                </p>
              ) : visibleSystem.length > 0 && (
                <div>
                  <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Predefinite
                  </p>
                  {visibleSystem.map((s) => {
                    const Icon = s.icon;
                    const isActive = isSystemActive(location.pathname, s.url);
                    return (
                      <Link
                        key={s.id}
                        to={s.url}
                        onClick={() => { setSearch(""); setOpen(false); }}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                          isActive ? "bg-primary/10 text-foreground" : "hover:bg-muted/60 text-foreground",
                        )}
                      >
                        <div className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                          isActive ? "bg-primary/10 border-primary/20" : "bg-muted border-border",
                        )}>
                          <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                        </div>
                        <span className="text-sm font-medium truncate">{s.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}

              {/* Separatore */}
              {visibleSystem.length > 0 && dashboards.length > 0 && (
                <div className="my-1 border-t" />
              )}

              {/* Dashboard personalizzate */}
              {dashboardsError ? (
                <p className="px-3 py-3 text-sm text-center text-destructive">
                  Non riesco a caricare le dashboard. Riapri il menu tra qualche secondo.
                </p>
              ) : dashboardsLoading ? (
                <p className="px-3 py-3 text-sm text-center text-muted-foreground">
                  Caricamento personalizzate…
                </p>
              ) : dashboards.length === 0 ? (
                <p className="px-3 py-3 text-sm text-center text-muted-foreground">
                  Nessuna dashboard personalizzata
                </p>
              ) : mine.length === 0 && shared.length === 0 && search ? (
                <p className="px-3 py-3 text-sm text-center text-muted-foreground">
                  Nessun risultato per "{search}"
                </p>
              ) : (
                <>
                  <PickerSection
                    title="Le mie dashboard"
                    items={mine}
                    activeDashId={activeDashId}
                    onSelect={handleSelectCustom}
                    onSetDefault={handleSetDefault}
                    onDelete={(e, d) => { e.stopPropagation(); setDeleteTarget(d); }}
                    defaultPendingId={defaultPendingId}
                    deletePendingId={deletePendingId}
                  />
                  <PickerSection
                    title="Condiviso con me"
                    items={shared}
                    activeDashId={activeDashId}
                    onSelect={handleSelectCustom}
                    onSetDefault={handleSetDefault}
                    onDelete={(e, d) => { e.stopPropagation(); setDeleteTarget(d); }}
                    defaultPendingId={defaultPendingId}
                    deletePendingId={deletePendingId}
                  />
                </>
              )}
            </div>

            {/* Footer */}
            <div className="mt-1.5 pt-1.5 border-t">
              <button
                type="button"
                onClick={() => { setOpen(false); navigate("/azienda/cruscotto/gestisci"); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
              >
                <Settings className="h-3.5 w-3.5" />
                Gestisci dashboard
              </button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Titolo */}
        <h1 className="text-base font-semibold truncate flex-1 min-w-0">{title}</h1>

        {/* Slot azioni a destra */}
        {actions && <div className="flex items-center gap-2 shrink-0 max-w-[62vw] overflow-x-auto sm:max-w-none">{actions}</div>}
      </div>

      {/* Dialog conferma eliminazione */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina dashboard</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare{" "}
              <span className="font-semibold text-foreground">"{deleteTarget?.name}"</span>?
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteConfirm}
              disabled={deleteDash.isPending}
            >
              {deleteDash.isPending ? "Eliminazione…" : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
