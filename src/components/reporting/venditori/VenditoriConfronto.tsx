import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GitCompareArrows } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import type { VendorKPI } from "@/hooks/useVendorReport";

interface CompareField {
  key: keyof VendorKPI;
  label: string;
  format: (v: number) => string;
  lowerIsBetter?: boolean;
}

const FIELDS: CompareField[] = [
  { key: "fatturato_generato", label: "Fatturato Generato", format: (v) => formatCurrency(v) },
  { key: "tasso_chiusura", label: "Tasso Chiusura", format: (v) => `${v ?? 0}%` },
  { key: "tasso_show_up", label: "Show-Up Rate", format: (v) => `${v ?? 0}%` },
  { key: "importo_medio_chiusura", label: "Deal Size Medio", format: (v) => formatCurrency(v) },
  { key: "opp_vinte", label: "Opportunità Vinte", format: (v) => String(v) },
  { key: "tasso_app_to_close", label: "App → Chiusura", format: (v) => `${v ?? 0}%` },
  { key: "avg_giorni_chiusura", label: "Ciclo Vendita", format: (v) => `${v}gg`, lowerIsBetter: true },
  { key: "pipeline_valore", label: "Pipeline", format: (v) => formatCurrency(v) },
  { key: "nuovi_contatti", label: "Nuovi Contatti", format: (v) => String(v) },
];

function CompareRow({ field, a, b }: { field: CompareField; a: VendorKPI; b: VendorKPI }) {
  const valA = Number(a[field.key]) || 0;
  const valB = Number(b[field.key]) || 0;
  const max = Math.max(valA, valB, 1);
  const pctA = (valA / max) * 100;
  const pctB = (valB / max) * 100;

  const aWins = field.lowerIsBetter
    ? valA < valB && valA > 0
    : valA > valB;
  const bWins = field.lowerIsBetter
    ? valB < valA && valB > 0
    : valB > valA;
  const tie = valA === valB;

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2.5 border-b border-border last:border-0">
      {/* Agent A value + bar */}
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold min-w-[80px] text-right ${aWins ? "text-primary" : tie ? "text-muted-foreground" : "text-muted-foreground"}`}>
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

      {/* Label */}
      <span className="text-xs font-medium text-muted-foreground text-center min-w-[110px]">
        {field.label}
      </span>

      {/* Agent B value + bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="h-5 rounded-sm relative overflow-hidden w-full bg-muted/30">
            <div
              className={`absolute left-0 top-0 h-full rounded-sm transition-all ${bWins ? "bg-accent-foreground/70" : "bg-muted-foreground/20"}`}
              style={{ width: `${pctB}%` }}
            />
          </div>
        </div>
        <span className={`text-sm font-semibold min-w-[80px] ${bWins ? "text-accent-foreground" : tie ? "text-muted-foreground" : "text-muted-foreground"}`}>
          {field.format(valB)}
        </span>
      </div>
    </div>
  );
}

export function VenditoriConfronto({ kpiList }: { kpiList: VendorKPI[] }) {
  const [agentA, setAgentA] = useState<string>("");
  const [agentB, setAgentB] = useState<string>("");

  const dataA = kpiList.find((k) => k.agent_id === agentA);
  const dataB = kpiList.find((k) => k.agent_id === agentB);

  if (kpiList.length < 2) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            Servono almeno 2 agenti con dati per il confronto.
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
          Confronto Agenti
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Selectors */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <Select value={agentA} onValueChange={setAgentA}>
            <SelectTrigger>
              <SelectValue placeholder="Seleziona Agente A" />
            </SelectTrigger>
            <SelectContent>
              {kpiList
                .filter((k) => k.agent_id !== agentB)
                .map((k) => (
                  <SelectItem key={k.agent_id} value={k.agent_id}>
                    {k.nome_agente}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          <span className="text-sm font-medium text-muted-foreground">vs</span>

          <Select value={agentB} onValueChange={setAgentB}>
            <SelectTrigger>
              <SelectValue placeholder="Seleziona Agente B" />
            </SelectTrigger>
            <SelectContent>
              {kpiList
                .filter((k) => k.agent_id !== agentA)
                .map((k) => (
                  <SelectItem key={k.agent_id} value={k.agent_id}>
                    {k.nome_agente}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {/* Comparison */}
        {dataA && dataB ? (
          <div>
            {/* Header names */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 pb-3 border-b border-border mb-1">
              <p className="text-sm font-semibold text-right text-primary">{dataA.nome_agente}</p>
              <span className="min-w-[110px]" />
              <p className="text-sm font-semibold text-accent-foreground">{dataB.nome_agente}</p>
            </div>
            {FIELDS.map((f) => (
              <CompareRow key={f.key} field={f} a={dataA} b={dataB} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            Seleziona due agenti per confrontare i KPI.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
