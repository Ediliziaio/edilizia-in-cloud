import { Line, Rect, Svg, Text, View } from "@react-pdf/renderer";
import type { ElementTypeDefinition } from "@/types/surveys";
import { energyIssues, energyKind, type EnergyValues } from "./energySurvey";
import { energyScene } from "./energyDrawing";
export function EnergySurveyPdf({
  type,
  values,
}: {
  type: ElementTypeDefinition;
  values: EnergyValues;
}) {
  const scene = energyScene(type, values),
    scale = Math.min(420 / scene.width, 155 / scene.height),
    left = (480 - scene.width * scale) / 2;
  const checks = [...new Set([...energyIssues(type, values), ...scene.checks])];
  return (
    <View style={{ marginBottom: 10 }}>
      <View
        wrap={false}
        style={{
          borderWidth: 0.5,
          borderColor: "#dbe6f4",
          borderRadius: 8,
          padding: 10,
          marginBottom: 7,
        }}
      >
        <Text style={{ fontSize: 10, color: "#193b63", marginBottom: 6 }}>
          {scene.label.replace(/\u2192/g, "-")}
        </Text>
        <Svg viewBox="0 0 480 200" style={{ width: "100%", height: 200 }}>
          <Rect
            x={left}
            y={12}
            width={scene.width * scale}
            height={scene.height * scale}
            fill="#ffffff"
            stroke="#94a3b8"
            strokeWidth={1}
          />
          {scene.rects.map((r, i) => (
            <Rect
              key={i}
              x={left + r.x * scale}
              y={12 + r.y * scale}
              width={r.w * scale}
              height={r.h * scale}
              fill={
                r.kind === "module"
                  ? "#244b76"
                  : r.kind === "obstacle"
                    ? "#ffedd5"
                    : "#f1f5f9"
              }
              stroke={r.kind === "obstacle" ? "#c2410c" : "#64748b"}
              strokeWidth={0.7}
            />
          ))}
          {scene.rects.map((r, i) => (
            <Text
              key={`text-${i}`}
              x={left + (r.x + r.w / 2) * scale}
              y={12 + (r.y + r.h / 2) * scale + 3}
              textAnchor="middle"
              fill={r.kind === "module" ? "#ffffff" : "#334155"}
              style={{ fontSize: 7 }}
            >
              {r.kind === "obstacle" ? "X" : r.label.slice(0, 24)}
            </Text>
          ))}
          {energyKind(type) === "route" && (
            <Line
              x1={left + 2.3 * scale}
              y1={12 + 1.3 * scale}
              x2={left + 7.7 * scale}
              y2={12 + 1.3 * scale}
              stroke="#2563eb"
              strokeWidth={2}
            />
          )}
          <Text
            x={240}
            y={190}
            textAnchor="middle"
            fill="#475569"
            style={{ fontSize: 8 }}
          >
            {energyKind(type) === "route"
              ? `Tratto ${values.en_length ?? "?"} m`
              : `${scene.width} x ${scene.height} ${scene.unit}`}
          </Text>
        </Svg>
        <Text style={{ fontSize: 7, color: "#64748b", lineHeight: 1.4 }}>
          {scene.caption}
        </Text>
      </View>
      {scene.rects
        .filter((r) => r.kind === "obstacle")
        .map((r, i) => (
          <Text
            key={`obstacle-${i}`}
            style={{
              fontSize: 8,
              color: "#475569",
              lineHeight: 1.4,
              marginBottom: 4,
            }}
          >
            X {r.label}: {r.w} x {r.h} {scene.unit}; da sinistra {r.x}{" "}
            {scene.unit}, dall’alto {r.y} {scene.unit}.
          </Text>
        ))}
      {checks.map((c) => (
        <Text
          key={c}
          style={{
            fontSize: 8,
            color: "#92400e",
            marginBottom: 4,
            lineHeight: 1.4,
          }}
        >
          Da verificare: {c}
        </Text>
      ))}
    </View>
  );
}
