import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarClock, Download, Pause, Play, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { userErrorMessage } from "@/lib/userErrorMessage";
import { descriviProgrammazione, fineStimata, formatoData } from "@/lib/importazione/programmata";
import { annullaImportazione, motivoAnnullamentoFallito, testoAnnullamento } from "@/lib/importazione/registro";
import { csvRigheProgrammate, scaricaCsv, type RigaProgrammataFallita } from "./scaricaRighe";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

interface Riga {
  id: string; nome_file: string | null; stato: "attiva" | "in_pausa" | "completata" | "annullata";
  totale: number; fatte: number; creati: number; aggiornati: number; saltati: number; errori: number;
  per_giro: number; ogni_minuti: number; inizio: string; prossimo_giro: string;
  fascia_da: string | null; fascia_a: string | null; giorni: number[]; ultimo_errore: string | null; updated_at: string;
  /** Il registro per annullarla: manca per le importazioni di prima o se non si è potuto scrivere. */
  registro: { annullata_at: string | null; created_at: string } | null;
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
  const t = useT();
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
        .order("created_at", { ascending: false });
      if (error) throw error;
      const lavori = (data ?? []) as Omit<Riga, "registro">[];
      const registri = new Map<string, Riga["registro"]>();
      if (lavori.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: reg } = await (supabase as any).from("importazioni_registro")
          .select("id, annullata_at, created_at").in("id", lavori.map((l) => l.id));
        for (const r of (reg ?? []) as { id: string; annullata_at: string | null; created_at: string }[]) {
          registri.set(r.id, { annullata_at: r.annullata_at, created_at: r.created_at });
        }
      }
      return lavori
        .map((l) => ({ ...l, registro: registri.get(l.id) ?? null }))
        // Una fermata resta in vista solo finché c'è qualcosa da togliere.
        .filter((l) => l.stato !== "annullata" || (l.creati > 0 && l.registro && !l.registro.annullata_at));
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
    onError: (e) => toast.error(motivoAnnullamentoFallito(e)),
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
      toast.success(v.stato === "in_pausa" ? t("Importazione in pausa") : v.stato === "attiva" ? t("Importazione ripresa") : t("Importazione fermata: le righe non ancora entrate non entreranno"));
      queryClient.invalidateQueries({ queryKey: chiave });
    },
    onError: (e) => toast.error(userErrorMessage(e, t("Non sono riuscito a cambiare l'importazione"))),
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
      toast.error(userErrorMessage(e, t("Non sono riuscito a scaricare le righe da correggere")));
    } finally {
      setScaricando(null);
    }
  };

  if (!righe.length && !ultima) return null;
  const nome = oggetto === "contatti" ? t("contatti") : t("opportunità");
  const settimanaFa = dataUpdatedAt - 7 * 24 * 3600_000;
  return (
    <div className="space-y-2">
      {ultima && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-3 text-sm">
          <p className="min-w-0 flex-1">
            {t("Ultima importazione")}{ultima.nome_file ? ` · ${ultima.nome_file}` : ""}: {t("{n} creati il {data}", { n: ultima.importazioni_registro_creati[0].count, data: new Date(ultima.created_at).toLocaleString(intlCampo(), { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) })}
          </p>
          <Button size="sm" variant="outline" disabled={annulla.isPending}
            onClick={() => chiediAnnulla(ultima.id, t("Annullare l'importazione? Quello che ha creato va nel cestino, anche le opportunità spostate di fase nel frattempo. I contatti che c'erano già e sono stati solo aggiornati restano come sono."))}>
            <Undo2 className="mr-1 h-3.5 w-3.5" /> {t("Annulla questa importazione")}
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
                {t("Importazione a scaglioni")}{r.nome_file ? ` · ${r.nome_file}` : ""}:{" "}
                {r.stato === "completata" ? t("conclusa") : r.stato === "in_pausa" ? t("in pausa") : r.stato === "annullata" ? t("fermata") : t("in corso")}
              </p>
              {r.stato === "attiva" && (
                <Button size="sm" variant="outline" disabled={cambiaStato.isPending} onClick={() => cambiaStato.mutate({ id: r.id, stato: "in_pausa" })}>
                  <Pause className="mr-1 h-3.5 w-3.5" /> {t("Pausa")}
                </Button>
              )}
              {r.stato === "in_pausa" && (
                <Button size="sm" variant="outline" disabled={cambiaStato.isPending} onClick={() => cambiaStato.mutate({ id: r.id, stato: "attiva" })}>
                  <Play className="mr-1 h-3.5 w-3.5" /> {t("Riprendi")}
                </Button>
              )}
              {(r.stato === "attiva" || r.stato === "in_pausa") && (
                <Button size="sm" variant="ghost" disabled={cambiaStato.isPending}
                  onClick={() => { if (window.confirm(t("Fermare l'importazione? I {restanti} {nome} non ancora entrati non entreranno più. Quelli già entrati restano.", { restanti: String(restanti ?? ""), nome: String(nome ?? "") }))) cambiaStato.mutate({ id: r.id, stato: "annullata" }); }}>
                  <X className="mr-1 h-3.5 w-3.5" /> {t("Ferma")}
                </Button>
              )}
            </div>
            <Progress value={percentuale} className="mt-2 h-1.5" />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t("{fatte} di {totale} {nome}", { fatte: r.fatte, totale: r.totale, nome })} · {descriviProgrammazione(programmazione)}
              {fine ? ` · ${t("finisce verso {fine}", { fine: formatoData(fine) })}` : ""}
              {r.creati || r.aggiornati ? ` · ${t("{creati} nuovi, {aggiornati} aggiornati", { creati: r.creati ?? 0, aggiornati: r.aggiornati ?? 0 })}` : ""}
              {r.saltati ? ` · ${t("{saltati} saltati", { saltati: r.saltati })}` : ""}
              {r.errori ? ` · ${t("{errori} con errore", { errori: r.errori })}` : ""}
            </p>
            {r.ultimo_errore && <p className="mt-1 text-xs text-amber-800">{r.ultimo_errore}</p>}
            {r.registro && !r.registro.annullata_at && new Date(r.registro.created_at).getTime() > settimanaFa && r.creati > 0 && (
              <Button size="sm" variant="ghost" className="mt-2 mr-2" disabled={annulla.isPending}
                onClick={() => chiediAnnulla(r.id, t("Annullare tutta l'importazione? Le righe non ancora entrate non entreranno, e quello che è già stato creato va nel cestino (anche le opportunità spostate di fase nel frattempo). I contatti che c'erano già restano come sono."))}>
                <Undo2 className="mr-1 h-3.5 w-3.5" /> {r.stato === "annullata" || r.stato === "completata" ? t("Togli quelli già entrati") : t("Annulla e togli quelli già entrati")}
              </Button>
            )}
            {r.errori > 0 && (
              <Button size="sm" variant="outline" className="mt-2" disabled={scaricando === r.id} onClick={() => void scaricaErrori(r)}>
                <Download className="mr-1 h-3.5 w-3.5" />
                {scaricando === r.id ? t("Preparo il file…") : t("Scarica le {errori} righe da correggere (Excel)", { errori: String(r.errori ?? "") })}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
