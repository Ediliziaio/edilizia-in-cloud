/**
 * FamilyTemplateBulkDialog — Dialog di import MASSIVO di template articolo.
 *
 * Differenza da FamilyTemplatePicker:
 *  - FamilyTemplatePicker: 1 template alla volta, redirect a wizard articolo
 *  - FamilyTemplateBulkDialog: N template multi-select, batch RPC,
 *    rimaniamo in macro setup (no redirect)
 *
 * Use case principale: aperto automaticamente DOPO che l'utente ha:
 *  1. creato una nuova macrocategoria con un verticale (es. Serramenti)
 *  2. creato le subcategorie standard via SubcategorieTemplateDialog
 * → il sistema offre di pre-popolare il listino con gli articoli template
 * del verticale, mappando ogni template alla subcategoria appena creata
 * (auto-match per nome).
 *
 * Auto-mapping categoria:
 *  - Ogni template ha `categoria_slug` (es. "infissi")
 *  - Le subcategorie create hanno `nome` (es. "Infissi")
 *  - Match: `slug.toLowerCase() === nome.toLowerCase().replace(/\s/g, '_')`
 *  - Match also accepts `slug === nome.toLowerCase()` per slug spaziati
 *  - Se nessun match, categoria_id = NULL (la famiglia è sotto macro senza
 *    subcategoria — il commerciale può spostarla dopo)
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Package, Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useArticleFamilyTemplates,
  useImportArticleFamilyTemplatesBatch,
  type ArticleFamilyTemplate,
} from "@/hooks/useArticleFamilyTemplates";
import type { ListinoCategoria } from "@/hooks/useListinoCategorie";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  /** Verticale per cui caricare i template (es. "serramenti"). */
  vertical: string | null;
  /** Macrocategoria di destinazione. Riservato per future RPC che assegnano
   *  esplicitamente macrocategoria_id sulle famiglie; oggi la macro è
   *  derivata via categoria (categoriaId → macrocategoria_id su listino_categorie). */
  macroId: string;
  macroNome: string;
  /** Categorie esistenti sotto questa macro (per auto-match categoria_slug). */
  availableCategorie: ListinoCategoria[];
  /** Callback dopo import riuscito (lista degli id famiglia creati). */
  onImported?: (familyIds: string[]) => void;
}

/**
 * Normalizza una stringa per matching: lowercase, trim, spazi→underscore.
 * Es. "Porta Finestra" → "porta_finestra", "Infissi" → "infissi".
 */
function normalizeForMatch(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, "_");
}

/**
 * Cerca tra le categorie disponibili quella che matcha lo slug del template.
 * Auto-match basato sul nome normalizzato; se nessun match, restituisce null.
 */
function autoMatchCategoria(
  templateCategoriaSlug: string | null,
  categorie: ListinoCategoria[],
): string | null {
  if (!templateCategoriaSlug) return null;
  const target = normalizeForMatch(templateCategoriaSlug);
  const match = categorie.find((c) => normalizeForMatch(c.nome) === target);
  return match?.id ?? null;
}

export function FamilyTemplateBulkDialog({
  open, onOpenChange, companyId, vertical,
  macroId: _macroId,
  macroNome,
  availableCategorie, onImported,
}: Props) {
  const { data: templates = [], isLoading } = useArticleFamilyTemplates({
    vertical: vertical,
  });
  const batchImport = useImportArticleFamilyTemplatesBatch();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  // Pre-seleziona TUTTI i template ad apertura (UX: "vuoi tutto pronto?").
  // L'utente deseleziona ciò che non vuole. Per dataset di ~23 elementi è
  // più rapido che selezionare uno a uno.
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

  // Calcolo statistiche match categoria per UI feedback.
  const stats = useMemo(() => {
    let matched = 0;
    let unmatched = 0;
    selectedIds.forEach((id) => {
      const t = templates.find((x) => x.id === id);
      if (!t) return;
      if (autoMatchCategoria(t.categoria_slug, availableCategorie)) matched++;
      else unmatched++;
    });
    return { matched, unmatched };
  }, [selectedIds, templates, availableCategorie]);

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(templates.map((t) => t.id)));
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    if (selectedIds.size === 0) return;
    const items = Array.from(selectedIds).map((id) => {
      const t = templates.find((x) => x.id === id)!;
      return {
        templateId: id,
        categoriaId: autoMatchCategoria(t.categoria_slug, availableCategorie),
      };
    });

    try {
      const result = await batchImport.mutateAsync({ companyId, items });
      if (result.failed.length === 0) {
        toast.success(`${result.created.length} articoli importati`, {
          description: macroNome ? `Aggiunti sotto "${macroNome}"` : undefined,
        });
      } else {
        toast.warning(`${result.created.length} importati, ${result.failed.length} falliti`, {
          description: `Errore: ${result.failed[0]?.error ?? "sconosciuto"}`,
        });
      }
      onImported?.(result.created);
      onOpenChange(false);
    } catch (err) {
      toast.error("Import fallito", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    }
  };

  // Raggruppa templates per tipologia per UI piu' leggibile (es. Finestre,
  // Porte Finestre, Fissi...). Ordina come da DB (sort_order ASC).
  const grouped = useMemo(() => {
    const map = new Map<string, ArticleFamilyTemplate[]>();
    for (const t of templates) {
      const key = t.tipologia ?? "altro";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries());
  }, [templates]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!batchImport.isPending) onOpenChange(o); }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-orange-600" />
            Importa articoli template
          </DialogTitle>
          <DialogDescription>
            Pre-popola <strong>{macroNome}</strong> con gli articoli standard del verticale.
            Ogni template viene clonato nel tuo listino con foto, variabili (Colore, Tipologia Vetro) e griglia prezzi pronta da compilare.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Caricamento template…</span>
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            <Package className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
            <p>Nessun template articolo disponibile per questo verticale.</p>
            <p className="text-xs mt-1">Puoi sempre creare articoli manualmente dal catalogo.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b pb-2 shrink-0">
              <span className="text-xs text-muted-foreground">
                {selectedIds.size}/{templates.length} selezionati
                {selectedIds.size > 0 && (
                  <span className="ml-2">
                    · <span className="text-emerald-700">{stats.matched} con subcategoria</span>
                    {stats.unmatched > 0 && (
                      <span className="text-amber-700"> · {stats.unmatched} senza match</span>
                    )}
                  </span>
                )}
              </span>
              <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs h-7">
                {allSelected ? "Deseleziona tutti" : "Seleziona tutti"}
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-3 min-h-0">
              {grouped.map(([tipo, items]) => (
                <section key={tipo}>
                  <h4 className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground sticky top-0 bg-background py-1">
                    {prettyLabel(tipo)} · {items.length}
                  </h4>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {items.map((t) => {
                      const checked = selectedIds.has(t.id);
                      const categoriaMatch = autoMatchCategoria(t.categoria_slug, availableCategorie);
                      const matchedCategoria = categoriaMatch
                        ? availableCategorie.find((c) => c.id === categoriaMatch)
                        : null;
                      return (
                        <li
                          key={t.id}
                          onClick={() => toggleOne(t.id)}
                          className={cn(
                            "flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors",
                            checked
                              ? "border-orange-300 bg-orange-50/60"
                              : "border-slate-200 hover:bg-accent/40",
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleOne(t.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0"
                          />
                          {t.image_url ? (
                            <img
                              src={t.thumbnail_url ?? t.image_url}
                              alt=""
                              className="h-9 w-9 object-cover rounded shrink-0 bg-slate-100"
                              loading="lazy"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                            />
                          ) : (
                            <div className="h-9 w-9 rounded bg-slate-100 flex items-center justify-center shrink-0">
                              <Package className="h-4 w-4 text-muted-foreground/40" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium leading-tight truncate">{t.nome}</p>
                            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 flex items-center gap-1 flex-wrap">
                              {matchedCategoria ? (
                                <Badge variant="outline" className="text-[9px] h-4 px-1 border-emerald-300 text-emerald-700">
                                  <Check className="h-2.5 w-2.5 mr-0.5" />
                                  {matchedCategoria.nome}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-300 text-amber-700">
                                  no subcategoria
                                </Badge>
                              )}
                              {t.materiale && <span>{t.materiale}</span>}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}

        <DialogFooter className="border-t pt-3 sm:items-center sm:justify-between flex-wrap gap-2 shrink-0">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={batchImport.isPending}
          >
            Salta — creo manualmente
          </Button>
          <Button
            onClick={handleImport}
            disabled={selectedIds.size === 0 || batchImport.isPending}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {batchImport.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importazione {selectedIds.size}…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" />Importa {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function prettyLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
