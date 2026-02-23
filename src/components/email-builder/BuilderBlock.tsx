import { GripVertical, Copy, Trash2, ChevronUp, ChevronDown, Plus, Type, ImageIcon, MousePointerClick, Minus, Code } from "lucide-react";
import { BuilderBlock as BuilderBlockType, TextProps, ImageProps, ButtonProps, DividerProps, SpacerProps, HtmlProps, ColumnsProps, getColumnWidths, BlockType, createBlock } from "./builderTypes";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const CHILD_BLOCK_OPTIONS: { type: BlockType; label: string; icon: React.ReactNode }[] = [
  { type: "text", label: "Testo", icon: <Type className="h-3.5 w-3.5" /> },
  { type: "image", label: "Immagine", icon: <ImageIcon className="h-3.5 w-3.5" /> },
  { type: "button", label: "Pulsante", icon: <MousePointerClick className="h-3.5 w-3.5" /> },
  { type: "divider", label: "Divider", icon: <Minus className="h-3.5 w-3.5" /> },
  { type: "spacer", label: "Spaziatore", icon: <span className="h-3.5 w-3.5 inline-block border-t border-dashed" /> },
  { type: "html", label: "HTML", icon: <Code className="h-3.5 w-3.5" /> },
];

interface BuilderBlockProps {
  block: BuilderBlockType;
  isSelected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  dragHandleProps?: Record<string, any>;
  onAddChildBlock?: (parentId: string, colIndex: number, childType: BlockType) => void;
  onDeleteChildBlock?: (parentId: string, colIndex: number, childId: string) => void;
  onSelectChildBlock?: (childBlock: BuilderBlockType) => void;
  selectedChildBlockId?: string | null;
}

export function BuilderBlock({ block, isSelected, onSelect, onDuplicate, onDelete, onMoveUp, onMoveDown, isFirst, isLast, dragHandleProps, onAddChildBlock, onDeleteChildBlock, onSelectChildBlock, selectedChildBlockId }: BuilderBlockProps) {
  const renderContent = () => {
    switch (block.type) {
      case "text": {
        const p = block.props as TextProps;
        return (
          <div
            style={{ fontFamily: p.fontFamily, fontSize: p.fontSize, color: p.color, textAlign: p.textAlign, fontWeight: p.fontWeight, lineHeight: 1.5 }}
            dangerouslySetInnerHTML={{ __html: p.content }}
          />
        );
      }
      case "image": {
        const p = block.props as ImageProps;
        return p.src ? (
          <div style={{ textAlign: p.align }}>
            <img src={p.src} alt={p.alt} style={{ width: p.width, maxWidth: "100%", height: "auto" }} />
          </div>
        ) : (
          <div className="flex items-center justify-center h-24 bg-muted/50 rounded border-2 border-dashed border-muted-foreground/20 text-sm text-muted-foreground">
            Inserisci URL immagine →
          </div>
        );
      }
      case "button": {
        const p = block.props as ButtonProps;
        return (
          <div style={{ textAlign: p.align, padding: "8px 0" }}>
            <span
              style={{
                display: "inline-block", backgroundColor: p.backgroundColor, color: p.textColor,
                padding: "12px 24px", borderRadius: p.borderRadius, fontWeight: "bold", fontSize: "16px",
              }}
            >
              {p.text}
            </span>
          </div>
        );
      }
      case "divider": {
        const p = block.props as DividerProps;
        return <hr style={{ border: "none", borderTop: `${p.thickness} solid ${p.color}`, margin: `${p.margin} 0` }} />;
      }
      case "spacer": {
        const p = block.props as SpacerProps;
        return <div style={{ height: p.height }} className="bg-muted/20 rounded border border-dashed border-muted-foreground/10" />;
      }
      case "html": {
        const p = block.props as HtmlProps;
        return <div dangerouslySetInnerHTML={{ __html: p.code }} />;
      }
      case "columns": {
        const p = block.props as ColumnsProps;
        const widths = getColumnWidths(p.layout);
        const children = block.children || [];
        return (
          <div style={{ display: "flex", gap: p.gap }}>
            {widths.map((w, i) => (
              <div key={i} style={{ width: w, minHeight: "48px" }} className="border border-dashed border-muted-foreground/20 rounded p-2">
                {(children[i] || []).map((child) => (
                  <div
                    key={child.id}
                    className={`mb-1 relative group/child rounded transition-all cursor-pointer ${selectedChildBlockId === child.id ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-muted-foreground/30"}`}
                    onClick={(e) => { e.stopPropagation(); onSelectChildBlock?.(child); }}
                  >
                    <div className={`absolute -top-2 right-0 z-10 transition-opacity ${selectedChildBlockId === child.id ? "opacity-100" : "opacity-0 group-hover/child:opacity-100"}`}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 bg-background border shadow-sm text-destructive hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); onDeleteChildBlock?.(block.id, i, child.id); }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="p-1">
                      <BuilderBlock
                        block={child}
                        isSelected={false}
                        onSelect={() => onSelectChildBlock?.(child)}
                        onDuplicate={() => {}}
                        onDelete={() => onDeleteChildBlock?.(block.id, i, child.id)}
                        onMoveUp={() => {}}
                        onMoveDown={() => {}}
                        isFirst
                        isLast
                      />
                    </div>
                  </div>
                ))}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full h-7 text-xs text-muted-foreground border border-dashed border-muted-foreground/20 hover:border-primary/50 mt-1">
                      <Plus className="h-3 w-3 mr-1" /> Aggiungi
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-background z-50">
                    {CHILD_BLOCK_OPTIONS.map((opt) => (
                      <DropdownMenuItem key={opt.type} onClick={(e) => { e.stopPropagation(); onAddChildBlock?.(block.id, i, opt.type); }}>
                        {opt.icon}
                        <span className="ml-2">{opt.label}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div
      className={`group relative rounded-md transition-all ${isSelected ? "ring-2 ring-primary shadow-sm" : "hover:ring-1 hover:ring-muted-foreground/20"}`}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {/* Hover toolbar */}
      <div className={`absolute -top-3 right-1 z-10 flex items-center gap-0.5 bg-background border rounded-md shadow-sm px-1 py-0.5 transition-opacity ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
        <div {...dragHandleProps} className="cursor-grab p-0.5">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        {!isFirst && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onMoveUp(); }}>
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
        )}
        {!isLast && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onMoveDown(); }}>
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onDuplicate(); }}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="p-3">{renderContent()}</div>
    </div>
  );
}
