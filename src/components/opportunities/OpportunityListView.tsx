import { useState, useMemo, useRef, useEffect, memo } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowRight, Check, ChevronDown, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
// Table components removed — desktop view uses flex grid for proper column alignment with virtualizer
import { OpportunityDetailDialog } from "./OpportunityDetailDialog";
import { DealHealthBadge } from "./DealHealthBadge";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/formatters";
import { STATUS_MAP, hashColor, inferOpportunityStatusFromStage } from "@/types/opportunities";
import type { OpportunityStage } from "@/types/opportunities";
import { useUpdateOpportunityStage, type RiepilogoOpportunita } from "@/hooks/useOpportunitiesData";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

// Valore compatto per le mini-card di fase (mobile): 733200 → "733k", 1_250_000 → "1,3M".
function fmtCompactEuro(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
  return `${Math.round(v)}`;
}

interface ListProps {
  stages: OpportunityStage[];
  /** Le righe caricate finora (a pagine, dal database). */
  opportunities: any[];
  /** Conteggi per fase e totale, dal database: tutte, non solo le caricate. */
  riepilogo: RiepilogoOpportunita | null | undefined;
  isLoading?: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  /** Fase scelta nelle schede in alto su mobile: filtra sul database. */
  mobileStageId: string | null;
  onMobileStageChange: (stageId: string | null) => void;
  selectedIds: Set<string>;
  onSelect: (id: string, selected: boolean) => void;
  onSelectMany?: (ids: string[], selected: boolean) => void;
  /** «Seleziona per fase»: tutte le opportunità della fase, anche non caricate. */
  onSelectStage?: (stageId: string, selected: boolean) => void;
  canEdit?: boolean;
}

export const OpportunityListView = memo(function OpportunityListView({
  stages,
  opportunities,
  riepilogo,
  isLoading = false,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  mobileStageId,
  onMobileStageChange,
  selectedIds,
  onSelect,
  onSelectMany,
  onSelectStage,
  canEdit = true,
}: ListProps) {
  const isMobile = useIsMobile();
  const [selectedOpp, setSelectedOpp] = useState<any>(null);
  const setMobileStageId = onMobileStageChange;
  // Quick-move: opportunità per cui mostrare il selettore di fase (Sheet bottom)
  const [moveOpp, setMoveOpp] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const updateStage = useUpdateOpportunityStage();

  const handleQuickMove = (targetStageId: string) => {
    if (!moveOpp || !canEdit) return;
    if (moveOpp.stage_id === targetStageId) {
      setMoveOpp(null);
      return;
    }
    const targetStage = stages.find((s) => s.id === targetStageId);
    const nextStatus = inferOpportunityStatusFromStage(targetStage, "open");
    updateStage.mutate(
      { id: moveOpp.id, stage_id: targetStageId, auto_status: nextStatus },
      {
        onSuccess: () => {
          toast.success(`Spostata in "${targetStage?.name ?? "fase"}"`);
          setMoveOpp(null);
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  const stageMap = useMemo(() => {
    const m: Record<string, string> = {};
    stages.forEach((s) => { m[s.id] = s.name; });
    return m;
  }, [stages]);

  // Su mobile la fase scelta filtra già sul database; qui resta come
  // sicurezza per la scheda appena spostata in un'altra fase.
  const mobileOpportunities = useMemo(() => {
    if (!mobileStageId) return opportunities;
    return opportunities.filter((o: any) => o.stage_id === mobileStageId);
  }, [opportunities, mobileStageId]);

  const allSelected = opportunities.length > 0 && opportunities.every((o: any) => selectedIds.has(o.id));
  const someSelected = opportunities.some((o: any) => selectedIds.has(o.id)) && !allSelected;

  const selectAllRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = selectAllRef.current;
    if (el) {
      const input = el.querySelector("input") || el;
      if (input instanceof HTMLInputElement) {
        input.indeterminate = someSelected;
      }
    }
  }, [someSelected]);

  const selectMany = (ids: string[], sel: boolean) => {
    if (onSelectMany) onSelectMany(ids, sel);
    else ids.forEach((id) => onSelect(id, sel));
  };

  const handleSelectAll = () => {
    selectMany(opportunities.map((o: any) => o.id), !allSelected);
  };

  // Conteggio e valore per fase dal database: il menu «seleziona per fase» e
  // la striscia mobile contano tutte le opportunità, non le righe caricate.
  const { stageAgg, totalValue, totaleTutte } = useMemo(() => {
    const agg: Record<string, { count: number; value: number }> = {};
    let tv = 0;
    for (const [faseId, v] of Object.entries(riepilogo?.per_fase ?? {})) {
      agg[faseId] = { count: v.n, value: v.valore };
      tv += v.valore;
    }
    return { stageAgg: agg, totalValue: tv, totaleTutte: riepilogo?.totale ?? opportunities.length };
  }, [riepilogo, opportunities.length]);

  const virtualizer = useVirtualizer({
    count: opportunities.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 10,
  });

  // Scorrendo verso il fondo arrivano le righe successive.
  const righeVisibili = virtualizer.getVirtualItems();
  const ultimaRiga = righeVisibili.length > 0 ? righeVisibili[righeVisibili.length - 1].index : -1;
  useEffect(() => {
    if (isMobile || ultimaRiga < 0) return;
    if (ultimaRiga >= opportunities.length - 10 && hasMore && !isLoadingMore) onLoadMore?.();
  }, [isMobile, ultimaRiga, opportunities.length, hasMore, isLoadingMore, onLoadMore]);

  return (
    <>
      {/* ── MOBILE: card list con filtro per fase ──
          Solo su mobile (prima c'erano entrambe e una delle due nascosta dal
          CSS: su desktop centinaia di schede invisibili nella pagina). */}
      {isMobile && (
      <div className="flex flex-col gap-0">
        {/* Striscia pipeline: una mini-card per fase (nome + n. deal + € in fase),
            così su mobile si vede la pipeline con le fasi di lavoro, allineata. */}
        <div className="flex gap-2 overflow-x-auto pb-2 pt-0.5 scrollbar-none">
          <button
            type="button"
            onClick={() => setMobileStageId(null)}
            className={cn(
              "flex w-[92px] shrink-0 flex-col gap-0.5 rounded-xl border px-2.5 py-1.5 text-left transition-colors",
              !mobileStageId
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-slate-200 bg-white hover:bg-slate-50"
            )}
            aria-pressed={!mobileStageId}
          >
            <span className="flex w-full min-w-0 items-center gap-1">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span className="truncate text-[11px] font-medium text-muted-foreground">Tutte</span>
            </span>
            <span className="text-base font-bold leading-none text-foreground tabular-nums">{formatCount(totaleTutte)}</span>
            <span className="truncate text-[10px] font-medium text-muted-foreground">€ {fmtCompactEuro(totalValue)}</span>
          </button>
          {stages.map((stage: any) => {
            const agg = stageAgg[stage.id] || { count: 0, value: 0 };
            const active = mobileStageId === stage.id;
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setMobileStageId(stage.id)}
                className={cn(
                  "flex w-[92px] shrink-0 flex-col gap-0.5 rounded-xl border px-2.5 py-1.5 text-left transition-colors",
                  active
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                )}
                aria-pressed={active}
              >
                <span className="flex w-full min-w-0 items-center gap-1">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: hashColor(stage.name) }} />
                  <span className="truncate text-[11px] font-medium text-muted-foreground">{stage.name}</span>
                </span>
                <span className="text-base font-bold leading-none text-foreground tabular-nums">{formatCount(agg.count)}</span>
                <span className="truncate text-[10px] font-medium text-muted-foreground">€ {fmtCompactEuro(agg.value)}</span>
              </button>
            );
          })}
        </div>

        {/* Cards */}
        {isLoading && mobileOpportunities.length === 0 ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : mobileOpportunities.length === 0 ? (
          <div className="text-center text-muted-foreground py-12 text-sm">
            Nessuna opportunità in questa fase
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {mobileOpportunities.map((opp: any) => {
              const contact = opp.marketing_contacts;
              const fullName = contact
                ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
                : opp.name;
              const contactPhone = contact?.phone;
              // Venditore prima; se manca, il call center (come nella scheda kanban).
              const profile = opp.assigned_profile ?? opp.call_center_profile;
              const ownerInitials = profile
                ? `${profile.first_name?.[0] || ""}${profile.last_name?.[0] || ""}`.toUpperCase()
                : null;
              const ownerName = profile
                ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
                : null;
              const statusInfo = STATUS_MAP[opp.status] || STATUS_MAP.open;
              const tags: string[] = opp.tags || [];
              const isSelected = selectedIds.has(opp.id);

              return (
                <div
                  key={opp.id}
                  onClick={() => setSelectedOpp(opp)}
                  className={cn(
                    "border rounded-xl p-4 cursor-pointer active:scale-[0.99] transition-all bg-card",
                    isSelected && "border-primary bg-primary/5"
                  )}
                >
                  {/* Top row: name + value */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm leading-tight truncate">{opp.name || fullName}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className="h-4 w-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0"
                          style={{ backgroundColor: hashColor(fullName || "?") }}
                        >
                          {(fullName?.[0] || "?").toUpperCase()}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">{fullName || "—"}</span>
                        {contactPhone && (
                          <span className="text-xs text-muted-foreground">· {contactPhone}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-base leading-tight">
                        € {Number(opp.value || 0).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </p>
                      <Badge className={cn("text-[10px] font-medium border-0 mt-0.5", statusInfo.className)}>
                        {statusInfo.label}
                      </Badge>
                    </div>
                  </div>

                  {/* Bottom row: stage (clickable per quick-move) + health + owner + tags */}
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMoveOpp(opp);
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-dashed border-primary/40 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/5 active:bg-primary/10 transition-colors"
                        title="Sposta in un'altra fase"
                      >
                        {stageMap[opp.stage_id] || "—"}
                        <ArrowRight className="h-2.5 w-2.5" />
                      </button>
                    ) : (
                      <Badge variant="outline" className="text-[10px] font-normal py-0">
                        {stageMap[opp.stage_id] || "—"}
                      </Badge>
                    )}
                    {opp.status === "open" && <DealHealthBadge opportunity={opp} />}
                    {ownerInitials && (
                      <div className="flex items-center gap-1 ml-auto">
                        <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[9px] font-bold shrink-0">
                          {ownerInitials}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{ownerName}</span>
                      </div>
                    )}
                    {tags.slice(0, 2).map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px] py-0">{t}</Badge>
                    ))}
                  </div>
                </div>
              );
            })}
            {(hasMore || isLoadingMore) && (
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full text-sm"
                disabled={isLoadingMore}
                onClick={() => onLoadMore?.()}
              >
                {isLoadingMore
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carico altre…</>
                  : <>Mostra altre · {formatCount(mobileOpportunities.length)} di {formatCount(mobileStageId ? (stageAgg[mobileStageId]?.count ?? 0) : totaleTutte)}</>}
              </Button>
            )}
          </div>
        )}
      </div>
      )}

      {/* ── Quick-move Sheet (mobile + desktop) ── */}
      <Sheet open={moveOpp != null} onOpenChange={(v) => { if (!v) setMoveOpp(null); }}>
        <SheetContent side="bottom" className="max-h-[70vh] flex flex-col">
          <SheetHeader>
            <SheetTitle>Sposta opportunità</SheetTitle>
            <SheetDescription className="text-xs">
              {moveOpp?.name ?? ""} — seleziona la fase di destinazione
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto mt-3 space-y-1.5 pb-4">
            {stages.map((s) => {
              const isCurrent = moveOpp?.stage_id === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleQuickMove(s.id)}
                  disabled={updateStage.isPending}
                  className={cn(
                    "w-full flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                    isCurrent
                      ? "border-primary bg-primary/5 text-primary font-semibold"
                      : "hover:bg-accent active:bg-accent",
                  )}
                >
                  <span className="text-sm">{s.name}</span>
                  {isCurrent ? (
                    <Check className="h-4 w-4 text-primary shrink-0" />
                  ) : (
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── DESKTOP: griglia con colonne fisse ── */}
      {!isMobile && (
      <div className="flex max-h-full flex-col overflow-x-auto rounded-lg border">
        <div className="flex min-h-0 w-max min-w-full flex-1 flex-col">
          {/* Header — fuori dal container verticale, resta fisso */}
          <div className="bg-muted/40 border-b flex shrink-0 items-center text-xs font-medium text-muted-foreground">
            <div className="w-[64px] shrink-0 px-3 py-3 flex items-center gap-0.5">
              <Checkbox
                ref={selectAllRef}
                checked={allSelected || (someSelected ? "indeterminate" : false)}
                onCheckedChange={handleSelectAll}
                className="h-4 w-4"
              />
              {canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      title="Seleziona per fase"
                      className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuLabel className="text-xs">Seleziona per fase</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {stages.map((s) => {
                      const count = stageAgg[s.id]?.count ?? 0;
                      return (
                        <DropdownMenuItem
                          key={s.id}
                          disabled={count === 0}
                          // Tutte quelle della fase, anche le righe non ancora caricate.
                          onSelect={() => onSelectStage
                            ? onSelectStage(s.id, true)
                            : selectMany(opportunities.filter((o: any) => o.stage_id === s.id).map((o: any) => o.id), true)}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="truncate">{s.name}</span>
                          <span className="text-muted-foreground shrink-0 tabular-nums">{formatCount(count)}</span>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <div className="w-[240px] shrink-0 px-3 py-3">Nome opportunità</div>
            <div className="w-[170px] shrink-0 px-3 py-3">Contatto</div>
            <div className="w-[150px] shrink-0 px-3 py-3">Fase</div>
            <div className="w-[130px] shrink-0 px-3 py-3 text-right">Valore</div>
            <div className="w-[90px] shrink-0 px-3 py-3">Stato</div>
            <div className="w-[70px] shrink-0 px-3 py-3">Salute</div>
            <div className="w-[150px] shrink-0 px-3 py-3">Venditore</div>
            <div className="w-[150px] shrink-0 px-3 py-3">Etichette</div>
            <div className="w-[100px] shrink-0 px-3 py-3">Fonte</div>
            <div className="w-[90px] shrink-0 px-3 py-3">Creato il</div>
            <div className="w-[90px] shrink-0 px-3 py-3">Aggiornato</div>
          </div>

          {/* Body — scroll verticale indipendente */}
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {isLoading && opportunities.length === 0 ? (
            <div className="space-y-1 p-2" aria-busy="true">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-md" />)}
            </div>
          ) : opportunities.length === 0 ? (
            <div className="text-center text-muted-foreground py-12 text-sm">
              Nessuna opportunità trovata
            </div>
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const opp = opportunities[virtualRow.index];
                const contact = opp.marketing_contacts;
                const fullName = contact
                  ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
                  : opp.name;
                const contactCity = contact?.city ? `· ${contact.city}` : "";

                // Venditore prima; se manca, il call center (come nella scheda kanban).
                const profile = opp.assigned_profile ?? opp.call_center_profile;
                const ownerName = profile
                  ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
                  : null;
                const ownerInitials = profile
                  ? `${profile.first_name?.[0] || ""}${profile.last_name?.[0] || ""}`.toUpperCase()
                  : null;

                const tags: string[] = opp.tags || [];
                const statusInfo = STATUS_MAP[opp.status] || STATUS_MAP.open;
                const isSelected = selectedIds.has(opp.id);

                return (
                  <div
                    key={opp.id}
                    ref={virtualizer.measureElement}
                    data-index={virtualRow.index}
                    className={cn(
                      "flex items-center border-b cursor-pointer transition-colors hover:bg-muted/30",
                      isSelected && "bg-primary/5"
                    )}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onClick={() => setSelectedOpp(opp)}
                  >
                    {/* Checkbox */}
                    <div className="w-[64px] shrink-0 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => onSelect(opp.id, !!checked)}
                        className="h-4 w-4"
                      />
                    </div>
                    {/* Nome */}
                    <div className="w-[240px] shrink-0 px-3 py-2.5 overflow-hidden">
                      <p className="text-sm font-medium truncate">{opp.name || fullName}</p>
                      {contactCity && <p className="text-xs text-muted-foreground truncate">{contactCity}</p>}
                    </div>
                    {/* Contatto */}
                    <div className="w-[170px] shrink-0 px-3 py-2.5 overflow-hidden">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                          style={{ backgroundColor: hashColor(fullName || "?") }}
                        >
                          {(fullName?.[0] || "?").toUpperCase()}
                        </span>
                        <span className="text-sm truncate">{fullName || "—"}</span>
                      </div>
                    </div>
                    {/* Fase — clickable per quick-move */}
                    <div className="w-[150px] shrink-0 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => setMoveOpp(opp)}
                          className="inline-flex items-center gap-1 rounded-md border border-dashed border-primary/40 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/5 transition-colors whitespace-nowrap"
                          title="Sposta in un'altra fase"
                        >
                          {stageMap[opp.stage_id] || "—"}
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      ) : (
                        <Badge variant="outline" className="text-xs font-normal whitespace-nowrap">
                          {stageMap[opp.stage_id] || "—"}
                        </Badge>
                      )}
                    </div>
                    {/* Valore */}
                    <div className="w-[130px] shrink-0 px-3 py-2.5 text-right font-medium text-sm whitespace-nowrap">
                      € {Number(opp.value || 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                    </div>
                    {/* Stato */}
                    <div className="w-[90px] shrink-0 px-3 py-2.5">
                      <Badge className={cn("text-[10px] font-medium border-0", statusInfo.className)}>
                        {statusInfo.label}
                      </Badge>
                    </div>
                    {/* Salute */}
                    <div className="w-[70px] shrink-0 px-3 py-2.5">
                      {opp.status === "open" ? (
                        <DealHealthBadge opportunity={opp} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                    {/* Venditore */}
                    <div className="w-[150px] shrink-0 px-3 py-2.5 overflow-hidden">
                      {ownerName ? (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="shrink-0 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[9px] font-bold">
                            {ownerInitials}
                          </span>
                          <span className="text-sm truncate">{ownerName}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                    {/* Etichette */}
                    <div className="w-[150px] shrink-0 px-3 py-2.5 overflow-hidden">
                      {tags.length > 0 ? (
                        <div className="flex items-center gap-1 min-w-0">
                          <Badge variant="secondary" className="text-[10px] shrink-0">{tags[0]}</Badge>
                          {tags.length > 1 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="text-[10px] cursor-default shrink-0">
                                  +{tags.length - 1}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">
                                {tags.slice(1).join(", ")}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                    {/* Fonte */}
                    <div className="w-[100px] shrink-0 px-3 py-2.5 text-sm text-muted-foreground truncate">
                      {opp.source || "—"}
                    </div>
                    {/* Creato il */}
                    <div className="w-[90px] shrink-0 px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {opp.created_at ? format(new Date(opp.created_at), "dd MMM yy", { locale: it }) : "—"}
                    </div>
                    {/* Aggiornato */}
                    <div className="w-[90px] shrink-0 px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {opp.updated_at ? format(new Date(opp.updated_at), "dd MMM yy", { locale: it }) : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {isLoadingMore && (
            <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carico altre…
            </div>
          )}
          </div>{/* close scrollRef */}
          {opportunities.length > 0 && (
            <div className="shrink-0 border-t bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground tabular-nums">
              {formatCount(opportunities.length)} di {formatCount(totaleTutte)}
              {hasMore && !isLoadingMore && (
                <button type="button" onClick={() => onLoadMore?.()} className="ml-2 underline-offset-2 hover:text-foreground hover:underline">
                  mostra altre
                </button>
              )}
            </div>
          )}
        </div>{/* close minWidth */}
      </div>
      )}{/* close border/overflow-x-auto */}

      <OpportunityDetailDialog
        opportunity={selectedOpp}
        open={!!selectedOpp}
        onOpenChange={(open) => { if (!open) setSelectedOpp(null); }}
        stages={stages}
        canEdit={canEdit}
      />
    </>
  );
});
