import { useMemo, useState, useCallback, memo, useRef, useEffect } from "react";
import {
  DndContext, pointerWithin, rectIntersection, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverlay,
  type CollisionDetection,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { OpportunityCard } from "./OpportunityCard";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatCount } from "@/lib/formatters";
import { OpportunityDetailDialog } from "./OpportunityDetailDialog";
import { LossReasonDialog } from "./LossReasonDialog";
import {
  useUpdateOpportunityStage, useDeleteOpportunity, useStageOpportunities, usePipelines,
  type RiepilogoOpportunita,
} from "@/hooks/useOpportunitiesData";
import { toast } from "sonner";
import type { FiltriServerOpportunita } from "@/lib/marketingOpportunities";
import type { OpportunityStage } from "@/types/opportunities";
import { hashColor, inferOpportunityStatusFromStage } from "@/types/opportunities";
import { useCardFieldPreferences } from "@/hooks/useCardFieldPreferences";

/**
 * true dal primo momento in cui l'elemento entra nel riquadro visibile (e poi
 * resta true). Una colonna fuori schermo non chiede niente al database: con le
 * 23 fasi del «Nuovo» di BeMade, all'apertura se ne caricano cinque o sei.
 */
function useVistaAlmenoUnaVolta(elemento: HTMLElement | null, radice: HTMLElement | null) {
  // Senza IntersectionObserver (browser molto vecchi) si carica subito tutto.
  const [vista, setVista] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (vista || !elemento) return;
    const osservatore = new IntersectionObserver(
      (voci) => {
        if (voci.some((v) => v.isIntersecting)) setVista(true);
      },
      // Mezza colonna di anticipo: quando arriva sullo schermo sta già caricando.
      { root: radice, rootMargin: "0px 160px 0px 160px" },
    );
    osservatore.observe(elemento);
    return () => osservatore.disconnect();
  }, [elemento, radice, vista]);
  return vista;
}

/**
 * Striscia delle ALTRE pipeline, visibile solo mentre si trascina una scheda.
 *
 * Il kanban mostra una pipeline per volta, quindi «trascinare in un'altra
 * pipeline» non può essere una colonna in più: è una zona che compare sotto le
 * fasi quando la scheda è in volo. Si lascia lì e l'opportunità riparte dalla
 * prima fase della pipeline scelta (18/09/2026, richiesta di Il Bagno Group).
 */
function ZonaPipeline({ pipeline }: { pipeline: { id: string; name: string; marketing_pipeline_stages?: Array<{ id: string; name: string }> } }) {
  const { setNodeRef, isOver } = useDroppable({ id: `pipeline:${pipeline.id}`, data: { pipelineDestinazione: pipeline.id } });
  const prima = pipeline.marketing_pipeline_stages?.[0]?.name;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-w-[180px] flex-1 flex-col justify-center rounded-lg border-2 border-dashed px-3 py-2 transition-colors",
        isOver ? "border-primary bg-primary/10" : "border-muted-foreground/30 bg-background/80",
      )}
    >
      <span className="truncate text-xs font-semibold">{pipeline.name}</span>
      <span className="truncate text-[11px] text-muted-foreground">
        {prima ? `entra in «${prima}»` : "nessuna fase"}
      </span>
    </div>
  );
}

interface StageColumnProps {
  stage: OpportunityStage;
  pipelineId: string;
  filtri: FiltriServerOpportunita;
  sortField: string;
  sortDir: string;
  /** Quante opportunità ha la fase secondo il database (tutte, non solo le caricate). */
  conteggio: number | undefined;
  valoreFase: number | undefined;
  /** Id della fase già chiesti al database per «seleziona tutta la colonna». */
  idsFase?: string[];
  radiceScorrimento: HTMLElement | null;
  onCardClick: (opp: any, tab?: string) => void;
  onDelete: (id: string) => void;
  selectedIds: Set<string>;
  onSelect: (id: string, selected: boolean) => void;
  onSelectStage?: (stageId: string, selected: boolean) => void;
  canEdit?: boolean;
  onQuickAdd?: (stageId: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: (stageId: string) => void;
}

const StageColumn = memo(function StageColumn({
  stage, pipelineId, filtri, sortField, sortDir, conteggio, valoreFase, idsFase, radiceScorrimento,
  onCardClick, onDelete, selectedIds, onSelect, onSelectStage, canEdit = true, onQuickAdd,
  collapsed = false, onToggleCollapse,
}: StageColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, data: { stageId: stage.id } });
  const { layout } = useCardFieldPreferences();
  const [radice, setRadice] = useState<HTMLDivElement | null>(null);
  const vista = useVistaAlmenoUnaVolta(radice, radiceScorrimento);

  const {
    opportunita, isLoading, isError, refetch, hasNextPage, isFetchingNextPage, fetchNextPage,
  } = useStageOpportunities({
    pipelineId, stageId: stage.id, filtri, sortField, sortDir,
    // Compressa o fuori schermo: il numero c'è già (dal riepilogo), le schede no.
    enabled: vista && !collapsed,
  });

  // Durante uno spostamento una scheda può restare per un attimo nella cache
  // della colonna di partenza: si mostra solo dove sta davvero.
  const opportunities = useMemo(
    () => opportunita.filter((o: any) => o.stage_id === stage.id),
    [opportunita, stage.id],
  );

  const totale = conteggio ?? opportunities.length;
  const totalValue = valoreFase ?? opportunities.reduce((sum: number, o: any) => sum + Number(o.value || 0), 0);
  const avgValue = totale > 0 ? totalValue / totale : 0;

  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: opportunities.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (layout === "mini" ? 48 : 158),
    overscan: 5,
    gap: 8,
  });

  // Scorrendo verso il fondo arriva la pagina successiva, senza bottoni.
  const voci = virtualizer.getVirtualItems();
  const ultimaVisibile = voci.length > 0 ? voci[voci.length - 1].index : -1;
  useEffect(() => {
    if (ultimaVisibile < 0) return;
    if (ultimaVisibile >= opportunities.length - 5 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [ultimaVisibile, opportunities.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Selezione della colonna: se gli id sono già stati chiesti al database
  // valgono quelli (TUTTA la fase), altrimenti le schede caricate.
  const idsNoti = idsFase ?? opportunities.map((o: any) => o.id);
  const selectedInStage = idsNoti.reduce((n, id) => (selectedIds.has(id) ? n + 1 : n), 0);
  const allSelected = totale > 0 && selectedInStage >= totale;
  const someSelected = selectedInStage > 0 && !allSelected;

  // Colonna collassata: barra verticale sottile stile GHL. Resta droppabile:
  // trascinando una card sopra si sposta comunque in questa fase.
  if (collapsed) {
    return (
      <div
        ref={(node) => { setNodeRef(node); setRadice(node); }}
        onClick={() => onToggleCollapse?.(stage.id)}
        title={`Espandi "${stage.name}"`}
        className={cn(
          "flex flex-col items-center shrink-0 w-11 h-full rounded-lg border bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer",
          isOver && "bg-primary/10 border-primary border-dashed"
        )}
        style={{ borderTopWidth: 3, borderTopColor: hashColor(stage.name) }}
      >
        <button
          type="button"
          aria-label={`Espandi ${stage.name}`}
          className="mt-1.5 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-primary"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="mt-1 text-[10px] font-semibold tabular-nums bg-background rounded-full px-1.5 py-0.5 text-muted-foreground">
          {formatCount(totale)}
        </span>
        <span className="mt-2 text-xs font-bold text-foreground" style={{ writingMode: "vertical-rl" }}>
          {stage.name}
        </span>
      </div>
    );
  }

  // Colonne piu' strette (-10% circa): a parita' di larghezza schermo se ne
  // vedono di piu' senza dover scorrere in orizzontale.
  return (
    <div
      ref={setRadice}
      className={cn("flex flex-col shrink-0 h-full min-h-0", layout === "mini" ? "min-w-[184px] md:min-w-[200px] max-w-[216px] md:max-w-[234px]" : "min-w-[216px] md:min-w-[252px] max-w-[244px] md:max-w-[270px]")}
    >
      <div className="px-3 py-2.5 border-b bg-muted/60 rounded-t-lg shrink-0" style={{ borderTopWidth: 3, borderTopColor: hashColor(stage.name) }}>
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {canEdit && onSelectStage && totale > 0 && (
              // Select-all della fase (stile GHL): prende TUTTE le opportunità
              // della colonna, anche quelle non ancora caricate.
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={(v) => onSelectStage(stage.id, v === true)}
                aria-label={`Seleziona tutte le opportunità in ${stage.name}`}
                className="h-3.5 w-3.5 shrink-0"
              />
            )}
            <h3 className="text-sm font-bold text-foreground leading-snug truncate">{stage.name}</h3>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* Conteggio della fase, dal database: tutte le opportunità della
                colonna, anche quelle che non sono ancora state caricate. */}
            <span
              className="text-xs font-bold tabular-nums rounded-full px-2 py-0.5 text-white shadow-sm"
              style={{ backgroundColor: hashColor(stage.name) }}
              title={`${formatCount(totale)} opportunità in "${stage.name}"`}
            >
              {formatCount(totale)}
            </span>
            {canEdit && onQuickAdd && (
              // Quick-add con fase pre-selezionata (standard kanban CRM):
              // prima l'unico "Aggiungi" era globale in header.
              <button
                type="button"
                title={`Aggiungi opportunità in "${stage.name}"`}
                onClick={() => onQuickAdd(stage.id)}
                className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors text-sm leading-none"
              >
                +
              </button>
            )}
            {onToggleCollapse && (
              // Freccia per comprimere la colonna (stile GHL).
              <button
                type="button"
                title={`Comprimi "${stage.name}"`}
                onClick={() => onToggleCollapse(stage.id)}
                className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        {selectedInStage > 0 ? (
          <p className="text-[11px] font-medium text-primary mt-0.5">
            {formatCount(selectedInStage)} selezionat{selectedInStage === 1 ? "a" : "e"}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {formatCurrency(totalValue)} tot · {formatCurrency(avgValue)} avg
          </p>
        )}
      </div>
      <div
        ref={(node) => {
          setNodeRef(node);
          (scrollRef as any).current = node;
        }}
        className={cn(
          "flex-1 p-2 rounded-b-lg border-2 border-t-0 transition-all overflow-y-auto",
          "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40",
          // Visual aggressivo durante drag-over: ring colorato + bg blu + scale leggero
          isOver
            ? "bg-primary/10 border-primary border-dashed scale-[1.01] shadow-inner"
            : "bg-muted/10 border-transparent"
        )}
      >
        <SortableContext items={opportunities.map((o: any) => o.id)} strategy={verticalListSortingStrategy}>
          <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
            {voci.map((virtualRow) => {
              const opp = opportunities[virtualRow.index];
              return (
                <div
                  key={opp.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                >
                  <OpportunityCard
                    opportunity={opp}
                    onClick={() => onCardClick(opp)}
                    onOpenTab={(tab) => onCardClick(opp, tab)}
                    onDelete={onDelete}
                    selected={selectedIds.has(opp.id)}
                    onSelect={onSelect}
                    canEdit={canEdit}
                    sogliaStalloGg={Number(stage.stalled_threshold_days ?? 14) || 14}
                  />
                </div>
              );
            })}
          </div>
        </SortableContext>
        {(isLoading || (!vista && totale > 0)) && opportunities.length === 0 && (
          <div className="space-y-2" aria-busy="true" aria-label={`Caricamento ${stage.name}`}>
            {Array.from({ length: Math.min(3, Math.max(1, totale)) }).map((_, i) => (
              <Skeleton key={i} className={cn("w-full rounded-lg", layout === "mini" ? "h-11" : "h-28")} />
            ))}
          </div>
        )}
        {isError && opportunities.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-xs text-muted-foreground">Schede non caricate.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs hover:bg-muted"
            >
              <RefreshCw className="h-3 w-3" /> Riprova
            </button>
          </div>
        )}
        {!isLoading && !isError && vista && totale === 0 && opportunities.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">Nessuna opportunità</p>
        )}
        {opportunities.length > 0 && (hasNextPage || isFetchingNextPage) && (
          <div className="flex items-center justify-center gap-2 py-2 text-[11px] text-muted-foreground">
            {isFetchingNextPage ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Carico altre…</>
            ) : (
              <button
                type="button"
                onClick={() => fetchNextPage()}
                className="rounded-md px-2 py-1 hover:bg-muted hover:text-foreground"
              >
                Mostra altre · {formatCount(opportunities.length)} di {formatCount(totale)}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

interface KanbanProps {
  stages: OpportunityStage[];
  pipelineId: string;
  filtri: FiltriServerOpportunita;
  sortField: string;
  sortDir: string;
  /** Conteggi di ogni fase, dal database. */
  riepilogo: RiepilogoOpportunita | null | undefined;
  /** Id per fase già chiesti al database (selezione di tutta la colonna). */
  idsPerFase?: Record<string, string[]>;
  selectedIds: Set<string>;
  onSelect: (id: string, selected: boolean) => void;
  onSelectStage?: (stageId: string, selected: boolean) => void;
  canEdit?: boolean;
  onQuickAdd?: (stageId: string) => void;
}

const COLLAPSED_STAGES_KEY = "opp-kanban-collapsed-stages";

export function OpportunityKanbanView({
  stages, pipelineId, filtri, sortField, sortDir, riepilogo, idsPerFase,
  selectedIds, onSelect, onSelectStage, canEdit = true, onQuickAdd,
}: KanbanProps) {
  const updateStage = useUpdateOpportunityStage();
  const deleteOpp = useDeleteOpportunity();
  const [selectedOpp, setSelectedOpp] = useState<any>(null);
  const [initialTab, setInitialTab] = useState<string | undefined>();
  const [activeItem, setActiveItem] = useState<any>(null);
  // Drag su una fase persa/abbandonata: lo spostamento resta in sospeso
  // finche' non arriva il motivo — stesso obbligo del dettaglio.
  const [perditaInSospeso, setPerditaInSospeso] = useState<{
    opp: any; stageId: string; status: string;
  } | null>(null);

  // Fasi collassate: persistite in localStorage così restano tali al reload.
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_STAGES_KEY);
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  const toggleCollapse = useCallback((stageId: string) => {
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId); else next.add(stageId);
      try { localStorage.setItem(COLLAPSED_STAGES_KEY, JSON.stringify([...next])); } catch { /* storage non disponibile */ }
      return next;
    });
  }, []);

  // Le altre pipeline dell'azienda: usePipelines porta già le fasi con sé,
  // quindi la striscia non costa nessuna query in più.
  const { data: pipelines = [] } = usePipelines();
  const altrePipeline = useMemo(
    () => (pipelines as Array<{ id: string; name: string; marketing_pipeline_stages?: Array<{ id: string; name: string }> }>)
      .filter((p) => p.id !== pipelineId),
    [pipelines, pipelineId],
  );

  const sensors = useSensors(
    // Desktop: distance 5px è il minimo che evita click accidentali — sotto si
    // attivava drag su semplice click. Tuned per ridurre "lag percepito".
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Mobile: 180ms long-press + tolerance 8px. 200ms era ai limiti per
    // distinguere tap vs drag — 180ms più reattivo. Tolerance 8 evita drag
    // accidentali durante scroll verticale della colonna.
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  // Collision detection custom: usa pointerWithin (più stabile per kanban
  // multi-colonna con scroll orizzontale), fallback a rectIntersection se il
  // puntatore esce dal viewport (es. scroll auto bordi).
  // closestCorners (default precedente) era impreciso con colonne strette
  // affiancate — droppava nella colonna sbagliata.
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) return pointerCollisions;
    return rectIntersection(args);
  }, []);

  // Ogni colonna carica le sue schede: quella trascinata arriva con il
  // trascinamento stesso (data.opp), e la fase di arrivo dalla colonna o
  // dalla scheda sotto il puntatore (data.stageId).
  const handleDragStart = useCallback((event: DragStartEvent) => {
    if (!canEdit) return;
    const opp = event.active.data.current?.opp;
    if (opp) setActiveItem(opp);
  }, [canEdit]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveItem(null);
    if (!canEdit) return;
    const { active, over } = event;
    if (!over) return;

    const activeOpp = active.data.current?.opp;
    if (!activeOpp) return;

    // Lasciata sulla striscia di un'altra pipeline: ci va per intero, partendo
    // dalla sua prima fase. Cambiare la sola fase la lascerebbe agganciata alla
    // pipeline di prima, sparendo da tutte e due.
    const pipelineDestinazione = over.data.current?.pipelineDestinazione as string | undefined;
    if (pipelineDestinazione && pipelineDestinazione !== pipelineId) {
      const destinazione = altrePipeline.find((p: { id: string }) => p.id === pipelineDestinazione);
      const primaFase = destinazione?.marketing_pipeline_stages?.[0];
      if (!primaFase) {
        toast.error(`«${destinazione?.name ?? "La pipeline scelta"}» non ha nessuna fase`);
        return;
      }
      updateStage.mutate(
        {
          id: activeOpp.id,
          stage_id: primaFase.id,
          pipeline_id: pipelineDestinazione,
          auto_status: inferOpportunityStatusFromStage(primaFase, "open"),
        },
        { onSuccess: () => toast.success(`Spostata in «${destinazione?.name}» — ${primaFase.name}`) },
      );
      return;
    }

    const targetStageId = (over.data.current?.stageId as string | undefined) ?? (over.id as string);

    if (activeOpp.stage_id !== targetStageId && stages.some(s => s.id === targetStageId)) {
      const targetStage = stages.find(s => s.id === targetStageId);
      const nextStatus = inferOpportunityStatusFromStage(targetStage, "open");
      if (nextStatus === "lost" || nextStatus === "abandoned") {
        // Niente perdita senza motivo: il drag si conferma nel dialog.
        setPerditaInSospeso({ opp: activeOpp, stageId: targetStageId, status: nextStatus });
        return;
      }
      updateStage.mutate({
        id: activeOpp.id,
        stage_id: targetStageId,
        auto_status: nextStatus,
      });
    }
  }, [stages, updateStage, canEdit, pipelineId, altrePipeline]);

  const handleDelete = useCallback((id: string) => {
    if (!canEdit) return;
    deleteOpp.mutate(id);
  }, [deleteOpp, canEdit]);

  const handleCardClick = useCallback((opp: any, tab?: string) => {
    setSelectedOpp(opp);
    setInitialTab(tab);
  }, []);

  // ── Frecce per navigare tra le fasi ──
  // Compaiono solo dal lato dove c'e' davvero altro da vedere: se le fasi ci
  // stanno tutte non appare niente, e la vista resta pulita.
  const contenitoreFasiRef = useRef<HTMLDivElement | null>(null);
  // Anche come stato: le colonne lo usano come riquadro per capire se sono
  // sullo schermo, e con il solo ref al primo giro sarebbe ancora vuoto.
  const [contenitoreFasi, setContenitoreFasi] = useState<HTMLDivElement | null>(null);
  const [frecceVisibili, setFrecceVisibili] = useState({ sinistra: false, destra: false });

  const aggiornaFrecce = useCallback(() => {
    const el = contenitoreFasiRef.current;
    if (!el) return;
    const restaADestra = el.scrollWidth - el.clientWidth - el.scrollLeft;
    setFrecceVisibili((prec) => {
      // 4px di tolleranza: gli arrotondamenti sub-pixel dello zoom browser
      // facevano lampeggiare la freccia a fine corsa.
      const succ = { sinistra: el.scrollLeft > 4, destra: restaADestra > 4 };
      return prec.sinistra === succ.sinistra && prec.destra === succ.destra ? prec : succ;
    });
  }, []);

  const scorriFasi = useCallback((direzione: 1 | -1) => {
    const el = contenitoreFasiRef.current;
    if (!el) return;
    // Un "passo" e' l'80% della larghezza visibile: si avanza di quasi uno
    // schermo lasciando una colonna di contesto, cosi' non si perde il filo.
    el.scrollBy({ left: direzione * el.clientWidth * 0.8, behavior: "smooth" });
  }, []);

  useEffect(() => {
    aggiornaFrecce();
    const el = contenitoreFasiRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // Il ridimensionamento della finestra e il collasso di una colonna cambiano
    // quanto resta da scorrere: senza observer le frecce restavano bloccate.
    const ro = new ResizeObserver(aggiornaFrecce);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aggiornaFrecce, stages.length, collapsedStages]);

  return (
    <>
      {/* Navigazione tra le fasi.
          Prima ci si affidava alla sola scrollbar del sistema: su macOS e'
          overlay, compare mentre scorri e svanisce, quindi con dieci fasi non
          si capiva che le colonne continuavano oltre il bordo. Provato a
          forzarla con ::-webkit-scrollbar: NON funziona piu', Chrome rispetta
          l'impostazione di sistema e la barra resta a zero pixel (verificato).
          Quindi niente scrollbar: due frecce vere, che compaiono solo dal lato
          in cui c'e' altro da vedere. Un bottone da 32px si clicca, una barra
          da 10px si insegue. Le regole ::-webkit-scrollbar restano perche' su
          Windows e Linux la barra classica esiste e cosi' e' meno invadente. */}
      <div className="relative w-full h-full">
        {frecceVisibili.sinistra && (
          <button
            type="button"
            aria-label="Fasi precedenti"
            onClick={() => scorriFasi(-1)}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-20 h-8 w-8 flex items-center justify-center rounded-full border bg-background/95 shadow-md backdrop-blur hover:bg-muted transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        {frecceVisibili.destra && (
          <button
            type="button"
            aria-label="Fasi successive"
            onClick={() => scorriFasi(1)}
            className="absolute right-1 top-1/2 -translate-y-1/2 z-20 h-8 w-8 flex items-center justify-center rounded-full border bg-background/95 shadow-md backdrop-blur hover:bg-muted transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      <div
        ref={(node) => { contenitoreFasiRef.current = node; setContenitoreFasi(node); }}
        onScroll={aggiornaFrecce}
        className={cn(
        "w-full h-full overflow-x-auto overflow-y-hidden",
        "[scrollbar-width:thin]",
        "[&::-webkit-scrollbar]:h-2.5",
        "[&::-webkit-scrollbar-track]:bg-muted/40 [&::-webkit-scrollbar-track]:rounded-full",
        "[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-thumb]:rounded-full",
        "hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/60",
      )}>
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex h-full gap-2 p-1 min-w-max">
            {stages.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                pipelineId={pipelineId}
                filtri={filtri}
                sortField={sortField}
                sortDir={sortDir}
                conteggio={riepilogo ? (riepilogo.per_fase[stage.id]?.n ?? 0) : undefined}
                valoreFase={riepilogo ? (riepilogo.per_fase[stage.id]?.valore ?? 0) : undefined}
                idsFase={idsPerFase?.[stage.id]}
                radiceScorrimento={contenitoreFasi}
                onCardClick={handleCardClick}
                onDelete={handleDelete}
                selectedIds={selectedIds}
                onSelect={onSelect}
                onSelectStage={onSelectStage}
                canEdit={canEdit}
                onQuickAdd={onQuickAdd}
                collapsed={collapsedStages.has(stage.id)}
                onToggleCollapse={toggleCollapse}
              />
            ))}
          </div>
          {/* Trascinando, sotto le fasi compaiono le altre pipeline: è l'unico
              modo per spostare in una pipeline che il kanban non sta mostrando. */}
          {activeItem && canEdit && altrePipeline.length > 0 && (
            <div className="sticky bottom-0 left-0 z-30 mx-1 mb-1 rounded-xl border bg-background/95 p-2 shadow-lg backdrop-blur">
              <p className="px-1 pb-1.5 text-[11px] font-medium text-muted-foreground">
                Lascia qui per spostare in un'altra pipeline
              </p>
              <div className="flex gap-2 overflow-x-auto">
                {altrePipeline.map((p) => <ZonaPipeline key={p.id} pipeline={p} />)}
              </div>
            </div>
          )}
          {/* dropAnimation null: la card non "vola indietro" al rilascio — l'update
              ottimistico la posiziona subito nella nuova colonna (drop snappy). */}
          <DragOverlay dropAnimation={null}>
            {activeItem ? (
              // Card "in volo": rotazione + ombra forte + ring colorato = feedback chiaro
              <div className="rotate-2 scale-105 shadow-2xl ring-2 ring-primary rounded-md cursor-grabbing">
                <OpportunityCard opportunity={activeItem} isOverlay canEdit={canEdit} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
      </div>

      <OpportunityDetailDialog
        opportunity={selectedOpp}
        open={!!selectedOpp}
        onOpenChange={(open) => { if (!open) { setSelectedOpp(null); setInitialTab(undefined); } }}
        stages={stages}
        initialTab={initialTab}
        canEdit={canEdit}
      />

      <LossReasonDialog
        key={perditaInSospeso?.opp?.id ?? "chiuso"}
        open={!!perditaInSospeso}
        titolo={perditaInSospeso?.opp?.name}
        inCorso={updateStage.isPending}
        onClose={() => setPerditaInSospeso(null)}
        onConfirm={(esito) => {
          if (!perditaInSospeso) return;
          updateStage.mutate(
            {
              id: perditaInSospeso.opp.id,
              stage_id: perditaInSospeso.stageId,
              auto_status: perditaInSospeso.status,
              perdita: esito,
            },
            // Solo su successo: in errore il dialog resta aperto e si riprova
            // (con onSettled si chiudeva buttando via il motivo appena scritto).
            { onSuccess: () => setPerditaInSospeso(null) },
          );
        }}
      />
    </>
  );
}
