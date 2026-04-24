import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save, RotateCcw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  useLeadScoringConfig,
  useUpsertLeadScoringConfig,
  DEFAULT_LEAD_SCORING_CONFIG,
  type LeadScoringConfig,
} from "@/hooks/useLeadScoringConfig";

interface Props {
  companyId: string;
}

type FormState = Omit<LeadScoringConfig, "company_id" | "updated_at" | "updated_by">;

export function LeadScoringConfigForm({ companyId }: Props) {
  const { data, isLoading } = useLeadScoringConfig(companyId);
  const upsert = useUpsertLeadScoringConfig(companyId);
  const [form, setForm] = useState<FormState | null>(null);
  const [sourcesText, setSourcesText] = useState("");

  useEffect(() => {
    if (data && !form) {
      const { company_id: _c, updated_at: _u1, updated_by: _u2, ...rest } = data;
      setForm(rest);
      setSourcesText(
        Object.entries(rest.source_scores)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n")
      );
    }
  }, [data, form]);

  if (isLoading || !form) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Caricamento config...
      </div>
    );
  }

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const parseSources = (text: string): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const line of text.split("\n")) {
      const [k, v] = line.split(":");
      if (!k?.trim() || !v?.trim()) continue;
      const n = parseInt(v.trim(), 10);
      if (!Number.isNaN(n) && n >= 0) out[k.trim().toLowerCase()] = n;
    }
    return out;
  };

  const handleSave = async () => {
    try {
      const payload: FormState = { ...form, source_scores: parseSources(sourcesText) };
      await upsert.mutateAsync(payload);
      toast.success("Configurazione salvata");
    } catch (e) {
      toast.error("Errore salvataggio: " + (e as Error).message);
    }
  };

  const handleReset = () => {
    setForm({ ...DEFAULT_LEAD_SCORING_CONFIG });
    setSourcesText(
      Object.entries(DEFAULT_LEAD_SCORING_CONFIG.source_scores)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n")
    );
  };

  const intField = (key: keyof FormState, label: string, max = 50) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={0}
        max={max}
        value={(form[key] as number) ?? 0}
        onChange={(e) => setField(key, Number(e.target.value) as any)}
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
            onChange={(e) => setSourcesText(e.target.value)}
            className="w-full min-h-[140px] rounded-md border border-input bg-background p-2 text-xs font-mono"
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

        <div className="flex items-center justify-between pt-4">
          <Button variant="outline" size="sm" onClick={handleReset}>
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
