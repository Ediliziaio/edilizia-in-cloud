/**
 * La scheda di un cliente marketing: il report completo senza entrare
 * nell'azienda. In testa chi è, i suoi servizi e i numeri del periodo con il
 * confronto; poi «di chi è» (cosa dipende da noi e cosa dal cliente), e le
 * tabelle: giorno per giorno come il report del titolare, settimane con le
 * variazioni, i lead con chi li ha presi in carico e quanto ci ha messo, le
 * vendite con il lead d'origine, l'imbuto e chi lavora dentro l'azienda.
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowLeft, BellPlus, CalendarCheck, Coins, Download, Inbox, Loader2, LogIn, Pencil,
  Printer, Receipt, SlidersHorizontal, Trophy, Users, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  csvGiorni, useAppuntamentiCliente, useAssegnaResponsabile, useCanaliCliente, useInserzioniCliente,
  useResponsabili, useSalvaDiario, useSchedaCliente, type GiornoScheda,
} from "./useSchedaCliente";
import { CanaliCliente } from "./CanaliCliente";
import { CampagneCliente } from "./CampagneCliente";
import { DiarioSettimana } from "./DiarioSettimana";
import type { Metriche, Allarme } from "./useMktConsole";
import { variazione, type ClienteMarketing } from "./provvigioni";
import { dataBreve, eur, numero, ore } from "./formato";
import { Sparkline } from "./Sparkline";

const PERIODI = [
  { id: "7", label: "7 giorni", giorni: 7 },
  { id: "30", label: "30 giorni", giorni: 30 },
  { id: "90", label: "90 giorni", giorni: 90 },
] as const;

// Il tempo di richiamo promesso al cliente: 24 ore di servizio, e il
// cronometro nel fine settimana e' fermo (vedi mkt_orario_servizio).
const RICHIAMO_ORE = 24;

const chiaveGiorno = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

interface Props {
  serviceClientId: string;
  cliente: ClienteMarketing | null;
  metriche: Metriche | null;
  allarmi: Allarme[];
  oggi: Date;
  puoEntrare: boolean;
  entraInCorso: boolean;
  onEntra: (pagina?: string) => void;
  onChiudi: () => void;
  onCosti: () => void;
  onIncassi: () => void;
  onSoglie: () => void;
  onPromemoria: () => void;
  onContratto: () => void;
  onNuovoServizio: () => void;
  onReport: () => void;
}

function Kpi({ etichetta, valore, nota, delta, tono }: { etichetta: string; valore: string; nota?: string | null; delta?: number | null; tono?: "ok" | "attenzione" }) {
  return (
    <div className={cn("min-w-0 rounded-lg px-3 py-2.5", tono === "attenzione" ? "bg-rose-50 dark:bg-rose-950/40" : "bg-muted/40")}>
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{etichetta}</div>
      <div className="mt-0.5 text-lg font-bold leading-tight tabular-nums">{valore}</div>
      {delta != null && (
        <div className={cn("text-[11px] font-medium", delta === 0 ? "text-muted-foreground" : delta > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")}>
          {delta > 0 ? "+" : ""}{numero(delta)}% sul periodo prima
        </div>
      )}
      {nota && <div className="truncate text-[11px] text-muted-foreground" title={nota}>{nota}</div>}
    </div>
  );
}

const th = "px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap";
const tdc = "px-2 py-1.5 tabular-nums whitespace-nowrap";

export function SchedaClienteMarketing({
  serviceClientId, cliente, metriche, allarmi, oggi, puoEntrare, entraInCorso,
  onEntra, onChiudi, onCosti, onIncassi, onSoglie, onPromemoria, onContratto, onNuovoServizio, onReport,
}: Props) {
  const [periodo, setPeriodo] = useState<(typeof PERIODI)[number]["id"]>("30");
  const giorniPeriodo = PERIODI.find((p) => p.id === periodo)!.giorni;
  const da = useMemo(() => chiaveGiorno(new Date(oggi.getTime() - (giorniPeriodo - 1) * 86400000)), [oggi, giorniPeriodo]);
  const a = useMemo(() => chiaveGiorno(oggi), [oggi]);
  const { data, isLoading, isError, isFetching, refetch } = useSchedaCliente(serviceClientId, da, a);
  const canali = useCanaliCliente(serviceClientId, da, a);
  const [livello, setLivello] = useState<"campagna" | "inserzione">("campagna");
  const campagne = useInserzioniCliente(serviceClientId, livello, da, a);
  const appuntamenti = useAppuntamentiCliente(serviceClientId, da, a);
  const salvaDiario = useSalvaDiario(serviceClientId);
  const assegna = useAssegnaResponsabile();
  const [cambiaResponsabile, setCambiaResponsabile] = useState(false);
  const responsabili = useResponsabili(cambiaResponsabile);

  const nome = data?.cliente?.cliente_nome ?? cliente?.cliente_nome ?? "Cliente";
  const t = data?.totali;
  const prec = data?.precedente;
  const serie = useMemo(() => [...(data?.giorni ?? [])].sort((x, y) => x.giorno.localeCompare(y.giorno)).map((g) => g.lead), [data?.giorni]);

  const scarica = () => {
    if (!data) return;
    const blob = new Blob(["﻿" + csvGiorni(data.giorni, nome)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${nome.replace(/[^\w]+/g, "-").toLowerCase()}-giorno-per-giorno-${da}_${a}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Uno zero sui sopralluoghi va spiegato: il cliente non ne fa, oppure li fa e
  // non li segna? La seconda è una cosa da dirgli, non da rinfacciargli.
  const notaAppuntamenti = useMemo(() => {
    const ap = appuntamenti.data;
    if (!ap) return null;
    if (ap.da_calendario > 0 || ap.da_fase > 0) {
      const pezzi: string[] = [];
      if (ap.da_calendario > 0) pezzi.push(`${numero(ap.da_calendario)} in calendario`);
      if (ap.da_fase > 0) pezzi.push(`${numero(ap.da_fase)} da fase`);
      return pezzi.join(", ");
    }
    const inutilizzate = ap.fasi.filter((f) => f.ingressi === 0);
    if (inutilizzate.length > 0) {
      return `la fase «${inutilizzate[0].fase}» c'è ma non la usa nessuno`;
    }
    return "nessuna fase di appuntamento nel CRM";
  }, [appuntamenti.data]);

  // «Di chi è»: a sinistra quello che dipende da noi, a destra dal cliente.
  const nostro = [
    { k: "Spesa", v: eur(t?.spesa ?? 0) },
    { k: "Richieste arrivate", v: numero(t?.lead ?? 0), d: variazione(t?.lead ?? 0, prec?.lead ?? 0) },
    { k: "Costo per richiesta", v: t?.cpl != null ? eur(t.cpl, 2) : "—", nota: metriche?.cpl_target != null ? `target ${eur(metriche.cpl_target, 2)}` : null,
      male: t?.cpl != null && metriche?.cpl_rosso != null && t.cpl > metriche.cpl_rosso },
    { k: "Persone raggiunte", v: t?.copertura ? numero(t.copertura) : "—" },
  ];
  const suo = [
    { k: "Richieste toccate", v: `${numero(t?.lavorate ?? 0)} / ${numero(t?.opportunita ?? 0)}`, nota: t?.tasso_lavorati != null ? `${Math.round(t.tasso_lavorati * 100)}%` : null,
      male: (t?.tasso_lavorati ?? 1) < 0.6 },
    { k: "Tempo di richiamo", v: t?.mediana_min != null ? ore(t.mediana_min / 60) : "—", nota: `entro ${RICHIAMO_ORE} ore`, male: (t?.mediana_min ?? 0) > RICHIAMO_ORE * 60 },
    { k: "Sopralluoghi", v: numero(t?.appuntamenti ?? 0), nota: notaAppuntamenti,
      d: variazione(t?.appuntamenti ?? 0, prec?.appuntamenti ?? 0), male: (t?.appuntamenti ?? 0) === 0 && (t?.lead ?? 0) > 10 },
    { k: "Contratti", v: `${numero(t?.vendite ?? 0)} · ${eur(t?.valore ?? 0)}`, d: variazione(t?.vendite ?? 0, prec?.vendite ?? 0) },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onChiudi}><ArrowLeft className="h-4 w-4" /> Tutti i clienti</Button>
        <div className="inline-flex rounded-lg border p-0.5">
          {PERIODI.map((p) => (
            <button key={p.id} type="button" onClick={() => setPeriodo(p.id)}
              className={cn("rounded-md px-2.5 py-1 text-xs transition-colors", periodo === p.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {p.label}
            </button>
          ))}
        </div>
        {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onEntra()} disabled={!puoEntrare || entraInCorso}>
            {entraInCorso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />} Entra nell'azienda
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={onCosti}><Receipt className="h-3.5 w-3.5" /> Costi</Button>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={onIncassi}><Wallet className="h-3.5 w-3.5" /> Incassi</Button>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={onSoglie}><SlidersHorizontal className="h-3.5 w-3.5" /> Soglie</Button>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={onPromemoria}><BellPlus className="h-3.5 w-3.5" /> Promemoria</Button>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={onContratto}><Pencil className="h-3.5 w-3.5" /> Contratto</Button>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={onReport}><Printer className="h-3.5 w-3.5" /> Report</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3"><Skeleton className="h-28 w-full rounded-xl" /><Skeleton className="h-64 w-full rounded-xl" /></div>
      ) : isError || !data?.cliente ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border py-14 text-center">
          <AlertTriangle className="h-9 w-9 text-amber-500/60" />
          <p className="text-sm text-muted-foreground">Non riesco a leggere la scheda di questo cliente.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>Riprova</Button>
        </div>
      ) : (
        <>
          <section className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start gap-3">
              <Avatar className="h-12 w-12 shrink-0 rounded-lg">
                {data.cliente.logo_url && <AvatarImage src={data.cliente.logo_url} alt="" className="object-contain" />}
                <AvatarFallback className="rounded-lg bg-primary/10 text-sm font-semibold text-primary">{nome.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold leading-tight">{nome}</h2>
                  <Badge variant="secondary" className="border-0 text-[10px]">{data.cliente.stato}</Badge>
                  {data.cliente.mkt_settore && <Badge variant="outline" className="text-[10px]">{data.cliente.mkt_settore}</Badge>}
                  {data.cliente.mkt_classe && <Badge variant="outline" className="text-[10px]">classe {data.cliente.mkt_classe}</Badge>}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                  <span>{data.cliente.data_inizio ? `cliente dal ${dataBreve(data.cliente.data_inizio, false, oggi)}` : "senza data d'inizio"} ·</span>
                  {/* Chi segue il cliente: da qui in avanti decide anche chi ne vede i numeri. */}
                  {cambiaResponsabile ? (
                    <select autoFocus disabled={assegna.isPending}
                      className="rounded border bg-background px-1.5 py-0.5 text-xs"
                      defaultValue={data.cliente.commerciale_id ?? ""}
                      onBlur={() => setCambiaResponsabile(false)}
                      onChange={(e) => {
                        assegna.mutate({ serviceClientId, userId: e.target.value || null },
                          { onSettled: () => setCambiaResponsabile(false) });
                      }}>
                      <option value="">nessun responsabile</option>
                      {(responsabili.data ?? []).map((r) => (
                        <option key={r.id} value={r.id}>{r.nome}{r.clienti > 0 ? ` (${r.clienti})` : ""}</option>
                      ))}
                    </select>
                  ) : (
                    <button type="button" onClick={() => setCambiaResponsabile(true)}
                      className="underline-offset-2 hover:text-foreground hover:underline"
                      title="Chi segue questo cliente vede i suoi numeri nella console e nel rapporto del mattino">
                      {data.cliente.responsabile_nome ?? data.cliente.commerciale ?? "nessun responsabile"}
                    </button>
                  )}
                  <span>
                    {data.cliente.mkt_budget_mensile ? ` · budget ${eur(data.cliente.mkt_budget_mensile)}/mese` : " · budget non impostato"}
                    {data.cliente.azienda_email ? ` · ${data.cliente.azienda_email}` : ""}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {data.servizi.map((s) => (
                    <span key={s.id} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]",
                      s.corrente ? "border-primary/40 bg-primary/5 font-medium" : "text-muted-foreground")}>
                      {s.servizio} · {s.stato}
                      {s.data_inizio ? ` · dal ${dataBreve(s.data_inizio, false, oggi)}` : ""}
                      {s.incassato > 0 ? ` · incassato ${eur(s.incassato)}` : ""}
                    </span>
                  ))}
                  <button type="button" onClick={onNuovoServizio} title="Aggiunge un secondo servizio a questo cliente (consulenza, formazione, vendita…)"
                    className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">
                    + aggiungi servizio
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <Kpi etichetta="Spesa" valore={eur(t?.spesa ?? 0)} delta={variazione(t?.spesa ?? 0, prec?.spesa ?? 0)} nota={`${data.periodo.giorni} giorni`} />
            <Kpi etichetta="Richieste" valore={numero(t?.lead ?? 0)} delta={variazione(t?.lead ?? 0, prec?.lead ?? 0)}
              nota={t?.cpl != null ? `${eur(t.cpl, 2)} l'una` : "senza spesa registrata"} />
            <Kpi etichetta="Toccate" valore={t?.tasso_lavorati != null ? `${Math.round(t.tasso_lavorati * 100)}%` : "—"}
              nota={`${numero(t?.lavorate ?? 0)} su ${numero(t?.opportunita ?? 0)}`} tono={(t?.tasso_lavorati ?? 1) < 0.6 ? "attenzione" : undefined} />
            <Kpi etichetta="Richiamo" valore={t?.mediana_min != null ? ore(t.mediana_min / 60) : "—"} nota="mediana in orario"
              tono={(t?.mediana_min ?? 0) > RICHIAMO_ORE * 60 ? "attenzione" : undefined} />
            <Kpi etichetta="Sopralluoghi" valore={numero(t?.appuntamenti ?? 0)} delta={variazione(t?.appuntamenti ?? 0, prec?.appuntamenti ?? 0)}
              nota={t?.costo_appuntamento != null ? `${eur(t.costo_appuntamento)} l'uno` : null} />
            <Kpi etichetta="Contratti" valore={`${numero(t?.vendite ?? 0)}`} delta={variazione(t?.vendite ?? 0, prec?.vendite ?? 0)}
              nota={`${eur(t?.valore ?? 0)}${t?.roas != null ? ` · ${t.roas.toLocaleString("it-IT")}× la spesa` : ""}`} />
          </section>

          <section className="grid gap-2 md:grid-cols-2">
            {[{ titolo: "Dipende da noi", voci: nostro }, { titolo: "Dipende dal cliente", voci: suo }].map((col) => (
              <div key={col.titolo} className="rounded-xl border bg-card p-3 shadow-sm">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{col.titolo}</div>
                <ul className="space-y-1 text-sm">
                  {col.voci.map((v) => (
                    <li key={v.k} className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-muted-foreground">{v.k}</span>
                      <span className={cn("font-medium tabular-nums", "male" in v && v.male ? "text-rose-700 dark:text-rose-400" : "")}>
                        {v.v}
                        {"nota" in v && v.nota ? <span className="ml-1 text-[11px] font-normal text-muted-foreground">{v.nota}</span> : null}
                        {"d" in v && v.d != null ? <span className={cn("ml-1 text-[11px] font-normal", v.d >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")}>{v.d > 0 ? "+" : ""}{numero(v.d)}%</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          {allarmi.length > 0 && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl border bg-card px-4 py-2 text-xs shadow-sm">
              {allarmi.map((al) => (
                <li key={al.id} className={cn("inline-flex items-center gap-1.5", al.gravita === "giallo" ? "text-amber-700 dark:text-amber-400" : al.gravita === "nota" ? "text-muted-foreground" : "text-rose-700 dark:text-rose-400")}>
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {al.titolo}
                </li>
              ))}
            </ul>
          )}

          <DiarioSettimana
            righe={data.diario ?? []}
            oggi={oggi}
            salvataggio={salvaDiario.isPending}
            onSalva={(v) => salvaDiario.mutate(v)}
          />

          <Tabs defaultValue="giorni" className="rounded-xl border bg-card shadow-sm">
            <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
              <TabsList className="h-8">
                <TabsTrigger value="giorni" className="text-xs">Giorno per giorno</TabsTrigger>
                <TabsTrigger value="canali" className="text-xs">Canali{(canali.data?.length ?? 0) > 0 ? ` (${canali.data!.length})` : ""}</TabsTrigger>
                <TabsTrigger value="campagne" className="text-xs">
                  Campagne
                  {(campagne.data ?? []).some((r) => r.verdetto === "da spegnere") && (
                    <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-rose-500" title="ci sono campagne da spegnere" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="settimane" className="text-xs">Settimane</TabsTrigger>
                <TabsTrigger value="lead" className="text-xs">Richieste ({data.lead.length})</TabsTrigger>
                <TabsTrigger value="vendite" className="text-xs">Contratti ({data.vendite.length})</TabsTrigger>
                <TabsTrigger value="imbuto" className="text-xs">Imbuto e persone</TabsTrigger>
              </TabsList>
              {serie.length > 2 && <span className="ml-1 hidden items-center gap-2 text-[11px] text-muted-foreground sm:inline-flex"><Sparkline valori={serie} titolo="Richieste al giorno" /> richieste al giorno</span>}
              <Button size="sm" variant="ghost" className="ml-auto h-7 gap-1.5 text-xs" onClick={scarica}><Download className="h-3.5 w-3.5" /> Scarica in Excel</Button>
            </div>

            <TabsContent value="giorni" className="m-0 max-h-[32rem] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card shadow-[0_1px_0_hsl(var(--border))]">
                  <tr>
                    <th className={th}>Data</th><th className={cn(th, "text-right")}>Copertura</th><th className={cn(th, "text-right")}>Interazioni</th>
                    <th className={cn(th, "text-right")}>CPM</th><th className={cn(th, "text-right")}>Click</th><th className={cn(th, "text-right")}>CPC</th>
                    <th className={cn(th, "text-right")}>Spesa</th><th className={cn(th, "text-right")}>Lead Meta</th><th className={cn(th, "text-right")}>Richieste</th>
                    <th className={cn(th, "text-right")}>Costo richiesta</th><th className={cn(th, "text-right")}>Toccate</th><th className={cn(th, "text-right")}>Sopralluoghi</th>
                    <th className={cn(th, "text-right")}>Contratti</th><th className={cn(th, "text-right")}>Valore</th><th className={cn(th, "text-right")}>Freq.</th><th className={cn(th, "text-right")}>Camp.</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.giorni.map((g: GiornoScheda) => (
                    <tr key={g.giorno} className={cn(g.spesa === 0 && g.lead === 0 ? "text-muted-foreground" : "")}>
                      <td className={cn(tdc, "font-medium")}>{dataBreve(`${g.giorno}T12:00:00`, false, oggi)}</td>
                      <td className={cn(tdc, "text-right")}>{g.copertura != null ? numero(g.copertura) : "—"}</td>
                      <td className={cn(tdc, "text-right")}>{g.interazioni != null ? numero(g.interazioni) : "—"}</td>
                      <td className={cn(tdc, "text-right")}>{g.cpm != null ? eur(g.cpm, 2) : "—"}</td>
                      <td className={cn(tdc, "text-right")}>{g.click != null ? numero(g.click) : "—"}</td>
                      <td className={cn(tdc, "text-right")}>{g.cpc != null ? eur(g.cpc, 2) : "—"}</td>
                      <td className={cn(tdc, "text-right font-medium")}>{g.spesa > 0 ? eur(g.spesa, 2) : "—"}</td>
                      <td className={cn(tdc, "text-right")}>{g.lead_dichiarati || "—"}</td>
                      <td className={cn(tdc, "text-right font-medium")}>{g.lead || "—"}</td>
                      <td className={cn(tdc, "text-right")}>{g.cpl != null ? eur(g.cpl, 2) : "—"}</td>
                      <td className={cn(tdc, "text-right")}>{g.opportunita ? `${g.lavorate}/${g.opportunita}` : "—"}</td>
                      <td className={cn(tdc, "text-right")}>{g.appuntamenti || "—"}</td>
                      <td className={cn(tdc, "text-right")}>{g.vendite || "—"}</td>
                      <td className={cn(tdc, "text-right")}>{g.valore > 0 ? eur(g.valore) : "—"}</td>
                      <td className={cn(tdc, "text-right")}>{g.frequenza != null ? g.frequenza.toLocaleString("it-IT", { maximumFractionDigits: 2 }) : "—"}</td>
                      <td className={cn(tdc, "text-right")}>{g.campagne_attive ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabsContent>

            <TabsContent value="canali" className="m-0 overflow-auto">
              <CanaliCliente canali={canali.data ?? []} caricamento={canali.isLoading} />
            </TabsContent>

            <TabsContent value="campagne" className="m-0">
              <CampagneCliente righe={campagne.data ?? []} caricamento={campagne.isLoading}
                livello={livello} onLivello={setLivello} oggi={oggi} />
            </TabsContent>

            <TabsContent value="settimane" className="m-0 overflow-auto">
              <table className="w-full text-xs">
                <thead><tr>
                  <th className={th}>Settimana</th><th className={cn(th, "text-right")}>Spesa</th><th className={cn(th, "text-right")}>Richieste</th>
                  <th className={cn(th, "text-right")}>vs prima</th><th className={cn(th, "text-right")}>Costo richiesta</th><th className={cn(th, "text-right")}>vs prima</th>
                  <th className={cn(th, "text-right")}>Toccate</th><th className={cn(th, "text-right")}>Richiamo</th>
                  <th className={cn(th, "text-right")}>Sopralluoghi</th><th className={cn(th, "text-right")}>Contratti</th><th className={cn(th, "text-right")}>Valore</th>
                </tr></thead>
                <tbody className="divide-y">
                  {data.settimane.map((w) => {
                    const dLead = variazione(w.lead, w.lead_prec ?? 0);
                    const dCpl = w.cpl != null && w.cpl_prec ? variazione(w.cpl, w.cpl_prec) : null;
                    return (
                      <tr key={w.settimana}>
                        <td className={cn(tdc, "font-medium")}>dal {dataBreve(`${w.settimana}T12:00:00`, false, oggi)}</td>
                        <td className={cn(tdc, "text-right")}>{eur(w.spesa)}</td>
                        <td className={cn(tdc, "text-right font-medium")}>{numero(w.lead)}</td>
                        <td className={cn(tdc, "text-right", dLead == null ? "text-muted-foreground" : dLead >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")}>{dLead == null ? "—" : `${dLead > 0 ? "+" : ""}${numero(dLead)}%`}</td>
                        <td className={cn(tdc, "text-right")}>{w.cpl != null ? eur(w.cpl, 2) : "—"}</td>
                        <td className={cn(tdc, "text-right", dCpl == null ? "text-muted-foreground" : dCpl <= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")}>{dCpl == null ? "—" : `${dCpl > 0 ? "+" : ""}${numero(dCpl)}%`}</td>
                        <td className={cn(tdc, "text-right")}>{numero(w.lavorate)}</td>
                        <td className={cn(tdc, "text-right")}>{w.mediana_min != null ? ore(w.mediana_min / 60) : "—"}</td>
                        <td className={cn(tdc, "text-right")}>{numero(w.appuntamenti)}</td>
                        <td className={cn(tdc, "text-right")}>{numero(w.vendite)}</td>
                        <td className={cn(tdc, "text-right")}>{w.valore > 0 ? eur(w.valore) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TabsContent>

            <TabsContent value="lead" className="m-0 max-h-[32rem] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card shadow-[0_1px_0_hsl(var(--border))]"><tr>
                  <th className={th}>Arrivata</th><th className={th}>Chi</th><th className={th}>Dove</th><th className={th}>Fonte</th>
                  <th className={th}>Fase</th><th className={th}>In mano a</th><th className={cn(th, "text-right")}>Richiamata dopo</th><th className={cn(th, "text-right")}>Valore</th>
                </tr></thead>
                <tbody className="divide-y">
                  {data.lead.map((l) => (
                    <tr key={l.id} className={l.primo_contatto_min == null && l.status === "open" ? "bg-rose-50/60 dark:bg-rose-950/20" : ""}>
                      <td className={tdc}>{dataBreve(l.created_at, true, oggi)}</td>
                      <td className="px-2 py-1.5"><span className="font-medium">{l.nome || l.company_name || "—"}</span>{l.phone ? <span className="ml-1 text-muted-foreground">{l.phone}</span> : null}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{[l.city, l.province].filter(Boolean).join(" ") || "—"}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{l.fonte || "—"}</td>
                      <td className="px-2 py-1.5">{l.fase || "—"}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{l.assegnato_a || "nessuno"}</td>
                      <td className={cn(tdc, "text-right", l.primo_contatto_min == null ? "font-medium text-rose-700 dark:text-rose-400" : l.primo_contatto_min > RICHIAMO_ORE * 60 ? "text-amber-700 dark:text-amber-400" : "")}>
                        {l.primo_contatto_min == null ? (l.status === "open" ? "mai" : "—") : ore(l.primo_contatto_min / 60)}
                      </td>
                      <td className={cn(tdc, "text-right")}>{l.value ? eur(l.value) : "—"}</td>
                    </tr>
                  ))}
                  {data.lead.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Nessuna richiesta in questo periodo.</td></tr>}
                </tbody>
              </table>
            </TabsContent>

            <TabsContent value="vendite" className="m-0 max-h-[32rem] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card shadow-[0_1px_0_hsl(var(--border))]"><tr>
                  <th className={th}>Firmato</th><th className={th}>Cliente finale</th><th className={th}>Lavoro</th>
                  <th className={cn(th, "text-right")}>Importo</th><th className={th}>Fonte</th><th className={cn(th, "text-right")}>Giorni dal lead</th><th className={th}>Venditore</th>
                </tr></thead>
                <tbody className="divide-y">
                  {data.vendite.map((v) => (
                    <tr key={v.id}>
                      <td className={tdc}>{dataBreve(v.vinto_il, false, oggi)}</td>
                      <td className="px-2 py-1.5 font-medium">{v.cliente_finale || "—"}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{v.name || "—"}</td>
                      <td className={cn(tdc, "text-right font-medium")}>{eur(v.value)}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{v.source || "—"}</td>
                      <td className={cn(tdc, "text-right")}>{v.giorni_dal_lead != null ? numero(v.giorni_dal_lead) : "—"}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{v.venditore || "—"}</td>
                    </tr>
                  ))}
                  {data.vendite.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Nessun contratto registrato in questo periodo.</td></tr>}
                </tbody>
              </table>
            </TabsContent>

            <TabsContent value="imbuto" className="m-0 grid gap-4 p-3 md:grid-cols-3">
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Inbox className="h-3 w-3" /> Dove sono ferme le richieste</div>
                <ul className="space-y-1 text-xs">
                  {data.imbuto.map((f) => (
                    <li key={f.fase} className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate">{f.fase}</span>
                      <span className="tabular-nums">
                        <strong>{numero(f.n)}</strong>
                        {f.valore > 0 && <span className="ml-1 text-muted-foreground">{eur(f.valore)}</span>}
                        {f.ferme_14g > 0 && <span className="ml-1 text-rose-700 dark:text-rose-400">{numero(f.ferme_14g)} ferme</span>}
                      </span>
                    </li>
                  ))}
                  {data.imbuto.length === 0 && <li className="text-muted-foreground">Nessuna richiesta aperta.</li>}
                </ul>
              </div>
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Users className="h-3 w-3" /> Chi le lavora</div>
                <ul className="space-y-1 text-xs">
                  {data.persone.map((p) => (
                    <li key={p.persona} className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate">{p.persona}</span>
                      <span className="tabular-nums text-muted-foreground">
                        <strong className="text-foreground">{numero(p.lavorate)}</strong>/{numero(p.opportunita)}
                        {p.mediana_min != null && <span className="ml-1">in {ore(p.mediana_min / 60)}</span>}
                        {p.vinte > 0 && <span className="ml-1 text-emerald-700 dark:text-emerald-400">{numero(p.vinte)} vinte</span>}
                      </span>
                    </li>
                  ))}
                  {data.persone.length === 0 && <li className="text-muted-foreground">Nessuna richiesta nel periodo.</li>}
                </ul>
              </div>
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Trophy className="h-3 w-3" /> Perché si perdono</div>
                <ul className="space-y-1 text-xs">
                  {data.perse.map((x) => (
                    <li key={x.motivo} className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate">{x.motivo}</span><span className="tabular-nums font-medium">{numero(x.n)}</span>
                    </li>
                  ))}
                  {data.perse.length === 0 && <li className="text-muted-foreground">Nessuna persa registrata nel periodo.</li>}
                </ul>
                <div className="mt-3 mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><CalendarCheck className="h-3 w-3" /> Cosa si muove nel CRM</div>
                <ul className="space-y-1 text-xs">
                  {data.attivita.slice(0, 6).map((x) => (
                    <li key={x.tipo} className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-muted-foreground">{x.tipo}</span><span className="tabular-nums">{numero(x.n)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </TabsContent>
          </Tabs>

          <p className="text-[11px] text-muted-foreground">
            Le richieste sono i contatti nuovi entrati nel CRM (esclusi import e contatti creati dalle fatture). «Toccate» = con almeno un'azione registrata dopo due minuti dall'arrivo.
            La spesa giorno per giorno arriva da Meta e si riscrive a ogni sincronizzazione; i costi inseriti a mano entrano nel totale del giorno in cui li hai messi.
            <Coins className="ml-1 inline h-3 w-3" /> Periodo: {dataBreve(`${data.periodo.da}T12:00:00`, false, oggi)} – {dataBreve(`${data.periodo.a}T12:00:00`, false, oggi)}, confronto con i {data.periodo.giorni} giorni prima.
          </p>
        </>
      )}
    </div>
  );
}
