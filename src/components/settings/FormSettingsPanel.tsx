import { LeadForm } from "@/hooks/useFormBuilder";
import { useId, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { useCompanyCallCenterUsers } from "@/hooks/useOpportunitiesData";
import {
  buildLeadFormAutoResizeEmbedSnippet,
  buildLeadFormIframeSnippet,
  buildLeadFormPublicUrl,
  getLeadFormBaseUrl,
  copyTextToClipboard,
  normalizeEmbedDimension,
} from "@/lib/formBuilder";

type PipelineStageOption = {
  id: string;
  name: string;
  position: number | null;
};

type PipelineOption = {
  id: string;
  name: string;
  marketing_pipeline_stages?: PipelineStageOption[] | null;
};

type UserOption = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

type TagOption = {
  id: string;
  name: string;
  color: string | null;
};

interface Props {
  form: LeadForm;
  theme: Record<string, unknown>;
  settings: Record<string, unknown>;
  onThemeChange: (t: Record<string, unknown>) => void;
  onSettingsChange: (s: Record<string, unknown>) => void;
  disabled?: boolean;
}

function displayUser(user: UserOption) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return fullName || user.email || "Utente";
}

function cleanStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
}

function stringSetting(source: Record<string, unknown>, key: string, fallback = "") {
  const value = source[key];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

export function FormSettingsPanel({ form, theme, settings, onThemeChange, onSettingsChange, disabled = false }: Props) {
  // Ogni etichetta è collegata al suo campo (prima nessuna lo era: da tastiera e con il lettore di schermo non si capiva cosa fosse cosa).
  const base = useId();
  const idDi = (nome: string) => `${base}-${nome}`;
  const publicUrl = buildLeadFormPublicUrl(getLeadFormBaseUrl(), form.slug, form.company_id) || "";
  const embedMinHeight = normalizeEmbedDimension(settings.embed_min_height, 620, 360, 1600);
  const embedMaxWidth = normalizeEmbedDimension(settings.embed_max_width, 640, 320, 1200);
  const selectedPipelineId = stringSetting(settings, "pipelineId");
  const selectedStageId = stringSetting(settings, "stageId") || stringSetting(settings, "stage_id") || stringSetting(settings, "pipelineStageId");
  const selectedDefaultTags = cleanStringArray(settings.defaultTags);

  const { data: pipelines = [] } = useQuery({
    queryKey: ["form-builder-settings-pipelines", form.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_pipelines")
        .select("id, name, marketing_pipeline_stages(id, name, position)")
        .eq("company_id", form.company_id)
        .order("name");
      if (error) throw error;
      return ((data || []) as PipelineOption[]).map((pipeline) => ({
        ...pipeline,
        marketing_pipeline_stages: [...(pipeline.marketing_pipeline_stages || [])].sort(
          (a, b) => (a.position ?? 0) - (b.position ?? 0),
        ),
      }));
    },
    enabled: !!form.company_id,
    staleTime: 10 * 60 * 1000,
  });

  // Gli stessi operatori call center dell'assegnazione in blocco delle
  // opportunità: nel form si sceglie tra le persone che si vedono nel kanban.
  const { data: operatoriCallCenter = [] } = useCompanyCallCenterUsers();

  const { data: users = [] } = useQuery({
    queryKey: ["form-builder-settings-users", form.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("company_id", form.company_id)
        .order("first_name");
      if (error) throw error;
      return (data || []) as UserOption[];
    },
    enabled: !!form.company_id,
    staleTime: 10 * 60 * 1000,
  });

  const { data: tags = [] } = useQuery({
    queryKey: ["form-builder-settings-tags", form.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_tags")
        .select("id, name, color")
        .eq("company_id", form.company_id)
        .order("name");
      if (error) throw error;
      return (data || []) as TagOption[];
    },
    enabled: !!form.company_id,
    staleTime: 10 * 60 * 1000,
  });

  const selectedPipeline = useMemo(
    () => pipelines.find((pipeline) => pipeline.id === selectedPipelineId) || null,
    [pipelines, selectedPipelineId],
  );
  const availableTags = useMemo(
    () => tags.filter((tag) => !selectedDefaultTags.some((selected) => selected.toLowerCase() === tag.name.toLowerCase())),
    [selectedDefaultTags, tags],
  );

  const embedOptions = {
    slug: form.slug,
    title: form.name,
    minHeight: embedMinHeight,
    maxWidth: embedMaxWidth,
  };

  const iframeSnippet = publicUrl ? buildLeadFormIframeSnippet(publicUrl, embedOptions) : "";
  const jsSnippet = publicUrl ? buildLeadFormAutoResizeEmbedSnippet(publicUrl, embedOptions) : "";

  const copyText = async (text: string, label: string) => {
    try {
      await copyTextToClipboard(text);
      toast.success(`${label} copiato!`);
    } catch {
      toast.error("Copia non riuscita", { description: "Seleziona il testo e copialo manualmente." });
    }
  };

  const updateEmbedDimension = (key: "embed_min_height" | "embed_max_width", value: string) => {
    const nextValue = key === "embed_min_height"
      ? normalizeEmbedDimension(value, 620, 360, 1600)
      : normalizeEmbedDimension(value, 640, 320, 1200);
    onSettingsChange({ ...settings, [key]: nextValue });
  };

  const updateSettings = (patch: Record<string, unknown>, removeKeys: string[] = []) => {
    const nextSettings = { ...settings, ...patch };
    removeKeys.forEach((key) => {
      delete nextSettings[key];
    });
    onSettingsChange(nextSettings);
  };

  const removeDefaultTag = (tagName: string) => {
    const nextTags = selectedDefaultTags.filter((tag) => tag.toLowerCase() !== tagName.toLowerCase());
    updateSettings(nextTags.length > 0 ? { defaultTags: nextTags } : {}, nextTags.length > 0 ? [] : ["defaultTags"]);
  };

  return (
    // Si apre su «Dopo l'invio»: è la scelta che decide cosa succede al contatto (a chi va, in quale pipeline e fase, con quali tag).
    <Tabs defaultValue="impostazioni" className="h-full">
      <TabsList className="w-full grid grid-cols-3 h-8 max-md:h-11">
        <TabsTrigger value="impostazioni" className="text-xs">Dopo l'invio</TabsTrigger>
        <TabsTrigger value="aspetto" className="text-xs">Aspetto</TabsTrigger>
        <TabsTrigger value="condivisione" className="text-xs">Condivisione</TabsTrigger>
      </TabsList>

      <TabsContent value="impostazioni" className="space-y-3 mt-3">
        <div>
          <p className="text-xs font-semibold">Cosa succede dopo l'invio</p>
          <p className="text-[11px] text-muted-foreground">Il modulo crea o aggiorna il contatto e, se scegli una pipeline, apre anche l'opportunità.</p>
        </div>

        <div className="space-y-1">
          <Label htmlFor={idDi("assegna")} className="text-xs">Assegna il contatto a</Label>
          <Select
            value={stringSetting(settings, "assignedUserId", "__none__")}
            onValueChange={(value) => updateSettings(
              value === "__none__" ? {} : { assignedUserId: value },
              value === "__none__" ? ["assignedUserId"] : [],
            )}
            disabled={disabled}
          >
            <SelectTrigger id={idDi("assegna")} className="h-8 text-sm max-md:h-11">
              <SelectValue placeholder="Nessuno" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Nessuno</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>{displayUser(user)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor={idDi("call-center")} className="text-xs">Call center che richiama</Label>
          <Select
            value={stringSetting(settings, "callCenterId", "__none__")}
            onValueChange={(value) => updateSettings(
              value === "__none__" ? {} : { callCenterId: value },
              value === "__none__" ? ["callCenterId"] : [],
            )}
            disabled={disabled}
          >
            <SelectTrigger id={idDi("call-center")} className="h-8 text-sm max-md:h-11">
              <SelectValue placeholder="Nessuno" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Nessuno</SelectItem>
              {operatoriCallCenter.map((operatore) => (
                <SelectItem key={operatore.id} value={operatore.id}>{operatore.name || operatore.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">Finisce sull'opportunità come «Call center», come per i lead da Facebook.</p>
        </div>

        <div className="space-y-1">
          <Label htmlFor={idDi("tag")} className="text-xs">Tag da aggiungere ai contatti</Label>
          <Select
            onValueChange={(value) => {
              const tag = tags.find((item) => item.id === value);
              if (!tag) return;
              updateSettings({ defaultTags: [...selectedDefaultTags, tag.name] });
            }}
            disabled={disabled || availableTags.length === 0}
          >
            <SelectTrigger id={idDi("tag")} className="h-8 text-sm max-md:h-11">
              <SelectValue placeholder={availableTags.length === 0 ? "Nessun tag disponibile" : "Aggiungi un tag"} />
            </SelectTrigger>
            <SelectContent>
              {availableTags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedDefaultTags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {selectedDefaultTags.map((tagName) => (
                <Badge key={tagName} variant="secondary" className="gap-1">
                  {tagName}
                  <button
                    type="button"
                    onClick={() => removeDefaultTag(tagName)}
                    disabled={disabled}
                    className="rounded-sm p-1 opacity-70 hover:opacity-100 disabled:pointer-events-none disabled:opacity-40 max-md:p-2"
                    aria-label={`Rimuovi tag ${tagName}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor={idDi("pipeline")} className="text-xs">Crea anche un'opportunità in…</Label>
          <Select
            value={selectedPipelineId || "__none__"}
            onValueChange={(value) => updateSettings(
              value === "__none__" ? {} : { pipelineId: value },
              value === "__none__" ? ["pipelineId", "stageId", "stage_id", "pipelineStageId"] : ["stageId", "stage_id", "pipelineStageId"],
            )}
            disabled={disabled}
          >
            <SelectTrigger id={idDi("pipeline")} className="h-8 text-sm max-md:h-11">
              <SelectValue placeholder="Non creare opportunità" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Non creare opportunità</SelectItem>
              {pipelines.map((pipeline) => (
                <SelectItem key={pipeline.id} value={pipeline.id}>{pipeline.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedPipeline && (
          <div className="space-y-1">
            <Label htmlFor={idDi("fase")} className="text-xs">Parte dalla fase</Label>
            <Select
              value={selectedStageId || "__auto__"}
              onValueChange={(value) => updateSettings(
                value === "__auto__" ? {} : { stageId: value },
                value === "__auto__" ? ["stageId", "stage_id", "pipelineStageId"] : ["stage_id", "pipelineStageId"],
              )}
              disabled={disabled}
            >
              <SelectTrigger id={idDi("fase")} className="h-8 text-sm max-md:h-11">
                <SelectValue placeholder="La prima della pipeline" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">La prima della pipeline</SelectItem>
                {(selectedPipeline.marketing_pipeline_stages || []).map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {selectedPipeline && (
          <div className="space-y-1">
            <Label htmlFor={idDi("fonte")} className="text-xs">Fonte da scrivere sull'opportunità</Label>
            <Input
              id={idDi("fonte")}
              className="h-8 text-sm max-md:h-11"
              placeholder="es. Google nuovo"
              value={stringSetting(settings, "fonteOpportunita")}
              onChange={(e) => {
                const v = e.target.value.trim();
                updateSettings(v ? { fonteOpportunita: v } : {}, v ? [] : ["fonteOpportunita"]);
              }}
              disabled={disabled}
            />
            <p className="text-[11px] text-muted-foreground">
              È quello che si legge alla voce «Fonte» sulla scheda. Lasciandolo vuoto resta un codice tecnico che
              distingue un modulo dall'altro ma non dice niente a chi guarda.
            </p>
          </div>
        )}

        <div className="border-t pt-3 space-y-3">
          <div className="space-y-1">
            <Label htmlFor={idDi("titolo-conferma")} className="text-xs">Titolo di conferma</Label>
            <Input
              id={idDi("titolo-conferma")}
              value={stringSetting(theme, "success_title")}
              onChange={(e) => onThemeChange({ ...theme, success_title: e.target.value })}
              className="h-8 text-sm max-md:h-11"
              placeholder="✓"
              disabled={disabled}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={idDi("messaggio-conferma")} className="text-xs">Messaggio di conferma</Label>
            <Input
              id={idDi("messaggio-conferma")}
              value={stringSetting(settings, "success_message")}
              onChange={(e) => onSettingsChange({ ...settings, success_message: e.target.value })}
              className="h-8 text-sm max-md:h-11"
              placeholder="Grazie! La tua richiesta è stata inviata."
              disabled={disabled}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={idDi("vai-a")} className="text-xs">Dopo l'invio vai a (facoltativo)</Label>
            <Input
              id={idDi("vai-a")}
              value={stringSetting(settings, "redirectUrl")}
              onChange={(e) => onSettingsChange({ ...settings, redirectUrl: e.target.value })}
              className="h-8 text-sm max-md:h-11"
              placeholder="https://..."
              disabled={disabled}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={idDi("email-notifica")} className="text-xs">Email notifica</Label>
            <Input
              id={idDi("email-notifica")}
              value={stringSetting(settings, "notification_email")}
              onChange={(e) => onSettingsChange({ ...settings, notification_email: e.target.value })}
              className="h-8 text-sm max-md:h-11"
              placeholder="admin@azienda.it"
              disabled={disabled}
            />
            {/* Oggi questo campo non fa partire nessuna email (form-submit non lo legge): lo dice, finché non si decide cosa farne. */}
            <p className="text-[11px] text-muted-foreground">
              Oggi questo indirizzo non fa partire nessuna email: gli avvisi di nuova richiesta partono dall'automazione
              «Notifica lead» collegata al modulo.
            </p>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="aspetto" className="space-y-3 mt-3">
        <div className="space-y-1">
          <Label htmlFor={idDi("colore-pulsanti")} className="text-xs">Colore dei pulsanti</Label>
          <Input
            id={idDi("colore-pulsanti")}
            type="color"
            value={stringSetting(theme, "accent_color", "#2563eb")}
            onChange={(e) => onThemeChange({ ...theme, accent_color: e.target.value })}
            className="h-8 max-md:h-11"
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={idDi("colore-sfondo")} className="text-xs">Colore dello sfondo</Label>
          <Input
            id={idDi("colore-sfondo")}
            type="color"
            value={stringSetting(theme, "background_color", "#f9fafb")}
            onChange={(e) => onThemeChange({ ...theme, background_color: e.target.value })}
            className="h-8 max-md:h-11"
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={idDi("colore-testo")} className="text-xs">Colore del testo</Label>
          <Input
            id={idDi("colore-testo")}
            type="color"
            value={stringSetting(theme, "text_color", "#1a1a1a")}
            onChange={(e) => onThemeChange({ ...theme, text_color: e.target.value })}
            className="h-8 max-md:h-11"
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={idDi("font")} className="text-xs">Font</Label>
          <Select
            value={stringSetting(theme, "font_family", "system-ui, sans-serif")}
            onValueChange={(v) => onThemeChange({ ...theme, font_family: v })}
            disabled={disabled}
          >
            <SelectTrigger id={idDi("font")} className="h-8 text-sm max-md:h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="system-ui, sans-serif">Sistema (default)</SelectItem>
              <SelectItem value="Arial, sans-serif">Arial</SelectItem>
              <SelectItem value="Helvetica, Arial, sans-serif">Helvetica</SelectItem>
              <SelectItem value="Verdana, sans-serif">Verdana</SelectItem>
              <SelectItem value="Tahoma, sans-serif">Tahoma</SelectItem>
              <SelectItem value="'Trebuchet MS', sans-serif">Trebuchet MS</SelectItem>
              <SelectItem value="Georgia, serif">Georgia</SelectItem>
              <SelectItem value="'Times New Roman', serif">Times New Roman</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor={idDi("larghezza")} className="text-xs">Larghezza (px)</Label>
            <Input
              id={idDi("larghezza")}
              type="number"
              min={320}
              max={900}
              value={stringSetting(theme, "container_width", "520")}
              onChange={(e) => onThemeChange({ ...theme, container_width: e.target.value === "" ? undefined : Number(e.target.value) })}
              className="h-8 text-sm max-md:h-11"
              disabled={disabled}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={idDi("arrotondamento")} className="text-xs">Arrotondamento (px)</Label>
            <Input
              id={idDi("arrotondamento")}
              type="number"
              min={0}
              max={28}
              value={stringSetting(theme, "border_radius", "8")}
              onChange={(e) => onThemeChange({ ...theme, border_radius: e.target.value === "" ? undefined : Number(e.target.value) })}
              className="h-8 text-sm max-md:h-11"
              disabled={disabled}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor={idDi("testo-pulsante")} className="text-xs">Testo del pulsante</Label>
          <Input
            id={idDi("testo-pulsante")}
            value={stringSetting(settings, "submit_label", "Invia")}
            onChange={(e) => onSettingsChange({ ...settings, submit_label: e.target.value })}
            className="h-8 text-sm max-md:h-11"
            disabled={disabled}
          />
        </div>
      </TabsContent>

      <TabsContent value="condivisione" className="space-y-3 mt-3">
        <div className="space-y-1">
          <Label htmlFor={idDi("link")} className="text-xs">Link del modulo</Label>
          <div className="flex gap-1">
            <Input id={idDi("link")} value={publicUrl} readOnly className="h-8 text-xs font-mono max-md:h-11" />
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0 max-md:h-11 max-md:w-11"
              onClick={() => window.open(publicUrl, "_blank", "noopener,noreferrer")}
              disabled={!publicUrl}
              aria-label="Apri il modulo in una nuova scheda"
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0 max-md:h-11 max-md:w-11" onClick={() => copyText(publicUrl, "Link")} disabled={!publicUrl} aria-label="Copia il link del modulo">
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor={idDi("altezza")} className="text-xs">Altezza minima (px)</Label>
            <Input
              id={idDi("altezza")}
              type="number"
              min={360}
              max={1600}
              step={20}
              value={embedMinHeight}
              onChange={(e) => updateEmbedDimension("embed_min_height", e.target.value)}
              className="h-8 text-sm max-md:h-11"
              disabled={disabled}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={idDi("larghezza-max")} className="text-xs">Larghezza massima (px)</Label>
            <Input
              id={idDi("larghezza-max")}
              type="number"
              min={320}
              max={1200}
              step={20}
              value={embedMaxWidth}
              onChange={(e) => updateEmbedDimension("embed_max_width", e.target.value)}
              className="h-8 text-sm max-md:h-11"
              disabled={disabled}
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={idDi("codice-adattivo")} className="text-xs">Codice per il tuo sito (si adatta da solo)</Label>
            <Button variant="outline" size="icon" className="h-7 w-7 shrink-0 max-md:h-11 max-md:w-11" onClick={() => copyText(jsSnippet, "Codice")} disabled={!publicUrl} aria-label="Copia il codice che si adatta da solo">
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <Textarea id={idDi("codice-adattivo")} value={jsSnippet} readOnly rows={6} className="resize-none text-[11px] font-mono leading-4" />
          <p className="text-[11px] text-muted-foreground">Cresce e si accorcia da solo dopo errori e messaggio di conferma.</p>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={idDi("codice-semplice")} className="text-xs">Codice semplice (altezza fissa)</Label>
            <Button variant="outline" size="icon" className="h-7 w-7 shrink-0 max-md:h-11 max-md:w-11" onClick={() => copyText(iframeSnippet, "Codice")} disabled={!publicUrl} aria-label="Copia il codice semplice">
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <Textarea id={idDi("codice-semplice")} value={iframeSnippet} readOnly rows={4} className="resize-none text-[11px] font-mono leading-4" />
        </div>
      </TabsContent>
    </Tabs>
  );
}
