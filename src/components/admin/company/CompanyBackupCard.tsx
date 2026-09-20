/**
 * I backup di questa azienda, e la prova che si possono ripristinare.
 *
 * «Prova ripristino» ricrea le tabelle del file in uno schema a parte, ci
 * versa le righe con i tipi di produzione, conta cosa entra e butta via lo
 * schema: nessun effetto sui dati veri. Un file che non passa la prova non è
 * un backup, e meglio scoprirlo adesso che il giorno in cui serve.
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Archive, CheckCircle2, AlertTriangle, PlayCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface FileBackup {
  percorso: string; dimensione: number; creato_il: string | null;
  // Le aziende grandi si salvano a blocchi (una cartella con un indice): di
  // quelle si sa quante righe tengono e se il backup è arrivato in fondo.
  a_blocchi?: boolean; completo?: boolean; righe?: number; tabelle?: number;
}
interface EsitoTabella { tabella: string; nel_file?: number; ripristinate?: number; errore?: string; nota?: string }
interface EsitoProva {
  ok: boolean; error?: string; integro?: boolean; azienda?: string; esportato_il?: string;
  righe_nel_file?: number; righe_ripristinate?: number; tabelle?: EsitoTabella[];
}

function kb(n: number): string {
  return n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} kB`;
}

export function CompanyBackupCard({ companyId }: { companyId: string }) {
  const [esiti, setEsiti] = useState<Record<string, EsitoProva>>({});

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

  const prova = useMutation({
    mutationFn: async (percorso: string) => {
      const { data, error } = await supabase.functions.invoke("company-restore", {
        body: { azione: "prova", percorso },
      });
      if (error) throw error;
      return { percorso, esito: data as EsitoProva };
    },
    onSuccess: ({ percorso, esito }) => {
      setEsiti((s) => ({ ...s, [percorso]: esito }));
      if (esito.integro) toast.success(`Ripristinabile: ${esito.righe_ripristinate} righe su ${esito.righe_nel_file}`);
      else toast.warning(esito.error ?? "Alcune righe non sono entrate: guarda il dettaglio");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const file = data ?? [];

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
          const e = esiti[f.percorso];
          const parti = f.percorso.split("/");
          const nomeFile = f.a_blocchi ? `${parti[parti.length - 2]} · a blocchi` : (parti.pop() ?? f.percorso);
          return (
            <div key={f.percorso} className="border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{nomeFile}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {f.a_blocchi
                      ? `${(f.righe ?? 0).toLocaleString("it-IT")} righe in ${f.tabelle ?? 0} tabelle`
                      : kb(f.dimensione)}
                    {f.creato_il ? ` · ${format(new Date(f.creato_il), "d MMM yyyy HH:mm")}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {e?.integro === true && (
                    <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
                      <CheckCircle2 className="h-3 w-3" /> ripristinabile
                    </Badge>
                  )}
                  {e && e.integro === false && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" /> incompleto
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
                  {/* La prova di ripristino per i backup a blocchi non c'è ancora:
                      meglio nessun pulsante che uno che risponde con un errore. */}
                  {!f.a_blocchi && (
                    <Button size="sm" variant="outline" onClick={() => prova.mutate(f.percorso)}
                            disabled={prova.isPending}>
                      <PlayCircle className="h-4 w-4 md:mr-1.5" />
                      <span className="hidden md:inline">Prova ripristino</span>
                    </Button>
                  )}
                </div>
              </div>
              {e && (
                <div className="text-[11px] text-muted-foreground space-y-1">
                  {e.error && <p className="text-destructive">{e.error}</p>}
                  {typeof e.righe_nel_file === "number" && (
                    <p>
                      <span className="tabular-nums">{e.righe_ripristinate}</span> righe rientrate su{" "}
                      <span className="tabular-nums">{e.righe_nel_file}</span>, in {e.tabelle?.length ?? 0} tabelle
                      {e.esportato_il ? ` · esportato il ${format(new Date(e.esportato_il), "d MMM HH:mm")}` : ""}
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
          database, tutto o niente. Le aziende grandi si salvano «a blocchi»: i dati ci sono tutti, ma
          per quel formato la prova di ripristino non è ancora disponibile.
        </p>
      </CardContent>
    </Card>
  );
}
