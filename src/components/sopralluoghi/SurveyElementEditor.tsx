import { isEnergySurvey } from "@/lib/surveys/energySurvey";
import { surveyPhotoPlacement } from "@/lib/surveys/photoPlacement";
import { EnergySurveyVisual } from "./EnergySurveyVisual";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useSurveyAccess } from "@/contexts/SurveyAccessContext";
import type { SurveyDetail } from "@/lib/api/surveys";
import type { SurveyElementRow, SurveyMediaRow } from "@/types/surveys";
import { SectionRenderer } from "@/components/surveys/engine/SectionRenderer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Save,
  Loader2,
  ArrowRight,
  Camera,
  ClipboardCheck,
  ChevronDown,
} from "lucide-react";
import { saveSurveyElement } from "@/lib/surveys/saveElement";
import type { SurveyElementDraft } from "@/lib/surveys/workspace";
import {
  isWindowSurvey,
  windowSurveyDraftValues,
  windowSurveySections,
} from "@/lib/surveys/windowSurvey";
import { WindowSurveyVisual } from "./WindowSurveyVisual";
import { DoorConfigurationPicker } from "./DoorConfigurationPicker";
import { SurveyCommonCopy } from "./SurveyCopyTools";
import { applyCommonSurveyValues } from "@/lib/surveys/copyElement";
import { flattenWindowFields } from "@/lib/surveys/windowSurvey";
import {
  surveySchemaKey,
  type PendingSurveyAnnotation,
} from "@/lib/surveys/elementDraft";
import { useSurveyElementDraft } from "@/hooks/useSurveyElementDraft";
import { SurveyDraftRecovery } from "./SurveyDraftRecovery";
import {
  SurveyElementPhotos,
  type SurveyPhotoState,
} from "./SurveyElementPhotos";
import {
  SURVEY_ELEMENT_STEPS as MOBILE_STEPS,
  sectionsForSurveyStep,
  surveyProductGuide,
  surveyElementReview,
  visibleSurveySections,
} from "@/lib/surveys/elementWorkflow";

export type SurveyEditState = { dirty: boolean; saving: boolean };
export type SurveyElementEditorHandle = {
  discardDraft: () => void;
  keepDraft: () => boolean;
};
export const SurveyElementEditor = forwardRef<
  SurveyElementEditorHandle,
  {
    detail: SurveyDetail;
    element: SurveyElementRow;
    onStateChange: (state: SurveyEditState) => void;
    onCancel: () => void;
    onSaved: () => void;
    onNext?: (saved: SurveyElementRow) => void;
    nextLabel?: string;
  }
>(function SurveyElementEditor(
  { detail, element, onStateChange, onCancel, onSaved, onNext, nextLabel },
  ref,
) {
  const [initial] = useState<SurveyElementDraft>(() => ({
    values: structuredClone(element.values ?? {}),
    quantity: element.quantity,
    notes: element.notes,
    element_label: element.element_label,
  }));
  const [draft, setDraft] = useState(initial),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [pendingNote, setPendingNote] = useState(false);
  const [photoState, setPhotoState] = useState<SurveyPhotoState>({
    pending: 0,
    busy: false,
  });
  const [uploadedMedia, setUploadedMedia] = useState<SurveyMediaRow[]>([]);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [annotation, setAnnotation] = useState<PendingSurveyAnnotation | null>(
      null,
    ),
    [resumeAnnotation, setResumeAnnotation] =
      useState<PendingSurveyAnnotation | null>(null),
    [visualEpoch, setVisualEpoch] = useState(0);
  const [compact, setCompact] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 1024,
  );
  const [mobileStep, setMobileStep] = useState(0),
    [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => {
    const resize = () => setCompact(window.innerWidth < 1024);
    window.addEventListener("resize", resize, { passive: true });
    return () => window.removeEventListener("resize", resize);
  }, []);
  const modified =
    JSON.stringify(draft) !== JSON.stringify(initial) || pendingNote;
  const needsSave = modified || uploadedMedia.length > 0;
  const { effectiveCompany, user } = useAuth(), permissions = usePermissions(), access = useSurveyAccess();
  // Campo access is granted to this assigned survey, never via an office-wide permission.
  const solaLettura = access.field ? !access.canEdit : permissions.solaLettura;
  const canViewSopralluoghi = access.field || permissions.canViewSopralluoghi;
  const qc = useQueryClient();
  const inFlight = useRef(false);
  const type = detail.template.schema.element_types.find(
    (t) => t.key === element.element_type,
  );
  const locked =
    !!detail.survey.client_signature_at || detail.survey.status === "signed";
  const schema = surveySchemaKey(detail.template.schema);
  const local = useSurveyElementDraft({
    scope:
      user?.id && effectiveCompany?.id
        ? {
            userId: user.id,
            companyId: effectiveCompany.id,
            surveyId: detail.survey.id,
            elementId: element.id,
          }
        : null,
    base: initial,
    baseUpdatedAt: element.updated_at,
    schema,
    draft,
    annotation,
    dirty: modified,
    enabled:
      !solaLettura &&
      canViewSopralluoghi &&
      !locked &&
      effectiveCompany?.id === detail.survey.company_id,
  });
  const dirty = modified || !!local.recovery || photoState.pending > 0;
  const discardLocal = local.discard,
    persistLocal = local.persistNow;
  const busy = saving || photoState.busy;
  const media = [
    ...detail.media,
    ...uploadedMedia.filter(
      (m) => !detail.media.some((old) => old.id === m.id),
    ),
  ];
  useImperativeHandle(
    ref,
    () => ({
      discardDraft: discardLocal,
      keepDraft: () => {
        if (photoState.pending || photoState.busy) {
          setError(
            "Le foto da caricare non sono incluse nella bozza: caricale o rimuovile prima di conservare e chiudere.",
          );
          return false;
        }
        return persistLocal();
      },
    }),
    [discardLocal, persistLocal, photoState.pending, photoState.busy],
  );
  const allSections = (type ? windowSurveySections(type) : []).map((s) =>
    type?.key === "portoncino_blindato"
      ? {
          ...s,
          fields: s.fields.filter(
            (f) => !["apertura", "tipologia"].includes(f.key),
          ),
        }
      : type?.key === "zanzariera_standalone" && draft.values.rv_zan_direction
        ? { ...s, fields: s.fields.filter((f) => f.key !== "tipo") }
        : s,
  );
  allSections.sort(
    (a, b) => Number(b.key === "rv_door") - Number(a.key === "rv_door"),
  );
  const activeSections =
    compact && (isWindowSurvey(type) || isEnergySurvey(type))
      ? visibleSurveySections(
          sectionsForSurveyStep(allSections, mobileStep),
          draft.values,
        )
      : allSections;
  const review = type
    ? surveyElementReview(
        type,
        draft.values,
        new Set(
          media
            .filter(
              (m) =>
                m.element_id === element.id &&
                ["photo", "annotated_photo", "sketch"].includes(m.type),
            )
            .map((m) => m.checklist_key ?? ""),
        ),
      )
    : null;
  useEffect(() => {
    onStateChange({ dirty, saving: busy });
  }, [dirty, busy, onStateChange]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  async function save(goNext = false) {
    if (
      inFlight.current ||
      busy ||
      photoState.pending > 0 ||
      pendingNote ||
      local.recovery ||
      !local.contextValid ||
      locked ||
      solaLettura ||
      !canViewSopralluoghi ||
      !effectiveCompany?.id
    )
      return;
    if (!needsSave) {
      if (goNext) onNext?.(element);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveSurveyElement(
        { ...detail, media },
        element,
        draft,
        effectiveCompany.id,
      );
      local.discard();
      qc.setQueriesData<SurveyDetail>(
        { queryKey: ["sopralluogo", detail.survey.id] },
        (old) =>
          old?.survey.company_id === effectiveCompany.id
            ? {
                ...old,
                elements: old.elements.map((e) =>
                  e.id === saved.id ? saved : e,
                ),
              }
            : old,
      );
      void qc.invalidateQueries({
        queryKey: ["sopralluogo", detail.survey.id],
      });
      if (goNext && onNext) onNext(saved);
      else onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Salvataggio non riuscito.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }
  if (!local.contextValid)
    return (
      <p
        role="alert"
        className="rounded-xl bg-orange-50 p-4 text-sm text-orange-900"
      >
        Azienda o utente cambiati. Chiudi questa scheda e riapri il rilievo nel
        contesto corretto.
      </p>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-4 max-lg:[&_input:not([type=radio]):not([type=checkbox]):not([type=hidden])]:min-h-11 max-lg:[&_input]:text-base max-lg:[&_textarea]:text-base max-lg:[&_button:not([role=radio]):not([role=checkbox]):not([role=switch])]:min-h-11"
      aria-label="Modifica elemento del sopralluogo"
    >
      <div
        className={`rounded-2xl bg-slate-50 px-4 py-3 ${compact ? "hidden" : ""}`}
      >
        <p className="text-sm font-semibold text-slate-900">
          {type?.label || "Scheda elemento"}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {type
            ? surveyProductGuide(type)
            : "Verifica i dati prima di salvare."}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Misure in bozza fino a Salva · nessun ordine automatico
        </p>
      </div>
      {type && !solaLettura && !locked && (
        <SurveyCommonCopy
          detail={detail}
          element={element}
          type={type}
          disabled={
            busy ||
            pendingNote ||
            !!local.recovery ||
            !local.contextValid ||
            photoState.pending > 0
          }
          onApply={(source, productDimensions) => {
            if (
              busy ||
              pendingNote ||
              local.recovery ||
              !local.contextValid ||
              locked ||
              solaLettura ||
              photoState.pending
            )
              return;
            setDraft((current) =>
              applyCommonSurveyValues(type, source, current, productDimensions),
            );
            setResumeAnnotation(null);
            setAnnotation(null);
            setPendingNote(false);
            setVisualEpoch((v) => v + 1);
            setRecoveryNotice(
              "Dati comuni applicati alla bozza. Misure del vano e apertura conservate; verifica compatibilità e salva quando pronto.",
            );
          }}
        />
      )}
      {local.recovery && (
        <SurveyDraftRecovery
          entry={local.recovery}
          current={initial}
          schema={schema}
          version={element.updated_at}
          labels={{
            quantity: "Quantità",
            notes: "Note",
            element_label: "Nome elemento",
            ...Object.fromEntries(
              (type ? windowSurveySections(type) : [])
                .flatMap((s) => flattenWindowFields(s.fields))
                .map((f) => [`values.${f.key}`, f.label]),
            ),
          }}
          onForget={local.forgetRecovery}
          onRecover={(next) => {
            const changed =
              local.recovery!.baseUpdatedAt !== element.updated_at;
            const pending = local.recovery!.annotation;
            const compatible =
              !pending ||
              pending.component === "primary" ||
              (element.element_type === "infisso" &&
                Array.isArray(next.values.complementi) &&
                next.values.complementi.includes(pending.component));
            const photoExists =
              !pending ||
              pending.photoId === "none" ||
              media.some(
                (m) => m.id === pending.photoId && m.element_id === element.id,
              );
            const resumed =
              pending && compatible
                ? {
                    ...pending,
                    photoId: photoExists ? pending.photoId : "none",
                  }
                : null;
            if (pending && !compatible) {
              next = {
                ...next,
                notes: [
                  next.notes,
                  `Nota grafica recuperata (${pending.component}, posizione da rivedere): ${pending.note}`,
                ]
                  .filter(Boolean)
                  .join("\n"),
              };
              setRecoveryNotice(
                "Il componente della nota non è più presente: ho conservato il testo nelle note, senza posizionarlo su un altro disegno.",
              );
            } else if (!photoExists)
              setRecoveryNotice(
                "La foto collegata non è più disponibile. La nota è recuperata senza collegamento: scegli la foto corretta prima di aggiungerla.",
              );
            setDraft(
              changed
                ? {
                    ...next,
                    values: { ...next.values, rv_order_checked: false },
                  }
                : next,
            );
            setResumeAnnotation(resumed);
            setAnnotation(resumed);
            setPendingNote(!!resumed);
            setVisualEpoch((v) => v + 1);
            setPreviewOpen(!!resumed);
            local.acceptRecovery();
          }}
        />
      )}
      {recoveryNotice && (
        <p
          role="status"
          className="rounded-xl bg-orange-50 p-3 text-sm text-orange-900"
        >
          {recoveryNotice}
        </p>
      )}
      {(local.error || !local.contextValid) && (
        <p
          role="alert"
          className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900"
        >
          {!local.contextValid
            ? "Azienda o utente cambiati. Chiudi questa scheda e riapri il rilievo nel contesto corretto."
            : local.error}
        </p>
      )}
      {locked && (
        <p role="alert" className="text-sm text-orange-900">
          Il rilievo contiene una firma: la modifica non è disponibile.
        </p>
      )}
      {compact && (isWindowSurvey(type) || isEnergySurvey(type)) && (
        <nav
          aria-label="Passi della scheda rilievo"
          className="sticky top-0 z-20 grid grid-cols-4 gap-1 rounded-xl border bg-white/95 p-1 shadow-sm backdrop-blur"
        >
          {MOBILE_STEPS.map((label, i) => (
            <Button
              key={label}
              type="button"
              variant={mobileStep === i ? "secondary" : "ghost"}
              className="min-h-11 rounded-lg px-1 text-xs"
              aria-current={mobileStep === i ? "step" : undefined}
              disabled={pendingNote || busy}
              onClick={() => setMobileStep(i)}
            >
              {i + 1}. {label}
            </Button>
          ))}
        </nav>
      )}
      <fieldset
        disabled={
          busy ||
          solaLettura ||
          !canViewSopralluoghi ||
          locked ||
          !!local.recovery ||
          !local.contextValid
        }
        className="space-y-4"
      >
        <div
          className={`grid ${isEnergySurvey(type) ? "grid-cols-1" : "grid-cols-[minmax(0,1fr)_5rem] sm:grid-cols-[1fr_8rem]"} gap-3 ${compact && (isWindowSurvey(type) || isEnergySurvey(type)) && mobileStep !== 0 ? "hidden" : ""}`}
        >
          <div className="space-y-1">
            <Label htmlFor="survey-element-label">Nome elemento</Label>
            <Input
              id="survey-element-label"
              value={draft.element_label ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, element_label: e.target.value })
              }
              placeholder={type?.label}
            />
          </div>
          <div className={`space-y-1 ${isEnergySurvey(type) ? "hidden" : ""}`}>
            <Label htmlFor="survey-element-quantity">Quantità</Label>
            <Input
              id="survey-element-quantity"
              type="number"
              min={1}
              step={1}
              value={Number.isNaN(draft.quantity) ? "" : draft.quantity}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  quantity:
                    e.target.value === "" ? NaN : Number(e.target.value),
                })
              }
            />
          </div>
        </div>
        <div
          className={
            isWindowSurvey(type)
              ? type.key === "infisso"
                ? "grid items-start gap-5 lg:grid-cols-[minmax(19rem,0.9fr)_minmax(0,1.1fr)]"
                : "grid items-start gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]"
              : ""
          }
        >
          {type && isEnergySurvey(type) && (!compact || mobileStep === 0) && <EnergySurveyVisual type={type} values={draft.values} disabled={busy} onChange={values=>setDraft(d=>({...d,values}))}/>}
          {type && isWindowSurvey(type) && (
            <details
              open={!compact || previewOpen}
              onToggle={(e) => {
                if (compact) setPreviewOpen(e.currentTarget.open);
              }}
              className="rounded-xl lg:sticky lg:top-0"
            >
              <summary
                hidden={!compact}
                className="mb-3 cursor-pointer rounded-xl border bg-blue-50 px-4 py-3 text-sm font-medium text-blue-950"
              >
                Disegno, aperture e note ·{" "}
                {previewOpen ? "riduci" : "tocca per aprire"}
              </summary>
              <WindowSurveyVisual
                key={visualEpoch}
                resumeAnnotation={resumeAnnotation}
                onAnnotationDraftChange={setAnnotation}
                type={type}
                headerValues={detail.survey.header_data}
                values={draft.values}
                quantity={draft.quantity || 1}
                media={media.filter((m) => m.element_id === element.id)}
                onPendingChange={setPendingNote}
                onChange={(values) =>
                  setDraft((d) => ({
                    ...d,
                    values: windowSurveyDraftValues(d.values, values, type),
                  }))
                }
              />
            </details>
          )}
          <div className="min-w-0 space-y-3">
            {type?.key === "portoncino_blindato" &&
              (!compact || mobileStep === 0) && (
                <DoorConfigurationPicker
                  values={draft.values}
                  disabled={pendingNote || busy}
                  onChange={(values) =>
                    setDraft((d) => ({
                      ...d,
                      values: windowSurveyDraftValues(d.values, values, type),
                    }))
                  }
                />
              )}
            {activeSections.map((section) => (
              <SectionRenderer
                key={section.key}
                section={{
                  ...section,
                  default_open: compact
                    ? !["rv_posa", "rv_finiture", "rv_misure"].includes(
                        section.key,
                      )
                    : isWindowSurvey(type)
                      ? /dati_chiave|identificazione|misure_foro|specifiche_nuovo|rv_door/.test(
                          section.key,
                        ) ||
                        (!section.key.startsWith("rv_") &&
                          section.fields.some((f) =>
                            /larghezza|width/.test(f.key),
                          ))
                      : true,
                }}
                values={draft.values}
                onChange={(key, value) =>
                  setDraft((d) => ({
                    ...d,
                    values: windowSurveyDraftValues(
                      d.values,
                      {
                        ...d.values,
                        [key]: value,
                      },
                      type,
                    ),
                  }))
                }
              />
            ))}
            {compact &&
              type &&
              isWindowSurvey(type) &&
              activeSections.length === 0 && (
                <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                  Nessun dettaglio aggiuntivo per questo tipo di elemento. Puoi
                  proseguire al passo successivo.
                </p>
              )}
          </div>
        </div>
        <div
          className={`space-y-1 ${compact && (isWindowSurvey(type) || isEnergySurvey(type)) && mobileStep !== 3 ? "hidden" : ""}`}
        >
          <Label htmlFor="survey-element-notes">Note sull’elemento</Label>
          <Textarea
            id="survey-element-notes"
            value={draft.notes ?? ""}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </div>
      </fieldset>
      <div
        hidden={compact && (isWindowSurvey(type) || isEnergySurvey(type)) && mobileStep !== 3}
        className="space-y-4"
      >
        <details
          className="rounded-2xl border bg-white"
          open={compact ? true : undefined}
        >
          <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium">
            <Camera className="h-4 w-4" />
            Foto e particolari ·{" "}
            {
              media.filter(
                (m) =>
                  m.element_id === element.id &&
                  ["photo", "annotated_photo", "sketch"].includes(m.type),
              ).length
            }{" "}
            caricate
            {photoState.pending ? ` · ${photoState.pending} da caricare` : ""}
            <ChevronDown className="ml-auto h-4 w-4" />
          </summary>
          <SurveyElementPhotos
            surveyId={detail.survey.id}
            companyId={effectiveCompany?.id ?? ""}
            element={element}
            checklist={type?.required_photos ?? []}
            allowPlacement={surveyPhotoPlacement(detail.template.category, type?.key).enabled}
            placementKind={surveyPhotoPlacement(detail.template.category, type?.key).kind}
            media={media}
            disabled={
              saving ||
              solaLettura ||
              !canViewSopralluoghi ||
              locked ||
              !!local.recovery ||
              !local.contextValid ||
              effectiveCompany?.id !== detail.survey.company_id
            }
            onStateChange={setPhotoState}
            onAdded={(added) => {
              setUploadedMedia((old) => [...old, added]);
              qc.setQueriesData<SurveyDetail>(
                { queryKey: ["sopralluogo", detail.survey.id] },
                (old) =>
                  old?.survey.company_id === effectiveCompany?.id
                    ? {
                        ...old,
                        media: [
                          ...old.media.filter((m) => m.id !== added.id),
                          added,
                        ],
                      }
                    : old,
              );
              void qc.invalidateQueries({
                queryKey: ["sopralluogo", detail.survey.id],
              });
            }}
          />
        </details>
        {review && (
          <div
            className="space-y-2 rounded-2xl border bg-slate-50 p-4"
            aria-label="Verifica dell’elemento"
          >
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardCheck className="h-4 w-4" />
              Prima di proseguire
            </h3>
            {review.missing.length +
              review.photos.length +
              review.checks.length >
            0 ? (
              <>
                <p className="text-xs text-slate-600">
                  Puoi salvare la bozza. Questi dati restano da completare:
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-orange-900">
                  {review.missing.map((f) => (
                    <li key={f.key}>{f.label}</li>
                  ))}
                  {review.photos.map((p) => (
                    <li key={`photo:${p.key}`}>Foto · {p.label}</li>
                  ))}
                  {review.checks.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-emerald-800">
                Dati e foto obbligatori presenti. Verifica comunque misure,
                aperture e dettagli sul posto.
              </p>
            )}
            {isWindowSurvey(type) && (
              <p className="text-xs text-slate-500">
                La completezza del rilievo non certifica le misure per la
                produzione. La verifica d’ordine è separata.
              </p>
            )}
          </div>
        )}
      </div>
      {compact && (isWindowSurvey(type) || isEnergySurvey(type)) && mobileStep < 3 && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full rounded-xl"
          disabled={pendingNote || busy}
          onClick={() => setMobileStep((s) => s + 1)}
        >
          Continua: {MOBILE_STEPS[mobileStep + 1]} →
        </Button>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {pendingNote && (
        <p role="status" className="text-xs text-orange-800">
          Aggiungi la nota alla bozza oppure annulla il posizionamento prima di
          salvare.
        </p>
      )}
      {solaLettura && (
        <p role="alert" className="text-sm text-orange-900">
          Il profilo è in sola lettura. Nessuna modifica verrà salvata.
        </p>
      )}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 border-t bg-white/95 py-3 backdrop-blur">
        <span
          className="mr-auto text-xs text-slate-500 max-lg:w-full"
          role="status"
        >
          {busy
            ? photoState.busy
              ? "Caricamento foto in corso…"
              : "Salvataggio in corso…"
            : dirty
              ? local.savedAt && !local.error
                ? "Bozza locale protetta · da salvare"
                : "Modifiche non salvate"
              : uploadedMedia.length
                ? "Foto caricate · conferma la verifica con Salva"
                : "Nessuna modifica"}
        </span>
        <Button
          type="button"
          variant="outline"
          className="max-lg:flex-1"
          onClick={onCancel}
          disabled={busy}
        >
          Annulla
        </Button>
        <Button
          type="submit"
          disabled={
            busy ||
            (!dirty && !needsSave) ||
            photoState.pending > 0 ||
            pendingNote ||
            !!local.recovery ||
            !local.contextValid ||
            locked ||
            solaLettura ||
            !canViewSopralluoghi
          }
          className="gap-2 rounded-xl bg-blue-700 hover:bg-blue-800 max-lg:flex-1"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salva elemento
        </Button>
        {onNext && (
          <Button
            type="button"
            variant="outline"
            className="gap-2 rounded-xl max-lg:w-full"
            disabled={
              busy ||
              pendingNote ||
              photoState.pending > 0 ||
              !!local.recovery ||
              !local.contextValid ||
              locked ||
              solaLettura ||
              !canViewSopralluoghi
            }
            title={nextLabel ? `Prossimo: ${nextLabel}` : undefined}
            onClick={() => void save(true)}
          >
            {needsSave ? "Salva e prossimo" : "Prossimo elemento"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </form>
  );
});
