import { useState, useMemo, useRef, useEffect, memo } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { OpportunityDetailDialog } from "./OpportunityDetailDialog";
import { DealHealthBadge } from "./DealHealthBadge";
import { cn } from "@/lib/utils";
import { STATUS_MAP, hashColor } from "@/types/opportunities";
import type { OpportunityStage } from "@/types/opportunities";

interface ListProps {
  stages: OpportunityStage[];
  opportunities: any[];
  selectedIds: Set<string>;
  onSelect: (id: string, selected: boolean) => void;
}

export const OpportunityListView = memo(function OpportunityListView({
  stages,
  opportunities,
  selectedIds,
  onSelect,
}: ListProps) {
  const [selectedOpp, setSelectedOpp] = useState<any>(null);
  const [mobileStageId, setMobileStageId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const handleSelectAll = () => {
    if (allSelected) {
      opportunities.forEach((o: any) => onSelect(o.id, false));
    } else {
      opportunities.forEach((o: any) => onSelect(o.id, true));
    }
  };

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

                  {/* Bottom row: stage + health + owner + tags */}
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <Badge variant="outline" className="text-[10px] font-normal py-0">
                      {stageMap[opp.stage_id] || "—"}
                    </Badge>
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

      {/* ── DESKTOP: tabella con scroll orizzontale ── */}
      <div className="hidden sm:block border rounded-lg">
        <div ref={scrollRef} className="overflow-auto max-h-[calc(100vh-320px)] rounded-lg">
          <div style={{ minWidth: "1000px" }}>
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="bg-muted/40">
                <TableHead className="w-10">
                  <Checkbox
                    ref={selectAllRef}
                    checked={allSelected || (someSelected ? "indeterminate" : false)}
                    onCheckedChange={handleSelectAll}
                    className="h-4 w-4"
                  />
                </TableHead>
                <TableHead className="min-w-[180px]">Nome opportunità</TableHead>
                <TableHead className="min-w-[150px]">Contatto</TableHead>
                <TableHead className="min-w-[120px]">Fase</TableHead>
                <TableHead className="min-w-[100px] text-right">Valore</TableHead>
                <TableHead className="min-w-[100px]">Stato</TableHead>
                <TableHead className="min-w-[80px]">Salute</TableHead>
                <TableHead className="min-w-[130px]">Titolare</TableHead>
                <TableHead className="min-w-[120px]">Etichette</TableHead>
                <TableHead className="min-w-[100px]">Fonte</TableHead>
                <TableHead className="min-w-[100px]">Creato il</TableHead>
                <TableHead className="min-w-[100px]">Aggiornato il</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {opportunities.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-muted-foreground py-12">
                    Nessuna opportunità trovata
                  </TableCell>
                </TableRow>
              )}
              {opportunities.length > 0 && (
                <>
                  <tr style={{ height: virtualizer.getTotalSize() }} aria-hidden>
                    <td colSpan={12} style={{ padding: 0, border: 0, height: 0 }} />
                  </tr>
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const opp = opportunities[virtualRow.index];
                    const contact = opp.marketing_contacts;
                    const fullName = contact
                      ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
                      : opp.name;
                    const contactCity = contact?.city ? ` · ${contact.city}` : "";

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
                      <TableRow
                        key={opp.id}
                        ref={virtualizer.measureElement}
                        data-index={virtualRow.index}
                        className={cn(
                          "cursor-pointer transition-colors",
                          isSelected && "bg-primary/5"
                        )}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          minWidth: "1000px",
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                        onClick={() => setSelectedOpp(opp)}
                        data-state={isSelected ? "selected" : undefined}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => onSelect(opp.id, !!checked)}
                            className="h-4 w-4"
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium truncate">{opp.name || fullName}</p>
                            {contactCity && (
                              <p className="text-xs text-muted-foreground truncate">{contactCity}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className="shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                              style={{ backgroundColor: hashColor(fullName || "?") }}
                            >
                              {(fullName?.[0] || "?").toUpperCase()}
                            </span>
                            <span className="text-sm truncate">{fullName || "—"}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs font-normal">
                            {stageMap[opp.stage_id] || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm">
                          € {Number(opp.value || 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("text-[10px] font-medium border-0", statusInfo.className)}>
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {opp.status === 'open' ? (
                            <DealHealthBadge opportunity={opp} />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {ownerName ? (
                            <div className="flex items-center gap-1.5">
                              <span className="shrink-0 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[9px] font-bold">
                                {ownerInitials}
                              </span>
                              <span className="text-sm truncate">{ownerName}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {tags.length > 0 ? (
                            <div className="flex items-center gap-1">
                              <Badge variant="secondary" className="text-[10px]">{tags[0]}</Badge>
                              {tags.length > 1 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="text-[10px] cursor-default">
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
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground truncate">
                          {opp.source || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {opp.created_at ? format(new Date(opp.created_at), "dd MMM yy", { locale: it }) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {opp.updated_at ? format(new Date(opp.updated_at), "dd MMM yy", { locale: it }) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </>
              )}
            </TableBody>
          </Table>
          </div>
        </div>
      </div>

      <OpportunityDetailDialog
        opportunity={selectedOpp}
        open={!!selectedOpp}
        onOpenChange={(open) => { if (!open) setSelectedOpp(null); }}
        stages={stages}
      />
    </>
  );
});
