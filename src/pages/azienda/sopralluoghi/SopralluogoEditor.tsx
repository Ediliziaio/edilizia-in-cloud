/**
 * SopralluogoEditor — pagina di compilazione sul cantiere (mobile-first)
 *
 * Layout:
 *  Header sticky: codice + status badge + completamento %
 *  Header collassabile (campi template)
 *  Lista aree (con add elementi e foto)
 *  Note generali + audio
 *  Toolbar bottom: Firma · PDF · Crea preventivo
 *
 * Auto-save con debounce 600ms su qualsiasi modifica.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSurvey, updateSurvey, addArea, updateArea, deleteArea,
  addElement, updateElement, deleteElement, logActivity,
} from "@/lib/api/surveys";
import type {
  SurveyAreaRow, SurveyElementRow, SurveyMediaRow,
} from "@/types/surveys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, ClipboardList, Plus, Save, FileSignature, FileText, Sparkles,
  Loader2, MapPin, Calendar,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SectionRenderer } from "@/components/surveys/engine/SectionRenderer";
import { AreaCard } from "@/components/surveys/engine/AreaCard";
import { AudioRecorder } from "@/components/surveys/engine/AudioRecorder";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft:       { label: "Bozza",       color: "bg-slate-100 text-slate-700" },
  in_progress: { label: "In corso",    color: "bg-amber-100 text-amber-700" },
  completed:   { label: "Completato",  color: "bg-emerald-100 text-emerald-700" },
  reviewed:    { label: "Revisionato", color: "bg-sky-100 text-sky-700" },
  signed:      { label: "Firmato",     color: "bg-violet-100 text-violet-700" },
  converted:   { label: "Convertito",  color: "bg-teal-100 text-teal-700" },
  archived:    { label: "Archiviato",  color: "bg-slate-100 text-slate-500" },
  cancelled:   { label: "Annullato",   color: "bg-rose-100 text-rose-700" },
};

export default function SopralluogoEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [headerOpen, setHeaderOpen] = useState(true);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Local state per auto-save debounced
  const [headerData, setHeaderData] = useState<Record<string, unknown>>({});
  const [generalNotes, setGeneralNotes] = useState("");

  const { data: detail, isLoading } = useQuery({
    queryKey: ["sopralluogo", id],
    enabled: !!id,
    queryFn: () => getSurvey(id!),
  });

  // Sync state da server al primo load
  useEffect(() => {
    if (detail) {
      setHeaderData(detail.survey.header_data ?? {});
      setGeneralNotes(detail.survey.notes ?? "");
    }
  }, [detail?.survey.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save header (debounced 600ms)
  useEffect(() => {
    if (!detail || !id) return;
    const timer = setTimeout(async () => {
      const headerChanged = JSON.stringify(headerData) !== JSON.stringify(detail.survey.header_data ?? {});
      const notesChanged = generalNotes !== (detail.survey.notes ?? "");
      if (!headerChanged && !notesChanged) return;
      setAutoSaveStatus("saving");
      try {
        await updateSurvey(id, { header_data: headerData, notes: generalNotes });
        setAutoSaveStatus("saved");
        qc.invalidateQueries({ queryKey: ["sopralluogo", id] });
      } catch {
        setAutoSaveStatus("error");
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [headerData, generalNotes, id, detail, qc]);

  const updateStatusMut = useMutation({
    mutationFn: async (status: string) => {
      if (!id) return;
      const patch: Record<string, string | null> = { status };
      const now = new Date().toISOString();
      if (status === "in_progress" && !detail?.survey.started_at) patch.started_at = now;
      if (status === "completed" && !detail?.survey.completed_at) patch.completed_at = now;
      await updateSurvey(id, patch);
      await logActivity(id, `status_change:${status}`);
    },
    onSuccess: () => {
      toast.success("Stato aggiornato");
      qc.invalidateQueries({ queryKey: ["sopralluogo", id] });
      qc.invalidateQueries({ queryKey: ["sopralluoghi-list"] });
    },
    onError: (e) => toast.error("Aggiornamento stato fallito", { description: String(e) }),
  });

  const addAreaMut = useMutation({
    mutationFn: async () => {
      if (!id || !detail) return;
      const nextPos = detail.areas.length;
      const suggestion = detail.template.schema.area_definition?.name_suggestions?.[nextPos] ?? "";
      return addArea(id, { name: suggestion || `${detail.template.area_label} ${nextPos + 1}`, position: nextPos });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sopralluogo", id] });
    },
  });

  const updateAreaMut = useMutation({
    mutationFn: async ({ id: areaId, patch }: { id: string; patch: Partial<SurveyAreaRow> }) => {
      await updateArea(areaId, patch);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sopralluogo", id] }),
  });

  const deleteAreaMut = useMutation({
    mutationFn: deleteArea,
    onSuccess: () => {
      toast.success("Area eliminata");
      qc.invalidateQueries({ queryKey: ["sopralluogo", id] });
    },
  });

  const addElementMut = useMutation({
    mutationFn: async ({ areaId, elementType }: { areaId: string; elementType: string }) => {
      if (!id || !detail) return;
      const existing = detail.elements.filter((e) => e.area_id === areaId);
      return addElement(id, areaId, {
        element_type: elementType,
        position: existing.length,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sopralluogo", id] }),
  });

  const updateElementMut = useMutation({
    mutationFn: async ({ id: elId, patch }: { id: string; patch: Partial<SurveyElementRow> }) => {
      await updateElement(elId, patch);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sopralluogo", id] }),
  });

  const deleteElementMut = useMutation({
    mutationFn: deleteElement,
    onSuccess: () => {
      toast.success("Elemento eliminato");
      qc.invalidateQueries({ queryKey: ["sopralluogo", id] });
    },
  });

  // Calcolo % completamento (campi obbligatori header + area + element + foto)
  const completionPct = useMemo(() => {
    if (!detail) return 0;
    let totalRequired = 0;
    let totalCompleted = 0;

    // Header required
    detail.template.schema.header_schema?.forEach((s) => {
      s.fields.forEach((f) => {
        if (f.required) {
          totalRequired++;
          const v = headerData[f.key];
          if (v != null && v !== "") totalCompleted++;
        }
      });
    });

    // Per ogni elemento: campi required + foto required
    detail.elements.forEach((el) => {
      const type = detail.template.schema.element_types?.find((t) => t.key === el.element_type);
      if (!type) return;
      type.sections.forEach((s) => {
        s.fields.forEach((f) => {
          if (f.required) {
            totalRequired++;
            const v = el.values?.[f.key];
            if (v != null && v !== "") totalCompleted++;
          }
        });
      });
      (type.required_photos ?? []).forEach((p) => {
        if (p.required) {
          totalRequired++;
          const has = detail.media.some((m) => m.element_id === el.id && m.checklist_key === p.key && m.type === "photo");
          if (has) totalCompleted++;
        }
      });
    });

    if (totalRequired === 0) return 100;
    return Math.round((totalCompleted / totalRequired) * 100);
  }, [detail, headerData]);

  const onMediaChange = () => {
    qc.invalidateQueries({ queryKey: ["sopralluogo", id] });
  };

  if (isLoading || !detail) {
    return (
      <div className="container mx-auto p-4 space-y-3">
        <Skeleton className="h-12" />
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const { survey, template, areas, elements, media } = detail;
  const statusCfg = STATUS_LABEL[survey.status] ?? STATUS_LABEL.draft;

  return (
    <div className="pb-24">
      {/* Sticky header */}
      <div className="sticky top-0 z-30 bg-background border-b">
        <div className="container mx-auto p-3 flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/sopralluoghi")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-bold text-orange-700">{survey.code}</span>
              <Badge variant="outline" className={cn("text-[10px]", statusCfg.color)}>
                {statusCfg.label}
              </Badge>
              {autoSaveStatus === "saving" && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Salvataggio…</span>}
              {autoSaveStatus === "saved" && <span className="text-[10px] text-emerald-600 flex items-center gap-1"><Save className="h-3 w-3" /> Salvato</span>}
              {autoSaveStatus === "error" && <span className="text-[10px] text-rose-600">Errore salvataggio</span>}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {template.name} · {survey.address ?? "Indirizzo non specificato"}
            </p>
          </div>
          <Select value={survey.status} onValueChange={(v) => updateStatusMut.mutate(v)}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2">
            <Progress value={completionPct} className="flex-1 h-1.5" />
            <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
              {completionPct}%
            </span>
          </div>
        </div>
      </div>

      <div className="container mx-auto p-3 md:p-4 space-y-3 max-w-4xl">
        {/* Address quick info */}
        {(survey.address || survey.scheduled_at) && (
          <Card>
            <CardContent className="p-3 flex items-center gap-3 flex-wrap text-xs">
              {survey.address && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-orange-600" />
                  {[survey.address, survey.city].filter(Boolean).join(", ")}
                </span>
              )}
              {survey.scheduled_at && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-orange-600" />
                  {format(new Date(survey.scheduled_at), "d MMM yyyy 'alle' HH:mm", { locale: it })}
                </span>
              )}
              {survey.order_id && (
                <Link
                  to={`/azienda/ordini/${survey.order_id}`}
                  className="flex items-center gap-1 text-violet-600 hover:underline"
                >
                  <ClipboardList className="h-3 w-3" />
                  Vedi commessa
                </Link>
              )}
            </CardContent>
          </Card>
        )}

        {/* Header sezioni template */}
        {(template.schema.header_schema ?? []).map((section) => (
          <SectionRenderer
            key={section.key}
            section={section}
            values={headerData}
            onChange={(k, v) => setHeaderData((prev) => ({ ...prev, [k]: v }))}
          />
        ))}

        {/* Aree */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-orange-600" />
              {template.area_label_plural}
            </h2>
            <span className="text-xs text-muted-foreground">{areas.length} {areas.length === 1 ? template.area_label.toLowerCase() : template.area_label_plural.toLowerCase()}</span>
          </div>

          {areas
            .sort((a, b) => a.position - b.position)
            .map((area) => (
              <AreaCard
                key={area.id}
                area={area}
                areaDefinition={template.schema.area_definition}
                elementTypes={template.schema.element_types ?? []}
                elements={elements.filter((e) => e.area_id === area.id)}
                media={media}
                surveyId={survey.id}
                onAreaChange={(aid, patch) => {
                  updateAreaMut.mutate({ id: aid, patch });
                }}
                onAreaDelete={() => {
                  if (confirm(`Eliminare "${area.name}" e tutti i suoi elementi?`)) {
                    deleteAreaMut.mutate(area.id);
                  }
                }}
                onElementAdd={(elType) => addElementMut.mutate({ areaId: area.id, elementType: elType })}
                onElementChange={(eid, patch) => updateElementMut.mutate({ id: eid, patch })}
                onElementDuplicate={(eid) => {
                  const orig = elements.find((e) => e.id === eid);
                  if (!orig) return;
                  addElement(survey.id, area.id, {
                    element_type: orig.element_type,
                    values: orig.values,
                    quantity: orig.quantity,
                    position: elements.filter((e) => e.area_id === area.id).length,
                  }).then(() => qc.invalidateQueries({ queryKey: ["sopralluogo", id] }));
                }}
                onElementDelete={(eid) => {
                  if (confirm("Eliminare questo elemento?")) deleteElementMut.mutate(eid);
                }}
                onMediaAdded={onMediaChange}
                onMediaDeleted={onMediaChange}
              />
            ))}

          <Button
            variant="outline"
            onClick={() => addAreaMut.mutate()}
            disabled={addAreaMut.isPending}
            className="w-full gap-2 border-dashed border-2 border-orange-300 hover:bg-orange-50"
          >
            {addAreaMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Aggiungi {template.area_label.toLowerCase()}
          </Button>
        </div>

        {/* Note generali */}
        <Card>
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-sm">Note generali</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-2">
            <Textarea
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              placeholder="Osservazioni, vincoli, contesto…"
              rows={3}
            />
            <AudioRecorder
              surveyId={survey.id}
              existingAudio={media.find((m) => m.type === "audio" && !m.area_id && !m.element_id) ?? null}
              onAudioAdded={onMediaChange}
              onAudioDeleted={onMediaChange}
              autoTranscribe
            />
          </CardContent>
        </Card>

        {/* Firma cliente */}
        {survey.client_signature_url ? (
          <Card className="border-violet-200 bg-violet-50/30">
            <CardContent className="p-3 flex items-center gap-3">
              <FileSignature className="h-5 w-5 text-violet-600" />
              <div className="flex-1">
                <p className="text-sm font-semibold">Firmato dal cliente</p>
                <p className="text-[11px] text-muted-foreground">
                  {survey.client_signature_name ?? "Firmatario non specificato"}
                  {survey.client_signature_at && ` · ${format(new Date(survey.client_signature_at), "d MMM yyyy HH:mm", { locale: it })}`}
                </p>
              </div>
              {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
              <img
                src={survey.client_signature_url}
                alt="Firma cliente"
                className="h-12 border rounded bg-white"
              />
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-background border-t p-3 flex gap-2 flex-wrap">
        <Button
          variant="outline"
          className="flex-1 gap-2"
          onClick={() => navigate(`/azienda/sopralluoghi/${id}/firma`)}
        >
          <FileSignature className="h-4 w-4" />
          Firma cliente
        </Button>
        <Button
          variant="outline"
          className="flex-1 gap-2"
          disabled
          title="In arrivo Sprint S5"
        >
          <FileText className="h-4 w-4" />
          Genera PDF
        </Button>
        <Button
          className="flex-1 gap-2 bg-orange-600 hover:bg-orange-700"
          onClick={() => toast.info("In arrivo Sprint S5", { description: "Generazione preventivo AI dal sopralluogo" })}
        >
          <Sparkles className="h-4 w-4" />
          Crea preventivo
        </Button>
      </div>
    </div>
  );
}

