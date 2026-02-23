import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BuilderBlock as BuilderBlockType, BlockType } from "./builderTypes";
import { BuilderBlock } from "./BuilderBlock";
import { Package } from "lucide-react";

interface BuilderCanvasProps {
  blocks: BuilderBlockType[];
  selectedBlockId: string | null;
  onSelectBlock: (id: string | null) => void;
  onDuplicateBlock: (id: string) => void;
  onDeleteBlock: (id: string) => void;
  onMoveBlock: (id: string, direction: "up" | "down") => void;
  previewWidth: string;
  onAddChildBlock?: (parentId: string, colIndex: number, childType: BlockType) => void;
  onDeleteChildBlock?: (parentId: string, colIndex: number, childId: string) => void;
  onSelectChildBlock?: (childBlock: BuilderBlockType) => void;
  selectedChildBlockId?: string | null;
}

function SortableBlock({
  block, isSelected, onSelect, onDuplicate, onDelete, onMoveUp, onMoveDown, isFirst, isLast,
  onAddChildBlock, onDeleteChildBlock, onSelectChildBlock, selectedChildBlockId,
}: {
  block: BuilderBlockType;
  isSelected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  onAddChildBlock?: (parentId: string, colIndex: number, childType: BlockType) => void;
  onDeleteChildBlock?: (parentId: string, colIndex: number, childId: string) => void;
  onSelectChildBlock?: (childBlock: BuilderBlockType) => void;
  selectedChildBlockId?: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <BuilderBlock
        block={block}
        isSelected={isSelected}
        onSelect={onSelect}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        isFirst={isFirst}
        isLast={isLast}
        dragHandleProps={listeners}
        onAddChildBlock={onAddChildBlock}
        onDeleteChildBlock={onDeleteChildBlock}
        onSelectChildBlock={onSelectChildBlock}
        selectedChildBlockId={selectedChildBlockId}
      />
    </div>
  );
}

export function BuilderCanvas({ blocks, selectedBlockId, onSelectBlock, onDuplicateBlock, onDeleteBlock, onMoveBlock, previewWidth, onAddChildBlock, onDeleteChildBlock, onSelectChildBlock, selectedChildBlockId }: BuilderCanvasProps) {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas-drop" });

  return (
    <div className="flex-1 overflow-auto flex justify-center py-6 px-4 bg-muted/30" onClick={() => onSelectBlock(null)}>
      <div
        ref={setNodeRef}
        className={`bg-background border rounded-md shadow-sm transition-all ${isOver ? "ring-2 ring-primary/50" : ""}`}
        style={{ width: previewWidth, minHeight: "500px", maxWidth: "100%" }}
      >
        {blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[500px] text-muted-foreground gap-3">
            <Package className="h-12 w-12 opacity-30" />
            <p className="text-sm">Trascina un elemento qui per iniziare</p>
          </div>
        ) : (
          <div className="p-4 space-y-1">
            <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              {blocks.map((block, i) => (
                <SortableBlock
                  key={block.id}
                  block={block}
                  isSelected={selectedBlockId === block.id}
                  onSelect={() => onSelectBlock(block.id)}
                  onDuplicate={() => onDuplicateBlock(block.id)}
                  onDelete={() => onDeleteBlock(block.id)}
                  onMoveUp={() => onMoveBlock(block.id, "up")}
                  onMoveDown={() => onMoveBlock(block.id, "down")}
                  isFirst={i === 0}
                  isLast={i === blocks.length - 1}
                  onAddChildBlock={onAddChildBlock}
                  onDeleteChildBlock={onDeleteChildBlock}
                  onSelectChildBlock={onSelectChildBlock}
                  selectedChildBlockId={selectedChildBlockId}
                />
              ))}
            </SortableContext>
          </div>
        )}
      </div>
    </div>
  );
}
