import { useEffect, useRef, useState, useCallback } from "react";
import { MoveHorizontal } from "lucide-react";

interface Props {
  /** Nome prop preferito. */
  beforeUrl?: string;
  /** Nome prop preferito. */
  afterUrl?: string;
  /** Alias retrocompatibile per `beforeUrl`. */
  beforeSrc?: string;
  /** Alias retrocompatibile per `afterUrl`. */
  afterSrc?: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
  compact?: boolean;
  beforeOnLeft?: boolean;
}

export function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  beforeSrc,
  afterSrc,
  beforeLabel = "Originale",
  afterLabel = "Render AI",
  className = "",
  compact = false,
  beforeOnLeft = false,
}: Props) {
  const before = beforeUrl ?? beforeSrc ?? "";
  const after = afterUrl ?? afterSrc ?? "";
  const baseImage = beforeOnLeft ? after : before;
  const overlayImage = beforeOnLeft ? before : after;
  const baseAlt = beforeOnLeft ? afterLabel : beforeLabel;
  const overlayAlt = beforeOnLeft ? beforeLabel : afterLabel;

  const [position, setPosition] = useState(50);
  const [aspectRatio, setAspectRatio] = useState<number | undefined>();
  const [afterReady, setAfterReady] = useState(false);
  const [afterError, setAfterError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Calcola il ratio dalla foto originale, spesso gia' caricata come ObjectURL.
  useEffect(() => {
    setAspectRatio(undefined);
    if (!before) {
      setAspectRatio(4 / 3);
      return;
    }
    let active = true;
    const image = new window.Image();
    image.onload = () => {
      if (!active) return;
      const width = image.naturalWidth || 0;
      const height = image.naturalHeight || 0;
      if (width > 0 && height > 0) {
        setAspectRatio(width / height);
      } else {
        setAspectRatio(4 / 3);
      }
    };
    image.onerror = () => {
      if (active) setAspectRatio(4 / 3);
    };
    image.src = before;
    return () => {
      active = false;
    };
  }, [before]);

  // Precarica il render e ritenta sui 404 transitori da propagazione CDN.
  useEffect(() => {
    if (!after) {
      setAfterReady(false);
      return;
    }
    let active = true;
    let attempts = 0;
    setAfterReady(false);
    setAfterError(false);

    const tryLoad = () => {
      const image = new window.Image();
      image.onload = () => {
        if (!active) return;
        setAfterReady(true);
      };
      image.onerror = () => {
        if (!active) return;
        attempts += 1;
        if (attempts < 4) {
          setTimeout(tryLoad, 800 * attempts);
        } else {
          setAfterError(true);
        }
      };
      image.src = attempts === 0 ? after : `${after}${after.includes("?") ? "&" : "?"}retry=${attempts}`;
    };

    tryLoad();
    return () => {
      active = false;
    };
  }, [after]);

  const updatePosition = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    setPosition(pct);
  }, []);

  const onMouseMove = useCallback((event: MouseEvent) => {
    if (!dragging.current) return;
    updatePosition(event.clientX);
  }, [updatePosition]);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  }, [onMouseMove]);

  const stopDrag = useCallback(() => {
    dragging.current = false;
  }, []);

  const onMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    dragging.current = true;
    updatePosition(event.clientX);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const onTouchStart = (event: React.TouchEvent) => {
    event.preventDefault();
    dragging.current = true;
    const touch = event.touches[0];
    if (touch) updatePosition(touch.clientX);
  };

  const onTouchMove = (event: React.TouchEvent) => {
    event.preventDefault();
    const touch = event.touches[0];
    if (touch) updatePosition(touch.clientX);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setPosition((value) => Math.max(0, value - 5));
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setPosition((value) => Math.min(100, value + 5));
    }
    if (event.key === "Home") {
      event.preventDefault();
      setPosition(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      setPosition(100);
    }
  };

  return (
    <div className="space-y-2">
      {!compact && (
      <div className="grid grid-cols-2 gap-2 sm:hidden">
        <button
          type="button"
          className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm font-medium active:scale-[0.99]"
          onClick={() => setPosition(0)}
        >
          Solo originale
        </button>
        <button
          type="button"
          className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm font-medium active:scale-[0.99]"
          onClick={() => setPosition(100)}
        >
          Solo render
        </button>
      </div>
      )}

      <div
        ref={containerRef}
        className={`relative ${compact ? "min-h-0" : "min-h-[240px]"} cursor-col-resize select-none overflow-hidden rounded-lg bg-muted/20 ${className}`}
        style={{ userSelect: "none", touchAction: "none", aspectRatio }}
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position)}
        aria-label="Confronta foto originale e render AI"
        onMouseDown={onMouseDown}
        onTouchMove={onTouchMove}
        onTouchStart={onTouchStart}
        onTouchEnd={stopDrag}
        onTouchCancel={stopDrag}
        onKeyDown={onKeyDown}
      >
        {aspectRatio === undefined && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/40">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
          </div>
        )}

        {baseImage && (
          <img
            src={baseImage}
            alt={baseAlt}
            className="absolute inset-0 h-full w-full object-contain block"
            draggable={false}
          />
        )}

        {overlayImage && (
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
          >
            <img
              src={overlayImage}
              alt={overlayAlt}
              className={`absolute inset-0 h-full w-full object-contain block transition-opacity duration-300 ${afterReady ? "opacity-100" : "opacity-0"}`}
              draggable={false}
            />
          </div>
        )}

        {/* Skeleton mentre il render si propaga/carica. */}
        {after && !afterReady && !afterError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-50/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-slate-600">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
              <span className="text-xs font-medium">Caricamento render…</span>
            </div>
          </div>
        )}

        {after && afterError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-red-50/90">
            <span className="text-xs font-medium text-red-700">Render non disponibile · ricarica la pagina</span>
          </div>
        )}

        <div
          className="absolute bottom-0 top-0 w-0.5 bg-white shadow-lg"
          style={{ left: `${position}%`, transform: "translateX(-50%)" }}
        >
          <div className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-xl">
            <MoveHorizontal className="h-4 w-4 text-slate-700" aria-hidden="true" />
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
          {beforeLabel}
        </div>
        <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-primary/80 px-2 py-0.5 text-xs text-white">
          {afterLabel}
        </div>
      </div>
    </div>
  );
}
