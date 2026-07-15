import { useState, useMemo, useRef, useEffect, memo } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
// Table components removed — desktop view uses flex grid for proper column alignment with virtualizer
import { OpportunityDetailDialog } from "./OpportunityDetailDialog";
import { DealHealthBadge } from "./DealHealthBadge";
import { cn } from "@/lib/utils";
import { STATUS_MAP, hashColor, inferOpportunityStatusFromStage } from "@/types/opportunities";
import type { OpportunityStage } from "@/types/opportunities";
import { useUpdateOpportunityStage } from "@/hooks/useOpportunitiesData";
import { toast } from "sonner";

interface ListProps {
  stages: OpportunityStage[];
  opportunities: any[];
  selectedIds: Set<string>;
  onSelect: (id: string, selected: boolean) => void;
  onSelectMany?: (ids: string[], selected: boolean) => void;
  canEdit?: boolean;
}

export const OpportunityListView = memo(function OpportunityListView({
  stages,
  opportunities,
  selectedIds,
  onSelect,
  onSelectMany,
  canEdit = true,
}: ListProps) {
  const [selectedOpp, setSelectedOpp] = useState<any>(null);
  const [mobileStageId, setMobileStageId] = useState<string | null>(null);
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

  // Conteggio opportunità per fase, per il menu "seleziona per fase".
  const stageCounts = useMemo(() => {
    const m: Record<string, number> = {};
    opportunities.forEach((o: any) => { m[o.stage_id] = (m[o.stage_id] || 0) + 1; });
    return m;
  }, [opportunities]);

  const virtualizer = useVirtualizer({
    count: opportunities.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 10,
  });

  return (
    <>
      {/* ── MOBILE: card list con filtro per fase ── */}
      <div className="sm:hidden flex flex-col gap-0">
        {/* Stage pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => setMobileStageId(null)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-colors",
              !mobileStageId
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            Tutte ({opportunities.length})
          </button>
          {stages.map((stage: any) => {
            const count = opportunities.filter((o: any) => o.stage_id === stage.id).length;
            return (
              <button
                key={stage.id}
                onClick={() => setMobileStageId(stage.id)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-colors",
                  mobileStageId === stage.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {stage.name} ({count})
              </button>
            );
          })}
        </div>

        {/* Cards */}
        {mobileOpportunities.length === 0 ? (
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
              const profile = opp.assigned_profile;
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
          </div>
        )}
      </div>

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
      <div className="hidden sm:block border rounded-lg overflow-x-auto">
        <div className="w-max min-w-full">
          {/* Header — fuori dal container verticale, resta fisso */}
          <div className="bg-muted/40 border-b flex items-center text-xs font-medium text-muted-foreground">
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
                      const count = stageCounts[s.id] || 0;
                      return (
                        <DropdownMenuItem
                          key={s.id}
                          disabled={count === 0}
                          onSelect={() => selectMany(opportunities.filter((o: any) => o.stage_id === s.id).map((o: any) => o.id), true)}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="truncate">{s.name}</span>
                          <span className="text-muted-foreground shrink-0">{count}</span>
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
          <div ref={scrollRef} className="overflow-y-auto overflow-x-hidden max-h-[calc(100vh-380px)]">
          {opportunities.length === 0 ? (
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

                const profile = opp.assigned_profile;
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
          </div>{/* close scrollRef */}
        </div>{/* close minWidth */}
      </div>{/* close border/overflow-x-auto */}

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
