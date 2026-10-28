import {
  Circle,
  G,
  Line,
  Path,
  Rect,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ElementTypeDefinition } from "@/types/surveys";
import {
  WINDOW_COMPONENTS,
  readWindowPins,
  windowComponentData,
  windowDisplayValues,
  windowSurveyDrawing,
  windowOrderVerified,
  windowSurveyFinishLabel,
  type DrawingView,
  type WindowComponent,
  type WindowDrawing,
  type WindowValues,
} from "./windowSurvey";
import type { Forma } from "@/lib/serramenti/disegnoSerramento";
import { boxFaceColor, type BoxAxonometric } from "./boxAxonometric";
import { windowAbacoHasDetails } from "./windowAbaco";

/** Native vector rendering of the SAME scene as the quotation/survey screen, not a second geometry engine.
 * Flat technical finishes intentionally omit photorealistic wood patterns and glass reflections. */
export function WindowSurveyPdf({
  type,
  values,
  headerValues,
  heading,
  compact = false,
}: {
  type: ElementTypeDefinition;
  values: WindowValues;
  headerValues?: WindowValues;
  heading?: string;
  compact?: boolean;
}) {
  const components =
    type.key === "infisso"
      ? WINDOW_COMPONENTS.filter(
          ([k]) =>
            k === "primary" ||
            (Array.isArray(values.complementi) &&
              values.complementi.includes(k)),
        )
      : [WINDOW_COMPONENTS[0]];
  const figures = components.flatMap(([component, label]) => {
    const projected = windowComponentData(
      type,
      windowDisplayValues(type, values, headerValues),
      component,
    );
    const views = (["interna", "esterna"] as const).flatMap((view) => {
      const data = windowSurveyDrawing(projected.type, projected.values, view);
      return data ? [{ view, data }] : [];
    });
    return views.length ? [{ component, label, views }] : [];
  });
  return (
    <>
      {figures.map(({ component, label, views }, index) => {
        const firstFigure = index === 0;
        const hasInstallation = views[0].data.installation?.measurements.some(
          (m) => m.value != null,
        );
        const doorDetail = ["portoncino_blindato", "porta_interna"].includes(
          type.key,
        )
          ? views[0].data.detail
          : undefined;
        return (
          <View key={component}>
            <View
              wrap={false}
              style={{
                marginTop: compact ? 6 : 10,
                marginBottom: compact ? 5 : 8,
                padding: 10,
                borderWidth: 0.5,
                borderColor: "#dbe6f4",
                borderRadius: 6,
              }}
            >
              {firstFigure && heading && (
                <Text
                  style={{
                    fontSize: 11,
                    fontFamily: "Helvetica-Bold",
                    color: "#17243a",
                    marginBottom: 9,
                  }}
                >
                  {heading}
                </Text>
              )}
              <Text style={{ fontSize: 10, color: "#1d3e6a", marginBottom: 5 }}>
                {component === "primary" ? type.label : label} - quote in mm
              </Text>
              {views[0].data.axonometric && (
                <View>
                  <Axonometric
                    maxHeight={compact ? 150 : 210}
                    sketch={
                      views[0].data.axonometric.reference ??
                      views[0].data.axonometric
                    }
                    color={
                      views[0].data.internal?.tipo === "legno"
                        ? views[0].data.internal.chiaro
                        : views[0].data.internal?.hex
                    }
                  />
                  <Text style={{ fontSize: 8, color: "#1d3e6a", marginTop: 5 }}>
                    Schema illustrativo non in scala - quote rilevate in mm
                  </Text>
                  <Text style={{ fontSize: 7, color: "#52627a", marginTop: 5 }}>
                    {views[0].data.basis.replaceAll("·", "-")}
                  </Text>
                  <Text style={{ fontSize: 7, color: "#52627a", marginTop: 3 }}>
                    {windowSurveyFinishLabel(
                      windowComponentData(
                        type,
                        windowDisplayValues(type, values, headerValues),
                        component,
                      ).values,
                      "interna",
                    ).replaceAll("·", "-")}
                  </Text>
                  {(
                    views[0].data.axonometric.reference ??
                    views[0].data.axonometric
                  ).notes.map((n) => (
                    <Text
                      key={n}
                      style={{ fontSize: 7, color: "#64748b", marginTop: 3 }}
                    >
                      {n}
                    </Text>
                  ))}
                </View>
              )}
              {(!views[0].data.axonometric ||
                readWindowPins(values).some(
                  (p) => (p.component ?? "primary") === component,
                )) && (
                <View style={{ flexDirection: "row", gap: 14 }}>
                  {views.map(({ view, data }) => (
                    <View
                      key={view}
                      style={{ width: doorDetail ? "31%" : "48%" }}
                    >
                      <Drawing
                        maxHeight={compact ? (hasInstallation ? 90 : 110) : 165}
                        data={data}
                        view={view}
                        values={values}
                        component={component}
                      />
                      <Text
                        style={{ fontSize: 8, color: "#52627a", marginTop: 4 }}
                      >
                        {type.key === "porta_interna"
                          ? view === "esterna"
                            ? "Lato A"
                            : "Lato B"
                          : view === "interna"
                            ? "Da dentro"
                            : "Da fuori"}{" "}
                        - {data.basis.replaceAll("·", "-")}
                      </Text>
                      <Text
                        style={{ fontSize: 7, color: "#52627a", marginTop: 3 }}
                      >
                        {windowSurveyFinishLabel(
                          windowComponentData(
                            type,
                            windowDisplayValues(type, values, headerValues),
                            component,
                          ).values,
                          view,
                        ).replaceAll("·", "-")}
                      </Text>
                    </View>
                  ))}
                  {doorDetail && (
                    <View style={{ width: "31%" }}>
                      <Text
                        style={{
                          fontSize: 8,
                          color: "#1d3e6a",
                          marginBottom: 4,
                        }}
                      >
                        {doorDetail.title.replaceAll("·", "-")}
                      </Text>
                      <Text
                        style={{
                          fontSize: 7,
                          color: "#64748b",
                          textAlign: "center",
                        }}
                      >
                        {doorDetail.labels?.top ??
                          (type.key === "porta_interna" ? "LATO A" : "ESTERNO")}
                      </Text>
                      <Drawing
                        maxHeight={compact ? 90 : 135}
                        data={{ ...views[0].data, scene: doorDetail.scene }}
                        view="interna"
                        values={{}}
                        component={component}
                      />
                      <Text
                        style={{
                          fontSize: 7,
                          color: "#64748b",
                          textAlign: "center",
                        }}
                      >
                        {doorDetail.labels?.bottom ??
                          (type.key === "porta_interna" ? "LATO B" : "INTERNO")}
                      </Text>
                      {!doorDetail.labels && (
                        <Text
                          style={{
                            fontSize: 7,
                            color: "#64748b",
                            marginTop: 4,
                          }}
                        >
                          {doorDetail.caption}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}
              {doorDetail?.labels && (
                <Text style={{ fontSize: 7, color: "#64748b", marginTop: 6 }}>
                  {doorDetail.caption}
                </Text>
              )}
              {views[0].data.detail && !doorDetail && (
                <View style={{ marginTop: 8 }}>
                  <Text
                    style={{ fontSize: 9, color: "#1d3e6a", marginBottom: 4 }}
                  >
                    {views[0].data.detail.title}
                  </Text>
                  {["portoncino_blindato", "porta_interna"].includes(
                    type.key,
                  ) && (
                    <Text
                      style={{
                        width: 150,
                        textAlign: "center",
                        fontSize: 7,
                        color: "#64748b",
                      }}
                    >
                      {views[0].data.detail.labels?.top ??
                        (type.key === "porta_interna" ? "LATO A" : "ESTERNO")}
                    </Text>
                  )}
                  <View style={{ width: 150 }}>
                    <Drawing
                      maxHeight={compact ? 90 : 165}
                      data={{
                        ...views[0].data,
                        scene: views[0].data.detail.scene,
                      }}
                      view="interna"
                      values={{}}
                      component={component}
                    />
                  </View>
                  {["portoncino_blindato", "porta_interna"].includes(
                    type.key,
                  ) && (
                    <Text
                      style={{
                        width: 150,
                        textAlign: "center",
                        fontSize: 7,
                        color: "#64748b",
                      }}
                    >
                      {views[0].data.detail.labels?.bottom ??
                        (type.key === "porta_interna" ? "LATO B" : "INTERNO")}
                    </Text>
                  )}
                  <Text style={{ fontSize: 7, color: "#64748b", marginTop: 4 }}>
                    {views[0].data.detail.caption}
                  </Text>
                </View>
              )}
              <Text style={{ fontSize: 7, color: "#64748b", marginTop: 6 }}>
                {views[0].data.axonometric
                  ? "Assonometria illustrativa non in scala; le altre viste rispettano le proporzioni rilevate. Pannello frontale indicativo, lato d’ispezione da verificare."
                  : "Schema proporzionale, profili illustrativi."}{" "}
                Nessuna tolleranza produttiva dedotta.{" "}
                {windowOrderVerified(values)
                  ? "Quote d’ordine verificate separatamente: qui è rappresentato il rilievo."
                  : "Quote d’ordine non verificate."}
                {readWindowPins(values).length > 0
                  ? " Note numerate nelle verifiche tecniche."
                  : ""}
              </Text>
              {[
                ...new Set(
                  views.flatMap((v) => [
                    ...v.data.warnings,
                    ...(v.data.axonometric?.warnings ?? []),
                  ]),
                ),
              ].map((warning) => (
                <Text
                  key={warning}
                  style={{ fontSize: 7, color: "#9a3412", marginTop: 3 }}
                >
                  {warning}
                </Text>
              ))}
            </View>
            <InstallationPdf data={views[0].data} component={component} />
            <SystemPdf data={views[0].data} component={component} />
            {views[0].data.abaco && windowAbacoHasDetails(values) && (
              <View
                wrap={false}
                style={{
                  marginTop: 6,
                  marginBottom: 8,
                  borderWidth: 0.5,
                  borderColor: "#dbe6f4",
                  borderRadius: 6,
                  padding: 10,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontFamily: "Helvetica-Bold",
                    color: "#17243a",
                    marginBottom: 6,
                  }}
                >
                  Abaco tecnico - misure e posa
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    backgroundColor: "#f4f7fa",
                    padding: 5,
                  }}
                >
                  <Text style={{ width: "50%", fontSize: 8 }}>Riferimento</Text>
                  <Text style={{ width: "25%", fontSize: 8 }}>Larghezza</Text>
                  <Text style={{ width: "25%", fontSize: 8 }}>Altezza</Text>
                </View>
                {views[0].data.abaco.measurements.map((m) => (
                  <View
                    key={m.label}
                    style={{
                      flexDirection: "row",
                      padding: 5,
                      borderBottomWidth: 0.3,
                      borderBottomColor: "#e2e8f0",
                    }}
                  >
                    <Text style={{ width: "50%", fontSize: 8 }}>
                      {m.label.replaceAll("·", "-")}
                    </Text>
                    <Text style={{ width: "25%", fontSize: 8 }}>
                      {m.width == null ? "Da rilevare" : `${m.width} mm`}
                    </Text>
                    <Text style={{ width: "25%", fontSize: 8 }}>
                      {m.height == null ? "Da rilevare" : `${m.height} mm`}
                    </Text>
                  </View>
                ))}
                <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                  {views[0].data.abaco.figures.map((f) => (
                    <View key={f.title} style={{ width: "48%" }}>
                      <Text
                        style={{
                          fontSize: 8,
                          color: "#1d3e6a",
                          marginBottom: 4,
                        }}
                      >
                        {f.title.replaceAll("·", "-")}
                      </Text>
                      <Drawing
                        data={{ ...views[0].data, scene: f.scene }}
                        maxHeight={150}
                        view="interna"
                        values={{}}
                        component={component}
                      />
                      <Text
                        style={{ fontSize: 7, color: "#64748b", marginTop: 4 }}
                      >
                        {f.caption.replaceAll("·", "-")}
                      </Text>
                    </View>
                  ))}
                </View>
                {views[0].data.abaco.notes.map((n) => (
                  <Text
                    key={n}
                    style={{ fontSize: 7, color: "#64748b", marginTop: 4 }}
                  >
                    {n}
                  </Text>
                ))}
              </View>
            )}
          </View>
        );
      })}
      {!figures.length && heading && (
        <Text
          style={{
            fontSize: 11,
            fontFamily: "Helvetica-Bold",
            marginTop: 12,
            marginBottom: 4,
          }}
          minPresenceAhead={45}
        >
          {heading}
        </Text>
      )}
    </>
  );
}
function SystemPdf({
  data,
  component,
}: {
  data: WindowDrawing;
  component: WindowComponent;
}) {
  const system = data.system;
  if (!system) return null;
  return (
    <View
      wrap={false}
      style={{
        marginVertical: 5,
        padding: 8,
        borderWidth: 0.5,
        borderColor: "#dbe6f4",
        borderRadius: 6,
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontFamily: "Helvetica-Bold",
          color: "#17243a",
          marginBottom: 5,
        }}
      >
        {system.title}
      </Text>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {system.figures.map((f) => (
          <View
            key={f.title}
            style={{ width: system.figures.length > 1 ? "48%" : "100%" }}
          >
            <Text style={{ fontSize: 8, color: "#1d3e6a" }}>{f.title}</Text>
            <Drawing
              data={{ ...data, scene: f.scene }}
              maxHeight={105}
              view="interna"
              values={{}}
              component={component}
            />
            <Text style={{ fontSize: 7, color: "#64748b" }}>{f.caption}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 5 }}>
        {system.measurements.map((m) => (
          <Text
            key={m.key}
            style={{
              width: "50%",
              paddingRight: 7,
              fontSize: 8,
              marginBottom: 3,
            }}
          >
            {m.label}: {m.value == null ? "Da rilevare" : `${m.value} mm`}
          </Text>
        ))}
      </View>
      {system.notes.map((n) => (
        <Text key={n} style={{ fontSize: 7, color: "#64748b", marginTop: 3 }}>
          {n}
        </Text>
      ))}
      {system.checks.map((n) => (
        <Text key={n} style={{ fontSize: 7, color: "#9a3412", marginTop: 3 }}>
          {n}
        </Text>
      ))}
    </View>
  );
}
function InstallationPdf({
  data,
  component,
}: {
  data: WindowDrawing;
  component: WindowComponent;
}) {
  const installation = data.installation;
  if (
    !installation ||
    (!installation.measurements.some((m) => m.value != null) &&
      !installation.warnings.length)
  )
    return null;
  return (
    <View
      wrap={false}
      style={{
        marginTop: 4,
        marginBottom: 4,
        padding: 8,
        borderWidth: 0.5,
        borderColor: "#dbe6f4",
        borderRadius: 6,
      }}
    >
      <Text
        style={{
          fontSize: 10,
          color: "#17243a",
          fontFamily: "Helvetica-Bold",
          marginBottom: 5,
        }}
      >
        {installation.title}
      </Text>
      <Text style={{ fontSize: 7, color: "#64748b", marginBottom: 6 }}>
        {installation.caption}
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {installation.sketches.map((s) => (
          <View
            key={s.title}
            style={{
              width: installation.sketches.length === 3 ? "31%" : "48%",
            }}
          >
            <Text style={{ fontSize: 7, color: "#1d3e6a" }}>
              {s.title.replaceAll("·", "-")}
            </Text>
            <Drawing
              data={{ ...data, scene: { ...s.scene, quote: [] } }}
              view="interna"
              maxHeight={38}
              values={{}}
              component={component}
            />
            <Text
              style={{
                fontSize: 8,
                color: "#17243a",
                textAlign: "center",
                marginBottom: 3,
              }}
            >
              {s.scene.quote.map((q) => q.testo).join(" × ")}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 5 }}>
        {installation.measurements.map((m) => (
          <View
            key={m.key}
            style={{ width: "50%", paddingRight: 8, marginBottom: 2 }}
          >
            <Text style={{ fontSize: 7, color: "#64748b" }}>
              {m.label.replaceAll("·", "-")}
            </Text>
            <Text style={{ fontSize: 8, color: "#17243a" }}>
              {m.value == null ? "Da rilevare" : `${m.value} mm`}
            </Text>
          </View>
        ))}
      </View>
      {installation.warnings.map((w) => (
        <Text key={w} style={{ fontSize: 7, color: "#9a3412", marginTop: 3 }}>
          {w}
        </Text>
      ))}
    </View>
  );
}
function Axonometric({
  sketch,
  color,
  maxHeight = 210,
}: {
  sketch: BoxAxonometric;
  color?: string;
  maxHeight?: number;
}) {
  const path = (points: Array<[number, number]>) =>
    points.map(([x, y], i) => `${i ? "L" : "M"} ${x} ${y}`).join(" ");
  return (
    <Svg
      viewBox={sketch.viewBox.join(" ")}
      width="100%"
      height={Math.max(
        100,
        Math.min(maxHeight, (480 * sketch.viewBox[3]) / sketch.viewBox[2]),
      )}
    >
      {sketch.faces.map((f) => (
        <Path
          key={f.key}
          d={`${path(f.points)} Z`}
          fill={boxFaceColor(f.key, color)}
          stroke="#334155"
          strokeWidth={2.5}
        />
      ))}
      {sketch.lines.map((l, i) => (
        <Path
          key={i}
          d={path(l.points)}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={1.2}
          {...(l.dashed ? { strokeDasharray: "8 6" } : {})}
        />
      ))}
      {sketch.dimensions.map((d) => (
        <G key={d.text}>
          <Line
            x1={d.from[0]}
            y1={d.from[1]}
            x2={d.to[0]}
            y2={d.to[1]}
            stroke="#64748b"
            strokeWidth={1.5}
          />
          {[d.from, d.to].map(([x, y], i) => (
            <Line
              key={i}
              x1={x - 5}
              y1={y - 7}
              x2={x + 5}
              y2={y + 7}
              stroke="#64748b"
              strokeWidth={1.5}
            />
          ))}
          <Text
            x={d.at[0]}
            y={d.at[1]}
            textAnchor="middle"
            style={{ fontSize: 42, fill: "#1e3a5f" }}
          >
            {d.text}
          </Text>
        </G>
      ))}
    </Svg>
  );
}
function Drawing({
  data,
  view,
  values,
  component,
  maxHeight = 165,
}: {
  data: WindowDrawing;
  view: DrawingView;
  values: WindowValues;
  component: WindowComponent;
  maxHeight?: number;
}) {
  const s = data.scene,
    W = s.larghezza,
    H = s.altezza,
    u = Math.max(W, H) * 0.1;
  const has = (side: string) => s.quote.some((q) => q.lato === side);
  // Same margins as DisegnoSerramentoSvg (non-compact view), including Z and multiple quote levels.
  const left = Math.max((has("sx") ? u * 1.5 : u) + s.sporgenza, s.sfondo ?? 0);
  const right = Math.max(
    (has("dx") ? u * 1.5 : u) + s.sporgenza,
    s.sfondo ?? 0,
  );
  const top = Math.max(u + s.sporgenza, s.sfondo ?? 0);
  const levels = Math.max(
    0,
    ...s.quote.filter((q) => q.lato === "sotto").map((q) => q.livello ?? 0),
  );
  const bottom = Math.max(
    (has("sotto") ? u * 1.3 : u) + s.sporgenza + levels * u * 0.9,
    s.sfondo ?? 0,
  );
  const vw = W + left + right,
    vh = H + top + bottom;
  const selected = view === "interna" ? data.internal : data.external;
  const color =
    selected?.tipo === "legno" ? selected.chiaro : (selected?.hex ?? "#d4d6d8");
  const ink = "#334155",
    stroke = Math.max(W, H) * 0.0022,
    font =
      Math.max(W, H) * (data.abaco && s.stile === "scheda" ? 0.055 : 0.035);
  const fill = (f: Forma) =>
    ["vetro", "campo"].includes(f.ruolo)
      ? "#d6e9f4"
      : ["simbolo", "lamellaLinea", "pannelloLinea"].includes(f.ruolo)
        ? "none"
        : ["maniglia", "cerniera"].includes(f.ruolo)
          ? "#9ca3af"
          : f.ruolo === "ispezione"
            ? "none"
            : f.ruolo === "parete"
              ? "#e2e8f0"
              : color;
  return (
    <Svg
      viewBox={`${-left} ${-top} ${vw} ${vh}`}
      width="100%"
      height={Math.min(
        maxHeight,
        Math.max(Math.min(80, maxHeight), (165 * vh) / vw),
      )}
    >
      {s.forme.map((f, i) => {
        const style = {
          fill: fill(f),
          stroke: f.ruolo === "simbolo" ? "#d32940" : ink,
          strokeWidth: f.ruolo === "simbolo" ? stroke * 2 : stroke,
        };
        if (f.kind === "rect")
          if (f.ruolo === "rete")
            return (
              <G key={i}>
                <Rect x={f.x} y={f.y} width={f.w} height={f.h} fill="#f7f9fa" />
                {Array.from({ length: 25 }, (_, j) => (
                  <G key={j}>
                    <Line
                      x1={f.x + (f.w * j) / 24}
                      y1={f.y}
                      x2={f.x + (f.w * j) / 24}
                      y2={f.y + f.h}
                      stroke="#9aa5ae"
                      strokeWidth={stroke * 0.3}
                    />
                    <Line
                      x1={f.x}
                      y1={f.y + (f.h * j) / 24}
                      x2={f.x + f.w}
                      y2={f.y + (f.h * j) / 24}
                      stroke="#9aa5ae"
                      strokeWidth={stroke * 0.3}
                    />
                  </G>
                ))}
              </G>
            );
        if (f.kind === "rect")
          return (
            <Rect key={i} x={f.x} y={f.y} width={f.w} height={f.h} {...style} />
          );
        const path = (pts: Array<[number, number]>, closed = true) =>
          `M ${pts.map(([x, y]) => `${x} ${y}`).join(" L ")}${closed ? " Z" : ""}`;
        return (
          <Path
            key={i}
            d={
              path(f.punti, f.kind === "sagoma" || !!f.barra) +
              (f.kind === "sagoma" && f.buco ? ` ${path(f.buco)}` : "")
            }
            fillRule="evenodd"
            {...style}
            {...(f.kind === "poly" && !f.barra ? { fill: "none" } : {})}
            {...(f.kind === "poly" && f.tratteggio
              ? { strokeDasharray: `${stroke * 5} ${stroke * 4}` }
              : {})}
          />
        );
      })}
      {s.quote.map((q, i) => {
        const h = q.orientamento === "h",
          pos = h
            ? H + s.sporgenza + u * (0.5 + (q.livello ?? 0) * 0.9)
            : q.lato === "sx"
              ? -s.sporgenza - u * 0.5
              : W + s.sporgenza + u * 0.5;
        return (
          <G key={i}>
            <Line
              x1={h ? q.da : pos}
              y1={h ? pos : q.da}
              x2={h ? q.a : pos}
              y2={h ? pos : q.a}
              stroke={ink}
              strokeWidth={stroke}
            />
            {[q.da, q.a].map((end, j) => (
              <Line
                key={j}
                x1={h ? end : pos - u * 0.08}
                y1={h ? pos - u * 0.08 : end}
                x2={h ? end : pos + u * 0.08}
                y2={h ? pos + u * 0.08 : end}
                stroke={ink}
                strokeWidth={stroke}
              />
            ))}
            <Text
              x={
                h
                  ? (q.da + q.a) / 2
                  : pos + (q.lato === "sx" ? -u * 0.1 : u * 0.1)
              }
              y={h ? pos + font * 1.2 : (q.da + q.a) / 2}
              textAnchor="middle"
              {...(!h
                ? {
                    transform: `rotate(-90 ${pos + (q.lato === "sx" ? -u * 0.1 : u * 0.1)} ${(q.da + q.a) / 2})`,
                  }
                : {})}
              style={{ fontSize: font, fill: ink }}
            >
              {q.testo}
            </Text>
          </G>
        );
      })}
      {readWindowPins(values).map((p, i) =>
        p.view === view && (p.component ?? "primary") === component ? (
          <G key={p.id}>
            <Circle
              cx={p.x * vw - left}
              cy={p.y * vh - top}
              r={font * 0.65}
              fill="#f97316"
            />
            <Text
              x={p.x * vw - left}
              y={p.y * vh - top + font * 0.3}
              textAnchor="middle"
              style={{ fontSize: font, fill: "#fff" }}
            >
              {i + 1}
            </Text>
          </G>
        ) : null,
      )}
    </Svg>
  );
}
