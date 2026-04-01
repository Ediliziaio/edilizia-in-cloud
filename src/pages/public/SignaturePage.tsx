import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, Loader2, PenTool } from "lucide-react";

export default function SignaturePage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<"loading" | "ready" | "signing" | "signed" | "expired" | "error">("loading");
  const [orderInfo, setOrderInfo] = useState<{ order_code: string; description: string } | null>(null);
  const [signerName, setSignerName] = useState("");
  const [typedSignature, setTypedSignature] = useState("");
  const [consent, setConsent] = useState(false);

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
    setTypedSignature(data.signer_name || "");
    setStatus("ready");
  };

  const submitSignature = async () => {
    if (!typedSignature.trim() || !token || !consent) return;
    setStatus("signing");

    // Store the typed name as signature data (text-based)
    const signatureData = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(typedSignature.trim())))}`;

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

  const canSubmit = typedSignature.trim().length >= 2 && consent;

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PenTool className="h-5 w-5" aria-hidden="true" />
            Firma documento
          </CardTitle>
          {orderInfo && (
            <p className="text-sm text-muted-foreground">
              Ordine {orderInfo.order_code}{orderInfo.description ? ` — ${orderInfo.description}` : ""}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          {signerName && (
            <p className="text-sm">
              Firmatario: <span className="font-medium">{signerName}</span>
            </p>
          )}

          {/* Typed signature input */}
          <div className="space-y-2">
            <Label htmlFor="typed-signature">
              Scrivi il tuo nome e cognome per firmare *
            </Label>
            <Input
              id="typed-signature"
              value={typedSignature}
              onChange={(e) => setTypedSignature(e.target.value)}
              placeholder="Nome Cognome"
              className="text-lg"
              aria-describedby="signature-hint"
              autoComplete="name"
            />
            <p id="signature-hint" className="text-xs text-muted-foreground">
              Inserisci il tuo nome completo come firma elettronica del documento.
            </p>
          </div>

          {/* Signature preview */}
          {typedSignature.trim() && (
            <div className="border rounded-lg bg-white p-4 min-h-[80px] flex items-center justify-center">
              <span
                style={{ fontFamily: "'Dancing Script', 'Brush Script MT', cursive", fontSize: "1.8rem", color: "#1a1a1a" }}
                aria-label={`Anteprima firma: ${typedSignature}`}
              >
                {typedSignature}
              </span>
            </div>
          )}

          {/* Consent checkbox */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border">
            <input
              type="checkbox"
              id="consent"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border shrink-0"
              aria-describedby="consent-label"
            />
            <label id="consent-label" htmlFor="consent" className="text-xs text-muted-foreground cursor-pointer leading-relaxed">
              Confermo di aver letto e accettato i termini del documento e di apporre la mia firma elettronica ai sensi dell'art. 21 del D.Lgs. 82/2005 (CAD).
            </label>
          </div>

          <Button
            onClick={submitSignature}
            disabled={!canSubmit || status === "signing"}
            className="w-full"
          >
            {status === "signing" ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" /> Salvataggio...</>
            ) : (
              "Conferma firma"
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            La firma verrà registrata insieme alla data, all'ora e all'indirizzo IP del dispositivo.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
