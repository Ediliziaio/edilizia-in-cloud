import { useState, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GitCompareArrows } from "lucide-react";
import type { CallCenterKPI } from "@/hooks/useCallCenterReport";

interface CompareField {
  key: keyof CallCenterKPI;
  label: string;
  format: (v: number) => string;
  lowerIsBetter?: boolean;
}

const FIELDS: CompareField[] = [
  { key: "appuntamenti_fissati", label: "Appuntamenti", format: (v) => String(v) },
  { key: "tasso_contatto", label: "Tasso Contatto", format: (v) => `${v}%` },
  { key: "avg_speed_to_lead_min", label: "Speed to Lead", format: (v) => `${v} min`, lowerIsBetter: true },
  { key: "tasso_app_su_contattati", label: "App / Contattati", format: (v) => `${v}%` },
  { key: "pct_lead_lavorati", label: "Lead Lavorati %", format: (v) => `${v}%` },
  { key: "chiamate_per_giorno", label: "Chiamate / Giorno", format: (v) => String(v) },
  { key: "durata_media_min", label: "Durata Media", format: (v) => `${v} min` },
  { key: "tasso_show_up", label: "Show-Up %", format: (v) => `${v}%` },
];

const CompareRow = memo(function CompareRow({ field, a, b }: { field: CompareField; a: CallCenterKPI; b: CallCenterKPI }) {
  const valA = Number(a[field.key]) || 0;
  const valB = Number(b[field.key]) || 0;
  const max = Math.max(valA, valB, 1);
  const pctA = (valA / max) * 100;
  const pctB = (valB / max) * 100;

  const aWins = field.lowerIsBetter ? valA < valB && valA > 0 : valA > valB;
  const bWins = field.lowerIsBetter ? valB < valA && valB > 0 : valB > valA;
  const tie = valA === valB;

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2.5 border-b border-border last:border-0">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold min-w-[80px] text-right ${aWins ? "text-primary" : "text-muted-foreground"}`}>
          {field.format(valA)}
        </span>
        <div className="flex-1 flex justify-end">
          <div className="h-5 rounded-sm relative overflow-hidden w-full bg-muted/30">
            <div
              className={`absolute right-0 top-0 h-full rounded-sm transition-all ${aWins ? "bg-primary/70" : "bg-muted-foreground/20"}`}
              style={{ width: `${pctA}%` }}
            />
          </div>
        </div>
      </div>

      <span className="text-xs font-medium text-muted-foreground text-center min-w-[110px]">
        {field.label}
      </span>

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="h-5 rounded-sm relative overflow-hidden w-full bg-muted/30">
            <div
              className={`absolute left-0 top-0 h-full rounded-sm transition-all ${bWins ? "bg-accent-foreground/70" : "bg-muted-foreground/20"}`}
              style={{ width: `${pctB}%` }}
            />
          </div>
        </div>
        <span className={`text-sm font-semibold min-w-[80px] ${bWins ? "text-accent-foreground" : "text-muted-foreground"}`}>
          {field.format(valB)}
        </span>
      </div>
    </div>
  );
});

export const OperatoriConfronto = memo(function OperatoriConfronto({ kpiList }: { kpiList: CallCenterKPI[] }) {
  const [opA, setOpA] = useState<string>("");
  const [opB, setOpB] = useState<string>("");

  const dataA = kpiList.find((k) => k.operatore_id === opA);
  const dataB = kpiList.find((k) => k.operatore_id === opB);

  if (kpiList.length < 2) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            Servono almeno 2 operatori con dati per il confronto.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GitCompareArrows className="h-5 w-5" />
          Confronto Operatori
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <Select value={opA} onValueChange={setOpA}>
            <SelectTrigger>
              <SelectValue placeholder="Seleziona Operatore A" />
            </SelectTrigger>
            <SelectContent>
              {kpiList
                .filter((k) => k.operatore_id !== opB)
                .map((k) => (
                  <SelectItem key={k.operatore_id} value={k.operatore_id}>
                    {k.nome_operatore}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          <span className="text-sm font-medium text-muted-foreground">vs</span>

          <Select value={opB} onValueChange={setOpB}>
            <SelectTrigger>
              <SelectValue placeholder="Seleziona Operatore B" />
            </SelectTrigger>
            <SelectContent>
              {kpiList
                .filter((k) => k.operatore_id !== opA)
                .map((k) => (
                  <SelectItem key={k.operatore_id} value={k.operatore_id}>
                    {k.nome_operatore}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {dataA && dataB ? (
          <div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 pb-3 border-b border-border mb-1">
              <p className="text-sm font-semibold text-right text-primary">{dataA.nome_operatore}</p>
              <span className="min-w-[110px]" />
              <p className="text-sm font-semibold text-accent-foreground">{dataB.nome_operatore}</p>
            </div>
            {FIELDS.map((f) => (
              <CompareRow key={f.key} field={f} a={dataA} b={dataB} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            Seleziona due operatori per confrontare i KPI.
          </p>
        )}
      </CardContent>
    </Card>
  );
});
