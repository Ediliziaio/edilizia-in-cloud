/**
 * DashboardCardMenu — menu azioni contestuale mostrato su ogni card
 * della lista dashboard (/azienda/dashboards).
 *
 * Azioni esposte:
 *   • Apri / Modifica  (solo chi può editare)
 *   • Duplica          → salva copia via `save_dashboard(dashboardId=null)`
 *   • Rinomina         → prompt inline in un Dialog
 *   • Imposta default  → `set_default_dashboard`
 *   • Cambia scope     → personale ↔ condivisa (`update_dashboard_scope`)
 *   • Elimina          → `delete_dashboard` con AlertDialog di conferma
 *
 * Design: bottone icona `MoreVertical` in alto a destra della card, stopPropagation
 * per non attivare il Link che avvolge la card.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MoreVertical,
  Copy,
  Pencil,
  Star,
  StarOff,
  Users,
  Lock,
  Trash2,
  Eye,
  Edit3,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useDeleteDashboard,
  useSaveDashboard,
  useSetDefaultDashboard,
  useUpdateDashboardScope,
} from "@/lib/dashboardBuilder/hooks";
import { getDashboard } from "@/lib/dashboardBuilder/api";
import { toast } from "@/hooks/use-toast";
import type { DashboardListItem } from "@/lib/dashboardBuilder/types";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  dashboard: DashboardListItem;
  /** Se true il proprietario può modificare. Passato dalla lista. */
  canEdit?: boolean;
}

export function DashboardCardMenu({ dashboard, canEdit = true }: Props) {
  const t = useT();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(dashboard.name);

  // Mutation hooks — l'intera lista si invalida in onSuccess.
  const deleteDash = useDeleteDashboard();
  const setDefault = useSetDefaultDashboard();
  const updateScope = useUpdateDashboardScope();
  const saveDash = useSaveDashboard();

  // `getDashboard` viene chiamato al volo per duplicare/rinominare (ci serve il layout).
  const [fetchBusy, setFetchBusy] = useState(false);

  // ───────────────────────────────────────────────────────
  // Handlers
  // ───────────────────────────────────────────────────────

  const stop = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const handleDelete = async () => {
    try {
      await deleteDash.mutateAsync(dashboard.id);
      toast({
        title: t("Dashboard eliminata"),
        description: t("\"{name}\" è stata rimossa.", { name: String(dashboard.name ?? "") }),
      });
      setDeleteOpen(false);
    } catch (e) {
      toast({
        title: t("Errore nell'eliminazione"),
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleSetDefault = async () => {
    try {
      await setDefault.mutateAsync(dashboard.id);
      toast({
        title: t("Default aggiornato"),
        description: t("\"{name}\" è ora la tua dashboard di default.", { name: String(dashboard.name ?? "") }),
      });
    } catch (e) {
      toast({
        title: t("Errore"),
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleToggleScope = async () => {
    const next = dashboard.scope === "personal" ? "company" : "personal";
    try {
      await updateScope.mutateAsync({ dashboardId: dashboard.id, scope: next });
      toast({
        title: t("Visibilità aggiornata"),
        description:
          next === "company"
            ? t("Ora è visibile a tutta l'azienda.")
            : t("Ora è solo personale."),
      });
    } catch (e) {
      toast({
        title: t("Errore"),
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleDuplicate = async () => {
    setFetchBusy(true);
    try {
      const detail = await getDashboard(dashboard.id);
      const layout = detail.version?.layout;
      const meta = detail.dashboard;
      if (!layout || !meta) throw new Error(t("Layout non disponibile"));
      const copyName = `${meta.name} (copia)`;
      const result = await saveDash.mutateAsync({
        dashboardId: null,
        name: copyName,
        description: meta.description ?? null,
        scope: "personal",
        icon: meta.icon ?? null,
        layout,
        note: "Duplicato da " + meta.name,
      });
      toast({
        title: t("Dashboard duplicata"),
        description: t("\"{copyName}\" è pronta in area personale.", { copyName: String(copyName ?? "") }),
      });
      navigate(`/azienda/dashboards/${result.dashboard_id}`);
    } catch (e) {
      toast({
        title: t("Errore nella duplicazione"),
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setFetchBusy(false);
    }
  };

  const handleRenameCommit = async () => {
    const name = renameValue.trim();
    if (!name) {
      toast({
        title: t("Nome non valido"),
        description: t("Il nome non può essere vuoto."),
        variant: "destructive",
      });
      return;
    }
    if (name === dashboard.name) {
      setRenameOpen(false);
      return;
    }
    setFetchBusy(true);
    try {
      const detail = await getDashboard(dashboard.id);
      const layout = detail.version?.layout;
      const meta = detail.dashboard;
      if (!layout || !meta) throw new Error(t("Layout non disponibile"));
      await saveDash.mutateAsync({
        dashboardId: dashboard.id,
        name,
        description: meta.description ?? null,
        scope: (meta.scope ?? "personal") as
          | "personal"
          | "company"
          | `role:${string}`,
        icon: meta.icon ?? null,
        layout,
        note: "Rename",
      });
      toast({
        title: t("Rinominata"),
        description: t("Ora si chiama \"{name}\".", { name: String(name ?? "") }),
      });
      setRenameOpen(false);
    } catch (e) {
      toast({
        title: t("Errore nel rename"),
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setFetchBusy(false);
    }
  };

  const busy =
    deleteDash.isPending ||
    setDefault.isPending ||
    updateScope.isPending ||
    saveDash.isPending ||
    fetchBusy;

  // ───────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={stop}
            onKeyDown={(e) => e.key === " " && stop(e)}
            aria-label={t("Azioni dashboard")}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreVertical className="h-4 w-4" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onClick={stop}
          className="w-56"
        >
          <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground truncate">
            {dashboard.name}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={(e) => {
              stop(e);
              navigate(`/azienda/dashboards/${dashboard.id}`);
            }}
          >
            <Eye className="h-4 w-4 mr-2" /> {t("Apri")}
          </DropdownMenuItem>

          {canEdit && (
            <DropdownMenuItem
              onClick={(e) => {
                stop(e);
                navigate(`/azienda/dashboards/${dashboard.id}/modifica`);
              }}
            >
              <Edit3 className="h-4 w-4 mr-2" /> {t("Modifica")}
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onClick={(e) => {
              stop(e);
              handleDuplicate();
            }}
            disabled={busy}
          >
            <Copy className="h-4 w-4 mr-2" /> {t("Duplica")}
          </DropdownMenuItem>

          {canEdit && (
            <DropdownMenuItem
              onClick={(e) => {
                stop(e);
                setRenameValue(dashboard.name);
                setRenameOpen(true);
              }}
            >
              <Pencil className="h-4 w-4 mr-2" /> {t("Rinomina")}
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={(e) => {
              stop(e);
              handleSetDefault();
            }}
            disabled={busy || dashboard.is_default}
          >
            {dashboard.is_default ? (
              <>
                <StarOff className="h-4 w-4 mr-2" /> {t("Già default")}
              </>
            ) : (
              <>
                <Star className="h-4 w-4 mr-2" /> {t("Imposta come default")}
              </>
            )}
          </DropdownMenuItem>

          {canEdit && (
            <DropdownMenuItem
              onClick={(e) => {
                stop(e);
                handleToggleScope();
              }}
              disabled={busy}
            >
              {dashboard.scope === "personal" ? (
                <>
                  <Users className="h-4 w-4 mr-2" /> {t("Condividi con azienda")}
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 mr-2" /> {t("Rendi personale")}
                </>
              )}
            </DropdownMenuItem>
          )}

          {canEdit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  stop(e);
                  setDeleteOpen(true);
                }}
                disabled={busy}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" /> {t("Elimina")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialog rinomina */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent
          onClick={stop}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleRenameCommit();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("Rinomina dashboard")}</DialogTitle>
            <DialogDescription>
              {t("Il nome è mostrato nella lista e nel breadcrumb.")}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder={t("Nome dashboard")}
            maxLength={80}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRenameOpen(false)}
              disabled={busy}
            >
              {t("Annulla")}
            </Button>
            <Button
              onClick={handleRenameCommit}
              disabled={busy || !renameValue.trim()}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t("Salvataggio")}
                </>
              ) : (
                t("Salva")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conferma eliminazione */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent onClick={stop}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Eliminare questa dashboard?")}</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>&quot;{dashboard.name}&quot;</strong> {t("verrà eliminata insieme a tutte le sue versioni. Questa azione non può essere annullata.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("Annulla")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t("Elimino…")}
                </>
              ) : (
                t("Elimina")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
