import { useDraggable } from "@dnd-kit/core";
import { Type, Image, RectangleHorizontal, Minus, Space, Code, Columns2, Columns3 } from "lucide-react";
import type { BlockType, ColumnLayout } from "./builderTypes";

interface DraggableItemProps {
  type: BlockType;
  layout?: ColumnLayout;
  icon: React.ReactNode;
  label: string;
}

function DraggableItem({ type, layout, icon, label }: DraggableItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `sidebar-${type}${layout ? `-${layout}` : ""}`,
    data: { type, layout },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border border-border bg-background cursor-grab hover:border-primary/50 hover:bg-muted/50 transition-all select-none ${isDragging ? "opacity-40" : ""}`}
    >
      {icon}
      <span className="text-[10px] font-medium text-muted-foreground leading-tight text-center">{label}</span>
    </div>
  );
}

const ELEMENTS: DraggableItemProps[] = [
  { type: "text", icon: <Type className="h-5 w-5" />, label: "Testo" },
  { type: "image", icon: <Image className="h-5 w-5" />, label: "Immagine" },
  { type: "button", icon: <RectangleHorizontal className="h-5 w-5" />, label: "Pulsante" },
  { type: "divider", icon: <Minus className="h-5 w-5" />, label: "Divisore" },
  { type: "spacer", icon: <Space className="h-5 w-5" />, label: "Spazio" },
  { type: "html", icon: <Code className="h-5 w-5" />, label: "HTML" },
];

const LAYOUTS: { layout: ColumnLayout; label: string; visual: React.ReactNode }[] = [
  {
    layout: "1",
    label: "1 colonna",
    visual: <div className="w-full h-4 bg-primary/20 rounded" />,
  },
  {
    layout: "1/2-1/2",
    label: "2 colonne",
    visual: (
      <div className="flex gap-0.5 w-full">
        <div className="flex-1 h-4 bg-primary/20 rounded" />
        <div className="flex-1 h-4 bg-primary/20 rounded" />
      </div>
    ),
  },
  {
    layout: "1/3-1/3-1/3",
    label: "3 colonne",
    visual: (
      <div className="flex gap-0.5 w-full">
        <div className="flex-1 h-4 bg-primary/20 rounded" />
        <div className="flex-1 h-4 bg-primary/20 rounded" />
        <div className="flex-1 h-4 bg-primary/20 rounded" />
      </div>
    ),
  },
  {
    layout: "1/3-2/3",
    label: "1/3 + 2/3",
    visual: (
      <div className="flex gap-0.5 w-full">
        <div className="w-1/3 h-4 bg-primary/20 rounded" />
        <div className="w-2/3 h-4 bg-primary/20 rounded" />
      </div>
    ),
  },
  {
    layout: "2/3-1/3",
    label: "2/3 + 1/3",
    visual: (
      <div className="flex gap-0.5 w-full">
        <div className="w-2/3 h-4 bg-primary/20 rounded" />
        <div className="w-1/3 h-4 bg-primary/20 rounded" />
      </div>
    ),
  },
];

export function BuilderSidebar() {
  return (
    <div className="w-[220px] border-r bg-background p-3 overflow-y-auto shrink-0">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Elementi</p>
      <div className="grid grid-cols-3 gap-1.5 mb-5">
        {ELEMENTS.map((el) => (
          <DraggableItem key={el.type} {...el} />
        ))}
      </div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Layout</p>
      <div className="grid grid-cols-2 gap-1.5">
        {LAYOUTS.map((l) => (
          <DraggableItem key={l.layout} type="columns" layout={l.layout} icon={l.visual} label={l.label} />
        ))}
      </div>
    </div>
  );
}
