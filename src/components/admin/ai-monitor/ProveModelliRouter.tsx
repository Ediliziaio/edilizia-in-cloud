/**
 * «Prove modelli» (15/11/2026): il traffico vero del router AI, compito per compito, con la catena
 * configurata, il lavoro di ogni modello e i segnali da guardare. I dati arrivano da
 * admin_ai_prove_modelli (solo super admin); le regole dei segnali stanno in lib/ai/proveModelli.
 */
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowRight, ChevronDown, ChevronRight, CircleAlert, Coins, Database, Gauge, Info, RefreshCw,
  Repeat, Search, Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  compitiFermi, nomeCompito, nomeModello, providerModello, segnaliDaGuardare,
  type CompitoAI, type Gravita, type ModelloDelCompito, type ProveModelli,
} from "@/lib/ai/proveModelli";

const PERIODI = [7, 30, 90] as const;

const COLORE_PROVIDER: Record<string, string> = {
  anthropic: "bg-orange-100 text-orange-800 border-orange-200",
  openai: "bg-emerald-100 text-emerald-800 border-emerald-200",
  google: "bg-blue-100 text-blue-800 border-blue-200",
  deepseek: "bg-cyan-100 text-cyan-800 border-cyan-200",
  "meta-llama": "bg-indigo-100 text-indigo-800 border-indigo-200",
};

const STILE_SEGNALE: Record<Gravita, { icona: typeof AlertTriangle; classe: string }> = {
  rosso: { icona: CircleAlert, classe: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200" },
  giallo: { icona: AlertTriangle, classe: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200" },
  info: { icona: Info, classe: "border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200" },
};

const ETICHETTA_RUOLO: Record<ModelloDelCompito["ruolo"], { testo: string; classe: string }> = {
  principale: { testo: "principale", classe: "bg-primary/10 text-primary" },
  riserva: { testo: "riserva", classe: "bg-muted text-muted-foreground" },
  fuori_catena: { testo: "fuori catena", classe: "bg-violet-100 text-violet-800" },
};

const usd = (v: number | null | undefined, cifre = 2) => (v == null ? "—" : `${Number(v).toFixed(cifre)} $`);
const secondi = (ms: number | null | undefined) => (ms == null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
const intero = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("it-IT"));
const quando = (iso: string) => new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function ChipModello({ modello, attenuato }: { modello: string; attenuato?: boolean }) {
  return (
    <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[11px]",
      COLORE_PROVIDER[providerModello(modello)] ?? "bg-slate-100 text-slate-700 border-slate-200", attenuato && "opacity-60")}
      title={modello}>
      {nomeModello(modello)}
    </span>
  );
}

function Kpi({ icona: Icona, etichetta, valore, nota }: { icona: typeof Zap; etichetta: string; valore: string; nota?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{etichetta}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{valore}</p>
            {nota && <p className="mt-0.5 text-[11px] text-muted-foreground">{nota}</p>}
          </div>
          <Icona className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

export function ProveModelliRouter() {
  const [giorni, setGiorni] = useState<(typeof PERIODI)[number]>(30);
  const [cerca, setCerca] = useState("");
  const [soloAttivi, setSoloAttivi] = useState(true);
  const [aperti, setAperti] = useState<Set<string>>(new Set());

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-ai-prove-modelli", giorni],
    staleTime: 60_000,
    queryFn: async (): Promise<ProveModelli> => {
      const { data, error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(
        "admin_ai_prove_modelli", { p_giorni: giorni });
      if (error) throw new Error(error.message);
      return data as ProveModelli;
    },
  });

  const segnali = useMemo(() => (data ? segnaliDaGuardare(data) : []), [data]);
  const fermi = useMemo(() => (data ? compitiFermi(data) : []), [data]);
  const compiti = useMemo(() => {
    if (!data) return [];
    const q = cerca.trim().toLowerCase();
    return data.compiti.filter((c) =>
      (!soloAttivi || c.chiamate > 0)
      && (!q || [c.task_key, c.etichetta ?? "", c.principale ?? "", ...c.riserve, ...c.modelli.map((m) => m.modello)].some((t) => t.toLowerCase().includes(q))));
  }, [data, cerca, soloAttivi]);

  const apri = (k: string) => setAperti((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const vaiA = (k: string) => {
    setSoloAttivi(false); setCerca("");
    setAperti((s) => new Set(s).add(k));
    requestAnimationFrame(() => document.getElementById(`compito-${k}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  if (error) {
    return <Card><CardContent className="p-6 text-sm text-destructive">Non riesco a leggere le prove dei modelli: {(error as Error).message}</CardContent></Card>;
  }

  const t = data?.totali;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Il traffico vero del router</h2>
          <p className="text-sm text-muted-foreground">
            Ogni chiamata AI che passa dal router, compito per compito: chi la fa, quanto costa, quanto ci mette, quante volte si ripiega.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5" role="radiogroup" aria-label="Periodo">
            {PERIODI.map((g) => (
              <button key={g} type="button" role="radio" aria-checked={giorni === g} onClick={() => setGiorni(g)}
                className={cn("rounded px-2.5 py-1 text-xs font-medium", giorni === g ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                {g} giorni
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} aria-label="Aggiorna">
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {isLoading || !t ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi icona={Coins} etichetta="Costo" valore={usd(t.costo)} nota={`${giorni} giorni, solo router`} />
          <Kpi icona={Zap} etichetta="Chiamate" valore={intero(t.chiamate)} />
          <Kpi icona={Coins} etichetta="Costo per chiamata" valore={t.chiamate ? usd((t.costo ?? 0) / t.chiamate, 4) : "—"} />
          <Kpi icona={Database} etichetta="Dalla cache" valore={t.cache_pct == null ? "—" : `${t.cache_pct}%`} nota="dei token in ingresso" />
          <Kpi icona={CircleAlert} etichetta="Errori" valore={t.chiamate ? `${((100 * t.errori) / t.chiamate).toFixed(1)}%` : "—"} nota={`${t.errori} chiamate fallite`} />
          <Kpi icona={Repeat} etichetta="Dalla riserva" valore={intero(t.da_riserva)} nota="risposte non del principale" />
        </div>
      )}

      {data && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Da guardare {segnali.length > 0 && <span className="font-normal text-muted-foreground">({segnali.length})</span>}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {segnali.length === 0 ? (
              <p className="text-sm text-muted-foreground">Niente di strano in questo periodo: nessun modello che fallisce, nessuna riserva usata spesso, nessun allarme aperto.</p>
            ) : segnali.map((s, i) => {
              const S = STILE_SEGNALE[s.gravita];
              return (
                <div key={i} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", S.classe)}>
                  <S.icona className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{s.titolo}</p>
                    <p className="break-words text-xs opacity-90">{s.dettaglio}</p>
                  </div>
                  {s.task_key && (
                    <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => vaiA(s.task_key!)}>
                      Vedi <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Compiti e modelli</CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Compito o modello…" className="h-8 w-56 pl-7 text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="prove-solo-attivi" checked={soloAttivi} onCheckedChange={setSoloAttivi} />
              <Label htmlFor="prove-solo-attivi" className="text-xs font-normal">Solo con chiamate</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : compiti.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nessun compito {cerca ? `per «${cerca}»` : "in questo periodo"}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Compito</th>
                    <th className="px-3 py-2 text-left font-medium">Catena configurata</th>
                    <th className="px-3 py-2 text-right font-medium">Chiamate</th>
                    <th className="px-3 py-2 text-right font-medium">Costo</th>
                    <th className="px-3 py-2 text-right font-medium">Quota</th>
                  </tr>
                </thead>
                <tbody>
                  {compiti.map((c) => (
                    <RigaCompito key={c.task_key} c={c} totale={t?.costo ?? 0} aperto={aperti.has(c.task_key)} onApri={() => apri(c.task_key)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {soloAttivi && fermi.length > 0 && (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              {fermi.length} compiti configurati non hanno fatto chiamate in {giorni} giorni.{" "}
              <button type="button" className="underline underline-offset-2" onClick={() => setSoloAttivi(false)}>Mostrali</button>
            </p>
          )}
        </CardContent>
      </Card>

      {data && data.diretti.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Chiamate dirette ai provider <span className="font-normal text-muted-foreground">(fuori dal router)</span></CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Modello</th>
                    <th className="px-3 py-2 text-right font-medium">Chiamate</th>
                    <th className="px-3 py-2 text-right font-medium">Errori</th>
                    <th className="px-3 py-2 text-right font-medium">Costo</th>
                    <th className="px-3 py-2 text-right font-medium">Ultima</th>
                  </tr>
                </thead>
                <tbody>
                  {data.diretti.map((d) => (
                    <tr key={`${d.provider}-${d.modello}`} className="border-b last:border-0">
                      <td className="px-3 py-2"><ChipModello modello={d.modello} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">{intero(d.chiamate)}</td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", d.errori > 0 && "text-destructive")}>{intero(d.errori)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{usd(d.costo)}</td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">{quando(d.ultima)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RigaCompito({ c, totale, aperto, onApri }: { c: CompitoAI; totale: number; aperto: boolean; onApri: () => void }) {
  const errori = c.modelli.reduce((s, m) => s + m.errori, 0);
  const daRiserva = c.modelli.reduce((s, m) => s + m.da_riserva, 0);
  const quota = totale > 0 ? (100 * c.costo) / totale : 0;
  return (
    <Fragment>
      <tr id={`compito-${c.task_key}`} className={cn("cursor-pointer border-b hover:bg-muted/40", aperto && "bg-muted/30")} onClick={onApri}>
        <td className="px-3 py-2 align-top">
          <div className="flex items-start gap-1.5">
            {aperto ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />}
            <div className="min-w-0">
              <p className="font-medium">{nomeCompito(c)}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{c.task_key}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {!c.configurato && <Badge variant="outline" className="text-[10px]">senza configurazione</Badge>}
                {!c.abilitato && <Badge variant="outline" className="text-[10px]">spento</Badge>}
                {errori > 0 && <Badge variant="outline" className="border-red-200 text-[10px] text-red-700">{errori} errori</Badge>}
                {daRiserva > 0 && <Badge variant="outline" className="border-amber-200 text-[10px] text-amber-800">{daRiserva} dalla riserva</Badge>}
              </div>
            </div>
          </div>
        </td>
        <td className="px-3 py-2 align-top">
          {c.principale ? (
            <div className="flex flex-wrap items-center gap-1">
              <ChipModello modello={c.principale} />
              {c.riserve.map((r) => (
                <Fragment key={r}><ArrowRight className="h-3 w-3 text-muted-foreground" /><ChipModello modello={r} attenuato /></Fragment>
              ))}
            </div>
          ) : <span className="text-xs text-muted-foreground">catena di ripiego del router</span>}
        </td>
        <td className="px-3 py-2 text-right align-top tabular-nums">{intero(c.chiamate)}</td>
        <td className="px-3 py-2 text-right align-top tabular-nums">{usd(c.costo)}</td>
        <td className="px-3 py-2 align-top">
          <div className="flex items-center justify-end gap-2">
            <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block"><div className="h-full bg-primary" style={{ width: `${Math.min(100, quota)}%` }} /></div>
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{quota >= 0.5 ? `${Math.round(quota)}%` : quota > 0 ? "<1%" : "—"}</span>
          </div>
        </td>
      </tr>
      {aperto && (
        <tr className="border-b bg-muted/20">
          <td colSpan={5} className="px-3 pb-3 pt-1">
            {c.modelli.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">Nessuna chiamata nel periodo.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-2 text-left font-medium">Modello</th>
                    <th className="px-2 py-1.5 text-right font-medium">Chiamate</th>
                    <th className="px-2 py-1.5 text-right font-medium">Errori</th>
                    <th className="px-2 py-1.5 text-right font-medium" title="Risposte date al posto del principale">Da riserva</th>
                    <th className="px-2 py-1.5 text-right font-medium">Per chiamata</th>
                    <th className="px-2 py-1.5 text-right font-medium" title="Metà delle risposte arriva entro / una su venti oltre">Tempo tipico / lento</th>
                    <th className="px-2 py-1.5 text-right font-medium">Cache</th>
                    <th className="px-2 py-1.5 text-right font-medium">Token in / out</th>
                    <th className="px-2 py-1.5 text-right font-medium">Aziende</th>
                    <th className="py-1.5 pl-2 text-right font-medium">Ultima</th>
                  </tr>
                </thead>
                <tbody>
                  {c.modelli.map((m) => (
                    <Fragment key={m.modello}>
                      <tr className="border-t border-border/60">
                        <td className="py-1.5 pr-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <ChipModello modello={m.modello} />
                            <span className={cn("rounded px-1.5 py-0.5 text-[10px]", ETICHETTA_RUOLO[m.ruolo].classe)}>{ETICHETTA_RUOLO[m.ruolo].testo}</span>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{intero(m.chiamate)}</td>
                        <td className={cn("px-2 py-1.5 text-right tabular-nums", m.errori > 0 && "font-medium text-destructive")}>{intero(m.errori)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{intero(m.da_riserva)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{usd(m.costo_medio, 4)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{secondi(m.p50_ms)} / {secondi(m.p95_ms)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{m.cache_pct == null ? "—" : `${m.cache_pct}%`}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{intero(m.token_in)} / {intero(m.token_out)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{intero(m.aziende)}</td>
                        <td className="py-1.5 pl-2 text-right text-muted-foreground">{quando(m.ultima)}</td>
                      </tr>
                      {m.ultimo_errore && (
                        <tr><td colSpan={10} className="pb-1.5 text-[11px] text-destructive/80"><Gauge className="mr-1 inline h-3 w-3" />Ultimo errore: {m.ultimo_errore}</td></tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </Fragment>
  );
}
