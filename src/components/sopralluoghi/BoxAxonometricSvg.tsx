import {
  boxFaceColor,
  type BoxAxonometric,
} from "@/lib/surveys/boxAxonometric";
export function BoxAxonometricSvg({
  sketch,
  color,
}: {
  sketch: BoxAxonometric;
  color?: string;
}) {
  return (
    <svg
      viewBox={sketch.viewBox.join(" ")}
      role="img"
      aria-label={`Cassonetto in assonometria. ${sketch.illustrative ? "Schema illustrativo non in scala. " : "Proporzioni rilevate. "}${sketch.dimensions.map((d) => d.text).join(", ")}`}
      className="block w-full"
      style={{ maxHeight: sketch.illustrative ? 340 : 260 }}
    >
      {sketch.faces.map((f) => (
        <polygon
          key={f.key}
          points={f.points.map((p) => p.join(",")).join(" ")}
          fill={boxFaceColor(f.key, color)}
          stroke="#334155"
          strokeWidth={sketch.illustrative ? 3.5 : 2.5}
          strokeLinejoin="round"
        />
      ))}
      {sketch.lines.map((l, i) => (
        <polyline
          key={i}
          points={l.points.map((p) => p.join(",")).join(" ")}
          stroke={sketch.illustrative ? "#475569" : "#94a3b8"}
          strokeWidth={sketch.illustrative ? 2.5 : 1.2}
          fill="none"
          strokeDasharray={l.dashed ? "8 6" : undefined}
        />
      ))}
      {sketch.dimensions.map((d) => (
        <g key={d.text}>
          <line
            x1={d.from[0]}
            y1={d.from[1]}
            x2={d.to[0]}
            y2={d.to[1]}
            stroke="#64748b"
            strokeWidth={1.5}
          />
          {[d.from, d.to].map(([x, y], i) => (
            <line
              key={i}
              x1={x - 5}
              y1={y - 7}
              x2={x + 5}
              y2={y + 7}
              stroke="#64748b"
              strokeWidth={1.5}
            />
          ))}
          <text
            x={d.at[0]}
            y={d.at[1]}
            fill="#1e3a5f"
            fontSize={42}
            fontFamily="Arial, sans-serif"
            textAnchor="middle"
          >
            {d.text}
          </text>
        </g>
      ))}
    </svg>
  );
}
