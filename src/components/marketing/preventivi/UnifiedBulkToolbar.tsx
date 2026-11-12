/**
 * UnifiedBulkToolbar — azioni in blocco per la lista Preventivi CROSS-MODULO.
 *
 * Ogni riga vive in una tabella diversa (quotes / sr_progetti / fv_progetti /
 * <mod>_progetti): la delete raggruppa i selezionati per tipo e cancella
 * tabella per tabella, sommando il conteggio REALE.
 *
 * Chi elimina (12/11/2026): chi può modificare i preventivi, non solo l'amministratore. Si sposta
 * nel cestino, recuperabile 30 giorni; i computi, che il cestino non l'hanno, si eliminano
 * definitivamente dopo la conferma. Prima nessuno poteva togliere un computo creato per sbaglio.
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
import { chiaveBozzaComputo } from "@/lib/computo/editorNativo";
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

/**
 * Elimina i computi: la bozza salvata nel gestionale e, se c'è, la copia su questo computer (che
 * altrimenti ricomparirebbe in elenco come «solo su questo PC»). Conta quelli spariti davvero.
 */
export async function eliminaComputi(ids: string[], companyId: string, userId: string | null | undefined, storage: Pick<Storage, "getItem" | "removeItem"> | null = typeof localStorage === "undefined" ? null : localStorage): Promise<{ deleted: number; errors: string[] }> {
  if (!ids.length) return { deleted: 0, errors: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  // Quali sono nel gestionale: gli altri esistono solo su questo computer.
  const prima = await db.from("computo_preventivo_drafts").select("id").eq("company_id", companyId).in("id", ids);
  if (prima.error) return { deleted: 0, errors: [prima.error.message] };
  const nelGestionale = new Set(((prima.data ?? []) as Array<{ id: string }>).map((r) => r.id));
  const { data, error } = nelGestionale.size
    ? await db.from("computo_preventivo_drafts").delete().eq("company_id", companyId).in("id", [...nelGestionale]).select("id")
    : { data: [], error: null };
  if (error) return { deleted: 0, errors: [error.message] };
  const tolti = new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
  if (userId && storage) {
    for (const id of ids) {
      const chiave = chiaveBozzaComputo(companyId, userId, `preventivo:${id}`);
      try {
        // La copia locale si toglie solo se la bozza del gestionale è sparita o non c'era mai.
        if (storage.getItem(chiave) !== null && (tolti.has(id) || !nelGestionale.has(id))) { storage.removeItem(chiave); tolti.add(id); }
      } catch { /* senza accesso al computer resta la copia locale: la si toglie dall'editor */ }
    }
  }
  return { deleted: tolti.size, errors: [] };
}

export function UnifiedBulkToolbar({ selectedRows, companyId, onClear, onDone, puoModificare = false }: Props) {
  const { role, user } = useAuth();
  const canDelete = role === "super_admin" || role === "company_admin" || puoModificare;
  const [working, setWorking] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [confermaPersi, setConfermaPersi] = useState(false);
  const count = selectedRows.length;
  if (count === 0) return null;
  const valoreSelezionati = selectedRows.reduce((t, r) => t + (r.totale != null && r.totale > 0 ? r.totale : 0), 0);
  // I computi non hanno cestino: si contano a parte e si dice che restano, invece di saltarli in silenzio.
  const daSpostare = selectedRows.filter((r) => TIPO_TABLE[r.tipo]);
  const computi = selectedRows.filter((r) => r.tipo === "computo");
  const nComputi = computi.length;
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
    if (!canDelete) { toast.error("Non hai i permessi per eliminare i preventivi. Chiedi al titolare dell'azienda di darti l'accesso."); setConfirm(false); return; }
    setWorking(true);
    try {
      const cestino = await spostaNelCestino(daSpostare, companyId);
      const eliminati = await eliminaComputi(computi.map((r) => r.id), companyId, user?.id);
      const errors = [...cestino.errors, ...eliminati.errors];
      const mancanti = (n - cestino.deleted) + (nComputi - eliminati.deleted);
      if (errors.length) {
        toast.error(`Alcune eliminazioni non riuscite (${errors.length}). ${cestino.deleted + eliminati.deleted} rimossi.`);
      } else if (mancanti > 0) {
        toast.warning(`${mancanti} ${mancanti === 1 ? "non eliminato" : "non eliminati"}: non hai i permessi su ${mancanti === 1 ? "questo" : "questi"}. Chiedi al titolare dell'azienda di darti l'accesso.`);
      } else {
        const parti = [
          cestino.deleted ? `${cestino.deleted} ${cestino.deleted === 1 ? "preventivo spostato" : "preventivi spostati"} nel cestino — recuperabili per 30 giorni` : null,
          eliminati.deleted ? `${eliminati.deleted} ${eliminati.deleted === 1 ? "computo eliminato" : "computi eliminati"}` : null,
        ].filter(Boolean);
        toast.success(parti.join(" · "));
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
          <span className="text-xs text-slate-300">Eliminare: serve il permesso di modificare i preventivi</span>
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
              {n > 0 && nComputi > 0 ? `Elimina ${n + nComputi} preventivi` : n > 0 ? `Sposta nel cestino ${n} ${n === 1 ? "preventivo" : "preventivi"}` : `Elimina ${nComputi} ${nComputi === 1 ? "computo" : "computi"}`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {n > 0 && <>
                {n === 1 ? "Il preventivo sparisce" : "I preventivi spariscono"} dalla lista e
                {n === 1 ? " resta recuperabile" : " restano recuperabili"} dal Cestino per 30 giorni.
                Dopo, l'eliminazione è definitiva.
              </>}
              {nComputi > 0 && <>
                {n > 0 && " "}
                {nComputi === 1 ? "Il computo selezionato si elimina" : `I ${nComputi} computi selezionati si eliminano`} definitivamente:
                i computi non hanno il cestino e non si recuperano. Il preventivo firmato, se c'è, resta.
              </>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={runDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {nComputi > 0 ? "Elimina" : "Sposta nel cestino"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
