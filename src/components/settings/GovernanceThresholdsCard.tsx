/**
 * #40 — Card di configurazione delle soglie di governance per-azienda.
 *
 * Tre blocchi, ognuno attivabile in modo indipendente:
 *   1. Doppia approvazione preventivi oltre un importo soglia (€).
 *   2. Alert di scostamento SAL (avanzamento dichiarato vs costi, ±%).
 *   3. Soglia di marginalità minima "sana" delle commesse (%).
 *
 * Sola lettura per i non-admin (lo scrive solo company_admin/super_admin, e la
 * RLS lo impone comunque lato DB). La logica/clamping è pura in
 * src/lib/governance/thresholds.ts; qui c'è solo lo stato del form + preview.
 */
import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Save, Info, FileSignature, Activity, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import {
  DEFAULT_GOVERNANCE_THRESHOLDS,
  normalizeGovernanceThresholds,
  valutaApprovazionePreventivo,
  valutaScostamentoSal,
  type GovernanceThresholds,
} from "@/lib/governance/thresholds";
import {
  useGovernanceThresholds,
  useSaveGovernanceThresholds,
} from "@/hooks/useGovernanceThresholds";

/** Stato del form: numeri come stringa per consentire editing libero. */
interface FormState {
  preventivoEnabled: boolean;
  importoSoglia: string;
  salEnabled: boolean;
  tolleranzaPerc: string;
  marginalitaEnabled: boolean;
  sogliaMinimaPerc: string;
}

function cfgToForm(cfg: GovernanceThresholds): FormState {
  return {
    preventivoEnabled: cfg.preventivoDoppiaApprovazione.enabled,
    importoSoglia: String(cfg.preventivoDoppiaApprovazione.importoSoglia),
    salEnabled: cfg.salScostamento.enabled,
    tolleranzaPerc: String(cfg.salScostamento.tolleranzaPerc),
    marginalitaEnabled: cfg.marginalita.enabled,
    sogliaMinimaPerc: String(cfg.marginalita.sogliaMinimaPerc),
  };
}

function formToCfg(f: FormState): GovernanceThresholds {
  return normalizeGovernanceThresholds({
    preventivoDoppiaApprovazione: {
      enabled: f.preventivoEnabled,
      importoSoglia: f.importoSoglia.trim() === "" ? 0 : Number(f.importoSoglia),
    },
    salScostamento: {
      enabled: f.salEnabled,
      tolleranzaPerc: f.tolleranzaPerc.trim() === "" ? 0 : Number(f.tolleranzaPerc),
    },
    marginalita: {
      enabled: f.marginalitaEnabled,
      sogliaMinimaPerc: f.sogliaMinimaPerc.trim() === "" ? 0 : Number(f.sogliaMinimaPerc),
    },
  });
}

export function GovernanceThresholdsCard({
  companyId,
  isAdmin,
}: {
  companyId: string;
  isAdmin: boolean;
}) {
  const { data: cfg, isLoading } = useGovernanceThresholds(companyId);
  const saveMutation = useSaveGovernanceThresholds(companyId);

  const [form, setForm] = useState<FormState>(() =>
    cfgToForm(DEFAULT_GOVERNANCE_THRESHOLDS),
  );
  const [baseline, setBaseline] = useState<string>("");

  // Popola dal DB quando arriva la config (e fissa la baseline per il dirty-check).
  useEffect(() => {
    if (!cfg) return;
    const f = cfgToForm(cfg);
    setForm(f);
    setBaseline(JSON.stringify(f));
  }, [cfg]);

  const dirty = useMemo(() => JSON.stringify(form) !== baseline, [form, baseline]);

  // Normalizzazione "live" per le preview (clampa come farà il save).
  const normalized = useMemo(() => formToCfg(form), [form]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    saveMutation.mutate(formToCfg(form), {
      onSuccess: () => setBaseline(JSON.stringify(form)),
    });
  };

  // Preview testuali con i valutatori puri (esempio rappresentativo).
  const previewPreventivo = useMemo(() => {
    const soglia = normalized.preventivoDoppiaApprovazione.importoSoglia;
    if (!normalized.preventivoDoppiaApprovazione.enabled || soglia <= 0) return null;
    const esempio = valutaApprovazionePreventivo(normalized, soglia);
    return esempio.motivo;
  }, [normalized]);

  const previewSal = useMemo(() => {
    if (!normalized.salScostamento.enabled || normalized.salScostamento.tolleranzaPerc <= 0)
      return null;
    const toll = normalized.salScostamento.tolleranzaPerc;
    const esempio = valutaScostamentoSal(normalized, {
      avanzamentoPerc: 50,
      costiPerc: 50 + toll * 2.5,
    });
    return esempio.messaggio;
  }, [normalized]);

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-tight">Governance &amp; soglie</h2>
            <p className="text-sm text-muted-foreground">
              Controlli automatici su preventivi, avanzamento SAL e marginalità delle commesse.
              Sono <strong>avvisi non bloccanti</strong>: segnalano, non impediscono.
            </p>
          </div>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={handleSave} disabled={!dirty || saveMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? "Salvataggio…" : dirty ? "Salva modifiche" : "Salvato"}
          </Button>
        )}
      </div>

      {!isAdmin && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Solo un amministratore dell&apos;azienda può modificare queste soglie. Le vedi in sola
            lettura.
          </span>
        </div>
      )}

      {/* 1. Doppia approvazione preventivi */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-primary" />
            Doppia approvazione preventivi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={form.preventivoEnabled}
              disabled={!isAdmin}
              onCheckedChange={(v) => setField("preventivoEnabled", v)}
            />
            <span className="text-sm">
              Richiedi una seconda approvazione oltre l&apos;importo soglia
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Label className="whitespace-nowrap text-sm">Soglia importo (€, netto IVA)</Label>
            <Input
              type="number"
              min="0"
              step="1000"
              className="w-40"
              placeholder="50000"
              value={form.importoSoglia}
              disabled={!isAdmin || !form.preventivoEnabled}
              onChange={(e) => setField("importoSoglia", e.target.value)}
            />
          </div>
          {previewPreventivo ? (
            <p className="text-xs text-muted-foreground">
              Es. un preventivo da {formatCurrency(normalized.preventivoDoppiaApprovazione.importoSoglia)} →{" "}
              <span className="font-medium text-foreground">{previewPreventivo}</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Con la funzione attiva e soglia &gt; 0, i preventivi pari o superiori alla soglia
              verranno segnalati per una seconda firma.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 2. Scostamento SAL */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Alert scostamento SAL
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={form.salEnabled}
              disabled={!isAdmin}
              onCheckedChange={(v) => setField("salEnabled", v)}
            />
            <span className="text-sm">
              Segnala quando i costi consumati divergono dall&apos;avanzamento dichiarato
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Label className="whitespace-nowrap text-sm">Tolleranza scostamento ±%</Label>
            <Input
              type="number"
              min="0"
              max="100"
              step="1"
              className="w-28"
              placeholder="5"
              value={form.tolleranzaPerc}
              disabled={!isAdmin || !form.salEnabled}
              onChange={(e) => setField("tolleranzaPerc", e.target.value)}
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          {previewSal ? (
            <p className="text-xs text-muted-foreground">
              Oltre il doppio della tolleranza l&apos;alert diventa <strong>critico</strong>. Es.:{" "}
              <span className="font-medium text-foreground">{previewSal}</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Confronta avanzamento lavori (%) e costi consumati (%): oltre la tolleranza scatta un
              avviso, oltre il doppio diventa critico.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 3. Marginalità minima */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Marginalità minima commesse
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={form.marginalitaEnabled}
              disabled={!isAdmin}
              onCheckedChange={(v) => setField("marginalitaEnabled", v)}
            />
            <span className="text-sm">
              Semaforo giallo sotto la soglia di margine (il rosso per perdita è sempre attivo)
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Label className="whitespace-nowrap text-sm">Soglia margine minimo %</Label>
            <Input
              type="number"
              min="0"
              max="100"
              step="1"
              className="w-28"
              placeholder="15"
              value={form.sogliaMinimaPerc}
              disabled={!isAdmin || !form.marginalitaEnabled}
              onChange={(e) => setField("sogliaMinimaPerc", e.target.value)}
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Margine &lt; 0% → rosso (in perdita) · 0…soglia → giallo (a rischio) · ≥ soglia → verde.
          </p>
        </CardContent>
      </Card>

      {isLoading && (
        <p className="text-xs text-muted-foreground">Caricamento soglie…</p>
      )}
    </div>
  );
}
