/**
 * #40 — Card di configurazione delle soglie di governance per-azienda.
 *
 * Tre blocchi, ognuno attivabile in modo indipendente:
 *   1. Doppia approvazione preventivi oltre un importo soglia (€).
 *   2. Alert di scostamento SAL (avanzamento dichiarato vs costi, ±%).
 *   3. Soglia di marginalità minima "sana" delle commesse (%).
 *   4. Rincari d'acquisto: quando un carico di magazzino costa più del solito.
 *
 * Sola lettura per i non-admin (lo scrive solo company_admin/super_admin, e la
 * RLS lo impone comunque lato DB). La logica/clamping è pura in
 * src/lib/governance/thresholds.ts; qui c'è solo lo stato del form + preview.
 */
import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Save, Info, FileSignature, Activity, TrendingUp, ArrowUpRight } from "lucide-react";
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
  valutaRincaro,
  valutaScostamentoSal,
  type GovernanceThresholds,
} from "@/lib/governance/thresholds";
import {
  useGovernanceThresholds,
  useSaveGovernanceThresholds,
} from "@/hooks/useGovernanceThresholds";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** Stato del form: numeri come stringa per consentire editing libero. */
interface FormState {
  preventivoEnabled: boolean;
  importoSoglia: string;
  salEnabled: boolean;
  tolleranzaPerc: string;
  marginalitaEnabled: boolean;
  sogliaMinimaPerc: string;
  rincaroEnabled: boolean;
  rincaroSogliaPerc: string;
  rincaroMinimoEuro: string;
}

function cfgToForm(cfg: GovernanceThresholds): FormState {
  return {
    preventivoEnabled: cfg.preventivoDoppiaApprovazione.enabled,
    importoSoglia: String(cfg.preventivoDoppiaApprovazione.importoSoglia),
    salEnabled: cfg.salScostamento.enabled,
    tolleranzaPerc: String(cfg.salScostamento.tolleranzaPerc),
    marginalitaEnabled: cfg.marginalita.enabled,
    sogliaMinimaPerc: String(cfg.marginalita.sogliaMinimaPerc),
    rincaroEnabled: cfg.rincaroAcquisti.enabled,
    rincaroSogliaPerc: String(cfg.rincaroAcquisti.sogliaPerc),
    rincaroMinimoEuro: String(cfg.rincaroAcquisti.minimoEuro),
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
    rincaroAcquisti: {
      enabled: f.rincaroEnabled,
      sogliaPerc: f.rincaroSogliaPerc.trim() === "" ? 0 : Number(f.rincaroSogliaPerc),
      minimoEuro: f.rincaroMinimoEuro.trim() === "" ? 0 : Number(f.rincaroMinimoEuro),
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
  const t = useT();
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

  // Esempio concreto: 100 pezzi che stavano a 10 €, ricomprati appena oltre la
  // soglia. Mostra sia la percentuale sia la spesa in più, i due numeri che
  // decidono se l'avviso parte.
  const previewRincaro = useMemo(() => {
    const { enabled, sogliaPerc } = normalized.rincaroAcquisti;
    if (!enabled) return null;
    const medio = 10;
    const prezzo = Math.round(medio * (1 + sogliaPerc / 100) * 100) / 100 + 0.01;
    const esito = valutaRincaro(normalized, { medioPrima: medio, prezzoPagato: prezzo, quantita: 100 });
    return esito.rincaro
      ? t("Es. 100 pezzi che stavano a {medio} ricomprati a {prezzo} → {esito}", { medio: formatCurrency(medio), prezzo: formatCurrency(prezzo), esito: esito.messaggio })
      : t("Es. 100 pezzi che stavano a {medio} ricomprati a {prezzo} → nessun avviso: la spesa in più ({spesa}) non arriva al minimo di {minimo}.", { medio: formatCurrency(medio), prezzo: formatCurrency(prezzo), spesa: formatCurrency(esito.spesaInPiu), minimo: formatCurrency(normalized.rincaroAcquisti.minimoEuro) });
  }, [normalized, t]);

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-tight">{t("Approvazioni e avvisi")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("Quando serve una seconda firma sul preventivo, quando una commessa segnala che costi o margine non tornano, e quando un acquisto costa più del solito. Sono")} <strong>{t("avvisi")}</strong>{t(": segnalano, non bloccano.")}
            </p>
          </div>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={handleSave} disabled={!dirty || saveMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? t("Salvataggio…") : dirty ? t("Salva modifiche") : t("Salvato")}
          </Button>
        )}
      </div>

      {!isAdmin && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            {t("Solo un amministratore dell'azienda può modificare queste soglie. Le vedi in sola lettura.")}
          </span>
        </div>
      )}

      {/* 1. Doppia approvazione preventivi */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-primary" />
            {t("Doppia approvazione preventivi")}
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
              {t("Richiedi una seconda approvazione oltre l'importo soglia")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Label className="whitespace-nowrap text-sm">{t("Soglia importo (€, netto IVA)")}</Label>
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
              {t("Es. un preventivo da {importo} →", { importo: formatCurrency(normalized.preventivoDoppiaApprovazione.importoSoglia) })}{" "}
              <span className="font-medium text-foreground">{previewPreventivo}</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("Con la funzione attiva e soglia > 0, i preventivi pari o superiori alla soglia verranno segnalati per una seconda firma.")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 2. Scostamento SAL */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            {t("Avviso se i costi non seguono l'avanzamento (SAL)")}
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
              {t("Segnala quando i costi consumati divergono dall'avanzamento dichiarato")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Label className="whitespace-nowrap text-sm">{t("Tolleranza scostamento ±%")}</Label>
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
              {t("Oltre il doppio della tolleranza l'alert diventa")} <strong>{t("critico")}</strong>{t(". Es.:")}{" "}
              <span className="font-medium text-foreground">{previewSal}</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("Confronta avanzamento lavori (%) e costi consumati (%): oltre la tolleranza scatta un avviso, oltre il doppio diventa critico.")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 3. Marginalità minima */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            {t("Margine minimo delle commesse")}
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
              {t("Semaforo giallo sotto la soglia di margine (il rosso per perdita è sempre attivo)")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Label className="whitespace-nowrap text-sm">{t("Soglia margine minimo %")}</Label>
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
            {t("Margine < 0% → rosso (in perdita) · 0…soglia → giallo (a rischio) · ≥ soglia → verde.")}
          </p>
        </CardContent>
      </Card>

      {/* 4. Rincari d'acquisto */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4 text-primary" />
            {t("Avviso se un acquisto costa più del solito")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={form.rincaroEnabled}
              disabled={!isAdmin}
              onCheckedChange={(v) => setField("rincaroEnabled", v)}
            />
            <span className="text-sm">
              {t("Segnala i carichi pagati sopra il costo medio della giacenza")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Label className="whitespace-nowrap text-sm">{t("Sopra il medio di")}</Label>
            <Input
              type="number"
              min="0"
              step="1"
              className="w-24"
              placeholder="15"
              aria-label={t("Soglia del rincaro in percentuale")}
              value={form.rincaroSogliaPerc}
              disabled={!isAdmin || !form.rincaroEnabled}
              onChange={(e) => setField("rincaroSogliaPerc", e.target.value)}
            />
            <span className="text-sm text-muted-foreground">%</span>
            <Label className="whitespace-nowrap text-sm">{t("e almeno")}</Label>
            <Input
              type="number"
              min="0"
              step="10"
              className="w-28"
              placeholder="50"
              aria-label={t("Spesa in più minima in euro")}
              value={form.rincaroMinimoEuro}
              disabled={!isAdmin || !form.rincaroEnabled}
              onChange={(e) => setField("rincaroMinimoEuro", e.target.value)}
            />
            <span className="text-sm text-muted-foreground">{t("€ di spesa in più")}</span>
          </div>
          {previewRincaro ? (
            <p className="text-xs text-muted-foreground">{previewRincaro}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("Con l'avviso spento i rincari non vengono più annotati.")}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {t("Il minimo in euro è la spesa in più di quel carico, non il prezzo: un articolo da 2 € che passa a 2,40 € è +20%, ma su dieci pezzi sono 4 € e non serve dirlo. Arriva")}{" "}
            <strong>{t("un solo riepilogo al mese")}</strong>{t(", non un avviso per ogni carico.")}
          </p>
        </CardContent>
      </Card>

      {isLoading && (
        <p className="text-xs text-muted-foreground">{t("Caricamento soglie…")}</p>
      )}
    </div>
  );
}
