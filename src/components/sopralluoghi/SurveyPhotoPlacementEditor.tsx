import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  PHOTO_COMPONENTS,
  constrainPlacement,
  equipmentArtworkUrl,
  loadPlacementImage,
  placementBox,
  renderPhotoPlacement,
  type PhotoComponentKind,
  type PhotoPlacement,
  type PhotoPlacementDocument,
} from "@/lib/surveys/photoPlacement";

export type PlacementSource = {
  url: string;
  name: string;
  mediaId?: string;
  queueId?: string;
};
export function SurveyPhotoPlacementEditor({
  source,
  initialKind = "split",
  disabled = false,
  onCancel,
  onSave,
}: {
  source: PlacementSource;
  initialKind?: PhotoComponentKind;
  disabled?: boolean;
  onCancel: () => void;
  onSave: (file: File, annotations: PhotoPlacementDocument) => void;
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(
      null,
    ),
    [items, setItems] = useState<PhotoPlacement[]>([]),
    [selected, setSelected] = useState(""),
    [kind, setKind] = useState(initialKind),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const alive = useRef(true),
    saving = useRef(false),
    svg = useRef<SVGSVGElement>(null),
    drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  useEffect(() => {
    alive.current = true;
    void loadPlacementImage(source.url)
      .then((image) => {
        if (alive.current)
          setSize({ width: image.naturalWidth, height: image.naturalHeight });
      })
      .catch((e) => {
        if (alive.current) setError((e as Error).message);
      });
    return () => {
      alive.current = false;
    };
  }, [source.url]);
  const aspect = size ? size.width / size.height : 1,
    active = items.find((i) => i.id === selected),
    locked = disabled || busy;
  function update(id: string, patch: Partial<PhotoPlacement>) {
    if (locked) return;
    setItems((old) =>
      old.map((p) =>
        p.id === id ? constrainPlacement({ ...p, ...patch }, aspect) : p,
      ),
    );
  }
  function point(event: PointerEvent) {
    const rect = svg.current!.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }
  async function save() {
    if (saving.current || locked || !items.length || !size) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const document: PhotoPlacementDocument = {
        version: 1,
        kind: "equipment-placement",
        sourceMediaId: source.mediaId || null,
        originalFilename: source.name,
        note,
        items,
        notToScale: true,
      };
      const file = await renderPhotoPlacement(source.url, document);
      if (alive.current) onSave(file, document);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      saving.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section
      aria-label="Posizionamento sulla foto"
      className="min-w-0 space-y-3 rounded-2xl border border-blue-200 bg-white p-3 sm:p-4"
    >
      <div>
        <h3 className="font-semibold">Prova la posizione sulla foto</h3>
        <p className="mt-1 text-xs text-slate-500">
          Aggiungi il componente, poi toccalo o trascinalo nella posizione
          prevista. L’originale non viene modificato.
        </p>
      </div>
      {size ? (
        <svg
          ref={svg}
          viewBox={`0 0 1000 ${1000 / aspect}`}
          role="img"
          aria-label="Foto con posizione proposta dei componenti"
          className="block w-full touch-none select-none rounded-xl border bg-slate-50"
          onPointerDown={(event) => {
            if (locked || !active) return;
            const target = (event.target as Element).closest(
              "[data-placement]",
            );
            const found =
              target &&
              items.find((p) => p.id === target.getAttribute("data-placement"));
            const p = point(event);
            if (found) {
              setSelected(found.id);
              drag.current = {
                id: found.id,
                dx: p.x - found.x,
                dy: p.y - found.y,
              };
            } else {
              update(active.id, p);
              drag.current = { id: active.id, dx: 0, dy: 0 };
            }
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drag.current || locked) return;
            const p = point(event);
            update(drag.current.id, {
              x: p.x - drag.current.dx,
              y: p.y - drag.current.dy,
            });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
        >
          <image
            href={source.url}
            x="0"
            y="0"
            width="1000"
            height={1000 / aspect}
          />
          {items.map((p, i) => {
            const box = placementBox(p, aspect),
              w = box.width * 1000,
              h = (box.height * 1000) / aspect;
            return (
              <g
                key={p.id}
                data-placement={p.id}
                transform={`translate(${p.x * 1000} ${(p.y * 1000) / aspect}) rotate(${p.rotation})`}
              >
                <image
                  href={equipmentArtworkUrl(p.kind)}
                  x={-w / 2}
                  y={-h / 2}
                  width={w}
                  height={h}
                />
                <rect
                  x={-w / 2 - 4}
                  y={-h / 2 - 4}
                  width={w + 8}
                  height={h + 8}
                  rx="6"
                  fill="transparent"
                  stroke={p.id === selected ? "#f59e0b" : "#2563eb"}
                  strokeWidth="3"
                  strokeDasharray={p.id === selected ? undefined : "7 5"}
                />
                <text
                  x={-w / 2 + 8}
                  y={-h / 2 + 28}
                  fill="white"
                  stroke="#193b63"
                  strokeWidth="4"
                  paintOrder="stroke"
                  fontSize="28"
                >
                  {i + 1}
                </text>
              </g>
            );
          })}
        </svg>
      ) : (
        !error && (
          <p role="status" className="text-sm">
            Apro la foto…
          </p>
        )
      )}
      <p className="text-xs text-orange-900">
        Proposta illustrativa non in scala: non verifica fattibilità, distanze
        di posa o dimensionamento.
      </p>
      <fieldset disabled={locked || !size} className="space-y-3">
        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          aria-label="Tipo componente sulla foto"
        >
          {(Object.keys(PHOTO_COMPONENTS) as PhotoComponentKind[]).map(
            (key) => (
              <Button
                type="button"
                key={key}
                variant={kind === key ? "secondary" : "outline"}
                aria-pressed={kind === key}
                className="min-h-11 rounded-xl px-2 text-xs"
                onClick={() => setKind(key)}
              >
                {PHOTO_COMPONENTS[key].label}
              </Button>
            ),
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full rounded-xl"
          disabled={items.length >= 12 || locked || !size}
          onClick={() => {
            const id = crypto.randomUUID();
            setItems((old) => [
              ...old,
              constrainPlacement(
                {
                  id,
                  kind,
                  x: 0.5,
                  y: 0.5,
                  width: 0.32,
                  rotation: 0,
                  label: PHOTO_COMPONENTS[kind].label,
                },
                aspect,
              ),
            ]);
            setSelected(id);
          }}
        >
          + Aggiungi {PHOTO_COMPONENTS[kind].label.toLowerCase()}
        </Button>
        {items.length > 0 && (
          <div
            className="flex flex-wrap gap-2"
            aria-label="Componenti inseriti"
          >
            {items.map((p, i) => (
              <Button
                type="button"
                variant={selected === p.id ? "secondary" : "outline"}
                className="min-h-11 max-w-full truncate rounded-xl text-xs"
                key={p.id}
                onClick={() => setSelected(p.id)}
              >
                {i + 1}. {p.label || PHOTO_COMPONENTS[p.kind].label}
              </Button>
            ))}
          </div>
        )}
        {active && (
          <div className="space-y-3 rounded-xl bg-slate-50 p-3">
            <label className="block text-xs">
              Nome / posizione
              <Input
                aria-label="Nome del componente sulla foto"
                maxLength={70}
                value={active.label}
                onChange={(e) => update(active.id, { label: e.target.value })}
                className="mt-1 min-h-11 rounded-xl"
              />
            </label>
            <label className="block text-xs">
              Dimensione visiva · {Math.round(active.width * 100)}% della foto
              <input
                aria-label="Dimensione visiva del componente"
                type="range"
                min="8"
                max="75"
                value={active.width * 100}
                onChange={(e) =>
                  update(active.id, { width: Number(e.target.value) / 100 })
                }
                className="block h-11 w-full accent-blue-600"
              />
            </label>
            <label className="block text-xs">
              Rotazione · {Math.round(active.rotation)}°
              <input
                aria-label="Rotazione del componente"
                type="range"
                min="-45"
                max="45"
                value={active.rotation}
                onChange={(e) =>
                  update(active.id, { rotation: Number(e.target.value) })
                }
                className="block h-11 w-full accent-blue-600"
              />
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                ["←", -0.02, 0],
                ["↑", 0, -0.02],
                ["↓", 0, 0.02],
                ["→", 0.02, 0],
              ].map(([label, dx, dy]) => (
                <Button
                  type="button"
                  key={label}
                  variant="outline"
                  className="min-h-11 rounded-xl"
                  aria-label={`Sposta componente ${label}`}
                  onClick={() =>
                    update(active.id, {
                      x: active.x + Number(dx),
                      y: active.y + Number(dy),
                    })
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 text-red-800"
              onClick={() => {
                setItems((old) => old.filter((p) => p.id !== active.id));
                setSelected(items.find((p) => p.id !== active.id)?.id || "");
              }}
            >
              Rimuovi componente selezionato
            </Button>
          </div>
        )}
        <label className="block text-xs">
          Note di posizionamento
          <Textarea
            aria-label="Note di posizionamento"
            maxLength={400}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Es. Sopra la porta, passaggio tubi da verificare…"
            className="mt-1 rounded-xl"
          />
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-xl"
          aria-label="Annulla fotoinserimento"
          disabled={busy}
          onClick={onCancel}
        >
          Annulla
        </Button>
        <Button
          type="button"
          className="min-h-11 rounded-xl"
          aria-label="Usa questa proposta"
          disabled={locked || !size || !items.length}
          onClick={() => void save()}
        >
          {busy ? "Preparo la copia…" : "Usa proposta"}
        </Button>
      </div>
    </section>
  );
}
