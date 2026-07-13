// ============================================================================
// PreventiviCestinoDialog — cestino cross-modulo dei preventivi (30 giorni)
// ============================================================================
// L'eliminazione dalla lista è un soft delete (deleted_at): qui si vedono gli
// elementi cestinati con i giorni rimanenti e si possono ripristinare.
// Allo scadere dei 30 giorni il purge notturno (purge_cestino_preventivi,
// pg_cron 03:40) li elimina DEFINITIVAMENTE da Supabase.
// ============================================================================

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, differenceInCalendarDays, addDays } from "date-fns";
import { it } from "date-fns/locale";
import { ArchiveRestore, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TIPO_LABEL, type PreventivoTipo } from "./UnifiedPreventiviList";

/** tabella → (tipo, campo numero) per ricostruire le righe del cestino */
const CESTINO_SOURCES: Array<{ table: string; tipo: PreventivoTipo; numeroField: string }> = [
  { table: "quotes",        tipo: "classico",         numeroField: "quote_number" },
  { table: "sr_progetti",   tipo: "serramenti",       numeroField: "code" },
  { table: "fv_progetti",   tipo: "fotovoltaico",     numeroField: "numero" },
  { table: "rst_progetti",  tipo: "ristrutturazione", numeroField: "code" },
  { table: "bgn_progetti",  tipo: "bagni",            numeroField: "code" },
  { table: "tet_progetti",  tipo: "tetti",            numeroField: "code" },
  { table: "clm_progetti",  tipo: "climatizzazione",  numeroField: "code" },
  { table: "ele_progetti",  tipo: "elettrico",        numeroField: "code" },
  { table: "idr_progetti",  tipo: "termoidraulico",   numeroField: "code" },
  { table: "pav_progetti",  tipo: "pavimenti",        numeroField: "code" },
  { table: "pis_progetti",  tipo: "piscine",          numeroField: "code" },
];

interface CestinoRow {
  id: string;
  table: string;
  tipo: PreventivoTipo;
  numero: string;
  deleted_at: string;
}

export function PreventiviCestinoDialog({
  open,
  onOpenChange,
  companyId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
}) {
  const queryClient = useQueryClient();
  const [restoring, setRestoring] = useState<string | null>(null);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["preventivi-cestino", companyId],
    enabled: open && !!companyId,
    queryFn: async (): Promise<CestinoRow[]> => {
      const results = await Promise.all(
        CESTINO_SOURCES.map(async ({ table, tipo, numeroField }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data, error } = await (supabase as any)
            .from(table)
            .select(`id, ${numeroField}, deleted_at`)
            .eq("company_id", companyId!)
            .not("deleted_at", "is", null)
            .order("deleted_at", { ascending: false })
            .limit(200);
          // Tabella di un modulo non attivo / non migrata: la ignoriamo
          if (error) return [] as CestinoRow[];
          return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
            id: String(r.id),
            table,
            tipo,
            numero: String(r[numeroField] ?? "—"),
            deleted_at: String(r.deleted_at),
          }));
        }),
      );
      return results
        .flat()
        .sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
    },
  });

  const invalidateLists = () => {
    // Le liste attive filtrano deleted_at: basta invalidare i prefissi unified-prev-*
    queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("unified-prev") });
    queryClient.invalidateQueries({ queryKey: ["preventivi-cestino", companyId] });
  };

  const restore = async (row: CestinoRow) => {
    setRestoring(row.id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from(row.table)
        .update({ deleted_at: null })
        .eq("id", row.id)
        .eq("company_id", companyId);
      if (error) throw error;
      toast.success(`${row.numero} ripristinato`);
      invalidateLists();
      refetch();
    } catch (e) {
      toast.error("Ripristino non riuscito: " + (e as Error).message);
    } finally {
      setRestoring(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[80vh] !flex !flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-slate-500" />
            Cestino preventivi
          </DialogTitle>
          <DialogDescription>
            Gli elementi eliminati restano qui <strong>30 giorni</strong> e possono essere
            ripristinati. Allo scadere vengono <strong>eliminati definitivamente</strong> dal database.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="space-y-2 py-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Il cestino è vuoto.
            </div>
          ) : (
            <div className="space-y-1.5 py-1">
              {rows.map((row) => {
                const deletedDate = parseISO(row.deleted_at);
                const giorniRestanti = Math.max(
                  0,
                  differenceInCalendarDays(addDays(deletedDate, 30), new Date()),
                );
                const tipoMeta = TIPO_LABEL[row.tipo];
                return (
                  <div
                    key={`${row.table}-${row.id}`}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${tipoMeta.className}`}>
                      {tipoMeta.label}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{row.numero}</p>
                      <p className="text-[11px] text-muted-foreground">
                        eliminato il {format(deletedDate, "d MMM yyyy", { locale: it })} ·{" "}
                        <span className={giorniRestanti <= 5 ? "font-semibold text-red-600" : ""}>
                          {giorniRestanti === 0 ? "elimina stanotte" : `${giorniRestanti} giorni al definitivo`}
                        </span>
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0"
                      disabled={restoring !== null}
                      onClick={() => restore(row)}
                    >
                      {restoring === row.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <ArchiveRestore className="mr-1 h-3.5 w-3.5" /> Ripristina
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
