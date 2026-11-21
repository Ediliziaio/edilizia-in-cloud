import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Activity, AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, Clock, Gauge, KeyRound,
  RefreshCw, ShieldAlert,
} from "lucide-react";
import { AdminHeroHeader } from "@/components/admin/AdminHeroHeader";
import { AdminHubTabs } from "@/components/admin/AdminHubTabs";
import { RenderAiChiavi } from "@/components/admin/RenderAiChiavi";
import { ErroriRecenti, FunzioniMisurate, JobPianificati } from "@/components/admin/platform-health/HealthLists";
import { dataSalute, formattaPercentuale, latenzaSalute, segnalazioniKey, statoJob, type Salute } from "@/components/admin/platform-health/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export { ErroriRecenti } from "@/components/admin/platform-health/HealthLists";

const sezioni = [
  { id: "panoramica", label: "Panoramica", icon: Activity },
  { id: "segnalazioni", label: "Segnalazioni", icon: AlertTriangle },
  { id: "job", label: "Job", icon: Clock },
  { id: "funzioni", label: "Funzioni", icon: Gauge },
  { id: "diagnostica", label: "Diagnostica AI", icon: KeyRound },
] as const;
type Sezione = typeof sezioni[number]["id"];

const colori = {
  neutro: "text-foreground",
  buono: "text-emerald-700 dark:text-emerald-400",
  attenzione: "text-amber-800 dark:text-amber-400",
  critico: "text-destructive",
} as const;

function Misura({ etichetta, valore, dettaglio, tono = "neutro" }: {
  etichetta: string;
  valore: string | number;
  dettaglio?: string;
  tono?: keyof typeof colori;
}) {
  return (
    <div className="min-w-0 px-3 py-3 sm:px-5">
      <dt className="text-xs font-medium text-muted-foreground">{etichetta}</dt>
      <dd className={cn("mt-0.5 text-2xl font-semibold tracking-tight tabular-nums", colori[tono])}>{valore}</dd>
      {dettaglio && <dd className="mt-0.5 text-xs text-muted-foreground">{dettaglio}</dd>}
    </div>
  );
}

function Panoramica({ salute, vai }: { salute: Salute; vai: (tab: Sezione, filtro?: string) => void }) {
  const { riepilogo, battito } = salute;
  const sonda = battito?.stato;
  const interruzioni = battito?.interruzioni ?? [];
  const storicoJob = new Map(salute.job_falliti.map((job) => [job.job, job]));
  const jobDaVerificare = salute.job.filter((job) => statoJob(job, storicoJob.get(job.job)) === "guasti").length;
  const rilevato = sonda?.ultimo_esito === "ok" || sonda?.ultimo_esito === "fallito";
  const nonRaggiungibile = sonda?.ultimo_esito === "fallito";
  const IconaSonda = nonRaggiungibile ? AlertTriangle : rilevato ? CheckCircle2 : Activity;
  const copertura = riepilogo.funzioni_totali_stimate > 0 ? riepilogo.funzioni_strumentate / riepilogo.funzioni_totali_stimate * 100 : null;
  const anomalie = [
    ...(jobDaVerificare > 0 ? [{
      titolo: "Job da verificare",
      dettaglio: jobDaVerificare + (jobDaVerificare === 1 ? " job attivo con anomalie nelle ultime 48 ore." : " job attivi con anomalie nelle ultime 48 ore."),
      azione: "Apri job",
      onClick: () => vai("job", "guasti"),
      icon: Clock,
    }] : []),
    ...(riepilogo.errori_edge_24h > 0 ? [{
      titolo: "Risposte HTTP con errore",
      dettaglio: riepilogo.errori_edge_24h + " rilevate nelle ultime 24 ore sulle funzioni misurate.",
      azione: "Apri segnalazioni",
      onClick: () => vai("segnalazioni"),
      icon: AlertTriangle,
    }] : []),
    ...(riepilogo.segreti_cron_in_chiaro > 0 ? [{
      titolo: "Credenziali delle pianificazioni",
      dettaglio: riepilogo.segreti_cron_in_chiaro + " comandi rilevati con un segreto in chiaro da spostare nel Vault.",
      azione: null,
      onClick: undefined,
      icon: ShieldAlert,
    }] : []),
  ];

  return (
    <div className="space-y-3">
      <section aria-labelledby="verifica-esterna" className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className={cn("rounded-lg p-2", nonRaggiungibile ? "bg-destructive/10 text-destructive" : rilevato
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>
              <IconaSonda aria-hidden="true" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 id="verifica-esterna" className="text-base font-semibold tracking-tight sm:text-lg">
                {nonRaggiungibile ? "Ultimo controllo fallito" : rilevato ? "Ultimo controllo riuscito" : "Controllo esterno non disponibile"}
              </h2>
              {sonda?.ultimo_controllo && <p className="mt-0.5 text-xs text-muted-foreground">Sonda esterna · {dataSalute(sonda.ultimo_controllo)}</p>}
            </div>
          </div>
          {nonRaggiungibile && sonda && <Badge variant="destructive">{sonda.falliti_di_fila} {sonda.falliti_di_fila === 1 ? "controllo fallito" : "controlli falliti di fila"}</Badge>}
          {sonda && !nonRaggiungibile && sonda.ultima_durata_ms != null && (
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">Risposta in {latenzaSalute(sonda.ultima_durata_ms)}</span>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-px border-t bg-border [&>div]:bg-card lg:grid-cols-4">
          <Misura etichetta="Disponibilità · 24 ore" valore={formattaPercentuale(riepilogo.disponibilita_24h_pct)}
            dettaglio={sonda ? sonda.controlli_24h + " controlli esterni" : undefined} />
          <Misura etichetta="Job attivi da verificare" valore={jobDaVerificare}
            dettaglio={riepilogo.job_attivi + " attivi su " + riepilogo.job_totali} tono={jobDaVerificare ? "critico" : "buono"} />
          <Misura etichetta="Errori HTTP · 24 ore" valore={riepilogo.errori_edge_24h}
            dettaglio="Sulle funzioni misurate" tono={riepilogo.errori_edge_24h ? "attenzione" : "neutro"} />
          <Misura etichetta="Copertura delle misure" valore={formattaPercentuale(copertura)}
            dettaglio={riepilogo.funzioni_strumentate + " su circa " + riepilogo.funzioni_totali_stimate + " funzioni"} />
        </dl>
      </section>

      <section aria-labelledby="da-verificare" className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3 sm:px-5">
          <h2 id="da-verificare" className="text-base font-semibold">Da verificare</h2>
        </div>
        {anomalie.length ? (
          <ul className="divide-y">
            {anomalie.map(({ titolo, dettaglio, azione, onClick, icon: Icon }) => (
              <li key={titolo} className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-sm font-medium">{titolo}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{dettaglio}</p>
                </div>
                {azione && <Button type="button" size="sm" variant="outline" onClick={onClick} className="gap-1.5">{azione}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Button>}
              </li>
            ))}
          </ul>
        ) : <p className="px-4 py-3 text-sm text-muted-foreground sm:px-5">Nessuna anomalia segnalata dai controlli di job e funzioni.</p>}
        {(riepilogo.job_singhiozzi ?? 0) > 0 && (
          <p className="border-t px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
            {riepilogo.job_singhiozzi} {riepilogo.job_singhiozzi === 1 ? "job con un errore isolato ha ripreso a funzionare" : "job con errori isolati hanno ripreso a funzionare"}.
          </p>
        )}
      </section>

      <DettagliPanoramica titolo="Interruzioni rilevate nelle ultime 48 ore" numero={interruzioni.length || undefined}>
        {interruzioni.length ? (
          <ul className="divide-y">
            {interruzioni.map((evento) => (
              <li key={evento.inizio} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm first:pt-0 last:pb-0">
                <div>
                  <span>{dataSalute(evento.inizio)}</span>
                  {evento.fine !== evento.inizio && <span className="text-muted-foreground"> → {dataSalute(evento.fine)}</span>}
                </div>
                <Badge variant="outline">{evento.controlli_falliti} {evento.controlli_falliti === 1 ? "controllo fallito" : "controlli falliti"}</Badge>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">{rilevato ? "Nessuna interruzione rilevata." : "Storico dei controlli non disponibile."}</p>}
      </DettagliPanoramica>

      <DettagliPanoramica titolo="Aziende e pagamenti">
        <dl className="grid grid-cols-2 gap-2 rounded-lg border bg-card lg:grid-cols-4">
          <Misura etichetta="Aziende con accessi" valore={riepilogo.aziende_attive_24h} dettaglio="Ultime 24 ore" />
          <Misura etichetta="Prove scadute" valore={riepilogo.trial_scaduti_da_gestire} />
          <Misura etichetta="Insoluti aperti" valore={riepilogo.insoluti_aperti} />
          <Misura etichetta="Cancellazioni in attesa" valore={riepilogo.aziende_cancellate_in_attesa} dettaglio="Ripristinabili entro 30 giorni" />
        </dl>
      </DettagliPanoramica>
    </div>
  );
}

function DettagliPanoramica({ titolo, numero, children }: { titolo: string; numero?: number; children: React.ReactNode }) {
  return (
    <details className="group overflow-hidden rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium hover:bg-muted/30 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span>{titolo} {numero != null && <Badge variant="secondary" className="ml-1 tabular-nums">{numero}</Badge>}</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t bg-muted/20 p-4 sm:px-5">{children}</div>
    </details>
  );
}

export default function PlatformHealthPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["admin-platform-health"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_platform_health");
      if (error) throw error;
      const salute = data as unknown as Salute | null;
      if (!salute?.riepilogo || !Array.isArray(salute.job) || !Array.isArray(salute.job_falliti) || !Array.isArray(salute.funzioni)) {
        throw new Error("Verifica della piattaforma incompleta");
      }
      return salute;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const fetchingSegnalazioni = useIsFetching({ queryKey: segnalazioniKey });
  const isUpdating = isFetching || fetchingSegnalazioni > 0;
  const tab = sezioni.find((section) => section.id === params.get("tab"))?.id ?? "panoramica";

  function vai(sezione: Sezione, filtro?: string) {
    setParams((old) => {
      const next = new URLSearchParams(old);
      if (sezione === "panoramica") next.delete("tab");
      else next.set("tab", sezione);
      if (filtro) next.set("filtro", filtro);
      else next.delete("filtro");
      return next;
    }, { replace: true });
  }

  function aggiorna() {
    void refetch();
    void queryClient.invalidateQueries({ queryKey: segnalazioniKey });
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-3 p-3 pb-20 sm:p-5 md:pb-5">
      <AdminHeroHeader
        icon={Activity}
        title="Salute piattaforma"
        actions={<>
          {data?.calcolato_il && (
            <span className="text-xs text-blue-50/85">Dati del {dataSalute(data.calcolato_il, "d MMM · HH:mm")}</span>
          )}
          <Button type="button" variant="outline" size="sm" disabled={isUpdating} onClick={aggiorna}>
            <RefreshCw aria-hidden="true" className={cn("mr-1.5 h-4 w-4", isUpdating && "animate-spin")} /> Aggiorna
          </Button>
        </>}
      />
      <AdminHubTabs activeTab={tab} onChange={vai} tabs={[...sezioni]} ariaLabel="Sezioni salute piattaforma" className="[&>nav]:flex-wrap sm:[&>nav]:flex-nowrap" />

      {isError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-card p-3 text-sm">
          <span>{data ? "Aggiornamento non riuscito. Sono visibili i dati dell’ultimo controllo disponibile." : "Impossibile caricare la panoramica della piattaforma."}</span>
          <Button type="button" size="sm" variant="outline" onClick={aggiorna}>Riprova</Button>
        </div>
      )}

      <section role="tabpanel" id={"hub-panel-" + tab} aria-labelledby={"hub-tab-" + tab}>
        {tab !== "segnalazioni" && tab !== "diagnostica" && isLoading && (
          <div role="status" aria-label="Caricamento della salute della piattaforma" className="space-y-3"><Skeleton className="h-36 w-full" /><Skeleton className="h-24 w-full" /></div>
        )}
        {tab === "panoramica" && data && <Panoramica salute={data} vai={vai} />}
        {tab === "segnalazioni" && <ErroriRecenti />}
        {tab === "job" && data && <JobPianificati key={params.get("filtro")} job={data.job} jobFalliti={data.job_falliti}
          riferimento={data.calcolato_il} filtroIniziale={params.get("filtro") === "guasti" ? "guasti" : "tutti"} />}
        {tab === "funzioni" && data && <FunzioniMisurate funzioni={data.funzioni} />}
        <div hidden={tab !== "diagnostica"}><RenderAiChiavi /></div>
      </section>
    </div>
  );
}
