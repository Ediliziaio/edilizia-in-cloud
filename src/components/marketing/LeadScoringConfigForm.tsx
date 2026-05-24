import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Loader2, Save, RotateCcw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  useLeadScoringConfig,
  useUpsertLeadScoringConfig,
  DEFAULT_LEAD_SCORING_CONFIG,
  type LeadScoringConfig,
} from "@/hooks/useLeadScoringConfig";
import {
  clampLeadScoringNumber,
  formatLeadSourceScores,
  parseLeadSourceScores,
  validateLeadScoringConfigDraft,
} from "@/lib/leadScoringConfigForm";

interface Props {
  companyId: string;
}

type FormState = Omit<LeadScoringConfig, "company_id" | "updated_at" | "updated_by">;
type NumericFormField = Exclude<keyof FormState, "source_scores">;

export function LeadScoringConfigForm({ companyId }: Props) {
  const { data, isLoading, isError, error } = useLeadScoringConfig(companyId);
  const upsert = useUpsertLeadScoringConfig(companyId);
  const [form, setForm] = useState<FormState | null>(null);
  const [sourcesText, setSourcesText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [usedLocalFallback, setUsedLocalFallback] = useState(false);
  const loadErrorMessage = (error as { message?: string } | null)?.message;

  useEffect(() => {
    setForm(null);
    setSourcesText("");
    setFormError(null);
    setUsedLocalFallback(false);
  }, [companyId]);

  useEffect(() => {
    if (!data || data.company_id !== companyId) return;
    const { company_id: _companyId, updated_at: _updatedAt, updated_by: _updatedBy, ...rest } = data;
    setForm(rest);
    setSourcesText(formatLeadSourceScores(rest.source_scores));
    setFormError(null);
    setUsedLocalFallback(false);
  }, [companyId, data]);

  useEffect(() => {
    if (isLoading || !isError || form) return;
    setForm({ ...DEFAULT_LEAD_SCORING_CONFIG });
    setSourcesText(formatLeadSourceScores(DEFAULT_LEAD_SCORING_CONFIG.source_scores));
    setUsedLocalFallback(true);
  }, [form, isError, isLoading]);

  useEffect(() => {
    if (form || data || isError) return;

    const fallbackTimer = window.setTimeout(() => {
      setForm({ ...DEFAULT_LEAD_SCORING_CONFIG });
      setSourcesText(formatLeadSourceScores(DEFAULT_LEAD_SCORING_CONFIG.source_scores));
      setUsedLocalFallback(true);
    }, 2500);

    return () => window.clearTimeout(fallbackTimer);
  }, [companyId, data, form, isError]);

  if (!form) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
        {isError ? "Preparo i default locali..." : "Caricamento config..."}
      </div>
    );
  }

  const setNumberField = (key: NumericFormField, rawValue: string, max = 50) => {
    setForm((current) =>
      current ? { ...current, [key]: clampLeadScoringNumber(rawValue, max) } : current,
    );
    setFormError(null);
  };

  const handleSave = async () => {
    try {
      const parsedSources = parseLeadSourceScores(sourcesText);
      const validationErrors = validateLeadScoringConfigDraft(form, parsedSources.errors);
      if (validationErrors.length > 0) {
        setFormError(validationErrors[0]);
        toast.error(validationErrors[0]);
        return;
      }

      setFormError(null);
      const payload: FormState = { ...form, source_scores: parsedSources.scores };
      await upsert.mutateAsync(payload);
      toast.success("Configurazione salvata");
    } catch (e) {
      toast.error("Errore salvataggio: " + (e as Error).message);
    }
  };

  const handleReset = () => {
    setForm({ ...DEFAULT_LEAD_SCORING_CONFIG });
    setSourcesText(formatLeadSourceScores(DEFAULT_LEAD_SCORING_CONFIG.source_scores));
    setFormError(null);
    toast.info("Default ripristinati. Salva per applicarli.");
  };

  const intField = (key: NumericFormField, label: string, max = 50) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={0}
        max={max}
        value={(form[key] as number) ?? 0}
        onChange={(e) => setNumberField(key, e.target.value, max)}
        disabled={upsert.isPending}
        className="h-8"
      />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-primary" />
          Configurazione Lead Scoring
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Personalizza i pesi del punteggio lead per la tua azienda. ICP max 50 + Behavioral max 50 = Lead Score 0-100.
        </p>
        {(isError || usedLocalFallback) && (
          <p className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Non sono riuscito a caricare la configurazione dal server: sto mostrando i default locali modificabili.
              {loadErrorMessage ? ` Dettaglio: ${loadErrorMessage}` : ""}
            </span>
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs font-semibold mb-2 uppercase text-muted-foreground">Fattori ICP</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {intField("weight_company_name", "Azienda compilata")}
            {intField("weight_phone", "Telefono")}
            {intField("weight_address", "Indirizzo")}
            {intField("weight_city", "Città")}
          </div>
        </div>

        <Separator />

        <div>
          <p className="text-xs font-semibold mb-2 uppercase text-muted-foreground">Fattori comportamentali</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {intField("weight_open_opportunity", "Opp. aperta")}
            {intField("weight_recent_activity", "Attività recente (14gg)")}
            {intField("points_per_activity", "Punti per attività", 20)}
            {intField("max_activity_points", "Max punti attività")}
            {intField("max_history_points", "Max punti storico opp.")}
          </div>
        </div>

        <Separator />

        <div>
          <p className="text-xs font-semibold mb-2 uppercase text-muted-foreground">Fonti lead (chiave: punti)</p>
          <textarea
            value={sourcesText}
            onChange={(e) => {
              setSourcesText(e.target.value);
              setFormError(null);
            }}
            disabled={upsert.isPending}
            className="w-full min-h-[140px] rounded-md border border-input bg-background p-2 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60"
            placeholder={"referral: 15\nfiera: 10\nlinkedin: 8"}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Una fonte per riga. Formato <code>chiave: punti</code>. Max 50 punti.
          </p>
        </div>

        <Separator />

        <div>
          <p className="text-xs font-semibold mb-2 uppercase text-muted-foreground">
            Soglie Tier ICP (su ICP score 0-50)
          </p>
          <div className="grid grid-cols-3 gap-3">
            {intField("tier_a_threshold", "Tier A ≥")}
            {intField("tier_b_threshold", "Tier B ≥")}
            {intField("tier_c_threshold", "Tier C ≥")}
          </div>
        </div>

        {formError && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {formError}
          </p>
        )}

        <div className="flex items-center justify-between pt-4">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={upsert.isPending}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Ripristina default
          </Button>
          <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1" />
            )}
            Salva configurazione
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
