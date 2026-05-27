/**
 * IntegrationsGrid — grid uniforme + filtro pillole + search per le integrazioni.
 *
 * Stile GHL: card di uguale altezza, icona brand 40x40, badge stato, descrizione
 * 2 righe, 1 CTA primario in basso, kebab menu (3 puntini) in alto a destra.
 *
 * Riceve come props lo stato di connessione (calcolato a monte da
 * SettingsIntegrations.tsx con le query esistenti) — la grid non fa nessun
 * fetch.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Search, CheckCircle2, MoreVertical, ExternalLink, AlertTriangle, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  renderLogo,
  type IntegrationCategory,
  type IntegrationItem,
  type PopupComponentProps,
  type ExternalWizardProps,
} from "./IntegrationsCatalog";

export type IntegrationConnectionStatus = "connected" | "disconnected" | "error" | "pending";

export type IntegrationStatusMap = Record<
  string,
  {
    status: IntegrationConnectionStatus;
    /** Dettaglio compatto sotto la descrizione (es: "numero: +39 ...") */
    detail?: string | null;
  }
>;

export type IntegrationsGridProps = {
  items: IntegrationItem[];
  statuses: IntegrationStatusMap;
  canManage: boolean;
  /**
   * Registry di componenti popup. La key è `IntegrationItem.id`.
   * Per gestisciMode="popup": il componente è renderizzato dentro un Dialog gestito dalla grid.
   */
  popupRegistry?: Record<string, React.FC<PopupComponentProps>>;
  /**
   * Registry di componenti "external wizard" (es. MetaIntegrationWizard) che
   * gestiscono internamente la propria Dialog. La grid passa solo open/onOpenChange.
   */
  externalWizardRegistry?: Record<string, React.FC<ExternalWizardProps>>;
  /** Hook per disconnessione (chiamato dal kebab menu) — opzionale. */
  onDisconnect?: (item: IntegrationItem) => void;
};

function StatusBadge({ status }: { status: IntegrationConnectionStatus }) {
  if (status === "connected") {
    return (
      <Badge className="text-[10px] gap-1 bg-emerald-600 hover:bg-emerald-600">
        <CheckCircle2 className="h-2.5 w-2.5" />
        Connesso
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive" className="text-[10px] gap-1">
        <AlertTriangle className="h-2.5 w-2.5" />
        Errore
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge variant="secondary" className="text-[10px]">
        In sospeso
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">
      Da configurare
    </Badge>
  );
}

export default function IntegrationsGrid({
  items,
  statuses,
  canManage,
  popupRegistry = {},
  externalWizardRegistry = {},
  onDisconnect,
}: IntegrationsGridProps) {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory | "tutte">("tutte");
  const [search, setSearch] = useState("");
  // Popup state — un solo item alla volta
  const [popupItemId, setPopupItemId] = useState<string | null>(null);
  // External wizard state (es. Meta)
  const [externalWizardId, setExternalWizardId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    let result = items;
    if (activeCategory !== "tutte") {
      result = result.filter((i) => i.category === activeCategory);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, activeCategory, search]);

  // Counter per pillole (basato sull'intero catalogo, non sul filtro corrente)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { tutte: items.length };
    for (const cat of CATEGORY_ORDER) {
      if (cat === "tutte") continue;
      counts[cat] = items.filter((i) => i.category === cat).length;
    }
    return counts;
  }, [items]);

  const handleAction = (item: IntegrationItem) => {
    if (!canManage) {
      toast.error("Solo un amministratore aziendale può gestire le integrazioni.");
      return;
    }
    if (item.gestisciMode === "navigate") {
      navigate(item.pageHref);
      return;
    }
    if (item.gestisciMode === "external-wizard") {
      if (!externalWizardRegistry[item.id]) {
        toast.error("Wizard non disponibile per questa integrazione.");
        return;
      }
      setExternalWizardId(item.id);
      return;
    }
    // popup
    if (!popupRegistry[item.id]) {
      // Fallback: naviga alla pagina dedicata se non c'è il popup component
      navigate(item.pageHref);
      return;
    }
    setPopupItemId(item.id);
  };

  const activePopupItem = popupItemId
    ? items.find((i) => i.id === popupItemId) ?? null
    : null;
  const ActivePopupComponent = activePopupItem
    ? popupRegistry[activePopupItem.id] ?? null
    : null;

  const activeWizardItem = externalWizardId
    ? items.find((i) => i.id === externalWizardId) ?? null
    : null;
  const ActiveWizardComponent = activeWizardItem
    ? externalWizardRegistry[activeWizardItem.id] ?? null
    : null;

  return (
    <div className="space-y-4">
      {/* Pillole filtro + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {CATEGORY_ORDER.map((cat) => {
            const active = activeCategory === cat;
            const count = categoryCounts[cat] ?? 0;
            if (cat !== "tutte" && count === 0) return null;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {CATEGORY_LABELS[cat]}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px]",
                    active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative w-full sm:w-auto sm:min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca integrazioni..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Grid */}
      {filteredItems.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          <Plug className="mx-auto mb-2 h-6 w-6 opacity-50" />
          Nessuna integrazione corrisponde alla ricerca.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredItems.map((item) => {
            const status = statuses[item.id]?.status ?? "disconnected";
            const detail = statuses[item.id]?.detail;
            const connected = status === "connected";
            const ctaLabel = connected
              ? item.manageCtaLabel ?? "Gestisci"
              : item.connectCtaLabel ?? "Collega";

            return (
              <Card
                key={item.id}
                className={cn(
                  "relative flex h-[200px] flex-col p-4 transition-colors hover:border-primary/40",
                )}
              >
                {/* Kebab menu */}
                <div className="absolute right-2 top-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Apri menu integrazione"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => navigate(item.pageHref)}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Vai alla pagina
                      </DropdownMenuItem>
                      {connected && onDisconnect && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => onDisconnect(item)}
                            disabled={!canManage}
                          >
                            Disconnetti
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Header: icona + nome + badge */}
                <div className="flex items-start gap-3 pr-8">
                  {renderLogo(item.Logo)}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold leading-tight truncate">
                      {item.name}
                    </h3>
                    <div className="mt-1">
                      <StatusBadge status={status} />
                    </div>
                  </div>
                </div>

                {/* Descrizione */}
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {item.description}
                </p>
                {detail && (
                  <p className="mt-1 truncate text-[11px] text-muted-foreground/80">
                    {detail}
                  </p>
                )}

                {/* CTA in basso */}
                <div className="mt-auto pt-3">
                  <Button
                    type="button"
                    size="sm"
                    variant={connected ? "outline" : "default"}
                    className="w-full"
                    onClick={() => handleAction(item)}
                    disabled={!canManage}
                  >
                    {ctaLabel}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Popup wrapper (per gestisciMode="popup") */}
      <Dialog
        open={!!activePopupItem}
        onOpenChange={(open) => {
          if (!open) setPopupItemId(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {activePopupItem && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {renderLogo(activePopupItem.Logo, "h-8 w-8")}
                  {activePopupItem.name}
                </DialogTitle>
              </DialogHeader>
              {ActivePopupComponent && (
                <ActivePopupComponent onClose={() => setPopupItemId(null)} />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* External wizard (es. MetaIntegrationWizard — gestisce internamente la Dialog) */}
      {ActiveWizardComponent && (
        <ActiveWizardComponent
          open={!!activeWizardItem}
          onOpenChange={(open) => {
            if (!open) setExternalWizardId(null);
          }}
        />
      )}
    </div>
  );
}
