/**
 * LavorazioneLeadPanel — "lavorazione lead" del call center nel periodo:
 * chiamate a lead NUOVI (creati nel periodo) vs VECCHI (riattivazione), tasso di
 * risposta per gruppo, tempo medio al 1° contatto riuscito sui lead nuovi e
 * distribuzione delle chiamate per età del lead. Dati da get_callcenter_lead_handling.
 */
import type { ComponentType } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PhoneCall, Sparkles, History, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeadHandling } from "@/hooks/useCallCenterReport";

function pct(n: number | null | undefined) {
  return n === null || n === undefined ? "—" : `${n}%`;
}
function num(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("it-IT");
}
function oreLabel(h: number | null | undefined) {
  if (h === null || h === undefined) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${Math.round(h / 24)} gg`;
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone: "green" | "amber" | "sky";
}) {
  const toneCls =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50/50 text-emerald-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50/50 text-amber-700"
        : "border-sky-200 bg-sky-50/50 text-sky-700";
  return (
    <div className={cn("rounded-lg border p-3", toneCls)}>
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1.5 text-2xl font-bold text-slate-950 tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

export function LavorazioneLeadPanel({
  data,
  isLoading,
}: {
  data: LeadHandling | null | undefined;
  isLoading: boolean;
}) {
  if (isLoading) return <Skeleton className="h-56 w-full rounded-xl" />;

  if (!data || data.chiamate_totali === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PhoneCall className="h-4 w-4 text-primary" /> Lavorazione lead
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nessuna chiamata registrata nel periodo. Registra le chiamate dal contatto o dall'opportunità
            ("Registra chiamata") per popolare queste statistiche.
          </p>
        </CardContent>
      </Card>
    );
  }

  const aging = [
    { label: "0–7 gg", v: data.chiamate_eta_0_7, color: "bg-emerald-500" },
    { label: "8–30 gg", v: data.chiamate_eta_8_30, color: "bg-sky-500" },
    { label: "31–60 gg", v: data.chiamate_eta_31_60, color: "bg-amber-500" },
    { label: ">60 gg", v: data.chiamate_eta_oltre_60, color: "bg-rose-500" },
  ];
  const agingMax = Math.max(...aging.map((a) => a.v), 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <PhoneCall className="h-4 w-4 text-primary" /> Lavorazione lead
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Chiamate del periodo per età del lead, tasso di risposta e velocità di primo contatto.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            icon={Sparkles}
            tone="green"
            label="Chiamate a lead nuovi"
            value={num(data.chiamate_nuovi)}
            sub={`${num(data.lead_nuovi_chiamati)} lead · risposta ${pct(data.tasso_risposta_nuovi)}`}
          />
          <Stat
            icon={History}
            tone="amber"
            label="Chiamate a lead vecchi"
            value={num(data.chiamate_vecchi)}
            sub={`${num(data.lead_vecchi_chiamati)} lead · risposta ${pct(data.tasso_risposta_vecchi)}`}
          />
          <Stat
            icon={Clock}
            tone="sky"
            label="Tempo al 1° contatto (nuovi)"
            value={oreLabel(data.tempo_medio_primo_contatto_ore)}
            sub={`risposta totale ${pct(data.tasso_risposta_totale)} · ${num(data.chiamate_totali)} chiamate`}
          />
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-slate-600">Chiamate per età del lead al momento della chiamata</p>
          <div className="space-y-1.5">
            {aging.map((a) => (
              <div key={a.label} className="flex items-center gap-2 text-xs">
                <span className="w-16 shrink-0 text-muted-foreground">{a.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded bg-slate-100">
                  <div className={cn("h-full rounded", a.color)} style={{ width: `${(a.v / agingMax) * 100}%` }} />
                </div>
                <span className="w-8 shrink-0 text-right tabular-nums text-slate-700">{a.v}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default LavorazioneLeadPanel;
