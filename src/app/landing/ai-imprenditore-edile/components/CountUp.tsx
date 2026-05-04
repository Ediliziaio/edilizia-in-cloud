import { animate, motion, useInView, useMotionValue, useTransform } from "framer-motion";
import { type CSSProperties, useEffect, useRef } from "react";

type CountUpProps = {
  value?: number;
  label?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
  style?: CSSProperties;
};

const formatter = new Intl.NumberFormat("it-IT", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

export function CountUp({ value, label, prefix = "", suffix = "", decimals = 0, className, style }: CountUpProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (latest) => {
    if (typeof value !== "number") return label ?? "";
    const fixed = decimals > 0 ? Number(latest.toFixed(decimals)) : Math.round(latest);
    return `${prefix}${formatter.format(fixed)}${suffix}`;
  });

  useEffect(() => {
    if (!inView || typeof value !== "number") return;
    const controls = animate(motionValue, value, { duration: 1.1, ease: "easeOut" });
    return () => controls.stop();
  }, [inView, motionValue, value]);

  if (typeof value !== "number") {
    return <span className={className} style={style}>{label}</span>;
  }

  return <motion.span ref={ref} className={className} style={style}>{rounded}</motion.span>;
}
