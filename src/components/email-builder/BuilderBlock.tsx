import { GripVertical, Copy, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { BuilderBlock as BuilderBlockType, TextProps, ImageProps, ButtonProps, DividerProps, SpacerProps, HtmlProps, ColumnsProps, getColumnWidths } from "./builderTypes";
import { Button } from "@/components/ui/button";

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
}

export function BuilderBlock({ block, isSelected, onSelect, onDuplicate, onDelete, onMoveUp, onMoveDown, isFirst, isLast, dragHandleProps }: BuilderBlockProps) {
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
                {(children[i] || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground/40 text-center py-3">Colonna {i + 1}</p>
                ) : (
                  children[i].map((child) => (
                    <div key={child.id} className="mb-1">
                      <BuilderBlock
                        block={child}
                        isSelected={false}
                        onSelect={() => {}}
                        onDuplicate={() => {}}
                        onDelete={() => {}}
                        onMoveUp={() => {}}
                        onMoveDown={() => {}}
                        isFirst
                        isLast
                      />
                    </div>
                  ))
                )}
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
