/**
 * UnifiedBulkToolbar — azioni in blocco per la lista Preventivi CROSS-MODULO.
 *
 * Ogni riga vive in una tabella diversa (quotes / sr_progetti / fv_progetti /
 * <mod>_progetti): la delete raggruppa i selezionati per tipo e cancella
 * tabella per tabella, sommando il conteggio REALE. Gate su admin/super-admin
 * (coerente con la RLS q_del di quotes; per i moduli la RLS è per-azienda ma
 * uniformiamo la UI: elimina solo chi ha davvero il potere ovunque).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { X, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { UnifiedRow, PreventivoTipo } from "./UnifiedPreventiviList";

/** tipo preventivo → tabella su cui eseguire delete/update. */
const TIPO_TABLE: Record<PreventivoTipo, string> = {
  classico: "quotes",
  serramenti: "sr_progetti",
  fotovoltaico: "fv_progetti",
  ristrutturazione: "rst_progetti",
  bagni: "bgn_progetti",
  tetti: "tet_progetti",
  climatizzazione: "clm_progetti",
  elettrico: "ele_progetti",
  termoidraulico: "idr_progetti",
  pavimenti: "pav_progetti",
  piscine: "pis_progetti",
};

interface Props {
  selectedRows: UnifiedRow[];
  companyId: string | null;
  onClear: () => void;
  onDone: () => void;
}

export function UnifiedBulkToolbar({ selectedRows, companyId, onClear, onDone }: Props) {
  const { role } = useAuth();
  const canDelete = role === "super_admin" || role === "company_admin";
  const [working, setWorking] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const count = selectedRows.length;
  if (count === 0) return null;

  const runDelete = async () => {
    if (!companyId) { toast.error("Azienda non disponibile"); setConfirm(false); return; }
    if (!canDelete) { toast.error("Solo un amministratore può eliminare i preventivi"); setConfirm(false); return; }
    setWorking(true);
    try {
      // Raggruppa gli id selezionati per tabella di appartenenza.
      const byTable = new Map<string, string[]>();
      for (const r of selectedRows) {
        const tbl = TIPO_TABLE[r.tipo];
        if (!tbl) continue;
        if (!byTable.has(tbl)) byTable.set(tbl, []);
        byTable.get(tbl)!.push(r.id);
      }
      let deleted = 0;
      const errors: string[] = [];
      for (const [tbl, ids] of byTable) {
        // Soft delete → Cestino: recuperabile 30 giorni, poi il purge notturno
        // (purge_cestino_preventivi) elimina DAVVERO da Supabase. Il DELETE
        // fisico qui falliva anche per le FK NO ACTION (es. fv_eventi).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from(tbl)
          .update({ deleted_at: new Date().toISOString() })
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .in("id", ids)
          .select("id");
        if (error) errors.push(`${tbl}: ${error.message}`);
        else deleted += data?.length ?? 0;
      }
      if (errors.length) {
        toast.error(`Alcune eliminazioni non riuscite (${errors.length}). ${deleted} rimossi.`);
      } else if (deleted === 0) {
        toast.warning("Nessun preventivo eliminato (permessi insufficienti o già rimossi)");
      } else {
        toast.success(`${deleted} ${deleted === 1 ? "preventivo spostato" : "preventivi spostati"} nel cestino — recuperabili per 30 giorni`);
      }
      onDone();
    } catch (e) {
      toast.error("Errore eliminazione: " + (e as Error).message);
    } finally {
      setWorking(false);
      setConfirm(false);
    }
  };

  return (
    <>
      <div className="sticky top-14 z-40 mb-2 bg-slate-900/95 text-slate-50 rounded-xl shadow-2xl ring-1 ring-white/10 backdrop-blur-md px-3 py-2 flex items-center gap-2 flex-wrap">
        <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-50 hover:bg-white/10 rounded-full" onClick={onClear} aria-label="Deseleziona tutto">
          <X className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 text-sm font-medium pr-2">
          <span className="inline-flex items-center justify-center h-6 min-w-6 px-2 rounded-full bg-white text-slate-900 text-xs font-bold tabular-nums">{count}</span>
          <span className="text-slate-200">{count === 1 ? "selezionato" : "selezionati"}</span>
        </div>
        <div className="flex-1" />
        {canDelete && (
          <Button
            size="sm" variant="ghost"
            onClick={() => setConfirm(true)}
            disabled={working}
            className="h-8 text-red-300 hover:bg-red-500/20 hover:text-red-100 gap-1.5"
          >
            {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Elimina
          </Button>
        )}
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sposta nel cestino {count} {count === 1 ? "preventivo" : "preventivi"}</AlertDialogTitle>
            <AlertDialogDescription>
              {count === 1 ? "Il preventivo sparisce" : "I preventivi spariscono"} dalla lista e
              {count === 1 ? " resta recuperabile" : " restano recuperabili"} dal Cestino per 30 giorni.
              Dopo, l'eliminazione è definitiva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={runDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sposta nel cestino
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
