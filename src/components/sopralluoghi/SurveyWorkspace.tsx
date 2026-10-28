import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  Camera,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  MapPin,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Copy,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useSurveyDetail, useSurveyReferences } from "@/hooks/useSurveyDetail";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { SurveyPdfTools } from "./SurveyPdfTools";
import { SurveyMediaGallery } from "./SurveyMediaGallery";
import { WindowSurveyVisual } from "./WindowSurveyVisual";
import { isWindowSurvey } from "@/lib/surveys/windowSurvey";
import { isEnergySurvey } from "@/lib/surveys/energySurvey";
import { EnergySurveyVisual } from "./EnergySurveyVisual";
import { energyQuoteHref } from "@/lib/surveys/energyQuote";
import {
  SurveyElementEditor,
  type SurveyEditState,
  type SurveyElementEditorHandle,
} from "./SurveyElementEditor";
import {
  buildSurveyReport,
  dateSurvey,
  surveyLastUpdated,
  surveyAddress,
  SURVEY_STATUS,
  surveyMediaUrl,
  type ReportField,
  type ReportSection,
} from "@/lib/surveys/report";
import {
  surveyElementQuality,
  surveyElementSummary,
  surveyTechnicalIssues,
  type SurveyReportElement,
  type SurveySelection,
} from "@/lib/surveys/workspace";
import type { SurveyElementRow, SurveyMediaRow } from "@/types/surveys";
import { nextSurveyElement } from "@/lib/surveys/elementWorkflow";
import { surveyPdfBrand } from "@/lib/surveys/pdfBrand";
import { SurveyDuplicateDialog } from "./SurveyCopyTools";
import { duplicateSurveyElement } from "@/lib/surveys/duplicateElement";
import { useSurveyAccess } from "@/contexts/SurveyAccessContext";
import { SurveyOfficeReview } from "./SurveyOfficeReview";
import { SurveyFieldHandoff } from "./SurveyFieldHandoff";

function Fields({ fields }: { fields: ReportField[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {fields.map((f) => (
        <div key={f.key} className="min-w-0">
          <dt className="text-xs text-slate-500">
            {f.label}
            {f.required && <span className="sr-only"> (obbligatorio)</span>}
          </dt>
          <dd
            className={`mt-1 whitespace-pre-wrap break-words text-sm ${f.missing ? "text-slate-400" : "font-medium text-slate-900"}`}
          >
            {f.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
function Sections({ sections }: { sections: ReportSection[] }) {
  return (
    <>
      {sections
        .filter((s) => s.fields.length)
        .map((s) => (
          <section key={s.key} className="rounded-xl border bg-white p-4">
            <h4 className="mb-4 text-sm font-semibold text-blue-950">
              {s.label}
            </h4>
            <Fields fields={s.fields} />
          </section>
        ))}
    </>
  );
}
function AudioNote({
  url,
  transcription,
  label,
}: {
  url: string | null;
  transcription: string | null;
  label: string;
}) {
  return (
    <>
      {transcription && (
        <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">
          Nota vocale: {transcription}
        </p>
      )}
      {surveyMediaUrl(url) && (
        <audio
          controls
          preload="none"
          aria-label={label}
          src={surveyMediaUrl(url)!}
          className="mt-3 w-full"
        />
      )}
    </>
  );
}
export type SurveyWorkspaceHandle = {
  requestClose: (close: () => void) => void;
};
type Props = {
  surveyId: string;
  expectedOrderId?: string;
  embedded?: boolean;
  onEdit?: () => void;
};
export const SurveyWorkspace = forwardRef<SurveyWorkspaceHandle, Props>(
  function SurveyWorkspace(
    { surveyId, expectedOrderId, embedded = false, onEdit },
    ref,
  ) {
    const query = useSurveyDetail(surveyId, expectedOrderId),
      references = useSurveyReferences(query.data?.survey);
    const qc = useQueryClient();
    const [copySource, setCopySource] = useState<SurveyElementRow | null>(null);
    const { effectiveCompany } = useAuth(), permissions = usePermissions();
    const access = useSurveyAccess();
    const solaLettura = permissions.solaLettura || (access.field && !access.canEdit);
    const [tab, setTab] = useState("rilievo"),
      [selection, setSelection] = useState<SurveySelection>({
        kind: "overview",
      });
    const [search, setSearch] = useState(""),
      [showChecks, setShowChecks] = useState(false);
    const [editing, setEditing] = useState<SurveyElementRow | null>(null),
      [editState, setEditState] = useState<SurveyEditState>({
        dirty: false,
        saving: false,
      });
    const editorRef = useRef<SurveyElementEditorHandle>(null);
    const [keepFailed, setKeepFailed] = useState(false);
    const [discardAction, setDiscardAction] = useState<(() => void) | null>(
        null,
      ),
      [savedNotice, setSavedNotice] = useState(false);
    const content = useRef<HTMLDivElement>(null);
    const [small, setSmall] = useState(
        () => typeof window !== "undefined" && window.innerWidth < 640,
      ),
      [metadataOpen, setMetadataOpen] = useState(false);
    useEffect(() => {
      const resize = () => setSmall(window.innerWidth < 640);
      window.addEventListener("resize", resize, { passive: true });
      return () => window.removeEventListener("resize", resize);
    }, []);
    const routeTo = useNavigate();
    function navigate(action: () => void) {
      if (editState.saving) return;
      if (editState.dirty) {
        setKeepFailed(false);
        setDiscardAction(() => action);
        return;
      }
      setEditing(null);
      setEditState({ dirty: false, saving: false });
      action();
    }
    useImperativeHandle(ref, () => ({ requestClose: navigate }));
    function choose(next: SurveySelection) {
      navigate(() => {
        setSelection(next);
        setSavedNotice(false);
        setTab("rilievo");
        setSearch("");
        content.current?.scrollTo?.({ top: 0 });
      });
    }
    if (!query.allowed)
      return (
        <p role="alert" className="p-6 text-sm">
          Per consultare il sopralluogo serve il permesso «Sopralluoghi».
        </p>
      );
    if (query.isPending)
      return (
        <p role="status" className="p-6 text-sm text-slate-600">
          Carico il sopralluogo…
        </p>
      );
    if (query.isError || !query.data)
      return (
        <div
          role="alert"
          className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-6"
        >
          <h2 className="font-semibold">Sopralluogo non disponibile</h2>
          <p className="text-sm">
            {query.error?.message ||
              "Controlla l’azienda selezionata e i permessi, poi riprova."}
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Riprova
          </Button>
        </div>
      );
    const detail = query.data,
      report = buildSurveyReport(detail),
      { survey } = report;
    const nextEditable = editing
      ? nextSurveyElement(detail, editing.id)
      : undefined;
    const all = report.areas
      .flatMap((a) => a.elements)
      .concat(report.unassigned);
    const selected =
      selection.kind === "element"
        ? all.find((e) => e.id === selection.id)
        : undefined;
    const area =
      selection.kind === "area"
        ? report.areas.find((a) => a.id === selection.id)
        : undefined;
    const groups = [
      ...report.areas.map((a) => ({
        id: a.id,
        name: a.name,
        elements: a.elements,
      })),
      ...(report.unassigned.length
        ? [
            {
              id: "unassigned",
              name: "Senza area riconosciuta",
              elements: report.unassigned,
            },
          ]
        : []),
    ];
    const needle = search.trim().toLocaleLowerCase("it-IT");
    const filtered = groups
      .filter((a) => !area || a.id === area.id)
      .map((a) => ({
        ...a,
        elements: a.elements.filter(
          (e) =>
            !needle ||
            `${a.name} ${e.title} ${surveyElementSummary(e)}`
              .toLocaleLowerCase("it-IT")
              .includes(needle),
        ),
      }));
    const issues = surveyTechnicalIssues(report),
      Heading = embedded ? "h2" : "h1";
    const mediaContext = (m: SurveyMediaRow) =>
      [
        report.areas.find((a) => a.id === m.area_id)?.name,
        all.find((e) => e.id === m.element_id)?.title,
      ]
        .filter(Boolean)
        .join(" · ") || "Sopralluogo";
    const ordinal = (e: SurveyReportElement) =>
      String(all.findIndex((x) => x.id === e.id) + 1).padStart(2, "0");
    function startEdit(e: SurveyReportElement) {
      navigate(() => {
        setEditing(detail.elements.find((r) => r.id === e.id)!);
        setSavedNotice(false);
      });
    }
    const index = (
      <nav aria-label="Indice del sopralluogo" className="space-y-1 p-3">
        <button
          type="button"
          onClick={() => choose({ kind: "overview" })}
          aria-current={selection.kind === "overview" ? "page" : undefined}
          className={`mb-3 flex min-h-10 w-full items-center justify-between rounded-xl px-3 text-left text-sm font-semibold ${selection.kind === "overview" ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-100"}`}
        >
          <span>Riepilogo</span>
          <span className="text-xs">{all.length}</span>
        </button>
        {groups.map((a) => (
          <div key={a.id} className="pb-3">
            <button
              type="button"
              onClick={() =>
                a.id === "unassigned"
                  ? choose({ kind: "overview" })
                  : choose({ kind: "area", id: a.id })
              }
              aria-current={area?.id === a.id ? "page" : undefined}
              className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-100"
            >
              <span>{a.name}</span>
              <span>{a.elements.length}</span>
            </button>
            {a.elements.map((e) => (
              <button
                type="button"
                key={e.id}
                aria-label={`Vai a ${e.title}`}
                aria-current={selected?.id === e.id ? "page" : undefined}
                onClick={() => choose({ kind: "element", id: e.id })}
                className={`flex min-h-10 w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${selected?.id === e.id ? "bg-blue-50 font-medium text-blue-800" : "text-slate-600 hover:bg-slate-100"}`}
              >
                <span className="mt-0.5 shrink-0 text-[10px] text-slate-400">
                  {ordinal(e)}
                </span>
                <span className="min-w-0 break-words">{e.title}</span>
                {surveyElementQuality(detail, e).missing > 0 && (
                  <span
                    className="ml-auto mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500"
                    aria-label="Dati mancanti"
                  />
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>
    );
    function row(e: SurveyReportElement) {
      const q = surveyElementQuality(detail, e);
      return (
        <button
          type="button"
          key={e.id}
          onClick={() => choose({ kind: "element", id: e.id })}
          aria-label={`Apri ${e.title}`}
          className="group flex w-full items-center gap-3 border-b px-4 py-4 text-left transition-colors last:border-0 hover:bg-blue-50/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-xs font-semibold text-slate-500">
            {ordinal(e)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-900">
              {e.title}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-slate-500">
              {surveyElementSummary(e)}
            </span>
          </span>
          <span className="hidden shrink-0 text-xs text-slate-500 sm:block">
            Qtà {e.quantity ?? "—"}
          </span>
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${q.missing ? "bg-orange-50 text-orange-800" : "bg-slate-100 text-slate-600"}`}
          >
            {q.missing ? `${q.missing} da completare` : "Dati compilati"}
          </span>
          <span className="hidden items-center gap-1 text-xs text-slate-400 md:flex">
            <Camera className="h-3.5 w-3.5" />
            {
              q.media.filter((m) =>
                ["photo", "annotated_photo", "sketch"].includes(m.type),
              ).length
            }
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        </button>
      );
    }
    return (
      <div
        className={`flex min-h-0 flex-col overflow-clip bg-slate-50/60 ${embedded ? "h-full" : "mx-auto h-[calc(100dvh-7rem)] min-h-[28rem] max-w-7xl rounded-2xl border max-sm:min-h-0"}`}
      >
        <header
          className={`shrink-0 border-b bg-white px-3 py-3 sm:px-5 sm:py-4 ${embedded ? "pr-12 sm:pr-14" : ""}`}
        >
          {!embedded && (
            <Link
              to={access.field ? "/campo/sopralluoghi" : "/azienda/sopralluoghi"}
              onClick={(e) => {
                e.preventDefault();
                navigate(() => routeTo(access.field ? "/campo/sopralluoghi" : "/azienda/sopralluoghi"));
              }}
              className="mb-2 inline-flex items-center gap-1 text-xs text-slate-500"
            >
              <ArrowLeft className="h-3 w-3" />
              Tutti i sopralluoghi
            </Link>
          )}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="w-full min-w-0 flex-none sm:w-auto sm:flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-blue-700">
                  {survey.code}
                </span>
                <Badge
                  variant="outline"
                  title="Stato amministrativo: non certifica misure o allegati"
                  className="rounded-full text-[10px]"
                >
                  {survey.status === "completed" ? "Da revisionare" : SURVEY_STATUS[survey.status] ?? survey.status}
                </Badge>
              </div>
              <Heading className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                {detail.template.name}
              </Heading>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {access.field && !solaLettura && !embedded && onEdit && <Button variant="outline" className="min-h-11 rounded-xl" onClick={()=>navigate(onEdit)}>Compila</Button>}
              <SurveyPdfTools
                detail={detail}
                companyName={effectiveCompany?.name || "Azienda"}
                brand={surveyPdfBrand(effectiveCompany)}
                references={references.data}
                compact={access.field && small}
                disabled={
                  references.isPending || editState.dirty || editState.saving
                }
              />
              {access.field && access.canEdit && <SurveyFieldHandoff compact={small} detail={detail} disabled={editState.dirty || editState.saving}/>}
              {!access.field && !solaLettura && ["fotovoltaico", "climatizzazione"].includes(detail.template.category) && <Button variant="outline" className="min-h-11 rounded-xl" disabled={editState.dirty || editState.saving} onClick={()=>navigate(()=>routeTo(energyQuoteHref(detail)))}>Prepara preventivo dal rilievo</Button>}
              {!access.field && !solaLettura && !embedded && onEdit && (
                <Button
                  variant="outline"
                  className="min-h-10 rounded-xl gap-2"
                  onClick={() => navigate(onEdit)}
                >
                  <Pencil className="h-4 w-4" />
                  Modifica
                </Button>
              )}
              {embedded && (
                <Button
                  asChild
                  variant="ghost"
                  className="hidden min-h-10 rounded-xl gap-2 sm:inline-flex"
                  disabled={editState.dirty || editState.saving}
                >
                  <Link
                    to={`/azienda/sopralluoghi/${surveyId}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(() =>
                        routeTo(`/azienda/sopralluoghi/${surveyId}`),
                      );
                    }}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Apri pagina
                  </Link>
                </Button>
              )}
            </div>
          </div>
          <details
            open={!small || metadataOpen}
            onToggle={(e) => {
              if (small) setMetadataOpen(e.currentTarget.open);
            }}
          >
            <summary
              hidden={!small}
              className="mt-2 cursor-pointer py-1 text-xs text-slate-500"
            >
              Indirizzo e appuntamento
            </summary>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-orange-500" />
                {surveyAddress(survey)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {dateSurvey(survey.scheduled_at, true)}
              </span>
              {references.isPending ? (
                <span role="status">Carico contatto e incaricati…</span>
              ) : references.isError ? (
                <button
                  type="button"
                  role="alert"
                  className="text-orange-800 underline"
                  onClick={() => void references.refetch()}
                >
                  Riferimenti non disponibili · riprova
                </button>
              ) : (
                <>
                  <span className="font-medium text-slate-700">
                    {references.data?.reference ||
                      "Nessun cliente o contatto collegato"}
                  </span>
                  <span>
                    {references.data?.assignees.length
                      ? references.data.assignees.join(", ")
                      : "Nessun incaricato registrato"}
                  </span>
                </>
              )}
              {survey.order_id && !expectedOrderId && !access.field && (
                <Link
                  className="inline-flex items-center gap-1 text-blue-700"
                  to={`/azienda/ordini/${survey.order_id}?tab=cantiere&vista_cantiere=sopralluoghi`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(() =>
                      routeTo(
                        `/azienda/ordini/${survey.order_id}?tab=cantiere&vista_cantiere=sopralluoghi`,
                      ),
                    );
                  }}
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  Vedi commessa
                </Link>
              )}
            </div>
          </details>
        </header>
        <Tabs
          value={tab}
          onValueChange={(value) =>
            navigate(() => {
              setTab(value);
              content.current?.scrollTo?.({ top: 0 });
            })
          }
          className="flex min-h-0 flex-1 flex-col"
        >
          <div
            data-testid="survey-fixed-navigation"
            className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-white px-3 py-2 sm:px-5"
          >
            <TabsList
              aria-label="Contenuti sopralluogo"
              className="h-auto flex-wrap justify-start gap-1 rounded-xl bg-slate-100 p-1"
            >
              <TabsTrigger value="rilievo" className="min-h-9 rounded-lg">
                {small ? "Rilievo" : "Dati e rilievi"}
              </TabsTrigger>
              <TabsTrigger value="allegati" className="min-h-9 rounded-lg">
                {small ? "Foto" : "Foto e allegati"} ({report.media.length})
              </TabsTrigger>
              <TabsTrigger value="note" className="min-h-9 rounded-lg">
                Note e firma
              </TabsTrigger>
            </TabsList>
            <button
              type="button"
              onClick={() =>
                navigate(() => {
                  setShowChecks((v) => !v);
                  content.current?.scrollTo?.({ top: 0 });
                })
              }
              aria-expanded={showChecks}
              aria-label={
                small
                  ? `Controllo dati · ${issues.length} verifiche`
                  : undefined
              }
              className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs ${issues.length ? "text-orange-800 hover:bg-orange-50" : "text-slate-500 hover:bg-slate-50"}`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {!small &&
                (issues.length
                  ? `${report.missingFields} campi · ${report.missingPhotos} foto richieste mancanti`
                  : "Controllo dati")}
              <ChevronRight
                className={`${small ? "hidden" : ""} h-3 w-3 transition-transform motion-reduce:transition-none ${showChecks ? "rotate-90" : ""}`}
              />
            </button>
          </div>
          <div className="flex min-h-0 flex-1">
            {tab === "rilievo" && (
              <aside className="hidden w-56 shrink-0 overflow-y-auto border-r bg-white/60 lg:block">
                {index}
              </aside>
            )}
            <div
              ref={content}
              data-testid="survey-scroll-content"
              className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5"
            >
              {showChecks && (
                <section className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950">
                  <h3 className="font-semibold">
                    Stato dei dati, distinto dallo stato «
                    {SURVEY_STATUS[survey.status]}»
                  </h3>
                  <p className="mt-1">
                    {report.missingFields} campi obbligatori da completare ·{" "}
                    {report.missingPhotos} foto richieste mancanti.
                  </p>
                  {issues.length > 0 && (
                    <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                      {issues.map((issue, i) => (
                        <li key={`${i}:${issue}`}>{issue}</li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-xs">
                    {survey.client_signature_at
                      ? "Firma presente"
                      : "Firma non presente"}{" "}
                    · {report.media.length} allegati. La compilazione non
                    equivale alla verifica tecnica; la firma non è obbligatoria
                    per ogni tipo di sopralluogo.
                  </p>
                </section>
              )}
              <TabsContent value="rilievo" className="mt-0 space-y-4">
                <SurveyOfficeReview detail={detail}/>
                {(!access.field || selected || area) && <details className="rounded-xl border bg-white lg:hidden">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                    Vai a un ambiente o elemento
                  </summary>
                  {index}
                </details>}
                {selected ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => choose({ kind: "overview" })}
                        className="inline-flex min-h-9 items-center gap-1 text-sm text-slate-500 hover:text-blue-700"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Tutti gli elementi
                      </button>
                      <span className="text-xs text-slate-500">
                        {report.areas.find((a) => a.id === selected.area_id)
                          ?.name || "Senza area riconosciuta"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">
                          {selected.title}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {surveyElementSummary(selected)} · Quantità{" "}
                          {selected.quantity}
                        </p>
                      </div>
                      {!solaLettura &&
                        !survey.client_signature_at &&
                        survey.status !== "signed" &&
                        !editing &&
                        detail.template.schema.element_types.some(
                          (t) => t.key === selected.element_type,
                        ) && (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="gap-2 rounded-xl"
                              onClick={() =>
                                setCopySource(
                                  detail.elements.find(
                                    (e) => e.id === selected.id,
                                  ) ?? null,
                                )
                              }
                            >
                              <Copy className="h-4 w-4" />
                              Duplica
                            </Button>
                            <Button
                              variant="outline"
                              className="gap-2 rounded-xl"
                              onClick={() => startEdit(selected)}
                            >
                              <Pencil className="h-4 w-4" />
                              Modifica elemento
                            </Button>
                          </div>
                        )}
                    </div>
                    {savedNotice && (
                      <p
                        role="status"
                        className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800"
                      >
                        Elemento salvato. Riepilogo e PDF useranno le misure
                        aggiornate.
                      </p>
                    )}
                    {editing ? (
                      <SurveyElementEditor
                        ref={editorRef}
                        key={`${editing.id}:${editing.updated_at}`}
                        detail={detail}
                        element={editing}
                        onStateChange={setEditState}
                        onCancel={() => navigate(() => {})}
                        onSaved={() => {
                          setEditing(null);
                          setEditState({ dirty: false, saving: false });
                          setSavedNotice(true);
                        }}
                        nextLabel={
                          nextEditable?.element_label ||
                          detail.template.schema.element_types.find(
                            (t) => t.key === nextEditable?.element_type,
                          )?.label
                        }
                        onNext={
                          nextEditable
                            ? () => {
                                setSelection({
                                  kind: "element",
                                  id: nextEditable.id,
                                });
                                setEditing(nextEditable);
                                setEditState({ dirty: false, saving: false });
                                setSavedNotice(false);
                                content.current?.scrollTo?.({ top: 0 });
                              }
                            : undefined
                        }
                      />
                    ) : (
                      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
                        <div className="space-y-4">
                          {(() => {
                            const type =
                              detail.template.schema.element_types.find(
                                (t) => t.key === selected.element_type,
                              );
                            return type && isWindowSurvey(type) ? (
                              <WindowSurveyVisual
                                type={type}
                                headerValues={detail.survey.header_data}
                                values={selected.values}
                                quantity={selected.quantity}
                                media={detail.media.filter(
                                  (m) => m.element_id === selected.id,
                                )}
                              />
                            ) : type && isEnergySurvey(type) ? <EnergySurveyVisual type={type} values={selected.values}/> : null;
                          })()}
                          <Sections
                            sections={selected.sections.filter(
                              (s) => s.key !== "rv_summary",
                            )}
                          />
                          {selected.notes && (
                            <p className="whitespace-pre-wrap rounded-xl border bg-white p-4 text-sm text-slate-600">
                              {selected.notes}
                            </p>
                          )}
                          <AudioNote
                            url={selected.audio_url}
                            transcription={selected.audio_transcription}
                            label={`Nota vocale: ${selected.title}`}
                          />
                        </div>
                        <section className="space-y-3">
                          <h4 className="text-sm font-semibold text-slate-700">
                            Foto e allegati dell’elemento
                          </h4>
                          <SurveyMediaGallery
                            media={detail.media.filter(
                              (m) => m.element_id === selected.id,
                            )}
                            emptyText="Nessuna foto o allegato collegato a questo elemento."
                          />
                          {surveyElementQuality(
                            detail,
                            selected,
                          ).missingPhotos.map((p) => (
                            <p
                              key={p.key}
                              className="rounded-lg bg-orange-50 p-3 text-xs text-orange-900"
                            >
                              Foto richiesta da aggiungere: {p.label}
                            </p>
                          ))}
                        </section>
                      </div>
                    )}
                    {(survey.client_signature_at ||
                      survey.status === "signed") && (
                      <p className="text-xs text-slate-500">
                        Rilievo sottoscritto: consultazione disponibile,
                        modifica rapida disattivata per preservare l’originale.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">
                          {area?.name || "Il rilievo in sintesi"}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {area
                            ? `${area.elements.length} ${area.elements.length === 1 ? "elemento" : "elementi"}`
                            : `${report.areas.length} ${report.areas.length === 1 ? "ambiente" : "ambienti"} · ${all.length} ${all.length === 1 ? "elemento" : "elementi"} · ${report.media.length} allegati`}{" "}
                          {solaLettura
                            ? "· apri una voce per consultare misure e foto."
                            : "· apri una voce per misure, foto e modifica."}
                        </p>
                      </div>
                      {area && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => choose({ kind: "overview" })}
                        >
                          Tutti gli ambienti
                        </Button>
                      )}
                    </div>
                    {area ? (
                      <section className="rounded-xl border bg-white p-4">
                        <Fields fields={area.fields} />
                        {area.notes && (
                          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                            {area.notes}
                          </p>
                        )}
                        <AudioNote
                          url={area.audio_url}
                          transcription={area.audio_transcription}
                          label={`Nota vocale: ${area.name}`}
                        />
                        {detail.media.some(
                          (m) => m.area_id === area.id && !m.element_id,
                        ) && (
                          <div className="mt-4">
                            <SurveyMediaGallery
                              media={detail.media.filter(
                                (m) => m.area_id === area.id && !m.element_id,
                              )}
                            />
                          </div>
                        )}
                      </section>
                    ) : (
                      <details className="rounded-xl border bg-white">
                        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-600">
                          Immobile, colori e accesso · dettagli generali
                        </summary>
                        <div className="grid gap-3 border-t p-3 md:grid-cols-2">
                          <Sections sections={report.header} />
                        </div>
                      </details>
                    )}
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <Input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Cerca nel sopralluogo"
                        placeholder="Cerca ambiente, elemento o materiale…"
                        className="h-10 rounded-xl bg-white pl-9"
                      />
                    </div>
                    {!all.length && (
                      <p className="rounded-xl border border-dashed p-5 text-sm text-slate-500">
                        Nessun elemento registrato.
                        {!report.areas.length && " Nessuna area registrata."}
                      </p>
                    )}
                    {filtered
                      .filter((a) => a.elements.length > 0)
                      .map((a) => (
                        <section
                          key={a.id}
                          className="overflow-hidden rounded-xl border bg-white"
                        >
                          <div className="flex items-center justify-between border-b bg-slate-50/70 px-4 py-2.5">
                            <h4 className="text-sm font-semibold text-slate-700">
                              {a.name}
                            </h4>
                            <span className="text-xs text-slate-400">
                              {a.elements.length}{" "}
                              {a.elements.length === 1
                                ? "elemento"
                                : "elementi"}
                            </span>
                          </div>
                          {a.elements.map(row)}
                        </section>
                      ))}
                    {!!needle && !filtered.some((a) => a.elements.length) && (
                      <p className="p-4 text-sm text-slate-500">
                        Nessun elemento corrisponde alla ricerca.{" "}
                        <button
                          className="text-blue-700 underline"
                          onClick={() => setSearch("")}
                        >
                          Azzera ricerca
                        </button>
                      </p>
                    )}
                    <p className="text-[11px] text-slate-400">
                      Aggiornato {dateSurvey(surveyLastUpdated(detail), true)} · i dati
                      mancanti restano evidenziati, non vengono stimati.
                    </p>
                  </>
                )}
              </TabsContent>
              <TabsContent value="allegati" className="mt-0">
                <SurveyMediaGallery
                  media={report.media}
                  context={mediaContext}
                  emptyText="Nessuna foto o allegato registrato. Non vengono mostrate immagini dimostrative."
                />
              </TabsContent>
              <TabsContent value="note" className="mt-0 space-y-4">
                <section className="rounded-xl border bg-white p-5">
                  <h3 className="mb-3 font-semibold text-blue-950">
                    Note generali
                  </h3>
                  <p className="whitespace-pre-wrap break-words text-sm text-slate-700">
                    {survey.notes || "Nessuna nota registrata."}
                  </p>
                  <AudioNote
                    url={survey.general_audio_url}
                    transcription={survey.general_audio_transcription}
                    label="Audio generale"
                  />
                </section>
                <section className="rounded-xl border bg-white p-5">
                  <h3 className="mb-3 font-semibold text-blue-950">
                    Firma registrata
                  </h3>
                  {survey.client_signature_at ? (
                    <>
                      <p className="text-sm">
                        {survey.client_signature_name ||
                          "Firmatario non indicato"}{" "}
                        · {dateSurvey(survey.client_signature_at, true)}
                      </p>
                      {surveyMediaUrl(survey.client_signature_url) && (
                        <img
                          src={surveyMediaUrl(survey.client_signature_url)!}
                          alt="Firma registrata del cliente"
                          className="mt-3 max-h-24 max-w-full border bg-white p-2"
                        />
                      )}
                      <p className="mt-2 text-xs text-slate-500">
                        La consultazione non modifica né ricrea la firma.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Nessuna firma registrata.
                    </p>
                  )}
                </section>
              </TabsContent>
            </div>
          </div>
        </Tabs>
        {copySource &&
          !solaLettura &&
          !survey.client_signature_at &&
          survey.status !== "signed" &&
          !editing && (
            <SurveyDuplicateDialog
              detail={detail}
              source={copySource}
              onClose={() => setCopySource(null)}
              onConfirm={async (request) => {
                if (
                  !effectiveCompany?.id ||
                  editState.saving ||
                  editState.dirty
                )
                  throw new Error("Chiudi prima le modifiche in corso.");
                const created = await duplicateSurveyElement(
                  detail,
                  copySource,
                  request,
                  effectiveCompany.id,
                );
                qc.setQueriesData(
                  { queryKey: ["sopralluogo", survey.id] },
                  (
                    old: import("@/lib/api/surveys").SurveyDetail | undefined,
                  ) =>
                    old?.survey.company_id === effectiveCompany.id
                      ? {
                          ...old,
                          elements: old.elements.some(
                            (e) => e.id === created.id,
                          )
                            ? old.elements
                            : [...old.elements, created],
                        }
                      : old,
                );
                void qc.invalidateQueries({
                  queryKey: ["sopralluogo", survey.id],
                });
                setCopySource(null);
                setSelection({ kind: "element", id: created.id });
                setEditing(created);
                setSavedNotice(false);
                content.current?.scrollTo?.({ top: 0 });
              }}
            />
          )}
        <AlertDialog
          open={!!discardAction}
          onOpenChange={(open) => {
            if (!open) setDiscardAction(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hai modifiche non salvate</AlertDialogTitle>
              <AlertDialogDescription>
                Puoi continuare, conservare la bozza su questo browser o
                scartarla. I dati già salvati non cambiano.
              </AlertDialogDescription>
              {keepFailed && (
                <p role="alert" className="text-sm text-orange-900">
                  La bozza non può essere conservata completamente. Torna alla
                  scheda: controlla le foto ancora da caricare e gli avvisi sul
                  salvataggio locale.
                </p>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Continua a modificare</AlertDialogCancel>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!editorRef.current?.keepDraft()) {
                    setKeepFailed(true);
                    return;
                  }
                  const action = discardAction;
                  setDiscardAction(null);
                  setEditing(null);
                  setEditState({ dirty: false, saving: false });
                  action?.();
                }}
              >
                Conserva bozza e chiudi
              </Button>
              <AlertDialogAction
                onClick={() => {
                  const action = discardAction;
                  editorRef.current?.discardDraft();
                  setDiscardAction(null);
                  setEditing(null);
                  setEditState({ dirty: false, saving: false });
                  action?.();
                }}
              >
                Scarta modifiche
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  },
);
