"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

/**
 * ImageGeneration — wrapper con "velo" sfocato che si rivela progressivamente
 * sull'immagine (effetto generazione AI, stile ChatGPT/21st.dev).
 *
 * Modalità CONTROLLATA (consigliata): passa `status` ("generating" | "completed")
 * per pilotarlo dallo stato reale di un job → resta sfocato finché l'immagine
 * non è pronta, poi la rivela. Senza `status` usa un timer demo.
 */
export interface ImageGenerationProps {
  children: React.ReactNode;
  status?: "generating" | "completed";
  className?: string;
}

export const ImageGeneration = ({ children, status, className }: ImageGenerationProps) => {
  const controlled = status !== undefined;
  const [progress, setProgress] = React.useState(controlled && status === "completed" ? 100 : 0);
  const [loadingState, setLoadingState] = React.useState<"starting" | "generating" | "completed">(
    controlled ? (status === "completed" ? "completed" : "generating") : "starting",
  );
  const duration = 30000;

  // Modalità controllata: segue lo stato reale. Reveal rapido alla fine.
  React.useEffect(() => {
    if (!controlled) return;
    if (status === "completed") {
      setLoadingState("completed");
      const start = Date.now();
      const revealMs = 1800;
      const iv = window.setInterval(() => {
        const p = Math.min(100, ((Date.now() - start) / revealMs) * 100);
        setProgress(p);
        if (p >= 100) window.clearInterval(iv);
      }, 16);
      return () => window.clearInterval(iv);
    }
    setLoadingState("generating");
    setProgress(0);
  }, [controlled, status]);

  // Modalità demo (solo se non controllata).
  React.useEffect(() => {
    if (controlled) return;
    const startingTimeout = window.setTimeout(() => {
      setLoadingState("generating");
      const startTime = Date.now();
      const interval = window.setInterval(() => {
        const p = Math.min(100, ((Date.now() - startTime) / duration) * 100);
        setProgress(p);
        if (p >= 100) {
          window.clearInterval(interval);
          setLoadingState("completed");
        }
      }, 16);
      return () => window.clearInterval(interval);
    }, 3000);
    return () => window.clearTimeout(startingTimeout);
  }, [controlled, duration]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <motion.span
        className="bg-[linear-gradient(110deg,#94a3b8,35%,#0f172a,50%,#94a3b8,75%,#94a3b8)] bg-[length:200%_100%] bg-clip-text text-transparent text-sm font-medium"
        initial={{ backgroundPosition: "200% 0" }}
        animate={{ backgroundPosition: loadingState === "completed" ? "0% 0" : "-200% 0" }}
        transition={{ repeat: loadingState === "completed" ? 0 : Infinity, duration: 3, ease: "linear" }}
      >
        {loadingState === "starting" && "Preparo la grafica…"}
        {loadingState === "generating" && "Sto creando l'immagine… (pochi secondi)"}
        {loadingState === "completed" && "Immagine pronta ✨"}
      </motion.span>
      <div className="relative rounded-xl border border-slate-200 bg-white max-w-md overflow-hidden">
        {children}
        <motion.div
          className="absolute w-full h-[125%] -top-[25%] pointer-events-none backdrop-blur-3xl"
          initial={false}
          animate={{
            clipPath: `polygon(0 ${progress}%, 100% ${progress}%, 100% 100%, 0 100%)`,
            opacity: loadingState === "completed" && progress >= 100 ? 0 : 1,
          }}
          style={{
            clipPath: `polygon(0 ${progress}%, 100% ${progress}%, 100% 100%, 0 100%)`,
            maskImage:
              progress === 0
                ? "linear-gradient(to bottom, black -5%, black 100%)"
                : `linear-gradient(to bottom, transparent ${progress - 5}%, transparent ${progress}%, black ${progress + 5}%)`,
            WebkitMaskImage:
              progress === 0
                ? "linear-gradient(to bottom, black -5%, black 100%)"
                : `linear-gradient(to bottom, transparent ${progress - 5}%, transparent ${progress}%, black ${progress + 5}%)`,
          }}
        />
      </div>
    </div>
  );
};

ImageGeneration.displayName = "ImageGeneration";

export default ImageGeneration;
