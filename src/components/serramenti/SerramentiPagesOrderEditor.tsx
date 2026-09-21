/**
 * SerramentiPagesOrderEditor — Editor visuale per riordino + visibilità
 * pagine PDF preventivo.
 *
 * Funzionalità:
 *  - Lista delle pagine in ordine corrente con label e descrizione.
 *  - Drag-and-drop reorder via @dnd-kit/sortable.
 *  - Toggle "Visibile" per ogni pagina (disabilitato sulle obbligatorie).
 *  - Bottoni "Su / Giù" come fallback accessibile / mobile-friendly.
 *  - Indicator "Cover" come prima pagina fissa (non riordinabile).
 *  - Reset all'ordine di default.
 *
 * State è esterno: il chiamante (SerramentiTemplateEditor) gestisce salvataggio.
 */
import { memo, useState, type ReactNode } from "react";
import { GripVertical, ChevronUp, ChevronDown, Eye, EyeOff, RotateCcw, Image as ImageIcon, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  SR_PDF_PAGES_DEFAULT, SR_PDF_PAGES_META, normalizePdfPagesOrder,
  type SrPdfPageOrderItem, type SrPdfPageMeta,
} from "@/types/serramenti";
import { EditorBlocco } from "@/components/preventivi/EditorBlocco";
import { bloccoDellaPagina, descrizioneBlocco } from "../../../supabase/functions/_shared/blocchiPreventivo";

interface Props {
  value: SrPdfPageOrderItem[] | null;
  onChange: (next: SrPdfPageOrderItem[]) => void;
  /** Le scelte dell'azienda sui blocchi (`pdf_blocchi`): con `onBlocchi`, i blocchi si modificano qui. */
  blocchi?: unknown;
  onBlocchi?: (v: Record<string, unknown>) => void;
  /** Il campo per caricare la foto di un blocco: quello dell'editor, col suo bucket. */
  campoFoto?: (valore: string | null, onChange: (url: string | null) => void) => ReactNode;
}

function SerramentiPagesOrderEditorImpl({ value, onChange, blocchi, onBlocchi, campoFoto }: Props) {
  // Normalizziamo sempre: garantisce che tutte le pagine canoniche siano
  // presenti e che le obbligatorie abbiano visible=true.
  const items = normalizePdfPagesOrder(value);
  const metaById = new Map<string, SrPdfPageMeta>(SR_PDF_PAGES_META.map((m) => [m.id, m]));

  // Highlight ephemero dell'item appena mosso: serve come conferma visiva
  // (oltre al toast). Si auto-resetta dopo 800ms.
  const [recentlyMovedId, setRecentlyMovedId] = useState<string | null>(null);
  const [aperta, setAperta] = useState<string | null>(null);
  const flash = (id: string) => {
    setRecentlyMovedId(id);
    setTimeout(() => setRecentlyMovedId((curr) => (curr === id ? null : curr)), 800);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const meta = metaById.get(items[oldIndex].id);
    onChange(arrayMove(items, oldIndex, newIndex));
    flash(String(active.id));
    toast.success(`Pagina "${meta?.label ?? items[oldIndex].id}" spostata`, {
      description: `Ricorda di salvare per applicare ai prossimi PDF.`,
      duration: 2000,
    });
  };

  const moveUp = (idx: number) => {
    if (idx <= 0) return;
    const meta = metaById.get(items[idx].id);
    onChange(arrayMove(items, idx, idx - 1));
    flash(items[idx].id);
    toast.success(`"${meta?.label ?? items[idx].id}" spostata su`, { duration: 1500 });
  };

  const moveDown = (idx: number) => {
    if (idx >= items.length - 1) return;
    const meta = metaById.get(items[idx].id);
    onChange(arrayMove(items, idx, idx + 1));
    flash(items[idx].id);
    toast.success(`"${meta?.label ?? items[idx].id}" spostata giù`, { duration: 1500 });
  };

  const toggleVisible = (idx: number) => {
    const meta = metaById.get(items[idx].id);
    if (meta?.obbligatoria) {
      toast.warning(`"${meta.label}" è obbligatoria, non può essere nascosta`, {
        duration: 2500,
      });
      return;
    }
    const next = items.map((it, i) => i === idx ? { ...it, visible: !it.visible } : it);
    onChange(next);
    flash(items[idx].id);
    toast.success(
      items[idx].visible
        ? `"${meta?.label ?? items[idx].id}" nascosta dal PDF`
        : `"${meta?.label ?? items[idx].id}" ora visibile nel PDF`,
      { duration: 1800 },
    );
  };

  const resetDefault = () => {
    onChange(SR_PDF_PAGES_DEFAULT);
    toast.success("Ordine pagine ripristinato al default", { duration: 2000 });
  };

  const visibiliCount = items.filter((i) => i.visible).length;

  // Indica se l'ordine corrente è custom o default (per messaggio chiaro
  // all'utente: capisce subito se le sue modifiche sono state persistite).
  const isCustomOrder = value !== null && value !== undefined;

  return (
    <div className="space-y-3">
      {/* Banner stato: serve per capire SUBITO se l'utente sta vedendo
          l'ordine default o uno custom (e quindi se deve salvare). */}
      <div className={
        "rounded-md border px-3 py-2 text-xs flex items-start gap-2 " +
        (isCustomOrder
          ? "border-emerald-200 bg-emerald-50/50 text-emerald-900"
          : "border-blue-200 bg-blue-50/50 text-blue-900")
      }>
        <div className="font-semibold">
          {isCustomOrder ? "✓ Ordine personalizzato" : "ℹ Ordine di default"}
        </div>
        <div className="flex-1">
          {isCustomOrder
            ? "Stai vedendo un ordine personalizzato. Ricorda di cliccare \"Salva impostazioni\" in basso a destra per applicarlo ai prossimi PDF."
            : "Stai vedendo l'ordine di default. Trascina o usa le frecce per personalizzarlo, poi clicca \"Salva impostazioni\"."}
        </div>
      </div>

      {/* Intro + reset */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-muted-foreground">
          Trascina per riordinare. Tocca l'occhio per mostrare/nascondere una pagina.
          La <strong>cover</strong> è sempre la prima e non riordinabile. Le pagine con le immagini
          dei prodotti stanno sempre prima dell'<strong>allegato tecnico</strong>, e la{" "}
          <strong>proposta economica</strong> subito dopo: se le sposti, tornano lì.
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={resetDefault}
          className="h-7 text-[11px] text-muted-foreground hover:text-foreground gap-1"
        >
          <RotateCcw className="h-3 w-3" />
          Ripristina ordine default
        </Button>
      </div>

      {/* Cover (pagina fissa, non riordinabile) */}
      <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-md bg-orange-500 text-white flex items-center justify-center font-bold text-sm shrink-0">
          1
        </div>
        <ImageIcon className="h-4 w-4 text-orange-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold">Cover (copertina)</div>
          <div className="text-[10px] text-muted-foreground">
            Sempre la prima pagina del PDF. Personalizzabile dalla tab "Cover".
          </div>
        </div>
        <span className="text-[10px] text-orange-600 bg-orange-100 rounded px-1.5 py-0.5 font-medium shrink-0">
          Fissa
        </span>
      </div>

      {/* Lista pagine riordinabili */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {items.map((it, idx) => {
              const meta = metaById.get(it.id);
              if (!meta) return null;
              const blocco = bloccoDellaPagina(it.id);
              const modificabile = Boolean(blocco && onBlocchi && campoFoto);
              return (
                <SortablePageItem
                  key={it.id}
                  item={it}
                  meta={meta}
                  position={idx + 2}
                  isFirst={idx === 0}
                  isLast={idx === items.length - 1}
                  flashing={recentlyMovedId === it.id}
                  onMoveUp={() => moveUp(idx)}
                  onMoveDown={() => moveDown(idx)}
                  onToggleVisible={() => toggleVisible(idx)}
                  promessa={blocco ? descrizioneBlocco(blocco).promessa : false}
                  onModifica={modificabile ? () => setAperta(aperta === it.id ? null : it.id) : undefined}
                >
                  {modificabile && blocco && aperta === it.id && campoFoto ? (
                    <EditorBlocco
                      chiave={blocco}
                      settore="serramenti"
                      salvati={blocchi}
                      onSalvati={(nuovi) => onBlocchi?.(nuovi)}
                      campoFoto={campoFoto}
                    />
                  ) : null}
                </SortablePageItem>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* Counter */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t">
        <span>
          {visibiliCount + 1} pagine attive su {items.length + 1} totali
          (1 cover + {visibiliCount} riordinabili)
        </span>
        <span className="italic">
          Modifiche salvate al click su "Salva impostazioni"
        </span>
      </div>
    </div>
  );
}

// ─── Singola riga riordinabile ───────────────────────────────────────────────

function SortablePageItem({
  item, meta, position, isFirst, isLast, flashing,
  onMoveUp, onMoveDown, onToggleVisible, promessa = false, onModifica, children,
}: {
  item: SrPdfPageOrderItem;
  meta: SrPdfPageMeta;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  flashing: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleVisible: () => void;
  /** Un blocco che promette qualcosa al cliente: spento, lo dice. */
  promessa?: boolean;
  /** Apre l'editor del blocco sotto la riga. */
  onModifica?: () => void;
  children?: ReactNode;
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        "rounded-lg border p-2.5 transition-all duration-300 " +
        (flashing ? "ring-2 ring-emerald-400 bg-emerald-50 border-emerald-300" : "bg-card") +
        " " +
        (item.visible ? "" : "bg-muted/30")
      }
    >
    <div className={"flex items-center gap-2 " + (item.visible ? "" : "opacity-60")}>
      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 -ml-1 touch-none"
        aria-label="Trascina per riordinare"
        title="Trascina"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Numero posizione */}
      <div className={
        "h-8 w-8 rounded-md flex items-center justify-center font-bold text-xs shrink-0 " +
        (item.visible ? "bg-orange-100 text-orange-600" : "bg-slate-100 text-slate-400")
      }>
        {item.visible ? position : "—"}
      </div>

      {/* Label + descrizione */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold">{meta.label}</span>
          {meta.obbligatoria && (
            <span className="text-[9px] text-orange-600 bg-orange-100 rounded px-1 py-0.5 font-medium">
              Obbligatoria
            </span>
          )}
          {!item.visible && (
            <span className="text-[9px] text-slate-500 bg-slate-100 rounded px-1 py-0.5 font-medium">
              Nascosta
            </span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
          {meta.descrizione}
        </div>
        {promessa && !item.visible ? (
          <div className="text-[10px] text-amber-700 mt-0.5">
            Spenta di serie: promette qualcosa al cliente. Accendila solo se lo fate davvero.
          </div>
        ) : null}
      </div>

      {/* Up/Down + Visibility */}
      <div className="flex items-center gap-0.5 shrink-0">
        <Button
          size="icon"
          variant="ghost"
          onClick={onMoveUp}
          disabled={isFirst}
          className="h-7 w-7"
          aria-label="Sposta su"
          title="Sposta su"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onMoveDown}
          disabled={isLast}
          className="h-7 w-7"
          aria-label="Sposta giù"
          title="Sposta giù"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onToggleVisible}
          disabled={meta.obbligatoria}
          className={
            "h-7 w-7 " +
            (meta.obbligatoria ? "" : item.visible ? "text-orange-600" : "text-slate-400")
          }
          aria-label={item.visible ? "Nascondi pagina" : "Mostra pagina"}
          title={
            meta.obbligatoria
              ? "Pagina obbligatoria, sempre visibile"
              : item.visible ? "Nascondi questa pagina dal PDF" : "Mostra questa pagina nel PDF"
          }
        >
          {item.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </Button>
        {onModifica ? (
          <Button
            size="icon"
            variant="ghost"
            onClick={onModifica}
            className="h-7 w-7"
            aria-label={`Modifica ${meta.label}`}
            title="Testi, voci e foto di questa pagina"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
    {children}
    </div>
  );
}


// PERF: memoized export — re-render solo su cambio `value`/`onChange`.
export const SerramentiPagesOrderEditor = memo(SerramentiPagesOrderEditorImpl);
