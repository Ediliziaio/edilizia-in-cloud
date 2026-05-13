/**
 * SubcategorieTemplateDialog — Dialog di suggerimento subcategorie standard.
 *
 * Aperto automaticamente subito dopo aver creato una nuova macrocategoria,
 * propone N subcategorie consigliate per il verticale (es. Serramenti →
 * Infissi/Persiane/Tapparelle/...) con tutte preselezionate. L'utente
 * deseleziona quelle che non gli servono e clicca "Crea". Il sistema chiama
 * la RPC `apply_subcategorie_template` che le inserisce in transazione.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, FolderTree, Sparkles } from "lucide-react";
import {
  useSubcategorieTemplates,
  useApplySubcategorieTemplate,
} from "@/hooks/useSubcategorieTemplates";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Verticale per cui caricare i suggerimenti (es. "serramenti"). */
  vertical: string | null;
  /** Macrocategoria sotto cui creare le subcategorie selezionate. */
  macrocategoriaId: string | null;
  /** Nome macro (per UI). */
  macrocategoriaNome?: string;
  /** Callback dopo applicazione riuscita (riceve gli id creati). */
  onApplied?: (createdIds: string[]) => void;
}

export function SubcategorieTemplateDialog({
  open, onOpenChange, vertical, macrocategoriaId, macrocategoriaNome, onApplied,
}: Props) {
  const { data: templates = [], isLoading } = useSubcategorieTemplates(open ? vertical : null);
  const apply = useApplySubcategorieTemplate();

  // Tutte preselezionate per default — l'utente deseleziona ciò che non vuole.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && templates.length > 0) {
      setSelectedIds(new Set(templates.map((t) => t.id)));
    }
    if (!open) {
      setSelectedIds(new Set());
    }
  }, [open, templates]);

  const allSelected = useMemo(
    () => templates.length > 0 && selectedIds.size === templates.length,
    [templates, selectedIds],
  );

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(templates.map((t) => t.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApply = async () => {
    if (!macrocategoriaId || selectedIds.size === 0) return;
    try {
      const ids = await apply.mutateAsync({
        macrocategoriaId,
        templateIds: Array.from(selectedIds),
      });
      if (ids.length === 0) {
        toast.info("Nessuna nuova subcategoria creata", {
          description: "Esistevano già subcategorie con questi nomi.",
        });
      } else {
        toast.success(`${ids.length} ${ids.length === 1 ? "subcategoria creata" : "subcategorie create"}`, {
          description: macrocategoriaNome ? `Sotto "${macrocategoriaNome}"` : undefined,
        });
      }
      onApplied?.(ids);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore durante l'applicazione";
      toast.error("Operazione fallita", { description: msg });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!apply.isPending) onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-orange-600" />
            Crea subcategorie standard
          </DialogTitle>
          <DialogDescription>
            {macrocategoriaNome ? (
              <>Crea automaticamente le subcategorie tipiche del settore sotto <strong>{macrocategoriaNome}</strong>. Deseleziona quelle che non ti servono.</>
            ) : (
              <>Crea automaticamente le subcategorie tipiche del settore. Deseleziona quelle che non ti servono.</>
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Caricamento suggerimenti…</span>
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <FolderTree className="h-10 w-10 mx-auto opacity-30 mb-2" />
            Nessun suggerimento disponibile per questo verticale.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b pb-2 mb-1">
              <span className="text-xs text-muted-foreground">
                {selectedIds.size}/{templates.length} selezionate
              </span>
              <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs h-7">
                {allSelected ? "Deseleziona tutte" : "Seleziona tutte"}
              </Button>
            </div>
            <ul className="space-y-1 max-h-96 overflow-y-auto">
              {templates.map((t) => {
                const checked = selectedIds.has(t.id);
                return (
                  <li
                    key={t.id}
                    className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-accent/40 cursor-pointer"
                    onClick={() => toggleOne(t.id)}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleOne(t.id)}
                      className="mt-0.5"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-tight">{t.nome}</div>
                      {t.descrizione && (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {t.descrizione}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <DialogFooter className="border-t pt-3 sm:items-center sm:justify-between flex-wrap gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={apply.isPending}>
            Salta — creo manualmente
          </Button>
          <Button
            onClick={handleApply}
            disabled={selectedIds.size === 0 || apply.isPending || !macrocategoriaId}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {apply.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creazione…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" />Crea {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
