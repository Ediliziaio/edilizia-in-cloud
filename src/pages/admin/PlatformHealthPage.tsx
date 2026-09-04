import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Gauge, RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface JobRiga {
  job: string;
  schedule?: string;
  attivo?: boolean;
  esecuzioni: number;
  falliti: number;
  ultima: string | null;
  ultimo_errore?: string | null;
  errore?: string | null;
}

interface FunzioneRiga {
  funzione: string;
  chiamate: number;
  errori: number;
  latenza_media_ms: number | null;
  latenza_max_ms: number | null;
  ultima: string | null;
}

interface Salute {
  riepilogo: {
    job_totali: number;
    job_attivi: number;
    job_con_errori: number;
    funzioni_strumentate: number;
    funzioni_totali_stimate: number;
    errori_edge_24h: number;
    aziende_attive_24h: number;
    trial_scaduti_da_gestire: number;
    insoluti_aperti: number;
    aziende_cancellate_in_attesa: number;
  };
  job_falliti: JobRiga[];
  job: JobRiga[];
  funzioni: FunzioneRiga[];
  calcolato_il: string;
}

function Tessera({
  etichetta, valore, dettaglio, tono = "neutro",
}: {
  etichetta: string; valore: string | number; dettaglio?: string;
  tono?: "neutro" | "buono" | "attenzione" | "critico";
}) {
  const colori = {
    neutro: "text-foreground",
    buono: "text-emerald-600 dark:text-emerald-400",
    attenzione: "text-amber-600 dark:text-amber-400",
    critico: "text-destructive",
  }[tono];
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{etichetta}</p>
      <p className={`text-2xl font-semibold tabular-nums leading-tight ${colori}`}>{valore}</p>
      {dettaglio && <p className="text-xs text-muted-foreground mt-0.5">{dettaglio}</p>}
    </div>
  );
}

/**
 * Salute della piattaforma (F3-02).
 *
 * Prima nessuna schermata mostrava uptime, job falliti, latenza o errori: un
 * guasto si scopriva quando chiamava il cliente. Il job che svuota il cestino
 * documenti ha fallito ogni notte per giorni senza che nessuno lo sapesse.
 */
export default function PlatformHealthPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-platform-health"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_platform_health" as never);
      if (error) throw error;
      return data as unknown as Salute;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const r = data?.riepilogo;
  const jobFalliti = data?.job_falliti ?? [];
  const funzioni = data?.funzioni ?? [];

  return (
    <div className="p-3 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="hidden md:flex items-center gap-3">
          <Activity className="h-6 w-6 text-blue-500" />
          <div>
            <h1 className="text-xl font-semibold">Salute della piattaforma</h1>
            <p className="text-sm text-muted-foreground">
              Job pianificati, errori e latenza delle funzioni, cose che richiedono attenzione
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 md:mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          <span className="hidden md:inline">Aggiorna</span>
        </Button>
      </div>

      {error && (
        <Card><CardContent className="p-6">
          <p className="text-sm text-destructive">Errore: {(error as Error).message}</p>
        </CardContent></Card>
      )}

      {isLoading && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      )}

      {r && (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <Tessera
              etichetta="Job con errori"
              valore={r.job_con_errori}
              dettaglio={`${r.job_attivi} job attivi su ${r.job_totali}`}
              tono={r.job_con_errori > 0 ? "critico" : "buono"}
            />
            <Tessera
              etichetta="Errori funzioni 24h"
              valore={r.errori_edge_24h}
              dettaglio={`${r.funzioni_strumentate} funzioni su ${r.funzioni_totali_stimate} misurate`}
              tono={r.errori_edge_24h > 0 ? "attenzione" : "buono"}
            />
            <Tessera
              etichetta="Aziende attive oggi"
              valore={r.aziende_attive_24h}
              dettaglio="sessioni nelle ultime 24 ore"
            />
            <Tessera
              etichetta="Trial da chiudere"
              valore={r.trial_scaduti_da_gestire}
              dettaglio="scaduti, in attesa del job notturno"
              tono={r.trial_scaduti_da_gestire > 0 ? "attenzione" : "buono"}
            />
            <Tessera
              etichetta="Insoluti aperti"
              valore={r.insoluti_aperti}
              dettaglio="aziende con pagamento fallito"
              tono={r.insoluti_aperti > 0 ? "attenzione" : "buono"}
            />
            <Tessera
              etichetta="Cancellate da purgare"
              valore={r.aziende_cancellate_in_attesa}
              dettaglio="ripristinabili entro 30 giorni"
            />
            <Tessera
              etichetta="Copertura misurazione"
              valore={`${Math.round((r.funzioni_strumentate / Math.max(r.funzioni_totali_stimate, 1)) * 100)}%`}
              dettaglio="funzioni che registrano metriche"
              tono={r.funzioni_strumentate < 50 ? "attenzione" : "buono"}
            />
            <Tessera
              etichetta="Ultimo calcolo"
              valore={data?.calcolato_il ? format(new Date(data.calcolato_il), "HH:mm") : "—"}
              dettaglio="si aggiorna ogni 2 minuti"
            />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                {jobFalliti.length > 0
                  ? <AlertTriangle className="h-4 w-4 text-destructive" />
                  : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                Job in errore nelle ultime 48 ore
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {jobFalliti.length === 0 ? (
                <p className="text-sm text-muted-foreground px-6 pb-6">
                  Nessun job sta fallendo. Se qualcosa si rompe, comparirà qui.
                </p>
              ) : (
                <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead className="text-right">Falliti</TableHead>
                      <TableHead className="text-right">Esecuzioni</TableHead>
                      <TableHead>Ultima</TableHead>
                      <TableHead>Errore</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobFalliti.map((j) => (
                      <TableRow key={j.job}>
                        <TableCell className="font-mono text-xs font-medium">{j.job}</TableCell>
                        <TableCell className="text-right tabular-nums text-destructive font-semibold">
                          {j.falliti}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {j.esecuzioni}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {j.ultima ? formatDistanceToNow(new Date(j.ultima), { addSuffix: true, locale: it }) : "—"}
                        </TableCell>
                        <TableCell className="text-xs max-w-sm truncate" title={j.errore ?? ""}>
                          {j.errore ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Gauge className="h-4 w-4 text-blue-500" />
                Funzioni misurate nelle ultime 24 ore
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {funzioni.length === 0 ? (
                <p className="text-sm text-muted-foreground px-6 pb-6">
                  Nessuna chiamata registrata. Solo poche funzioni scrivono metriche:
                  estendere la misurazione è l'intervento F3-01 del piano.
                </p>
              ) : (
                <Table className="min-w-[560px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Funzione</TableHead>
                      <TableHead className="text-right">Chiamate</TableHead>
                      <TableHead className="text-right">Errori</TableHead>
                      <TableHead className="text-right">Latenza media</TableHead>
                      <TableHead className="text-right">Picco</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {funzioni.map((f) => (
                      <TableRow key={f.funzione}>
                        <TableCell className="font-mono text-xs font-medium">{f.funzione}</TableCell>
                        <TableCell className="text-right tabular-nums">{f.chiamate}</TableCell>
                        <TableCell className={`text-right tabular-nums ${f.errori > 0 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                          {f.errori}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          {f.latenza_media_ms ? `${f.latenza_media_ms} ms` : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                          {f.latenza_max_ms ? `${f.latenza_max_ms} ms` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Tutti i job pianificati
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Frequenza</TableHead>
                    <TableHead className="text-right">24h</TableHead>
                    <TableHead>Ultima</TableHead>
                    <TableHead>Stato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.job ?? []).map((j) => (
                    <TableRow key={j.job}>
                      <TableCell className="font-mono text-xs">{j.job}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{j.schedule}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{j.esecuzioni}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                        {j.ultima ? formatDistanceToNow(new Date(j.ultima), { addSuffix: true, locale: it }) : "mai"}
                      </TableCell>
                      <TableCell>
                        {!j.attivo ? (
                          <Badge variant="outline" className="text-[10px]">disattivo</Badge>
                        ) : j.falliti > 0 ? (
                          <Badge variant="destructive" className="text-[10px]">{j.falliti} errori</Badge>
                        ) : j.esecuzioni === 0 ? (
                          <Badge variant="outline" className="text-[10px]">nessuna esecuzione</Badge>
                        ) : (
                          <Badge className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                            regolare
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
