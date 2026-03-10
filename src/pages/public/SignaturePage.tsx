import { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, Loader2, Eraser, PenTool } from "lucide-react";

export default function SignaturePage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<"loading" | "ready" | "signing" | "signed" | "expired" | "error">("loading");
  const [orderInfo, setOrderInfo] = useState<{ order_code: string; description: string } | null>(null);
  const [signerName, setSignerName] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    if (!token) { setStatus("error"); return; }
    loadRequest();
  }, [token]);

  const loadRequest = async () => {
    const { data, error } = await supabase
      .from("signature_requests")
      .select("id, status, signer_name, signer_email, expires_at, order:orders!signature_requests_order_id_fkey(order_code, description)")
      .eq("token", token!)
      .maybeSingle();

    if (error || !data) { setStatus("error"); return; }
    if (data.status === "signed") { setStatus("signed"); return; }
    if (data.status === "expired" || data.status === "cancelled" || new Date(data.expires_at) < new Date()) {
      setStatus("expired"); return;
    }

    const order = data.order as any;
    setOrderInfo({ order_code: order?.order_code || "", description: order?.description || "" });
    setSignerName(data.signer_name || "");
    setStatus("ready");
  };

  // Canvas drawing handlers
  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDrawingRef.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const endDraw = () => { isDrawingRef.current = false; };

  const clearCanvas = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
    setHasDrawn(false);
  };

  const submitSignature = async () => {
    if (!hasDrawn || !token) return;
    setStatus("signing");

    const signatureData = canvasRef.current?.toDataURL("image/png");

    const { error } = await supabase
      .from("signature_requests")
      .update({
        status: "signed",
        signature_data: signatureData,
        signed_at: new Date().toISOString(),
        signed_by_ip: "client",
        updated_at: new Date().toISOString(),
      })
      .eq("token", token)
      .eq("status", "pending");

    if (error) {
      setStatus("ready");
      return;
    }
    setStatus("signed");
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <h2 className="text-lg font-semibold">Link non valido</h2>
            <p className="text-sm text-muted-foreground text-center">
              Il link di firma non è valido o è stato rimosso.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <AlertTriangle className="h-12 w-12 text-amber-500" />
            <h2 className="text-lg font-semibold">Link scaduto</h2>
            <p className="text-sm text-muted-foreground text-center">
              Il link di firma è scaduto. Contatta l'azienda per richiederne uno nuovo.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "signed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
            <h2 className="text-lg font-semibold">Documento firmato</h2>
            <p className="text-sm text-muted-foreground text-center">
              La firma è stata registrata con successo. Puoi chiudere questa pagina.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PenTool className="h-5 w-5" />
            Firma documento
          </CardTitle>
          {orderInfo && (
            <p className="text-sm text-muted-foreground">
              Ordine {orderInfo.order_code}{orderInfo.description ? ` — ${orderInfo.description}` : ""}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {signerName && (
            <p className="text-sm">
              Firmatario: <span className="font-medium">{signerName}</span>
            </p>
          )}

          <div className="border rounded-lg bg-white p-1">
            <canvas
              ref={canvasRef}
              width={460}
              height={200}
              className="w-full cursor-crosshair touch-none"
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
          </div>

          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={clearCanvas}>
              <Eraser className="h-4 w-4 mr-1" /> Cancella
            </Button>
            <Button
              onClick={submitSignature}
              disabled={!hasDrawn || status === "signing"}
            >
              {status === "signing" ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Salvataggio...</>
              ) : (
                "Conferma firma"
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Firmando, confermi di aver letto e accettato i termini del documento.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
