/**
 * FirmaPad — canvas firma touch/mouse riusabile (mobile-first, app campo).
 * Pattern ripreso dalla firma cliente di src/components/interventi/RapportinoForm.tsx.
 * onChange riceve il dataURL PNG della firma, o null quando la firma viene cancellata.
 */
import { useRef, useState } from "react";
import { Eraser } from "lucide-react";

interface FirmaPadProps {
  label: string;
  onChange: (dataUrl: string | null) => void;
}

export function FirmaPad({ label, onChange }: FirmaPadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const hasDrawnRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    isDrawingRef.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    if (!hasDrawnRef.current) {
      hasDrawnRef.current = true;
      setHasDrawn(true);
    }
  };

  const endDraw = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    // Emetti il dataURL solo se c'è effettivamente un tratto disegnato
    if (hasDrawnRef.current && canvasRef.current) {
      onChange(canvasRef.current.toDataURL("image/png"));
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    isDrawingRef.current = false;
    hasDrawnRef.current = false;
    setHasDrawn(false);
    onChange(null);
  };

  return (
    <div className="rounded-2xl border border-border bg-background p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <button
          type="button"
          onClick={clearCanvas}
          disabled={!hasDrawn}
          className="flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground disabled:opacity-40"
          aria-label={`Cancella ${label.toLowerCase()}`}
        >
          <Eraser className="h-3 w-3" />
          Cancella
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-dashed border-border bg-white">
        <canvas
          ref={canvasRef}
          width={560}
          height={160}
          className="w-full touch-none cursor-crosshair"
          style={{ touchAction: "none" }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
          onTouchCancel={endDraw}
          aria-label={`Area ${label.toLowerCase()}`}
        />
      </div>
      {!hasDrawn && (
        <p className="mt-1.5 text-xs text-muted-foreground">Firma qui sopra con il dito</p>
      )}
    </div>
  );
}
