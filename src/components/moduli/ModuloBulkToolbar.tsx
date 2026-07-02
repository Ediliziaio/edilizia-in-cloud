/**
 * ModuloBulkToolbar — azioni in blocco per le liste preventivi dei moduli
 * (rst/tet/bgn/…). Compare quando ci sono righe selezionate. Azioni:
 *   - Cambia stato (bulk update della colonna `stato`)
 *   - Elimina (bulk delete, con conferma)
 *
 * Generico via `tableName`/`statoOptions`: una sola implementazione per tutti
 * gli 8 moduli. Le scritture sono scoped a `company_id` (difesa in profondità
 * oltre alla RLS) e riportano il conteggio REALE toccato.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { X, Trash2, Loader2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface StatoOption {
  value: string;
  label: string;
}

interface Props {
  tableName: string;
  companyId: string | null;
  selectedIds: Set<string>;
  statoOptions: StatoOption[];
  onClear: () => void;
  onDone: () => void;
}

export function ModuloBulkToolbar({
  tableName, companyId, selectedIds, statoOptions, onClear, onDone,
}: Props) {
  const [working, setWorking] = useState<null | "status" | "delete">(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<StatoOption | null>(null);
  const count = selectedIds.size;
  if (count === 0) return null;

  const ids = Array.from(selectedIds);

  const runStatus = async (opt: StatoOption) => {
    setPendingStatus(null);
    if (!companyId) { toast.error("Azienda non disponibile"); return; }
    setWorking("status");
    try {
      // (supabase as any): tableName dinamico non è nella union tipizzata.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from(tableName)
        .update({ stato: opt.value, updated_at: new Date().toISOString() })
        .eq("company_id", companyId)
        .in("id", ids)
        .select("id");
      if (error) throw error;
      const n = data?.length ?? 0;
      toast.success(`${n} ${n === 1 ? "preventivo aggiornato" : "preventivi aggiornati"} → “${opt.label}”`);
      onDone();
    } catch (e) {
      toast.error("Errore cambio stato: " + (e as Error).message);
    } finally {
      setWorking(null);
    }
  };

  const runDelete = async () => {
    if (!companyId) { toast.error("Azienda non disponibile"); setConfirmDelete(false); return; }
    setWorking("delete");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from(tableName)
        .delete()
        .eq("company_id", companyId)
        .in("id", ids)
        .select("id");
      if (error) throw error;
      const n = data?.length ?? 0;
      if (n === 0) toast.warning("Nessun preventivo eliminato (permessi o già rimossi)");
      else toast.success(`${n} ${n === 1 ? "preventivo eliminato" : "preventivi eliminati"}`);
      onDone();
    } catch (e) {
      toast.error("Errore eliminazione: " + (e as Error).message);
    } finally {
      setWorking(null);
      setConfirmDelete(false);
    }
  };

  return (
    <>
      <div className="sticky top-14 z-40 mb-2 bg-slate-900/95 text-slate-50 rounded-xl shadow-2xl ring-1 ring-white/10 backdrop-blur-md px-3 py-2 flex items-center gap-2 flex-wrap">
        <Button
          size="icon" variant="ghost"
          className="h-8 w-8 text-slate-50 hover:bg-white/10 rounded-full"
          onClick={onClear} aria-label="Deseleziona tutto"
        >
          <X className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 text-sm font-medium pr-2">
          <span className="inline-flex items-center justify-center h-6 min-w-6 px-2 rounded-full bg-white text-slate-900 text-xs font-bold tabular-nums">
            {count}
          </span>
          <span className="text-slate-200">{count === 1 ? "selezionato" : "selezionati"}</span>
        </div>

        <div className="flex-1" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" disabled={!!working} className="h-8 text-slate-50 hover:bg-white/10 gap-1">
              {working === "status" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Cambia stato
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Imposta stato a</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {statoOptions.map((s) => (
              <DropdownMenuItem key={s.value} onClick={() => setPendingStatus(s)}>
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="h-6 w-px bg-white/20 mx-1" />

        <Button
          size="sm" variant="ghost"
          onClick={() => setConfirmDelete(true)}
          disabled={!!working}
          className="h-8 text-red-300 hover:bg-red-500/20 hover:text-red-100 gap-1.5"
        >
          {working === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Elimina
        </Button>
      </div>

      <AlertDialog open={!!pendingStatus} onOpenChange={(o) => !o && setPendingStatus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambia stato a “{pendingStatus?.label}”</AlertDialogTitle>
            <AlertDialogDescription>
              Imposti lo stato di {count} {count === 1 ? "preventivo" : "preventivi"} selezionati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingStatus && runStatus(pendingStatus)}>
              Conferma
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina {count} {count === 1 ? "preventivo" : "preventivi"}</AlertDialogTitle>
            <AlertDialogDescription>
              L'azione è <strong>irreversibile</strong> e rimuove anche il computo e i dati
              collegati. Procedere?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={runDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
