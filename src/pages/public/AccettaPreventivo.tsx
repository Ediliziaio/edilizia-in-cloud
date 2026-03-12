import { useParams, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, FileText, Loader2 } from "lucide-react";

export default function AccettaPreventivo() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"idle" | "loading" | "accepted" | "rejected" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleAction = async (action: "accetta" | "rifiuta") => {
    setStatus("loading");
    try {
      const { data, error } = await supabase.functions.invoke("accetta-preventivo", {
        body: { documento_id: id, token, action },
      });
      if (error) {
        const detail = error.context ? await error.context.json?.().catch((): null => null) : null;
        throw new Error(detail?.error || error.message);
      }
      setStatus(action === "accetta" ? "accepted" : "rejected");
    } catch (err: any) {
      setErrorMsg(err.message);
      setStatus("error");
    }
  };

  if (status === "accepted") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto" />
            <h2 className="text-xl font-semibold">Preventivo Accettato</h2>
            <p className="text-muted-foreground">Grazie! Il fornitore è stato notificato della tua accettazione.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <XCircle className="h-16 w-16 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold">Preventivo Rifiutato</h2>
            <p className="text-muted-foreground">Il fornitore è stato notificato. Per ulteriori informazioni contattalo direttamente.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <XCircle className="h-16 w-16 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold">Errore</h2>
            <p className="text-muted-foreground">{errorMsg || "Link non valido o scaduto."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <FileText className="h-12 w-12 text-primary mx-auto mb-2" />
          <CardTitle>Preventivo</CardTitle>
          <p className="text-sm text-muted-foreground">Vuoi accettare o rifiutare questo preventivo?</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full h-12 text-base" onClick={() => handleAction("accetta")} disabled={status === "loading"}>
            {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-5 w-5 mr-2" />}
            Accetto il preventivo
          </Button>
          <Button variant="outline" className="w-full h-12 text-base" onClick={() => handleAction("rifiuta")} disabled={status === "loading"}>
            <XCircle className="h-5 w-5 mr-2" /> Rifiuto
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
