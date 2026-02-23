import { useState, useRef, useCallback } from "react";
import type { AutomationNode, AutomationConnection } from "@/types/automationBuilder";
import { AutomationNodeComponent } from "./AutomationNode";
import { AutomationConnectionLine } from "./AutomationConnectionLine";
import { Plus } from "lucide-react";

interface Props {
  nodes: AutomationNode[];
  connections: AutomationConnection[];
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onDeleteNode: (id: string) => void;
  onDuplicateNode: (id: string) => void;
  onAddAfterNode: (id: string) => void;
  onUpdateNode: (id: string, updates: Partial<AutomationNode>) => void;
  onOpenTriggerPicker: () => void;
}

export function AutomationCanvas({
  nodes, connections, selectedNodeId,
  onSelectNode, onDeleteNode, onDuplicateNode, onAddAfterNode, onUpdateNode,
  onOpenTriggerPicker,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const dragStart = useRef({ x: 0, y: 0, nodeX: 0, nodeY: 0 });

  // Pan handlers
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).dataset.canvas) {
      onSelectNode(null);
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  }, [pan, onSelectNode]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: panStart.current.panX + (e.clientX - panStart.current.x),
        y: panStart.current.panY + (e.clientY - panStart.current.y),
      });
    }
    if (dragNodeId) {
      const dx = (e.clientX - dragStart.current.x) / zoom;
      const dy = (e.clientY - dragStart.current.y) / zoom;
      onUpdateNode(dragNodeId, {
        position_x: dragStart.current.nodeX + dx,
        position_y: dragStart.current.nodeY + dy,
      });
    }
  }, [isPanning, dragNodeId, zoom, onUpdateNode]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setDragNodeId(null);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setZoom(prev => Math.max(0.3, Math.min(2, prev + delta)));
  }, []);

  const handleNodeDragStart = useCallback((id: string, e: React.MouseEvent) => {
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    setDragNodeId(id);
    dragStart.current = { x: e.clientX, y: e.clientY, nodeX: node.position_x, nodeY: node.position_y };
  }, [nodes]);

  const hasTrigger = nodes.some(n => n.node_type === "trigger");

  return (
    <div
      ref={canvasRef}
      className="flex-1 overflow-hidden relative cursor-grab active:cursor-grabbing"
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      data-canvas="true"
      style={{ background: "radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)", backgroundSize: `${20 * zoom}px ${20 * zoom}px` }}
    >
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
        }}
      >
        {/* SVG connections */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: "visible" }}>
          {connections.map(conn => (
            <AutomationConnectionLine key={conn.id} connection={conn} nodes={nodes} />
          ))}
        </svg>

        {/* Nodes */}
        {nodes.map(node => (
          <AutomationNodeComponent
            key={node.id}
            node={node}
            isSelected={selectedNodeId === node.id}
            onSelect={onSelectNode}
            onDelete={onDeleteNode}
            onDuplicate={onDuplicateNode}
            onAddAfter={onAddAfterNode}
            onDragStart={handleNodeDragStart}
          />
        ))}

        {/* Empty state */}
        {!hasTrigger && (
          <div className="absolute" style={{ left: 300, top: 200 }}>
            <button
              onClick={onOpenTriggerPicker}
              className="flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-accent/50 transition-all cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Plus className="h-6 w-6 text-primary" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Aggiungi il primo trigger</span>
            </button>
          </div>
        )}
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-3 right-3 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded border">
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}
