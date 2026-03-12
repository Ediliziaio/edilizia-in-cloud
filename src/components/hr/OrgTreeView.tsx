import { useRef, useState, useCallback, useEffect } from "react";
import type { OrgTreeNode, HrProfilo } from "@/types/hr";
import { OrgNode } from "@/components/hr/OrgNode";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize } from "lucide-react";

interface Props {
  tree: OrgTreeNode[];
  onNodeClick: (node: OrgTreeNode) => void;
}

function TreeBranch({
  node,
  onNodeClick,
  isRoot,
}: {
  node: OrgTreeNode;
  onNodeClick: (n: OrgTreeNode) => void;
  isRoot?: boolean;
}) {
  return (
    <li className="flex flex-col items-center relative">
      <OrgNode node={node} isRoot={isRoot} onClick={onNodeClick} />
      {node.children.length > 0 && (
        <>
          {/* Vertical connector down from parent */}
          <div className="w-px h-6 bg-border" />
          <ul className="flex gap-2 relative pt-0">
            {/* Horizontal connector line */}
            {node.children.length > 1 && (
              <div
                className="absolute top-0 h-px bg-border"
                style={{
                  left: `calc(${100 / (2 * node.children.length)}%)`,
                  right: `calc(${100 / (2 * node.children.length)}%)`,
                }}
              />
            )}
            {node.children.map((child) => (
              <li key={child.id} className="flex flex-col items-center relative">
                {/* Vertical connector up to horizontal line */}
                <div className="w-px h-6 bg-border" />
                <TreeBranch node={child} onNodeClick={onNodeClick} />
              </li>
            ))}
          </ul>
        </>
      )}
    </li>
  );
}

export function OrgTreeView({ tree, onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.15, 2));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.15, 0.3));
  const handleReset = () => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setScale((s) => Math.min(Math.max(s + delta, 0.3), 2));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - translate.x, y: e.clientY - translate.y });
  }, [translate]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setTranslate({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  if (tree.length === 0) return null;

  return (
    <div className="relative rounded-xl bg-muted/30 border overflow-hidden" style={{ minHeight: 500 }}>
      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleZoomIn}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleZoomOut}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleReset}>
          <Maximize className="h-4 w-4" />
        </Button>
      </div>

      <div className="absolute top-3 left-3 z-10 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
        {Math.round(scale * 100)}%
      </div>

      {/* Pannable/Zoomable area */}
      <div
        ref={containerRef}
        className="w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
        style={{ minHeight: 500 }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="inline-flex justify-center w-full pt-8 pb-8 transition-transform"
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: "top center",
            transition: isDragging ? "none" : "transform 0.15s ease",
          }}
        >
          <ul className="flex gap-4">
            {tree.map((root) => (
              <TreeBranch key={root.id} node={root} onNodeClick={onNodeClick} isRoot />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
