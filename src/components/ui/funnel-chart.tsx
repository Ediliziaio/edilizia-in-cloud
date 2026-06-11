/**
 * FunnelChart — funnel animato a segmenti concentrici (spring framer-motion).
 * Adattato per EiC: import da framer-motion (non "motion/react"), cn() di
 * progetto, formattazione it-IT, normalizzazione sul MASSIMO dei valori (non
 * sul primo stage: le pipeline reali non sono monotone e un valore > primo
 * stage farebbe overflow del path).
 */
import { motion, useSpring, useTransform } from "framer-motion";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FunnelGradientStop {
  offset: string | number;
  color: string;
}

export interface FunnelChartStage {
  label: string;
  value: number;
  displayValue?: string;
  color?: string;
  gradient?: FunnelGradientStop[];
}

export interface FunnelChartProps {
  data: FunnelChartStage[];
  orientation?: "horizontal" | "vertical";
  color?: string;
  layers?: number;
  className?: string;
  style?: CSSProperties;
  showPercentage?: boolean;
  showValues?: boolean;
  showLabels?: boolean;
  hoveredIndex?: number | null;
  onHoverChange?: (index: number | null) => void;
  formatPercentage?: (pct: number) => string;
  formatValue?: (value: number) => string;
  staggerDelay?: number;
  gap?: number;
  renderPattern?: (id: string, color: string) => ReactNode;
  edges?: "curved" | "straight";
  labelLayout?: "spread" | "grouped";
  labelOrientation?: "vertical" | "horizontal";
  labelAlign?: "center" | "start" | "end";
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const fmtPct = (p: number) => `${Math.round(p)}%`;
const fmtVal = (v: number) => v.toLocaleString("it-IT");

const springConfig = { stiffness: 120, damping: 20, mass: 1 };
const hoverSpring = { stiffness: 300, damping: 24 };

// ─── SVG Helpers ─────────────────────────────────────────────────────────────

function hSegmentPath(
  normStart: number,
  normEnd: number,
  segW: number,
  H: number,
  layerScale: number,
  straight = false,
) {
  const my = H / 2;
  const h0 = normStart * H * 0.44 * layerScale;
  const h1 = normEnd * H * 0.44 * layerScale;

  if (straight) {
    return `M 0 ${my - h0} L ${segW} ${my - h1} L ${segW} ${my + h1} L 0 ${my + h0} Z`;
  }

  const cx = segW * 0.55;
  const top = `M 0 ${my - h0} C ${cx} ${my - h0}, ${segW - cx} ${my - h1}, ${segW} ${my - h1}`;
  const bot = `L ${segW} ${my + h1} C ${segW - cx} ${my + h1}, ${cx} ${my + h0}, 0 ${my + h0}`;
  return `${top} ${bot} Z`;
}

function vSegmentPath(
  normStart: number,
  normEnd: number,
  segH: number,
  W: number,
  layerScale: number,
  straight = false,
) {
  const mx = W / 2;
  const w0 = normStart * W * 0.44 * layerScale;
  const w1 = normEnd * W * 0.44 * layerScale;

  if (straight) {
    return `M ${mx - w0} 0 L ${mx - w1} ${segH} L ${mx + w1} ${segH} L ${mx + w0} 0 Z`;
  }

  const cy = segH * 0.55;
  const left = `M ${mx - w0} 0 C ${mx - w0} ${cy}, ${mx - w1} ${segH - cy}, ${mx - w1} ${segH}`;
  const right = `L ${mx + w1} ${segH} C ${mx + w1} ${segH - cy}, ${mx + w0} ${cy}, ${mx + w0} 0`;
  return `${left} ${right} Z`;
}

// ─── Animated Ring ───────────────────────────────────────────────────────────

function Ring({
  d,
  color,
  fill,
  opacity,
  hovered,
  ringIndex,
  totalRings,
  axis,
}: {
  d: string;
  color: string;
  fill?: string;
  opacity: number;
  hovered: boolean;
  ringIndex: number;
  totalRings: number;
  axis: "x" | "y";
}) {
  const extraScale = 1 + (ringIndex / Math.max(totalRings - 1, 1)) * 0.12;
  const ringSpring = {
    stiffness: 300 - ringIndex * 60,
    damping: 24 - ringIndex * 3,
  };
  const scale = useSpring(1, ringSpring);

  useEffect(() => {
    scale.set(hovered ? extraScale : 1);
  }, [hovered, scale, extraScale]);

  return (
    <motion.path
      d={d}
      fill={fill ?? color}
      opacity={opacity}
      style={axis === "y"
        ? { scaleY: scale, transformOrigin: "center center" }
        : { scaleX: scale, transformOrigin: "center center" }}
    />
  );
}

// ─── Animated Segment ────────────────────────────────────────────────────────

function Segment({
  index,
  normStart,
  normEnd,
  segMain,
  fullCross,
  color,
  layers,
  staggerDelay,
  hovered,
  dimmed,
  renderPattern,
  straight,
  gradientStops,
  horizontal,
}: {
  index: number;
  normStart: number;
  normEnd: number;
  segMain: number;
  fullCross: number;
  color: string;
  layers: number;
  staggerDelay: number;
  hovered: boolean;
  dimmed: boolean;
  renderPattern?: (id: string, color: string) => ReactNode;
  straight: boolean;
  gradientStops?: FunnelGradientStop[];
  horizontal: boolean;
}) {
  const patternId = `funnel-${horizontal ? "h" : "v"}-pattern-${index}`;
  const gradientId = `funnel-${horizontal ? "h" : "v"}-grad-${index}`;
  const growProgress = useSpring(0, springConfig);
  const entranceScaleX = useTransform(growProgress, [0, 1], [0, 1]);
  const entranceScaleY = useTransform(growProgress, [0, 1], [0, 1]);
  const dimOpacity = useSpring(1, hoverSpring);

  useEffect(() => {
    dimOpacity.set(dimmed ? 0.4 : 1);
  }, [dimmed, dimOpacity]);

  useEffect(() => {
    const timeout = setTimeout(
      () => growProgress.set(1),
      index * staggerDelay * 1000,
    );
    return () => clearTimeout(timeout);
  }, [growProgress, index, staggerDelay]);

  const W = horizontal ? segMain : fullCross;
  const H = horizontal ? fullCross : segMain;

  const rings = Array.from({ length: layers }, (_, l) => {
    const scale = 1 - (l / layers) * 0.35;
    const opacity = 0.18 + (l / (layers - 1 || 1)) * 0.65;
    return {
      d: horizontal
        ? hSegmentPath(normStart, normEnd, W, H, scale, straight)
        : vSegmentPath(normStart, normEnd, H, W, scale, straight),
      opacity,
    };
  });

  return (
    <motion.div
      className="pointer-events-none relative shrink-0 overflow-visible"
      style={{
        width: W,
        height: H,
        zIndex: hovered ? 10 : 1,
        opacity: dimOpacity,
      }}
    >
      <motion.div
        className="absolute inset-0 overflow-visible"
        style={{
          scaleX: entranceScaleX,
          scaleY: entranceScaleY,
          transformOrigin: horizontal ? "left center" : "center top",
        }}
      >
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full overflow-visible"
          preserveAspectRatio="none"
          role="presentation"
          viewBox={`0 0 ${W} ${H}`}
        >
          <defs>
            {gradientStops && (
              <linearGradient
                id={gradientId}
                x1="0"
                x2={horizontal ? "1" : "0"}
                y1="0"
                y2={horizontal ? "0" : "1"}
              >
                {gradientStops.map((stop) => (
                  <stop
                    key={`${stop.offset}-${stop.color}`}
                    offset={typeof stop.offset === "number" ? `${stop.offset * 100}%` : stop.offset}
                    stopColor={stop.color}
                  />
                ))}
              </linearGradient>
            )}
            {renderPattern?.(patternId, color)}
          </defs>
          {rings.map((r, i) => {
            const isInnermost = i === rings.length - 1;
            let ringFill: string | undefined;
            if (isInnermost && renderPattern) {
              ringFill = `url(#${patternId})`;
            } else if (isInnermost && gradientStops) {
              ringFill = `url(#${gradientId})`;
            }
            return (
              <Ring
                axis={horizontal ? "y" : "x"}
                color={color}
                d={r.d}
                fill={ringFill}
                hovered={hovered}
                key={`ring-${r.opacity.toFixed(2)}`}
                opacity={r.opacity}
                ringIndex={i}
                totalRings={layers}
              />
            );
          })}
        </svg>
      </motion.div>
    </motion.div>
  );
}

// ─── Label Overlay ───────────────────────────────────────────────────────────

function SegmentLabel({
  stage,
  pct,
  isHorizontal,
  showValues,
  showPercentage,
  showLabels,
  formatPercentage,
  formatValue,
  index,
  staggerDelay,
  layout = "spread",
  orientation,
  align = "center",
}: {
  stage: FunnelChartStage;
  pct: number;
  isHorizontal: boolean;
  showValues: boolean;
  showPercentage: boolean;
  showLabels: boolean;
  formatPercentage: (p: number) => string;
  formatValue: (v: number) => string;
  index: number;
  staggerDelay: number;
  layout?: "spread" | "grouped";
  orientation?: "vertical" | "horizontal";
  align?: "center" | "start" | "end";
}) {
  const display = stage.displayValue ?? formatValue(stage.value);

  const valueEl = showValues && (
    <span className="whitespace-nowrap font-semibold text-foreground text-sm">
      {display}
    </span>
  );
  const pctEl = showPercentage && (
    <span className="rounded-full bg-foreground px-2.5 py-0.5 font-bold text-background text-[11px] shadow-sm">
      {formatPercentage(pct)}
    </span>
  );
  const labelEl = showLabels && (
    <span className="whitespace-nowrap font-medium text-muted-foreground text-xs">
      {stage.label}
    </span>
  );

  if (layout === "spread") {
    return (
      <motion.div
        animate={{ opacity: 1 }}
        className={cn(
          "absolute inset-0 flex",
          isHorizontal ? "flex-col items-center" : "flex-row items-center",
        )}
        initial={{ opacity: 0 }}
        transition={{
          delay: index * staggerDelay + 0.25,
          duration: 0.35,
          ease: "easeOut",
        }}
      >
        {isHorizontal ? (
          <>
            <div className="flex h-[16%] items-end justify-center pb-1">{valueEl}</div>
            <div className="flex flex-1 items-center justify-center">{pctEl}</div>
            <div className="flex h-[16%] items-start justify-center pt-1">{labelEl}</div>
          </>
        ) : (
          <>
            <div className="flex w-[16%] items-center justify-end pr-2">{valueEl}</div>
            <div className="flex flex-1 items-center justify-center">{pctEl}</div>
            <div className="flex w-[16%] items-center justify-start pl-2">{labelEl}</div>
          </>
        )}
      </motion.div>
    );
  }

  const resolvedOrientation = orientation ?? (isHorizontal ? "vertical" : "horizontal");
  const isVerticalStack = resolvedOrientation === "vertical";

  const justifyMap = {
    start: "justify-start",
    center: "justify-center",
    end: "justify-end",
  } as const;
  const itemsMap = {
    start: "items-start",
    center: "items-center",
    end: "items-end",
  } as const;

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className={cn(
        "absolute inset-0 flex",
        isHorizontal
          ? cn("flex-col items-center", justifyMap[align])
          : cn("flex-row items-center", justifyMap[align]),
      )}
      initial={{ opacity: 0 }}
      style={{ padding: isHorizontal ? "8% 0" : "0 8%" }}
      transition={{
        delay: index * staggerDelay + 0.25,
        duration: 0.35,
        ease: "easeOut",
      }}
    >
      <div
        className={cn(
          "flex gap-1.5",
          isVerticalStack
            ? cn("flex-col", itemsMap[isHorizontal ? "center" : align])
            : cn("flex-row", itemsMap.center),
        )}
      >
        {valueEl}
        {pctEl}
        {labelEl}
      </div>
    </motion.div>
  );
}

// ─── FunnelChart ─────────────────────────────────────────────────────────────

export function FunnelChart({
  data,
  orientation = "horizontal",
  color = "hsl(var(--chart-1))",
  layers = 3,
  className,
  style,
  showPercentage = true,
  showValues = true,
  showLabels = true,
  hoveredIndex: hoveredIndexProp,
  onHoverChange,
  formatPercentage = fmtPct,
  formatValue = fmtVal,
  staggerDelay = 0.12,
  gap = 4,
  renderPattern,
  edges = "curved",
  labelLayout = "spread",
  labelOrientation,
  labelAlign = "center",
}: FunnelChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [sz, setSz] = useState({ w: 0, h: 0 });
  const [internalHoveredIndex, setInternalHoveredIndex] = useState<number | null>(null);

  const isControlled = hoveredIndexProp !== undefined;
  const hoveredIndex = isControlled ? hoveredIndexProp : internalHoveredIndex;
  const setHoveredIndex = useCallback(
    (index: number | null) => {
      if (isControlled) {
        onHoverChange?.(index);
      } else {
        setInternalHoveredIndex(index);
      }
    },
    [isControlled, onHoverChange],
  );

  const measure = useCallback(() => {
    if (!ref.current) return;
    const { width: w, height: h } = ref.current.getBoundingClientRect();
    if (w > 0 && h > 0) setSz({ w, h });
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [measure]);

  if (!data.length) return null;

  // Normalizza sul massimo (vedi nota in testa al file)
  const max = Math.max(...data.map((d) => d.value), 1);
  const n = data.length;
  const norms = data.map((d) => d.value / max);
  const horiz = orientation === "horizontal";
  const { w: W, h: H } = sz;

  const totalGap = gap * (n - 1);
  const segW = (W - (horiz ? totalGap : 0)) / n;
  const segH = (H - (horiz ? 0 : totalGap)) / n;

  return (
    <div
      className={cn("relative w-full select-none overflow-visible", className)}
      ref={ref}
      style={{
        aspectRatio: horiz ? "2.2 / 1" : "1 / 1.8",
        ...style,
      }}
    >
      {W > 0 && H > 0 && (
        <>
          {/* Segments */}
          <div
            className={cn(
              "absolute inset-0 flex overflow-visible",
              horiz ? "flex-row" : "flex-col",
            )}
            style={{ gap }}
          >
            {data.map((stage, i) => {
              const normStart = norms[i] ?? 0;
              const normEnd = norms[Math.min(i + 1, n - 1)] ?? 0;
              const firstStop = stage.gradient?.[0];
              const segColor = firstStop ? firstStop.color : (stage.color ?? color);

              return (
                <Segment
                  color={segColor}
                  dimmed={hoveredIndex !== null && hoveredIndex !== i}
                  fullCross={horiz ? H : W}
                  gradientStops={stage.gradient}
                  horizontal={horiz}
                  hovered={hoveredIndex === i}
                  index={i}
                  key={stage.label}
                  layers={layers}
                  normEnd={normEnd}
                  normStart={normStart}
                  renderPattern={renderPattern}
                  segMain={horiz ? segW : segH}
                  staggerDelay={staggerDelay}
                  straight={edges === "straight"}
                />
              );
            })}
          </div>

          {/* Label overlays — hover triggers */}
          {data.map((stage, i) => {
            const pct = (stage.value / max) * 100;
            const posStyle: CSSProperties = horiz
              ? { left: (segW + gap) * i, width: segW, top: 0, height: H }
              : { top: (segH + gap) * i, height: segH, left: 0, width: W };
            const isDimmed = hoveredIndex !== null && hoveredIndex !== i;

            return (
              <motion.div
                animate={{ opacity: isDimmed ? 0.4 : 1 }}
                className="absolute cursor-pointer"
                key={`lbl-${stage.label}`}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{ ...posStyle, zIndex: 20 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
              >
                <SegmentLabel
                  align={labelAlign}
                  formatPercentage={formatPercentage}
                  formatValue={formatValue}
                  index={i}
                  isHorizontal={horiz}
                  layout={labelLayout}
                  orientation={labelOrientation}
                  pct={pct}
                  showLabels={showLabels}
                  showPercentage={showPercentage}
                  showValues={showValues}
                  stage={stage}
                  staggerDelay={staggerDelay}
                />
              </motion.div>
            );
          })}
        </>
      )}
    </div>
  );
}

export default FunnelChart;
