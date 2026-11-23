import { useState } from "react";
import type { ElementTypeDefinition } from "@/types/surveys";
import {
  energyIssues,
  energyKind,
  type EnergyValues,
} from "@/lib/surveys/energySurvey";
import {
  energyScene,
  energyRects,
  proposeEnergyLayout,
} from "@/lib/surveys/energyDrawing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

export function EnergySurveyVisual({
  type,
  values,
  onChange,
  disabled = false,
}: {
  type: ElementTypeDefinition;
  values: EnergyValues;
  onChange?: (v: EnergyValues) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(0);
  const [obstacle, setObstacle] = useState({
    label: "Ostacolo",
    x: "",
    y: "",
    w: "",
    h: "",
  });
  const scene = energyScene(type, values),
    roof = energyKind(type) === "roof",
    route = energyKind(type) === "route";
  const scale = Math.min(530 / scene.width, 310 / scene.height),
    left = 40,
    top = 25,
    canvasWidth = scene.width * scale + 80,
    canvasHeight = scene.height * scale + 70;
  const obstacles = scene.rects.filter((r) => r.kind === "obstacle");
  const checks = [...new Set([...energyIssues(type, values), ...scene.checks])];
  const act = (work: () => EnergyValues) => {
    try {
      const next = work();
      onChange?.(next);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const editable = !!onChange && !disabled;
  return (
    <section
      aria-label={t("Disegno del rilievo energetico")}
      className="min-w-0 space-y-3 rounded-2xl border bg-white p-3 sm:p-4"
    >
      <div>
        <h3 className="text-sm font-semibold">{t(scene.label)}</h3>
        <p className="text-xs text-slate-500">
          {scene.unit === "m" ? t("Quote in metri") : t("Quote in millimetri")} ·{" "}
          {roof
            ? t("{n} moduli · {kwp} kWp nominali", {
                n: String(values.en_count ?? "?"),
                kwp:
                  typeof values.en_count === "number" &&
                  typeof values.en_module_watt === "number"
                    ? (
                        (values.en_count * values.en_module_watt) /
                        1000
                      ).toLocaleString(intlCampo())
                    : "?",
              })
            : t("Rilievo tecnico")}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
        role="img"
        aria-label={`${t(scene.label)}: ${scene.width} × ${scene.height} ${scene.unit}`}
        className="w-full rounded-xl bg-slate-50"
        style={{ minHeight: 180 }}
      >
        <rect
          x={left}
          y={top}
          width={scene.width * scale}
          height={scene.height * scale}
          fill="white"
          stroke="#94a3b8"
          strokeWidth="1.5"
        />
        {scene.rects.map((r, i) => (
          <g
            key={`${r.kind}-${i}`}
            onClick={
              editable && r.kind === "module" ? () => setSelected(i) : undefined
            }
            style={{
              cursor: editable && r.kind === "module" ? "pointer" : undefined,
            }}
          >
            <rect
              x={left + r.x * scale}
              y={top + r.y * scale}
              width={r.w * scale}
              height={r.h * scale}
              rx="2"
              fill={
                r.kind === "module"
                  ? "#244b76"
                  : r.kind === "obstacle"
                    ? "#ffedd5"
                    : "#f1f5f9"
              }
              stroke={
                r.kind === "obstacle"
                  ? "#c2410c"
                  : editable && r.kind === "module" && i === selected
                    ? "#f59e0b"
                    : "#64748b"
              }
              strokeWidth={
                editable && r.kind === "module" && i === selected ? 3 : 1
              }
            />
            {r.kind === "module" && (
              <>
                <line
                  x1={left + (r.x + r.w / 2) * scale}
                  y1={top + r.y * scale}
                  x2={left + (r.x + r.w / 2) * scale}
                  y2={top + (r.y + r.h) * scale}
                  stroke="#93b4d2"
                  strokeWidth="0.5"
                />
                <line
                  x1={left + r.x * scale}
                  y1={top + (r.y + r.h / 2) * scale}
                  x2={left + (r.x + r.w) * scale}
                  y2={top + (r.y + r.h / 2) * scale}
                  stroke="#93b4d2"
                  strokeWidth="0.5"
                />
              </>
            )}
            <text
              x={left + (r.x + r.w / 2) * scale}
              y={top + (r.y + r.h / 2) * scale + 4}
              textAnchor="middle"
              fill={r.kind === "module" ? "white" : "#334155"}
              fontSize={r.kind === "module" || route ? 20 : 14}
            >
              {r.kind === "obstacle"
                ? "×"
                : r.kind === "module"
                  ? r.label
                  : t(r.label).slice(0, 24)}
            </text>
          </g>
        ))}
        {route && (
          <line
            x1={left + 2.3 * scale}
            y1={top + 1.3 * scale}
            x2={left + 7.7 * scale}
            y2={top + 1.3 * scale}
            stroke="#2563eb"
            strokeWidth="3"
            strokeDasharray="6 4"
          />
        )}
        <text
          x={canvasWidth / 2}
          y={canvasHeight - 14}
          textAnchor="middle"
          fill="#475569"
          fontSize="18"
        >
          {route
            ? t("Lunghezza rilevata: {n} m", { n: String(values.en_length ?? "?") })
            : `${scene.width.toLocaleString(intlCampo())} × ${scene.height.toLocaleString(intlCampo())} ${scene.unit}`}
        </text>
      </svg>
      {obstacles.length > 0 && (
        <ul
          aria-label={t("Quote degli ostacoli")}
          className="space-y-1 text-xs text-slate-600"
        >
          {obstacles.map((r, i) => (
            <li key={i}>
              ×{" "}
              {t(
                "{nome} · {l} × {h} {u} · da sinistra {x} {u}, dall’alto {y} {u}",
                {
                  nome: r.label,
                  l: r.w,
                  h: r.h,
                  u: scene.unit,
                  x: r.x,
                  y: r.y,
                },
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs leading-relaxed text-slate-500">
        {t(scene.caption)}
      </p>
      {editable && roof && (
        <div className="space-y-3 border-t pt-3">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full rounded-xl"
            onClick={() =>
              act(() => ({ ...values, en_layout: proposeEnergyLayout(values) }))
            }
          >
            {t("Disponi i moduli con le misure inserite")}
          </Button>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="mb-2 text-xs font-medium">
              {t("Tocca un modulo e spostalo di 10 cm · selezionato {n}", {
                n: selected + 1,
              })}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {[
                ["←", -0.1, 0],
                ["↑", 0, -0.1],
                ["↓", 0, 0.1],
                ["→", 0.1, 0],
              ].map(([label, dx, dy]) => (
                <Button
                  key={label}
                  type="button"
                  variant="outline"
                  aria-label={t("Sposta modulo {freccia}", { freccia: String(label) })}
                  className="min-h-11"
                  onClick={() =>
                    act(() => {
                      const rows = energyRects(values, "en_layout");
                      if (!rows[selected])
                        throw new Error(t("Prima prepara la disposizione."));
                      return {
                        ...values,
                        en_layout: rows.map((r, i) =>
                          i === selected
                            ? {
                                ...r,
                                x: Math.max(
                                  0,
                                  Math.round((r.x + Number(dx)) * 1000) / 1000,
                                ),
                                y: Math.max(
                                  0,
                                  Math.round((r.y + Number(dy)) * 1000) / 1000,
                                ),
                              }
                            : r,
                        ),
                      };
                    })
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <details className="rounded-xl border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              {t("Ostacoli, lucernari e zone escluse")}
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="col-span-2 text-xs">
                {t("Descrizione")}
                <Input
                  value={obstacle.label}
                  onChange={(e) =>
                    setObstacle({ ...obstacle, label: e.target.value })
                  }
                />
              </label>
              {(
                [
                  ["x", "Distanza da sinistra · m"],
                  ["y", "Distanza dall’alto · m"],
                  ["w", "Larghezza · m"],
                  ["h", "Lunghezza · m"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="text-xs">
                  {t(label)}
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={obstacle[key]}
                    onChange={(e) =>
                      setObstacle({ ...obstacle, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
              <Button
                type="button"
                variant="outline"
                className="col-span-2 min-h-11"
                onClick={() =>
                  act(() => {
                    if (
                      [obstacle.x, obstacle.y, obstacle.w, obstacle.h].some(
                        (s) => !s.trim(),
                      )
                    )
                      throw new Error(
                        t("Compila tutte le quote dell’ostacolo."),
                      );
                    const next = {
                      ...values,
                      en_obstacles: [
                        ...energyRects(values, "en_obstacles"),
                        {
                          ...obstacle,
                          x: Number(obstacle.x),
                          y: Number(obstacle.y),
                          w: Number(obstacle.w),
                          h: Number(obstacle.h),
                        },
                      ],
                    };
                    energyRects(next, "en_obstacles");
                    return next;
                  })
                }
              >
                {t("Aggiungi zona esclusa")}
              </Button>
            </div>
            {energyRectsSafe(values).map((r, i) => (
              <div
                key={i}
                className="mt-2 flex items-center justify-between gap-2 text-xs"
              >
                <span dir="auto">
                  {r.label} · {r.w} × {r.h} m
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    act(() => ({
                      ...values,
                      en_obstacles: energyRects(values, "en_obstacles").filter(
                        (_, n) => n !== i,
                      ),
                    }))
                  }
                >
                  {t("Rimuovi")}
                </Button>
              </div>
            ))}
          </details>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {t(error)}
        </p>
      )}
      {checks.length > 0 && (
        <details className="rounded-xl bg-amber-50 p-3">
          <summary className="cursor-pointer text-xs font-medium text-amber-950">
            {t("{n} verifiche aperte · nessuna approvazione automatica", {
              n: checks.length,
            })}
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-950">
            {checks.map((c) => (
              <li key={c}>{t(c)}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
function energyRectsSafe(v: EnergyValues) {
  try {
    return energyRects(v, "en_obstacles");
  } catch {
    return [];
  }
}
