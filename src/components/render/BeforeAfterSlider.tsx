import { useState, useRef, useCallback } from "react";

interface Props {
  beforeUrl: string;
  afterUrl: string;
  className?: string;
}

export function BeforeAfterSlider({ beforeUrl, afterUrl, className = "" }: Props) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    setPosition(pct);
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    updatePosition(e.clientX);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!dragging.current) return;
    updatePosition(e.clientX);
  };

  const onMouseUp = () => {
    dragging.current = false;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    updatePosition(e.touches[0].clientX);
  };

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-lg select-none cursor-col-resize ${className}`}
      style={{ userSelect: "none" }}
      onMouseDown={onMouseDown}
      onTouchMove={onTouchMove}
      onTouchStart={e => updatePosition(e.touches[0].clientX)}
    >
      {/* Before (originale) */}
      <img
        src={beforeUrl}
        alt="Foto originale"
        className="w-full h-full object-cover block"
        draggable={false}
      />

      {/* After (render) — clipped */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <img
          src={afterUrl}
          alt="Render AI"
          className="w-full h-full object-cover block"
          draggable={false}
        />
      </div>

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg"
        style={{ left: `${position}%`, transform: "translateX(-50%)" }}
      >
        {/* Handle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-xl flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M5 8L2 5M2 5L5 2M2 5H14M11 8L14 5M14 5L11 2M14 5H2" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" transform="rotate(90 8 8)" />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded pointer-events-none">
        Originale
      </div>
      <div className="absolute bottom-2 right-2 bg-primary/80 text-white text-xs px-2 py-0.5 rounded pointer-events-none">
        Render AI
      </div>
    </div>
  );
}
