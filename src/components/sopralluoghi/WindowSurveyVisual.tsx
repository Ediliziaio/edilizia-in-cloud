import { useEffect, useId, useState } from "react";
import type { ElementTypeDefinition, SurveyMediaRow } from "@/types/surveys";
import { DisegnoSerramentoSvg } from "@/components/serramenti/DisegnoSerramentoSvg";
import { WindowAbacoPanel } from "./WindowAbacoPanel";
import { InstallationEnvelopePanel } from "./InstallationEnvelopePanel";
import { WindowSystemPanel } from "./WindowSystemPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapPin, RotateCcw, Trash2, Ruler } from "lucide-react";
import { sceneAspectRatio } from "@/lib/surveys/windowComponentScenes";
import { BoxAxonometricSvg } from "./BoxAxonometricSvg";
import type { PendingSurveyAnnotation } from "@/lib/surveys/elementDraft";
import {
  WINDOW_PINS,
  WINDOW_COMPONENTS,
  leafCount,
  readWindowPins,
  trimMetres,
  windowComponentData,
  windowDisplayValues,
  windowOrderVerified,
  windowSurveyDrawing,
  windowSurveyFinishLabel,
  windowSurveyIssues,
  LEAF_TYPES,
  type DrawingView,
  type WindowComponent,
  type WindowValues,
} from "@/lib/surveys/windowSurvey";

type Props = {
  type: ElementTypeDefinition;
  values: WindowValues;
  quantity: number;
  media?: SurveyMediaRow[];
  onChange?: (values: WindowValues) => void;
  onPendingChange?: (pending: boolean) => void;
  headerValues?: WindowValues;
  resumeAnnotation?: PendingSurveyAnnotation | null;
  onAnnotationDraftChange?: (
    annotation: PendingSurveyAnnotation | null,
  ) => void;
};
export function WindowSurveyVisual({
  type,
  values,
  quantity,
  media = [],
  onChange,
  onPendingChange,
  headerValues,
  resumeAnnotation,
  onAnnotationDraftChange,
}: Props) {
  const [view, setView] = useState<DrawingView>(
      resumeAnnotation?.view ??
        (type.key === "porta_interna" ? "esterna" : "interna"),
    ),
    [boxProjection, setBoxProjection] = useState(!resumeAnnotation),
    [boxMeasured, setBoxMeasured] = useState(false),
    [order, setOrder] = useState(false),
    [pinMode, setPinMode] = useState(!!resumeAnnotation);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(
      resumeAnnotation?.pending ?? null,
    ),
    [note, setNote] = useState(resumeAnnotation?.note ?? ""),
    [photoId, setPhotoId] = useState(resumeAnnotation?.photoId ?? "none");
  const id = useId();
  const [selectedComponent, setComponent] = useState<WindowComponent>(
    resumeAnnotation?.component ?? "primary",
  );
  const component: WindowComponent =
    type.key === "infisso" &&
    Array.isArray(values.complementi) &&
    values.complementi.includes(selectedComponent)
      ? selectedComponent
      : "primary";
  const projected = windowComponentData(
    type,
    windowDisplayValues(type, values, headerValues),
    component,
  );
  useEffect(() => {
    onPendingChange?.(!!pending);
  }, [pending, onPendingChange]);
  useEffect(() => {
    onAnnotationDraftChange?.(
      pending ? { pending, note, photoId, view, component } : null,
    );
  }, [pending, note, photoId, view, component, onAnnotationDraftChange]);
  // Pins belong to the measured drawing only, so order-view notes cannot be mistaken for survey notes.
  const finite =
    order && windowOrderVerified(values) && component === "primary";
  const drawing = windowSurveyDrawing(
    projected.type,
    projected.values,
    view,
    finite,
  );
  const spatial = boxProjection && !finite ? drawing?.axonometric : undefined;
  const boxSketch = boxMeasured ? spatial : (spatial?.reference ?? spatial);
  const pins = readWindowPins(values),
    count = leafCount(values),
    trims = trimMetres(values, quantity);
  const patch = (key: string, value: unknown) =>
    onChange?.({ ...values, [key]: value });
  const colorKey = view === "interna" ? "colore_interno" : "colore_esterno";
  const ownColor = String(values[colorKey] ?? "").trim();
  const colorOptions = [
    ["#ffffff", "Bianco"],
    ["RAL 9010", "Bianco caldo · RAL 9010"],
    ["RAL 9016", "Bianco traffico · RAL 9016"],
    ["RAL 7016", "Antracite · RAL 7016"],
    ["RAL 9005", "Nero · RAL 9005"],
    ["Rovere", "Rovere · effetto legno"],
  ];
  const changeView = (v: DrawingView) => {
    setView(v);
    setPinMode(false);
  };
  const photos = media.filter((m) =>
    ["photo", "annotated_photo", "sketch"].includes(m.type),
  );
  return (
    <section
      aria-label="Disegno tecnico del rilievo"
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Ruler className="h-4 w-4 text-blue-700" />
        <h4 className="text-sm font-semibold text-slate-900">
          Il tuo rilievo, in vista
        </h4>
        <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-slate-400">
          Quote in mm
        </span>
      </div>
      <div className="space-y-4 p-4">
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Vista del disegno"
        >
          {drawing?.axonometric && !finite
            ? ([true, false] as const).map((v) => (
                <Button
                  key={String(v)}
                  type="button"
                  size="sm"
                  disabled={!!pending}
                  variant={v === boxProjection ? "default" : "ghost"}
                  className="rounded-full"
                  aria-pressed={v === boxProjection}
                  onClick={() => {
                    setBoxProjection(v);
                    setPinMode(false);
                  }}
                >
                  {v ? "Vista 3D" : "Frontale e note"}
                </Button>
              ))
            : (["interna", "esterna"] as const).map((v) => (
                <Button
                  key={v}
                  disabled={!!pending}
                  type="button"
                  size="sm"
                  variant={v === view ? "default" : "ghost"}
                  className="rounded-full"
                  aria-pressed={v === view}
                  onClick={() => changeView(v)}
                >
                  {type.key === "porta_interna"
                    ? v === "esterna"
                      ? "Lato A · riferimento"
                      : "Lato B · retro"
                    : v === "interna"
                      ? "Da dentro"
                      : "Da fuori"}
                </Button>
              ))}
        </div>
        {drawing && (
          <div className="space-y-2">
            {onChange &&
              component === "primary" &&
              ["infisso", "porta_interna", "portoncino_blindato"].includes(
                type.key,
              ) && (
                <div className="flex flex-wrap items-center gap-2">
                  <Label
                    htmlFor={`${id}-finish`}
                    className="text-xs text-slate-600"
                  >
                    {type.key === "porta_interna"
                      ? `Colore lato ${view === "esterna" ? "A" : "B"}`
                      : `Colore ${view === "interna" ? "interno" : "esterno"}`}
                  </Label>
                  <Select
                    value={ownColor || "__general"}
                    disabled={!!pending}
                    onValueChange={(v) =>
                      patch(colorKey, v === "__general" ? "" : v)
                    }
                  >
                    <SelectTrigger
                      id={`${id}-finish`}
                      className="h-11 w-full rounded-xl sm:w-64"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="__general">
                        Generale / non indicato
                      </SelectItem>
                      {ownColor &&
                        !colorOptions.some(([key]) => key === ownColor) && (
                          <SelectItem value={ownColor}>{ownColor}</SelectItem>
                        )}
                      {colorOptions.map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            <p className="text-[11px] text-slate-500" aria-live="polite">
              {windowSurveyFinishLabel(projected.values, view)}
            </p>
          </div>
        )}
        {type.key === "infisso" &&
          Array.isArray(values.complementi) &&
          values.complementi.length > 0 && (
            <div
              className="flex flex-wrap gap-1"
              aria-label="Componente da disegnare"
            >
              {WINDOW_COMPONENTS.filter(
                ([k]) =>
                  k === "primary" ||
                  (values.complementi as unknown[]).includes(k),
              ).map(([key, label]) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  disabled={!!pending}
                  variant={component === key ? "secondary" : "ghost"}
                  aria-pressed={component === key}
                  className="h-7 rounded-full px-2 text-[11px]"
                  onClick={() => {
                    setComponent(key);
                    setOrder(false);
                    setPinMode(false);
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
          )}
        {spatial && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-slate-600">
              {boxMeasured
                ? "Proporzioni delle misure rilevate"
                : "Schema illustrativo · non in scala"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full text-xs"
              onClick={() => setBoxMeasured(!boxMeasured)}
            >
              {boxMeasured
                ? "Torna allo schema"
                : "Mostra proporzioni rilevate"}
            </Button>
          </div>
        )}
        <div className="flex min-h-40 items-center justify-center rounded-xl border border-blue-100 bg-white p-3 lg:min-h-56">
          {boxSketch ? (
            <BoxAxonometricSvg
              sketch={boxSketch}
              color={
                drawing?.internal?.tipo === "legno"
                  ? drawing.internal.chiaro
                  : drawing?.internal?.hex
              }
            />
          ) : drawing ? (
            <div
              className="relative w-full max-w-sm [--survey-drawing-height:18rem] lg:[--survey-drawing-height:24rem]"
              style={{
                maxWidth: `min(100%, calc(var(--survey-drawing-height) * ${sceneAspectRatio(drawing.scene)}))`,
              }}
              data-testid="survey-window-canvas"
            >
              <DisegnoSerramentoSvg
                {...(drawing.drawing
                  ? { disegno: drawing.drawing }
                  : { scena: drawing.scene, vista: view })}
                finituraInterna={drawing.internal}
                finituraEsterna={drawing.external}
                className="block w-full"
              />
              {!finite &&
                pins
                  .filter(
                    (p) =>
                      p.view === view &&
                      (p.component ?? "primary") === component,
                  )
                  .map((p) => (
                    <span
                      key={p.id}
                      title={p.text}
                      aria-label={`Nota ${pins.indexOf(p) + 1}: ${p.text}`}
                      className="pointer-events-none absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-orange-500 text-xs font-semibold text-white shadow"
                      style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                    >
                      {pins.indexOf(p) + 1}
                    </span>
                  ))}
              {pinMode && !finite && (
                <button
                  type="button"
                  aria-label="Scegli il punto della nota sul disegno"
                  className="absolute inset-0 cursor-crosshair rounded-xl border-2 border-dashed border-orange-400 bg-orange-100/10 focus-visible:ring-2 focus-visible:ring-orange-500"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    if (!rect.width || !rect.height) return;
                    setPending({
                      x: Math.min(
                        1,
                        Math.max(0, (e.clientX - rect.left) / rect.width),
                      ),
                      y: Math.min(
                        1,
                        Math.max(0, (e.clientY - rect.top) / rect.height),
                      ),
                    });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setPending({ x: 0.5, y: 0.5 });
                    }
                  }}
                />
              )}
              {pending && (
                <span
                  className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500 ring-4 ring-orange-200"
                  style={{
                    left: `${pending.x * 100}%`,
                    top: `${pending.y * 100}%`,
                  }}
                />
              )}
            </div>
          ) : (
            <div className="max-w-64 text-center text-sm text-slate-500">
              <Ruler className="mx-auto mb-3 h-7 w-7 text-blue-300" />
              Inserisci larghezza e altezza con un’unità nota per vedere
              l’ingombro. Nessuna misura di esempio viene aggiunta.
            </div>
          )}
        </div>
        <div className="space-y-1">
          {spatial && (
            <dl
              aria-label="Quote del cassonetto"
              className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-4"
            >
              {spatial.dimensions.map((d) => (
                <div key={d.text}>
                  <dt className="text-[10px] font-medium text-slate-500">
                    {
                      {
                        L: "L · Larghezza",
                        H: "H · Altezza",
                        P: "P · Profondità",
                        C: "C · Cielino",
                      }[d.text[0]]
                    }
                  </dt>
                  <dd className="text-sm font-semibold tabular-nums text-blue-950">
                    {d.text.slice(2)}
                  </dd>
                </div>
              ))}
              {!spatial.dimensions.some((d) => d.text.startsWith("C ")) && (
                <div>
                  <dt className="text-[10px] font-medium text-slate-500">
                    C · Cielino
                  </dt>
                  <dd className="text-sm font-medium text-amber-800">
                    Da rilevare
                  </dd>
                </div>
              )}
            </dl>
          )}
          <p className="text-xs font-medium text-blue-900">
            {drawing?.basis ?? "Misure mancanti o unità non riconosciuta"}
          </p>
          {spatial && (
            <details className="text-[11px] text-slate-500">
              <summary className="cursor-pointer font-medium text-blue-800">
                Legenda L · H · P · C
              </summary>
              <ul className="mt-1 space-y-1">
                {(boxSketch ?? spatial).notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-[11px] text-slate-500">
            {spatial ? (
              "L e H: cassonetto. P: profondità del corpo. C: profondità totale del cielino. Profili e pannello sono illustrativi."
            ) : (
              <>
                Schema proporzionale, profili illustrativi.{" "}
                {type.key === "porta_interna"
                  ? "Porta interna: cerniere, spingere/tirare e scorrimento si definiscono dal lato A, identificato con il nome della stanza."
                  : type.key === "portoncino_blindato"
                    ? "Portoncino: cerniere e spingere/tirare si definiscono dal lato esterno."
                    : "Destra e sinistra si definiscono da dentro; la vista esterna si specchia."}
              </>
            )}
          </p>
        </div>
        {drawing?.axonometric?.warnings.map((warning) => (
          <p
            key={warning}
            role="status"
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          >
            {warning}
          </p>
        ))}
        {drawing?.abaco && (
          <WindowAbacoPanel abaco={drawing.abaco} defaultOpen={!onChange} />
        )}
        {drawing?.installation && (
          <InstallationEnvelopePanel data={drawing.installation} />
        )}
        {drawing?.system && <WindowSystemPanel data={drawing.system} />}
        {drawing?.detail && (
          <details
            className="rounded-xl border border-blue-100 bg-slate-50 p-3"
            open={drawing.axonometric ? undefined : true}
          >
            <summary className="cursor-pointer text-xs font-semibold text-blue-950">
              {drawing.detail.title}
            </summary>
            <figure className="mt-3 space-y-2">
              {["portoncino_blindato", "porta_interna"].includes(type.key) && (
                <p className="text-center text-[10px] font-medium tracking-widest text-slate-500">
                  {drawing.detail.labels?.top ??
                    (type.key === "porta_interna" ? "LATO A" : "ESTERNO")}
                </p>
              )}
              <div
                className={`mx-auto ${drawing.detail.labels ? "max-w-full" : "max-w-56"} [&>svg]:!h-44 [&>svg]:!w-full`}
              >
                <DisegnoSerramentoSvg
                  scena={drawing.detail.scene}
                  ariaLabel={`${drawing.detail.title}. ${drawing.detail.caption}`}
                  finituraInterna={drawing.internal}
                  finituraEsterna={drawing.external}
                />
              </div>
              {["portoncino_blindato", "porta_interna"].includes(type.key) && (
                <p className="text-center text-[10px] font-medium tracking-widest text-slate-500">
                  {drawing.detail.labels?.bottom ??
                    (type.key === "porta_interna" ? "LATO B" : "INTERNO")}
                </p>
              )}
              <p className="text-[11px] text-slate-500">
                {drawing.detail.caption}
              </p>
            </figure>
          </details>
        )}
        {windowOrderVerified(values) && component === "primary" && (
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {[false, true].map((o) => (
              <Button
                disabled={!!pending}
                type="button"
                size="sm"
                key={String(o)}
                variant={order === o ? "secondary" : "ghost"}
                className="flex-1 rounded-lg text-xs"
                onClick={() => {
                  setOrder(o);
                  setPinMode(false);
                }}
                aria-pressed={order === o}
              >
                {o ? "Finite verificate" : "Rilevate"}
              </Button>
            ))}
          </div>
        )}
        {!!drawing?.warnings.length && (
          <div className="space-y-1 rounded-xl bg-orange-50 p-3 text-xs text-orange-900">
            {drawing.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        )}
        {onChange && component === "primary" && type.key === "infisso" && (
          <details open className="rounded-xl border p-3">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700">
              Componi le ante
            </summary>
            <div className="mt-3 space-y-3">
              <Label htmlFor={`${id}-count`} className="text-xs">
                Numero totale di ante / campi
              </Label>
              <Input
                id={`${id}-count`}
                type="number"
                min={1}
                max={6}
                step={1}
                value={count || ""}
                onChange={(e) => {
                  const v = { ...values };
                  if (e.target.value === "") delete v.rv_total_leaves;
                  else v.rv_total_leaves = Number(e.target.value);
                  onChange(v);
                }}
                className="h-9 w-24"
              />
              {Array.from({ length: count }, (_, i) => (
                <div key={i} className="space-y-2 rounded-xl bg-slate-50 p-2.5">
                  <p className="text-xs font-medium">
                    Anta {i + 1} · da sinistra a destra
                  </p>
                  <Pick
                    label={`Anta ${i + 1} · apertura`}
                    value={String(values[`rv_leaf_${i}_type`] ?? "")}
                    options={LEAF_TYPES}
                    onValueChange={(v) => patch(`rv_leaf_${i}_type`, v)}
                  />
                  <Pick
                    label={`Anta ${i + 1} · cerniere / scorrimento da dentro`}
                    value={String(values[`rv_leaf_${i}_side`] ?? "")}
                    options={[
                      ["sx", "Sinistra"],
                      ["dx", "Destra"],
                    ]}
                    onValueChange={(v) => patch(`rv_leaf_${i}_side`, v)}
                  />
                </div>
              ))}
            </div>
          </details>
        )}
        {onChange && drawing && !finite && (
          <div className="space-y-3 border-t pt-3">
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2 rounded-xl"
              disabled={pins.length >= 50}
              aria-pressed={pinMode}
              onClick={() => {
                setBoxProjection(false);
                setPinMode(!pinMode);
                setPending(null);
              }}
            >
              <MapPin className="h-4 w-4" />
              {pinMode ? "Annulla posizionamento" : "Aggiungi nota sul disegno"}
            </Button>
            {pinMode && !pending && (
              <p role="status" className="text-xs text-orange-800">
                Tocca il punto sul disegno. Con tastiera, Invio posiziona la
                nota al centro.
              </p>
            )}
            {pending && (
              <div className="space-y-2 rounded-xl border border-orange-200 bg-orange-50 p-3">
                <Label htmlFor={`${id}-note`} className="text-xs">
                  Nota sul punto selezionato
                </Label>
                <Textarea
                  id={`${id}-note`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={2000}
                  placeholder="Es. mazzetta fuori squadra da verificare"
                />
                {photos.length > 0 && (
                  <Pick
                    label="Foto collegata alla nota"
                    value={photoId}
                    options={[
                      ["none", "Nessuna foto"],
                      ...photos.map((m): [string, string] => [
                        m.id,
                        m.filename || m.checklist_label || "Foto dell’elemento",
                      ]),
                    ]}
                    onValueChange={setPhotoId}
                  />
                )}
                <Button
                  type="button"
                  size="sm"
                  className="rounded-lg"
                  disabled={!note.trim()}
                  onClick={() => {
                    setBoxProjection(false);
                    patch(WINDOW_PINS, [
                      ...pins,
                      {
                        id: crypto.randomUUID(),
                        ...pending,
                        text: note.trim(),
                        view,
                        component,
                        ...(photoId !== "none" ? { photoId } : {}),
                      },
                    ]);
                    setPending(null);
                    setNote("");
                    setPhotoId("none");
                    setPinMode(false);
                  }}
                >
                  Aggiungi alla bozza
                </Button>
              </div>
            )}
          </div>
        )}
        {pins.length > 0 && (
          <ol className="space-y-2" aria-label="Note del disegno">
            {pins.map((p, i) => (
              <li
                key={p.id}
                className="flex gap-2 rounded-xl bg-orange-50 p-3 text-xs"
              >
                <button
                  type="button"
                  disabled={!!pending}
                  onClick={() => {
                    changeView(p.view);
                    setBoxProjection(false);
                    setComponent(p.component ?? "primary");
                    setOrder(false);
                  }}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500 font-medium text-white"
                  aria-label={`Mostra nota ${i + 1} nella vista ${p.view}`}
                >
                  {i + 1}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap break-words text-slate-800">
                    {p.text}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Vista {p.view}
                    {p.component && p.component !== "primary"
                      ? ` · ${p.component}`
                      : ""}
                    {p.photoId
                      ? ` · ${photos.find((m) => m.id === p.photoId)?.filename || "Foto non disponibile"}`
                      : ""}
                  </p>
                </div>
                {onChange && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    aria-label={`Elimina nota ${i + 1}`}
                    onClick={() =>
                      patch(
                        WINDOW_PINS,
                        pins.filter((n) => n.id !== p.id),
                      )
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ol>
        )}
        {trims.entered > 0 && (
          <div className="rounded-xl bg-blue-50 p-3">
            <p className="text-xs font-medium text-blue-900">
              Coprifili: {trims.perElement.toLocaleString("it-IT")} ml /
              elemento
            </p>
            <p className="mt-1 text-[11px] text-blue-700">
              {trims.entered}/4 lati inseriti ·{" "}
              {trims.total.toLocaleString("it-IT")} ml per {quantity} elementi.
              Senza sfrido e senza arrotondamenti a barre.
            </p>
          </div>
        )}
        {windowSurveyIssues(type, values)
          .filter(
            (issue) =>
              !drawing?.installation?.warnings.includes(issue) &&
              !drawing?.system?.checks.includes(issue),
          )
          .filter((issue) => !drawing?.warnings.includes(issue))
          .map((issue) => (
            <p key={issue} className="text-[11px] text-slate-500">
              {issue}
            </p>
          ))}
        <p className="flex items-start gap-1.5 border-t pt-3 text-[11px] text-slate-400">
          <RotateCcw className="h-3 w-3 shrink-0" />
          Il rilievo non modifica preventivi, listini o ordini.
        </p>
      </div>
    </section>
  );
}
function Pick({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  onValueChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        aria-label={label}
        className="h-9 rounded-xl bg-white text-xs"
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent className="rounded-xl">
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
