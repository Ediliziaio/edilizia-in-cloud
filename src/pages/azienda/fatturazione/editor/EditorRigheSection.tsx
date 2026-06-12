import { useState, useCallback, memo } from "react";
import { Plus, Trash2, PackageSearch, Copy, ChevronDown, GripVertical, AlertTriangle, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { useArticoliNative } from "@/hooks/useArticoliNative";
import { createEmptyRiga } from "./useEditorState";
import { formatCurrency } from "@/lib/formatters";
import { parseDecimalIT } from "@/lib/parseDecimalIT";
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
// Memoizzato — evita re-render di TUTTE le righe quando UNA cambia.
// Con 10+ righe questo era il principale costo di re-render durante typing.
// Handlers stabili tramite useCallback nel parent (vedi EditorRigheSection).

interface SortableRowProps {
  riga: RigaDocumento;
  index: number;
  disabled?: boolean;
  onUpdate: (index: number, field: keyof RigaDocumento, value: unknown) => void;
  onRemove: (index: number) => void;
  onDuplicate: (index: number) => void;
  prezziLordi?: boolean;
}

function SortableRowImpl({
  riga,
  index,
  disabled,
  onUpdate,
  onRemove,
  onDuplicate,
  prezziLordi,
}: SortableRowProps) {
  // Default collapsed: mostra solo TOP row (Codice + Nome + Qtà + UM + Prezzo).
  // L'utente espande per vedere/modificare Descrizione + Sc% + IVA + Importo
  // + checkbox + Categoria. Auto-espanso se contiene descrizione multiline o
  // dati strutturati nei campi "avanzati".
  const hasAdvancedData =
    riga.descrizione.includes("\n") ||
    !!riga.riferimento_amministrazione ||
    (riga.sconto_percentuale ?? 0) > 0 ||
    riga.natura_iva === "N1";
  const [expanded, setExpanded] = useState(hasAdvancedData);

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

  // "Articolo non imponibile (anticipazione)" = aliquota 0% + natura N1
  const isAnticipazione = (parseFloat(riga.aliquota_iva) || 0) === 0 && riga.natura_iva === "N1";

  return (
    <div ref={setNodeRef} style={style}>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        {/* Card grande con 2 colonne interne — replica Fatture in Cloud:
            LEFT col: Codice + Nome prodotto + Descrizione + Categoria
            RIGHT col: Qtà + U.M. + Prezzo netto + Sc.% + IVA + Importo totale
            FOOTER: ☐ Articolo non imponibile (anticipazione)
            Actions (espandi/duplica/cestino) in alto a destra orizzontali. */}
        <div
          className={`border rounded-lg group transition-colors mb-3 ${
            isDragging ? "bg-muted/40 border-primary/40" : "bg-card"
          }`}
        >
          <div className="flex gap-3 px-4 py-4">
            {/* Drag handle a sinistra */}
            <div className="flex flex-col items-center gap-1 shrink-0 pt-2">
              <button
                className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground transition"
                {...attributes}
                {...listeners}
                aria-label="Trascina riga"
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <span className="text-[10px] font-medium text-muted-foreground/60">{index + 1}</span>
            </div>

            {/* Contenuto principale — grid stabile, no flex-wrap */}
            <div className="flex-1 min-w-0 space-y-3">
              {/* TOP ROW — grid 7 colonne: 6 dati + 3 icone azioni a destra */}
              <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_4rem_4.5rem_5rem_5.5rem_auto] gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground font-normal">Codice</Label>
                  <Input
                    value={riga.codice_articolo ?? ""}
                    onChange={(e) => onUpdate(index, "codice_articolo", e.target.value)}
                    className="h-8 text-sm"
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-[10px] text-muted-foreground font-normal">Nome prodotto</Label>
                  <Input
                    value={riga.descrizione.split("\n")[0] ?? ""}
                    onChange={(e) => {
                      const lines = riga.descrizione.split("\n");
                      lines[0] = e.target.value;
                      onUpdate(index, "descrizione", lines.join("\n"));
                    }}
                    className="h-8 text-sm w-full"
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground font-normal">Quantità</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="1000000"
                    value={riga.quantita}
                    // 2026-05-27 (Form UX audit): parseDecimalIT gestisce
                    // "9,50" (IT) e "1.234,56" (IT migliaia). Prima
                    // parseFloat("1.234,56") ritornava 1.234 → totale
                    // fattura sbagliato di 1233€, autosalvato e inviato a SDI.
                    onChange={(e) => onUpdate(index, "quantita", parseDecimalIT(e.target.value))}
                    className="h-8 text-sm text-right tabular-nums"
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground font-normal">U.M.</Label>
                  <Select
                    value={riga.unita_misura || "pz"}
                    onValueChange={(v) => onUpdate(index, "unita_misura", v)}
                    disabled={disabled}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITA_MISURA.map((u) => (
                        <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground font-normal">{prezziLordi ? "Lordo" : "Prezzo"}</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.0001"
                    min="0"
                    max="1000000"
                    value={
                      prezziLordi
                        ? Math.round(riga.prezzo_unitario * (1 + (parseDecimalIT(riga.aliquota_iva)) / 100) * 10000) / 10000
                        : riga.prezzo_unitario
                    }
                    // 2026-05-27 (Form UX audit): parseDecimalIT IT-aware.
                    onChange={(e) => {
                      const v = parseDecimalIT(e.target.value);
                      onUpdate(index, "prezzo_unitario", prezziLordi ? calcoloInverso(v, riga.aliquota_iva) : v);
                    }}
                    className="h-8 text-sm text-right tabular-nums"
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground font-normal">Importo</Label>
                  <div className="h-8 px-2 flex items-center justify-end text-sm font-semibold tabular-nums rounded-md border bg-muted/40">
                    {formatCurrency(riga.totale_riga)}
                  </div>
                </div>
                {/* Actions inline su una sola riga, allineate alla baseline degli input */}
                <div className="self-end flex items-center gap-0.5 pb-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 md:h-7 md:w-7"
                    onClick={() => setExpanded((e) => !e)}
                    aria-label={expanded ? "Riduci riga" : "Espandi riga"}
                    title={expanded ? "Riduci" : "Espandi per dettagli"}
                  >
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
                  </Button>
                  {!disabled && (
                    <>
                      <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7" onClick={() => onDuplicate(index)} aria-label="Duplica">
                        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7" onClick={() => onRemove(index)} aria-label="Elimina">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {expanded && (<>
              {/* MIDDLE ROW — grid 2 col: Descrizione (1fr) | Sc% IVA stacked */}
              <div className="grid grid-cols-[minmax(0,1fr)_10rem] gap-3">
                <div className="space-y-1 min-w-0">
                  <Label className="text-[10px] text-muted-foreground font-normal">Descrizione</Label>
                  <Textarea
                    value={riga.descrizione.split("\n").slice(1).join("\n")}
                    onChange={(e) => {
                      const firstLine = riga.descrizione.split("\n")[0] ?? "";
                      const extra = e.target.value;
                      onUpdate(index, "descrizione", extra ? `${firstLine}\n${extra}` : firstLine);
                    }}
                    className="text-xs resize-y min-h-[4.5rem] w-full"
                    placeholder="Note aggiuntive sulla riga…"
                    rows={3}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground font-normal">Sconto %</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        max="100"
                        value={riga.sconto_percentuale ?? ""}
                        onChange={(e) => onUpdate(index, "sconto_percentuale", parseDecimalIT(e.target.value))}
                        className="h-8 text-sm text-right tabular-nums"
                        placeholder="0"
                        disabled={disabled}
                      />
                    </div>
                    <div className="space-y-1 relative">
                      <Label className="text-[10px] text-muted-foreground font-normal">IVA</Label>
                      <Select
                        value={ivaValueFromRiga(riga)}
                        onValueChange={(v) => {
                          const opt = IVA_COMBINED_OPTIONS.find((o) => o.value === v);
                          if (opt) {
                            onUpdate(index, "aliquota_iva", opt.aliquota);
                            onUpdate(index, "natura_iva", opt.natura);
                          } else {
                            onUpdate(index, "aliquota_iva", v);
                            onUpdate(index, "natura_iva", undefined);
                          }
                        }}
                        disabled={disabled}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <span className="truncate">{ivaDisplayLabel(riga)}</span>
                        </SelectTrigger>
                        <SelectContent className="max-h-96 w-[22rem]">
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
                  </div>
                </div>
              </div>

              {/* Natura IVA hint */}
              {riga.natura_iva && (parseFloat(riga.aliquota_iva) || 0) === 0 && !isAnticipazione && (
                <span className="text-[10px] text-muted-foreground block">
                  {riga.natura_iva.replace("_", ".")} – {NATURE_IVA[riga.natura_iva as keyof typeof NATURE_IVA] ?? ""}
                </span>
              )}

              {/* FOOTER ROW — grid 2 col: checkbox (auto) | Categoria (1fr) */}
              <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 items-end">
                <label className="flex items-center gap-2 text-xs cursor-pointer select-none pb-2">
                  <input
                    type="checkbox"
                    checked={isAnticipazione}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onUpdate(index, "aliquota_iva", "0");
                        onUpdate(index, "natura_iva", "N1");
                      } else {
                        onUpdate(index, "aliquota_iva", "22");
                        onUpdate(index, "natura_iva", undefined);
                      }
                    }}
                    className="h-3.5 w-3.5 rounded border-input"
                    disabled={disabled}
                  />
                  <span className="text-muted-foreground whitespace-nowrap">Articolo non imponibile (anticipazione)</span>
                </label>
                <div className="space-y-1 min-w-0">
                  <Label className="text-[10px] text-muted-foreground font-normal">Categoria</Label>
                  <Input
                    value={riga.riferimento_amministrazione ?? ""}
                    onChange={(e) => onUpdate(index, "riferimento_amministrazione", e.target.value)}
                    className="h-8 text-sm w-full"
                    placeholder="—"
                    disabled={disabled}
                  />
                </div>
              </div>
              </>)}

              {/* Hint compatto Sc.% / IVA quando collapsed (info read-only) */}
              {!expanded && (riga.sconto_percentuale || ivaDisplayLabel(riga) !== "22%") && (
                <div className="text-[10px] text-muted-foreground/70">
                  Sc.% {riga.sconto_percentuale ?? 0} · IVA {ivaDisplayLabel(riga)}
                </div>
              )}
            </div>

          </div>
        </div>
      </Collapsible>
    </div>
  );
}

/**
 * SortableRow — wrapped in memo per skip render quando le props non cambiano.
 * Custom equality: ignora il riferimento di `riga` se i campi rilevanti sono
 * uguali (l'autosave nel reducer ricrea sempre l'array, ma molti dei suoi
 * elementi restano identici a livello di valori).
 */
const SortableRow = memo(SortableRowImpl, (prev, next) => {
  if (prev.index !== next.index) return false;
  if (prev.disabled !== next.disabled) return false;
  if (prev.prezziLordi !== next.prezziLordi) return false;
  if (prev.onUpdate !== next.onUpdate) return false;
  if (prev.onRemove !== next.onRemove) return false;
  if (prev.onDuplicate !== next.onDuplicate) return false;
  // Riga è oggetto: confronta i campi chiave (escludendo proprietà interne)
  const a = prev.riga;
  const b = next.riga;
  return (
    a.id === b.id &&
    a.codice_articolo === b.codice_articolo &&
    a.descrizione === b.descrizione &&
    a.quantita === b.quantita &&
    a.unita_misura === b.unita_misura &&
    a.prezzo_unitario === b.prezzo_unitario &&
    a.sconto_percentuale === b.sconto_percentuale &&
    a.aliquota_iva === b.aliquota_iva &&
    a.natura_iva === b.natura_iva &&
    a.totale_riga === b.totale_riga &&
    a.riferimento_amministrazione === b.riferimento_amministrazione
  );
});
SortableRow.displayName = "SortableRow";

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

  // Handlers stabili — dipendono solo da `dispatch` (stable di useReducer) e
  // righe (per remove/duplicate). Stabilizzati per consentire a SortableRow
  // (memoizzato) di skippare i re-render quando le props non cambiano.
  const updateField = useCallback(
    (index: number, field: keyof RigaDocumento, value: unknown) => {
      dispatch({ type: "UPDATE_RIGA", index, riga: { [field]: value } });
    },
    [dispatch],
  );

  const removeRiga = useCallback(
    (index: number) => dispatch({ type: "REMOVE_RIGA", index }),
    [dispatch],
  );

  const duplicateRiga = useCallback(
    (index: number) => dispatch({ type: "DUPLICATE_RIGA", index }),
    [dispatch],
  );

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

  const matchingArticoli = (articoli ?? []).filter(
    (a) =>
      !catalogSearch ||
      a.descrizione.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      (a.codice && a.codice.toLowerCase().includes(catalogSearch.toLowerCase()))
  );
  const filteredArticoli = matchingArticoli.slice(0, 10);
  const articoliNascosti = matchingArticoli.length - filteredArticoli.length;

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
                {articoliNascosti > 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-1.5 border-t">
                    +{articoliNascosti} altri risultati — affina la ricerca
                  </p>
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
          {/* No grid header needed — each row is self-labelled */}

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
                  onRemove={removeRiga}
                  onDuplicate={duplicateRiga}
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
