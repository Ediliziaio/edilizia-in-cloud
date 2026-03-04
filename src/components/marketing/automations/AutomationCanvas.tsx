import { useState, useRef, useCallback } from "react";
import type { AutomationNode, AutomationConnection } from "@/types/automationBuilder";
import { AutomationNodeComponent } from "./AutomationNode";
import { AutomationConnectionLine } from "./AutomationConnectionLine";
import { Plus, MousePointer2, Maximize2, ZoomIn, ZoomOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
  onOpenActionPicker: () => void;
}

export function AutomationCanvas({
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

  // Refs to avoid callback recreation during drag/pan
  const panRef = useRef(pan);
  panRef.current = pan;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
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
  }, [isPanning, dragNodeId, onUpdateNode]);

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
    setZoom(prev => Math.max(0.3, Math.min(2, prev + delta)));
  }, []);

  const handleNodeDragStart = useCallback((id: string, e: React.MouseEvent) => {
    const node = nodesRef.current.find(n => n.id === id);
    if (!node) return;
    setDragNodeId(id);
    dragStart.current = { x: e.clientX, y: e.clientY, nodeX: node.position_x, nodeY: node.position_y };
  }, []);

  const fitToScreen = useCallback(() => {
    if (nodes.length === 0 || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const padding = 80;
    const minX = Math.min(...nodes.map(n => n.position_x));
    const minY = Math.min(...nodes.map(n => n.position_y));
    const maxX = Math.max(...nodes.map(n => n.position_x + 224));
    const maxY = Math.max(...nodes.map(n => n.position_y + 80));
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const scaleX = (rect.width - padding * 2) / contentW;
    const scaleY = (rect.height - padding * 2) / contentH;
    const newZoom = Math.max(0.3, Math.min(1.5, Math.min(scaleX, scaleY)));
    const centerX = (rect.width - contentW * newZoom) / 2 - minX * newZoom;
    const centerY = (rect.height - contentH * newZoom) / 2 - minY * newZoom;
    setZoom(newZoom);
    setPan({ x: centerX, y: centerY });
  }, [nodes]);

  const hasTrigger = nodes.some(n => n.node_type === "trigger");

  return (
    <div className="flex-1 overflow-hidden relative flex flex-col">
      {/* Canvas area */}
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
          data-canvas="true"
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
          <svg data-canvas="true" className="absolute inset-0 w-full h-full" style={{ overflow: "visible" }}>
            {connections.map(conn => {
              const displayNodes = (dragNodeId && dragOffset)
                ? nodes.map(n => n.id === dragNodeId
                    ? { ...n, position_x: dragStart.current.nodeX + dragOffset.x, position_y: dragStart.current.nodeY + dragOffset.y }
                    : n)
                : nodes;
              return <AutomationConnectionLine key={conn.id} connection={conn} nodes={displayNodes} />;
            })}
          </svg>

          {/* Nodes */}
          {nodes.map(node => {
            const isDragging = dragNodeId === node.id && dragOffset;
            const displayNode = isDragging
              ? { ...node, position_x: dragStart.current.nodeX + dragOffset.x, position_y: dragStart.current.nodeY + dragOffset.y }
              : node;
            return (
              <AutomationNodeComponent
                key={node.id}
                node={displayNode}
                isSelected={selectedNodeId === node.id}
                onSelect={onSelectNode}
                onDelete={onDeleteNode}
                onDuplicate={onDuplicateNode}
                onAddAfter={onAddAfterNode}
                onDragStart={handleNodeDragStart}
              />
            );
          })}

          {/* Empty state - centered */}
          {!hasTrigger && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <button
                onClick={onOpenTriggerPicker}
                className="pointer-events-auto flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-accent/50 transition-all cursor-pointer"
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Plus className="h-6 w-6 text-primary" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">Aggiungi il primo trigger</span>
              </button>
            </div>
          )}
        </div>

        {/* + Aggiungi button top-right */}
        <div className="absolute top-3 right-3 z-10">
          <Button size="sm" variant="default" onClick={hasTrigger ? onOpenActionPicker : onOpenTriggerPicker}>
            <Plus className="h-4 w-4 mr-1" /> Aggiungi
          </Button>
        </div>
      </div>

      {/* Bottom toolbar */}
      <div className="h-10 border-t bg-background flex items-center justify-center gap-1 px-3 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MousePointer2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Seleziona</TooltipContent>
        </Tooltip>
        <div className="w-px h-5 bg-border mx-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fitToScreen}>
              <Maximize2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Adatta allo schermo</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.max(0.3, z - 0.1))}>
              <ZoomOut className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom out</TooltipContent>
        </Tooltip>
        <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.min(2, z + 0.1))}>
              <ZoomIn className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom in</TooltipContent>
        </Tooltip>
        <div className="w-px h-5 bg-border mx-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Settings className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Impostazioni canvas</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
