/**
 * Traffico del sito pubblico — dati di prima parte, non di Google.
 *
 * Risponde a tre domande: quali pagine vengono viste, quanto tempo ci stanno,
 * dove si fermano. Le prime due si leggono da sole; la terza è la somma di due
 * colonne che vanno guardate insieme, ed è spiegata sotto la tabella.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, RefreshCw, LogIn, Compass, FileText } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface Riepilogo {
  giorni: number;
  pagine_viste: number;
  sessioni: number;
  visitatori: number;
  pagine_per_sessione: number | null;
  sessioni_una_pagina: number;
  tempo_medio_pagina_s: number | null;
  viste_con_tempo: number;
  viste_precedente: number;
  sessioni_precedente: number;
  visitatori_precedente: number;
  crescita_viste_pct: number | null;
}

interface Pagina {
  pagina: string; titolo: string | null; viste: number; visitatori: number;
  tempo_medio_s: number | null; misurate: number; uscite: number; uscite_pct: number | null;
}

interface Ingresso {
  pagina: string; ingressi: number; senza_seguito: number; senza_seguito_pct: number | null;
}

interface Fonte { fonte: string; sessioni: number; visitatori: number }

interface Traffico {
  riepilogo: Riepilogo;
  pagine: Pagina[];
  ingressi: Ingresso[];
  fonti: Fonte[];
  giorni: Array<{ giorno: string; viste: number; sessioni: number; visitatori: number }>;
  calcolato_il: string;
}

function durata(secondi: number | null): string {
  if (secondi === null || secondi === undefined) return "—";
  if (secondi < 60) return `${Math.round(secondi)}s`;
  return `${Math.floor(secondi / 60)}m ${Math.round(secondi % 60)}s`;
}

function Tessera({ etichetta, valore, dettaglio, tono = "neutro" }: {
  etichetta: string; valore: string | number; dettaglio?: string;
  tono?: "neutro" | "buono" | "attenzione";
}) {
  const colore = tono === "buono" ? "text-emerald-600"
    : tono === "attenzione" ? "text-amber-600" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-3 md:p-4">
        <p className="text-xs text-muted-foreground">{etichetta}</p>
        <p className={`text-xl md:text-2xl font-semibold ${colore}`}>{valore}</p>
        {dettaglio && <p className="text-[11px] text-muted-foreground mt-0.5">{dettaglio}</p>}
      </CardContent>
    </Card>
  );
}

const PERIODI = [7, 30, 90];

export default function SiteTrafficPage() {
  const [giorni, setGiorni] = useState(30);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["admin-sito-traffico", giorni],
    queryFn: async () => {
      // La funzione non è nei tipi generati (rigenerati di rado): il cast
      // evita un errore di compilazione senza spegnere i tipi altrove.
      const { data, error } = await supabase.rpc("admin_sito_traffico" as never, { p_giorni: giorni } as never);
      if (error) throw error;
      return data as unknown as Traffico;
    },
    staleTime: 60_000,
  });

  const r = data?.riepilogo;
  const pagine = data?.pagine ?? [];
  const ingressi = data?.ingressi ?? [];
  const fonti = data?.fonti ?? [];

  const unaPaginaPct = r && r.sessioni > 0
    ? Math.round((100 * r.sessioni_una_pagina) / r.sessioni) : null;

  return (
    <div className="p-3 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="hidden md:flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-blue-500" />
          <div>
            <h1 className="text-xl font-semibold">Traffico del sito</h1>
            <p className="text-sm text-muted-foreground">
              Pagine viste, tempo di permanenza e punti di uscita — misurati da noi, non da Google
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          {PERIODI.map((g) => (
            <Button key={g} size="sm" variant={g === giorni ? "default" : "outline"}
                    onClick={() => setGiorni(g)}>
              {g}g
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {error && (
        <Card><CardContent className="p-6">
          <p className="text-sm text-destructive">Errore: {(error as Error).message}</p>
        </CardContent></Card>
      )}

      {isLoading && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      )}

      {r && (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <Tessera etichetta="Visitatori" valore={r.visitatori}
                     dettaglio={r.visitatori_precedente > 0
                       ? `${r.visitatori_precedente} nel periodo prima` : "nessun confronto"} />
            <Tessera etichetta="Visite" valore={r.sessioni}
                     dettaglio={`${r.pagine_per_sessione ?? "—"} pagine per visita`} />
            <Tessera etichetta="Pagine viste" valore={r.pagine_viste}
                     dettaglio={r.crescita_viste_pct !== null
                       ? `${r.crescita_viste_pct > 0 ? "+" : ""}${r.crescita_viste_pct}% sul periodo prima`
                       : "primo periodo misurato"}
                     tono={r.crescita_viste_pct !== null && r.crescita_viste_pct > 0 ? "buono" : "neutro"} />
            <Tessera etichetta="Tempo medio per pagina" valore={durata(r.tempo_medio_pagina_s)}
                     dettaglio={r.viste_con_tempo > 0
                       ? `su ${r.viste_con_tempo} viste misurate`
                       : "nessuna vista ancora misurata"} />
            <Tessera etichetta="Visite di una pagina sola"
                     valore={unaPaginaPct === null ? "—" : `${unaPaginaPct}%`}
                     dettaglio={`${r.sessioni_una_pagina} visite su ${r.sessioni}`}
                     tono={unaPaginaPct !== null && unaPaginaPct > 70 ? "attenzione" : "neutro"} />
            <Tessera etichetta="Aggiornato"
                     valore={data?.calcolato_il ? format(new Date(data.calcolato_il), "HH:mm") : "—"}
                     dettaglio="in tempo reale, non campionato" />
          </div>

          {r.viste_con_tempo === 0 && (
            <Card className="border-amber-500/40">
              <CardContent className="p-3 md:p-4">
                <p className="text-sm text-muted-foreground">
                  Il tempo di permanenza si popola dalle visite successive al prossimo deploy: la
                  misura la manda il browser quando la scheda viene chiusa, e quel pezzo è appena
                  stato aggiunto. Le pagine viste e i punti di uscita, invece, sono già completi.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Pagine più viste
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr className="text-left">
                    <th className="p-2 font-medium">Pagina</th>
                    <th className="p-2 font-medium text-right">Viste</th>
                    <th className="p-2 font-medium text-right hidden md:table-cell">Visitatori</th>
                    <th className="p-2 font-medium text-right">Tempo</th>
                    <th className="p-2 font-medium text-right">Uscite</th>
                  </tr>
                </thead>
                <tbody>
                  {pagine.length === 0 && (
                    <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">
                      Nessuna pagina vista nel periodo
                    </td></tr>
                  )}
                  {pagine.map((p) => (
                    <tr key={p.pagina} className="border-b last:border-0">
                      <td className="p-2">
                        <span className="font-mono text-xs">{p.pagina}</span>
                        {p.titolo && (
                          <span className="block text-[11px] text-muted-foreground truncate max-w-[240px] md:max-w-[420px]">
                            {p.titolo}
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right tabular-nums">{p.viste}</td>
                      <td className="p-2 text-right tabular-nums hidden md:table-cell">{p.visitatori}</td>
                      <td className="p-2 text-right tabular-nums">{durata(p.tempo_medio_s)}</td>
                      <td className={`p-2 text-right tabular-nums ${
                        (p.uscite_pct ?? 0) >= 80 ? "text-amber-600 font-medium" : ""
                      }`}>
                        {p.uscite_pct === null ? "—" : `${p.uscite_pct}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
            <CardContent className="pt-3">
              <p className="text-[11px] text-muted-foreground">
                <strong>Uscite</strong> è la quota di volte in cui quella pagina è l'ultima della
                visita. Da sola non dice niente: su un articolo del blog è normale — si legge e si
                esce — mentre su <span className="font-mono">/prezzi</span> è il punto in cui la
                trattativa si ferma. Va letta insieme al tempo: due secondi e via è un rimbalzo,
                due minuti è una lettura che finisce lì.
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <LogIn className="h-4 w-4 text-muted-foreground" />
                  Da dove entrano
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40">
                    <tr className="text-left">
                      <th className="p-2 font-medium">Prima pagina</th>
                      <th className="p-2 font-medium text-right">Ingressi</th>
                      <th className="p-2 font-medium text-right">Senza seguito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ingressi.length === 0 && (
                      <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">
                        Nessun ingresso nel periodo
                      </td></tr>
                    )}
                    {ingressi.map((i) => (
                      <tr key={i.pagina} className="border-b last:border-0">
                        <td className="p-2 font-mono text-xs">{i.pagina}</td>
                        <td className="p-2 text-right tabular-nums">{i.ingressi}</td>
                        <td className={`p-2 text-right tabular-nums ${
                          (i.senza_seguito_pct ?? 0) >= 80 ? "text-amber-600 font-medium" : ""
                        }`}>
                          {i.senza_seguito_pct === null ? "—" : `${i.senza_seguito_pct}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
              <CardContent className="pt-3">
                <p className="text-[11px] text-muted-foreground">
                  «Senza seguito» sono gli ingressi finiti senza aprire una seconda pagina: la
                  porta si apre e si richiude subito.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Compass className="h-4 w-4 text-muted-foreground" />
                  Da dove arrivano
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40">
                    <tr className="text-left">
                      <th className="p-2 font-medium">Fonte</th>
                      <th className="p-2 font-medium text-right">Visite</th>
                      <th className="p-2 font-medium text-right">Visitatori</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fonti.length === 0 && (
                      <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">
                        Nessuna visita nel periodo
                      </td></tr>
                    )}
                    {fonti.map((f) => (
                      <tr key={f.fonte} className="border-b last:border-0">
                        <td className="p-2">{f.fonte}</td>
                        <td className="p-2 text-right tabular-nums">{f.sessioni}</td>
                        <td className="p-2 text-right tabular-nums">{f.visitatori}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
              <CardContent className="pt-3">
                <p className="text-[11px] text-muted-foreground">
                  La fonte è quella d'ingresso, fotografata alla prima pagina: non viene
                  sovrascritta dalla navigazione successiva. «Diretto» comprende anche chi arriva
                  da un'app che non passa il referrer.
                </p>
              </CardContent>
            </Card>
          </div>

          {(data?.giorni?.length ?? 0) > 1 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Giorno per giorno</CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40">
                    <tr className="text-left">
                      <th className="p-2 font-medium">Giorno</th>
                      <th className="p-2 font-medium text-right">Visitatori</th>
                      <th className="p-2 font-medium text-right">Visite</th>
                      <th className="p-2 font-medium text-right">Pagine</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.giorni ?? []).map((g) => (
                      <tr key={g.giorno} className="border-b last:border-0">
                        <td className="p-2 whitespace-nowrap">
                          {format(new Date(g.giorno), "EEE d MMM", { locale: it })}
                        </td>
                        <td className="p-2 text-right tabular-nums">{g.visitatori}</td>
                        <td className="p-2 text-right tabular-nums">{g.sessioni}</td>
                        <td className="p-2 text-right tabular-nums">{g.viste}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
