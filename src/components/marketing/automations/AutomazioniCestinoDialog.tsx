// Cestino delle automazioni (19/09/2026). «Elimina» porta qui, sempre: il
// 19/09 due clic su «Elimina selezionati» hanno cancellato 20 automazioni del
// super admin, senza copia. Nel cestino l'automazione è ferma (i passi in coda
// e le iscrizioni sono in pausa); ripristinata, riparte com'era. Lo stato lo
// rimette il database (trigger automazione_cestino_stato), non questa schermata.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { ArchiveRestore, Loader2, Search, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { filtraCestinoAutomazioni, statoPrimaLeggibile, type AutomazioneNelCestino } from "@/lib/automazioniCestino";

const LIMITE = 300;

function quando(iso: string): string {
  try {
    return format(parseISO(iso), "d MMM yyyy 'alle' HH:mm", { locale: it });
  } catch {
    return "";
  }
}

export function AutomazioniCestinoDialog({
  open,
  onOpenChange,
  companyId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | undefined;
}) {
  const qc = useQueryClient();
  const [cerca, setCerca] = useState("");
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [daEliminare, setDaEliminare] = useState<AutomazioneNelCestino | null>(null);

  const { data: righe = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["automation-cestino", companyId],
    enabled: open && !!companyId,
    queryFn: async (): Promise<AutomazioneNelCestino[]> => {
      const { data, error } = await supabase
        .from("automation_flows")
        .select("id, name, deleted_at, deleted_by, stato_prima_eliminazione")
        .eq("company_id", companyId!)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(LIMITE);
      if (error) throw error;
      const autori = [...new Set((data ?? []).map((r) => r.deleted_by).filter(Boolean))] as string[];
      const nomi = new Map<string, string>();
      if (autori.length > 0) {
        const { data: profili } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", autori);
        for (const p of profili ?? []) {
          nomi.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(" ").trim());
        }
      }
      return (data ?? []).map((r) => ({
        id: r.id,
        nome: r.name,
        eliminataIl: r.deleted_at as string,
        eliminataDa: r.deleted_by ? nomi.get(r.deleted_by) || null : null,
        statoPrima: r.stato_prima_eliminazione,
      }));
    },
  });

  const aggiorna = () => {
    void qc.invalidateQueries({ queryKey: ["automation-cestino"] });
    void qc.invalidateQueries({ queryKey: ["automation-flows"] });
    void qc.invalidateQueries({ queryKey: ["automation-overview-stats"] });
    void qc.invalidateQueries({ queryKey: ["automation-node-summaries"] });
    void qc.invalidateQueries({ queryKey: ["automation-enrollment-counts"] });
  };

  const ripristina = useMutation({
    mutationFn: async (riga: AutomazioneNelCestino) => {
      const { error } = await supabase
        .from("automation_flows")
        .update({ deleted_at: null })
        .eq("id", riga.id)
        .eq("company_id", companyId!);
      if (error) throw error;
      return riga;
    },
    onSuccess: (riga) => {
      aggiorna();
      toast({ title: "Automazione ripristinata", description: `«${riga.nome}» è di nuovo ${statoPrimaLeggibile(riga.statoPrima)}.` });
    },
    onError: (err: Error) => toast({ title: "Ripristino non riuscito", description: err.message, variant: "destructive" }),
    onSettled: () => setInCorso(null),
  });

  const eliminaDefinitivamente = useMutation({
    mutationFn: async (riga: AutomazioneNelCestino) => {
      const { data, error } = await supabase.rpc("automazione_elimina_definitivamente", { p_flow_id: riga.id });
      if (error) throw error;
      if (data !== true) throw new Error("L'automazione non c'è più o non puoi eliminarla.");
      return riga;
    },
    onSuccess: (riga) => {
      aggiorna();
      toast({ title: "Eliminata definitivamente", description: `«${riga.nome}» non si può più recuperare.` });
    },
    onError: (err: Error) => toast({ title: "Eliminazione non riuscita", description: err.message, variant: "destructive" }),
    onSettled: () => { setInCorso(null); setDaEliminare(null); },
  });

  const visibili = useMemo(() => filtraCestinoAutomazioni(righe, cerca), [righe, cerca]);
  const occupato = ripristina.isPending || eliminaDefinitivamente.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[640px] max-h-[80vh] !flex !flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-muted-foreground" />
              Cestino automazioni
            </DialogTitle>
            <DialogDescription>
              Le automazioni eliminate restano qui, ferme, finché qualcuno non le ripristina.
              Ripristinate ripartono com'erano, con i contatti che stavano seguendo.
            </DialogDescription>
          </DialogHeader>

          {righe.length > 5 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={cerca}
                onChange={(e) => setCerca(e.target.value)}
                placeholder="Cerca per nome o per chi l'ha eliminata"
                className="h-9 pl-8 text-sm"
                aria-label="Cerca nel cestino"
              />
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            {isLoading ? (
              <div className="space-y-2 py-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                Il cestino non si è caricato.
                <Button size="sm" variant="outline" onClick={() => refetch()}>Riprova</Button>
              </div>
            ) : visibili.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {righe.length === 0 ? "Il cestino è vuoto." : "Nessuna automazione del cestino corrisponde alla ricerca."}
              </div>
            ) : (
              <ul className="space-y-1.5 py-1">
                {visibili.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.nome}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Eliminata il {quando(r.eliminataIl)}
                        {r.eliminataDa && <> da <span className="font-medium text-foreground">{r.eliminataDa}</span></>}
                        {r.statoPrima && <> · era {statoPrimaLeggibile(r.statoPrima)}</>}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0"
                      disabled={occupato}
                      onClick={() => { setInCorso(r.id); ripristina.mutate(r); }}
                    >
                      {ripristina.isPending && inCorso === r.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <><ArchiveRestore className="mr-1 h-3.5 w-3.5" /> Ripristina</>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 shrink-0 text-destructive hover:text-destructive"
                      disabled={occupato}
                      onClick={() => setDaEliminare(r)}
                      aria-label={`Elimina definitivamente ${r.nome}`}
                      title="Elimina definitivamente"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {righe.length >= LIMITE && (
            <p className="text-[11px] text-muted-foreground">Qui ci sono le ultime {LIMITE} eliminate.</p>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!daEliminare} onOpenChange={(o) => !o && !eliminaDefinitivamente.isPending && setDaEliminare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare per sempre «{daEliminare?.nome}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Spariscono anche i passaggi, i collegamenti e lo storico dei contatti che la stavano seguendo.
              Questa volta non si torna indietro. I contatti restano.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminaDefinitivamente.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={eliminaDefinitivamente.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (daEliminare) { setInCorso(daEliminare.id); eliminaDefinitivamente.mutate(daEliminare); }
              }}
            >
              {eliminaDefinitivamente.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Elimina per sempre"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
