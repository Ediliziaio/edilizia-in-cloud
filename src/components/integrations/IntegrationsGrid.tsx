/**
 * IntegrationsGrid — la griglia delle integrazioni: una scheda uguale per
 * ciascuna, filtro per categoria, popup di gestione.
 *
 * Stile GHL: card di uguale altezza, icona brand 40x40, descrizione breve,
 * kebab menu (3 puntini) in alto a destra.
 *
 * Riordino del 05/10/2026: ogni scheda dice lo stato con le stesse parole
 * (Collegato · Da sistemare · Errore · Non collegato) e il pulsante è uno
 * solo, piccolo e contornato; prima ogni scheda scollegata aveva un pulsante
 * blu largo quanto lei, e la griglia gridava tutta allo stesso modo. Niente più ricerca interna: con una dozzina
 * di schede bastano le categorie, e la pagina ha già la ricerca delle
 * Impostazioni. Il popup aperto si può comandare da fuori (riquadro «Da
 * sistemare», ritorno dalla banca o da Stripe).
 *
 * Riceve come props lo stato di connessione (calcolato a monte da
 * SettingsIntegrations.tsx con le query esistenti) — la grid non fa nessun
 * fetch.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { MoreVertical, ExternalLink, Plug, Wrench, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import { PallinoStato, type Tono } from "./StatoCollegamento";

export type IntegrationConnectionStatus = "connected" | "disconnected" | "error" | "pending" | "warning";

export type IntegrationStatusMap = Record<
  string,
  {
    status: IntegrationConnectionStatus;
    /** Dettaglio compatto sotto lo stato (es: "Numero: +39 ...", "3 caselle · 1 da ricollegare") */
    detail?: string | null;
  }
>;

/** Il popup aperto: quale scheda e, se il popup ne ha, quale sua sezione. */
export type PopupAperto = { id: string; scheda?: string } | null;

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
  /** "Risolvi problemi" nel kebab per gli item con troubleshoot=true. */
  onTroubleshoot?: (item: IntegrationItem) => void;
  /** "Moduli lead" nel kebab per gli item con leadFormsMenu=true (se connessi). */
  onManageForms?: (item: IntegrationItem) => void;
  /** Popup comandato da fuori: con `onPopupChange` la grid non lo tiene per sé. */
  popup?: PopupAperto;
  onPopupChange?: (popup: PopupAperto) => void;
};

const STATO: Record<IntegrationConnectionStatus, { tono: Tono; label: string }> = {
  connected: { tono: "ok", label: "Collegato" },
  warning: { tono: "attenzione", label: "Da sistemare" },
  pending: { tono: "attenzione", label: "In sospeso" },
  error: { tono: "errore", label: "Errore" },
  disconnected: { tono: "spento", label: "Non collegato" },
};

/** Collegata = funziona, anche se con qualcosa da sistemare. */
export function eCollegata(status: IntegrationConnectionStatus | undefined): boolean {
  return status === "connected" || status === "warning" || status === "pending";
}

function haProblemi(status: IntegrationConnectionStatus): boolean {
  return status === "warning" || status === "pending" || status === "error";
}

export default function IntegrationsGrid({
  items,
  statuses,
  canManage,
  popupRegistry = {},
  externalWizardRegistry = {},
  onDisconnect,
  onTroubleshoot,
  onManageForms,
  popup: popupDaFuori,
  onPopupChange,
}: IntegrationsGridProps) {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory | "tutte">("tutte");
  // Popup: un solo item alla volta. Comandato da fuori se c'è onPopupChange.
  const [popupInterno, setPopupInterno] = useState<PopupAperto>(null);
  const popup = onPopupChange ? popupDaFuori ?? null : popupInterno;
  const apriPopup = (p: PopupAperto) => (onPopupChange ? onPopupChange(p) : setPopupInterno(p));
  // External wizard state (es. Meta)
  const [externalWizardId, setExternalWizardId] = useState<string | null>(null);

  const filteredItems = useMemo(
    () => (activeCategory === "tutte" ? items : items.filter((i) => i.category === activeCategory)),
    [items, activeCategory],
  );

  // Counter per pillole (basato sull'intero catalogo, non sul filtro corrente)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { tutte: items.length };
    for (const cat of CATEGORY_ORDER) {
      if (cat === "tutte") continue;
      counts[cat] = items.filter((i) => i.category === cat).length;
    }
    return counts;
  }, [items]);

  const collegate = items.filter((i) => eCollegata(statuses[i.id]?.status)).length;

  const handleAction = (item: IntegrationItem) => {
    if (!canManage) {
      toast.error("Solo un amministratore aziendale può gestire le integrazioni.");
      return;
    }
    // Un collegamento che non va (Meta) si apre sulla diagnosi, non sul
    // wizard da capo: lì ci sono i permessi mancanti e «Ricollega».
    const status = statuses[item.id]?.status ?? "disconnected";
    if (haProblemi(status) && item.troubleshoot && onTroubleshoot) {
      onTroubleshoot(item);
      return;
    }
    if (item.gestisciMode === "navigate") {
      if (item.pageHref) navigate(item.pageHref);
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
      if (item.pageHref) navigate(item.pageHref);
      return;
    }
    apriPopup({ id: item.id });
  };

  const activePopupItem = popup ? items.find((i) => i.id === popup.id) ?? null : null;
  const ActivePopupComponent = activePopupItem ? popupRegistry[activePopupItem.id] ?? null : null;

  const activeWizardItem = externalWizardId
    ? items.find((i) => i.id === externalWizardId) ?? null
    : null;
  const ActiveWizardComponent = activeWizardItem
    ? externalWizardRegistry[activeWizardItem.id] ?? null
    : null;

  return (
    <div className="space-y-4">
      {/* Pillole filtro + quante sono collegate */}
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORY_ORDER.map((cat) => {
          const active = activeCategory === cat;
          const count = categoryCounts[cat] ?? 0;
          if (cat !== "tutte" && count === 0) return null;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              aria-pressed={active}
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
                  "rounded-full px-1.5 text-[10px] tabular-nums",
                  active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          <span className="font-medium text-foreground">{collegate}</span> di {items.length} collegate
        </span>
      </div>

      {/* Grid */}
      {filteredItems.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          <Plug className="mx-auto mb-2 h-6 w-6 opacity-50" />
          Nessuna integrazione in questa categoria.
        </div>
      ) : (
        <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredItems.map((item) => {
            const status = statuses[item.id]?.status ?? "disconnected";
            const detail = statuses[item.id]?.detail;
            const stato = STATO[status];
            const connected = eCollegata(status);
            const problemi = haProblemi(status);
            const ctaLabel = problemi
              ? "Risolvi"
              : connected
                ? item.manageCtaLabel ?? "Gestisci"
                : item.connectCtaLabel ?? "Collega";
            const conDisconnetti = connected && !!onDisconnect && !item.senzaDisconnetti;
            const conMenu = !!item.pageHref || (connected && !!item.leadFormsMenu && !!onManageForms)
              || (!!item.troubleshoot && !!onTroubleshoot) || conDisconnetti;

            return (
              <Card
                key={item.id}
                className={cn(
                  "relative flex flex-col p-4 transition-colors hover:border-primary/40",
                  stato.tono === "attenzione" && "border-amber-300 dark:border-amber-800",
                  stato.tono === "errore" && "border-rose-300 dark:border-rose-900",
                )}
              >
                {/* Kebab menu */}
                {conMenu && (
                  <div className="absolute right-2 top-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground"
                          aria-label={`Altre azioni per ${item.name}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {item.pageHref && (
                          <DropdownMenuItem onClick={() => navigate(item.pageHref!)}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            {item.pageLabel ?? "Vai alla pagina"}
                          </DropdownMenuItem>
                        )}
                        {connected && item.leadFormsMenu && onManageForms && (
                          <DropdownMenuItem onClick={() => onManageForms(item)}>
                            <ListChecks className="mr-2 h-4 w-4" />
                            Moduli lead
                          </DropdownMenuItem>
                        )}
                        {item.troubleshoot && onTroubleshoot && (
                          <DropdownMenuItem onClick={() => onTroubleshoot(item)}>
                            <Wrench className="mr-2 h-4 w-4" />
                            Risolvi problemi
                          </DropdownMenuItem>
                        )}
                        {conDisconnetti && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => onDisconnect!(item)}
                              disabled={!canManage}
                            >
                              Disconnetti
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}

                {/* Header: icona + nome + categoria */}
                <div className="flex items-start gap-3 pr-6">
                  {renderLogo(item.Logo)}
                  <div className="min-w-0 flex-1 pt-0.5">
                    <h3 className="text-sm font-semibold leading-snug line-clamp-2">{item.name}</h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{CATEGORY_LABELS[item.category]}</p>
                  </div>
                </div>

                {/* Descrizione */}
                <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                  {item.description}
                </p>

                {/* Stato + azione in basso */}
                <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                  <div className="min-w-0">
                    <PallinoStato tono={stato.tono}>{stato.label}</PallinoStato>
                    {detail && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={detail}>
                        {detail}
                      </p>
                    )}
                  </div>
                  {/* Pulsante sempre contornato: chi ha problemi lo dice già il
                      bordo della scheda, e il riquadro «Da sistemare» in cima. */}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
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
          if (!open) apriPopup(null);
        }}
      >
        <DialogContent
          className={cn(
            "max-h-[90vh] overflow-y-auto",
            activePopupItem?.popupLargo ? "sm:max-w-3xl" : "sm:max-w-2xl",
          )}
        >
          {activePopupItem && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {renderLogo(activePopupItem.Logo, "h-8 w-8")}
                  {activePopupItem.name}
                </DialogTitle>
              </DialogHeader>
              {ActivePopupComponent && (
                <ActivePopupComponent onClose={() => apriPopup(null)} scheda={popup?.scheda} />
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
