/**
 * Tab Health-check & Riconciliazione.
 *
 * Sezioni:
 *   A. Punteggio salute dati (10 check)
 *   B. Wizard onboarding rapido (link a sezioni mancanti)
 *   C. Riconciliazione vs commercialista (4 numeri NI vs sistema)
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import {
  useHealthCheck, useRiconciliazione, useUpsertRiconciliazione,
  type HealthStatus,
} from "@/hooks/controlloGestione/useHealthRiconciliazione";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  HeartPulse, CheckCircle2, AlertCircle, XCircle,
  ArrowRight, Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  anno: number;
}

const STATUS_BADGE: Record<HealthStatus, { color: string; icon: React.ReactNode; label: string }> = {
  ok:       { color: "text-emerald-700 bg-emerald-50",  icon: <CheckCircle2 className="h-4 w-4" />, label: "OK" },
  warn:     { color: "text-amber-700 bg-amber-50",      icon: <AlertCircle className="h-4 w-4" />,  label: "Da migliorare" },
  critical: { color: "text-rose-700 bg-rose-50",        icon: <XCircle className="h-4 w-4" />,      label: "Critico" },
};

export function TabHealthCheck({ anno }: Props) {
  const h = useHealthCheck(anno);
  const r = useRiconciliazione(anno);
  const upsert = useUpsertRiconciliazione();
  const { toast } = useToast();

  const [form, setForm] = useState({
    ricavi: "",
    costi: "",
    utile: "",
    pn: "",
    imposte: "",
    note: "",
  });

  useEffect(() => {
    if (r.data?.dichiarato) {
      setForm({
        ricavi: r.data.dichiarato.ricavi != null ? String(r.data.dichiarato.ricavi) : "",
        costi:  r.data.dichiarato.costi  != null ? String(r.data.dichiarato.costi)  : "",
        utile:  r.data.dichiarato.utile  != null ? String(r.data.dichiarato.utile)  : "",
        pn:     r.data.dichiarato.patrimonio_netto != null ? String(r.data.dichiarato.patrimonio_netto) : "",
        imposte: r.data.dichiarato.imposte != null ? String(r.data.dichiarato.imposte) : "",
        note:   r.data.dichiarato.note ?? "",
      });
    }
  }, [r.data?.dichiarato]);

  const handleSave = async () => {
    try {
      await upsert.mutateAsync({
        anno,
        ricavi_dichiarati:           form.ricavi ? Number(form.ricavi) : null,
        costi_dichiarati:            form.costi ? Number(form.costi) : null,
        utile_dichiarato:            form.utile ? Number(form.utile) : null,
        patrimonio_netto_dichiarato: form.pn ? Number(form.pn) : null,
        imposte_dichiarate:          form.imposte ? Number(form.imposte) : null,
        note: form.note.trim() || null,
      });
      toast({ title: "Riconciliazione salvata" });
    } catch (e) {
      toast({ title: "Errore", description: String(e), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      {/* Sezione A: Health Score */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <HeartPulse className="h-4 w-4" /> Salute dei dati per il Controllo di Gestione
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Verifica in tempo reale che il modulo abbia tutti i dati per dare numeri affidabili.
          </p>
        </CardHeader>
        <CardContent>
          {h.isLoading && <Skeleton className="h-32 w-full" />}
          {h.isError && <ErrorBlock onRetry={() => h.refetch()} />}
          {h.data && (
            <>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div
                  className={cn(
                    "rounded-2xl p-6",
                    h.data.percentuale >= 80 ? "bg-emerald-50"
                    : h.data.percentuale >= 50 ? "bg-amber-50" : "bg-rose-50",
                  )}
                >
                  <p className="text-xs text-muted-foreground">Punteggio salute</p>
                  <p
                    className={cn(
                      "mt-1 text-4xl font-bold tabular-nums",
                      h.data.percentuale >= 80 ? "text-emerald-700"
                      : h.data.percentuale >= 50 ? "text-amber-700" : "text-rose-700",
                    )}
                  >
                    {h.data.score}/{h.data.max_score}
                  </p>
                  <p className="mt-2 text-sm font-medium">{h.data.percentuale.toFixed(0)}%</p>
                  <Progress value={h.data.percentuale} className="mt-2 h-2" />
                </div>
                <div className="rounded-2xl border bg-card p-4 lg:col-span-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Stato in breve</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    <li>
                      ✅{" "}
                      {h.data.checks.filter((c) => c.status === "ok").length} indicatori OK
                    </li>
                    <li>
                      ⚠️{" "}
                      {h.data.checks.filter((c) => c.status === "warn").length} da migliorare
                    </li>
                    <li>
                      ❌{" "}
                      {h.data.checks.filter((c) => c.status === "critical").length} critici (richiedono intervento)
                    </li>
                  </ul>
                  {h.data.percentuale >= 80 && (
                    <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">
                      Dati pronti per produrre report bancabili.
                    </p>
                  )}
                  {h.data.percentuale < 50 && (
                    <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
                      Numerosi dati mancano. Compila prima le sezioni in rosso, altrimenti i prospetti CG saranno parziali.
                    </p>
                  )}
                </div>
              </div>

              {/* Lista check */}
              <div className="mt-4 space-y-2">
                {h.data.checks.map((c) => {
                  const cfg = STATUS_BADGE[c.status];
                  return (
                    <div key={c.codice} className="flex items-start gap-3 rounded-xl border p-3">
                      <span className={cn("rounded-md p-1.5", cfg.color)}>{cfg.icon}</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{c.label}</p>
                        <p className="text-xs text-muted-foreground">{c.descrizione}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums">{c.valore}</p>
                        <p className="text-[11px] text-muted-foreground">target {c.target}</p>
                      </div>
                      {c.azione_url && c.status !== "ok" && (
                        <Link to={c.azione_url}>
                          <Button variant="ghost" size="sm" className="h-7 shrink-0">
                            Vai <ArrowRight className="ml-1 h-3 w-3" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Sezione B: Wizard quick-onboarding (mostrato se score < 80%) */}
      {h.data && h.data.percentuale < 80 && (
        <Card className="rounded-2xl border-amber-200 bg-amber-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" /> Setup rapido CG
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              In meno di 10 minuti hai il modulo pronto. Segui questi 4 step in ordine:
            </p>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm">
              <WizardStep
                done={h.data.checks.find((c) => c.codice === "classificazioni")?.status === "ok"}
                label="1. Carica le 45 voci di classificazione predefinite"
                href="/azienda/controllo-gestione/configurazione"
              />
              <WizardStep
                done={h.data.checks.find((c) => c.codice === "patrimonio_netto")?.status === "ok"}
                label="2. Compila il Patrimonio Netto (capitale, riserve, utile)"
                href="/azienda/dati-azienda"
              />
              <WizardStep
                done={h.data.checks.find((c) => c.codice === "cespiti")?.status === "ok"}
                label="3. Carica i cespiti per gli ammortamenti"
                href="/azienda/cespiti"
              />
              <WizardStep
                done={h.data.checks.find((c) => c.codice === "loans")?.status === "ok"}
                label="4. Aggiungi i mutui MLT da PFN & Debiti"
                href="/azienda/controllo-gestione/pfn-debiti"
              />
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Sezione C: Riconciliazione commercialista */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Riconciliazione vs commercialista · {anno}</CardTitle>
          <p className="text-xs text-muted-foreground">
            Inserisci i 4 numeri della Nota Integrativa depositata. Vedrai dove e quanto il sistema differisce.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div>
              <Label className="text-xs">Ricavi dichiarati</Label>
              <Input
                type="number"
                value={form.ricavi}
                onChange={(e) => setForm({ ...form, ricavi: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Costi dichiarati</Label>
              <Input
                type="number"
                value={form.costi}
                onChange={(e) => setForm({ ...form, costi: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Utile dichiarato</Label>
              <Input
                type="number"
                value={form.utile}
                onChange={(e) => setForm({ ...form, utile: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">PN dichiarato</Label>
              <Input
                type="number"
                value={form.pn}
                onChange={(e) => setForm({ ...form, pn: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Imposte dichiarate</Label>
              <Input
                type="number"
                value={form.imposte}
                onChange={(e) => setForm({ ...form, imposte: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Note</Label>
            <Textarea
              rows={2}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="es. Bilancio depositato il 30/04/2027, firmato dr. Rossi"
            />
          </div>
          <Button onClick={handleSave} disabled={upsert.isPending}>
            Salva e riconcilia
          </Button>

          {r.data && r.data.dichiarato && r.data.discrepanze && (
            <div className="mt-4 overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Voce</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Dichiarato (NI)</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Sistema CG</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Differenza €</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Differenza %</th>
                  </tr>
                </thead>
                <tbody>
                  <RiconciliazioneRow
                    label="Ricavi"
                    dich={r.data.dichiarato.ricavi}
                    sist={r.data.sistema.ricavi}
                    deltaEur={r.data.discrepanze.ricavi_eur}
                    deltaPct={r.data.discrepanze.ricavi_pct}
                  />
                  <RiconciliazioneRow
                    label="Utile"
                    dich={r.data.dichiarato.utile}
                    sist={r.data.sistema.utile}
                    deltaEur={r.data.discrepanze.utile_eur}
                    deltaPct={r.data.discrepanze.utile_pct}
                  />
                  <RiconciliazioneRow
                    label="Patrimonio netto"
                    dich={r.data.dichiarato.patrimonio_netto}
                    sist={r.data.sistema.patrimonio_netto}
                    deltaEur={r.data.discrepanze.pn_eur}
                  />
                  <RiconciliazioneRow
                    label="Imposte"
                    dich={r.data.dichiarato.imposte}
                    sist={r.data.sistema.imposte}
                    deltaEur={r.data.discrepanze.imposte_eur}
                  />
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function WizardStep({ done, label, href }: { done: boolean; label: string; href: string }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border bg-card p-3">
      {done ? (
        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
      ) : (
        <span className="inline-block h-5 w-5 rounded-full border-2 border-muted-foreground/40" />
      )}
      <span className={cn("flex-1", done && "text-muted-foreground line-through")}>{label}</span>
      {!done && (
        <Link to={href}>
          <Button size="sm" variant="outline">
            Vai <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
      )}
    </li>
  );
}

function RiconciliazioneRow({
  label, dich, sist, deltaEur, deltaPct,
}: {
  label: string;
  dich: number | null;
  sist: number;
  deltaEur: number;
  deltaPct?: number | null;
}) {
  const tolleranza = Math.abs(dich ?? 0) * 0.05; // 5%
  const dentro = Math.abs(deltaEur) <= tolleranza;
  return (
    <tr className="border-t">
      <td className="px-3 py-2 font-medium">{label}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        {dich != null ? formatCurrency(dich) : "—"}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(sist)}</td>
      <td className={cn(
        "px-3 py-2 text-right tabular-nums font-medium",
        Math.abs(deltaEur) === 0 ? "text-muted-foreground"
        : dentro ? "text-amber-700" : "text-rose-700",
      )}>
        {formatCurrency(deltaEur)}
      </td>
      <td className="px-3 py-2 text-right">
        {deltaPct != null ? (
          <Badge
            variant="outline"
            className={cn(
              "text-[11px]",
              dentro ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
            )}
          >
            {deltaPct > 0 ? "+" : ""}{deltaPct.toFixed(1)}%
            {dentro ? " ✓" : " ✗"}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}
