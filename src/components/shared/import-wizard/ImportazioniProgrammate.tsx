import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarClock, Download, Pause, Play, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { userErrorMessage } from "@/lib/userErrorMessage";
import { descriviProgrammazione, fineStimata, formatoData } from "@/lib/importazione/programmata";
import { annullaImportazione, testoAnnullamento } from "@/lib/importazione/registro";
import { csvRigheProgrammate, scaricaCsv, type RigaProgrammataFallita } from "./scaricaRighe";

interface Riga {
  id: string; nome_file: string | null; stato: "attiva" | "in_pausa" | "completata" | "annullata";
  totale: number; fatte: number; creati: number; aggiornati: number; saltati: number; errori: number;
  per_giro: number; ogni_minuti: number; inizio: string; prossimo_giro: string;
  fascia_da: string | null; fascia_a: string | null; giorni: number[]; ultimo_errore: string | null; updated_at: string;
}

const ora = (t: string | null) => (t ? t.slice(0, 5) : undefined);

/**
 * Le importazioni a scaglioni dell'azienda: quante righe sono entrate, quando finisce,
 * e i pulsanti per metterle in pausa, riprenderle o annullarle. Le concluse restano
 * visibili per una settimana, con le righe andate male da scaricare, poi spariscono.
 */
interface UltimaImportazione { id: string; nome_file: string | null; created_at: string; importazioni_registro_creati: { count: number }[] }

export function ImportazioniProgrammate({ companyId, oggetto, onAnnullata }: {
  companyId: string | undefined;
  oggetto: "contatti" | "opportunita";
  /** Dopo un annullamento: la pagina ricarica i suoi elenchi. */
  onAnnullata?: () => void;
}) {
  const queryClient = useQueryClient();
  const chiave = ["importazioni-programmate", companyId, oggetto];
  const { data: righe = [], dataUpdatedAt } = useQuery({
    queryKey: chiave,
    enabled: !!companyId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const settimana = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("importazioni_programmate")
        .select("id, nome_file, stato, totale, fatte, creati, aggiornati, saltati, errori, per_giro, ogni_minuti, inizio, prossimo_giro, fascia_da, fascia_a, giorni, ultimo_errore, updated_at")
        .eq("company_id", companyId).eq("oggetto", oggetto)
        .or(`stato.in.(attiva,in_pausa),updated_at.gte.${settimana}`)
        .neq("stato", "annullata")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Riga[];
    },
  });
  // L'ultima importazione fatta subito, nelle ultime 24 ore: si può ancora annullare con un clic.
  const chiaveUltima = ["importazione-ultima", companyId, oggetto];
  const { data: ultima } = useQuery({
    queryKey: chiaveUltima,
    enabled: !!companyId,
    queryFn: async () => {
      const ieri = new Date(Date.now() - 24 * 3600_000).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("importazioni_registro")
        .select("id, nome_file, created_at, importazioni_registro_creati(count)")
        .eq("company_id", companyId).eq("oggetto", oggetto).eq("programmata", false)
        .is("annullata_at", null).gte("created_at", ieri)
        .order("created_at", { ascending: false }).limit(1);
      if (error) return null;
      const r = ((data ?? []) as UltimaImportazione[])[0];
      return r && (r.importazioni_registro_creati?.[0]?.count ?? 0) > 0 ? r : null;
    },
  });
  const annulla = useMutation({
    mutationFn: (id: string) => annullaImportazione(supabase, id),
    onSuccess: (esito) => {
      toast.success(testoAnnullamento(esito));
      queryClient.invalidateQueries({ queryKey: chiave });
      queryClient.invalidateQueries({ queryKey: chiaveUltima });
      onAnnullata?.();
    },
    onError: (e) => toast.error(userErrorMessage(e, "Non sono riuscito ad annullare l'importazione")),
  });
  const chiediAnnulla = (id: string, testo: string) => { if (window.confirm(testo)) annulla.mutate(id); };

  const cambiaStato = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: Riga["stato"] }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("importazioni_programmate")
        .update({ stato, updated_at: new Date().toISOString(), ...(stato === "attiva" ? { prossimo_giro: new Date().toISOString() } : {}) })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.stato === "in_pausa" ? "Importazione in pausa" : v.stato === "attiva" ? "Importazione ripresa" : "Importazione annullata: le righe non ancora entrate non entreranno");
      queryClient.invalidateQueries({ queryKey: chiave });
    },
    onError: (e) => toast.error(userErrorMessage(e, "Non sono riuscito a cambiare l'importazione")),
  });

  const [scaricando, setScaricando] = useState<string | null>(null);
  const scaricaErrori = async (r: Riga) => {
    setScaricando(r.id);
    try {
      const tutte: RigaProgrammataFallita[] = [];
      for (let da = 0; ; da += 1000) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).from("importazioni_programmate_righe")
          .select("ordine, esito, dati").eq("importazione_id", r.id).eq("stato", "errore")
          .order("ordine").range(da, da + 999);
        if (error) throw error;
        tutte.push(...((data ?? []) as RigaProgrammataFallita[]));
        if (!data || data.length < 1000) break;
      }
      const base = (r.nome_file ?? "importazione").replace(/\.[^.]+$/, "");
      scaricaCsv(`${base} - righe da correggere.csv`, csvRigheProgrammate(oggetto, tutte));
    } catch (e) {
      toast.error(userErrorMessage(e, "Non sono riuscito a scaricare le righe da correggere"));
    } finally {
      setScaricando(null);
    }
  };

  if (!righe.length && !ultima) return null;
  const nome = oggetto === "contatti" ? "contatti" : "opportunità";
  const settimanaFa = dataUpdatedAt - 7 * 24 * 3600_000;
  return (
    <div className="space-y-2">
      {ultima && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-3 text-sm">
          <p className="min-w-0 flex-1">
            Ultima importazione{ultima.nome_file ? ` · ${ultima.nome_file}` : ""}: {ultima.importazioni_registro_creati[0].count} creati
            {" "}il {new Date(ultima.created_at).toLocaleString("it-IT", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
          </p>
          <Button size="sm" variant="outline" disabled={annulla.isPending}
            onClick={() => chiediAnnulla(ultima.id, `Annullare l'importazione? Quello che ha creato va nel cestino. I ${nome} che c'erano già e sono stati solo aggiornati restano come sono.`)}>
            <Undo2 className="mr-1 h-3.5 w-3.5" /> Annulla questa importazione
          </Button>
        </div>
      )}
      {righe.map((r) => {
        const programmazione = {
          perGiro: r.per_giro, ogniMinuti: r.ogni_minuti, inizio: new Date(Math.max(dataUpdatedAt, new Date(r.prossimo_giro).getTime())),
          fasciaDa: ora(r.fascia_da), fasciaA: ora(r.fascia_a), giorni: r.giorni,
        };
        const restanti = Math.max(0, r.totale - r.fatte);
        const fine = r.stato === "attiva" && restanti ? fineStimata(restanti, programmazione) : null;
        const percentuale = r.totale ? Math.round((r.fatte / r.totale) * 100) : 0;
        return (
          <div key={r.id} className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
              <p className="min-w-0 flex-1 font-medium">
                Importazione a scaglioni{r.nome_file ? ` · ${r.nome_file}` : ""}:{" "}
                {r.stato === "completata" ? "conclusa" : r.stato === "in_pausa" ? "in pausa" : "in corso"}
              </p>
              {r.stato === "attiva" && (
                <Button size="sm" variant="outline" disabled={cambiaStato.isPending} onClick={() => cambiaStato.mutate({ id: r.id, stato: "in_pausa" })}>
                  <Pause className="mr-1 h-3.5 w-3.5" /> Pausa
                </Button>
              )}
              {r.stato === "in_pausa" && (
                <Button size="sm" variant="outline" disabled={cambiaStato.isPending} onClick={() => cambiaStato.mutate({ id: r.id, stato: "attiva" })}>
                  <Play className="mr-1 h-3.5 w-3.5" /> Riprendi
                </Button>
              )}
              {(r.stato === "attiva" || r.stato === "in_pausa") && (
                <Button size="sm" variant="ghost" disabled={cambiaStato.isPending}
                  onClick={() => { if (window.confirm(`Annullare l'importazione? I ${restanti} ${nome} non ancora entrati non entreranno più.`)) cambiaStato.mutate({ id: r.id, stato: "annullata" }); }}>
                  <X className="mr-1 h-3.5 w-3.5" /> Annulla
                </Button>
              )}
            </div>
            <Progress value={percentuale} className="mt-2 h-1.5" />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {r.fatte} di {r.totale} {nome} · {descriviProgrammazione(programmazione)}
              {fine ? ` · finisce verso ${formatoData(fine)}` : ""}
              {r.creati || r.aggiornati ? ` · ${r.creati} nuovi, ${r.aggiornati} aggiornati` : ""}
              {r.saltati ? ` · ${r.saltati} saltati` : ""}
              {r.errori ? ` · ${r.errori} con errore` : ""}
            </p>
            {r.ultimo_errore && <p className="mt-1 text-xs text-amber-800">{r.ultimo_errore}</p>}
            {(r.creati > 0 || r.stato === "attiva" || r.stato === "in_pausa") && new Date(r.inizio).getTime() > settimanaFa && (
              <Button size="sm" variant="ghost" className="mt-2 mr-2" disabled={annulla.isPending}
                onClick={() => chiediAnnulla(r.id, `Annullare tutta l'importazione? Le righe non ancora entrate non entreranno, e i ${nome} già creati vanno nel cestino. Quelli che c'erano già restano come sono.`)}>
                <Undo2 className="mr-1 h-3.5 w-3.5" /> Annulla e togli quelli già entrati
              </Button>
            )}
            {r.errori > 0 && (
              <Button size="sm" variant="outline" className="mt-2" disabled={scaricando === r.id} onClick={() => void scaricaErrori(r)}>
                <Download className="mr-1 h-3.5 w-3.5" />
                {scaricando === r.id ? "Preparo il file…" : `Scarica le ${r.errori} righe da correggere (Excel)`}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
