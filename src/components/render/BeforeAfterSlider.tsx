import { useEffect, useRef, useState, useCallback } from "react";

interface Props {
  beforeUrl: string;
  afterUrl: string;
  className?: string;
}

export function BeforeAfterSlider({ beforeUrl, afterUrl, className = "" }: Props) {
  const [position, setPosition] = useState(50);
  const [aspectRatio, setAspectRatio] = useState<number>(4 / 3);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
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
    image.src = beforeUrl;
    return () => {
      active = false;
    };
  }, [beforeUrl]);

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
      <img
        src={beforeUrl}
        alt="Foto originale"
        className="absolute inset-0 h-full w-full object-contain block"
        draggable={false}
      />

      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <img
          src={afterUrl}
          alt="Render AI"
          className="absolute inset-0 h-full w-full object-contain block"
          draggable={false}
        />
      </div>

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
        Originale
      </div>
      <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-primary/80 px-2 py-0.5 text-xs text-white">
        Render AI
      </div>
    </div>
  );
}
