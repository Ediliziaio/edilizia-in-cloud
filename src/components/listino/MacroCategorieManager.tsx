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

import { useState } from "react";
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
  Settings2,
  Sparkles,
  Tag,
  Upload,
  X as XIcon,
  ImageIcon,
  FileText,
} from "lucide-react";
import { useRef } from "react";
import { useListinoEntityImage } from "@/hooks/useListinoEntityImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  useListinoMacrocategorie,
  useMacrocategorieMutations,
  type ListinoMacrocategoria,
} from "@/hooks/useListinoMacrocategorie";
import { translateListinoError } from "@/lib/listinoErrors";
import { Checkbox } from "@/components/ui/checkbox";
import { SchedaTecnicaEditor } from "./SchedaTecnicaEditor";
import { PhotoTemplatePicker } from "./PhotoTemplatePicker";
import { FamilyTemplateBulkDialog } from "./FamilyTemplateBulkDialog";
import { firstGallerySlugFor } from "@/lib/verticalMapping";
import { useAuthSelector } from "@/contexts/AuthContext";

// Valori coerenti con companies_vertical_check + fotovoltaico (gestito a parte).
const VERTICALI_OPTIONS: { value: string; label: string }[] = [
  { value: "serramentista", label: "Serramenti" },
  { value: "fotovoltaico", label: "Fotovoltaico" },
  { value: "bagno", label: "Bagno" },
  { value: "tetti", label: "Tetti" },
  { value: "tende_da_sole", label: "Tende da sole" },
  { value: "vetrate", label: "Vetrate" },
  { value: "caldaie", label: "Caldaie" },
  { value: "clima", label: "Climatizzazione" },
  { value: "ristrutturazione", label: "Ristrutturazione" },
];

// ─────────────────────────────────────────────────────────────────────────
// Helper tipi interni
// ─────────────────────────────────────────────────────────────────────────
type EditMode =
  | { kind: "none" }
  | { kind: "macro-new" }
  | { kind: "macro-edit"; row: ListinoMacrocategoria };

type DeleteTarget =
  | { kind: "macro"; row: ListinoMacrocategoria; childCount: number };

// ─────────────────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────────────────
export function MacroCategorieManager() {
  const { macrocategorie, isLoading: loadingMacro } = useListinoMacrocategorie();
  const { createMacrocategoria, updateMacrocategoria, deleteMacrocategoria } =
    useMacrocategorieMutations();

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set<string>());
  const [editMode, setEditMode] = useState<EditMode>({ kind: "none" });
  const [toDelete, setToDelete] = useState<DeleteTarget | null>(null);

  // Form state (riutilizzato per tutti i modal)
  const [formNome, setFormNome] = useState("");
  // Riservato per future re-introduzioni di campi descrizione brevi (la macro
  // usa solo descrizione_estesa, mantenuto setter per setForm... cleanup).
  const [, setFormDescrizione] = useState("");
  const [formVerticali, setFormVerticali] = useState<string[]>([]);
  // Tipo macrocategoria (migration 20270513230000): 'principale' (default)
  // o 'accessorio'. Determina dove la macro appare nel preventivatore.
  const [formCategoriaTipo, setFormCategoriaTipo] =
    useState<"principale" | "accessorio">("principale");
  const [formImmagineUrl, setFormImmagineUrl] = useState<string | null>(null);
  const [formDescrizioneEstesa, setFormDescrizioneEstesa] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const macroImage = useListinoEntityImage("macro");
  // Macrocategoria di cui si sta editando la scheda tecnica (null = chiuso)
  const [schedaTecnicaFor, setSchedaTecnicaFor] = useState<ListinoMacrocategoria | null>(null);
  // Apertura dialog galleria foto template (per la foto macrocategoria).
  const [photoTemplatePickerOpen, setPhotoTemplatePickerOpen] = useState(false);
  // Suggerimento subcategorie standard: aperto dopo create macro riuscito.
  // Contiene la macro appena creata + il primo verticale abilitato.
  // Bulk import template articoli: aperto auto post-creazione macro
  // (chain), o manualmente dal bottone Sparkles su una macro esistente.
  const [bulkImportFor, setBulkImportFor] = useState<{
    macroId: string;
    nome: string;
    vertical: string;
  } | null>(null);

  const companyId = useAuthSelector((c) => c.effectiveCompany?.id ?? null);

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
      setFormVerticali(mode.row.verticali_abilitati ?? []);
      setFormImmagineUrl(mode.row.immagine_url ?? null);
      setFormDescrizioneEstesa(mode.row.descrizione_estesa ?? mode.row.descrizione ?? "");
      setFormCategoriaTipo(mode.row.categoria_tipo ?? "principale");
    } else {
      // macro-new o none: campi vuoti, default 'principale'
      setFormNome("");
      setFormDescrizione("");
      setFormVerticali([]);
      setFormImmagineUrl(null);
      setFormDescrizioneEstesa("");
      setFormCategoriaTipo("principale");
    }
  };

  const closeForm = () => {
    setEditMode({ kind: "none" });
    setFormNome("");
    setFormDescrizione("");
    setFormVerticali([]);
    setFormImmagineUrl(null);
    setFormDescrizioneEstesa("");
    setFormCategoriaTipo("principale");
  };

  // Upload immagine macro: gestito solo in macro-edit (serve l'id).
  // In macro-new l'utente prima salva il record, poi può rientrare in edit.
  const handleImageUpload = async (file: File) => {
    if (editMode.kind !== "macro-edit") return;
    const res = await macroImage.upload(editMode.row.id, file);
    if (!res.ok) {
      toast.error("Upload fallito", { description: res.error });
      return;
    }
    setFormImmagineUrl(res.url);
    // Persistiamo subito sulla riga per non perdere lo stato se l'utente chiude
    await updateMacrocategoria.mutateAsync({
      id: editMode.row.id,
      patch: { immagine_url: res.url },
    });
    toast.success("Foto caricata");
  };

  /**
   * Applica una foto scelta dalla galleria template. Non scarica il file:
   * salva direttamente l'URL CDN remoto su `immagine_url`. Funziona solo
   * in modalità macro-edit (servono id macro).
   */
  const handlePhotoTemplateSelect = async (photo: { image_url: string; nome: string }) => {
    if (editMode.kind !== "macro-edit") {
      toast.error("Salva prima la macrocategoria, poi scegli una foto template.");
      return;
    }
    try {
      await updateMacrocategoria.mutateAsync({
        id: editMode.row.id,
        patch: { immagine_url: photo.image_url },
      });
      setFormImmagineUrl(photo.image_url);
      toast.success(`Foto "${photo.nome}" applicata`);
    } catch (err) {
      const { message } = translateListinoError(err);
      toast.error("Errore applicazione foto", { description: message });
    }
  };

  const handleImageRemove = async () => {
    if (editMode.kind !== "macro-edit") return;
    const res = await macroImage.remove(editMode.row.id);
    if (!res.ok) {
      toast.error("Rimozione fallita", { description: res.error });
      return;
    }
    setFormImmagineUrl(null);
    await updateMacrocategoria.mutateAsync({
      id: editMode.row.id,
      patch: { immagine_url: null },
    });
    toast.success("Foto rimossa");
  };

  const toggleVerticale = (v: string) => {
    setFormVerticali((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  };

  const saving =
    createMacrocategoria.isPending || updateMacrocategoria.isPending;

  // Validazione duplicati client-side: evita round-trip al DB per errori
  // prevedibili (UNIQUE constraint su nome). Case-insensitive + trim.
  const isDuplicateMacroName = (nome: string, excludeId?: string): boolean => {
    const normalized = nome.trim().toLocaleLowerCase("it-IT");
    return macrocategorie.some(
      (m) => m.id !== excludeId && m.nome.trim().toLocaleLowerCase("it-IT") === normalized,
    );
  };

  const handleSubmit = async () => {
    const nome = formNome.trim();
    if (!nome) {
      toast.error("Nome obbligatorio");
      return;
    }

    const excludeId = editMode.kind === "macro-edit" ? editMode.row.id : undefined;
    if (isDuplicateMacroName(nome, excludeId)) {
      toast.error("Esiste già una macrocategoria con questo nome.");
      return;
    }

    try {
      if (editMode.kind === "macro-new") {
        const created = await createMacrocategoria.mutateAsync({
          nome,
          // Una macrocategoria usa solo `descrizione_estesa`. Manteniamo `descrizione`
          // in sync (primi 250 char) per retro-compat con UI che la leggono ancora.
          descrizione: formDescrizioneEstesa.trim().slice(0, 250) || null,
          descrizione_estesa: formDescrizioneEstesa.trim() || null,
          verticali_abilitati: formVerticali,
          categoria_tipo: formCategoriaTipo,
        });
        toast.success("Macrocategoria creata");
        // Post-refactor 20270513200000: bypassiamo il livello categoria
        // (deprecato) e proponiamo SUBITO l'import dei template articolo per
        // il verticale scelto. Lo step subcategorie standard è stato rimosso.
        const gallerySlug = firstGallerySlugFor(formVerticali);
        if (created?.id && gallerySlug) {
          setBulkImportFor({
            macroId: created.id,
            nome: created.nome,
            vertical: gallerySlug,
          });
        }
      } else if (editMode.kind === "macro-edit") {
        await updateMacrocategoria.mutateAsync({
          id: editMode.row.id,
          patch: {
            nome,
            descrizione: formDescrizioneEstesa.trim().slice(0, 250) || null,
            descrizione_estesa: formDescrizioneEstesa.trim() || null,
            verticali_abilitati: formVerticali,
            categoria_tipo: formCategoriaTipo,
          },
        });
        toast.success("Macrocategoria aggiornata");
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

  const deleting = deleteMacrocategoria.isPending;

  const handleDelete = async () => {
    if (!toDelete || toDelete.kind !== "macro") return;
    try {
      await deleteMacrocategoria.mutateAsync(toDelete.row.id);
      toast.success("Macrocategoria eliminata");
      setToDelete(null);
    } catch (err) {
      const { message } = translateListinoError(err);
      toast.error("Errore eliminazione", { description: message });
    }
  };

  const isLoading = loadingMacro;

  const formTitle =
    editMode.kind === "macro-new"
      ? "Nuova macrocategoria"
      : editMode.kind === "macro-edit"
        ? "Modifica macrocategoria"
        : "";

  return (
    <div className="space-y-3">
      {/* Toolbar compatta: stat + azioni primarie */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium">
            {macrocategorie.length} {macrocategorie.length === 1 ? "macrocategoria" : "macrocategorie"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => openForm({ kind: "macro-new" })}
            className="bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 text-white shadow-sm"
          >
            <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Nuova macrocategoria
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" aria-hidden="true" />
            Caricamento…
          </div>
        ) : macrocategorie.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground space-y-3">
            <Folder className="h-10 w-10 mx-auto opacity-40" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">
                Nessuna macrocategoria configurata
              </p>
              <p className="text-xs max-w-md mx-auto">
                Crea la prima macrocategoria (es. <em>Serramenti WND Square</em>)
                per iniziare a strutturare il listino. Gli articoli (es.
                <em> Finestra 1 anta</em>) andranno al suo interno.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center pt-1">
              <Button size="sm" onClick={() => openForm({ kind: "macro-new" })}>
                <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Crea macrocategoria
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {macrocategorie.map((m) => {
              const isOpen = expanded.has(m.id);
              return (
                <MacroRow
                  key={m.id}
                  macro={m}
                  isOpen={isOpen}
                  onToggle={() => toggleExpanded(m.id)}
                  onEditMacro={() => openForm({ kind: "macro-edit", row: m })}
                  onDeleteMacro={() =>
                    setToDelete({ kind: "macro", row: m, childCount: 0 })
                  }
                  onEditSchedaTecnica={() => setSchedaTecnicaFor(m)}
                  // Apertura manuale del bulk import template articoli per la
                  // macro: utile per popolarla velocemente con i template di
                  // settore. Richiede almeno un verticale impostato.
                  onImportTemplates={() => {
                    const slug = firstGallerySlugFor(m.verticali_abilitati);
                    if (!slug) {
                      toast.error(
                        "Imposta prima almeno un verticale (in Modifica macrocategoria).",
                      );
                      return;
                    }
                    setBulkImportFor({ macroId: m.id, nome: m.nome, vertical: slug });
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog create/edit unificato */}
      <Dialog
        open={editMode.kind !== "none"}
        onOpenChange={(open) => {
          if (saving) return;
          if (!open) closeForm();
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shrink-0 shadow-sm">
                <Folder className="h-4.5 w-4.5 text-white" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <DialogTitle>{formTitle}</DialogTitle>
                <DialogDescription>
                  Le macrocategorie sono il livello più alto della gerarchia listino (es. <em>Serramenti WND Square</em>). Sotto vi finiranno direttamente gli articoli del listino.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="mc-nome">Nome *</Label>
              <Input
                id="mc-nome"
                value={formNome}
                onChange={(e) => setFormNome(e.target.value)}
                placeholder="es. SERRAMENTI WND SQUARE"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && formNome.trim() && !saving) {
                    e.preventDefault();
                    void handleSubmit();
                  }
                }}
              />
            </div>
            {formVerticali.length > 0 && editMode.kind === "macro-new" && (
              <div className="rounded-md border border-orange-200 bg-orange-50/60 p-3 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-orange-900">
                  <Sparkles className="h-4 w-4 text-orange-600" />
                  Template pronti per <span className="font-semibold">
                    {VERTICALI_OPTIONS.find((v) => v.value === formVerticali[0])?.label ?? formVerticali[0]}
                  </span>
                </div>
                <p className="text-xs text-orange-900/80 leading-relaxed">
                  Dopo il salvataggio ti proporremo di creare automaticamente le <strong>subcategorie standard</strong> del settore e di importare gli <strong>articoli template</strong> pre-configurati (foto, variabili Colore + Tipologia Vetro, griglia prezzi). Potrai personalizzare tutto dopo.
                </p>
              </div>
            )}
            {/* Tipo macrocategoria — distingue prodotto principale vs accessorio.
                Decide DOVE appare nel preventivatore:
                  • principale  → ListinoPickerDialog principale (serramenti veri)
                  • accessorio  → sezione "Accessori e complementi" del progetto */}
            <div className="space-y-2 pt-1 border-t">
              <Label className="text-sm font-medium">Tipo macrocategoria</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormCategoriaTipo("principale")}
                  className={`text-left rounded-md border-2 p-2.5 transition-colors ${
                    formCategoriaTipo === "principale"
                      ? "border-orange-400 bg-orange-50/60"
                      : "border-slate-200 hover:border-orange-300"
                  }`}
                >
                  <div className="text-sm font-medium">📦 Prodotto principale</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Es. Infissi, Persiane, Sanitari. Appare come scelta principale del preventivo.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setFormCategoriaTipo("accessorio")}
                  className={`text-left rounded-md border-2 p-2.5 transition-colors ${
                    formCategoriaTipo === "accessorio"
                      ? "border-orange-400 bg-orange-50/60"
                      : "border-slate-200 hover:border-orange-300"
                  }`}
                >
                  <div className="text-sm font-medium">🔗 Accessorio</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Es. Tapparelle, Cassonetti, Zanzariere. Appare nella sezione "Accessori e complementi".
                  </div>
                </button>
              </div>
            </div>

            {(

              <div className="space-y-2 pt-1 border-t">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Foto macrocategoria (opzionale)</Label>
                </div>
                {editMode.kind === "macro-new" ? (
                  <p className="text-xs text-muted-foreground italic">
                    Salva prima la macrocategoria, poi rientra in modifica per caricare la foto.
                  </p>
                ) : (
                  <div className="flex items-start gap-3">
                    {/* Preview */}
                    <div className="h-24 w-24 shrink-0 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center overflow-hidden bg-muted/40">
                      {formImmagineUrl ? (
                        <img
                          src={formImmagineUrl}
                          alt={formNome || "Macrocategoria"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Foto rappresentativa (es. tipologia infisso/persiana).
                        Appare nel picker preventivo e nell'elenco. Max 3 MB,
                        PNG/JPG/WEBP.
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleImageUpload(f);
                          e.currentTarget.value = "";
                        }}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={macroImage.isUploading || macroImage.isRemoving}
                        >
                          {macroImage.isUploading ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              Carico…
                            </>
                          ) : (
                            <>
                              <Upload className="h-3.5 w-3.5 mr-1.5" />
                              {formImmagineUrl ? "Cambia foto" : "Carica foto"}
                            </>
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setPhotoTemplatePickerOpen(true)}
                          disabled={macroImage.isUploading || macroImage.isRemoving}
                          className="border-orange-300 text-orange-700 hover:bg-orange-50"
                        >
                          <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
                          Scegli da galleria
                        </Button>
                        {formImmagineUrl && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={handleImageRemove}
                            disabled={macroImage.isUploading || macroImage.isRemoving}
                          >
                            <XIcon className="h-3.5 w-3.5 mr-1.5" />
                            Rimuovi
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <div className="pt-2 border-t mt-2" />
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Verticali abilitati</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Scegli in quali moduli preventivo (Serramenti, Bagno, Fotovoltaico…)
                  questa macrocategoria dovrà essere visibile. Lascia <em>tutto deselezionato</em>{" "}
                  per renderla visibile in tutti i moduli.
                </p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-1 max-h-48 overflow-y-auto">
                  {VERTICALI_OPTIONS.map((v) => (
                    <label
                      key={v.value}
                      className="flex items-center gap-2 cursor-pointer text-sm hover:bg-accent/50 rounded px-1 py-0.5"
                    >
                      <Checkbox
                        checked={formVerticali.includes(v.value)}
                        onCheckedChange={() => toggleVerticale(v.value)}
                      />
                      <span>{v.label}</span>
                    </label>
                  ))}
                </div>
                {formVerticali.length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 italic">
                    ⚠️ Nessun verticale selezionato → macro visibile ovunque (generica)
                  </p>
                )}
              </div>
            )}

            {/* ── Descrizione estesa (solo per macrocategorie) ─────────────
                Questo è l'UNICO campo descrittivo della macrocategoria. Viene
                usato sia come riepilogo negli elenchi/picker (troncato), sia
                come contenuto della pagina dedicata nel PDF preventivo.
                L'attivazione "pagina dedicata SI/NO" si fa in:
                  Impostazioni → Preventivi Serramenti (o altri verticali) →
                  pannello "Pagine dedicate".
                Qui sotto è solo un hint informativo. */}
            {(

              <div className="space-y-2 pt-3 border-t">
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Label
                      htmlFor="mc-descrizione-estesa"
                      className="flex items-center justify-between text-sm font-medium"
                    >
                      <span>Descrizione</span>
                      <span className="text-[10px] text-muted-foreground font-normal">
                        {formDescrizioneEstesa.length}/3000
                      </span>
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Riassunto del modello/linea: caratteristiche distintive,
                      vantaggi, storytelling. Mostrato nel picker preventivo
                      (in versione breve) e nella pagina dedicata del PDF
                      (se attivata nelle impostazioni del preventivo).
                    </p>
                  </div>
                </div>
                <Textarea
                  id="mc-descrizione-estesa"
                  value={formDescrizioneEstesa}
                  onChange={(e) => setFormDescrizioneEstesa(e.target.value.slice(0, 3000))}
                  rows={8}
                  placeholder={
                    "Esempio:\n\nI serramenti WND Square Plus rappresentano il top di gamma del PVC: profilo a 7 camere con guarnizione centrale, Uw fino a 0.9 W/m²K, vetro triplo basso-emissivo di serie. Garanzia 10 anni.\n\nCaratteristiche:\n- Profilo PVC riciclabile classe A\n- Rinforzi in acciaio zincato\n- Disponibile in 24 colori RAL"
                  }
                />
                <p className="text-[10px] text-muted-foreground">
                  A capo doppio per nuovi paragrafi. Righe che iniziano con
                  "<code className="font-mono">- </code>" diventano elenco puntato nel PDF.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2 pt-2 border-t mt-2">
            <Button variant="ghost" onClick={closeForm} disabled={saving}>
              Annulla
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formNome.trim() || saving}
              className="bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 text-white shadow-sm"
            >
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

      {/* Dialog scheda tecnica (campi descrittivi per macrocategoria) */}
      {schedaTecnicaFor && (
        <SchedaTecnicaEditor
          macroId={schedaTecnicaFor.id}
          macroNome={schedaTecnicaFor.nome}
          open={!!schedaTecnicaFor}
          onClose={() => setSchedaTecnicaFor(null)}
        />
      )}

      {/* Bulk import template articoli — aperto auto post-creazione macro
          (chain) o manualmente dal bottone Sparkles sulla riga macro. */}
      {bulkImportFor && companyId && (
        <FamilyTemplateBulkDialog
          open={!!bulkImportFor}
          onOpenChange={(o) => { if (!o) setBulkImportFor(null); }}
          companyId={companyId}
          vertical={bulkImportFor.vertical}
          macroId={bulkImportFor.macroId}
          macroNome={bulkImportFor.nome}
          availableCategorie={(byMacroId.get(bulkImportFor.macroId) ?? [])}
          onImported={() => setBulkImportFor(null)}
        />
      )}

      {/* Galleria foto template (super_admin gestita) — pre-filtrata sul
          primo verticale abilitato della macrocategoria in editing. */}
      <PhotoTemplatePicker
        open={photoTemplatePickerOpen}
        onOpenChange={setPhotoTemplatePickerOpen}
        initialVertical={firstGallerySlugFor(formVerticali)}
        onSelect={(photo) => void handlePhotoTemplateSelect(photo)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sotto-componenti di presentazione
// ─────────────────────────────────────────────────────────────────────────
interface MacroRowProps {
  macro: ListinoMacrocategoria;
  isOpen: boolean;
  onToggle: () => void;
  onEditMacro: () => void;
  onDeleteMacro: () => void;
  onEditSchedaTecnica: () => void;
  /** Apre il dialog di bulk import template articoli del verticale. */
  onImportTemplates: () => void;
}

// Mappa value→label per le badge dei verticali nel MacroRow header
const VERTICAL_LABEL_BY_VALUE = new Map(
  VERTICALI_OPTIONS.map((v) => [v.value, v.label]),
);

function MacroRow({
  macro,
  isOpen,
  onToggle,
  onEditMacro,
  onDeleteMacro,
  onEditSchedaTecnica,
  onImportTemplates,
}: MacroRowProps) {
  const verticali = macro.verticali_abilitati ?? [];
  return (
    <div className={`rounded-lg border bg-card transition-shadow hover:shadow-sm ${isOpen ? "ring-1 ring-primary/15" : ""}`}>
      <div className="flex items-center gap-2 p-2.5">
        {/* Toggle chevron */}
        <button
          type="button"
          onClick={onToggle}
          className="h-9 w-9 shrink-0 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
          aria-expanded={isOpen}
          aria-label={isOpen ? `Chiudi ${macro.nome}` : `Apri ${macro.nome}`}
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          )}
        </button>

        {/* Thumb (immagine o icona) — cliccabile per togglare */}
        <button
          type="button"
          onClick={onToggle}
          className="h-11 w-11 shrink-0 rounded-md overflow-hidden border bg-slate-50 dark:bg-slate-900 inline-flex items-center justify-center"
          aria-label={isOpen ? "Chiudi" : "Apri"}
        >
          {macro.immagine_url ? (
            <img
              src={macro.immagine_url}
              alt=""
              className="h-full w-full object-cover"
              aria-hidden="true"
            />
          ) : isOpen ? (
            <FolderOpen className="h-5 w-5 text-primary/70" aria-hidden="true" />
          ) : (
            <Folder className="h-5 w-5 text-primary/70" aria-hidden="true" />
          )}
        </button>

        {/* Identità + meta */}
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 min-w-0 text-left py-1"
        >
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="font-semibold truncate text-[15px] leading-tight">{macro.nome}</span>
            {macro.categoria_tipo === "accessorio" && (
              <Badge
                variant="outline"
                className="text-[10px] h-4 px-1.5 py-0 border-orange-300 bg-orange-50/70 text-orange-700 dark:bg-orange-950/30 dark:border-orange-700 dark:text-orange-300 font-medium"
                title="Accessorio collegato (Tapparelle, Cassonetti, ecc.) — appare nella sezione Accessori del preventivo"
              >
                🔗 Accessorio
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {verticali.length > 0 ? (
              <>
                {verticali.slice(0, 4).map((v) => (
                  <Badge
                    key={v}
                    variant="outline"
                    className="text-[10px] h-4 px-1.5 py-0 border-blue-200 bg-blue-50/70 dark:bg-blue-950/30 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-normal"
                    title={`Visibile nel modulo ${VERTICAL_LABEL_BY_VALUE.get(v) ?? v}`}
                  >
                    {VERTICAL_LABEL_BY_VALUE.get(v) ?? v}
                  </Badge>
                ))}
                {verticali.length > 4 && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 py-0">
                    +{verticali.length - 4}
                  </Badge>
                )}
              </>
            ) : (
              <span className="text-[10px] text-muted-foreground italic">Generica (tutti i moduli)</span>
            )}
          </div>
        </button>

        {/* Azioni — più rade, separator visivo */}
        <div className="flex items-center shrink-0 ml-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onEditSchedaTecnica}
            title="Scheda tecnica — campi del prodotto"
            className="h-9 w-9"
          >
            <Settings2 className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onImportTemplates}
            title="Importa articoli template del verticale"
            className="h-9 w-9 text-orange-700 hover:text-orange-800 hover:bg-orange-50"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onEditMacro}
            title="Modifica macrocategoria"
            className="h-9 w-9"
          >
            <Edit2 className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDeleteMacro}
            className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
            title="Elimina"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {isOpen && (
        <div className="border-t bg-muted/20">
          <div className="px-6 py-5 text-sm text-muted-foreground text-center">
            Gli articoli di questa macrocategoria si gestiscono dal{" "}
            <strong>Listino articoli</strong>. Usa il pulsante{" "}
            <Sparkles className="inline h-3.5 w-3.5 text-orange-600" /> qui sopra per
            importare articoli template pre-configurati.
          </div>
        </div>
      )}
    </div>
  );
}
