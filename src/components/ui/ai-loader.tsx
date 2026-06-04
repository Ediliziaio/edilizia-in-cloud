import * as React from "react";
import { cn } from "@/lib/utils";

interface LoaderProps {
  /** Diametro dell'orbita rotante (px). Clamp 22–44. Default 36. */
  size?: number;
  text?: string;
  /** A tutto schermo (overlay chiaro) invece che inline. Default: false. */
  fullscreen?: boolean;
  className?: string;
}

/**
 * AiLoader — loader brandizzato: orbita arancio rotante ACCANTO al testo con
 * lettere animate (TEMA CHIARO). L'orbita e il testo sono su una riga separata
 * (niente sovrapposizione). Pensato per l'attesa delle risposte di Silvio AI.
 *
 * Nota: in Vite si usa un tag <style> normale (lo `<style jsx>` di Next non esiste).
 */
export const AiLoader: React.FC<LoaderProps> = ({
  size = 36,
  text = "Silvio sta pensando",
  fullscreen = false,
  className,
}) => {
  const letters = Array.from(text);
  const orb = Math.min(Math.max(size, 22), 44);

  const inner = (
    <div className="flex items-center gap-2.5 select-none">
      {/* Orbita che gira (separata dal testo) */}
      <div
        className="shrink-0 rounded-full animate-silvioLoaderCircle"
        style={{ width: orb, height: orb }}
        aria-hidden
      />
      {/* Testo con lettere animate */}
      <div className="flex">
        {letters.map((letter, index) => (
          <span
            key={index}
            className="inline-block whitespace-pre text-sm font-medium text-slate-500 opacity-50 animate-silvioLoaderLetter"
            style={{ animationDelay: `${index * 0.06}s` }}
          >
            {letter}
          </span>
        ))}
      </div>
      <style>{`
        @keyframes silvioLoaderCircle {
          0%   { transform: rotate(90deg);  box-shadow: 0 4px 10px 0 #fdba74 inset, 0 8px 14px 0 #f97316 inset, 0 16px 18px 0 #fb923c inset, 0 0 3px 1px rgba(249,115,22,0.20); }
          50%  { transform: rotate(270deg); box-shadow: 0 4px 10px 0 #fcd34d inset, 0 7px 6px 0 #f59e0b inset, 0 13px 18px 0 #f97316 inset, 0 0 3px 1px rgba(245,158,11,0.20); }
          100% { transform: rotate(450deg); box-shadow: 0 4px 10px 0 #fdba74 inset, 0 8px 14px 0 #f97316 inset, 0 16px 18px 0 #fb923c inset, 0 0 3px 1px rgba(249,115,22,0.20); }
        }
        @keyframes silvioLoaderLetter {
          0%,100% { opacity: 0.45; transform: translateY(0); }
          20%     { opacity: 1;    transform: translateY(-1px); }
          40%     { opacity: 0.7;  transform: translateY(0); }
        }
        .animate-silvioLoaderCircle { animation: silvioLoaderCircle 4s linear infinite; }
        .animate-silvioLoaderLetter { animation: silvioLoaderLetter 3s infinite; }
        @media (prefers-reduced-motion: reduce) {
          .animate-silvioLoaderCircle { animation: none; }
          .animate-silvioLoaderLetter { animation: none; opacity: 0.7; }
        }
      `}</style>
    </div>
  );

  if (fullscreen) {
    return (
      <div className={cn("fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm", className)}>
        {inner}
      </div>
    );
  }
  return <div className={cn("flex items-center", className)}>{inner}</div>;
};

export default AiLoader;
