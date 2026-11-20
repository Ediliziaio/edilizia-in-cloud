"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const ease = [0.22, 1, 0.36, 1] as const;

interface ProgressiveFluxLoaderProps {
  label: string;
  value?: number;
  active?: boolean;
  ariaLabel?: string;
  className?: string;
}

/** Progress values come from the job. An unknown total uses a sweep without an invented percentage. */
export function ProgressiveFluxLoader({ label, value, active = true, ariaLabel = "Avanzamento analisi", className }: ProgressiveFluxLoaderProps) {
  const reduced = useReducedMotion();
  const percent = value != null && Number.isFinite(value) ? Math.floor(Math.max(0, Math.min(100, value))) : undefined;
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex min-h-6 items-center justify-between gap-3 overflow-hidden text-sm">
        <AnimatePresence initial={false} mode="wait">
          <motion.span key={label} className="text-sm font-medium" aria-hidden
            initial={reduced ? false : { opacity: 0, y: 6, filter: "blur(3px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduced ? undefined : { opacity: 0, y: -5, filter: "blur(2px)" }}
            transition={{ duration: reduced ? 0 : 0.22, ease }}>
            {label}
          </motion.span>
        </AnimatePresence>
        {percent !== undefined && <span className="font-semibold tabular-nums text-foreground" aria-hidden>{percent}%</span>}
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={ariaLabel}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
        aria-valuetext={percent === undefined ? label : `${percent}% · ${label}`}>
        {percent === undefined ? (
          <motion.div className="h-full w-2/5 rounded-full bg-gradient-to-r from-primary to-eic-orange"
            animate={reduced || !active ? { x: "75%" } : { x: ["-100%", "250%"] }}
            transition={reduced || !active ? { duration: 0 } : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }} />
        ) : (
          <motion.div className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-primary via-eic-navy to-eic-orange"
            initial={false} animate={{ width: `${percent}%` }} transition={{ duration: reduced ? 0 : 0.55, ease }}>
            {!reduced && active && <motion.span aria-hidden className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/60 to-transparent"
              animate={{ x: ["-105%", "215%"] }} transition={{ duration: 1.65, repeat: Infinity, ease: "linear" }} />}
          </motion.div>
        )}
      </div>
    </div>
  );
}
