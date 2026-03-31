import { useState } from "react";
import { Plus, Trash2, PackageSearch, Copy, ChevronDown, GripVertical, AlertTriangle, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useArticoliNative } from "@/hooks/useArticoliNative";
import { createEmptyRiga } from "./useEditorState";
import { formatCurrency } from "@/lib/formatters";
import { NATURE_IVA } from "@/types/fatturazione";
import type { RigaDocumento, ArticoloNative } from "@/types/fatturazione";
import type { EditorState, Action } from "./useEditorState";

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
  dispatch: React.Dispatch<Action>;
  disabled?: boolean;
}

/** Calcolo inverso: dato il prezzo lordo (IVA inclusa) e l'aliquota, ritorna il netto */
function calcoloInverso(prezzoLordo: number, aliquotaStr: string): number {
  const aliquota = parseFloat(aliquotaStr) || 0;
  if (aliquota === 0) return prezzoLordo;
  return Math.round((prezzoLordo / (1 + aliquota / 100)) * 10000) / 10000;
}

const UNITA_MISURA = ["pz", "h", "gg", "mese", "km", "kg", "l", "m", "m²", "m³", "kWh", "%"];
const IVA_RATES = ["22", "10", "5", "4", "0"];

// IVA options combining aliquote + nature codes for the combined dropdown
// Elenco completo codici IVA come da normativa italiana vigente (DPR 633/72 e successive modifiche)
const IVA_COMBINED_OPTIONS: { value: string; label: string; group: string; aliquota: string; natura?: string }[] = [
  // ═══ Aliquote IVA ordinarie e ridotte ═══
  { value: "22", label: "22% – Aliquota ordinaria", group: "Aliquote IVA", aliquota: "22" },
  { value: "10", label: "10% – Aliquota ridotta", group: "Aliquote IVA", aliquota: "10" },
  { value: "5", label: "5% – Aliquota ridotta (Tab. A, Parte II-bis)", group: "Aliquote IVA", aliquota: "5" },
  { value: "4", label: "4% – Aliquota minima (Tab. A, Parte II)", group: "Aliquote IVA", aliquota: "4" },

  // ═══ N1 – Escluse ex art. 15 DPR 633/72 ═══
  { value: "0_N1", label: "N1 – Escluse ex art. 15 DPR 633/72", group: "Escluse (N1)", aliquota: "0", natura: "N1" },

  // ═══ N2 – Non soggette ad IVA ═══
  { value: "0_N2_1", label: "N2.1 – Non sogg. artt. da 7 a 7-septies DPR 633/72", group: "Non soggette (N2)", aliquota: "0", natura: "N2_1" },
  { value: "0_N2_2", label: "N2.2 – Non soggette – altri casi", group: "Non soggette (N2)", aliquota: "0", natura: "N2_2" },

  // ═══ N3 – Non imponibili ═══
  { value: "0_N3_1", label: "N3.1 – Esportazioni (art. 8 co.1 lett. a/b)", group: "Non imponibili (N3)", aliquota: "0", natura: "N3_1" },
  { value: "0_N3_2", label: "N3.2 – Cessioni intracomunitarie (art. 41 DL 331/93)", group: "Non imponibili (N3)", aliquota: "0", natura: "N3_2" },
  { value: "0_N3_3", label: "N3.3 – Cessioni verso San Marino (art. 71)", group: "Non imponibili (N3)", aliquota: "0", natura: "N3_3" },
  { value: "0_N3_4", label: "N3.4 – Op. assimilate alle esportazioni (art. 8-bis, 9, 72)", group: "Non imponibili (N3)", aliquota: "0", natura: "N3_4" },
  { value: "0_N3_5", label: "N3.5 – Dichiarazioni d'intento (art. 8 co.1 lett. c)", group: "Non imponibili (N3)", aliquota: "0", natura: "N3_5" },
  { value: "0_N3_6", label: "N3.6 – Altre operazioni non imponibili", group: "Non imponibili (N3)", aliquota: "0", natura: "N3_6" },

  // ═══ N4 – Esenti art. 10 DPR 633/72 ═══
  { value: "0_N4", label: "N4 – Esenti art. 10 DPR 633/72", group: "Esenti (N4)", aliquota: "0", natura: "N4" },

  // ═══ N5 – Regime del margine ═══
  { value: "0_N5", label: "N5 – Regime del margine (artt. 36-40 DL 41/95)", group: "Regime del margine (N5)", aliquota: "0", natura: "N5" },

  // ═══ N6 – Inversione contabile (Reverse Charge) ═══
  { value: "0_N6_1", label: "N6.1 – Rottami e materiali di recupero (art. 74 co.7-8)", group: "Inversione contabile (N6)", aliquota: "0", natura: "N6_1" },
  { value: "0_N6_2", label: "N6.2 – Oro e argento puro (art. 17 co.5)", group: "Inversione contabile (N6)", aliquota: "0", natura: "N6_2" },
  { value: "0_N6_3", label: "N6.3 – Subappalto edile (art. 17 co.6 lett. a)", group: "Inversione contabile (N6)", aliquota: "0", natura: "N6_3" },
  { value: "0_N6_4", label: "N6.4 – Cessione fabbricati (art. 17 co.6 lett. a-bis)", group: "Inversione contabile (N6)", aliquota: "0", natura: "N6_4" },
  { value: "0_N6_5", label: "N6.5 – Telefoni cellulari (art. 17 co.6 lett. b)", group: "Inversione contabile (N6)", aliquota: "0", natura: "N6_5" },
  { value: "0_N6_6", label: "N6.6 – Prodotti elettronici (art. 17 co.6 lett. c)", group: "Inversione contabile (N6)", aliquota: "0", natura: "N6_6" },
  { value: "0_N6_7", label: "N6.7 – Edile e settori connessi (art. 17 co.6 lett. a-ter)", group: "Inversione contabile (N6)", aliquota: "0", natura: "N6_7" },
  { value: "0_N6_8", label: "N6.8 – Settore energetico (art. 17 co.6 lett. d-bis/ter/quater)", group: "Inversione contabile (N6)", aliquota: "0", natura: "N6_8" },
  { value: "0_N6_9", label: "N6.9 – Inversione contabile altri casi (art. 17)", group: "Inversione contabile (N6)", aliquota: "0", natura: "N6_9" },

  // ═══ N7 – IVA assolta in altro Stato UE ═══
  { value: "0_N7", label: "N7 – IVA assolta in altro Stato membro UE", group: "IVA in altro Stato UE (N7)", aliquota: "0", natura: "N7" },
];

/** Build the "value" key from a riga's aliquota + natura */
function ivaValueFromRiga(riga: RigaDocumento): string {
  const aliq = riga.aliquota_iva ?? "22";
  if (parseFloat(aliq) > 0) return aliq;
  if (riga.natura_iva) return `0_${riga.natura_iva}`;
  return "0";
}

/** Display label for a given IVA value */
function ivaDisplayLabel(riga: RigaDocumento): string {
  const aliq = riga.aliquota_iva ?? "22";
  if (parseFloat(aliq) > 0) return `${aliq}%`;
  if (riga.natura_iva) {
    const code = riga.natura_iva.replace("_", ".");
    return code;
  }
  return "0%";
}

// ─── Sortable Row ────────────────────────────────────────────

function SortableRow({
  riga,
  index,
  disabled,
  onUpdate,
  onRemove,
  onDuplicate,
  prezziLordi,
}: {
  riga: RigaDocumento;
  index: number;
  disabled?: boolean;
  onUpdate: (index: number, field: keyof RigaDocumento, value: unknown) => void;
  onRemove: (index: number) => void;
  onDuplicate: (index: number) => void;
  prezziLordi?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

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
            value={prezziLordi
              ? Math.round(riga.prezzo_unitario * (1 + (parseFloat(riga.aliquota_iva) || 0) / 100) * 10000) / 10000
              : riga.prezzo_unitario
            }
            onChange={(e) => {
              const v = parseFloat(e.target.value) || 0;
              onUpdate(index, "prezzo_unitario", prezziLordi ? calcoloInverso(v, riga.aliquota_iva) : v);
            }}
            className="h-7 text-xs border-0 bg-transparent px-1 text-right"
            title={prezziLordi ? "Prezzo IVA inclusa (verrà scorporata automaticamente)" : "Prezzo netto"}
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
          {/* IVA Select — combined aliquote + nature codes */}
          <div className="relative">
            <Select
              value={ivaValueFromRiga(riga)}
              onValueChange={(v) => {
                const opt = IVA_COMBINED_OPTIONS.find((o) => o.value === v);
                if (opt) {
                  onUpdate(index, "aliquota_iva", opt.aliquota);
                  onUpdate(index, "natura_iva", opt.natura);
                } else {
                  // Fallback for plain "0" selection
                  onUpdate(index, "aliquota_iva", v);
                  onUpdate(index, "natura_iva", undefined);
                }
              }}
              disabled={disabled}
            >
              <SelectTrigger className="h-7 text-xs border-0 bg-transparent px-1 min-w-[3.5rem]">
                <span className="truncate">{ivaDisplayLabel(riga)}</span>
              </SelectTrigger>
              <SelectContent className="max-h-96 w-[22rem]">
                {/* Group by category — ordine ufficiale SDI */}
                {[
                  "Aliquote IVA",
                  "Escluse (N1)",
                  "Non soggette (N2)",
                  "Non imponibili (N3)",
                  "Esenti (N4)",
                  "Regime del margine (N5)",
                  "Inversione contabile (N6)",
                  "IVA in altro Stato UE (N7)",
                ].map((group) => {
                  const items = IVA_COMBINED_OPTIONS.filter((o) => o.group === group);
                  if (items.length === 0) return null;
                  return (
                    <SelectGroup key={group}>
                      <SelectLabel className="text-[10px] font-semibold text-muted-foreground">{group}</SelectLabel>
                      {items.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  );
                })}
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

        {/* Natura IVA summary badge when 0% with nature is set */}
        {riga.natura_iva && (parseFloat(riga.aliquota_iva) || 0) === 0 && (
          <div className="px-2 pb-1 pl-10">
            <span className="text-[10px] text-muted-foreground">
              {riga.natura_iva.replace("_", ".")} – {NATURE_IVA[riga.natura_iva as keyof typeof NATURE_IVA] ?? ""}
            </span>
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
  const [usePrezziLordi, setUsePrezziLordi] = useState(false);
  const [calcoloInversoOpen, setCalcoloInversoOpen] = useState(false);
  const [calcoloLordo, setCalcoloLordo] = useState("");
  const [calcoloAliquota, setCalcoloAliquota] = useState("22");
  const calcoloNetto = calcoloLordo ? calcoloInverso(parseFloat(calcoloLordo) || 0, calcoloAliquota) : null;
  const [catalogSearch, setCatalogSearch] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function addBlankRow() {
    const riga = createEmptyRiga(righe.length + 1);
    // TD16 Reverse Charge Interno: default N6.3 (subappalto edile)
    if (state.tipo === 'reverse_charge_interno') {
      riga.aliquota_iva = "0";
      riga.natura_iva = "N6_3";
    }
    dispatch({ type: "ADD_RIGA", riga });
  }

  function addDescriptiveRow() {
    const riga = createEmptyRiga(righe.length + 1);
    riga.quantita = 0;
    riga.prezzo_unitario = 0;
    // TD16 Reverse Charge Interno: default N6.3 (subappalto edile)
    if (state.tipo === 'reverse_charge_interno') {
      riga.aliquota_iva = "0";
      riga.natura_iva = "N6_3";
    }
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
    <div className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">Articoli e prestazioni</Label>
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
        <div className="border-2 border-dashed border-muted-foreground/20 rounded-lg py-8 text-center bg-muted/20">
          <p className="text-sm text-muted-foreground mb-3">Aggiungi il primo articolo o prestazione</p>
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
            <span className="text-right">{usePrezziLordi ? "Prezzo lordo" : "Prezzo"}</span>
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
                  prezziLordi={usePrezziLordi}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Footer buttons — stile Fatture in Cloud */}
      {!disabled && (
        <div className="flex gap-2 flex-wrap items-center justify-between">
          <div className="flex gap-2 flex-wrap items-center">
            <Button variant="default" size="sm" className="text-xs h-7" onClick={addBlankRow}>
              <Plus className="h-3 w-3 mr-1" />
              Aggiungi nuova voce
            </Button>
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={addDescriptiveRow}>
              + Riga descrittiva
            </Button>
          </div>
          <div className="flex gap-3 items-center">
            {/* UX-04: Checkbox prezzi lordi */}
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={usePrezziLordi}
                onChange={(e) => setUsePrezziLordi(e.target.checked)}
                className="h-3.5 w-3.5 rounded"
              />
              <span className="text-xs text-muted-foreground">Prezzi lordi (IVA inclusa)</span>
            </label>
            {/* UX-03: Calcolo inverso */}
            <Popover open={calcoloInversoOpen} onOpenChange={setCalcoloInversoOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs h-7 gap-1">
                  <Calculator className="h-3 w-3" />
                  Calcolo inverso
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="end">
                <p className="text-xs font-medium mb-2">Da prezzo lordo a netto</p>
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Prezzo IVA inclusa (€)</label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="es. 122,00"
                      value={calcoloLordo}
                      onChange={(e) => setCalcoloLordo(e.target.value)}
                      className="h-7 text-xs mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Aliquota IVA (%)</label>
                    <Select value={calcoloAliquota} onValueChange={setCalcoloAliquota}>
                      <SelectTrigger className="h-7 text-xs mt-0.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {IVA_RATES.map((r) => <SelectItem key={r} value={r}>{r}%</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {calcoloNetto !== null && (
                    <div className="bg-muted/50 rounded p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">Prezzo netto</p>
                      <p className="text-base font-bold tabular-nums">€ {calcoloNetto.toFixed(4)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        IVA {calcoloAliquota}% = € {((parseFloat(calcoloLordo) || 0) - calcoloNetto).toFixed(2)}
                      </p>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}
    </div>
  );
}
