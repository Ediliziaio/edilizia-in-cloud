import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Wand2, Eye } from "lucide-react";
import { toast } from "sonner";
import { CRM_STANDARD_FIELDS } from "@/types/integrations";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface FieldMappingStepProps {
  hook: any;
  formId: string;
}

interface MetaQuestion {
  key: string;
  label: string;
  type: string;
}

const AUTO_MAP: Record<string, string> = {
  full_name: "full_name",
  email: "email",
  phone_number: "phone",
  city: "city",
  street_address: "address",
  zip: "postal_code",
  state: "province",
  first_name: "first_name",
  last_name: "last_name",
  company_name: "company_name",
};

const EXAMPLE_VALUES: Record<string, string> = {
  full_name: "Mario Rossi",
  first_name: "Mario",
  last_name: "Rossi",
  email: "mario.rossi@email.it",
  phone_number: "+39 333 1234567",
  city: "Roma",
  street_address: "Via Roma 1",
  zip: "00100",
  state: "RM",
  company_name: "Rossi Srl",
};

export function FieldMappingStep({ hook, formId }: FieldMappingStepProps) {
  const { callProxy, mappings, saveMapping } = hook;
  const { effectiveCompany } = useAuth();
  const companyId = (effectiveCompany as any)?.id;

  const [questions, setQuestions] = useState<MetaQuestion[]>([]);
  const [fieldMap, setFieldMap] = useState<Record<string, string>>({});
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [source, setSource] = useState("Meta Lead Ads");
  const [dedupePolicy, setDedupePolicy] = useState("email");
  const [updatePolicy, setUpdatePolicy] = useState("upsert");
  const [tags, setTags] = useState("");
  const [loading, setLoading] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Fetch pipelines
  const { data: pipelines = [] } = useQuery({
    queryKey: ["pipelines", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("marketing_pipelines")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name");
      return data || [];
    },
    enabled: !!companyId,
  });

  // Fetch stages for selected pipeline
  const { data: stages = [] } = useQuery({
    queryKey: ["pipeline-stages", pipelineId],
    queryFn: async () => {
      if (!pipelineId) return [];
      const { data } = await supabase
        .from("marketing_pipeline_stages")
        .select("id, name")
        .eq("pipeline_id", pipelineId)
        .order("position");
      return data || [];
    },
    enabled: !!pipelineId,
  });

  // Fetch custom fields
  const { data: customFields = [] } = useQuery({
    queryKey: ["custom-fields", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("marketing_custom_fields")
        .select("id, field_name, field_label, field_type")
        .eq("company_id", companyId)
        .eq("object_type", "contact")
        .order("field_label");
      return data || [];
    },
    enabled: !!companyId,
  });

  useEffect(() => {
    loadFormFields();
  }, [formId]);

  useEffect(() => {
    const existing = mappings.find((m: any) => m.form_id === formId);
    if (existing?.rules) {
      const r = existing.rules as any;
      if (r.field_map) setFieldMap(r.field_map);
      if (r.pipeline_settings?.pipeline_id) setPipelineId(r.pipeline_settings.pipeline_id);
      if (r.pipeline_settings?.stage_id) setStageId(r.pipeline_settings.stage_id);
      if (r.pipeline_settings?.owner_user_id) setOwnerUserId(r.pipeline_settings.owner_user_id);
      if (r.pipeline_settings?.source) setSource(r.pipeline_settings.source);
      if (r.dedupe_policy) setDedupePolicy(r.dedupe_policy);
      if (r.update_policy) setUpdatePolicy(r.update_policy);
      if (r.tags_to_apply) setTags(r.tags_to_apply.join(", "));
    }
  }, [mappings, formId]);

  const loadFormFields = async () => {
    try {
      setLoading(true);
      const result = await callProxy("get-form-fields", { form_id: formId });
      const qs = (result.form?.questions || []).map((q: any) => ({
        key: q.key,
        label: q.label || q.key,
        type: q.type,
      }));
      setQuestions(qs);

      const existing = mappings.find((m: any) => m.form_id === formId);
      if (!existing?.rules?.field_map) {
        const autoMap: Record<string, string> = {};
        for (const q of qs) {
          if (AUTO_MAP[q.key]) {
            autoMap[q.key] = AUTO_MAP[q.key];
          }
        }
        setFieldMap(autoMap);
      }
    } catch (error: any) {
      toast.error(`Errore caricamento campi: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const allCrmFields = [
    ...CRM_STANDARD_FIELDS.map((f) => ({ key: f.key, label: f.label })),
    ...customFields.map((f: any) => ({ key: `custom_${f.id}`, label: `✦ ${f.field_label}` })),
  ];

  const handleSave = () => {
    saveMapping.mutate({
      formId,
      rules: {
        field_map: fieldMap,
        required_fields_policy: "lenient",
        default_values: {},
        transformations: {},
        tags_to_apply: tags.split(",").map((t) => t.trim()).filter(Boolean),
        pipeline_settings: {
          pipeline_id: pipelineId || null,
          stage_id: stageId || null,
          owner_user_id: ownerUserId || null,
          source,
          campaign: "",
        },
        dedupe_policy: dedupePolicy,
        update_policy: updatePolicy,
      },
    });
  };

  // Build preview data
  const buildPreview = () => {
    const contact: Record<string, string> = {};
    const unmapped: string[] = [];
    const selectedPipeline = pipelines.find((p: any) => p.id === pipelineId);
    const selectedStage = stages.find((s: any) => s.id === stageId);

    for (const q of questions) {
      const crmField = fieldMap[q.key];
      const exampleVal = EXAMPLE_VALUES[q.key] || `Valore ${q.label}`;
      if (crmField) {
        const crmLabel = allCrmFields.find((f) => f.key === crmField)?.label || crmField;
        contact[crmLabel] = exampleVal;
      } else {
        unmapped.push(q.label);
      }
    }
    contact["Fonte"] = source;
    if (tags.trim()) contact["Tag"] = tags;

    return { contact, unmapped, pipeline: selectedPipeline?.name, stage: selectedStage?.name };
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Caricamento campi del modulo...</p>
      </div>
    );
  }

  const preview = previewOpen ? buildPreview() : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Associa ogni campo del modulo Meta al campo CRM corrispondente.
      </p>

      {/* Field mapping table */}
      <div className="border rounded-lg divide-y max-h-[250px] overflow-y-auto">
        <div className="grid grid-cols-2 gap-4 px-4 py-2 bg-muted/50 text-xs font-medium text-muted-foreground sticky top-0">
          <span>Campo modulo (Meta)</span>
          <span>Campo CRM</span>
        </div>
        {questions.map((q) => (
          <div key={q.key} className="grid grid-cols-2 gap-4 px-4 py-2 items-center">
            <div>
              <p className="text-sm">{q.label}</p>
              <p className="text-xs text-muted-foreground">{q.key}</p>
            </div>
            <Select
              value={fieldMap[q.key] || "__skip__"}
              onValueChange={(val) =>
                setFieldMap((prev) => {
                  const next = { ...prev };
                  if (val === "__skip__") {
                    delete next[q.key];
                  } else {
                    next[q.key] = val;
                  }
                  return next;
                })
              }
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Non mappare" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__skip__">— Non mappare —</SelectItem>
                {allCrmFields.map((f) => (
                  <SelectItem key={f.key} value={f.key}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {/* Preview mapping */}
      <Collapsible open={previewOpen} onOpenChange={setPreviewOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="text-xs gap-1">
            <Eye className="h-3 w-3" />
            Anteprima risultato
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          {preview && (
            <div className="border rounded-lg p-3 bg-muted/30 space-y-3 text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Contatto risultante:</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {Object.entries(preview.contact).map(([key, val]) => (
                    <div key={key} className="contents">
                      <span className="text-xs text-muted-foreground">{key}</span>
                      <span className="text-xs font-medium">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
              {preview.pipeline && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Opportunità:</p>
                  <p className="text-xs">Pipeline: <span className="font-medium">{preview.pipeline}</span></p>
                  {preview.stage && <p className="text-xs">Fase: <span className="font-medium">{preview.stage}</span></p>}
                </div>
              )}
              {preview.unmapped.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Campi non mappati: {preview.unmapped.join(", ")}</p>
                </div>
              )}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Advanced settings */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="text-xs gap-1">
            <Wand2 className="h-3 w-3" />
            Impostazioni avanzate
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Pipeline</Label>
              <Select value={pipelineId} onValueChange={setPipelineId}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Nessuna" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nessuna</SelectItem>
                  {pipelines.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fase</Label>
              <Select value={stageId} onValueChange={setStageId} disabled={!pipelineId}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Seleziona" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Deduplica per</Label>
              <Select value={dedupePolicy} onValueChange={setDedupePolicy}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Telefono</SelectItem>
                  <SelectItem value="email_or_phone">Email o Telefono</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Policy aggiornamento</Label>
              <Select value={updatePolicy} onValueChange={setUpdatePolicy}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="create_only">Solo creazione</SelectItem>
                  <SelectItem value="upsert">Crea o aggiorna</SelectItem>
                  <SelectItem value="overwrite_non_empty">Sovrascrivi non vuoti</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Tag (separati da virgola)</Label>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="lead-ads, facebook"
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Fonte</Label>
            <Input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Button onClick={handleSave} disabled={saveMapping.isPending} className="w-full">
        {saveMapping.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Salva mappatura
      </Button>
    </div>
  );
}
