import { useEffect, useRef, useState } from "react";
import { Camera, Images, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { uploadMedia, validateSurveyPhoto } from "@/lib/api/surveys";
import type {
  PhotoChecklistItem,
  SurveyElementRow,
  SurveyMediaRow,
} from "@/types/surveys";
import { SurveyMediaGallery } from "./SurveyMediaGallery";
import { surveyMediaUrl } from "@/lib/surveys/report";
import {
  SurveyPhotoPlacementEditor,
  type PlacementSource,
} from "./SurveyPhotoPlacementEditor";
import type {
  PhotoComponentKind,
  PhotoPlacementDocument,
} from "@/lib/surveys/photoPlacement";

export type SurveyPhotoState = { pending: number; busy: boolean };
type QueuedPhoto = {
  id: string;
  file: File;
  key: string;
  context: string;
  annotations?: PhotoPlacementDocument;
  sourceQueueId?: string;
};

function QueuedPhotoPreview({
  item,
  enabled,
  onPlace,
}: {
  item: QueuedPhoto;
  enabled: boolean;
  onPlace: (url: string) => void;
}) {
  const preview = useRef<HTMLImageElement>(null),
    url = useRef("");
  useEffect(() => {
    if (!URL.createObjectURL) return;
    const next = URL.createObjectURL(item.file);
    url.current = next;
    if (preview.current) preview.current.src = next;
    return () => {
      URL.revokeObjectURL(next);
      url.current = "";
    };
  }, [item.file]);
  return typeof URL.createObjectURL === "function" ? (
    <div className="space-y-2">
      <img
        ref={preview}
        alt={`Anteprima ${item.file.name}`}
        className="max-h-40 w-full rounded-xl object-contain"
      />
      {enabled && !item.annotations && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full rounded-xl text-xs"
          onClick={() => {
            if (url.current) onPlace(url.current);
          }}
        >
          Posiziona impianto sulla foto
        </Button>
      )}
    </div>
  ) : null;
}

/** Photos have a separate, explicit upload; cancelling field edits never deletes uploaded media. */
export function SurveyElementPhotos({
  surveyId,
  companyId,
  element,
  checklist,
  media,
  disabled,
  allowPlacement = false,
  placementKind = "split",
  onStateChange,
  onAdded,
}: {
  surveyId: string;
  companyId: string;
  element: SurveyElementRow;
  checklist: PhotoChecklistItem[];
  media: SurveyMediaRow[];
  disabled: boolean;
  allowPlacement?: boolean;
  placementKind?: PhotoComponentKind;
  onStateChange: (state: SurveyPhotoState) => void;
  onAdded: (media: SurveyMediaRow) => void;
}) {
  const [queue, setQueue] = useState<QueuedPhoto[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null),
    [placementDraft, setPlacement] = useState<
      (PlacementSource & { context: string }) | null
    >(null);
  const camera = useRef<HTMLInputElement>(null),
    gallery = useRef<HTMLInputElement>(null),
    inFlight = useRef(false);
  const savedSources = useRef(new Map<string, string>());
  const context = `${companyId}:${surveyId}:${element.id}`;
  const placement = placementDraft?.context === context ? placementDraft : null;
  const currentContext = useRef(context);
  useEffect(() => {
    currentContext.current = context;
    savedSources.current.clear();
    return () => {
      currentContext.current = "closed";
    };
  }, [context]);
  useEffect(() => {
    onStateChange({ pending: queue.length + (placement ? 1 : 0), busy });
  }, [queue.length, placement, busy, onStateChange]);

  function select(files: FileList | null) {
    if (disabled || busy || placement) return;
    setError(null);
    setNotice(null);
    const accepted: QueuedPhoto[] = [],
      errors: string[] = [];
    for (const file of Array.from(files ?? [])) {
      const invalid = validateSurveyPhoto(file);
      if (invalid) errors.push(invalid);
      else
        accepted.push({ id: crypto.randomUUID(), file, key: "free", context });
    }
    setQueue((old) => [...old, ...accepted]);
    if (errors.length) setError(errors.join(" "));
  }
  async function upload() {
    if (inFlight.current || disabled || placement || !queue.length) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    let count = 0;
    try {
      for (const item of queue) {
        if (currentContext.current !== context)
          throw new Error("Contesto cambiato: interrompo il caricamento.");
        if (item.context !== context)
          throw new Error(
            "Le foto appartengono a un’altra scheda: riapri l’elemento originale prima di caricarle.",
          );
        if (item.sourceQueueId && !savedSources.current.has(item.sourceQueueId))
          throw new Error("Carica prima la foto originale della proposta.");
        const def = checklist.find((p) => p.key === item.key);
        const saved = await uploadMedia(surveyId, item.file, {
          type: item.annotations ? "annotated_photo" : "photo",
          elementId: element.id,
          areaId: element.area_id,
          checklistKey: item.annotations ? null : (def?.key ?? null),
          checklistLabel: item.annotations
            ? "Posizionamento proposto · non in scala"
            : (def?.label ?? null),
          annotations: item.annotations
            ? {
                ...item.annotations,
                sourceMediaId: item.sourceQueueId
                  ? (savedSources.current.get(item.sourceQueueId) ?? null)
                  : item.annotations.sourceMediaId,
              }
            : null,
          expectedCompanyId: companyId,
        });
        savedSources.current.set(item.id, saved.id);
        count++;
        setQueue((old) => old.filter((p) => p.id !== item.id));
        onAdded(saved);
      }
      setNotice(`${count} foto caricate nel rilievo.`);
    } catch (e) {
      setError(
        `${count ? `${count} foto già caricate. ` : ""}${e instanceof Error ? e.message : "Caricamento non riuscito."} Le foto rimaste sono ancora da inviare; puoi riprovare.`,
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Foto dell’elemento"
      className="space-y-3 rounded-2xl border bg-white p-4"
    >
      <div>
        <h3 className="font-semibold">Foto dell’elemento</h3>
        <p className="mt-1 text-xs text-slate-500">
          Scegli le foto, indica cosa mostrano, poi premi Carica. Le foto
          caricate restano nel rilievo anche se annulli le modifiche alle
          misure.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-xl gap-2"
          disabled={disabled || busy || !!placement}
          onClick={() => camera.current?.click()}
        >
          <Camera className="h-4 w-4" />
          Scatta foto
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-xl gap-2"
          disabled={disabled || busy || !!placement}
          onClick={() => gallery.current?.click()}
        >
          <Images className="h-4 w-4" />
          Galleria
        </Button>
      </div>
      <input
        ref={camera}
        type="file"
        aria-label="Scatta foto dell’elemento"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={disabled || busy || !!placement}
        onChange={(e) => {
          select(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={gallery}
        type="file"
        aria-label="Scegli foto dell’elemento"
        accept="image/*"
        multiple
        className="hidden"
        disabled={disabled || busy || !!placement}
        onChange={(e) => {
          select(e.target.files);
          e.target.value = "";
        }}
      />
      {queue.length > 0 && (
        <div className="space-y-3 rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-orange-900">
            {queue.length} foto da caricare. I file non sono inclusi nella bozza
            recuperabile: caricali o rimuovili prima di chiudere.
          </p>
          {queue.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-2"
            >
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm">{item.file.name}</p>
                <QueuedPhotoPreview
                  item={item}
                  enabled={allowPlacement && !disabled && !busy && !placement}
                  onPlace={(url) =>
                    setPlacement({
                      context,
                      url,
                      name: item.file.name,
                      queueId: item.id,
                    })
                  }
                />
                {item.annotations && (
                  <p className="text-xs text-blue-800">
                    Copia illustrativa · originale conservato · non conta come
                    foto tecnica richiesta.
                  </p>
                )}
                {queue.some((p) => p.sourceQueueId === item.id) && (
                  <p className="text-xs text-slate-500">
                    Per rimuovere l’originale, rimuovi prima la sua proposta.
                  </p>
                )}
                {!item.annotations && (
                  <Select
                    value={item.key}
                    disabled={disabled || busy || !!placement}
                    onValueChange={(key) =>
                      setQueue((old) =>
                        old.map((p) => (p.id === item.id ? { ...p, key } : p)),
                      )
                    }
                  >
                    <SelectTrigger
                      className="h-11 rounded-xl"
                      aria-label={`Cosa mostra ${item.file.name}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="free">
                        Particolare / foto libera
                      </SelectItem>
                      {checklist.map((p) => (
                        <SelectItem key={p.key} value={p.key}>
                          {p.label}
                          {p.required ? " · richiesta" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 rounded-xl"
                disabled={
                  disabled ||
                  busy ||
                  !!placement ||
                  queue.some((p) => p.sourceQueueId === item.id)
                }
                aria-label={`Rimuovi ${item.file.name}`}
                onClick={() =>
                  setQueue((old) => old.filter((p) => p.id !== item.id))
                }
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            className="min-h-11 w-full rounded-xl gap-2"
            disabled={disabled || busy || !!placement}
            onClick={() => void upload()}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Caricamento…" : `Carica ${queue.length} foto nel rilievo`}
          </Button>
        </div>
      )}
      {placement && (
        <SurveyPhotoPlacementEditor
          key={`${context}:${placement.queueId || placement.mediaId}`}
          source={placement}
          initialKind={placementKind}
          disabled={disabled || busy}
          onCancel={() => setPlacement(null)}
          onSave={(file, annotations) => {
            if (currentContext.current !== context || disabled) return;
            setQueue((old) => [
              ...old,
              {
                id: crypto.randomUUID(),
                file,
                key: "free",
                context,
                annotations,
                sourceQueueId: placement.queueId,
              },
            ]);
            setPlacement(null);
            setNotice(
              "Proposta pronta: premi Carica per conservarla nel rilievo e nel PDF. L’originale resta separato.",
            );
          }}
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-800">
          {notice}
        </p>
      )}
      <SurveyMediaGallery
        media={media.filter(
          (m) =>
            m.element_id === element.id &&
            ["photo", "annotated_photo", "sketch"].includes(m.type),
        )}
        emptyText="Nessuna foto per questo elemento."
      />
      {allowPlacement &&
        media
          .filter(
            (m) =>
              m.element_id === element.id &&
              m.type === "photo" &&
              surveyMediaUrl(m.url),
          )
          .map((m) => (
            <Button
              key={`place-${m.id}`}
              type="button"
              variant="outline"
              className="min-h-11 w-full justify-start rounded-xl text-xs"
              disabled={disabled || busy || !!placement}
              onClick={() =>
                setPlacement({
                  context,
                  url: surveyMediaUrl(m.url)!,
                  name: m.filename || "Foto del rilievo",
                  mediaId: m.id,
                })
              }
            >
              Posiziona impianto · {m.filename || m.checklist_label || "Foto"}
            </Button>
          ))}
    </section>
  );
}
