import { memo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  FV_PDF_PAGES_DEFAULT,
  FV_PDF_PAGES_META,
  normalizeFvPdfPagesOrder,
  type FvPdfPageMeta,
  type FvPdfPageOrderItem,
} from "@/lib/fotovoltaico/pdfPages";
import { EditorBlocco } from "@/components/preventivi/EditorBlocco";
import { bloccoDellaPagina, descrizioneBlocco } from "../../../supabase/functions/_shared/blocchiPreventivo";

interface Props {
  value: FvPdfPageOrderItem[] | null | undefined;
  onChange: (next: FvPdfPageOrderItem[]) => void;
  /** Le scelte dell'azienda sui blocchi (`pdf_blocchi`): con `onBlocchi`, i blocchi si modificano qui. */
  blocchi?: unknown;
  onBlocchi?: (v: Record<string, unknown>) => void;
  /** Il campo per caricare la foto di un blocco: quello dell'editor, col suo bucket. */
  campoFoto?: (valore: string | null, onChange: (url: string | null) => void) => ReactNode;
}

function FvPagesOrderEditorImpl({ value, onChange, blocchi, onBlocchi, campoFoto }: Props) {
  const items = normalizeFvPdfPagesOrder(value);
  const metaById = new Map(FV_PDF_PAGES_META.map((page) => [page.id, page]));
  const [recentlyMovedId, setRecentlyMovedId] = useState<string | null>(null);
  const [aperta, setAperta] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const flash = (id: string) => {
    setRecentlyMovedId(id);
    setTimeout(() => setRecentlyMovedId((current) => (current === id ? null : current)), 800);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const meta = metaById.get(items[oldIndex].id);
    onChange(arrayMove(items, oldIndex, newIndex));
    flash(String(active.id));
    toast.success(`Pagina "${meta?.label ?? String(active.id)}" spostata`);
  };

  const moveUp = (index: number) => {
    if (index <= 0) return;
    onChange(arrayMove(items, index, index - 1));
    flash(items[index].id);
  };

  const moveDown = (index: number) => {
    if (index >= items.length - 1) return;
    onChange(arrayMove(items, index, index + 1));
    flash(items[index].id);
  };

  const toggleVisible = (index: number) => {
    const meta = metaById.get(items[index].id);
    if (meta?.obbligatoria) {
      toast.warning(`"${meta.label}" e' obbligatoria e resta sempre visibile`);
      return;
    }
    onChange(items.map((item, itemIndex) => (
      itemIndex === index ? { ...item, visible: !item.visible } : item
    )));
    flash(items[index].id);
  };

  const resetDefault = () => {
    onChange(FV_PDF_PAGES_DEFAULT);
    toast.success("Ordine pagine FV ripristinato");
  };

  const visibleCount = items.filter((item) => item.visible).length;
  const isCustomOrder = value !== null && value !== undefined;

  return (
    <div className="space-y-3">
      <div className={
        "flex items-start gap-2 rounded-md border px-3 py-2 text-xs " +
        (isCustomOrder
          ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
          : "border-sky-200 bg-sky-50/70 text-sky-900")
      }>
        <span className="font-semibold">{isCustomOrder ? "Ordine personalizzato" : "Ordine di default"}</span>
        <span className="flex-1">
          La cover e' fissa. Le altre pagine si possono riordinare o nascondere; i prodotti restano letti dal preventivo e dal listino.
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Trascina le righe oppure usa le frecce. Le pagine obbligatorie proteggono prezzo, componenti e firma.
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={resetDefault}
          className="h-7 shrink-0 gap-1 text-[11px]"
        >
          <RotateCcw className="h-3 w-3" />
          Default
        </Button>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50/60 p-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-orange-500 text-sm font-bold text-white">
          1
        </div>
        <ImageIcon className="h-4 w-4 shrink-0 text-orange-600" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold">Cover</div>
          <div className="truncate text-[10px] text-muted-foreground">
            Prima pagina fissa, modificabile dalla sezione Copertina.
          </div>
        </div>
        <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
          Fissa
        </span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {items.map((item, index) => {
              const meta = metaById.get(item.id);
              if (!meta) return null;
              const blocco = bloccoDellaPagina(item.id);
              const modificabile = Boolean(blocco && onBlocchi && campoFoto);
              return (
                <SortableFvPageItem
                  key={item.id}
                  item={item}
                  meta={meta}
                  position={index + 2}
                  isFirst={index === 0}
                  isLast={index === items.length - 1}
                  flashing={recentlyMovedId === item.id}
                  onMoveUp={() => moveUp(index)}
                  onMoveDown={() => moveDown(index)}
                  onToggleVisible={() => toggleVisible(index)}
                  promessa={blocco ? descrizioneBlocco(blocco).promessa : false}
                  onModifica={modificabile ? () => setAperta(aperta === item.id ? null : item.id) : undefined}
                >
                  {modificabile && blocco && aperta === item.id && campoFoto ? (
                    <EditorBlocco
                      chiave={blocco}
                      settore="fotovoltaico"
                      salvati={blocchi}
                      onSalvati={(nuovi) => onBlocchi?.(nuovi)}
                      campoFoto={campoFoto}
                    />
                  ) : null}
                </SortableFvPageItem>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
        <span>{visibleCount + 1} pagine attive (cover inclusa)</span>
        <span>Salva per applicare ai prossimi PDF.</span>
      </div>
    </div>
  );
}

function SortableFvPageItem({
  item,
  meta,
  position,
  isFirst,
  isLast,
  flashing,
  onMoveUp,
  onMoveDown,
  onToggleVisible,
  promessa = false,
  onModifica,
  children,
}: {
  item: FvPdfPageOrderItem;
  meta: FvPdfPageMeta;
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
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
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
        (flashing ? "border-emerald-300 bg-emerald-50 ring-2 ring-emerald-300" : "bg-card")
      }
    >
    <div className={"flex items-center gap-2" + (item.visible ? "" : " opacity-60")}>
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Trascina per riordinare"
        className="-ml-1 cursor-grab p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className={
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold " +
        (item.visible ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-400")
      }>
        {item.visible ? position : "-"}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold">{meta.label}</span>
          {meta.obbligatoria && (
            <span className="rounded bg-orange-100 px-1 py-0.5 text-[9px] font-semibold text-orange-700">
              Obbligatoria
            </span>
          )}
          {!item.visible && (
            <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-semibold text-slate-500">
              Nascosta
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
          {meta.descrizione}
        </div>
        {promessa && !item.visible ? (
          <div className="mt-0.5 text-[10px] text-amber-700">
            Spenta di serie: promette qualcosa al cliente. Accendila solo se lo fate davvero.
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <Button size="icon" variant="ghost" onClick={onMoveUp} disabled={isFirst} className="h-7 w-7">
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onMoveDown} disabled={isLast} className="h-7 w-7">
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onToggleVisible}
          disabled={meta.obbligatoria}
          className={"h-7 w-7 " + (item.visible ? "text-sky-700" : "text-slate-400")}
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

export const FvPagesOrderEditor = memo(FvPagesOrderEditorImpl);
