import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GripVertical, Eye, Pencil, Trash2 } from "lucide-react";

const categoryLabels: Record<string, string> = {
  generale: "Generale",
  scheda_prodotto: "Scheda Prodotto",
  garanzia: "Garanzia",
  certificazione: "Certificazione",
  contratto: "Contratto",
  altro: "Altro",
};

interface SortableMaterialItemProps {
  material: any;
  index: number;
  onPreview: (storagePath: string) => void;
  onEdit: (material: any) => void;
  onDelete: (material: any) => void;
}

export function SortableMaterialItem({
  material,
  index,
  onPreview,
  onEdit,
  onDelete,
}: SortableMaterialItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: material.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={`group ${isDragging ? "shadow-lg ring-2 ring-primary/30" : ""}`}>
        <CardContent className="p-3 flex items-center gap-3">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing touch-none p-1 rounded hover:bg-muted"
          >
            <GripVertical className="h-5 w-5 text-muted-foreground/50" />
          </button>

          <Badge
            variant={index === 0 ? "default" : "secondary"}
            className="h-7 w-7 shrink-0 flex items-center justify-center rounded-full text-xs font-bold p-0"
          >
            {index + 1}
          </Badge>

          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{material.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className="text-xs">
                {categoryLabels[material.category] || material.category}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {(material.file_size_bytes / 1024).toFixed(0)} KB
              </span>
            </div>
          </div>

          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => onPreview(material.storage_path)}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => onEdit(material)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive"
              onClick={() => onDelete(material)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
