import { useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Eraser, PenTool, Check, X } from "lucide-react";

interface Props {
  onFirmaCompleta: (dataUrl: string) => void;
  onAnnulla: () => void;
  nomeTecnico?: string;
  interventoId?: string;
  fullscreen?: boolean;
}

const MIN_COLORED_PIXELS = 500;
const STROKE_COLOR = "#1E3A5F";

export function FirmaDigitaleCanvas({
  onFirmaCompleta,
  onAnnulla,
  nomeTecnico,
  fullscreen = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const hasPixelsRef = useRef(false);
  // Force re-render when pixel count changes to enable/disable button
  const pixelCountRef = useRef(0);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Initialize canvas with white background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
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
  }, []);

  const countColoredPixels = useCallback((): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      // A pixel is "colored" if it's not white (R<240 or G<240 or B<240) and alpha is significant
      if (data[i + 3] > 10 && (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240)) {
        count++;
      }
    }
    return count;
  }, []);

  const updateConfirmButton = useCallback(() => {
    const count = countColoredPixels();
    pixelCountRef.current = count;
    if (confirmBtnRef.current) {
      if (count >= MIN_COLORED_PIXELS) {
        confirmBtnRef.current.removeAttribute("disabled");
        confirmBtnRef.current.classList.remove("opacity-50", "cursor-not-allowed");
      } else {
        confirmBtnRef.current.setAttribute("disabled", "true");
        confirmBtnRef.current.classList.add("opacity-50", "cursor-not-allowed");
      }
    }
  }, [countColoredPixels]);

  const startDraw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      isDrawingRef.current = true;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    },
    [getPos]
  );

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const pos = getPos(e);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = STROKE_COLOR;
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      hasPixelsRef.current = true;
    },
    [getPos]
  );

  const endDraw = useCallback(() => {
    isDrawingRef.current = false;
    if (hasPixelsRef.current) {
      updateConfirmButton();
    }
  }, [updateConfirmButton]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    hasPixelsRef.current = false;
    pixelCountRef.current = 0;
    updateConfirmButton();
  }, [updateConfirmButton]);

  const handleConferma = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const count = countColoredPixels();
    if (count < MIN_COLORED_PIXELS) return;
    const dataUrl = canvas.toDataURL("image/png", 0.8);
    onFirmaCompleta(dataUrl);
  }, [countColoredPixels, onFirmaCompleta]);

  const canvasEl = (
    <div className="flex flex-col gap-4">
      {/* Canvas header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <PenTool className="h-4 w-4 text-[#1E3A5F]" />
          Firma del tecnico
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clearCanvas}
          className="gap-1 text-xs h-7 text-gray-500 hover:text-red-600"
        >
          <Eraser className="h-3 w-3" />
          Cancella
        </Button>
      </div>

      {/* Canvas area */}
      <div className="border-2 border-dashed border-gray-200 rounded-lg overflow-hidden bg-white shadow-inner">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full touch-none cursor-crosshair"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
          aria-label="Area firma tecnico"
        />
      </div>

      {/* Tecnico name */}
      {nomeTecnico && (
        <p className="text-center text-sm text-gray-500">
          Firma di: <span className="font-semibold text-gray-700">{nomeTecnico}</span>
        </p>
      )}

      {/* Helper text */}
      <p className="text-xs text-center text-gray-400">
        Firma nello spazio sopra con il dito o il mouse. Assicurati che la firma sia leggibile.
      </p>

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-2 border-t">
        <Button type="button" variant="outline" onClick={onAnnulla} className="gap-2">
          <X className="h-4 w-4" />
          Annulla
        </Button>
        <Button
          ref={confirmBtnRef}
          type="button"
          onClick={handleConferma}
          disabled
          className="gap-2 bg-[#1E3A5F] hover:bg-[#162d4a] opacity-50 cursor-not-allowed"
        >
          <Check className="h-4 w-4" />
          Conferma firma
        </Button>
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
          {canvasEl}
        </div>
      </div>
    );
  }

  return <div className={cn("w-full")}>{canvasEl}</div>;
}
