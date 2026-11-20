import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandPageHeader } from "@/components/admin/BrandPageHeader";
import {
  DOMINIO_EIC, dominioSito, PERIODI_TRAFFICO, periodoTraffico, periodoConfrontoGoogle,
  useSitiGoogleMetriche, useConfrontoGoogle,
} from "@/hooks/useSitiGoogleMetriche";
import { retryAuthorizedRead } from "@/lib/retryAuthorizedRead";
import { ArrowUpRight, BarChart3, RefreshCw, LogIn, Compass, FileText, Inbox, CalendarDays } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface Riepilogo {
  pagine_viste: number;
  sessioni: number;
  visitatori: number;
  pagine_per_sessione: number | null;
  sessioni_una_pagina: number;
  tempo_tipico_pagina_s: number | null;
  tempo_medio_pagina_s: number | null;
  viste_con_tempo: number;
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

const numero = new Intl.NumberFormat("it-IT");
const ora = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

function confronto(pct: number | null): string {
  if (pct === null) return "Senza confronto con il periodo precedente";
  if (pct === 0) return "Come il periodo precedente";
  return `${pct > 0 ? "+" : ""}${numero.format(pct)}% sul periodo precedente`;
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
        <p className={`text-xl md:text-2xl font-semibold tabular-nums ${colore}`}>{typeof valore === "number" ? numero.format(valore) : valore}</p>
        {dettaglio && <p className="text-[11px] text-muted-foreground mt-0.5">{dettaglio}</p>}
      </CardContent>
    </Card>
  );
}

const METRICHE = {
  visitatori: "Visitatori",
  sessioni: "Visite",
  viste: "Pagine viste",
} as const;
type Metrica = keyof typeof METRICHE;

function DatiGoogleTraffico({ giorni }: { giorni: number }) {
  const { data, isLoading, isError, refetch } = useSitiGoogleMetriche(giorni);
  const sito = data?.siti.find(s => dominioSito(s.dominio) === DOMINIO_EIC);
  const organico = useConfrontoGoogle(giorni, !!(sito?.ga4_property_id && sito?.gsc_site_url));
  const confronto = sito && organico.data?.[sito.id];
  const ga4ConDati = sito && (sito.sessioni > 0 || sito.visualizzazioni > 0 || sito.utenti > 0);
  const gscConDati = sito && (sito.impressioni > 0 || sito.clic > 0);
  const statoFonte = (proprieta: string | null | undefined, conDati: boolean | undefined) =>
    !proprieta ? "Proprietà da associare" : conDati ? undefined : "Nessun dato per il periodo";
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 p-4">
        <div>
          <CardTitle className="text-base">Google · {DOMINIO_EIC}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">GA4 misura le visite. Search Console mostra la visibilità nella ricerca Google.</p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to={`/admin/siti?giorni=${giorni}&sito=${DOMINIO_EIC}&traffico=organico`}>Confronta tutti i siti <ArrowUpRight className="size-4" /></Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        {isLoading && <Skeleton className="h-24 w-full" />}
        {isError && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          Impossibile aggiornare i dati Google.
          <Button size="sm" variant="outline" onClick={() => void refetch()}>Riprova</Button>
        </div>}
        {data && !data.chiave_google && <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          L’account di servizio Google va configurato in «Siti e Google».
        </p>}
        {data && !sito && <p className="text-sm text-muted-foreground">Il sito va aggiunto in «Siti e Google».</p>}
        {sito?.ga4_property_id && sito?.gsc_site_url && (
          <section className="rounded-lg border bg-muted/25 p-4" aria-label="Confronto Google organico">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">Google organico</h3>
              {confronto && <p className="text-xs text-muted-foreground">{periodoConfrontoGoogle(confronto)}</p>}
            </div>
            {organico.isLoading && <Skeleton className="mt-3 h-14 w-full" />}
            {organico.isError && <div className="mt-2 flex flex-wrap items-center gap-2 text-sm" role="alert">
              Impossibile aggiornare il confronto organico.
              <Button size="sm" variant="outline" onClick={() => void organico.refetch()}>Riprova confronto</Button>
            </div>}
            {!confronto && !organico.isLoading && !organico.isError && (
              <p className="mt-1.5 text-sm text-muted-foreground">Nessun giorno in comune nel periodo selezionato.</p>
            )}
            {confronto && (
              <dl className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-md border bg-card p-2.5 sm:p-3">
                  <dt className="text-xs text-muted-foreground">Clic Search Console</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">{numero.format(confronto.clic)}</dd>
                </div>
                <div className="rounded-md border bg-card p-2.5 sm:p-3">
                  <dt className="text-xs text-muted-foreground">Sessioni organiche GA4</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">{numero.format(confronto.sessioni)}</dd>
                </div>
              </dl>
            )}
          </section>
        )}
        {sito && (
          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            {[
              { label: "GA4 · Tutti i canali", stato: statoFonte(sito.ga4_property_id, ga4ConDati), valori: [{ label: "Visite", valore: sito.sessioni }, { label: "Pagine viste", valore: sito.visualizzazioni }] },
              { label: "Search Console", stato: statoFonte(sito.gsc_site_url, gscConDati), valori: [{ label: "Clic dalla ricerca", valore: sito.clic }, { label: "Impressioni", valore: sito.impressioni }] },
            ].map(fonte => (
              <section key={fonte.label} className="rounded-lg border p-3">
                <h3 className="font-medium">{fonte.label}</h3>
                {fonte.stato ? <p className="mt-1 text-sm text-muted-foreground">{fonte.stato}</p> : (
                  <dl className="mt-2 grid grid-cols-2 gap-2">
                    {fonte.valori.map(({ label, valore }) => <div key={label}>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="text-xl font-semibold tabular-nums">{numero.format(valore)}</dd>
                    </div>)}
                  </dl>
                )}
              </section>
            ))}
          </div>
        )}
        {sito?.ultimo_errore && <p className="break-words text-sm text-destructive">{sito.ultimo_errore}</p>}
      </CardContent>
    </Card>
  );
}

export default function SiteTrafficPage() {
  const [parametri, setParametri] = useSearchParams();
  const giorni = periodoTraffico(parametri.get("giorni"), 30);
  const [metrica, setMetrica] = useState<Metrica>("visitatori");
  const [mostraNumeriGiorni, setMostraNumeriGiorni] = useState(false);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["admin-sito-traffico", giorni],
    queryFn: async () => {
      // La funzione non è nei tipi generati (rigenerati di rado): il cast
      // evita un errore di compilazione senza spegnere i tipi altrove.
      const { data, error } = await supabase.rpc("admin_sito_traffico" as never, { p_giorni: giorni } as never);
      if (error) throw error;
      if (!data) throw new Error("Dati del traffico non disponibili.");
      return data as unknown as Traffico;
    },
    staleTime: 60_000,
    retry: retryAuthorizedRead,
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
    <div className="max-w-[1600px] min-w-0 space-y-4">
      <BrandPageHeader compact icon={BarChart3} title="Traffico del sito"
        subtitle={`Dati raccolti dal sito pubblico${data?.calcolato_il ? ` · Aggiornato alle ${ora.format(new Date(data.calcolato_il))}` : ""}`} />
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-2.5">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Periodo del traffico">
          {PERIODI_TRAFFICO.map(g => (
            <Button key={g} size="sm" variant={g === giorni ? "secondary" : "ghost"} aria-pressed={g === giorni}
              onClick={() => setParametri(prev => {
                const next = new URLSearchParams(prev);
                next.set("giorni", String(g));
                return next;
              }, { replace: true })}>{g} giorni</Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`size-4 ${isFetching ? "motion-safe:animate-spin" : ""}`} /> Aggiorna traffico
        </Button>
      </div>

      {error && (
        <Card><CardContent role="alert" className="flex flex-wrap items-center gap-2 p-4 text-sm">
          <span className="text-destructive">Impossibile aggiornare i dati del traffico.</span>
          <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={isFetching}>Riprova</Button>
        </CardContent></Card>
      )}

      {isLoading && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      )}

      {r && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tessera etichetta="Visitatori" valore={r.visitatori}
                   dettaglio={confronto(r.crescita_visitatori_pct)}
                   tono={(r.crescita_visitatori_pct ?? 0) > 0 ? "buono" : "neutro"} />
          <Tessera etichetta="Visite" valore={r.sessioni}
                   dettaglio={`${r.pagine_per_sessione === null ? "—" : numero.format(r.pagine_per_sessione)} pagine a visita · ${confronto(r.crescita_sessioni_pct)}`}
                   tono={(r.crescita_sessioni_pct ?? 0) > 0 ? "buono" : "neutro"} />
          <Tessera etichetta="Pagine viste" valore={r.pagine_viste}
                   dettaglio={confronto(r.crescita_viste_pct)}
                   tono={(r.crescita_viste_pct ?? 0) > 0 ? "buono" : "neutro"} />
          <Tessera etichetta="Richieste" valore={r.richieste}
                   dettaglio={r.tasso_richiesta_pct !== null
                     ? `${numero.format(r.tasso_richiesta_pct)} richieste ogni 100 visite`
                     : "nessuna visita nel periodo"}
                   tono={r.richieste > 0 ? "buono" : "neutro"} />
        </div>
      )}

      <Tabs defaultValue={parametri.get("scheda") === "google" ? "google" : "andamento"}>
        <TabsList aria-label="Dettaglio del traffico" className="h-auto w-full flex-wrap justify-start gap-0.5">
          <TabsTrigger value="andamento">Andamento</TabsTrigger>
          <TabsTrigger value="pagine">Pagine</TabsTrigger>
          <TabsTrigger value="fonti">Fonti</TabsTrigger>
          <TabsTrigger value="richieste">Richieste</TabsTrigger>
          <TabsTrigger value="google">Dati Google</TabsTrigger>
        </TabsList>
        <TabsContent className="min-w-0 space-y-3" value="andamento">
          {r && <div className="grid gap-3 sm:grid-cols-2">
            <Tessera etichetta="Tempo tipico su una pagina" valore={durata(r.tempo_tipico_pagina_s)}
                     dettaglio={r.viste_con_tempo > 0
                       ? `metà delle letture dura meno · su ${r.viste_con_tempo} viste`
                       : "nessuna vista ancora misurata"} />
            <Tessera etichetta="Visite di una pagina sola"
                     valore={unaPaginaPct === null ? "—" : `${unaPaginaPct}%`}
                     dettaglio={`${r.sessioni_una_pagina} visite su ${r.sessioni}`}
                     tono={unaPaginaPct !== null && unaPaginaPct > 70 ? "attenzione" : "neutro"} />
          </div>}
          {serie.length > 1 && (
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 px-4 pb-2 pt-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  Andamento giornaliero
                </CardTitle>
                <div className="flex flex-wrap gap-1" role="group" aria-label="Metrica del grafico">
                  {(Object.keys(METRICHE) as Metrica[]).map(chiave => (
                    <Button key={chiave} variant={chiave === metrica ? "secondary" : "ghost"} size="sm"
                      aria-pressed={chiave === metrica} onClick={() => setMetrica(chiave)}>{METRICHE[chiave]}</Button>
                  ))}
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-xs"
                        aria-expanded={mostraNumeriGiorni}
                        onClick={() => setMostraNumeriGiorni((v) => !v)}>
                  {mostraNumeriGiorni ? "Nascondi i numeri" : "Mostra i numeri"}
                </Button>
              </CardHeader>
              <CardContent>
                <div role="img"
                     aria-label={`${METRICHE[metrica]} al giorno negli ultimi ${giorni} giorni, in ora italiana`}>
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
                        formatter={(_valore: number, _nome: string, voce: { payload?: Giorno }) => [
                          `${voce.payload?.visitatori ?? 0} visitatori · ${voce.payload?.sessioni ?? 0} visite · ${voce.payload?.viste ?? 0} pagine`,
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
                      <Bar dataKey={metrica} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}
                           maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Giorni in ora italiana.
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

        </TabsContent>
        <TabsContent className="min-w-0" value="richieste">
          {r && <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Inbox className="h-4 w-4 text-muted-foreground" />
                Richieste dal sito
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
                Le richieste sono ordinate per data di invio del modulo.
              </p>
            </CardContent>
          </Card>}
        </TabsContent>
        <TabsContent className="min-w-0" value="pagine">
          {r && <Card>
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
                        <span className="break-all font-mono text-xs">{p.pagina}</span>
                        {p.titolo && (
                          <span className="block text-[11px] text-muted-foreground break-words md:max-w-[420px]">
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
                <strong>Tempo tipico</strong> indica la mediana delle visualizzazioni misurate. <strong>Uscite</strong> indica quante volte la pagina è stata l’ultima della visita.
              </p>
            </CardContent>
          </Card>}
        </TabsContent>
        <TabsContent className="min-w-0" value="fonti">
          {r && <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <LogIn className="h-4 w-4 text-muted-foreground" />
                  Pagine di ingresso
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
                        <td className="p-2 break-all font-mono text-xs">{i.pagina}</td>
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
                  «Senza seguito» indica le visite terminate sulla pagina di ingresso.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Compass className="h-4 w-4 text-muted-foreground" />
                  Origine delle visite
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
                  La fonte è rilevata all’ingresso. «Diretto» include anche le visite senza fonte riconoscibile.
                </p>
              </CardContent>
            </Card>
          </div>}
        </TabsContent>
        <TabsContent className="min-w-0" value="google">
          <DatiGoogleTraffico giorni={giorni} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
