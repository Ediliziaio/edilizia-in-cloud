/**
 * Preventivatore Verticalizzato Serramentisti — FASE 4.4
 *
 * Editor assi (article_family_axes) + valori (article_family_axis_values)
 * con maggiorazioni. Ogni asse è una dimensione di variazione (es. materiale,
 * vetro, apertura). Ogni valore ha una maggiorazione che si applica al prezzo
 * base della famiglia quando quel valore è selezionato.
 *
 * Vincoli UX applicati:
 *  - Un solo is_default per asse (rispettato nel handler)
 *  - Assi obbligatori devono avere almeno un valore default
 *  - Codice asse suggerito da slug del nome
 *  - Ordinamento via pulsanti freccia (up/down)
 */

import { useState } from "react";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { useFamilyMutations } from "@/hooks/useFamilyMutations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type {
  FamilyWithAxes,
  FamilyAxis,
  AxisValue,
  AxisTipo,
  MaggiorazioneTipo,
} from "@/types/articleFamily";

const MAGGIORAZIONE_OPTIONS: Array<{ value: MaggiorazioneTipo; label: string }> = [
  { value: "none", label: "Nessuna" },
  { value: "percentuale", label: "% sul prezzo base" },
  { value: "fisso_pz", label: "€ fissi per pezzo" },
  { value: "fisso_mq", label: "€ fissi al mq" },
  { value: "fisso_ml", label: "€ fissi al ml" },
  { value: "fisso_mc", label: "€ fissi al mc" },
];

function slugifyCodice(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

interface Props {
  family: FamilyWithAxes;
}

export function FamilyAxesEditor({ family }: Props) {
  const {
    createAxis,
    updateAxis,
    deleteAxis,
    createAxisValue,
    updateAxisValue,
    deleteAxisValue,
  } = useFamilyMutations();

  const [newAxisOpen, setNewAxisOpen] = useState(false);
  const [expandedAxisId, setExpandedAxisId] = useState<string | null>(null);
  const [editingAxis, setEditingAxis] = useState<FamilyAxis | null>(null);
  const [axisToDelete, setAxisToDelete] = useState<FamilyAxis | null>(null);
  const [newValueAxisId, setNewValueAxisId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<AxisValue | null>(null);
  const [valueToDelete, setValueToDelete] = useState<AxisValue | null>(null);

  // ── Riordino assi ──────────────────────────────────────────────────────
  const moveAxis = async (axis: FamilyAxis, direction: "up" | "down") => {
    const sorted = [...family.axes].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((a) => a.id === axis.id);
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= sorted.length) return;

    const other = sorted[target];
    try {
      await Promise.all([
        updateAxis.mutateAsync({
          id: axis.id,
          familyId: family.id,
          patch: { sort_order: other.sort_order },
        }),
        updateAxis.mutateAsync({
          id: other.id,
          familyId: family.id,
          patch: { sort_order: axis.sort_order },
        }),
      ]);
    } catch {
      // error toast già mostrato da mutazione
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h3 className="font-medium">Assi di variazione</h3>
        <Button
          size="sm"
          onClick={() => setNewAxisOpen(true)}
          className="h-9 w-full sm:w-auto"
        >
          <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
          Aggiungi asse
        </Button>
      </div>

      {family.axes.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Nessun asse configurato. Aggiungi il primo asse (es. "Materiale", "Apertura") per variare il prezzo.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {family.axes.map((axis, idx) => {
            const isExpanded = expandedAxisId === axis.id;
            const defaults = axis.values.filter((v) => v.is_default).length;
            return (
              <Card key={axis.id}>
                <CardHeader className="pb-2 p-3 sm:p-4">
                  <div className="flex items-start gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedAxisId(isExpanded ? null : axis.id)
                      }
                      className="flex-1 text-left flex items-start gap-2 min-w-0 py-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? "Chiudi" : "Apri"} asse ${axis.nome}`}
                    >
                      <ChevronRight
                        className={`h-4 w-4 mt-0.5 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        aria-hidden="true"
                      />
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm truncate">
                          {axis.nome}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            ({axis.codice})
                          </span>
                        </CardTitle>
                        <div className="flex flex-wrap gap-1.5 items-center mt-1">
                          <Badge variant="outline" className="text-[10px] sm:text-xs">
                            {axis.tipo}
                          </Badge>
                          {axis.obbligatorio ? (
                            <Badge variant="secondary" className="text-[10px] sm:text-xs">
                              obbligatorio
                            </Badge>
                          ) : null}
                          <span className="text-xs text-muted-foreground">
                            {axis.values.length} {axis.values.length === 1 ? "valore" : "valori"}
                          </span>
                          {axis.obbligatorio && defaults === 0 ? (
                            <span className="text-xs text-destructive" role="alert">⚠ nessun default</span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => moveAxis(axis, "up")}
                        disabled={idx === 0 || updateAxis.isPending}
                        aria-label="Sposta su"
                        className="h-9 w-9"
                      >
                        <ChevronUp className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => moveAxis(axis, "down")}
                        disabled={idx === family.axes.length - 1 || updateAxis.isPending}
                        aria-label="Sposta giù"
                        className="h-9 w-9"
                      >
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditingAxis(axis)}
                        aria-label="Modifica asse"
                        className="h-9 w-9"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 text-destructive hover:text-destructive"
                        onClick={() => setAxisToDelete(axis)}
                        aria-label="Elimina asse"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {isExpanded ? (
                  <CardContent className="pt-0 p-3 sm:p-4 space-y-2">
                    {axis.values.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nessun valore. Aggiungi almeno un valore.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {axis.values.map((v) => (
                          <li
                            key={v.id}
                            className="flex items-start gap-1.5 sm:gap-2 text-sm p-2 rounded-md border"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium break-words">{v.label}</span>
                                <span className="text-xs text-muted-foreground">
                                  {v.valore}
                                </span>
                                {v.is_default ? (
                                  <Badge variant="secondary" className="text-[10px] sm:text-xs">
                                    default
                                  </Badge>
                                ) : null}
                                {!v.attivo ? (
                                  <Badge variant="outline" className="text-[10px] sm:text-xs">
                                    non attivo
                                  </Badge>
                                ) : null}
                              </div>
                              {v.maggiorazione_tipo !== "none" ? (
                                <div className="text-xs text-muted-foreground mt-0.5 break-words">
                                  +{v.maggiorazione_valore}
                                  {v.maggiorazione_tipo === "percentuale" ? "%" : " €"}
                                  {v.maggiorazione_tipo !== "percentuale"
                                    ? ` (${v.maggiorazione_tipo.replace("fisso_", "/")})`
                                    : " sul prezzo base"}
                                  {v.maggiorazione_acquisto > 0 ? (
                                    <span> · acquisto: {v.maggiorazione_acquisto}</span>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setEditingValue(v)}
                                aria-label="Modifica valore"
                                className="h-9 w-9"
                              >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-9 w-9 text-destructive hover:text-destructive"
                                onClick={() => setValueToDelete(v)}
                                aria-label="Elimina valore"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setNewValueAxisId(axis.id)}
                      className="h-9 w-full sm:w-auto"
                    >
                      <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                      Aggiungi valore
                    </Button>
                  </CardContent>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog nuovo asse / edit asse */}
      <AxisFormDialog
        open={newAxisOpen || editingAxis !== null}
        axis={editingAxis}
        existingCodici={family.axes.map((a) => a.codice)}
        nextSortOrder={
          family.axes.length > 0
            ? Math.max(...family.axes.map((a) => a.sort_order)) + 10
            : 0
        }
        onClose={() => {
          setNewAxisOpen(false);
          setEditingAxis(null);
        }}
        onSave={async (values) => {
          try {
            if (editingAxis) {
              await updateAxis.mutateAsync({
                id: editingAxis.id,
                familyId: family.id,
                patch: values,
              });
              toast.success("Asse aggiornato");
            } else {
              await createAxis.mutateAsync({
                family_id: family.id,
                nome: values.nome,
                codice: values.codice,
                descrizione: values.descrizione ?? null,
                tipo: values.tipo,
                obbligatorio: values.obbligatorio,
                sort_order: values.sort_order,
              });
              toast.success("Asse creato");
            }
            setNewAxisOpen(false);
            setEditingAxis(null);
          } catch (err) {
            toast.error("Errore salvataggio asse", {
              description: err instanceof Error ? err.message : "Errore sconosciuto",
            });
          }
        }}
        saving={createAxis.isPending || updateAxis.isPending}
      />

      {/* Dialog nuovo valore / edit valore */}
      <ValueFormDialog
        open={newValueAxisId !== null || editingValue !== null}
        value={editingValue}
        axisId={editingValue?.axis_id ?? newValueAxisId ?? ""}
        existingValori={
          editingValue
            ? family.axes
                .find((a) => a.id === editingValue.axis_id)
                ?.values.filter((v) => v.id !== editingValue.id)
                .map((v) => v.valore) ?? []
            : family.axes.find((a) => a.id === newValueAxisId)?.values.map((v) => v.valore) ?? []
        }
        otherDefaultIds={
          editingValue
            ? family.axes
                .find((a) => a.id === editingValue.axis_id)
                ?.values.filter((v) => v.is_default && v.id !== editingValue.id)
                .map((v) => v.id) ?? []
            : family.axes
                .find((a) => a.id === newValueAxisId)
                ?.values.filter((v) => v.is_default)
                .map((v) => v.id) ?? []
        }
        nextSortOrder={
          editingValue
            ? editingValue.sort_order
            : (() => {
                const ax = family.axes.find((a) => a.id === newValueAxisId);
                return ax && ax.values.length > 0
                  ? Math.max(...ax.values.map((v) => v.sort_order)) + 10
                  : 0;
              })()
        }
        onClose={() => {
          setNewValueAxisId(null);
          setEditingValue(null);
        }}
        onSave={async (values, otherDefaultIds) => {
          try {
            // FIX P2-B: save new value FIRST, then clear other defaults.
            // Vecchio ordine (clear → save) rischiava: se la seconda op falliva,
            // l'asse obbligatorio restava con ZERO default (hard constraint
            // violation). Nuovo ordine: se la clear fallisce, abbiamo DUE
            // default per un istante — recuperabile (unique constraint lato DB
            // + retry utente), molto meno grave di zero default.
            if (editingValue) {
              await updateAxisValue.mutateAsync({
                id: editingValue.id,
                familyId: family.id,
                patch: values,
              });
              toast.success("Valore aggiornato");
            } else if (newValueAxisId) {
              await createAxisValue.mutateAsync({
                familyId: family.id,
                axis_id: newValueAxisId,
                valore: values.valore,
                label: values.label,
                descrizione: values.descrizione ?? null,
                is_default: values.is_default ?? false,
                maggiorazione_tipo: values.maggiorazione_tipo,
                maggiorazione_valore: values.maggiorazione_valore,
                maggiorazione_acquisto: values.maggiorazione_acquisto,
                sort_order: values.sort_order,
                attivo: values.attivo ?? true,
              });
              toast.success("Valore creato");
            }
            // Post-save: togli il flag is_default dagli altri valori
            // (solo se il nuovo valore è effettivamente un default).
            if (values.is_default && otherDefaultIds.length > 0) {
              await Promise.all(
                otherDefaultIds.map((id) =>
                  updateAxisValue.mutateAsync({
                    id,
                    familyId: family.id,
                    patch: { is_default: false },
                  }),
                ),
              );
            }
            setNewValueAxisId(null);
            setEditingValue(null);
          } catch (err) {
            toast.error("Errore salvataggio valore", {
              description: err instanceof Error ? err.message : "Errore sconosciuto",
            });
          }
        }}
        saving={createAxisValue.isPending || updateAxisValue.isPending}
      />

      {/* AlertDialog elimina asse */}
      <AlertDialog
        open={!!axisToDelete}
        onOpenChange={(open) => {
          if (deleteAxis.isPending) return;
          if (!open) setAxisToDelete(null);
        }}
      >
        <AlertDialogContent className="w-[96vw] sm:w-full sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base sm:text-lg">Eliminare asse "{axisToDelete?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm">
              Verranno cancellati anche tutti i valori associati. Questa operazione è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-2">
            <AlertDialogCancel disabled={deleteAxis.isPending} className="h-10 w-full sm:w-auto mt-0">Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!axisToDelete) return;
                try {
                  await deleteAxis.mutateAsync({
                    id: axisToDelete.id,
                    familyId: family.id,
                  });
                  toast.success("Asse eliminato");
                  setAxisToDelete(null);
                } catch (err) {
                  toast.error("Errore eliminazione", {
                    description: err instanceof Error ? err.message : "Errore sconosciuto",
                  });
                }
              }}
              disabled={deleteAxis.isPending}
              className="h-10 w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog elimina valore */}
      <AlertDialog
        open={!!valueToDelete}
        onOpenChange={(open) => {
          if (deleteAxisValue.isPending) return;
          if (!open) setValueToDelete(null);
        }}
      >
        <AlertDialogContent className="w-[96vw] sm:w-full sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base sm:text-lg">Eliminare valore "{valueToDelete?.label}"?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm">
              Il valore non sarà più disponibile nei nuovi preventivi. I preventivi storici restano invariati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-2">
            <AlertDialogCancel disabled={deleteAxisValue.isPending} className="h-10 w-full sm:w-auto mt-0">Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!valueToDelete) return;
                try {
                  await deleteAxisValue.mutateAsync({
                    id: valueToDelete.id,
                    familyId: family.id,
                  });
                  toast.success("Valore eliminato");
                  setValueToDelete(null);
                } catch (err) {
                  toast.error("Errore eliminazione", {
                    description: err instanceof Error ? err.message : "Errore sconosciuto",
                  });
                }
              }}
              disabled={deleteAxisValue.isPending}
              className="h-10 w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Dialog: Asse ────────────────────────────────────────────────────────────

interface AxisFormValues {
  nome: string;
  codice: string;
  descrizione: string | null;
  tipo: AxisTipo;
  obbligatorio: boolean;
  sort_order: number;
}

function AxisFormDialog({
  open,
  axis,
  existingCodici,
  nextSortOrder,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  axis: FamilyAxis | null;
  existingCodici: string[];
  nextSortOrder: number;
  onClose: () => void;
  onSave: (values: AxisFormValues) => void | Promise<void>;
  saving: boolean;
}) {
  const [nome, setNome] = useState("");
  const [codice, setCodice] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [tipo, setTipo] = useState<AxisTipo>("discrete");
  const [obbligatorio, setObbligatorio] = useState(true);
  const [codiceManuallyEdited, setCodiceManuallyEdited] = useState(false);

  // Reset aggressivo su cambio open/axis: usiamo `key={axis?.id ?? "new"}` sul
  // DialogContent (sotto) + `onOpenAutoFocus` per inizializzare lo stato ad
  // ogni apertura. Nessun useEffect necessario.

  const editing = axis !== null;
  const conflict =
    !editing && codice && existingCodici.includes(codice)
      ? `Codice già usato nella famiglia`
      : null;
  const canSave = nome.trim() && codice.trim() && !conflict && !saving;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (saving) return;
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="w-[96vw] sm:w-full sm:max-w-md max-h-[94vh] overflow-y-auto"
        key={axis?.id ?? "new"}
        onOpenAutoFocus={() => {
          // inizializza stato al mount del content
          if (axis) {
            setNome(axis.nome);
            setCodice(axis.codice);
            setDescrizione(axis.descrizione ?? "");
            setTipo(axis.tipo);
            setObbligatorio(axis.obbligatorio);
            setCodiceManuallyEdited(true);
          } else {
            setNome("");
            setCodice("");
            setDescrizione("");
            setTipo("discrete");
            setObbligatorio(true);
            setCodiceManuallyEdited(false);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">{editing ? "Modifica asse" : "Nuovo asse"}</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Gli assi rappresentano le dimensioni di variazione della famiglia (es. "Apertura", "Vetro", "Materiale").
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="axis-nome" className="text-sm font-medium">Nome</label>
            <Input
              id="axis-nome"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                if (!codiceManuallyEdited && !editing) {
                  setCodice(slugifyCodice(e.target.value));
                }
              }}
              placeholder="es. Apertura"
              autoFocus
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="axis-codice" className="text-sm font-medium">Codice</label>
            <Input
              id="axis-codice"
              value={codice}
              onChange={(e) => {
                setCodice(slugifyCodice(e.target.value));
                setCodiceManuallyEdited(true);
              }}
              placeholder="apertura"
              disabled={editing}
              aria-invalid={!!conflict}
              aria-describedby={conflict ? "axis-codice-error" : "axis-codice-hint"}
              className="h-10 font-mono"
            />
            <p id="axis-codice-hint" className="text-xs text-muted-foreground">
              Identificatore snake_case usato nelle selezioni del preventivo.
            </p>
            {conflict ? (
              <p id="axis-codice-error" className="text-xs text-destructive" role="alert">{conflict}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="axis-descrizione" className="text-sm font-medium">Descrizione (opzionale)</label>
            <Textarea
              id="axis-descrizione"
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="axis-tipo" className="text-sm font-medium">Tipo</label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as AxisTipo)}>
              <SelectTrigger id="axis-tipo" className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="discrete">Lista di valori (discrete)</SelectItem>
                <SelectItem value="boolean">Sì / No (boolean)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 py-1">
            <Checkbox
              id="obbl"
              checked={obbligatorio}
              onCheckedChange={(c) => setObbligatorio(c === true)}
              className="h-5 w-5"
            />
            <label htmlFor="obbl" className="text-sm cursor-pointer select-none">
              Obbligatorio (richiede selezione nel preventivo)
            </label>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={saving}
            className="h-10 w-full sm:w-auto"
          >
            Annulla
          </Button>
          <Button
            onClick={() =>
              onSave({
                nome: nome.trim(),
                codice: codice.trim(),
                descrizione: descrizione.trim() || null,
                tipo,
                obbligatorio,
                sort_order: axis?.sort_order ?? nextSortOrder,
              })
            }
            disabled={!canSave}
            className="h-10 w-full sm:w-auto"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                Salvataggio…
              </>
            ) : editing ? (
              "Aggiorna"
            ) : (
              "Crea asse"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Dialog: Valore ──────────────────────────────────────────────────────────

interface ValueFormValues {
  valore: string;
  label: string;
  descrizione: string | null;
  is_default: boolean;
  maggiorazione_tipo: MaggiorazioneTipo;
  maggiorazione_valore: number;
  maggiorazione_acquisto: number;
  sort_order: number;
  attivo: boolean;
}

function ValueFormDialog({
  open,
  value,
  axisId,
  existingValori,
  otherDefaultIds,
  nextSortOrder,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  value: AxisValue | null;
  axisId: string;
  existingValori: string[];
  otherDefaultIds: string[];
  nextSortOrder: number;
  onClose: () => void;
  onSave: (values: ValueFormValues, otherDefaultIds: string[]) => void | Promise<void>;
  saving: boolean;
}) {
  const [valore, setValore] = useState("");
  const [label, setLabel] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [attivo, setAttivo] = useState(true);
  const [magTipo, setMagTipo] = useState<MaggiorazioneTipo>("none");
  const [magValore, setMagValore] = useState("0");
  const [magAcquisto, setMagAcquisto] = useState("0");
  const [valoreManuallyEdited, setValoreManuallyEdited] = useState(false);

  const editing = value !== null;
  const conflict =
    !editing && valore && existingValori.includes(valore)
      ? "Valore già presente su questo asse"
      : null;
  const canSave = label.trim() && valore.trim() && !conflict && !saving;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (saving) return;
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="w-[96vw] sm:w-full sm:max-w-md max-h-[94vh] overflow-y-auto"
        key={value?.id ?? `new-${axisId}`}
        onOpenAutoFocus={() => {
          if (value) {
            setValore(value.valore);
            setLabel(value.label);
            setDescrizione(value.descrizione ?? "");
            setIsDefault(value.is_default);
            setAttivo(value.attivo);
            setMagTipo(value.maggiorazione_tipo);
            setMagValore(String(value.maggiorazione_valore));
            setMagAcquisto(String(value.maggiorazione_acquisto));
            setValoreManuallyEdited(true);
          } else {
            setValore("");
            setLabel("");
            setDescrizione("");
            setIsDefault(false);
            setAttivo(true);
            setMagTipo("none");
            setMagValore("0");
            setMagAcquisto("0");
            setValoreManuallyEdited(false);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">{editing ? "Modifica valore" : "Nuovo valore"}</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Un valore ammesso per l'asse + eventuale maggiorazione applicata al prezzo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="val-label" className="text-sm font-medium">Label visibile</label>
            <Input
              id="val-label"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                if (!valoreManuallyEdited && !editing) {
                  setValore(slugifyCodice(e.target.value));
                }
              }}
              placeholder="es. PVC bianco"
              autoFocus
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="val-codice" className="text-sm font-medium">Codice valore</label>
            <Input
              id="val-codice"
              value={valore}
              onChange={(e) => {
                setValore(slugifyCodice(e.target.value));
                setValoreManuallyEdited(true);
              }}
              disabled={editing}
              placeholder="pvc_bianco"
              aria-invalid={!!conflict}
              aria-describedby={conflict ? "val-codice-error" : undefined}
              className="h-10 font-mono"
            />
            {conflict ? (
              <p id="val-codice-error" className="text-xs text-destructive" role="alert">{conflict}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="val-descrizione" className="text-sm font-medium">Descrizione (opzionale)</label>
            <Textarea
              id="val-descrizione"
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="flex items-center gap-2 py-1">
              <Checkbox
                id="val-default"
                checked={isDefault}
                onCheckedChange={(c) => setIsDefault(c === true)}
                className="h-5 w-5"
              />
              <label htmlFor="val-default" className="text-sm cursor-pointer select-none">
                Default (preselezionato)
              </label>
            </div>
            <div className="flex items-center gap-2 py-1">
              <Checkbox
                id="val-attivo"
                checked={attivo}
                onCheckedChange={(c) => setAttivo(c === true)}
                className="h-5 w-5"
              />
              <label htmlFor="val-attivo" className="text-sm cursor-pointer select-none">
                Attivo
              </label>
            </div>
          </div>

          <div className="border rounded-md p-3 space-y-2.5 bg-muted/30">
            <div className="text-sm font-medium">Maggiorazione</div>
            <div className="space-y-1">
              <label htmlFor="val-mag-tipo" className="text-xs text-muted-foreground">Tipo</label>
              <Select
                value={magTipo}
                onValueChange={(v) => setMagTipo(v as MaggiorazioneTipo)}
              >
                <SelectTrigger id="val-mag-tipo" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAGGIORAZIONE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {magTipo !== "none" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label htmlFor="val-mag-vendita" className="text-xs text-muted-foreground">
                    Valore vendita
                  </label>
                  <Input
                    id="val-mag-vendita"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={magValore}
                    onChange={(e) => setMagValore(e.target.value)}
                    className="h-10 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="val-mag-acquisto" className="text-xs text-muted-foreground">
                    Valore acquisto
                  </label>
                  <Input
                    id="val-mag-acquisto"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={magAcquisto}
                    onChange={(e) => setMagAcquisto(e.target.value)}
                    className="h-10 font-mono"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={saving}
            className="h-10 w-full sm:w-auto"
          >
            Annulla
          </Button>
          <Button
            onClick={() =>
              onSave(
                {
                  valore: valore.trim(),
                  label: label.trim(),
                  descrizione: descrizione.trim() || null,
                  is_default: isDefault,
                  attivo,
                  maggiorazione_tipo: magTipo,
                  maggiorazione_valore: parseFloat(magValore) || 0,
                  maggiorazione_acquisto: parseFloat(magAcquisto) || 0,
                  sort_order: value?.sort_order ?? nextSortOrder,
                },
                isDefault ? otherDefaultIds : [],
              )
            }
            disabled={!canSave}
            className="h-10 w-full sm:w-auto"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                Salvataggio…
              </>
            ) : editing ? (
              "Aggiorna"
            ) : (
              "Crea valore"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
