import { useParams, useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle, XCircle, FileText, Loader2,
  AlertTriangle, Building2, Calendar, Package,
} from "lucide-react";

// Shape minimale dei dati pubblici restituiti dall'edge (solo i campi usati
// in pagina): prima quote/company erano Record<string, unknown> e ogni render
// era un errore di tipo.
interface PublicQuote {
  quote_number?: string | null;
  title?: string | null;
  client_name?: string | null;
  client_company?: string | null;
  expires_at?: string | null;
  subtotal?: number | null;
  discount_percent?: number | null;
  discount_amount?: number | null;
  vat_amount?: number | null;
  total?: number | null;
  notes?: string | null;
}

interface PublicCompany {
  name?: string | null;
}

interface QuoteItem {
  name: string;
  description?: string | null;
  quantity: number;
  unit_of_measure?: string | null;
  unit_price: number;
  discount_percent?: number | null;
  vat_rate?: number | null;
  line_total?: number | null;
  item_type?: string | null;
  sort_order?: number | null;
}

export default function AccettaPreventivo() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<
    "loading" | "idle" | "signing" | "refusing" | "accepted" | "rejected" | "error" | "invalid"
  >("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [company, setCompany] = useState<PublicCompany | null>(null);

  // Firma
  const [signedByName, setSignedByName] = useState("");
  const [refuseReason, setRefuseReason] = useState("");
  const [nameError, setNameError] = useState("");

  useEffect(() => {
    if (!id || !token) { setStatus("invalid"); return; }
    supabase.functions
      .invoke("quote-sign", { body: { token, action: "view" } })
      .then(({ data, error }) => {
        if (error || !data?.valid) {
          setStatus("invalid");
          setErrorMsg(data?.reason || "Link non valido o scaduto");
        } else if (!data.quote) {
          setStatus("invalid");
          setErrorMsg("Dati del preventivo non disponibili. Contatta il fornitore.");
        } else {
          setQuote(data.quote as PublicQuote);
          setItems((data.items as QuoteItem[]) ?? []);
          setCompany((data.company as PublicCompany | null) ?? null);
          setStatus("idle");
        }
      });
  }, [id, token]);

  const handleSign = async () => {
    if (signedByName.trim().length < 2) {
      setNameError("Inserisci il tuo nome e cognome per firmare (minimo 2 caratteri)");
      return;
    }
    setNameError("");
    setStatus("signing");
    try {
      const { data, error } = await supabase.functions.invoke("quote-sign", {
        body: { token, action: "sign", signed_by_name: signedByName.trim() },
      });
      if (error) throw new Error(error.message);
      if (data?.valid === false) throw new Error(data.reason || "Firma non valida");
      setStatus("accepted");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Errore sconosciuto");
      setStatus("error");
    }
  };

  const handleRefuse = async () => {
    setStatus("refusing");
    try {
      const { data, error } = await supabase.functions.invoke("quote-sign", {
        body: { token, action: "refuse", refuse_reason: refuseReason.trim() || null },
      });
      if (error) throw new Error(error.message);
      if (data?.valid === false) throw new Error(data.reason || "Azione non valida");
      setStatus("rejected");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Errore sconosciuto");
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

  // visible items only (exclude section headers without price)
  const visibleItems = items.filter((i) => i.item_type !== "section");

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Header preventivo */}
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
            {company?.name && (
              <div className="flex gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <span className="font-medium">{company.name}</span>
              </div>
            )}
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

        {/* Righe preventivo — requisito legale: il cliente deve vedere cosa firma */}
        {visibleItems.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                Dettaglio voci
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="divide-y text-sm">
                {visibleItems.map((item, idx) => {
                  const lineTotal =
                    item.line_total ??
                    item.quantity *
                      item.unit_price *
                      (1 - (item.discount_percent || 0) / 100);
                  return (
                    <div key={idx} className="py-3 space-y-1">
                      <div className="flex justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{item.name}</p>
                          {item.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {item.description}
                            </p>
                          )}
                        </div>
                        <p className="font-semibold shrink-0 tabular-nums">
                          {formatCurrency(lineTotal)}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity} {item.unit_of_measure || "pz"} ×{" "}
                        {formatCurrency(item.unit_price)}
                        {(item.discount_percent || 0) > 0 &&
                          ` — sconto ${item.discount_percent}%`}
                        {(item.vat_rate || 0) > 0 &&
                          ` (IVA ${item.vat_rate}%)`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Totali */}
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

        {/* Note */}
        {quote?.notes && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground font-medium mb-1">Note</p>
              <p className="text-sm whitespace-pre-line">{quote.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Azioni firma — resta montato anche durante signing/refusing, così
            gli stati "Firma in corso…"/"Rifiuto in corso…" sono visibili
            (prima il blocco spariva appena partiva l'azione: spinner mai visti) */}
        {(status === "idle" || status === "signing" || status === "refusing") && (
          <>
            {/* Sezione firma */}
            <Card className="border-emerald-200 bg-emerald-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-emerald-800">
                  Firma il preventivo
                </CardTitle>
                <p className="text-xs text-emerald-700">
                  Inserisci il tuo nome e cognome per confermare l'accettazione.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="signed_by_name" className="text-sm">
                    Nome e Cognome *
                  </Label>
                  <Input
                    id="signed_by_name"
                    placeholder="Es. Mario Rossi"
                    value={signedByName}
                    onChange={(e) => {
                      setSignedByName(e.target.value);
                      if (e.target.value.trim().length >= 2) setNameError("");
                    }}
                    aria-describedby={nameError ? "name-error" : undefined}
                    className="bg-white"
                  />
                  {nameError && (
                    <p id="name-error" className="text-xs text-destructive" role="alert">
                      {nameError}
                    </p>
                  )}
                </div>
                <Button
                  className="w-full h-12 text-base bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleSign}
                  disabled={status !== "idle"}
                >
                  {status === "signing"
                    ? <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    : <CheckCircle className="h-5 w-5 mr-2" />}
                  {status === "signing" ? "Firma in corso..." : "Accetto e firmo il preventivo"}
                </Button>
                <p className="text-xs text-emerald-700 text-center">
                  Cliccando "Accetto" confermi di aver letto integralmente il preventivo e di
                  accettarne le condizioni.
                </p>
              </CardContent>
            </Card>

            {/* Sezione rifiuto — visibile anche durante refusing (spinner) */}
            {(status === "idle" || status === "refusing") && (
              <Card className="border-red-200 bg-red-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-red-800">
                    Rifiuta il preventivo
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="refuse_reason" className="text-sm text-red-700">
                      Motivo del rifiuto (opzionale)
                    </Label>
                    <Textarea
                      id="refuse_reason"
                      placeholder="Indica il motivo se vuoi comunicarlo al fornitore…"
                      value={refuseReason}
                      onChange={(e) => setRefuseReason(e.target.value)}
                      rows={3}
                      className="bg-white resize-none"
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="w-full h-11 text-base border-red-300 text-red-700 hover:bg-red-100"
                    onClick={handleRefuse}
                    disabled={status !== "idle"}
                  >
                    {status === "refusing"
                      ? <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      : <XCircle className="h-5 w-5 mr-2" />}
                    {status === "refusing" ? "Rifiuto in corso..." : "Rifiuto il preventivo"}
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
