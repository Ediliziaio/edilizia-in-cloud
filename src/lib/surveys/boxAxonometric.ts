/** Original dimensioned axonometry based on the survey, not a copied catalog image.
 * L/H/P describe the box; C is the full measured depth of the inspection lid.
 * Positions of trims/hatches are illustrative, never manufacturing tolerances. */
export type SketchPoint = [number, number];
export type BoxAxonometric = {
  /** Reference geometry is deliberately not to scale; dimensions remain surveyed values. */
  illustrative?: boolean;
  reference?: BoxAxonometric;
  warnings: string[];
  viewBox: [number, number, number, number];
  faces: { key: string; points: SketchPoint[] }[];
  lines: { points: SketchPoint[]; dashed?: boolean }[];
  dimensions: {
    from: SketchPoint;
    to: SketchPoint;
    at: SketchPoint;
    text: string;
  }[];
  notes: string[];
};
export function boxFaceColor(face: string, color = "#f8fafc") {
  const hex = /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : "f8fafc";
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `#${rgb
    .map((v) =>
      Math.round(
        face === "top"
          ? v + (255 - v) * 0.18
          : v * (face === "side" ? 0.88 : face === "lid" ? 0.83 : 1),
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
export function boxAxonometric(
  length: number,
  height: number,
  depth: number | null,
  lidDepth: number | null,
  lidWidth: number | null,
  inspection: string,
  mode: "measured" | "reference" = "measured",
): BoxAxonometric | null {
  if (
    ![length, height, depth].every(
      (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
    )
  )
    return null;
  const valid = (v: number | null) =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
  const C = valid(lidDepth),
    lidL = valid(lidWidth);
  const unit = 1000 / Math.max(length, height, depth!, C ?? 0, lidL ?? 0);
  const illustrative = mode === "reference";
  const L = illustrative ? 1000 : length * unit,
    H = illustrative ? 210 : height * unit,
    P = illustrative ? 230 : depth! * unit;
  // An unmeasured lid is only an explicitly labelled reference outline, never a value.
  const c = illustrative ? 310 : C === null ? null : C * unit;
  const lidLength = illustrative ? L : lidL === null ? L : lidL * unit;
  // Long front edge rises to the right, depth recedes to the left: same readable
  // front/top/side arrangement as the user's reference, without a fake perspective scale.
  const p = (x: number, y: number, z: number): SketchPoint => [
    x * 0.94 - y * 0.78,
    -x * 0.25 - y * 0.32 - z,
  ];
  const face = (key: string, points: SketchPoint[]) => ({ key, points });
  const faces = [
    ...(c === null
      ? []
      : [
          face("lid", [
            p(0, 0, 0),
            p(lidLength, 0, 0),
            p(lidLength, c, 0),
            p(0, c, 0),
          ]),
        ]),
    face("side", [p(0, 0, 0), p(0, P, 0), p(0, P, H), p(0, 0, H)]),
    face("top", [p(0, 0, H), p(L, 0, H), p(L, P, H), p(0, P, H)]),
    face("front", [p(0, 0, 0), p(L, 0, 0), p(L, 0, H), p(0, 0, H)]),
  ];
  const trim = Math.min(L, H) * 0.055;
  const lines: BoxAxonometric["lines"] = [
    {
      points: [
        p(trim, 0, trim),
        p(L - trim, 0, trim),
        p(L - trim, 0, H - trim),
        p(trim, 0, H - trim),
        p(trim, 0, trim),
      ],
      dashed:
        !illustrative && inspection !== "frontale" && inspection !== "esterna",
    },
  ];
  const dimensions: BoxAxonometric["dimensions"] = [];
  const dimension = (
    from: SketchPoint,
    to: SketchPoint,
    dx: number,
    dy: number,
    text: string,
    labelDx = 0,
    labelDy = 0,
  ) => {
    const a: SketchPoint = [from[0] + dx, from[1] + dy],
      b: SketchPoint = [to[0] + dx, to[1] + dy];
    lines.push({ points: [from, a] }, { points: [to, b] });
    dimensions.push({
      from: a,
      to: b,
      at: [(a[0] + b[0]) / 2 + labelDx, (a[1] + b[1]) / 2 + labelDy],
      text,
    });
  };
  const fmt = (value: number) =>
    new Intl.NumberFormat("it-IT", {
      maximumFractionDigits: 2,
      useGrouping: false,
    }).format(value);
  dimension(p(0, 0, 0), p(L, 0, 0), 22, 55, `L ${fmt(length)} mm`, 0, 28);
  dimension(p(L, 0, 0), p(L, 0, H), 60, 0, `H ${fmt(height)} mm`, 110, 9);
  dimension(p(L, 0, H), p(L, P, H), 15, -48, `P ${fmt(depth!)} mm`, 0, -19);
  if (c !== null)
    dimension(
      p(0, 0, 0),
      p(0, c, 0),
      -48,
      76,
      C === null ? "C da rilevare" : `C ${fmt(C)} mm`,
      -5,
      31,
    );
  const points = [
    ...faces.flatMap((f) => f.points),
    ...lines.flatMap((l) => l.points),
    ...dimensions.flatMap((d) => [d.from, d.to, d.at]),
  ];
  const minX = Math.min(...points.map(([x]) => x)) - 110,
    minY = Math.min(...points.map(([, y]) => y)) - 55;
  const maxX = Math.max(...points.map(([x]) => x)) + 130,
    maxY = Math.max(...points.map(([, y]) => y)) + 55;
  return {
    illustrative,
    ...(illustrative
      ? {}
      : {
          reference: boxAxonometric(
            length,
            height,
            depth,
            C,
            lidL,
            inspection,
            "reference",
          )!,
        }),
    warnings:
      height >= length
        ? [
            `Altezza H ${fmt(height)} mm maggiore o uguale alla larghezza L ${fmt(length)} mm: verifica le misure del cassonetto. Nessuna correzione automatica.`,
          ]
        : [],
    viewBox: [minX, minY, maxX - minX, maxY - minY],
    faces,
    lines,
    dimensions,
    notes: [
      ...(illustrative
        ? [
            "Schema illustrativo non in scala. Le quote numeriche sono quelle rilevate; il pannello frontale indica la forma, non conferma il lato d’ispezione.",
          ]
        : []),
      "L = larghezza, H = altezza, P = profondità del cassonetto; C = profondità totale del cielino, non la sola sporgenza.",
      ...(C === null
        ? [
            illustrative
              ? "Cielino C da rilevare: sagoma solo illustrativa, profondità non dedotta da P."
              : "Cielino C da rilevare: non rappresentato né calcolato da P.",
          ]
        : []),
      ...(C !== null && lidL === null
        ? [
            "Larghezza cielino non rilevata: estensione lungo L solo illustrativa.",
          ]
        : []),
      ...(inspection || illustrative
        ? []
        : [
            "Ispezione non definita: contorno frontale tratteggiato solo indicativo.",
          ]),
      "Schema di ingombro: cornici, spessori e fissaggi non sono profili esecutivi del produttore.",
    ],
  };
}
