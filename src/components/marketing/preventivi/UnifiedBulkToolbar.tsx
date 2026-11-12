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
import { X, Trash2, Loader2, Ban } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";
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
  // I computi non hanno cestino: si aprono e si gestiscono dal loro editor.
  computo: "",
};

interface Props {
  selectedRows: UnifiedRow[];
  companyId: string | null;
  onClear: () => void;
  onDone: () => void;
  /** Chi può modificare i preventivi può anche segnarli come persi. */
  puoModificare?: boolean;
}

/**
 * Sposta nel Cestino (soft delete) le righe date, tabella per tabella, e
 * restituisce il conteggio REALE. Usata dalla barra delle azioni di massa e dal
 * menu della singola riga.
 */
export async function spostaNelCestino(rows: UnifiedRow[], companyId: string): Promise<{ deleted: number; errors: string[] }> {
  // Raggruppa gli id selezionati per tabella di appartenenza.
  const byTable = new Map<string, string[]>();
  for (const r of rows) {
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
  return { deleted, errors };
}

/**
 * «Segna come persi» (12/11/2026): il preventivo resta, ma esce dalla trattativa.
 * Ogni modulo ha la sua parola: «rifiutata» per il preventivo classico, «rifiutato» per i
 * preventivatori, «annullato» per il fotovoltaico. Nell'elenco finiscono tutti tra i «Persi».
 * I vinti non si toccano (sono contratti) e nemmeno i computi, che non hanno uno stato.
 */
const STATO_PERSO: Partial<Record<PreventivoTipo, { colonna: "status" | "stato"; valore: string }>> = {
  classico: { colonna: "status", valore: "rifiutata" },
  serramenti: { colonna: "stato", valore: "rifiutato" },
  fotovoltaico: { colonna: "stato", valore: "annullato" },
  ristrutturazione: { colonna: "stato", valore: "rifiutato" },
  bagni: { colonna: "stato", valore: "rifiutato" },
  tetti: { colonna: "stato", valore: "rifiutato" },
  climatizzazione: { colonna: "stato", valore: "rifiutato" },
  elettrico: { colonna: "stato", valore: "rifiutato" },
  termoidraulico: { colonna: "stato", valore: "rifiutato" },
  pavimenti: { colonna: "stato", valore: "rifiutato" },
  piscine: { colonna: "stato", valore: "rifiutato" },
};

/** Le righe che si possono segnare come perse: non vinte, non già perse, con uno stato. */
export function righeDaSegnarePerse(rows: UnifiedRow[]): UnifiedRow[] {
  return rows.filter((r) => STATO_PERSO[r.tipo] && r.stato_unif !== "vinto" && r.stato_unif !== "perso");
}

export async function segnaComePersi(rows: UnifiedRow[], companyId: string): Promise<{ aggiornati: number; errors: string[] }> {
  const gruppi = new Map<string, { colonna: string; valore: string; ids: string[] }>();
  for (const r of righeDaSegnarePerse(rows)) {
    const regola = STATO_PERSO[r.tipo]!;
    const tbl = TIPO_TABLE[r.tipo];
    const chiave = `${tbl}:${regola.colonna}:${regola.valore}`;
    if (!gruppi.has(chiave)) gruppi.set(chiave, { colonna: regola.colonna, valore: regola.valore, ids: [] });
    gruppi.get(chiave)!.ids.push(r.id);
  }
  let aggiornati = 0;
  const errors: string[] = [];
  for (const [chiave, g] of gruppi) {
    const tbl = chiave.split(":")[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from(tbl)
      .update({ [g.colonna]: g.valore })
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .in("id", g.ids)
      .select("id");
    if (error) errors.push(`${tbl}: ${error.message}`);
    else aggiornati += data?.length ?? 0;
  }
  return { aggiornati, errors };
}

export function UnifiedBulkToolbar({ selectedRows, companyId, onClear, onDone, puoModificare = false }: Props) {
  const { role } = useAuth();
  const canDelete = role === "super_admin" || role === "company_admin";
  const [working, setWorking] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [confermaPersi, setConfermaPersi] = useState(false);
  const count = selectedRows.length;
  if (count === 0) return null;
  const valoreSelezionati = selectedRows.reduce((t, r) => t + (r.totale != null && r.totale > 0 ? r.totale : 0), 0);
  // I computi non hanno cestino: si contano a parte e si dice che restano, invece di saltarli in silenzio.
  const daSpostare = selectedRows.filter((r) => TIPO_TABLE[r.tipo]);
  const computiEsclusi = count - daSpostare.length;
  const n = daSpostare.length;
  const daSegnare = righeDaSegnarePerse(selectedRows);
  const nPersi = daSegnare.length;
  const vintiEsclusi = selectedRows.filter((r) => r.stato_unif === "vinto").length;

  const runPersi = async () => {
    if (!companyId) { toast.error("Azienda non disponibile"); setConfermaPersi(false); return; }
    setWorking(true);
    try {
      const { aggiornati, errors } = await segnaComePersi(daSegnare, companyId);
      if (errors.length) toast.error(`Non sono riuscito a segnarne ${errors.length === 1 ? "uno" : "alcuni"}. ${aggiornati} segnati come persi.`);
      else if (aggiornati === 0) toast.warning("Nessun preventivo cambiato (permessi insufficienti o già persi)");
      else toast.success(`${aggiornati} ${aggiornati === 1 ? "preventivo segnato come perso" : "preventivi segnati come persi"}: li trovi nella scheda «Persi»`);
      onDone();
    } catch (e) {
      toast.error("Non sono riuscito a segnarli come persi: " + (e as Error).message);
    } finally {
      setWorking(false);
      setConfermaPersi(false);
    }
  };

  const runDelete = async () => {
    if (!companyId) { toast.error("Azienda non disponibile"); setConfirm(false); return; }
    if (!canDelete) { toast.error("Solo un amministratore può eliminare i preventivi"); setConfirm(false); return; }
    setWorking(true);
    try {
      const { deleted, errors } = await spostaNelCestino(daSpostare, companyId);
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
          {/* Quanto valgono, insieme (31/10/2026). */}
          {valoreSelezionati > 0 && <span className="tabular-nums text-slate-300">· {formatCurrency(valoreSelezionati)}</span>}
        </div>
        <div className="flex-1" />
        {puoModificare && nPersi > 0 && (
          <Button
            size="sm" variant="ghost"
            onClick={() => setConfermaPersi(true)}
            disabled={working}
            className="h-8 text-slate-100 hover:bg-white/10 gap-1.5"
          >
            <Ban className="h-3.5 w-3.5" />
            Segna come persi
          </Button>
        )}
        {!canDelete && (
          <span className="text-xs text-slate-300">Eliminare: solo un amministratore</span>
        )}
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

      <AlertDialog open={confermaPersi} onOpenChange={setConfermaPersi}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Segna come persi {nPersi} {nPersi === 1 ? "preventivo" : "preventivi"}</AlertDialogTitle>
            <AlertDialogDescription>
              {nPersi === 1 ? "Esce" : "Escono"} dalla trattativa e {nPersi === 1 ? "va" : "vanno"} nella scheda «Persi»:
              {nPersi === 1 ? " resta consultabile" : " restano consultabili"} e non si cancella niente.
              {vintiEsclusi > 0 && <> {vintiEsclusi === 1 ? "Il preventivo vinto selezionato resta com'è" : `I ${vintiEsclusi} preventivi vinti selezionati restano come sono`}: è un contratto.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Indietro</AlertDialogCancel>
            <AlertDialogAction onClick={runPersi}>Segna come persi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {n > 0 ? `Sposta nel cestino ${n} ${n === 1 ? "preventivo" : "preventivi"}` : "I computi non vanno nel cestino"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {n > 0 && <>
                {n === 1 ? "Il preventivo sparisce" : "I preventivi spariscono"} dalla lista e
                {n === 1 ? " resta recuperabile" : " restano recuperabili"} dal Cestino per 30 giorni.
                Dopo, l'eliminazione è definitiva.
              </>}
              {computiEsclusi > 0 && <>
                {n > 0 && " "}
                {computiEsclusi === 1 ? "Il computo selezionato resta" : `I ${computiEsclusi} computi selezionati restano`} in elenco:
                si gestiscono dal loro editor.
              </>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{n > 0 ? "Annulla" : "Chiudi"}</AlertDialogCancel>
            {n > 0 && (
              <AlertDialogAction onClick={runDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Sposta nel cestino
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
