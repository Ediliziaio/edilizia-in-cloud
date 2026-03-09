import { useState, useRef, useCallback, useMemo } from "react";
import type { InternalAutomationNode, InternalAutomationConnection } from "@/types/internalAutomationBuilder";
import { findTriggerLabel, findActionLabel, INTERNAL_NODE_TYPE_LABELS } from "@/types/internalAutomationBuilder";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, ZoomIn, ZoomOut, Maximize2, Trash2, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  nodes: InternalAutomationNode[];
  connections: InternalAutomationConnection[];
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onDeleteNode: (id: string) => void;
  onDuplicateNode: (id: string) => void;
  onAddAfterNode: (id: string, branch?: string) => void;
  onUpdateNode: (id: string, updates: Partial<InternalAutomationNode>) => void;
  onOpenTriggerPicker: () => void;
  onOpenActionPicker: () => void;
}

const NODE_W = 220;
const NODE_H = 72;

function getNodeLabel(node: InternalAutomationNode): string {
  const config = node.config_json || {};
  if (node.label) return node.label;
  if (node.node_type === "trigger") return findTriggerLabel(config.trigger_type || "");
  if (node.node_type === "action") return findActionLabel(config.action_type || "");
  if (node.node_type === "condition") return "Condizione";
  if (node.node_type === "delay") {
    const d = Number(config.delay_days || 0);
    const h = Number(config.delay_hours || 0);
    const m = Number(config.delay_minutes || 0);
    const parts = [];
    if (d) parts.push(`${d}g`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    return parts.length ? `Attendi ${parts.join(" ")}` : "Attesa";
  }
  return INTERNAL_NODE_TYPE_LABELS[node.node_type] || node.node_type;
}

const NODE_COLORS: Record<string, string> = {
  trigger: "border-emerald-500 bg-emerald-500/5",
  action: "border-blue-500 bg-blue-500/5",
  condition: "border-amber-500 bg-amber-500/5",
  delay: "border-violet-500 bg-violet-500/5",
};

const NODE_DOT_COLORS: Record<string, string> = {
  trigger: "bg-emerald-500",
  action: "bg-blue-500",
  condition: "bg-amber-500",
  delay: "bg-violet-500",
};

export function InternalAutomationCanvas({
  nodes, connections, selectedNodeId,
  onSelectNode, onDeleteNode, onDuplicateNode, onAddAfterNode, onUpdateNode,
  onOpenTriggerPicker, onOpenActionPicker,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const dragStart = useRef({ x: 0, y: 0, nodeX: 0, nodeY: 0 });
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);

  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).dataset.canvas) {
      onSelectNode(null);
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: panRef.current.x, panY: panRef.current.y };
    }
  }, [onSelectNode]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: panStart.current.panX + (e.clientX - panStart.current.x),
        y: panStart.current.panY + (e.clientY - panStart.current.y),
      });
    }
    if (dragNodeId) {
      const dx = (e.clientX - dragStart.current.x) / zoomRef.current;
      const dy = (e.clientY - dragStart.current.y) / zoomRef.current;
      setDragOffset({ x: dx, y: dy });
    }
  }, [isPanning, dragNodeId]);

  const handleMouseUp = useCallback(() => {
    if (dragNodeId && dragOffset) {
      onUpdateNode(dragNodeId, {
        position_x: dragStart.current.nodeX + dragOffset.x,
        position_y: dragStart.current.nodeY + dragOffset.y,
      });
    }
    setIsPanning(false);
    setDragNodeId(null);
    setDragOffset(null);
  }, [dragNodeId, dragOffset, onUpdateNode]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setZoom((z) => Math.min(2, Math.max(0.3, z + delta)));
  }, []);

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, node: InternalAutomationNode) => {
    e.stopPropagation();
    onSelectNode(node.id);
    setDragNodeId(node.id);
    dragStart.current = { x: e.clientX, y: e.clientY, nodeX: node.position_x, nodeY: node.position_y };
  }, [onSelectNode]);

  const resetView = useCallback(() => { setPan({ x: 0, y: 0 }); setZoom(1); }, []);

  const hasTrigger = nodes.some((n) => n.node_type === "trigger");

  // SVG connections
  const svgLines = useMemo(() => {
    return connections.map((conn) => {
      const fromNode = nodes.find((n) => n.id === conn.from_node_id);
      const toNode = nodes.find((n) => n.id === conn.to_node_id);
      if (!fromNode || !toNode) return null;

      let fx = fromNode.position_x;
      let fy = fromNode.position_y;
      let tx = toNode.position_x;
      let ty = toNode.position_y;

      if (dragNodeId === fromNode.id && dragOffset) { fx += dragOffset.x; fy += dragOffset.y; }
      if (dragNodeId === toNode.id && dragOffset) { tx += dragOffset.x; ty += dragOffset.y; }

      const x1 = fx + NODE_W / 2;
      const y1 = fy + NODE_H;
      const x2 = tx + NODE_W / 2;
      const y2 = ty;
      const cy1 = y1 + Math.abs(y2 - y1) * 0.4;
      const cy2 = y2 - Math.abs(y2 - y1) * 0.4;

      return (
        <g key={conn.id}>
          <path
            d={`M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={2}
            strokeDasharray={conn.label ? "6 3" : undefined}
          />
          {conn.label && (
            <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {conn.label === "true" ? "Sì" : conn.label === "false" ? "No" : conn.label}
            </text>
          )}
        </g>
      );
    });
  }, [connections, nodes, dragNodeId, dragOffset]);

  return (
    <div
      ref={canvasRef}
      data-canvas="true"
      className="relative flex-1 overflow-hidden bg-muted/30 cursor-grab active:cursor-grabbing select-none"
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Toolbar */}
      <div className="absolute top-3 right-3 z-10 flex gap-1">
        <Tooltip><TooltipTrigger asChild>
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
        </TooltipTrigger><TooltipContent>Zoom +</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild>
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
        </TooltipTrigger><TooltipContent>Zoom -</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild>
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={resetView}>
            <Maximize2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger><TooltipContent>Reset vista</TooltipContent></Tooltip>
      </div>

      {/* Canvas content */}
      <div
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
        className="absolute inset-0"
        data-canvas="true"
      >
        {/* SVG connections */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: "visible" }}>
          {svgLines}
        </svg>

        {/* Nodes */}
        {nodes.map((node) => {
          let x = node.position_x;
          let y = node.position_y;
          if (dragNodeId === node.id && dragOffset) { x += dragOffset.x; y += dragOffset.y; }

          return (
            <div
              key={node.id}
              onMouseDown={(e) => handleNodeMouseDown(e, node)}
              style={{ left: x, top: y, width: NODE_W }}
              className={cn(
                "absolute rounded-lg border-2 p-3 shadow-sm transition-shadow cursor-pointer",
                NODE_COLORS[node.node_type] || "border-border bg-background",
                selectedNodeId === node.id && "ring-2 ring-primary shadow-md"
              )}
            >
              <div className="flex items-center gap-2">
                <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", NODE_DOT_COLORS[node.node_type])} />
                <span className="text-xs font-semibold truncate">{getNodeLabel(node)}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 truncate">
                {INTERNAL_NODE_TYPE_LABELS[node.node_type]}
              </p>

              {/* Node actions */}
              {selectedNodeId === node.id && (
                <div className="absolute -top-8 right-0 flex gap-1">
                  {node.node_type !== "trigger" && (
                    <Button size="icon" variant="outline" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onDeleteNode(node.id); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                  <Button size="icon" variant="outline" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onDuplicateNode(node.id); }}>
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="outline" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onAddAfterNode(node.id); }}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}

        {/* Empty state */}
        {nodes.length === 0 && (
          <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 text-center" data-canvas="true">
            <p className="text-sm text-muted-foreground mb-3">Inizia aggiungendo un trigger</p>
            <Button onClick={onOpenTriggerPicker} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-1" /> Aggiungi Trigger
            </Button>
          </div>
        )}

        {/* Add node button when trigger exists */}
        {hasTrigger && (
          <div className="absolute left-1/2 -translate-x-1/2" style={{ top: Math.max(...nodes.map((n) => n.position_y + NODE_H + 40), 200) }} data-canvas="true">
            <Button onClick={onOpenActionPicker} variant="outline" size="sm" className="shadow-sm">
              <Plus className="h-4 w-4 mr-1" /> Aggiungi Nodo
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
