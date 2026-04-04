import { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Eraser,
  PenTool,
  GitBranch,
  Euro,
  Calendar,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";

type PageStatus = "loading" | "ready" | "submitting" | "approved" | "rejected" | "already_done" | "error";

interface OdVData {
  id: string;
  numero_odv: number;
  titolo: string;
  descrizione: string;
  motivazione: string | null;
  impatto_economico: number;
  impatto_giorni: number;
  richiesto_da: string | null;
  richiesto_il: string | null;
  status: string;
}

export default function FirmaOdV() {
  const { token } = useParams<{ token: string }>();
  const [pageStatus, setPageStatus] = useState<PageStatus>("loading");
  const [odv, setOdv] = useState<OdVData | null>(null);
  const [firmatoDa, setFirmatoDa] = useState("");
  const [hasDrawn, setHasDrawn] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);

  useEffect(() => {
    if (!token) { setPageStatus("error"); return; }
    loadOdv();
  }, [token]);

  const loadOdv = async () => {
    const { data, error } = await supabase
      .from("ordini_variazione")
      .select("id, numero_odv, titolo, descrizione, motivazione, impatto_economico, impatto_giorni, richiesto_da, richiesto_il, status")
      .eq("firma_token", token!)
      .maybeSingle();

    if (error || !data) { setPageStatus("error"); return; }
    if (data.status !== "in_attesa") { setPageStatus("already_done"); return; }
    setOdv(data as OdVData);
    setPageStatus("ready");
  };

  // ── Canvas drawing ────────────────────────────────────────────
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
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const endDraw = () => { isDrawingRef.current = false; };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  // ── Submit approve ───────────────────────────────────────────
  const handleApprove = async () => {
    if (!hasDrawn || !token || !odv) return;

    // Guard: canvas must be serializable
    const firmaData = canvasRef.current?.toDataURL("image/png");
    if (!firmaData) {
      toast.error("Impossibile acquisire la firma. Riprova.");
      return;
    }

    setPageStatus("submitting");

    // Chiama firma-odv-webhook che aggiorna OdV + importo ordine + activity log
    const { error: webhookError } = await supabase.functions.invoke("firma-odv-webhook", {
      body: {
        token,
        firma_data_base64: firmaData,
        firmato_da: firmatoDa.trim() || null,
      },
    });

    if (webhookError) {
      // Fallback: aggiorna direttamente
      const { error } = await supabase
        .from("ordini_variazione")
        .update({
          status: "approvato",
          firma_cliente: firmaData,
          firmato_da: firmatoDa.trim() || null,
          firmato_il: new Date().toISOString(),
        })
        .eq("firma_token", token)
        .eq("status", "in_attesa");

      if (error) {
        toast.error("Errore durante il salvataggio. Riprova.");
        setPageStatus("ready");
        return;
      }
    }

    setPageStatus("approved");
  };

  // ── Submit reject ────────────────────────────────────────────
  const handleReject = async () => {
    if (!token || !odv) return;
    setPageStatus("submitting");
    const { error } = await supabase
      .from("ordini_variazione")
      .update({
        status: "rifiutato",
        firmato_il: new Date().toISOString(),
        firmato_da: firmatoDa.trim() || null,
      })
      .eq("firma_token", token)
      .eq("status", "in_attesa");

    if (error) {
      toast.error("Errore durante il rifiuto. Riprova.");
      setPageStatus("ready");
      return;
    }
    setPageStatus("rejected");
  };

  // ── States ───────────────────────────────────────────────────
  if (pageStatus === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (pageStatus === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <h2 className="text-lg font-semibold">Link non valido</h2>
            <p className="text-sm text-muted-foreground text-center">
              Il link non è valido o è stato rimosso. Contatta l'azienda per assistenza.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (pageStatus === "already_done") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
            <h2 className="text-lg font-semibold">Già elaborato</h2>
            <p className="text-sm text-muted-foreground text-center">
              Questo ordine di variazione è già stato firmato o elaborato. Puoi chiudere questa pagina.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (pageStatus === "approved") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <CheckCircle2 className="h-16 w-16 text-green-600" />
            <h2 className="text-xl font-semibold text-green-700">Ordine approvato!</h2>
            <p className="text-sm text-muted-foreground text-center">
              Hai approvato l'ordine di variazione. L'azienda è stata notificata e i lavori potranno procedere.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (pageStatus === "rejected") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <XCircle className="h-16 w-16 text-red-500" />
            <h2 className="text-xl font-semibold text-red-700">Ordine rifiutato</h2>
            <p className="text-sm text-muted-foreground text-center">
              Hai rifiutato l'ordine di variazione. L'azienda è stata notificata.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main ready/submitting UI ─────────────────────────────────
  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header */}
        <div className="text-center space-y-1 pb-2">
          <div className="flex items-center justify-center gap-2 text-primary">
            <GitBranch className="h-6 w-6" />
            <h1 className="text-xl font-bold">Ordine di Variazione</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Rivedi i dettagli e firma per approvare oppure rifiuta i lavori extra
          </p>
        </div>

        {/* OdV Detail Card */}
        {odv && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-mono text-muted-foreground">OdV #{odv.numero_odv}</span>
                  <CardTitle className="text-base mt-0.5">{odv.titolo}</CardTitle>
                </div>
                <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 border text-xs shrink-0">
                  In attesa di firma
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Descrizione lavori</p>
                <p className="text-sm whitespace-pre-wrap">{odv.descrizione}</p>
              </div>

              {odv.motivazione && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Motivazione</p>
                  <p className="text-sm text-muted-foreground">{odv.motivazione}</p>
                </div>
              )}

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Euro className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Importo aggiuntivo</p>
                    <p className="font-semibold text-sm">
                      {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(odv.impatto_economico)}
                    </p>
                  </div>
                </div>
                {odv.impatto_giorni > 0 && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Giorni aggiuntivi</p>
                      <p className="font-semibold text-sm">+{odv.impatto_giorni} giorni</p>
                    </div>
                  </div>
                )}
              </div>

              {(odv.richiesto_da || odv.richiesto_il) && (
                <>
                  <Separator />
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    {odv.richiesto_da && <span>Richiesto da: <strong>{odv.richiesto_da}</strong></span>}
                    {odv.richiesto_il && (
                      <span>Il: <strong>{format(new Date(odv.richiesto_il), "dd/MM/yyyy", { locale: it })}</strong></span>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Signature Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <PenTool className="h-4 w-4 text-primary" />
              La tua firma
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Il tuo nome (opzionale)</Label>
              <Input
                placeholder="es. Mario Rossi"
                value={firmatoDa}
                onChange={(e) => setFirmatoDa(e.target.value)}
                disabled={pageStatus === "submitting"}
              />
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-2">Firma qui sotto per approvare:</p>
              <div className="border-2 border-dashed rounded-lg bg-white overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={460}
                  height={180}
                  className="w-full cursor-crosshair touch-none block"
                  style={{ touchAction: "none" }}
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={endDraw}
                  onMouseLeave={endDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={endDraw}
                />
              </div>
              <div className="flex justify-between items-center mt-1.5">
                <p className="text-xs text-muted-foreground italic">Firma con il dito o il mouse</p>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearCanvas} disabled={pageStatus === "submitting"}>
                  <Eraser className="h-3 w-3 mr-1" /> Cancella
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pb-8">
          {/* Reject */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300"
                disabled={pageStatus === "submitting"}
              >
                <XCircle className="h-4 w-4 mr-1.5" />
                Rifiuto
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Conferma rifiuto</AlertDialogTitle>
                <AlertDialogDescription>
                  Stai rifiutando l'ordine di variazione <strong>"{odv?.titolo}"</strong> da{" "}
                  {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(odv?.impatto_economico || 0)}.
                  L'azienda sarà notificata e i lavori non potranno procedere.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleReject}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  Sì, rifiuto
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Approve */}
          <Button
            onClick={handleApprove}
            disabled={!hasDrawn || pageStatus === "submitting"}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {pageStatus === "submitting" ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Salvataggio...</>
            ) : (
              <><CheckCircle2 className="h-4 w-4 mr-1.5" /> Approvo e firmo</>
            )}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center pb-4">
          Approvando, autorizzi l'esecuzione dei lavori extra descritti e accetti l'importo aggiuntivo indicato.
        </p>
      </div>
    </div>
  );
}
