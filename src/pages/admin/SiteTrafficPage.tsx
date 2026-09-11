/**
 * Traffico del sito pubblico — dati di prima parte, non di Google.
 *
 * Risponde a quattro domande: quanta gente arriva, da dove, cosa guarda, e
 * quanti di loro scrivono. L'ultima è quella che conta su un sito di
 * acquisizione, e per mesi la pagina non la faceva: i dati c'erano già
 * (`attribution_sessions.converted_at`), mancava solo mostrarli.
 *
 * Tutto il calcolo è in `admin_sito_traffico()`, che conta solo il sito
 * pubblico: niente area clienti, firme, accessi, sviluppo in locale.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, RefreshCw, LogIn, Compass, FileText, Inbox, CalendarDays } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface Riepilogo {
  giorni: number;
  pagine_viste: number;
  sessioni: number;
  visitatori: number;
  pagine_per_sessione: number | null;
  sessioni_una_pagina: number;
  tempo_tipico_pagina_s: number | null;
  tempo_medio_pagina_s: number | null;
  viste_con_tempo: number;
  viste_precedente: number;
  sessioni_precedente: number;
  visitatori_precedente: number;
  crescita_viste_pct: number | null;
  crescita_sessioni_pct: number | null;
  crescita_visitatori_pct: number | null;
  richieste: number;
  tasso_richiesta_pct: number | null;
}

interface Pagina {
  pagina: string; titolo: string | null; viste: number; visitatori: number;
  tempo_tipico_s: number | null; tempo_medio_s: number | null; misurate: number;
  uscite: number; uscite_pct: number | null;
}

interface Ingresso {
  pagina: string; ingressi: number; senza_seguito: number; senza_seguito_pct: number | null;
}

interface Fonte { fonte: string; sessioni: number; visitatori: number; richieste: number }

interface Richiesta {
  quando: string; nome: string | null; fonte: string; ingresso: string; pagine: number | null;
}

interface Giorno { giorno: string; viste: number; sessioni: number; visitatori: number }

interface Traffico {
  riepilogo: Riepilogo;
  pagine: Pagina[];
  ingressi: Ingresso[];
  fonti: Fonte[];
  richieste: Richiesta[];
  giorni: Giorno[];
  calcolato_il: string;
}

function durata(secondi: number | null | undefined): string {
  if (secondi === null || secondi === undefined) return "—";
  if (secondi < 60) return `${Math.round(secondi)}s`;
  return `${Math.floor(secondi / 60)}m ${Math.round(secondi % 60)}s`;
}

/** "2028-09-15" letto come giorno locale: a mezzogiorno nessun fuso lo sposta. */
function giornoLocale(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

/** Il confronto col periodo precedente, detto come si direbbe a voce. */
function confronto(pct: number | null, precedente: number): string {
  if (pct === null) return precedente > 0 ? "come il periodo prima" : "primo periodo misurato";
  if (pct === 0) return "come il periodo prima";
  return `${pct > 0 ? "+" : ""}${pct}% sul periodo prima`;
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
        <p className={`text-xl md:text-2xl font-semibold tabular-nums ${colore}`}>{valore}</p>
        {dettaglio && <p className="text-[11px] text-muted-foreground mt-0.5">{dettaglio}</p>}
      </CardContent>
    </Card>
  );
}

const PERIODI = [7, 30, 90];

export default function SiteTrafficPage() {
  const [giorni, setGiorni] = useState(30);
  const [mostraNumeriGiorni, setMostraNumeriGiorni] = useState(false);

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
  const richieste = data?.richieste ?? [];
  const serie = data?.giorni ?? [];

  const unaPaginaPct = r && r.sessioni > 0
    ? Math.round((100 * r.sessioni_una_pagina) / r.sessioni) : null;

  // Con 7 giorni si leggono tutte le date; con 90 si tiene un'etichetta ogni
  // settimana circa, altrimenti l'asse diventa una riga di numeri sovrapposti.
  const intervalloEtichette = serie.length > 45 ? 13 : serie.length > 14 ? 4 : 0;

  return (
    <div className="p-3 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="hidden md:flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-blue-500" />
          <div>
            <h1 className="text-xl font-semibold">Traffico del sito</h1>
            <p className="text-sm text-muted-foreground">
              Chi arriva, da dove, cosa guarda e quanti scrivono — misurato da noi, non da Google
              {data?.calcolato_il && ` · aggiornato alle ${format(new Date(data.calcolato_il), "HH:mm")}`}
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
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}
                  aria-label="Aggiorna">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {error && (
        <Card><CardContent className="p-6">
          <p className="text-sm text-destructive">
            Non riesco a caricare i dati del traffico: {(error as Error).message}
          </p>
        </CardContent></Card>
      )}

      {isLoading && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      )}

      {r && (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <Tessera etichetta="Visitatori" valore={r.visitatori}
                     dettaglio={confronto(r.crescita_visitatori_pct, r.visitatori_precedente)}
                     tono={(r.crescita_visitatori_pct ?? 0) > 0 ? "buono" : "neutro"} />
            <Tessera etichetta="Visite" valore={r.sessioni}
                     dettaglio={`${r.pagine_per_sessione ?? "—"} pagine a visita · ${confronto(r.crescita_sessioni_pct, r.sessioni_precedente)}`}
                     tono={(r.crescita_sessioni_pct ?? 0) > 0 ? "buono" : "neutro"} />
            <Tessera etichetta="Pagine viste" valore={r.pagine_viste}
                     dettaglio={confronto(r.crescita_viste_pct, r.viste_precedente)}
                     tono={(r.crescita_viste_pct ?? 0) > 0 ? "buono" : "neutro"} />
            <Tessera etichetta="Richieste" valore={r.richieste}
                     dettaglio={r.tasso_richiesta_pct !== null
                       ? `${r.tasso_richiesta_pct}% delle visite ha scritto`
                       : "nessuna visita nel periodo"}
                     tono={r.richieste > 0 ? "buono" : "neutro"} />
            <Tessera etichetta="Tempo tipico su una pagina" valore={durata(r.tempo_tipico_pagina_s)}
                     dettaglio={r.viste_con_tempo > 0
                       ? `metà delle letture dura meno · su ${r.viste_con_tempo} viste`
                       : "nessuna vista ancora misurata"} />
            <Tessera etichetta="Visite di una pagina sola"
                     valore={unaPaginaPct === null ? "—" : `${unaPaginaPct}%`}
                     dettaglio={`${r.sessioni_una_pagina} visite su ${r.sessioni}`}
                     tono={unaPaginaPct !== null && unaPaginaPct > 70 ? "attenzione" : "neutro"} />
          </div>

          {serie.length > 1 && (
            <Card>
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  Visitatori giorno per giorno
                </CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-xs"
                        onClick={() => setMostraNumeriGiorni((v) => !v)}>
                  {mostraNumeriGiorni ? "Nascondi i numeri" : "Mostra i numeri"}
                </Button>
              </CardHeader>
              <CardContent>
                <div role="img"
                     aria-label={`Visitatori al giorno negli ultimi ${r.giorni} giorni, in ora italiana`}>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={serie} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
                              barCategoryGap={serie.length > 45 ? 1 : 2}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="giorno" tickLine={false} axisLine={false}
                             interval={intervalloEtichette}
                             tickFormatter={(g: string) => format(giornoLocale(g), "d MMM", { locale: it })}
                             tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40}
                             tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                        labelFormatter={(g: string) => format(giornoLocale(g), "EEEE d MMMM", { locale: it })}
                        formatter={(valore: number, _nome: string, voce: { payload?: Giorno }) => [
                          `${valore} visitatori · ${voce.payload?.sessioni ?? 0} visite · ${voce.payload?.viste ?? 0} pagine`,
                          "",
                        ]}
                        separator=""
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Bar dataKey="visitatori" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}
                           maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  I giorni sono in ora italiana: una visita all'una di notte sta nel suo giorno, non
                  in quello prima. I giorni senza visite ci sono, a zero.
                </p>
              </CardContent>
              {mostraNumeriGiorni && (
                <CardContent className="p-0 overflow-x-auto border-t">
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
                      {[...serie].reverse().map((g) => (
                        <tr key={g.giorno} className="border-b last:border-0">
                          <td className="p-2 whitespace-nowrap">
                            {format(giornoLocale(g.giorno), "EEE d MMM", { locale: it })}
                          </td>
                          <td className="p-2 text-right tabular-nums">{g.visitatori}</td>
                          <td className="p-2 text-right tabular-nums">{g.sessioni}</td>
                          <td className="p-2 text-right tabular-nums">{g.viste}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              )}
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Inbox className="h-4 w-4 text-muted-foreground" />
                Visite diventate richieste
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr className="text-left">
                    <th className="p-2 font-medium">Quando</th>
                    <th className="p-2 font-medium">Chi</th>
                    <th className="p-2 font-medium">Da dove</th>
                    <th className="p-2 font-medium hidden md:table-cell">Entrato da</th>
                    <th className="p-2 font-medium text-right">Pagine viste</th>
                  </tr>
                </thead>
                <tbody>
                  {richieste.length === 0 && (
                    <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">
                      Nessuna richiesta arrivata dal sito nel periodo
                    </td></tr>
                  )}
                  {richieste.map((q, i) => (
                    <tr key={`${q.quando}-${i}`} className="border-b last:border-0">
                      <td className="p-2 whitespace-nowrap">
                        {format(new Date(q.quando), "d MMM, HH:mm", { locale: it })}
                      </td>
                      <td className="p-2">{q.nome ?? "—"}</td>
                      <td className="p-2">{q.fonte}</td>
                      <td className="p-2 font-mono text-xs hidden md:table-cell">{q.ingresso}</td>
                      <td className="p-2 text-right tabular-nums">{q.pagine ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
            <CardContent className="pt-3">
              <p className="text-[11px] text-muted-foreground">
                Una visita diventa richiesta quando chi naviga compila un modulo del sito. «Pagine
                viste» dice quanto ha guardato prima di decidersi: una sola è chi sapeva già cosa
                voleva, dieci è chi si è convinto leggendo.
              </p>
            </CardContent>
          </Card>

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
                    <th className="p-2 font-medium text-right">Tempo tipico</th>
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
                      <td className="p-2 text-right tabular-nums">{durata(p.tempo_tipico_s)}</td>
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
            <CardContent className="pt-3 space-y-1.5">
              <p className="text-[11px] text-muted-foreground">
                <strong>Tempo tipico</strong> è la mediana: metà delle letture dura meno di così. Non
                è la media perché una scheda lasciata aperta per ore la sposterebbe da sola — sul
                periodo di partenza la media diceva 3 minuti, la lettura tipica era di 40 secondi.
              </p>
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
                      <th className="p-2 font-medium text-right hidden md:table-cell">Visitatori</th>
                      <th className="p-2 font-medium text-right">Richieste</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fonti.length === 0 && (
                      <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">
                        Nessuna visita nel periodo
                      </td></tr>
                    )}
                    {fonti.map((f) => (
                      <tr key={f.fonte} className="border-b last:border-0">
                        <td className="p-2">{f.fonte}</td>
                        <td className="p-2 text-right tabular-nums">{f.sessioni}</td>
                        <td className="p-2 text-right tabular-nums hidden md:table-cell">{f.visitatori}</td>
                        <td className={`p-2 text-right tabular-nums ${f.richieste > 0 ? "font-medium" : "text-muted-foreground"}`}>
                          {f.richieste}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
              <CardContent className="pt-3">
                <p className="text-[11px] text-muted-foreground">
                  La fonte è quella d'ingresso, fotografata alla prima pagina: non viene
                  sovrascritta dalla navigazione successiva. «Diretto» comprende anche chi arriva
                  da un'app che non passa il referrer. «Assistenti AI» sono ChatGPT, Perplexity,
                  Copilot, Gemini e simili: si riconoscono anche dal tag che aggiungono da soli ai
                  link che citano.
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
