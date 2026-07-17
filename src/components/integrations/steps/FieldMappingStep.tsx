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
  /** Chiamata DOPO il salvataggio riuscito (il wizard avanza da qui). */
  onSaved?: () => void;
}

interface MetaQuestion {
  key: string;
  label: string;
  type: string;
}

// Mappa i TYPE standard dei moduli Meta ai campi CRM. Il `type` è
// indipendente dalla lingua (es. FULL_NAME anche se la chiave è
// "nome_e_cognome"), quindi è il segnale affidabile per l'auto-mapping.
const TYPE_TO_CRM: Record<string, string> = {
  FULL_NAME: "full_name",
  FIRST_NAME: "first_name",
  LAST_NAME: "last_name",
  EMAIL: "email",
  PHONE: "phone",
  PHONE_NUMBER: "phone",
  CITY: "city",
  STATE: "province",
  PROVINCE: "province",
  ZIP: "postal_code",
  POST_CODE: "postal_code",
  POSTAL_CODE: "postal_code",
  STREET_ADDRESS: "address",
  COMPANY_NAME: "company_name",
};

// Normalizza chiave/etichetta: minuscole, accenti rimossi, separatori a "_"
// (così "Città" → "citta", "E-mail" → "e_mail").
function normalizeField(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "") // rimuove accenti/diacritici
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Indovina il campo CRM per un campo modulo Meta: prima per TYPE (affidabile),
// poi fallback su chiave/etichetta per campi CUSTOM o con type localizzato.
function guessCrmField(q: { key: string; label: string; type: string }): string | null {
  const byType = TYPE_TO_CRM[(q.type || "").toUpperCase()];
  if (byType) return byType;

  const text = `${normalizeField(q.key)}_${normalizeField(q.label)}`;
  if (/nome_?e_?cognome|nome_completo|full_?name|nominativo|nome_cognome/.test(text)) return "full_name";
  if (/e_?mail|email/.test(text)) return "email";
  if (/telefono|phone|cellulare|numero_di_telefono|whatsapp|mobile/.test(text)) return "phone";
  if (/citta|city|comune|localita/.test(text)) return "city";
  if (/cognome|last_?name|surname/.test(text)) return "last_name";
  if (/(^|_)nome(_|$)|first_?name/.test(text)) return "first_name";
  if (/cap|zip|postal|codice_postale/.test(text)) return "postal_code";
  if (/provincia|province|regione|(^|_)state(_|$)/.test(text)) return "province";
  if (/indirizzo|address|(^|_)via(_|$)|street/.test(text)) return "address";
  if (/azienda|company|ditta|ragione_sociale/.test(text)) return "company_name";
  return null;
}

// Costruisce la mappatura automatica per la lista di campi del modulo.
function buildAutoMap(qs: { key: string; label: string; type: string }[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const q of qs) {
    const crm = guessCrmField(q);
    if (crm) map[q.key] = crm;
  }
  return map;
}

// Valori d'esempio per l'anteprima, per campo CRM.
const EXAMPLE_BY_CRM: Record<string, string> = {
  full_name: "Mario Rossi",
  first_name: "Mario",
  last_name: "Rossi",
  email: "mario.rossi@email.it",
  phone: "+39 333 1234567",
  city: "Roma",
  address: "Via Roma 1",
  postal_code: "00100",
  province: "RM",
  company_name: "Rossi Srl",
};

export function FieldMappingStep({ hook, formId, onSaved }: FieldMappingStepProps) {
  const { callProxy, mappings, saveMapping } = hook;
  const { effectiveCompany } = useAuth();
  const companyId = (effectiveCompany as any)?.id;

  const [questions, setQuestions] = useState<MetaQuestion[]>([]);
  const [fieldMap, setFieldMap] = useState<Record<string, string>>({});
  const [pipelineId, setPipelineId] = useState("__none__");
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
      if (!pipelineId || pipelineId === "__none__") return [];
      const { data } = await supabase
        .from("marketing_pipeline_stages")
        .select("id, name")
        .eq("pipeline_id", pipelineId)
        .order("position");
      return data || [];
    },
    enabled: !!pipelineId && pipelineId !== "__none__",
  });

  // Fetch custom fields
  const { data: customFields = [] } = useQuery({
    queryKey: ["custom-fields", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      // v8.6.44 — fix bug: la tabella marketing_custom_fields ha solo
      // `name`, non `field_label`. Prima la query falliva o ritornava []
      // silenziosamente perché entrambe le colonne `field_name`/`field_label`
      // non esistono nello schema.
      const { data } = await supabase
        .from("marketing_custom_fields")
        .select("id, name, field_type, options, section")
        .eq("company_id", companyId)
        .eq("object_type", "contact")
        .order("name");
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
        // Auto-mapping sui campi standard (per TYPE, indipendente dalla lingua)
        setFieldMap(buildAutoMap(qs));
      }
    } catch (error: any) {
      toast.error(`Errore caricamento campi: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const allCrmFields = [
    ...CRM_STANDARD_FIELDS.map((f) => ({ key: f.key, label: f.label })),
    ...customFields.map((f: { id: string; name: string }) => ({ key: `custom_${f.id}`, label: `✦ ${f.name}` })),
  ];

  // Riapplica l'auto-mapping ai campi standard non ancora mappati, senza
  // sovrascrivere le scelte manuali dell'utente.
  const handleAutoMap = () => {
    const auto = buildAutoMap(questions);
    const added = Object.keys(auto).filter((k) => !fieldMap[k]).length;
    setFieldMap((prev) => {
      const next = { ...prev };
      for (const k in auto) if (!next[k]) next[k] = auto[k];
      return next;
    });
    toast.success(added > 0 ? `${added} campi mappati automaticamente` : "Campi standard già mappati");
  };

  const handleSave = () => {
    const mappedValues = Object.values(fieldMap).filter(Boolean);
    const hasContactKey = mappedValues.some((value) => ["email", "phone", "full_name", "first_name", "last_name"].includes(value));
    if (!hasContactKey) {
      toast.error("Mappa almeno un campo identificativo", {
        description: "Email, telefono o nome servono per deduplicare e creare contatti affidabili.",
      });
      return;
    }
    if (dedupePolicy === "email" && !mappedValues.includes("email")) {
      toast.error("La deduplica per email richiede il campo Email mappato.");
      return;
    }
    if (dedupePolicy === "phone" && !mappedValues.includes("phone")) {
      toast.error("La deduplica per telefono richiede il campo Telefono mappato.");
      return;
    }
    if (dedupePolicy === "email_or_phone" && !mappedValues.includes("email") && !mappedValues.includes("phone")) {
      toast.error("La deduplica email/telefono richiede Email o Telefono mappati.");
      return;
    }

    saveMapping.mutate({
      formId,
      rules: buildRules(),
    }, {
      onSuccess: () => onSaved?.(),
    });
  };

  const buildRules = () => {
    return {
        field_map: fieldMap,
        required_fields_policy: "lenient",
        default_values: {},
        transformations: {},
        tags_to_apply: tags.split(",").map((t) => t.trim()).filter(Boolean),
        pipeline_settings: {
          pipeline_id: pipelineId && pipelineId !== "__none__" ? pipelineId : null,
          stage_id: stageId || null,
          owner_user_id: ownerUserId || null,
          source,
          campaign: "",
        },
        dedupe_policy: dedupePolicy,
        update_policy: updatePolicy,
    };
  };

  // Build preview data
  const buildPreview = () => {
    const contact: Record<string, string> = {};
    const unmapped: string[] = [];
    const selectedPipeline = pipelines.find((p: any) => p.id === pipelineId);
    const selectedStage = stages.find((s: any) => s.id === stageId);

    for (const q of questions) {
      const crmField = fieldMap[q.key];
      const exampleVal = (crmField && EXAMPLE_BY_CRM[crmField]) || `Valore ${q.label}`;
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

      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        Prima di attivare il modulo, mappa almeno un identificativo stabile del contatto. La deduplica userà la regola selezionata nelle opzioni avanzate.
      </div>

      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="text-xs gap-1.5"
          onClick={handleAutoMap}
          disabled={questions.length === 0}
        >
          <Wand2 className="h-3.5 w-3.5" />
          Mappa automaticamente
        </Button>
      </div>

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
                  <SelectItem value="__none__">Nessuna</SelectItem>
                  {pipelines.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fase</Label>
              <Select value={stageId} onValueChange={setStageId} disabled={!pipelineId || pipelineId === "__none__"}>
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
