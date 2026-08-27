/**
 * AdminAiSpesaRealeCard — quanto spendo davvero in AI, e quanto rivendo.
 *
 * PERCHE' ESISTE: il pannello "Overview Margini" chiama
 * `get_ai_economics_dashboard`, che legge `ai_model_usage_log` — 7 righe.
 * Gli addebiti veri stanno in `ai_call_ledger` — 1073 righe. Il superadmin
 * stava guardando lo 0,65% della propria spesa. Questa card legge la fonte
 * giusta, senza intermediari.
 *
 * La colonna che conta e' il MOLTIPLICATORE effettivo (incassato / speso):
 * e' il ricarico vero, quello che finisce in banca, non quello dichiarato nel
 * listino. Sotto la soglia minima la riga si accende.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wallet, TriangleAlert } from "lucide-react";

/** Ricarico minimo accettabile sulla rivendita. Sotto, si vende troppo basso. */
const MOLTIPLICATORE_MINIMO = 3;

const PERIODI = [
  { key: "30", label: "30 giorni", giorni: 30 },
  { key: "90", label: "90 giorni", giorni: 90 },
  { key: "all", label: "Sempre", giorni: null as number | null },
];

interface RigaLedger {
  tier_key: string | null;
  task_key: string | null;
  cost_real_eur: number | null;
  cost_billed_eur: number | null;
}

const eur = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2, useGrouping: "always" }).format(n);
const eur4 = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 4, useGrouping: "always" }).format(n);

function aggrega(righe: RigaLedger[], chiave: (r: RigaLedger) => string) {
  const m = new Map<string, { nome: string; n: number; speso: number; incassato: number }>();
  for (const r of righe) {
    const k = chiave(r) || "(non classificato)";
    const acc = m.get(k) ?? { nome: k, n: 0, speso: 0, incassato: 0 };
    acc.n += 1;
    acc.speso += Number(r.cost_real_eur ?? 0);
    acc.incassato += Number(r.cost_billed_eur ?? 0);
    m.set(k, acc);
  }
  return [...m.values()]
    .map((x) => ({ ...x, margine: x.incassato - x.speso, mult: x.speso > 0 ? x.incassato / x.speso : null }))
    .sort((a, b) => b.speso - a.speso);
}

export function AdminAiSpesaRealeCard() {
  const [periodo, setPeriodo] = useState("30");
  const giorni = PERIODI.find((p) => p.key === periodo)?.giorni ?? null;

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-ai-spesa-reale", periodo],
    refetchInterval: 60_000,
    queryFn: async () => {
      let q = supabase
        .from("ai_call_ledger")
        .select("tier_key, task_key, cost_real_eur, cost_billed_eur")
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(20000);
      if (giorni != null) {
        const da = new Date();
        da.setDate(da.getDate() - giorni);
        q = q.gte("created_at", da.toISOString());
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as RigaLedger[];
    },
  });

  if (isLoading) return <Skeleton className="h-56 w-full" />;
  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="p-4 text-sm text-destructive">
          Impossibile leggere il registro chiamate AI: {(error as Error).message}
        </CardContent>
      </Card>
    );
  }

  const righe = data ?? [];
  const speso = righe.reduce((s, r) => s + Number(r.cost_real_eur ?? 0), 0);
  const incassato = righe.reduce((s, r) => s + Number(r.cost_billed_eur ?? 0), 0);
  const margine = incassato - speso;
  const multGlobale = speso > 0 ? incassato / speso : null;

  const perTier = aggrega(righe, (r) => r.tier_key ?? "");
  const perTask = aggrega(righe, (r) => r.task_key ?? "").slice(0, 8);
  const sottoSoglia = perTier.filter((t) => t.mult != null && t.mult < MOLTIPLICATORE_MINIMO);

  const colore = (mult: number | null) =>
    mult == null ? "text-muted-foreground"
      : mult < 1 ? "text-destructive font-bold"
      : mult < MOLTIPLICATORE_MINIMO ? "text-amber-600 font-semibold"
      : "text-emerald-700 font-semibold";

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            Spesa AI reale — dal registro addebiti
          </CardTitle>
          <div className="flex gap-1">
            {PERIODI.map((p) => (
              <Button
                key={p.key}
                size="sm"
                variant={periodo === p.key ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setPeriodo(p.key)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {righe.length === 0 ? (
          <div className="text-xs text-muted-foreground border rounded p-3 bg-muted/30">
            Nessuna chiamata AI riuscita nel periodo scelto.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="p-2 rounded bg-rose-50 border border-rose-200">
                <div className="text-[10px] text-muted-foreground">Speso (costo provider)</div>
                <div className="font-bold text-rose-700">{eur(speso)}</div>
              </div>
              <div className="p-2 rounded bg-emerald-50 border border-emerald-200">
                <div className="text-[10px] text-muted-foreground">Addebitato ai clienti</div>
                <div className="font-bold text-emerald-700">{eur(incassato)}</div>
              </div>
              <div className="p-2 rounded bg-sky-50 border border-sky-200">
                <div className="text-[10px] text-muted-foreground">Margine</div>
                <div className="font-bold text-sky-700">{eur(margine)}</div>
              </div>
              <div className="p-2 rounded bg-violet-50 border border-violet-200">
                <div className="text-[10px] text-muted-foreground">Ricarico effettivo</div>
                <div className={`font-bold ${colore(multGlobale)}`}>
                  {multGlobale != null ? `${multGlobale.toFixed(1)}x` : "—"}
                </div>
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground">
              {righe.length.toLocaleString("it-IT")} chiamate riuscite. Il ricarico è
              calcolato sugli addebiti realmente registrati, non sul markup dichiarato
              a listino.
            </div>

            {sottoSoglia.length > 0 && (
              <div className="text-xs border rounded p-2 bg-amber-50 border-amber-300 flex items-start gap-2">
                <TriangleAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>{sottoSoglia.length} tier sotto il {MOLTIPLICATORE_MINIMO}x</strong>{" "}
                  ({sottoSoglia.map((t) => t.nome).join(", ")}). Su questi stai
                  rivendendo troppo vicino al costo.
                </span>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-muted-foreground">Per tier</div>
                {perTier.map((t) => (
                  <div key={t.nome} className="text-xs border rounded p-2 flex items-center justify-between gap-2">
                    <span className="truncate">{t.nome}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-muted-foreground">{eur4(t.speso)} → {eur4(t.incassato)}</span>
                      <Badge variant="outline" className={`text-[10px] ${colore(t.mult)}`}>
                        {t.mult != null ? `${t.mult.toFixed(1)}x` : "—"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <div className="text-[11px] font-medium text-muted-foreground">
                  Dove va la spesa (primi 8 task)
                </div>
                {perTask.map((t) => (
                  <div key={t.nome} className="text-xs border rounded p-2 flex items-center justify-between gap-2">
                    <span className="truncate">{t.nome}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-muted-foreground">{eur4(t.speso)}</span>
                      <Badge variant="outline" className={`text-[10px] ${colore(t.mult)}`}>
                        {t.mult != null ? `${t.mult.toFixed(1)}x` : "—"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
