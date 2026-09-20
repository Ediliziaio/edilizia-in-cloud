/**
 * I backup di questa azienda, e la prova che si possono ripristinare.
 *
 * «Prova ripristino» ricrea le tabelle del file in uno schema a parte, ci
 * versa le righe con i tipi di produzione, conta cosa entra e butta via lo
 * schema: nessun effetto sui dati veri. Un file che non passa la prova non è
 * un backup, e meglio scoprirlo adesso che il giorno in cui serve.
 *
 * Le aziende grandi si salvano «a blocchi» (una cartella con un indice). La
 * loro prova versa un blocco alla volta e dura minuti: company-restore
 * risponde subito, lavora in sottofondo, e qui si chiede lo stato ogni pochi
 * secondi. L'esito resta scritto nel database, quindi si vede anche dopo aver
 * ricaricato la pagina — e una prova ancora in corso si riaggancia da sola.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Archive, CheckCircle2, AlertTriangle, PlayCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface EsitoTabella { tabella: string; nel_file?: number; ripristinate?: number; errore?: string; nota?: string }
interface EsitoProva {
  ok: boolean; error?: string; integro?: boolean; azienda?: string; esportato_il?: string;
  righe_nel_file?: number; righe_ripristinate?: number; tabelle?: EsitoTabella[];
  // Solo per i backup a blocchi: l'indice diceva «completo»? quando è stata fatta la prova?
  backup_completo?: boolean; provata_il?: string | null;
}
interface Avanzamento { passo: number; passi: number; righe_versate: number; righe_totali: number }
interface UltimaProva { prova_id: string; stato: "in_corso" | "finita" | "fallita"; esito?: EsitoProva }
interface FileBackup {
  percorso: string; dimensione: number; creato_il: string | null;
  // Le aziende grandi si salvano a blocchi (una cartella con un indice): di
  // quelle si sa quante righe tengono e se il backup è arrivato in fondo.
  a_blocchi?: boolean; completo?: boolean; righe?: number; tabelle?: number;
  ultima_prova?: UltimaProva;
}
/** La risposta di «prova» e di «stato» per un backup a blocchi. */
interface StatoProva {
  ok: boolean; error?: string; prova_id?: string; percorso?: string; in_corso?: boolean;
  stato?: "in_corso" | "finita" | "fallita"; avanzamento?: Avanzamento; esito?: EsitoProva;
}

/** Ogni quanto si chiede lo stato di una prova a blocchi. */
const OGNI_MS = 3000;

function kb(n: number): string {
  return n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} kB`;
}

const migliaia = (n: number | undefined) => (n ?? 0).toLocaleString("it-IT");

export function CompanyBackupCard({ companyId }: { companyId: string }) {
  const [esiti, setEsiti] = useState<Record<string, EsitoProva>>({});
  const [inCorso, setInCorso] = useState<Record<string, Avanzamento | null>>({});
  // Le prove che questa scheda sta già seguendo, e se la scheda è ancora aperta.
  const seguite = useRef(new Set<string>());
  const aperta = useRef(true);
  useEffect(() => {
    aperta.current = true;
    return () => { aperta.current = false; };
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["company-backup-elenco", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("company-restore", {
        body: { azione: "elenca", companyId },
      });
      if (error) throw error;
      return (data as { file: FileBackup[] }).file ?? [];
    },
    staleTime: 60_000,
  });

  const annuncia = useCallback((esito: EsitoProva) => {
    if (esito.integro) toast.success(`Ripristinabile: ${migliaia(esito.righe_ripristinate)} righe su ${migliaia(esito.righe_nel_file)}`);
    else toast.warning(esito.error ?? "Alcune righe non sono entrate: guarda il dettaglio");
  }, []);

  /** Segue una prova a blocchi finché non finisce: avanzamento intanto, esito alla fine. */
  const segui = useCallback(async (percorso: string, provaId: string) => {
    if (seguite.current.has(provaId)) return;
    seguite.current.add(provaId);
    const pausa = () => new Promise((fatto) => setTimeout(fatto, OGNI_MS));
    // La prima domanda dopo una pausa: la prova è appena partita, e così tutto
    // quello che tocca lo stato della scheda avviene dopo un'attesa, mai dentro
    // l'effetto che ha fatto partire il giro.
    await pausa();
    try {
      while (aperta.current) {
        const { data, error } = await supabase.functions.invoke("company-restore", {
          body: { azione: "stato", prova_id: provaId },
        });
        if (error) throw error;
        const stato = data as StatoProva;
        if (!stato.in_corso) {
          const esito = stato.esito ?? { ok: false, integro: false, error: stato.error ?? "La prova non è arrivata in fondo" };
          setEsiti((s) => ({ ...s, [percorso]: esito }));
          annuncia(esito);
          return;
        }
        setInCorso((s) => ({ ...s, [percorso]: stato.avanzamento ?? null }));
        await pausa();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      seguite.current.delete(provaId);
      if (aperta.current) setInCorso((s) => { const { [percorso]: _via, ...resto } = s; return resto; });
    }
  }, [annuncia]);

  const prova = useMutation({
    mutationFn: async (percorso: string) => {
      const { data, error } = await supabase.functions.invoke("company-restore", {
        body: { azione: "prova", percorso },
      });
      if (error) throw error;
      return { percorso, risposta: data as StatoProva & EsitoProva };
    },
    onSuccess: ({ percorso, risposta }) => {
      // Backup a blocchi: la prova è partita e gira in sottofondo. Se ce n'era
      // già una in corso per questa azienda, ci si aggancia a quella.
      if (risposta.in_corso && risposta.prova_id) {
        const dove = risposta.percorso ?? percorso;
        setInCorso((s) => ({ ...s, [dove]: s[dove] ?? null }));
        void segui(dove, risposta.prova_id);
        return;
      }
      const esito: EsitoProva = risposta.esito ?? risposta;
      setEsiti((s) => ({ ...s, [percorso]: esito }));
      annuncia(esito);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const file = data ?? [];

  // Una prova a blocchi lasciata in corso (pagina ricaricata, scheda riaperta): la si riprende.
  // Che «gira» lo si legge dall'elenco (staGirando, qui sotto): l'effetto non tocca lo stato,
  // fa partire solo il giro di domande, e «segui» aspetta prima di scrivere qualunque cosa.
  useEffect(() => {
    for (const f of data ?? []) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sottoscrizione a un lavoro esterno: i setState di «segui» arrivano tutti dopo un'attesa
      if (f.ultima_prova?.stato === "in_corso") void segui(f.percorso, f.ultima_prova.prova_id);
    }
  }, [data, segui]);

  /** Gira se l'abbiamo fatta partire noi, o se l'elenco la dà in corso e l'esito non è ancora arrivato. */
  const staGirando = (f: FileBackup) =>
    f.percorso in inCorso || (f.ultima_prova?.stato === "in_corso" && !esiti[f.percorso]);

  // Una prova a blocchi per azienda alla volta: mentre una gira, le altre aspettano.
  const unaInCorso = file.some(staGirando);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Archive className="h-4 w-4 text-muted-foreground" />
          Backup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <Skeleton className="h-16 w-full" />}
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
        {!isLoading && !error && file.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nessun backup ancora. Il job gira la domenica alle 02:30 UTC per tutte le aziende attive.
          </p>
        )}
        {file.map((f) => {
          // L'esito di adesso, o quello dell'ultima prova rimasto scritto nel database.
          const e = esiti[f.percorso] ?? f.ultima_prova?.esito;
          const gira = staGirando(f);
          const avanzamento = inCorso[f.percorso];
          const parti = f.percorso.split("/");
          const nomeFile = f.a_blocchi ? `${parti[parti.length - 2]} · a blocchi` : (parti.pop() ?? f.percorso);
          return (
            <div key={f.percorso} className="border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{nomeFile}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {f.a_blocchi
                      ? `${migliaia(f.righe)} righe in ${f.tabelle ?? 0} tabelle`
                      : kb(f.dimensione)}
                    {f.creato_il ? ` · ${format(new Date(f.creato_il), "d MMM yyyy HH:mm")}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!gira && e?.integro === true && (
                    <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
                      <CheckCircle2 className="h-3 w-3" /> ripristinabile
                    </Badge>
                  )}
                  {!gira && e && e.integro === false && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" /> {f.a_blocchi ? "prova non passata" : "incompleto"}
                    </Badge>
                  )}
                  {f.a_blocchi && f.completo && (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" /> completo
                    </Badge>
                  )}
                  {f.a_blocchi && !f.completo && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" /> incompleto
                    </Badge>
                  )}
                  <Button size="sm" variant="outline" onClick={() => prova.mutate(f.percorso)}
                          disabled={prova.isPending || gira || (f.a_blocchi === true && unaInCorso)}>
                    {gira
                      ? <Loader2 className="h-4 w-4 md:mr-1.5 animate-spin" />
                      : <PlayCircle className="h-4 w-4 md:mr-1.5" />}
                    <span className="hidden md:inline">{gira ? "Prova in corso" : "Prova ripristino"}</span>
                  </Button>
                </div>
              </div>
              {gira && (
                <p className="text-[11px] text-muted-foreground">
                  {avanzamento && avanzamento.passi > 0
                    ? <>
                        <span className="tabular-nums">{migliaia(avanzamento.righe_versate)}</span> righe versate su{" "}
                        <span className="tabular-nums">{migliaia(avanzamento.righe_totali)}</span> · blocco{" "}
                        <span className="tabular-nums">{Math.min(avanzamento.passo, avanzamento.passi)}</span> di{" "}
                        <span className="tabular-nums">{avanzamento.passi}</span>
                      </>
                    : "La prova è partita…"}
                  {" "}Può durare qualche minuto: si può lasciare la pagina, l'esito resta qui.
                </p>
              )}
              {!gira && e && (
                <div className="text-[11px] text-muted-foreground space-y-1">
                  {e.error && <p className="text-destructive">{e.error}</p>}
                  {typeof e.righe_nel_file === "number" && (
                    <p>
                      <span className="tabular-nums">{migliaia(e.righe_ripristinate)}</span> righe rientrate su{" "}
                      <span className="tabular-nums">{migliaia(e.righe_nel_file)}</span>, in {e.tabelle?.length ?? 0} tabelle
                      {e.esportato_il ? ` · esportato il ${format(new Date(e.esportato_il), "d MMM HH:mm")}` : ""}
                      {e.provata_il ? ` · provato il ${format(new Date(e.provata_il), "d MMM HH:mm")}` : ""}
                    </p>
                  )}
                  {(e.tabelle ?? []).filter((t) => t.errore || t.nota).map((t) => (
                    <p key={t.tabella}>
                      <span className="font-mono">{t.tabella}</span>: {t.errore ?? t.nota}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <p className="text-[11px] text-muted-foreground">
          La prova non tocca i dati veri: ricrea le tabelle del file in uno schema a parte, le riempie,
          conta, e lo butta via. Il ripristino reale vale solo per un'azienda già purgata e va fatto dal
          database, tutto o niente. Le aziende grandi si salvano «a blocchi»: la loro prova rimette
          dentro un blocco alla volta e dura qualche minuto.
        </p>
      </CardContent>
    </Card>
  );
}
