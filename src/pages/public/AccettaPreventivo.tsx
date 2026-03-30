import { useParams, useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle, XCircle, FileText, Loader2,
  AlertTriangle, Building2, Calendar,
} from "lucide-react";

export default function AccettaPreventivo() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<
    "loading" | "idle" | "accepted" | "rejected" | "error" | "invalid"
  >("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [quote, setQuote] = useState<any>(null);

  useEffect(() => {
    if (!id || !token) { setStatus("invalid"); return; }
    supabase.functions
      .invoke("quote-sign", { body: { token, action: "view" } })
      .then(({ data, error }) => {
        if (error || !data?.valid) {
          setStatus("invalid");
          setErrorMsg(data?.reason || "Link non valido o scaduto");
        } else {
          setQuote(data.quote);
          setStatus("idle");
        }
      });
  }, [id, token]);

  const handleAction = async (action: "accetta" | "rifiuta") => {
    setStatus("loading");
    try {
      const { data, error } = await supabase.functions.invoke("accetta-preventivo", {
        body: { documento_id: id, token, action },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setStatus(action === "accetta" ? "accepted" : "rejected");
    } catch (err: any) {
      setErrorMsg(err.message);
      setStatus("error");
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "invalid" || status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <AlertTriangle className="h-16 w-16 text-amber-500 mx-auto" />
            <h2 className="text-xl font-semibold">Link non valido</h2>
            <p className="text-muted-foreground">
              {errorMsg || "Questo link è scaduto o non valido. Contatta il fornitore."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "accepted") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto" />
            <h2 className="text-xl font-semibold">Preventivo Accettato</h2>
            <p className="text-muted-foreground">
              Grazie! Il fornitore è stato notificato della tua accettazione.
            </p>
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
            <p className="text-muted-foreground">
              Il fornitore è stato notificato. Per ulteriori informazioni contattalo direttamente.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // idle — mostra i dati del preventivo prima delle azioni
  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div>
                <CardTitle className="text-xl">
                  Preventivo {quote?.quote_number}
                </CardTitle>
                <p className="text-muted-foreground text-sm">{quote?.title}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {quote?.client_name && (
              <div className="flex gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <span>
                  {quote.client_name}
                  {quote.client_company ? ` — ${quote.client_company}` : ""}
                </span>
              </div>
            )}
            {quote?.expires_at && (
              <div className="flex gap-2 items-center">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>
                  Valido fino al{" "}
                  {format(new Date(quote.expires_at), "d MMMM yyyy", { locale: it })}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Imponibile</span>
              <span>{formatCurrency(quote?.subtotal || 0)}</span>
            </div>
            {(quote?.discount_percent || 0) > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Sconto {quote.discount_percent}%</span>
                <span>−{formatCurrency(quote.discount_amount || 0)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">IVA</span>
              <span>{formatCurrency(quote?.vat_amount || 0)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>Totale</span>
              <span>{formatCurrency(quote?.total || 0)}</span>
            </div>
          </CardContent>
        </Card>

        {quote?.notes && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground font-medium mb-1">Note</p>
              <p className="text-sm">{quote.notes}</p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button
            variant="outline"
            className="h-14 text-base"
            onClick={() => handleAction("rifiuta")}
          >
            <XCircle className="h-5 w-5 mr-2" /> Rifiuto
          </Button>
          <Button
            className="h-14 text-base"
            onClick={() => handleAction("accetta")}
          >
            <CheckCircle className="h-5 w-5 mr-2" /> Accetto
          </Button>
        </div>
        <p className="text-xs text-center text-muted-foreground">
          Cliccando "Accetto" confermi di aver letto e accettato il preventivo.
        </p>
      </div>
    </div>
  );
}
