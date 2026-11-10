/**
 * SignaturePad — canvas full-screen per firma cliente con dito/penna
 *
 * On confirm: PNG → upload media (type='signature') → callback.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Check, X, Loader2 } from "lucide-react";
import { uploadMedia, updateSurvey } from "@/lib/api/surveys";
import { toast } from "sonner";

export interface SignaturePadProps {
  surveyId: string;
  signerName?: string;
  onConfirm?: (url: string, signedAt: string) => void;
  onCancel?: () => void;
}

export function SignaturePad({ surveyId, signerName, onConfirm, onCancel }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const confirmingRef = useRef(false);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState(signerName ?? "");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Resize a parent
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = parent.clientWidth * dpr;
      canvas.height = parent.clientHeight * dpr;
      canvas.style.width = parent.clientWidth + "px";
      canvas.style.height = parent.clientHeight + "px";
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "#0f172a"; // slate-900
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (confirmingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setDrawing(true);
  };

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || confirmingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const handleUp = () => setDrawing(false);

  const clear = () => {
    if (confirmingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const confirm = async () => {
    if (confirmingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) {
      toast.error("Firma assente. Disegna sopra per firmare.");
      return;
    }
    confirmingRef.current = true;
    setUploading(true);
    try {
      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error("blob fallita")), "image/png"),
      );
      const file = new File([blob], `firma-${Date.now()}.png`, { type: "image/png" });
      const media = await uploadMedia(surveyId, file, { type: "signature" });
      const now = new Date().toISOString();
      // L’API condivisa verifica che il server confermi l’aggiornamento.
      await updateSurvey(surveyId, {
        client_signature_url: media.url,
        client_signature_name: name || null,
        client_signature_at: now,
        signed_at: now,
        status: "signed",
      });
      toast.success("Firma registrata");
      onConfirm?.(media.url, now);
    } catch (e) {
      toast.error("Salvataggio firma fallito", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      confirmingRef.current = false;
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="p-3 border-b flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Annulla firma" onClick={() => { if (!confirmingRef.current) onCancel?.(); }} disabled={uploading}>
          <X className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <p className="font-semibold">Firma cliente</p>
          <p className="text-xs text-muted-foreground">Firma con dito o penna sul riquadro</p>
        </div>
      </div>

      <div className="p-3 border-b">
        <label className="block">
          <span className="text-xs text-muted-foreground">Nome firmatario (opzionale)</span>
          <input
            type="text"
            value={name}
            disabled={uploading}
            onChange={(e) => setName(e.target.value)}
            placeholder="Es. Mario Rossi"
            className="mt-1 w-full h-9 rounded-md border px-2.5 text-sm"
          />
        </label>
      </div>

      <div className="flex-1 relative bg-white p-3">
        <canvas
          ref={canvasRef}
          aria-label="Riquadro per la firma"
          aria-busy={uploading}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerLeave={handleUp}
          className="w-full h-full border-2 border-dashed border-muted-foreground/30 rounded-lg touch-none cursor-crosshair"
          style={{ touchAction: "none", pointerEvents: uploading ? "none" : "auto" }}
        />
      </div>

      <div className="p-3 border-t flex gap-2">
        <Button variant="outline" onClick={clear} disabled={uploading} className="gap-2">
          <Eraser className="h-4 w-4" />
          Cancella
        </Button>
        <Button
          onClick={confirm}
          disabled={!hasDrawn || uploading}
          className="ml-auto gap-2 bg-emerald-600 hover:bg-emerald-700"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {uploading ? "Registrazione…" : "Conferma firma"}
        </Button>
      </div>
    </div>
  );
}
