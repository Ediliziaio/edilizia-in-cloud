/**
 * NewDashboardDialog — picker "scegli da dove iniziare" mostrato al click su
 * "Nuova dashboard" in /azienda/dashboards.
 *
 * Opzioni:
 *   1. Inizia da zero → naviga al builder con layout vuoto.
 *   2. Template predefinito → clona via RPC `clone_template_to_company` e
 *      naviga a `:id/modifica` con la dashboard clonata già in edit mode.
 *
 * I template sono caricati via `useDashboardTemplates()` dal backend
 * (tabella `public.dashboard_templates`) e mostrano nome, descrizione,
 * categoria e ruoli consigliati.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  LayoutDashboard,
  Plus,
  TrendingUp,
  HardHat,
  Wallet,
  Users,
  Briefcase,
  LayoutGrid,
  Check,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useCloneTemplateToCompany,
  useDashboardTemplates,
} from "@/lib/dashboardBuilder/hooks";
import { toast } from "@/hooks/use-toast";
import type { AppRole, DashboardTemplate } from "@/lib/dashboardBuilder/types";

// ─────────────────────────────────────────────────────────────────
// Mappatura nome-icona (string dal DB) → componente Lucide
// ─────────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  "layout-dashboard": LayoutDashboard,
  "trending-up": TrendingUp,
  "hard-hat": HardHat,
  wallet: Wallet,
  users: Users,
  briefcase: Briefcase,
};

function iconFor(name: string | null | undefined) {
  if (!name) return LayoutGrid;
  return ICON_MAP[name] ?? LayoutGrid;
}

const ROLE_LABELS: Partial<Record<AppRole, string>> = {
  super_admin: "Super admin",
  company_admin: "Admin",
  company_staff: "Staff",
  salesperson: "Commerciale",
  call_center: "Call center",
  employee: "Operaio",
};

// ─────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewDashboardDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const templates = useDashboardTemplates();
  const clone = useCloneTemplateToCompany();
  const [choice, setChoice] = useState<string | null>(null); // "blank" | template_id

  const handleStartBlank = () => {
    setChoice("blank");
    onOpenChange(false);
    navigate("/azienda/dashboards/nuova");
  };

  const handlePickTemplate = async (tpl: DashboardTemplate) => {
    try {
      setChoice(tpl.id);
      const newId = await clone.mutateAsync({
        templateId: tpl.id,
        scope: "personal",
        name: tpl.name,
      });
      onOpenChange(false);
      toast({
        title: "Dashboard creata",
        description: `"${tpl.name}" è pronta — personalizzala come vuoi.`,
      });
      navigate(`/azienda/dashboards/${newId}/modifica`);
    } catch (e) {
      setChoice(null);
      toast({
        title: "Errore nella creazione",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  const isCloning = clone.isPending;
  const items = templates.data ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => !isCloning && onOpenChange(v)}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b bg-muted/30">
          <DialogHeader className="text-left">
            <DialogTitle className="text-xl">Nuova dashboard</DialogTitle>
            <DialogDescription>
              Parti da un template predefinito — lo personalizzi dopo — oppure
              inizia da un canvas vuoto.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 py-5 max-h-[70vh] overflow-auto">
          {/* Blank start card */}
          <button
            type="button"
            onClick={handleStartBlank}
            disabled={isCloning}
            className={cn(
              "w-full flex items-center gap-4 p-4 rounded-xl border-2 border-dashed text-left transition-all",
              "hover:border-primary hover:bg-primary/5",
              isCloning && "opacity-50 pointer-events-none",
            )}
          >
            <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Plus className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Inizia da zero</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Canvas vuoto: aggiungi widget dalla palette.
              </p>
            </div>
            <span className="text-[11px] text-muted-foreground/80 shrink-0 hidden sm:inline">
              ⌘ Nuovo
            </span>
          </button>

          {/* Templates */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Template predefiniti
              </p>
              {templates.isFetching && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
            </div>

            {templates.isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-28 rounded-xl border bg-muted/40 animate-pulse"
                  />
                ))}
              </div>
            ) : templates.error ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                Errore nel caricamento dei template:{" "}
                {(templates.error as Error).message}
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                Nessun template predefinito disponibile.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map((tpl) => {
                  const Icon = iconFor(tpl.icon);
                  const isActive = choice === tpl.id && isCloning;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => handlePickTemplate(tpl)}
                      disabled={isCloning}
                      className={cn(
                        "group relative text-left p-4 rounded-xl border bg-card transition-all",
                        "hover:border-primary/60 hover:shadow-sm hover:-translate-y-0.5",
                        isCloning && !isActive && "opacity-50 pointer-events-none",
                        isActive && "border-primary ring-2 ring-primary/20",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                          {isActive ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <Icon className="h-5 w-5" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">
                            {tpl.name}
                          </p>
                          {tpl.description && (
                            <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                              {tpl.description}
                            </p>
                          )}
                          {tpl.target_roles && tpl.target_roles.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {tpl.target_roles.slice(0, 3).map((r) => (
                                <Badge
                                  key={r}
                                  variant="secondary"
                                  className="text-[10px] font-normal h-[18px] px-1.5"
                                >
                                  {ROLE_LABELS[r] ?? r}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {isActive && (
                        <span className="absolute top-2 right-2 text-[10px] inline-flex items-center gap-1 text-primary">
                          <Check className="h-3 w-3" /> Clonazione…
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <p className="text-[11px] text-muted-foreground mt-4 leading-snug">
              I template vengono copiati nella tua area personale: puoi modificarli
              liberamente senza alterare l'originale. Se serve condividerli con
              l'azienda, cambia la visibilità dopo la creazione.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-3 border-t bg-muted/20">
          <span className="text-[11px] text-muted-foreground">
            {items.length > 0 && `${items.length} template disponibili`}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isCloning}
          >
            Annulla
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
