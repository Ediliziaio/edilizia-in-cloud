import { useRef, useState, useMemo, useLayoutEffect } from "react";
import type { OrgTreeNode } from "@/types/hr";
import { OrgNode } from "@/components/hr/OrgNode";
import { Button } from "@/components/ui/button";
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  fitOrgView,
  layoutOrgTree,
  ORG_CARD_WIDTH,
  ORG_CARD_HEIGHT,
} from "@/lib/personale/organizzazione";

interface Props {
  tree: OrgTreeNode[];
  onNodeClick: (node: OrgTreeNode) => void;
  siteNames?: Map<string, string>;
}

export function OrgTreeView({ tree, onNodeClick, siteNames }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [viewport, setViewport] = useState({ width: 900, height: 560 });
  const drag = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  const layout = useMemo(
    () => layoutOrgTree(tree, collapsed),
    [tree, collapsed],
  );
  const automatic = fitOrgView(layout, viewport);
  const [override, setOverride] = useState<{
    layout: typeof layout;
    viewport: typeof viewport;
    value: typeof automatic;
  } | null>(null);
  const view =
    override?.layout === layout && override.viewport === viewport
      ? override.value
      : automatic;
  const setView = (update: (old: typeof view) => typeof view) =>
    setOverride({ layout, viewport, value: update(view) });
  const fit = () => setOverride(null);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () =>
      setViewport({
        width: el.clientWidth || 900,
        height: el.clientHeight || 560,
      });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function zoom(delta: number) {
    setView((old) => {
      const scale = Math.min(
        1.6,
        Math.max(
          Math.min(0.08, automatic.scale),
          old.scale * (delta > 0 ? 1.25 : 0.8),
        ),
      );
      const ratio = scale / old.scale;
      return {
        scale,
        x: viewport.width / 2 - (viewport.width / 2 - old.x) * ratio,
        y: viewport.height / 2 - (viewport.height / 2 - old.y) * ratio,
      };
    });
  }
  if (!tree.length) return null;
  return (
    <section
      aria-label="Albero organizzativo"
      className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-white px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Struttura organizzativa</h3>
          <p className="text-xs text-muted-foreground">
            Dall’alto verso il basso · apri un profilo per i dettagli
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(new Set())}
          >
            Espandi tutto
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Riduci organigramma"
            onClick={() => zoom(-0.15)}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <output
            aria-label="Zoom organigramma"
            className="w-12 text-center text-xs tabular-nums"
          >
            {Math.round(view.scale * 100)}%
          </output>
          <Button
            variant="outline"
            size="icon"
            aria-label="Ingrandisci organigramma"
            onClick={() => zoom(0.15)}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={fit}>
            <Maximize className="mr-1.5 h-4 w-4" />
            Adatta alla vista
          </Button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="relative h-[min(62vh,640px)] min-h-[440px] overflow-hidden cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          drag.current = {
            x: view.x,
            y: view.y,
            startX: e.clientX,
            startY: e.clientY,
          };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current) {
            const d = drag.current;
            setView((old) => ({
              ...old,
              x: d.x + e.clientX - d.startX,
              y: d.y + e.clientY - d.startY,
            }));
          }
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate(${view.x}px,${view.y}px) scale(${view.scale})`,
          }}
        >
          <svg
            width={layout.width}
            height={layout.height}
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
          >
            {layout.edges.map((edge) => (
              <path
                key={edge.id}
                d={edge.path}
                fill="none"
                stroke="#94a3b8"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            ))}
          </svg>
          {layout.nodes.map(({ node, x, y }) => (
            <div
              key={node.id}
              className="absolute"
              style={{
                left: x,
                top: y,
                width: ORG_CARD_WIDTH,
                height: ORG_CARD_HEIGHT,
              }}
            >
              <OrgNode
                node={node}
                isRoot={node.depth === 0}
                onClick={onNodeClick}
                siteName={
                  node.sede_id ? siteNames?.get(node.sede_id) : undefined
                }
              />
              {node.children.length > 0 && (
                <button
                  type="button"
                  aria-label={`${collapsed.has(node.id) ? "Espandi" : "Comprimi"} collaboratori di ${node.nome} ${node.cognome}`}
                  aria-expanded={!collapsed.has(node.id)}
                  className="absolute -bottom-3 left-1/2 z-10 flex h-6 -translate-x-1/2 items-center gap-1 rounded-full border border-blue-200 bg-white px-2 text-[11px] text-blue-700 shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500"
                  onClick={() =>
                    setCollapsed((old) => {
                      const next = new Set(old);
                      if (next.has(node.id)) next.delete(node.id);
                      else next.add(node.id);
                      return next;
                    })
                  }
                >
                  {node.children.length}
                  {collapsed.has(node.id) ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronUp className="h-3 w-3" />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="border-t bg-white px-4 py-2 text-xs text-muted-foreground">
        Trascina lo sfondo per spostarti. Usa + e − per lo zoom; la rotellina
        continua a scorrere la pagina.
      </p>
    </section>
  );
}
