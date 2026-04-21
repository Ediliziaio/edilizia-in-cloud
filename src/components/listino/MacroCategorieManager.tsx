/**
 * MacroCategorieManager — Catalogo a 3 livelli (Sprint A §4.4).
 *
 * Pannello CRUD gerarchico per MACROCATEGORIE e CATEGORIE listino.
 * Esempio di struttura gestita:
 *
 *   INFISSO MODELLO 1 (macrocategoria)
 *     ├─ FINESTRA 1 ANTA (categoria)
 *     ├─ FINESTRA 2 ANTE (categoria)
 *     └─ PORTA FINESTRA 1 ANTA (categoria)
 *   ACCESSORI (macrocategoria)
 *     └─ ...
 *   ZANZARIERE (macrocategoria)
 *     └─ ...
 *   Senza macrocategoria (gruppo orfani)
 *     └─ categorie senza macrocat assegnata
 *
 * Design:
 *  - Un Accordion per macrocat. Header = nome + count + azioni.
 *  - Categorie elencate sotto come rows con azioni edit/delete/move.
 *  - Modal unico riutilizzato per create/edit di entrambi i livelli.
 *  - Tutto opera via hook dedicati → invalidation automatica.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Folder,
  FolderOpen,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useListinoMacrocategorie,
  useMacrocategorieMutations,
  type ListinoMacrocategoria,
} from "@/hooks/useListinoMacrocategorie";
import {
  useListinoCategorie,
  useCategorieMutations,
  type ListinoCategoria,
} from "@/hooks/useListinoCategorie";
import { translateListinoError } from "@/lib/listinoErrors";

// ─────────────────────────────────────────────────────────────────────────
// Helper tipi interni
// ─────────────────────────────────────────────────────────────────────────
type EditMode =
  | { kind: "none" }
  | { kind: "macro-new" }
  | { kind: "macro-edit"; row: ListinoMacrocategoria }
  | { kind: "cat-new"; macrocategoriaId: string | null }
  | { kind: "cat-edit"; row: ListinoCategoria };

type DeleteTarget =
  | { kind: "macro"; row: ListinoMacrocategoria; childCount: number }
  | { kind: "cat"; row: ListinoCategoria };

// ─────────────────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────────────────
export function MacroCategorieManager() {
  const { macrocategorie, isLoading: loadingMacro } = useListinoMacrocategorie();
  const { categorie, isLoading: loadingCat } = useListinoCategorie();
  const { createMacrocategoria, updateMacrocategoria, deleteMacrocategoria } =
    useMacrocategorieMutations();
  const { createCategoria, updateCategoria, deleteCategoria } = useCategorieMutations();

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set<string>());
  const [editMode, setEditMode] = useState<EditMode>({ kind: "none" });
  const [toDelete, setToDelete] = useState<DeleteTarget | null>(null);

  // Form state (riutilizzato per tutti i modal)
  const [formNome, setFormNome] = useState("");
  const [formDescrizione, setFormDescrizione] = useState("");
  const [formMacroId, setFormMacroId] = useState<string | "none">("none");

  // Raggruppa categorie per macrocategoria_id (null → orfane)
  const byMacroId = useMemo(() => {
    const m = new Map<string | null, ListinoCategoria[]>();
    for (const c of categorie) {
      const key = c.macrocategoria_id;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(c);
    }
    return m;
  }, [categorie]);

  const orfane = byMacroId.get(null) ?? [];

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openForm = (mode: EditMode) => {
    setEditMode(mode);
    if (mode.kind === "macro-edit") {
      setFormNome(mode.row.nome);
      setFormDescrizione(mode.row.descrizione ?? "");
      setFormMacroId("none");
    } else if (mode.kind === "cat-edit") {
      setFormNome(mode.row.nome);
      setFormDescrizione(mode.row.descrizione ?? "");
      setFormMacroId(mode.row.macrocategoria_id ?? "none");
    } else if (mode.kind === "cat-new") {
      setFormNome("");
      setFormDescrizione("");
      setFormMacroId(mode.macrocategoriaId ?? "none");
    } else {
      setFormNome("");
      setFormDescrizione("");
      setFormMacroId("none");
    }
  };

  const closeForm = () => {
    setEditMode({ kind: "none" });
    setFormNome("");
    setFormDescrizione("");
    setFormMacroId("none");
  };

  const saving =
    createMacrocategoria.isPending ||
    updateMacrocategoria.isPending ||
    createCategoria.isPending ||
    updateCategoria.isPending;

  // Validazione duplicati client-side: evita round-trip al DB per errori
  // prevedibili (UNIQUE constraint su nome). Case-insensitive + trim.
  const isDuplicateName = (
    nome: string,
    kind: "macro" | "cat",
    excludeId?: string,
  ): boolean => {
    const normalized = nome.trim().toLocaleLowerCase("it-IT");
    if (kind === "macro") {
      return macrocategorie.some(
        (m) =>
          m.id !== excludeId &&
          m.nome.trim().toLocaleLowerCase("it-IT") === normalized,
      );
    }
    return categorie.some(
      (c) =>
        c.id !== excludeId &&
        c.nome.trim().toLocaleLowerCase("it-IT") === normalized,
    );
  };

  const handleSubmit = async () => {
    const nome = formNome.trim();
    if (!nome) {
      toast.error("Nome obbligatorio");
      return;
    }

    // Pre-check duplicati (UX: messaggio immediato invece di errore DB).
    const isMacro = editMode.kind === "macro-new" || editMode.kind === "macro-edit";
    const excludeId =
      editMode.kind === "macro-edit"
        ? editMode.row.id
        : editMode.kind === "cat-edit"
          ? editMode.row.id
          : undefined;
    if (isDuplicateName(nome, isMacro ? "macro" : "cat", excludeId)) {
      toast.error(
        isMacro
          ? "Esiste già una macrocategoria con questo nome."
          : "Esiste già una categoria con questo nome.",
      );
      return;
    }

    try {
      if (editMode.kind === "macro-new") {
        await createMacrocategoria.mutateAsync({
          nome,
          descrizione: formDescrizione.trim() || null,
        });
        toast.success("Macrocategoria creata");
      } else if (editMode.kind === "macro-edit") {
        await updateMacrocategoria.mutateAsync({
          id: editMode.row.id,
          patch: { nome, descrizione: formDescrizione.trim() || null },
        });
        toast.success("Macrocategoria aggiornata");
      } else if (editMode.kind === "cat-new") {
        await createCategoria.mutateAsync({
          nome,
          descrizione: formDescrizione.trim() || null,
          macrocategoria_id: formMacroId === "none" ? null : formMacroId,
        });
        toast.success("Categoria creata");
      } else if (editMode.kind === "cat-edit") {
        await updateCategoria.mutateAsync({
          id: editMode.row.id,
          patch: {
            nome,
            descrizione: formDescrizione.trim() || null,
            macrocategoria_id: formMacroId === "none" ? null : formMacroId,
          },
        });
        toast.success("Categoria aggiornata");
      }
      closeForm();
    } catch (err) {
      const { message, isTransient } = translateListinoError(err);
      toast.error("Errore salvataggio", {
        description: message,
        // Su errori transitori (es. schema cache), suggerisci retry rapido.
        ...(isTransient && {
          action: {
            label: "Riprova",
            onClick: () => void handleSubmit(),
          },
        }),
      });
    }
  };

  const deleting = deleteMacrocategoria.isPending || deleteCategoria.isPending;

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      if (toDelete.kind === "macro") {
        await deleteMacrocategoria.mutateAsync(toDelete.row.id);
        toast.success("Macrocategoria eliminata", {
          description:
            toDelete.childCount > 0
              ? `Le ${toDelete.childCount} categorie collegate sono ora senza macrocategoria.`
              : undefined,
        });
      } else {
        await deleteCategoria.mutateAsync(toDelete.row.id);
        toast.success("Categoria eliminata");
      }
      setToDelete(null);
    } catch (err) {
      const { message } = translateListinoError(err);
      toast.error("Errore eliminazione", { description: message });
    }
  };

  const isLoading = loadingMacro || loadingCat;

  const formTitle =
    editMode.kind === "macro-new"
      ? "Nuova macrocategoria"
      : editMode.kind === "macro-edit"
        ? "Modifica macrocategoria"
        : editMode.kind === "cat-new"
          ? "Nuova categoria"
          : editMode.kind === "cat-edit"
            ? "Modifica categoria"
            : "";

  const isCatForm = editMode.kind === "cat-new" || editMode.kind === "cat-edit";

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">Macrocategorie e categorie</CardTitle>
          <p className="text-sm text-muted-foreground">
            Organizza il listino in 2 livelli. Esempio:{" "}
            <span className="font-medium">INFISSO MODELLO 1 → FINESTRA 1 ANTA</span>. Sotto
            ogni categoria potrai creare gli articoli con i loro prezzi.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openForm({ kind: "cat-new", macrocategoriaId: null })}
          >
            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
            Nuova categoria
          </Button>
          <Button size="sm" onClick={() => openForm({ kind: "macro-new" })}>
            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
            Nuova macrocategoria
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" aria-hidden="true" />
            Caricamento…
          </div>
        ) : macrocategorie.length === 0 && orfane.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground space-y-3">
            <Folder className="h-8 w-8 mx-auto opacity-60" aria-hidden="true" />
            <div>
              <p className="font-medium mb-1 text-foreground">
                Nessuna macrocategoria configurata
              </p>
              <p>
                Crea la prima macrocategoria (es. <em>INFISSO MODELLO 1</em>) per iniziare
                a strutturare il listino. Le categorie (es. <em>FINESTRA 1 ANTA</em>)
                andranno al suo interno.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center pt-1">
              <Button size="sm" onClick={() => openForm({ kind: "macro-new" })}>
                <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                Crea macrocategoria
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openForm({ kind: "cat-new", macrocategoriaId: null })}
              >
                <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                Solo categoria (senza macro)
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {macrocategorie.map((m) => {
              const figlie = byMacroId.get(m.id) ?? [];
              const isOpen = expanded.has(m.id);
              return (
                <MacroRow
                  key={m.id}
                  macro={m}
                  categorie={figlie}
                  isOpen={isOpen}
                  onToggle={() => toggleExpanded(m.id)}
                  onEditMacro={() => openForm({ kind: "macro-edit", row: m })}
                  onDeleteMacro={() =>
                    setToDelete({ kind: "macro", row: m, childCount: figlie.length })
                  }
                  onAddCategoria={() =>
                    openForm({ kind: "cat-new", macrocategoriaId: m.id })
                  }
                  onEditCategoria={(row) => openForm({ kind: "cat-edit", row })}
                  onDeleteCategoria={(row) => setToDelete({ kind: "cat", row })}
                />
              );
            })}

            {/* Gruppo categorie orfane (senza macrocat) */}
            {orfane.length > 0 && (
              <div className="rounded-lg border border-dashed bg-muted/30">
                <div className="flex items-center justify-between gap-2 p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Folder className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="font-medium text-sm">Senza macrocategoria</span>
                    <Badge variant="secondary" className="shrink-0">
                      {orfane.length}
                    </Badge>
                  </div>
                </div>
                <ul className="divide-y">
                  {orfane.map((c) => (
                    <CategoriaRow
                      key={c.id}
                      row={c}
                      onEdit={() => openForm({ kind: "cat-edit", row: c })}
                      onDelete={() => setToDelete({ kind: "cat", row: c })}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Dialog create/edit unificato */}
      <Dialog
        open={editMode.kind !== "none"}
        onOpenChange={(open) => {
          if (saving) return;
          if (!open) closeForm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{formTitle}</DialogTitle>
            <DialogDescription>
              {isCatForm
                ? "Una categoria può essere dentro una macrocategoria oppure indipendente."
                : "Le macrocategorie sono il livello più alto (es. INFISSO MODELLO 1)."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="mc-nome">Nome *</Label>
              <Input
                id="mc-nome"
                value={formNome}
                onChange={(e) => setFormNome(e.target.value)}
                placeholder={isCatForm ? "es. FINESTRA 1 ANTA" : "es. INFISSO MODELLO 1"}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && formNome.trim() && !saving) {
                    e.preventDefault();
                    void handleSubmit();
                  }
                }}
              />
            </div>
            <div>
              <Label htmlFor="mc-descrizione">Descrizione (opzionale)</Label>
              <Textarea
                id="mc-descrizione"
                value={formDescrizione}
                onChange={(e) => setFormDescrizione(e.target.value)}
                rows={2}
              />
            </div>
            {isCatForm && (
              <div>
                <Label htmlFor="mc-macro">Macrocategoria</Label>
                <Select value={formMacroId} onValueChange={setFormMacroId}>
                  <SelectTrigger id="mc-macro">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Nessuna (indipendente) —</SelectItem>
                    {macrocategorie.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
            <Button variant="ghost" onClick={closeForm} disabled={saving}>
              Annulla
            </Button>
            <Button onClick={handleSubmit} disabled={!formNome.trim() || saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  Salvataggio…
                </>
              ) : (
                "Salva"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog eliminazione */}
      <AlertDialog
        open={!!toDelete}
        onOpenChange={(open) => {
          if (deleting) return;
          if (!open) setToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toDelete?.kind === "macro"
                ? `Eliminare "${toDelete.row.nome}"?`
                : `Eliminare "${toDelete?.row.nome}"?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.kind === "macro" ? (
                <>
                  {toDelete.childCount > 0 ? (
                    <>
                      Le <strong>{toDelete.childCount}</strong> categorie collegate
                      diventeranno &quot;senza macrocategoria&quot;. Gli articoli non verranno
                      eliminati.
                    </>
                  ) : (
                    "Nessuna categoria è collegata. Puoi procedere."
                  )}
                </>
              ) : (
                "Gli articoli collegati a questa categoria non verranno eliminati, ma perderanno il riferimento."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
            <AlertDialogCancel disabled={deleting} className="mt-0">
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  Eliminazione…
                </>
              ) : (
                "Elimina"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sotto-componenti di presentazione
// ─────────────────────────────────────────────────────────────────────────
interface MacroRowProps {
  macro: ListinoMacrocategoria;
  categorie: ListinoCategoria[];
  isOpen: boolean;
  onToggle: () => void;
  onEditMacro: () => void;
  onDeleteMacro: () => void;
  onAddCategoria: () => void;
  onEditCategoria: (row: ListinoCategoria) => void;
  onDeleteCategoria: (row: ListinoCategoria) => void;
}

function MacroRow({
  macro,
  categorie,
  isOpen,
  onToggle,
  onEditMacro,
  onDeleteMacro,
  onAddCategoria,
  onEditCategoria,
  onDeleteCategoria,
}: MacroRowProps) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 p-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2 flex-1 min-w-0 text-left hover:text-primary transition-colors"
          aria-expanded={isOpen}
          aria-label={isOpen ? `Chiudi ${macro.nome}` : `Apri ${macro.nome}`}
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          {isOpen ? (
            <FolderOpen className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
          ) : (
            <Folder className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
          )}
          <span className="font-medium truncate">{macro.nome}</span>
          <Badge variant="secondary" className="shrink-0">
            {categorie.length}
          </Badge>
        </button>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={onAddCategoria} title="Aggiungi categoria">
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onEditMacro} title="Modifica">
            <Edit2 className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDeleteMacro}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            title="Elimina"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {isOpen && (
        <div className="border-t">
          {categorie.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Nessuna categoria in questa macrocategoria.
              <Button
                variant="link"
                size="sm"
                onClick={onAddCategoria}
                className="h-auto p-0 ml-1"
              >
                Aggiungi la prima <ArrowRight className="h-3 w-3 ml-1" aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <ul className="divide-y">
              {categorie.map((c) => (
                <CategoriaRow
                  key={c.id}
                  row={c}
                  onEdit={() => onEditCategoria(c)}
                  onDelete={() => onDeleteCategoria(c)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

interface CategoriaRowProps {
  row: ListinoCategoria;
  onEdit: () => void;
  onDelete: () => void;
}

function CategoriaRow({ row, onEdit, onDelete }: CategoriaRowProps) {
  return (
    <li className="flex items-center justify-between gap-2 pl-9 pr-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="h-1 w-1 rounded-full bg-muted-foreground shrink-0" aria-hidden="true" />
        <span className="truncate">{row.nome}</span>
        {row.descrizione && (
          <span className="text-xs text-muted-foreground truncate hidden sm:inline">
            — {row.descrizione}
          </span>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        <Button variant="ghost" size="sm" onClick={onEdit} title="Modifica">
          <Edit2 className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          title="Elimina"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}
