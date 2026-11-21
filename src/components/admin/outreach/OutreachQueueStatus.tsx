import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, Clock, PauseCircle, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { outreachRpc } from "./outreachRpc";

type Giro = { at: string; esito: Record<string, unknown> | null; errore: string | null };
interface StatoCoda {
  pronti: number;
  programmati: number;
  in_pausa: number;
  da_verificare: number;
  inviati_oggi: number;
  falliti_oggi: number;
  prossimo: string | null;
  campagne: {
    sequenza_id: string | null; sequenza: string | null; brand: string | null;
    motivo: string | null; n: number; pronti: number; prima_data: string | null;
  }[];
}
const data = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", dateStyle: "medium", timeStyle: "short" });

export function OutreachQueueStatus({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["outreach-queue-status", companyId],
    refetchInterval: 30_000,
    queryFn: () => outreachRpc<StatoCoda>("outreach_stato_coda", { p_company: companyId }),
  });
  const giri = useQuery({
    queryKey: ["outreach-ultimi-giri", companyId],
    refetchInterval: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: runs, error } = await (supabase as any).from("outreach_runs")
        .select("funzione,started_at,esito,errore").order("started_at", { ascending: false }).limit(40);
      if (error) throw error;
      const ultimi: Record<string, Giro> = {};
      for (const r of runs ?? []) {
        if (!ultimi[r.funzione]) ultimi[r.funzione] = { at: r.started_at, esito: r.esito, errore: r.errore };
      }
      return ultimi;
    },
  });
  const d = q.data;

  return (
    <Card>
      <CardHeader className="px-4 py-4 sm:px-5">
        <CardTitle className="flex items-center gap-2 text-base"><Send className="h-4 w-4 text-primary" /> Stato degli invii</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 sm:px-5">
        {q.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
            Coda invii momentaneamente indisponibile.
            <Button size="sm" variant="outline" onClick={() => void q.refetch()}>Riprova</Button>
          </div>
        ) : d ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
              <Tile icon={Clock} label="Pronti ora" value={d.pronti} hint={d.pronti > 0 ? "Soggetti a orari e capacità" : undefined} />
              <Tile icon={Clock} label="Programmati" value={d.programmati} hint={d.prossimo ? data.format(new Date(d.prossimo)) : undefined} />
              <Tile icon={PauseCircle} label="In pausa" value={d.in_pausa} tone={d.in_pausa ? "warn" : "default"} />
              <Tile icon={Send} label="Inviati oggi" value={d.inviati_oggi} tone="good" />
            </div>
            {(d.da_verificare > 0 || d.falliti_oggi > 0) && <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              {d.da_verificare > 0 && <span>{d.da_verificare.toLocaleString("it-IT")} da verificare</span>}
              {d.falliti_oggi > 0 && <span>{d.falliti_oggi.toLocaleString("it-IT")} falliti oggi</span>}
            </p>}
            {d.campagne.length > 0 && <details className="rounded-lg border px-3 py-2 text-sm">
              <summary className="cursor-pointer font-medium">Dettaglio per campagna</summary>
              <ul className="mt-2 divide-y">
                {d.campagne.map((c) => (
                  <li key={JSON.stringify([c.sequenza_id, c.brand, c.motivo])} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-xs">
                    <span className="min-w-36 font-medium">{c.sequenza ?? "Invii singoli"}{c.brand && ` · \${c.brand}`}</span>
                    <span className="tabular-nums">{c.n.toLocaleString("it-IT")} in coda</span>
                    <span className="text-muted-foreground">
                      {c.motivo ?? [c.pronti > 0 && `\${c.pronti.toLocaleString("it-IT")} pronti`,
                        c.prima_data && `Prossima data \${data.format(new Date(c.prima_data))}`].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            </details>}
          </>
        ) : <p role="status" className="text-sm text-muted-foreground">Caricamento della coda…</p>}
        {giri.isError ? <p className="text-xs text-muted-foreground">Registro degli ultimi giri indisponibile.</p> : giri.data && <UltimiGiri giri={giri.data} />}
      </CardContent>
    </Card>
  );
}

const NOMI_GIRI: Array<[string, string]> = [["outreach-dispatch", "Invii"], ["outreach-imap-poll", "Risposte"], ["outreach-warmup", "Warm-up"]];
function UltimiGiri({ giri }: { giri: Record<string, { at: string; esito: Record<string, unknown> | null; errore: string | null }> }) {
  const righe = NOMI_GIRI.map(([k, label]) => ({ label, g: giri[k] })).filter((r) => r.g);
  if (righe.length === 0) return null;
  return (
    <p className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">Ultimo giro:</span>
      {righe.map(({ label, g }) => {
        let quando: string;
        try { quando = formatDistanceToNow(new Date(g.at), { addSuffix: true, locale: it }); } catch { quando = g.at; }
        const e = g.esito ?? {};
        const dettaglio = [
          e.sent != null ? `${e.sent} inviate` : null,
          e.replies != null ? `${e.replies} risposte` : null,
          e.bounces ? `${e.bounces} bounce` : null,
          e.providerBlocked ? `BLOCCATO: ${String(e.providerBlocked).slice(0, 60)}` : null,
          Array.isArray(e.errors) && e.errors.length ? `${e.errors.length} errori` : null,
        ].filter(Boolean).join(", ");
        return (
          <span key={label} className={g.errore || e.providerBlocked ? "text-red-600" : ""}>
            {label} {quando}{dettaglio ? ` (${dettaglio})` : ""}{g.errore ? ` — ${g.errore.slice(0, 60)}` : ""}
          </span>
        );
      })}
    </p>
  );
}

function Tile({ icon: Icon, label, value, hint, tone = "default" }: {
  icon: typeof Send; label: string; value: number; hint?: string; tone?: "default" | "active" | "good" | "warn";
}) {
  const valCls = tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : tone === "active" ? "text-orange-600" : "";
  const chip =
    tone === "good" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-300"
    : tone === "warn" ? "bg-amber-50 text-amber-600 dark:bg-amber-900/25 dark:text-amber-300"
    : tone === "active" ? "bg-orange-50 text-orange-600 dark:bg-orange-900/25 dark:text-orange-300"
    : "bg-muted text-muted-foreground";
  return (
    <div className="rounded-lg border p-3 transition-colors hover:border-primary/30">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className={`flex h-6 w-6 items-center justify-center rounded-md ${chip}`}><Icon className="h-3.5 w-3.5" /></span>
        {label}
      </div>
      <div className={`mt-1.5 text-2xl font-bold tabular-nums ${valCls}`}>{value.toLocaleString("it-IT")}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
