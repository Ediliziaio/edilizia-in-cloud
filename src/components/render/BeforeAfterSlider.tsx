import { useEffect, useRef, useState, useCallback } from "react";

interface Props {
  /** Preferred prop name. */
  beforeUrl?: string;
  /** Preferred prop name. */
  afterUrl?: string;
  /** Backward compat alias for `beforeUrl`. */
  beforeSrc?: string;
  /** Backward compat alias for `afterUrl`. */
  afterSrc?: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
}

export function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  beforeSrc,
  afterSrc,
  beforeLabel = "Originale",
  afterLabel = "Render AI",
  className = "",
}: Props) {
  const before = beforeUrl ?? beforeSrc ?? "";
  const after = afterUrl ?? afterSrc ?? "";

  const [position, setPosition] = useState(50);
  const [aspectRatio, setAspectRatio] = useState<number>(4 / 3);
  const [afterReady, setAfterReady] = useState(false);
  const [afterError, setAfterError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Compute aspect ratio from the BEFORE image (typically already loaded as ObjectURL).
  useEffect(() => {
    if (!before) return;
    let active = true;
    const image = new window.Image();
    image.onload = () => {
      if (!active) return;
      const width = image.naturalWidth || 0;
      const height = image.naturalHeight || 0;
      if (width > 0 && height > 0) {
        setAspectRatio(width / height);
      }
    };
    image.src = before;
    return () => {
      active = false;
    };
  }, [before]);

  // Pre-load the AFTER image and retry on transient 404 (CDN propagation delay).
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

  const onMouseDown = (event: React.MouseEvent) => {
    dragging.current = true;
    updatePosition(event.clientX);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const onTouchMove = (event: React.TouchEvent) => {
    updatePosition(event.touches[0].clientX);
  };

  return (
    <div
      ref={containerRef}
      className={`relative select-none overflow-hidden rounded-lg bg-muted/20 cursor-col-resize ${className}`}
      style={{ userSelect: "none", aspectRatio }}
      onMouseDown={onMouseDown}
      onTouchMove={onTouchMove}
      onTouchStart={(event) => updatePosition(event.touches[0].clientX)}
    >
      {before && (
        <img
          src={before}
          alt="Foto originale"
          className="absolute inset-0 h-full w-full object-contain block"
          draggable={false}
        />
      )}

      {after && (
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          <img
            src={after}
            alt="Render AI"
            className={`absolute inset-0 h-full w-full object-contain block transition-opacity duration-300 ${afterReady ? "opacity-100" : "opacity-0"}`}
            draggable={false}
          />
        </div>
      )}

      {/* Skeleton overlay while AFTER image loads (CDN propagation buffer). */}
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
        <div className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-xl">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M5 8L2 5M2 5L5 2M2 5H14M11 8L14 5M14 5L11 2M14 5H2"
              stroke="#374151"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              transform="rotate(90 8 8)"
            />
          </svg>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
        {beforeLabel}
      </div>
      <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-primary/80 px-2 py-0.5 text-xs text-white">
        {afterLabel}
      </div>
    </div>
  );
}
