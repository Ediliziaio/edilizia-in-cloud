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
  const scrollRef = useRef<HTMLDivElement>(null);

  const stageMap = useMemo(() => {
    const m: Record<string, string> = {};
    stages.forEach((s) => { m[s.id] = s.name; });
    return m;
  }, [stages]);

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
      <div className="border rounded-lg overflow-hidden">
        <div ref={scrollRef} className="overflow-auto max-h-[calc(100vh-280px)]">
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
                  <TableCell colSpan={11} className="text-center text-muted-foreground py-12">
                    Nessuna opportunità trovata
                  </TableCell>
                </TableRow>
              )}
              {opportunities.length > 0 && (
                <>
                  <tr style={{ height: virtualizer.getTotalSize() }} aria-hidden>
                    <td colSpan={11} style={{ padding: 0, border: 0, height: 0 }} />
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

      <OpportunityDetailDialog
        opportunity={selectedOpp}
        open={!!selectedOpp}
        onOpenChange={(open) => { if (!open) setSelectedOpp(null); }}
        stages={stages}
      />
    </>
  );
});
