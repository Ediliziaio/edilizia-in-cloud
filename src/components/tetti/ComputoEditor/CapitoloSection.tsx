/**
 * CapitoloSection — sezione capitolo del computo, collassabile e premium.
 *
 * • accent colorato per capitolo (palette ciclica), pallino + barra laterale.
 * • nome capitolo editabile inline (input "invisibile" che si rivela al focus).
 * • conteggio voci + SUBTOTALE LIVE (somma `calcRigaImporto` delle voci).
 * • lista `VoceRow` con riordino drag-and-drop SCOPED al capitolo (dnd-kit).
 * • "+ Aggiungi voce" → apre `AddVocePicker` pre-assegnando questo capitolo.
 * • azioni: collassa/espandi, elimina capitolo (sposta? no: rimuove le voci).
 *
 * Stato controllato: le voci arrivano da `capitolo.voci`; ogni mutazione passa
 * da `onChange(nuoveVoci)`. Nessun setState in effect; il subtotale è `useMemo`.
 */
import { useMemo, useState } from "react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  ChevronRight, Plus, Trash2, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { calcRigaImporto } from "@/lib/tetti/calcoli";
import type { TetComputoVoce } from "@/types/tetti";
import VoceRow from "./VoceRow";
import AddVocePicker from "./AddVocePicker";
import { pickedToComputoVoce, type PickedVoce } from "./types";

/** Palette accent ciclica per i capitoli (bordo · pallino · pill subtotale). */
const ACCENTS = [
  { bar: "bg-orange-400", dot: "bg-orange-500", pill: "bg-orange-50 text-orange-700 border-orange-200" },
  { bar: "bg-sky-400", dot: "bg-sky-500", pill: "bg-sky-50 text-sky-700 border-sky-200" },
  { bar: "bg-violet-400", dot: "bg-violet-500", pill: "bg-violet-50 text-violet-700 border-violet-200" },
  { bar: "bg-emerald-400", dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { bar: "bg-rose-400", dot: "bg-rose-500", pill: "bg-rose-50 text-rose-700 border-rose-200" },
  { bar: "bg-amber-400", dot: "bg-amber-500", pill: "bg-amber-50 text-amber-700 border-amber-200" },
] as const;

interface Props {
  nome: string;
  voci: TetComputoVoce[];
  /** Indice del capitolo nella lista (per accent ciclico). */
  accentIndex: number;
  progettoId: string;
  companyId: string;
  showMargine: boolean;
  onChange: (voci: TetComputoVoce[]) => void;
  onRename: (nome: string) => void;
  onDeleteCapitolo: () => void;
}

export default function CapitoloSection({
  nome, voci, accentIndex, progettoId, companyId, showMargine,
  onChange, onRename, onDeleteCapitolo,
}: Props) {
  const [open, setOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const accent = ACCENTS[accentIndex % ACCENTS.length];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Subtotale live del capitolo (somma importi righe).
  const subtotale = useMemo(
    () => voci.reduce((acc, v) => acc + calcRigaImporto(v), 0),
    [voci],
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = voci.findIndex((v) => v.id === active.id);
    const newIndex = voci.findIndex((v) => v.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(voci, oldIndex, newIndex).map((v, i) => ({ ...v, ordine: i })));
  };

  const updateVoce = (id: string, patch: Partial<TetComputoVoce>) => {
    onChange(voci.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };
  const deleteVoce = (id: string) => {
    onChange(voci.filter((v) => v.id !== id).map((v, i) => ({ ...v, ordine: i })));
  };
  const duplicateVoce = (id: string) => {
    const idx = voci.findIndex((v) => v.id === id);
    if (idx < 0) return;
    const copy = pickedToComputoVoce(
      {
        descrizione: voci[idx].descrizione,
        unita_misura: voci[idx].unita_misura,
        prezzo_unitario: voci[idx].prezzo_unitario,
        costo_materiali: voci[idx].costo_materiali,
        costo_manodopera: voci[idx].costo_manodopera,
        capitolo_nome: nome,
        listino_voce_id: voci[idx].listino_voce_id,
        fonte: voci[idx].fonte,
      },
      { progetto_id: progettoId, company_id: companyId, capitolo_nome: nome, ordine: idx + 1 },
    );
    // Mantieni la quantità della voce originale (pickedTo… parte da 1).
    copy.quantita = voci[idx].quantita;
    copy.sconto_pct = voci[idx].sconto_pct;
    const next = [...voci];
    next.splice(idx + 1, 0, copy);
    onChange(next.map((v, i) => ({ ...v, ordine: i })));
  };

  const handlePick = (picked: PickedVoce) => {
    const voce = pickedToComputoVoce(picked, {
      progetto_id: progettoId,
      company_id: companyId,
      capitolo_nome: nome, // resta in QUESTO capitolo a prescindere dalla sorgente
      ordine: voci.length,
    });
    onChange([...voci, voce]);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        {/* Header capitolo */}
        <div className="flex items-center gap-1.5 pl-0">
          {/* Barra accent laterale */}
          <div className={cn("h-full min-h-[52px] w-1.5 self-stretch", accent.bar)} />
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
              aria-label={open ? "Comprimi capitolo" : "Espandi capitolo"}
            >
              <ChevronRight className={cn("h-4 w-4 transition-transform", open && "rotate-90")} />
            </button>
          </CollapsibleTrigger>

          <span className={cn("h-2 w-2 shrink-0 rounded-full", accent.dot)} />

          {/* Nome capitolo editabile inline */}
          <Input
            value={nome}
            onChange={(e) => onRename(e.target.value)}
            placeholder="Nome capitolo…"
            className="h-9 flex-1 border-transparent bg-transparent px-1.5 text-sm font-semibold text-slate-800 shadow-none hover:bg-muted/50 focus-visible:bg-background focus-visible:ring-1"
          />

          {/* Conteggio voci */}
          <Badge variant="outline" className="hidden shrink-0 text-[10px] font-normal text-muted-foreground sm:inline-flex">
            {voci.length} {voci.length === 1 ? "voce" : "voci"}
          </Badge>

          {/* Subtotale live */}
          <Badge variant="outline" className={cn("mr-1 shrink-0 gap-1 tabular-nums", accent.pill)}>
            <span className="hidden text-[10px] font-normal opacity-70 sm:inline">Subtotale</span>
            <span className="text-xs font-semibold">{formatCurrency(subtotale)}</span>
          </Badge>

          {/* Elimina capitolo */}
          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mr-1 h-8 w-8 shrink-0 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">Elimina capitolo</TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminare il capitolo "{nome || "Senza nome"}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  {voci.length > 0
                    ? `Verranno rimosse anche le ${voci.length} voci contenute. L'operazione è reversibile finché non salvi il computo.`
                    : "Il capitolo è vuoto e verrà rimosso."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDeleteCapitolo}
                  className="bg-rose-600 hover:bg-rose-700"
                >
                  Elimina
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <CollapsibleContent>
          <div className="space-y-1.5 px-2 pb-2.5 pt-0.5 sm:px-3">
            {voci.length === 0 ? (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex w-full flex-col items-center gap-1 rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-5 text-center text-muted-foreground transition-colors hover:border-orange-300 hover:bg-orange-50/40 hover:text-orange-700"
              >
                <Layers className="h-5 w-5 opacity-60" />
                <span className="text-xs font-medium">Capitolo vuoto — aggiungi la prima voce</span>
                <span className="text-[10px]">Cerca nei listini o crea una voce libera</span>
              </button>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={voci.map((v) => v.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5">
                    {voci.map((v) => (
                      <VoceRow
                        key={v.id}
                        voce={v}
                        onChange={(patch) => updateVoce(v.id, patch)}
                        onDelete={() => deleteVoce(v.id)}
                        onDuplicate={() => duplicateVoce(v.id)}
                        showMargine={showMargine}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            {/* + Aggiungi voce */}
            {voci.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPickerOpen(true)}
                className="w-full justify-center gap-1.5 border border-dashed border-transparent text-xs text-muted-foreground hover:border-orange-200 hover:bg-orange-50/40 hover:text-orange-700"
              >
                <Plus className="h-3.5 w-3.5" /> Aggiungi voce
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </div>

      <AddVocePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={handlePick}
        targetCapitolo={nome || "Generale"}
      />
    </Collapsible>
  );
}
