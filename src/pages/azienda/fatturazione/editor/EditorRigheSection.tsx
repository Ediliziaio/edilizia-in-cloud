import { useState } from "react";
import { Plus, Trash2, PackageSearch, Copy, ChevronDown, GripVertical, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useArticoliNative } from "@/hooks/useArticoliNative";
import { createEmptyRiga } from "./useEditorState";
import { formatCurrency } from "@/lib/formatters";
import { NATURE_IVA } from "@/types/fatturazione";
import type { RigaDocumento, ArticoloNative } from "@/types/fatturazione";
import type { EditorState } from "./useEditorState";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<any>;
  disabled?: boolean;
}

const UNITA_MISURA = ["pz", "h", "gg", "mese", "km", "kg", "l", "m", "m²", "m³", "kWh", "%"];
const IVA_RATES = ["22", "10", "5", "4", "0"];

// ─── Sortable Row ────────────────────────────────────────────

function SortableRow({
  riga,
  index,
  disabled,
  onUpdate,
  onRemove,
  onDuplicate,
}: {
  riga: RigaDocumento;
  index: number;
  disabled?: boolean;
  onUpdate: (index: number, field: keyof RigaDocumento, value: unknown) => void;
  onRemove: (index: number) => void;
  onDuplicate: (index: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [naturaOpen, setNaturaOpen] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: riga.id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const needsNatura = (parseFloat(riga.aliquota_iva) || 0) === 0 && !riga.natura_iva;

  return (
    <div ref={setNodeRef} style={style}>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <div className="grid grid-cols-[1.5rem_1.5rem_1fr_4rem_4rem_5rem_3.5rem_4rem_5rem_5.5rem] gap-1 px-2 py-1 border-t items-center group">
          {/* Drag handle */}
          <button
            className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </button>

          <span className="text-xs text-muted-foreground">{index + 1}</span>

          <Input
            value={riga.descrizione}
            onChange={(e) => onUpdate(index, "descrizione", e.target.value)}
            className="h-7 text-xs border-0 bg-transparent px-1"
            placeholder="Descrizione..."
            disabled={disabled}
          />
          <Input
            type="number"
            value={riga.quantita}
            onChange={(e) => onUpdate(index, "quantita", parseFloat(e.target.value) || 0)}
            className="h-7 text-xs border-0 bg-transparent px-1 text-right"
            disabled={disabled}
          />
          <Select
            value={riga.unita_misura || "pz"}
            onValueChange={(v) => onUpdate(index, "unita_misura", v)}
            disabled={disabled}
          >
            <SelectTrigger className="h-7 text-xs border-0 bg-transparent px-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNITA_MISURA.map((u) => (
                <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            step="0.0001"
            value={riga.prezzo_unitario}
            onChange={(e) => onUpdate(index, "prezzo_unitario", parseFloat(e.target.value) || 0)}
            className="h-7 text-xs border-0 bg-transparent px-1 text-right"
            disabled={disabled}
          />
          <Input
            type="number"
            step="0.01"
            value={riga.sconto_percentuale ?? ""}
            onChange={(e) => onUpdate(index, "sconto_percentuale", parseFloat(e.target.value) || 0)}
            className="h-7 text-xs border-0 bg-transparent px-1 text-right"
            placeholder="0"
            disabled={disabled}
          />
          {/* IVA Select */}
          <div className="relative">
            <Select
              value={riga.aliquota_iva}
              onValueChange={(v) => {
                onUpdate(index, "aliquota_iva", v);
                if (v === "0") {
                  setNaturaOpen(true);
                } else {
                  onUpdate(index, "natura_iva", undefined);
                }
              }}
              disabled={disabled}
            >
              <SelectTrigger className="h-7 text-xs border-0 bg-transparent px-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IVA_RATES.map((r) => (
                  <SelectItem key={r} value={r} className="text-xs">{r}%</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {needsNatura && (
              <Badge variant="destructive" className="absolute -top-1 -right-1 h-3 w-3 p-0 flex items-center justify-center">
                <AlertTriangle className="h-2 w-2" />
              </Badge>
            )}
          </div>

          <span className="text-xs font-medium text-right tabular-nums">
            {formatCurrency(riga.totale_riga)}
          </span>

          {/* Row actions */}
          {!disabled && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDuplicate(index)}>
                <Copy className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRemove(index)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          )}
        </div>

        {/* Natura IVA selector (shown when IVA=0%) */}
        {naturaOpen && (parseFloat(riga.aliquota_iva) || 0) === 0 && (
          <div className="px-2 pb-2 pl-10">
            <Select
              value={riga.natura_iva ?? ""}
              onValueChange={(v) => {
                onUpdate(index, "natura_iva", v || undefined);
                setNaturaOpen(false);
              }}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Seleziona natura IVA..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(NATURE_IVA).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-xs">{k} – {v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Expanded details */}
        <CollapsibleContent>
          <div className="px-4 py-3 bg-muted/20 border-t space-y-3 ml-8 mr-2 rounded-b">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Codice articolo</Label>
                <Input
                  value={riga.codice_articolo ?? ""}
                  onChange={(e) => onUpdate(index, "codice_articolo", e.target.value)}
                  className="h-7 text-xs"
                  disabled={disabled}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Sconto €</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={riga.sconto_valore ?? ""}
                  onChange={(e) => onUpdate(index, "sconto_valore", parseFloat(e.target.value) || 0)}
                  className="h-7 text-xs"
                  disabled={disabled}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Tipo cessione</Label>
                <Select
                  value={riga.tipo_cessione ?? ""}
                  onValueChange={(v) => onUpdate(index, "tipo_cessione", v || undefined)}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SC">SC – Sconto</SelectItem>
                    <SelectItem value="PR">PR – Premio</SelectItem>
                    <SelectItem value="AB">AB – Abbuono</SelectItem>
                    <SelectItem value="AC">AC – Spesa accessoria</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Rif. amministrazione</Label>
                <Input
                  value={riga.riferimento_amministrazione ?? ""}
                  onChange={(e) => onUpdate(index, "riferimento_amministrazione", e.target.value)}
                  className="h-7 text-xs"
                  disabled={disabled}
                />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <Switch
                  checked={riga.ritenuta ?? false}
                  onCheckedChange={(v) => onUpdate(index, "ritenuta", v)}
                  disabled={disabled}
                />
                <Label className="text-xs text-muted-foreground">Soggetta a ritenuta</Label>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Note riga</Label>
              <Textarea
                value={riga.note_riga ?? ""}
                onChange={(e) => onUpdate(index, "note_riga", e.target.value)}
                className="text-xs resize-none h-14"
                disabled={disabled}
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export function EditorRigheSection({ state, dispatch, disabled }: Props) {
  const righe = state.righe ?? [];
  const { data: articoli } = useArticoliNative();
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function addBlankRow() {
    dispatch({ type: "ADD_RIGA", riga: createEmptyRiga(righe.length + 1) });
  }

  function addDescriptiveRow() {
    const riga = createEmptyRiga(righe.length + 1);
    riga.quantita = 0;
    riga.prezzo_unitario = 0;
    dispatch({ type: "ADD_RIGA", riga });
  }

  function addFromCatalog(art: ArticoloNative) {
    const riga: RigaDocumento = {
      id: crypto.randomUUID(),
      numero_linea: righe.length + 1,
      codice_articolo: art.codice ?? undefined,
      descrizione: art.descrizione,
      quantita: 1,
      unita_misura: art.unita_misura,
      prezzo_unitario: art.prezzo_vendita,
      aliquota_iva: art.aliquota_iva,
      natura_iva: art.natura_iva as RigaDocumento["natura_iva"],
      imponibile: 0,
      imposta: 0,
      totale_riga: 0,
    };
    dispatch({ type: "ADD_RIGA", riga });
    setCatalogOpen(false);
    setCatalogSearch("");
  }

  function updateField(index: number, field: keyof RigaDocumento, value: unknown) {
    dispatch({ type: "UPDATE_RIGA", index, riga: { [field]: value } });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = righe.findIndex((r) => r.id === active.id);
    const newIndex = righe.findIndex((r) => r.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newRighe = [...righe];
    const [removed] = newRighe.splice(oldIndex, 1);
    newRighe.splice(newIndex, 0, removed);
    dispatch({ type: "REORDER_RIGHE", righe: newRighe });
  }

  const filteredArticoli = (articoli ?? [])
    .filter(
      (a) =>
        !catalogSearch ||
        a.descrizione.toLowerCase().includes(catalogSearch.toLowerCase()) ||
        (a.codice && a.codice.toLowerCase().includes(catalogSearch.toLowerCase()))
    )
    .slice(0, 10);

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lista articoli</Label>
        {!disabled && (
          <Popover open={catalogOpen} onOpenChange={setCatalogOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-6 text-[10px] px-2">
                <PackageSearch className="h-3 w-3 mr-1" />
                Da catalogo
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-2" align="end">
              <Input
                placeholder="Cerca articolo..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                className="h-7 text-xs mb-2"
              />
              <div className="max-h-48 overflow-auto space-y-0.5">
                {filteredArticoli.map((art) => (
                  <button
                    key={art.id}
                    className="w-full text-left px-2 py-1.5 hover:bg-accent rounded text-xs"
                    onClick={() => addFromCatalog(art)}
                  >
                    <div className="font-medium truncate">{art.descrizione}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {formatCurrency(art.prezzo_vendita)} · IVA {art.aliquota_iva}%
                    </div>
                  </button>
                ))}
                {filteredArticoli.length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-3">Nessun articolo trovato</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {righe.length === 0 ? (
        <div className="border border-dashed rounded-md py-6 text-center">
          <p className="text-xs text-muted-foreground mb-2">Nessun articolo. Aggiungi dal catalogo o una riga vuota.</p>
          {!disabled && (
            <div className="flex gap-2 justify-center">
              <Button variant="default" size="sm" className="text-xs h-7" onClick={addBlankRow}>
                <Plus className="h-3 w-3 mr-1" />
                Aggiungi voce
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1.5rem_1.5rem_1fr_4rem_4rem_5rem_3.5rem_4rem_5rem_5.5rem] gap-1 px-2 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground">
            <span />
            <span>#</span>
            <span>Descrizione</span>
            <span className="text-right">Qtà</span>
            <span>U.M.</span>
            <span className="text-right">Prezzo</span>
            <span className="text-right">Sc.%</span>
            <span>IVA</span>
            <span className="text-right">Importo</span>
            <span />
          </div>

          {/* Sortable rows */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={righe.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              {righe.map((riga, i) => (
                <SortableRow
                  key={riga.id}
                  riga={riga}
                  index={i}
                  disabled={disabled}
                  onUpdate={updateField}
                  onRemove={(idx) => dispatch({ type: "REMOVE_RIGA", index: idx })}
                  onDuplicate={(idx) => dispatch({ type: "DUPLICATE_RIGA", index: idx })}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Footer buttons — stile Fatture in Cloud */}
      {!disabled && (
        <div className="flex gap-2 flex-wrap">
          <Button variant="default" size="sm" className="text-xs h-7" onClick={addBlankRow}>
            <Plus className="h-3 w-3 mr-1" />
            Aggiungi nuova voce
          </Button>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={addDescriptiveRow}>
            + Riga descrittiva
          </Button>
        </div>
      )}
    </div>
  );
}
