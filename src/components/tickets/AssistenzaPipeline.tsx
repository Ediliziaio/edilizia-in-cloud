/**
 * Pipeline dell'assistenza: le lavorazioni aperte in colonne, con il
 * trascinamento da una fase all'altra come nelle Commesse.
 *
 * Perché le colonne sono le FASI e non gli stati: gli stati sono quindici, e
 * quindici colonne non stanno su nessuno schermo. Le quattro fasi (da valutare,
 * in attesa, in corso, chiusura) sono il livello a cui si ragiona davvero.
 * Trascinando una card in una colonna, l'assistenza prende lo stato d'ingresso
 * di quella fase — quello che si sceglierebbe comunque nove volte su dieci — e
 * lo stato preciso resta scritto sulla card e modificabile dal dettaglio.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, TouchSensor, useSensor, useSensors, closestCorners,
  useDroppable, useDraggable,
} from "@dnd-kit/core";
import { AlertCircle, Euro, Package, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { TICKET_FASI, TICKET_STATI, type TicketFase } from "@/types/tickets";
import { calcolaFermo, CLASSI_FERMO } from "@/lib/assistenzaSla";

/** Stato in cui finisce un'assistenza trascinata in una fase. */
const STATO_INGRESSO: Record<TicketFase, string> = {
  apertura: "aperto",
  attesa: "in_attesa",
  lavoro: "in_lavorazione",
  chiusura: "risolto",
};

const TONO_BADGE: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700", amber: "bg-amber-100 text-amber-700",
  purple: "bg-purple-100 text-purple-700", indigo: "bg-indigo-100 text-indigo-700",
  orange: "bg-orange-100 text-orange-700", green: "bg-green-100 text-green-700",
  slate: "bg-slate-100 text-slate-700",
};

export interface TicketPipeline {
  id: string;
  subject: string;
  status: string;
  priority?: string | null;
  tipo?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_message_at?: string | null;
  a_pagamento?: boolean | null;
  pagato?: boolean | null;
  importo_finale?: number | null;
  importo_preventivato?: number | null;
  merce_richiesta?: boolean | null;
  customer?: { first_name?: string | null; last_name?: string | null } | null;
}

function faseDi(status: string): TicketFase | null {
  return TICKET_STATI.find((s) => s.value === status)?.fase ?? null;
}

function Contenuto({ t }: { t: TicketPipeline }) {
  const stato = TICKET_STATI.find((s) => s.value === t.status);
  const fermo = calcolaFermo(t as never);
  const importo = Number(t.importo_finale ?? t.importo_preventivato ?? 0);
  const cliente = [t.customer?.first_name, t.customer?.last_name].filter(Boolean).join(" ");

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold leading-snug line-clamp-2">{t.subject}</p>
        {fermo?.livello === "critico" && <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />}
      </div>
      {cliente && <p className="mt-0.5 truncate text-xs text-muted-foreground">{cliente}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge className={cn("text-[10px]", TONO_BADGE[stato?.tone ?? "slate"])}>
          {stato?.label ?? t.status}
        </Badge>
        {t.merce_richiesta && (
          <span className="inline-flex items-center gap-1 text-[10px] text-purple-700">
            <Package className="h-3 w-3" /> merce
          </span>
        )}
        {t.a_pagamento && !t.pagato && importo > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700">
            <Euro className="h-3 w-3" />
            {importo.toLocaleString("it-IT", { maximumFractionDigits: 0 })}
          </span>
        )}
      </div>
      {fermo && <p className={cn("mt-1.5 text-[10px]", CLASSI_FERMO[fermo.livello])}>{fermo.etichetta}</p>}
    </>
  );
}

function CardTrascinabile({ t, trascinabile }: { t: TicketPipeline; trascinabile: boolean }) {
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: t.id,
    // Senza un gestore che salvi il nuovo stato la card si trascinerebbe a
    // vuoto e sembrerebbe rotta: meglio non farla trascinare affatto.
    disabled: !trascinabile,
  });

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        "flex touch-none overflow-hidden rounded-xl border border-border bg-background",
        isDragging && "opacity-40",
      )}
    >
      {/* Maniglia a striscia, sempre visibile: come nelle Commesse. Nascosta
          dietro un hover nessuno la troverebbe. */}
      {trascinabile && (
      <div
        {...attributes}
        {...listeners}
        className="flex shrink-0 cursor-grab items-center bg-muted/40 px-1 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-muted-foreground active:cursor-grabbing"
        aria-label="Trascina per cambiare fase"
      >
        <GripVertical className="h-4 w-4" />
      </div>
      )}

      <div
        className="min-w-0 flex-1 cursor-pointer p-3"
        role="button"
        tabIndex={0}
        onClick={() => { if (!isDragging) navigate(`/azienda/assistenza/${t.id}`); }}
        onKeyDown={(e) => { if (e.key === "Enter") navigate(`/azienda/assistenza/${t.id}`); }}
      >
        <Contenuto t={t} />
      </div>
    </div>
  );
}

function Colonna({
  fase, tickets, trascinabile,
}: { fase: (typeof TICKET_FASI)[number]; tickets: TicketPipeline[]; trascinabile: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `fase:${fase.key}` });
  const inRitardo = tickets.filter((t) => {
    const f = calcolaFermo(t as never);
    return f !== null && f.livello !== "ok";
  }).length;
  const soldi = tickets
    .filter((t) => t.a_pagamento && !t.pagato)
    .reduce((s, t) => s + Number(t.importo_finale ?? t.importo_preventivato ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[220px] flex-col rounded-xl border bg-muted/30 p-2 transition-colors",
        isOver ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      <div className="mb-2 px-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{fase.label}</span>
          <Badge variant="secondary" className="text-xs">{tickets.length}</Badge>
        </div>
        <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
          {inRitardo > 0 && <span className="text-red-600">{inRitardo} in ritardo</span>}
          {soldi > 0 && (
            <span>
              {soldi.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })} da incassare
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 space-y-2">
        {tickets.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Niente qui</p>
        ) : (
          tickets.map((t) => <CardTrascinabile key={t.id} t={t} trascinabile={trascinabile} />)
        )}
      </div>
    </div>
  );
}

export function AssistenzaPipeline({
  tickets, onStatusChange,
}: {
  tickets: TicketPipeline[];
  onStatusChange?: (ticketId: string, nuovoStato: string) => void | Promise<void>;
}) {
  const [attivo, setAttivo] = useState<TicketPipeline | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const perFase = useMemo(() => {
    const g: Record<string, TicketPipeline[]> = {};
    TICKET_FASI.forEach((f) => { g[f.key] = []; });
    tickets.forEach((t) => {
      const f = faseDi(t.status);
      if (f && g[f]) g[f].push(t);
    });
    // In cima quelle ferme da più tempo: sono quelle che chiedono una mossa.
    Object.values(g).forEach((lista) =>
      lista.sort((a, b) => (calcolaFermo(b as never)?.giorni ?? 0) - (calcolaFermo(a as never)?.giorni ?? 0)),
    );
    return g;
  }, [tickets]);

  const onDragStart = (e: DragStartEvent) =>
    setAttivo(tickets.find((t) => t.id === e.active.id) ?? null);

  const onDragEnd = async (e: DragEndEvent) => {
    setAttivo(null);
    const { active, over } = e;
    if (!over) return;
    const t = tickets.find((x) => x.id === active.id);
    if (!t) return;

    // Il drop può cadere sulla colonna o su un'altra card: in entrambi i casi
    // conta la fase di destinazione.
    let faseDest: TicketFase | null = null;
    const overId = String(over.id);
    if (overId.startsWith("fase:")) faseDest = overId.slice(5) as TicketFase;
    else {
      const sopra = tickets.find((x) => x.id === over.id);
      if (sopra) faseDest = faseDi(sopra.status);
    }
    if (!faseDest || faseDest === faseDi(t.status)) return;
    await onStatusChange?.(t.id, STATO_INGRESSO[faseDest]);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setAttivo(null)}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {TICKET_FASI.map((fase) => (
          <Colonna key={fase.key} fase={fase} tickets={perFase[fase.key] ?? []} trascinabile={!!onStatusChange} />
        ))}
      </div>
      <DragOverlay>
        {attivo && (
          <div className="w-[260px] rotate-2 rounded-xl border border-primary bg-background p-3 shadow-lg">
            <Contenuto t={attivo} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
