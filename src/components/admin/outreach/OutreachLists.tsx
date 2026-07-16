import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListChecks, Tag, Loader2, Layers, Hash, Mail, AlertTriangle } from "lucide-react";
import { OutreachEnrollListDialog } from "./OutreachEnrollListDialog";
import { OutreachListContactsDialog } from "./OutreachListContactsDialog";

/**
 * Le tue liste — contatti raggruppati per tag (= lista) + breakdown per
 * sorgente. Conteggi ESATTI via RPC outreach_tag_counts (server-side su tutto
 * il dataset): prima si raggruppava un campione da 1000 righe (PostgREST
 * max-rows) e badge/righe erano il campione, non il totale reale. Per ogni
 * lista mostriamo anche quanti sono realmente CONTATTABILI (email + no opt-out).
 */

interface ListItem { tag: string; total: number; email: number; contactable: number; }
interface TagCounts {
  total: number;
  total_email: number;
  total_contactable: number;
  untagged: number;
  untagged_email: number;
  lists: ListItem[];
  sources: { source: string; total: number }[];
}

export function OutreachLists({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["outreach-lists", companyId],
    staleTime: 60_000,
    retry: 2,
    retryDelay: (a) => Math.min(1000 * 2 ** a, 8000),
    queryFn: async (): Promise<TagCounts> => {
      // RPC non nei tipi generati → cast
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("outreach_tag_counts", { p_company_id: companyId });
      if (error) throw error;
      const d = (data ?? {}) as Partial<TagCounts>;
      return {
        total: d.total ?? 0,
        total_email: d.total_email ?? 0,
        total_contactable: d.total_contactable ?? 0,
        untagged: d.untagged ?? 0,
        untagged_email: d.untagged_email ?? 0,
        lists: (d.lists ?? []).map((l) => ({
          tag: l.tag, total: Number(l.total) || 0,
          email: Number(l.email) || 0, contactable: Number(l.contactable) || 0,
        })),
        sources: (d.sources ?? []).map((s) => ({ source: s.source, total: Number(s.total) || 0 })),
      };
    },
  });

  const d = q.data;
  const fmt = (n: number) => n.toLocaleString("it-IT");
  const maxList = d ? Math.max(1, ...d.lists.map((l) => l.total), d.untagged) : 1;

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      {/* header */}
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ListChecks className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-tight">Le tue liste</h3>
          <p className="text-xs text-muted-foreground">Contatti raggruppati per tag</p>
        </div>
        {d && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant="secondary" className="gap-1 font-normal tabular-nums" title="Contatti totali">
              <Layers className="h-3 w-3" />{fmt(d.total)}
            </Badge>
            <Badge variant="outline" className="gap-1 font-normal tabular-nums text-emerald-600" title="Con email e senza opt-out">
              <Mail className="h-3 w-3" />{fmt(d.total_contactable)}
            </Badge>
          </div>
        )}
      </header>

      <div className="p-4">
        {q.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : q.isError ? (
          <div className="rounded-lg border border-dashed border-red-300 bg-red-50/50 px-4 py-10 text-center dark:bg-red-950/10">
            <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/40">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium">Impossibile caricare le liste</p>
            <p className="mt-1 text-xs text-muted-foreground">Riprova tra un istante.</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => q.refetch()}>Riprova</Button>
          </div>
        ) : !d || (d.lists.length === 0 && d.untagged === 0) ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
            <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Tag className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium">Nessuna lista ancora</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Importa un CSV con un tag di lista per crearne una.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* righe lista — clic apre i contatti; contattabili accanto al totale */}
            <div className="overflow-hidden rounded-lg border border-border">
              <ListRows lists={d.lists} maxList={maxList} companyId={companyId} fmt={fmt} />
              {d.untagged > 0 && (
                <div className={`flex items-center gap-3 px-3 py-2.5 text-muted-foreground ${d.lists.length > 0 ? "border-t border-border" : ""}`}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">Senza lista</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{fmt(d.untagged)}</span>
                </div>
              )}
            </div>

            {/* legenda barra due toni */}
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500/80" /> contattabili via email
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary/25" /> senza email / opt-out
              </span>
            </div>

            {/* breakdown sorgente — solo le rilevanti; la coda lunga di sorgenti
                minime (test, form una-tantum…) si collassa in "+N altre" per
                togliere rumore. */}
            <SourceBreakdown sources={d.sources} fmt={fmt} />
          </div>
        )}
      </div>
    </section>
  );
}

const SOURCE_MIN = 10;   // sotto questa soglia la sorgente finisce in "altre"
const SOURCE_TOP = 8;    // massimo chip mostrati

function SourceBreakdown({ sources, fmt }: { sources: { source: string; total: number }[]; fmt: (n: number) => string }) {
  const [showAll, setShowAll] = useState(false);
  const sorted = [...sources].sort((a, b) => b.total - a.total);
  const significant = sorted.filter((s) => s.total >= SOURCE_MIN).slice(0, SOURCE_TOP);
  const shownSet = new Set(significant.map((s) => s.source));
  const rest = sorted.filter((s) => !shownSet.has(s.source));
  const restTotal = rest.reduce((a, s) => a + s.total, 0);
  const visible = showAll ? sorted : significant;

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Hash className="h-3 w-3" /> Per sorgente
      </p>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((s) => (
          <span key={s.source} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs">
            <span className="font-medium text-foreground">{s.source}</span>
            <span className="tabular-nums text-muted-foreground">{fmt(s.total)}</span>
          </span>
        ))}
        {!showAll && rest.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            title={`Mostra le altre ${rest.length} sorgenti minori`}
          >
            +{rest.length} altre <span className="tabular-nums">({fmt(restTotal)})</span>
          </button>
        )}
        {showAll && rest.length > 0 && (
          <button type="button" onClick={() => setShowAll(false)} className="inline-flex items-center rounded-md px-2 py-1 text-xs text-primary hover:underline">
            mostra meno
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Righe delle liste (una per tag). A scala il numero di tag è alto (~200):
 * oltre VIRTUALIZE_AT virtualizziamo dentro un'area scrollabile capped, sotto
 * soglia render piatto. Stessa riga (`ListRow`) in entrambi i rami (DRY).
 */
const VIRTUALIZE_AT = 40;
const LIST_ROW_H = 51;

function ListRows({
  lists, maxList, companyId, fmt,
}: {
  lists: ListItem[];
  maxList: number;
  companyId: string;
  fmt: (n: number) => string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: lists.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => LIST_ROW_H,
    overscan: 8,
    getItemKey: (i) => lists[i]?.tag ?? i,
  });

  if (lists.length <= VIRTUALIZE_AT) {
    return (
      <>
        {lists.map((l, i) => (
          <ListRow key={l.tag} l={l} maxList={maxList} companyId={companyId} fmt={fmt} bordered={i > 0} />
        ))}
      </>
    );
  }

  return (
    <div ref={parentRef} className="overflow-y-auto" style={{ maxHeight: LIST_ROW_H * 10 }}>
      <div className="relative" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((v) => {
          const l = lists[v.index];
          return (
            <div
              key={v.key}
              data-index={v.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${v.start}px)` }}
            >
              <ListRow l={l} maxList={maxList} companyId={companyId} fmt={fmt} bordered={v.index > 0} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListRow({
  l, maxList, companyId, fmt, bordered,
}: {
  l: ListItem;
  maxList: number;
  companyId: string;
  fmt: (n: number) => string;
  bordered: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pct = Math.round((l.total / maxList) * 100);
  // Quota contattabili DENTRO la barra (due toni): verde = con email e senza
  // opt-out, chiaro = il resto. A colpo d'occhio si vede quanto della lista è
  // davvero lavorabile via email (stile analytics Instantly).
  const contactablePct = l.total > 0 ? Math.round((l.contactable / l.total) * 100) : 0;

  return (
    <>
      <div className={`group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50 ${bordered ? "border-t border-border" : ""}`}>
        {/* area cliccabile → drill-down contatti */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          title={`Vedi i contatti della lista "${l.tag}" — ${contactablePct}% contattabile via email`}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Tag className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium leading-tight group-hover:text-primary">{l.tag}</div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="flex h-full overflow-hidden rounded-full" style={{ width: `${pct}%` }}>
                <span className="h-full bg-emerald-500/80" style={{ width: `${contactablePct}%` }} />
                <span className="h-full flex-1 bg-primary/25" />
              </div>
            </div>
          </div>
        </button>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold tabular-nums text-foreground">{fmt(l.total)}</div>
          <div className="text-[11px] tabular-nums text-emerald-600" title="Contattabili: con email e senza opt-out">
            {fmt(l.contactable)} <Mail className="inline h-2.5 w-2.5" />
          </div>
        </div>
        <OutreachEnrollListDialog companyId={companyId} tag={l.tag} count={l.total} contactable={l.contactable} />
      </div>
      {open && (
        <OutreachListContactsDialog
          open={open}
          onOpenChange={setOpen}
          companyId={companyId}
          tag={l.tag}
          total={l.total}
          contactable={l.contactable}
        />
      )}
    </>
  );
}
