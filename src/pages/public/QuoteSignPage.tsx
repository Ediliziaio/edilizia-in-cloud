import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CheckCircle, XCircle, FileDown, Loader2, Building2, Calendar, AlertTriangle, ShieldCheck,
} from "lucide-react";

type QuoteData = {
  quote_number: string;
  title: string;
  description: string;
  notes: string;
  client_name: string;
  client_company: string;
  expires_atring | null;
  subtotal: number;
  discount_percent: number;
  discount_amount: number;
  vat_amount: number;
  total: number;
  created_at: string;
  signed_at: string | null;
  signed_by_name: string | null;
  refused_at: string | null;
  refused_reason: string | null;
};

type ItemData = {
  name: string;
  description: string | null;
  quantity: number;
  unit_of_measure: string | null;
  unit_price: number;
  discount_percent: number;
  vat_rate: number;
  line_total: number;
};

type ViewResult = {
  valid: boolean;
  reason?: string;
  status?: string;
  quote?: QuoteData;
  items?: ItemData[];
  company?: { name?: string; email?: string; phone?: string; address?: string; logo_url?: string; vat_number?: string };
  pdf_url?: string | null;
};

export default function QuoteSignPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ViewResult | null>(null);
  const [signName, setSignName] = useState("");
  const [refuseReason, setRefuseReason] = useState("");
  const [showRefuse, setShowRefuse] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionDone, setActionDone] = useState<"signed" | "refused" | null>(null);

  useEffect(() => {
    if (!token) return;
    loadQuote();
  }, [token]);

  const loadQuote = async () => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("quote-sign", {
        body: { token, action: "view" },
      });
      if (error) throw error;
      setData(result);
    } catch {
      setData({ valid: false, reason: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async () => {
    if (!signName.trim()) return;
    setSubmitting(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("quote-sign", {
        body: { token, action: "sign", signed_by_name: signName.trim() },
      });
      if (error) throw error;
      if (result?.success) {
        setActionDone("signed");
      }
    } catch {
      // Error handled
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefuse = async () => {
    setSubmitting(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("quote-sign", {
        body: { token, action: "refuse", refuse_reason: refuseReason.trim() || undefined },
      });
      if (error) throw error;
      if (result?.success) {
        setActionDone("refused");
      }
    } catch {
      // Error handled
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Invalid / expired states ──
  if (!data?.valid) {
    const reason = data?.reason;
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <AlertTriangle className="h-12 w-12 text-orange-500 mx-auto" />
            <h2 className="text-xl font-bold">
              {reason === "expired" ? "Offerta scaduta" :
               reason === "token_invalid" ? "Link non valido" :
               "Errore"}
            </h2>
            <p className="text-muted-foreground text-sm">
              {reason === "expired"
                ? "Questa offerta ha superato la data di validità. Contatta l'azienda per maggiori informazioni."
                : reason === "token_invalid"
                ? "Il link che hai utilizzato non è valido o è stato rimosso."
                : "Si è verificato un errore. Riprova più tardi."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const quote = data.quote!;
  const items = data.items || [];
  const company = data.company || {};
  const status = data.status;

  // ── Already signed or refused ──
  if (status === "accettata" || actionDone === "signed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle className="h-14 w-14 text-green-600 mx-auto" />
            <h2 className="text-xl font-bold">Offerta Accettata</h2>
            <p className="text-muted-foreground text-sm">
              {actionDone === "signed"
                ? "Grazie! L'offerta è stata accettata con successo. Riceverai una conferma a breve."
                : `Questa offerta è stata accettata da ${quote.signed_by_name || "—"} il ${quote.signed_at ? new Date(quote.signed_at).toLocaleDateString("it-IT") : "—"}.`}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "rifiutata" || actionDone === "refused") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <XCircle className="h-14 w-14 text-destructive mx-auto" />
            <h2 className="text-xl font-bold">Offerta Rifiutata</h2>
            <p className="text-muted-foreground text-sm">
              {actionDone === "refused"
                ? "L'offerta è stata rifiutata. L'azienda ne verrà informata."
                : "Questa offerta è stata rifiutata."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Active quote view ──
  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Company header */}
        <div className="text-center space-y-2">
          {company.logo_url ? (
            <img src={company.logo_url} alt={company.name} className="h-12 mx-auto object-contain" />
          ) : (
            <Building2 className="h-10 w-10 text-muted-foreground mx-auto" />
          )}
          <h1 className="text-2xl font-bold">{company.name || "Offerta"}</h1>
          {company.address && <p className="text-sm text-muted-foreground">{company.address}</p>}
        </div>

        {/* Quote info */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-lg">{quote.title || `Offerta ${quote.quote_number}`}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">N. {quote.quote_number}</p>
              </div>
              <Badge variant="outline" className="text-xs">
                <Calendar className="h-3 w-3 mr-1" />
                {new Date(quote.created_at).toLocaleDateString("it-IT")}
              </Badge>
            </div>
            {quote.valid_until && (
              <p className="text-xs text-muted-foreground mt-2">
                Valida fino al {new Date(quote.valid_until).toLocaleDateString("it-IT")}
              </p>
            )}
          </CardHeader>
          {quote.description && (
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground">{quote.description}</p>
            </CardContent>
          )}
        </Card>

        {/* Items table */}
        {items.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dettaglio Prodotti e Servizi</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Prodotto</TableHead>
                      <TableHead className="text-right">Q.tà</TableHead>
                      <TableHead className="text-right">Prezzo</TableHead>
                      <TableHead className="text-right">IVA</TableHead>
                      <TableHead className="text-right">Totale</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{item.name}</p>
                            {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm">{item.quantity} {item.unit_of_measure || ""}</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(item.unit_price)}</TableCell>
                        <TableCell className="text-right text-sm">{item.vat_rate}%</TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatCurrency(item.line_total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Totals */}
              <div className="mt-4 flex justify-end">
                <div className="w-full max-w-xs space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotale</span>
                    <span>{formatCurrency(quote.subtotal)}</span>
                  </div>
                  {(quote.discount_percent || 0) > 0 && (
                    <div className="flex justify-between text-destructive">
                      <span>Sconto {quote.discount_percent}%</span>
                      <span>-{formatCurrency(quote.discount_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IVA</span>
                    <span>{formatCurrency(quote.vat_amount)}</span>
                  </div>
                  <hr />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Totale</span>
                    <span>{formatCurrency(quote.total)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        {quote.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Note e Condizioni</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{quote.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* PDF download */}
        {data.pdf_url && (
          <div className="text-center">
            <Button variant="outline" asChild>
              <a href={data.pdf_url} target="_blank" rel="noopener noreferrer">
                <FileDown className="h-4 w-4 mr-2" />
                Scarica PDF completo
              </a>
            </Button>
          </div>
        )}

        {/* Sign / Refuse actions */}
        {status === "inviata" && !actionDone && (
          <Card className="border-2 border-primary/20">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Accetta o Rifiuta l'Offerta
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!showRefuse ? (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Il tuo nome completo (per la firma)</label>
                    <Input
                      value={signName}
                      onChange={(e) => setSignName(e.target.value)}
                      placeholder="Mario Rossi"
                      className="max-w-sm"
                    />
                  </div>
                  <div className="flex gap-3 flex-wrap">
                    <Button onClick={handleSign} disabled={!signName.trim() || submitting} size="lg">
                      {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                      Accetta Offerta
                    </Button>
                    <Button variant="outline" onClick={() => setShowRefuse(true)} size="lg">
                      <XCircle className="h-4 w-4 mr-2" />
                      Rifiuta
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Motivo del rifiuto (opzionale)</label>
                    <Textarea
                      value={refuseReason}
                      onChange={(e) => setRefuseReason(e.target.value)}
                      placeholder="Specifica il motivo..."
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-3 flex-wrap">
                    <Button variant="destructive" onClick={handleRefuse} disabled={submitting} size="lg">
                      {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
                      Conferma Rifiuto
                    </Button>
                    <Button variant="outline" onClick={() => setShowRefuse(false)} size="lg">
                      Annulla
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pt-4">
          Powered by Edilizia in Cloud
        </p>
      </div>
    </div>
  );
}
