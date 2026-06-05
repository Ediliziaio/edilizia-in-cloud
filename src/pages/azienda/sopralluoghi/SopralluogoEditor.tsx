/**
 * SopralluogoEditor — pagina di compilazione sul cantiere (mobile-first)
 *
 * Layout:
 *  Header sticky: codice + status badge + completamento %
 *  Header collassabile (campi template)
 *  Lista aree (con add elementi e foto)
 *  Note generali + audio
 *  Toolbar bottom: Firma · PDF · Riassunto AI
 *
 * Auto-save con debounce 600ms su qualsiasi modifica.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient, useIsMutating } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  getSurvey, updateSurvey, addArea, updateArea, deleteArea,
  addElement, updateElement, deleteElement, logActivity,
} from "@/lib/api/surveys";
import type {
  SurveyAreaRow, SurveyElementRow,
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, ClipboardList, Plus, Save, FileSignature, FileText, Sparkles,
  Loader2, MapPin, Calendar, UserPlus, AlertCircle,
} from "lucide-react";
import { SurveyAssignDialog } from "@/components/sopralluoghi/SurveyAssignDialog";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SectionRenderer } from "@/components/surveys/engine/SectionRenderer";
import { AreaCard } from "@/components/surveys/engine/AreaCard";
import { AudioRecorder } from "@/components/surveys/engine/AudioRecorder";
import { PhotoChecklist } from "@/components/surveys/engine/PhotoChecklist";
import { FreePhotoUpload } from "@/components/surveys/engine/FreePhotoUpload";

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
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [aiSummary, setAiSummary] = useState<any | null>(null);

  // Confirm dialog (sostituisce confirm() nativo, mobile-hostile con guanti)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);

  // Conta mutazioni di auto-save attualmente in volo (header debounce + area + element)
  const pendingWrites = useIsMutating({ mutationKey: ["sopralluogo-autosave", id] });

  // Realtime: invalidate query quando media/elementi/aree cambiano (multi-utente sync)
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`survey-${id}-realtime`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "survey_elements",
        filter: `survey_id=eq.${id}`,
      }, () => qc.invalidateQueries({ queryKey: ["sopralluogo", id] }))
      .on("postgres_changes", {
        event: "*", schema: "public", table: "survey_areas",
        filter: `survey_id=eq.${id}`,
      }, () => qc.invalidateQueries({ queryKey: ["sopralluogo", id] }))
      .on("postgres_changes", {
        event: "*", schema: "public", table: "survey_media",
        filter: `survey_id=eq.${id}`,
      }, () => qc.invalidateQueries({ queryKey: ["sopralluogo", id] }))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [id, qc]);

  const generatePdfMut = useMutation({
    mutationFn: async () => {
      if (!id) return;
      const { data, error } = await supabase.functions.invoke("generate-survey-pdf", {
        body: { survey_id: id },
      });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = data as any;
      if (!r?.ok) throw new Error(r?.error ?? "Generazione fallita");
      return r;
    },
    onSuccess: (r) => {
      if (r?.html_url) {
        window.open(r.html_url, "_blank");
        toast.success("Report aperto in nuova tab", {
          description: "Clicca 'Stampa / Salva PDF' nel report",
        });
      }
    },
    onError: (e) => toast.error("Generazione PDF fallita", { description: String(e) }),
  });

  const aiSummaryMut = useMutation({
    mutationFn: async () => {
      if (!id) return;
      const { data, error } = await supabase.functions.invoke("survey-ai-assistant", {
        body: { action: "summary", survey_id: id },
      });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = data as any;
      if (!r?.ok) throw new Error(r?.error ?? "AI summary fallito");
      return r;
    },
    onSuccess: (r) => setAiSummary(r),
    onError: (e) => toast.error("AI riassunto fallito", { description: String(e) }),
  });

  // Local state per auto-save debounced
  const [headerData, setHeaderData] = useState<Record<string, unknown>>({});
  const [generalNotes, setGeneralNotes] = useState("");

  const { data: detail, isLoading, isError, refetch } = useQuery({
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

  // Avvisa l'utente se prova a chiudere la tab/scheda mentre c'è del salvataggio
  // in corso O modifiche locali non ancora propagate (header debounced)
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const headerDirty = detail
        ? (JSON.stringify(headerData) !== JSON.stringify(detail.survey.header_data ?? {})
          || generalNotes !== (detail.survey.notes ?? ""))
        : false;
      if (pendingWrites > 0 || autoSaveStatus === "saving" || headerDirty) {
        e.preventDefault();
        // Browser moderni ignorano il testo; basta returnValue
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [pendingWrites, autoSaveStatus, headerData, generalNotes, detail]);

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

  // Riporta l'indicatore a "idle" 2.5s dopo "saved" (UX pulita)
  useEffect(() => {
    if (autoSaveStatus !== "saved") return;
    const t = setTimeout(() => setAutoSaveStatus("idle"), 2500);
    return () => clearTimeout(t);
  }, [autoSaveStatus]);

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
    onError: (e) => toast.error("Aggiunta area fallita", { description: String(e) }),
  });

  const updateAreaMut = useMutation({
    mutationKey: ["sopralluogo-autosave", id],
    mutationFn: async ({ id: areaId, patch }: { id: string; patch: Partial<SurveyAreaRow> }) => {
      await updateArea(areaId, patch);
    },
    onMutate: () => {
      // Reset stato "error" precedente quando si parte con una nuova mutazione
      setAutoSaveStatus("saving");
    },
    onSuccess: () => {
      setAutoSaveStatus("saved");
      qc.invalidateQueries({ queryKey: ["sopralluogo", id] });
    },
    onError: (err) => {
      console.error("[sopralluogo] autosave mutation failed", err);
      setAutoSaveStatus("error");
      toast.error("Salvataggio fallito", { description: "Riprovo automaticamente al prossimo input" });
    },
  });

  const deleteAreaMut = useMutation({
    mutationFn: deleteArea,
    onSuccess: () => {
      toast.success("Area eliminata");
      qc.invalidateQueries({ queryKey: ["sopralluogo", id] });
    },
    onError: (e) => toast.error("Eliminazione area fallita", { description: String(e) }),
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
    onError: (e) => toast.error("Aggiunta elemento fallita", { description: String(e) }),
  });

  const updateElementMut = useMutation({
    mutationKey: ["sopralluogo-autosave", id],
    mutationFn: async ({ id: elId, patch }: { id: string; patch: Partial<SurveyElementRow> }) => {
      await updateElement(elId, patch);
    },
    onMutate: () => {
      // Reset stato "error" precedente quando si parte con una nuova mutazione
      setAutoSaveStatus("saving");
    },
    onSuccess: () => {
      setAutoSaveStatus("saved");
      qc.invalidateQueries({ queryKey: ["sopralluogo", id] });
    },
    onError: (err) => {
      console.error("[sopralluogo] autosave mutation failed", err);
      setAutoSaveStatus("error");
      toast.error("Salvataggio fallito", { description: "Riprovo automaticamente al prossimo input" });
    },
  });

  const deleteElementMut = useMutation({
    mutationFn: deleteElement,
    onSuccess: () => {
      toast.success("Elemento eliminato");
      qc.invalidateQueries({ queryKey: ["sopralluogo", id] });
    },
    onError: (e) => toast.error("Eliminazione fallita", { description: String(e) }),
  });

  // Duplica un elemento (mutation con feedback errore — prima era addElement diretto)
  const duplicateElementMut = useMutation({
    mutationKey: ["sopralluogo-autosave", id],
    mutationFn: async (input: {
      areaId: string;
      elementType: string;
      values: Record<string, unknown> | null | undefined;
      quantity: number | null | undefined;
      position: number;
    }) => {
      if (!id) return;
      return addElement(id, input.areaId, {
        element_type: input.elementType,
        values: (input.values ?? {}) as SurveyElementRow["values"],
        quantity: input.quantity ?? 1,
        position: input.position,
      });
    },
    onSuccess: () => {
      toast.success("Elemento duplicato");
      qc.invalidateQueries({ queryKey: ["sopralluogo", id] });
    },
    onError: (e) => toast.error("Duplicazione fallita", { description: String(e) }),
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

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 space-y-3">
        <Skeleton className="h-12" />
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (isError || !detail) {
    return (
      <div className="container mx-auto p-4">
        <div className="mx-auto max-w-md rounded-xl border border-red-200 dark:border-red-900/40 bg-card p-6 sm:p-10 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-500/70" />
          <p className="font-semibold mb-1">
            {isError ? "Impossibile caricare il sopralluogo" : "Sopralluogo non trovato"}
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            {isError
              ? "Si è verificato un errore. Controlla la connessione e riprova."
              : "Il sopralluogo potrebbe essere stato eliminato o il link non è più valido."}
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/azienda/sopralluoghi")}>
              Torna alla lista
            </Button>
            {isError && (
              <Button size="sm" className="bg-orange-600 hover:bg-orange-700" onClick={() => refetch()}>
                Riprova
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const { survey, template, areas, elements, media } = detail;
  const statusCfg = STATUS_LABEL[survey.status] ?? STATUS_LABEL.draft;

  return (
    <div className="pb-[calc(6rem+env(safe-area-inset-bottom))]">
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
              {(autoSaveStatus === "saving" || pendingWrites > 0) && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Salvataggio…</span>}
              {autoSaveStatus === "saved" && pendingWrites === 0 && <span className="text-[10px] text-emerald-600 flex items-center gap-1"><Save className="h-3 w-3" /> Salvato</span>}
              {autoSaveStatus === "error" && <span className="text-[10px] text-rose-600">Errore salvataggio</span>}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {template.name} · {survey.address ?? "Indirizzo non specificato"}
            </p>
          </div>
          <Button
            variant="outline" size="sm"
            onClick={() => setAssignDialogOpen(true)}
            className="gap-1.5 h-8"
            title="Assegna tecnici/subappaltatori"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Assegna</span>
          </Button>
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
                  setConfirmDialog({
                    title: `Eliminare "${area.name}"?`,
                    description: "Verranno eliminati anche tutti gli elementi e le foto di questa area. L'azione non è reversibile.",
                    onConfirm: () => deleteAreaMut.mutate(area.id),
                  });
                }}
                onElementAdd={(elType) => addElementMut.mutate({ areaId: area.id, elementType: elType })}
                onElementChange={(eid, patch) => updateElementMut.mutate({ id: eid, patch })}
                onElementDuplicate={(eid) => {
                  const orig = elements.find((e) => e.id === eid);
                  if (!orig) return;
                  duplicateElementMut.mutate({
                    areaId: area.id,
                    elementType: orig.element_type,
                    values: orig.values,
                    quantity: orig.quantity,
                    position: elements.filter((e) => e.area_id === area.id).length,
                  });
                }}
                onElementDelete={(eid) => {
                  setConfirmDialog({
                    title: "Eliminare questo elemento?",
                    description: "Verranno eliminate anche tutte le foto associate. L'azione non è reversibile.",
                    onConfirm: () => deleteElementMut.mutate(eid),
                  });
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
          <CardContent className="p-3 pt-0 space-y-3">
            <Textarea
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              placeholder="Osservazioni, vincoli, contesto…"
              rows={3}
            />
            {(template.schema.general_required_photos?.length ?? 0) > 0 && (
              <PhotoChecklist
                items={template.schema.general_required_photos}
                surveyId={survey.id}
                media={media.filter((m) => !m.area_id && !m.element_id)}
                onMediaAdded={onMediaChange}
                onMediaDeleted={onMediaChange}
              />
            )}
            <FreePhotoUpload
              surveyId={survey.id}
              media={media.filter((m) => !m.area_id && !m.element_id)}
              onMediaAdded={onMediaChange}
              onMediaDeleted={onMediaChange}
              label="Foto generali"
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
              <img loading="lazy"
                src={survey.client_signature_url}
                alt="Firma cliente"
                className="h-12 border rounded bg-white"
              />
            </CardContent>
          </Card>
        ) : null}
      </div>

      <SurveyAssignDialog
        surveyId={survey.id}
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
      />

      {/* Confirm dialog (sostituisce confirm() nativo) */}
      <AlertDialog open={!!confirmDialog} onOpenChange={(o) => !o && setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => {
                confirmDialog?.onConfirm();
                setConfirmDialog(null);
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI Summary panel */}
      {aiSummary && (
        <div className="container mx-auto p-3 md:p-4 max-w-4xl mb-20">
          <Card className="border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50">
            <CardHeader className="p-3 pb-2 flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-600" />
                Riassunto AI
              </CardTitle>
              <Button
                variant="ghost" size="icon" onClick={() => setAiSummary(null)}
                className="h-7 w-7"
              >
                <ArrowLeft className="h-3.5 w-3.5 rotate-45" />
              </Button>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-3 text-sm">
              {aiSummary.summary && (
                <p className="text-violet-900 leading-relaxed">{aiSummary.summary}</p>
              )}
              {aiSummary.estimated_complexity && (
                <Badge variant="outline" className={
                  aiSummary.estimated_complexity === "alta" ? "bg-rose-100 text-rose-700" :
                  aiSummary.estimated_complexity === "media" ? "bg-amber-100 text-amber-700" :
                  "bg-emerald-100 text-emerald-700"
                }>
                  Complessità: {aiSummary.estimated_complexity}
                </Badge>
              )}
              {Array.isArray(aiSummary.key_dimensions) && aiSummary.key_dimensions.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 mb-1">Misure chiave</p>
                  <ul className="space-y-0.5 text-xs">
                    {aiSummary.key_dimensions.map((d: { label: string; value: string }, i: number) => (
                      <li key={i}><span className="font-medium">{d.label}:</span> {d.value}</li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(aiSummary.complications) && aiSummary.complications.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-700 mb-1">Criticità</p>
                  <ul className="space-y-0.5 text-xs">
                    {aiSummary.complications.map((c: string, i: number) => (
                      <li key={i} className="flex items-start gap-1.5"><span className="text-rose-500">⚠</span> {c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(aiSummary.recommended_actions) && aiSummary.recommended_actions.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 mb-1">Azioni consigliate</p>
                  <ul className="space-y-0.5 text-xs">
                    {aiSummary.recommended_actions.map((a: string, i: number) => (
                      <li key={i} className="flex items-start gap-1.5"><span className="text-violet-500">→</span> {a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bottom action bar — safe-area (home indicator iPhone), 3 pulsanti in riga, touch 44px */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-background border-t px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex gap-2">
        <Button
          variant="outline"
          className="flex-1 min-w-0 h-11 gap-2"
          onClick={() => navigate(`/azienda/sopralluoghi/${id}/firma`)}
        >
          <FileSignature className="h-4 w-4 shrink-0" />
          Firma
        </Button>
        <Button
          variant="outline"
          className="flex-1 min-w-0 h-11 gap-2"
          onClick={() => generatePdfMut.mutate()}
          disabled={generatePdfMut.isPending}
        >
          {generatePdfMut.isPending ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
          PDF
        </Button>
        <Button
          variant="outline"
          className="flex-1 min-w-0 h-11 gap-2 border-violet-300 text-violet-700"
          onClick={() => aiSummaryMut.mutate()}
          disabled={aiSummaryMut.isPending}
        >
          {aiSummaryMut.isPending ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <Sparkles className="h-4 w-4 shrink-0" />}
          <span className="truncate"><span className="hidden sm:inline">Riassunto </span>AI</span>
        </Button>
      </div>
    </div>
  );
}

