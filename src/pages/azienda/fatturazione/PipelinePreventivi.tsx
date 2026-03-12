import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { useDocumentiFiscali, useUpdateDocumento } from "@/hooks/useDocumentiFiscali";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import type { DocumentoFiscale, StatoDocumento } from "@/types/fatturazione";

const COLUMNS: { id: StatoDocumento; label: string; color: string }[] = [
  { id: "bozza", label: "Bozza", color: "bg-muted" },
  { id: "emessa", label: "Inviato", color: "bg-sky-100 dark:bg-sky-900" },
  { id: "parzialmente_pagata", label: "In trattativa", color: "bg-amber-100 dark:bg-amber-900" },
  { id: "accettata", label: "Accettato", color: "bg-emerald-100 dark:bg-emerald-900" },
  { id: "annullata", label: "Perso", color: "bg-destructive/10" },
];

function DroppableColumn({
  col,
  children,
  count,
}: {
  col: (typeof COLUMNS)[number];
  children: React.ReactNode;
  count: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg p-3 ${col.color} transition-colors ${isOver ? "ring-2 ring-primary/50" : ""}`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">{col.label}</h3>
        <Badge variant="outline" className="text-xs">{count}</Badge>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DraggableCard({ doc, onClick }: { doc: DocumentoFiscale; onClick: () => void }) {
  return (
    <Card
      className="cursor-grab active:cursor-grabbing"
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-1">
        <div className="flex items-center gap-1">
          <GripVertical className="h-3 w-3 text-muted-foreground" />
          <span className="text-sm font-medium truncate">{doc.cliente_snapshot?.ragione_sociale || "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{doc.numero}</span>
          <span className="text-sm font-semibold">€ {doc.totale_documento.toFixed(2)}</span>
        </div>
        <div className="text-xs text-muted-foreground">{doc.data_emissione}</div>
      </CardContent>
    </Card>
  );
}

export default function PipelinePreventivi() {
  const navigate = useNavigate();
  const { data, isLoading } = useDocumentiFiscali({ tipo: "preventivo", perPage: 200 });
  const updateMutation = useUpdateDocumento();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const docs = data?.documenti ?? [];

  const grouped = useMemo(() => {
    const map: Record<string, DocumentoFiscale[]> = {};
    COLUMNS.forEach((c) => (map[c.id] = []));
    docs.forEach((d) => {
      const col = COLUMNS.find((c) => c.id === d.stato);
      if (col) map[col.id].push(d);
      else map["bozza"]?.push(d);
    });
    return map;
  }, [docs]);

  const activeDoc = activeId ? docs.find((d) => d.id === activeId) : null;

  // KPIs
  const totalValue = docs.reduce((s, d) => s + d.totale_documento, 0);
  const accepted = docs.filter((d) => d.stato === "accettata");
  const lost = docs.filter((d) => d.stato === "annullata");
  const winRate = accepted.length + lost.length > 0
    ? Math.round((accepted.length / (accepted.length + lost.length)) * 100) : 0;
  const avgValue = docs.length > 0 ? totalValue / docs.length : 0;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const targetStato = over.id as StatoDocumento;
    const docId = active.id as string;
    const doc = docs.find((d) => d.id === docId);
    if (!doc || doc.stato === targetStato) return;

    updateMutation.mutate({ id: docId, stato: targetStato }, {
      onSuccess: () => toast.success("Stato aggiornato"),
    });
  }, [docs, updateMutation]);

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline Preventivi</h1>
          <p className="text-muted-foreground">Gestisci lo stato dei tuoi preventivi.</p>
        </div>
        <Button onClick={() => navigate("/azienda/documenti/nuovo?tipo=preventivo")}>
          <Plus className="h-4 w-4 mr-1" /> Nuovo preventivo
        </Button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Win rate</p><p className="text-lg font-semibold">{winRate}%</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Valore pipeline</p><p className="text-lg font-semibold">€ {totalValue.toFixed(2)}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Valore medio</p><p className="text-lg font-semibold">€ {avgValue.toFixed(2)}</p></CardContent></Card>
      </div>

      {/* Kanban with @dnd-kit */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-5 gap-4 min-h-[400px]">
          {COLUMNS.map((col) => (
            <DroppableColumn key={col.id} col={col} count={grouped[col.id]?.length ?? 0}>
              {(grouped[col.id] ?? []).map((doc) => (
                <div
                  key={doc.id}
                  data-dnd-id={doc.id}
                >
                  <DraggableCardWrapper doc={doc} navigate={navigate} />
                </div>
              ))}
            </DroppableColumn>
          ))}
        </div>

        <DragOverlay>
          {activeDoc ? (
            <Card className="shadow-lg rotate-2 opacity-90">
              <CardContent className="p-3 space-y-1">
                <div className="flex items-center gap-1">
                  <GripVertical className="h-3 w-3 text-muted-foreground" />
                  <span className="text-sm font-medium truncate">{activeDoc.cliente_snapshot?.ragione_sociale || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{activeDoc.numero}</span>
                  <span className="text-sm font-semibold">€ {activeDoc.totale_documento.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function DraggableCardWrapper({ doc, navigate }: { doc: DocumentoFiscale; navigate: ReturnType<typeof useNavigate> }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable(doc.id);
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={isDragging ? "opacity-30" : ""}>
      <DraggableCard doc={doc} onClick={() => navigate(`/azienda/documenti/${doc.id}/dettaglio`)} />
    </div>
  );
}

function useDraggable(id: string) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = require("@dnd-kit/core").useDraggable({ id });
  return { attributes, listeners, setNodeRef, transform, isDragging };
}
