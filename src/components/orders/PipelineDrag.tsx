import { isPipelineCardControl } from "@/lib/orders/cardInteraction";
import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  KeyboardSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { ArrowRightLeft } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface PipelineTarget {
  id: string;
  label: string;
}
const CardActionsContext = createContext<ReactNode>(null);

/** Places actions beside the existing heading, without adding a toolbar row. */
export function PipelineCardHeading({ children }: { children: ReactNode }) {
  const actions = useContext(CardActionsContext);
  return (
    <div
      className="flex min-w-0 items-start gap-2"
      data-pipeline-card-heading=""
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5 self-center">
        {children}
      </div>
      {actions && (
        <div
          className="flex shrink-0 items-center gap-0.5"
          data-pipeline-card-actions=""
        >
          {actions}
        </div>
      )}
    </div>
  );
}
const moveButtonClass =
  "inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-slate-100";

const MoveContext = createContext<{
  enabled: boolean;
  move: (id: string, target: string) => void;
}>({ enabled: false, move: () => {} });

export function PipelineDragScope({
  onMove,
  disabled,
  children,
}: {
  onMove?: (id: string, target: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [active, setActive] = useState<{
    content: ReactNode;
    width: number;
    height: number;
  } | null>(null);
  const enabled = !!onMove && !disabled;
  const sensors = useSensors(
    useSensor(KeyboardSensor),
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 6 },
    }),
  );
  return (
    <MoveContext.Provider
      value={{
        enabled,
        move: (id, target) => {
          if (enabled) onMove?.(id, target);
        },
      }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={(args) =>
          args.pointerCoordinates ? pointerWithin(args) : closestCorners(args)
        }
        onDragStart={(e) => {
          const rect =
            e.active.data.current?.getRect?.() ?? e.active.rect.current.initial;
          if (rect)
            setActive({
              content: e.active.data.current?.content,
              width: rect.width,
              height: rect.height,
            });
        }}
        onDragCancel={() => setActive(null)}
        onDragEnd={(e) => {
          setActive(null);
          if (enabled && e.over && e.active.data.current?.stage !== e.over.id)
            onMove?.(String(e.active.id), String(e.over.id));
        }}
      >
        {children}
        <DragOverlay dropAnimation={null} adjustScale={false}>
          {active ? (
            <div
              data-pipeline-drag-preview=""
              aria-hidden="true"
              ref={(element) => element?.setAttribute("inert", "")}
              style={{ width: active.width, height: active.height }}
              className={cn(
                "relative pointer-events-none min-w-0 select-none rounded-lg bg-white shadow-xl ring-2 ring-primary/25",
              )}
            >
              {active.content}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </MoveContext.Provider>
  );
}
export function PipelineDrop({
  id,
  label,
  className,
  children,
}: {
  id: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const { enabled } = useContext(MoveContext);
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !enabled });
  return (
    <section
      ref={setNodeRef}
      aria-label={`Colonna ${label}`}
      className={cn(
        className,
        enabled && "transition-shadow",
        isOver && "ring-2 ring-orange-400 bg-orange-50/50",
      )}
    >
      {children}
    </section>
  );
}
export function PipelineMoveCard({
  id,
  stage,
  label,
  targets,
  children,
  onOpen,
  actions,
}: {
  id: string;
  stage: string;
  label: string;
  targets: PipelineTarget[];
  children: ReactNode;
  onOpen?: () => void;
  actions?: ReactNode;
}) {
  const { enabled, move } = useContext(MoveContext);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const body = (controls: ReactNode) => (
    <CardActionsContext.Provider value={controls}>
      {children}
    </CardActionsContext.Provider>
  );
  const preview = body(
    <>
      {actions}
      {enabled && (
        <span className={moveButtonClass}>
          <ArrowRightLeft className="h-3.5 w-3.5" />
        </span>
      )}
    </>,
  );
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: {
      stage,
      label,
      content: preview,
      getRect: () => cardRef.current?.getBoundingClientRect(),
    },
    disabled: !enabled,
  });
  const setCardRef = useCallback(
    (node: HTMLDivElement | null) => {
      cardRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );
  return (
    <div
      ref={setCardRef}
      {...(enabled ? attributes : {})}
      {...(enabled ? listeners : {})}
      role={enabled || onOpen ? "group" : undefined}
      aria-label={
        enabled ? `Trascina ${label}` : onOpen ? `Apri ${label}` : undefined
      }
      tabIndex={enabled || onOpen ? 0 : undefined}
      aria-roledescription={enabled ? "scheda trascinabile" : undefined}
      onClick={(event) => {
        if (
          !isDragging &&
          !event.defaultPrevented &&
          !isPipelineCardControl(event.target)
        )
          onOpen?.();
      }}
      onDragStartCapture={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (
          onOpen &&
          (event.key === "Enter" || (!enabled && event.key === " "))
        ) {
          event.preventDefault();
          onOpen();
          return;
        }
        listeners?.onKeyDown?.(event);
      }}
      onMouseDown={(event) => {
        // Links remain draggable; native form controls retain their normal use.
        if (
          !(event.target as HTMLElement).closest(
            "button,summary,input,select,textarea,[role='button'],[role='checkbox'],[role='menuitem'],[contenteditable='true'],[data-no-drag]",
          )
        )
          listeners?.onMouseDown?.(event);
      }}
      onTouchStart={(event) => {
        if (
          !(event.target as HTMLElement).closest(
            "button,summary,input,select,textarea,[role='button'],[role='checkbox'],[role='menuitem'],[contenteditable='true'],[data-no-drag]",
          )
        )
          listeners?.onTouchStart?.(event);
      }}
      className={cn(
        "relative min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        enabled
          ? "cursor-grab active:cursor-grabbing"
          : onOpen && "cursor-pointer",
        isDragging && "opacity-30",
      )}
    >
      {body(
        <>
          {actions}
          {enabled && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Sposta ${label}`}
                  title="Sposta in un’altra fase"
                  className={cn(
                    moveButtonClass,
                    "hover:bg-white hover:text-primary focus-visible:ring-2 focus-visible:ring-primary",
                  )}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  Scegli la fase di destinazione
                </DropdownMenuLabel>
                {targets
                  .filter((t) => t.id !== stage)
                  .map((t) => (
                    <DropdownMenuItem key={t.id} onClick={() => move(id, t.id)}>
                      {t.label}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>,
      )}
    </div>
  );
}
