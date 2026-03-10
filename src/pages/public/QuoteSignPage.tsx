import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CheckCircle, XCircle, FileDown, Loader2, Building2, Calendar,
  AlertTriangle, ShieldCheck,
} from "lucide-react";

type QuoteData = {
  quote_number: string;
  title: string;
  description: string;
  notes: string;
  client_name: string;
  client_company: string;
  expires_at: string | null;
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
  item_type?: string;
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
  const [showRefuseDialog, setShowRefuseDialog] = useState(false);
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
      if (result?.success) setActionDone("signed");
    } catch (err: any) {
      toast.error(err?.message || "Errore durante l'accettazione. Riprova.");
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
        setShowRefuseDialog(false);
        setActionDone("refused");
      }
    } catch (err: any) {
      toast.error(err?.message || "Errore durante il rifiuto. Riprova.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Invalid / expired ──
  if (!data?.valid) {
    const reason = data?.reason;
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="max-w-md w-full text-center space-y-4 bg-background rounded-xl p-8 shadow-lg border">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="text-xl font-bold">
            {reason === "expired" ? "Offerta scaduta" :
             reason === "token_invalid" ? "Link non valido" : "Errore"}
          </h2>
          <p className="text-muted-foreground text-sm">
            {reason === "expired"
              ? "Questa offerta ha superato la data di validità. Contatta l'azienda per maggiori informazioni."
              : reason === "token_invalid"
              ? "Il link che hai utilizzato non è valido o è stato rimosso."
              : "Si è verificato un errore. Riprova più tardi."}
          </p>
        </div>
      </div>
    );
  }

  const quote = data.quote!;
  const items = data.items || [];
  const company = data.company || {};
  const status = data.status;

  // ── Already signed ──
  if (status === "accettata" || actionDone === "signed") {
    return (
      <div className="min-h-screen bg-muted/30">
        <Header company={company} />
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="bg-background rounded-xl p-8 shadow-lg border text-center space-y-4">
            <CheckCircle className="h-16 w-16 text-primary mx-auto" />
            <h2 className="text-2xl font-bold">Offerta Accettata</h2>
            <p className="text-muted-foreground">
              {actionDone === "signed"
                ? "Grazie! L'offerta è stata accettata con successo. Riceverai una conferma a breve."
                : `Questa offerta è stata accettata da ${quote.signed_by_name || "—"} il ${quote.signed_at ? new Date(quote.signed_at).toLocaleDateString("it-IT") : "—"}.`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Already refused ──
  if (status === "rifiutata" || actionDone === "refused") {
    return (
      <div className="min-h-screen bg-muted/30">
        <Header company={company} />
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="bg-background rounded-xl p-8 shadow-lg border text-center space-y-4">
            <XCircle className="h-16 w-16 text-destructive mx-auto" />
            <h2 className="text-2xl font-bold">Offerta Rifiutata</h2>
            <p className="text-muted-foreground">
              {actionDone === "refused"
                ? "L'offerta è stata rifiutata. L'azienda ne verrà informata."
                : "Questa offerta è stata rifiutata."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Active quote ──
  return (
    <div className="min-h-screen bg-muted/30">
      <Header company={company} />

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Quote title & info */}
        <div className="bg-background rounded-xl p-6 shadow-sm border">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-bold">
                {quote.title || `Offerta ${quote.quote_number}`}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                N. {quote.quote_number} • {new Date(quote.created_at).toLocaleDateString("it-IT")}
              </p>
            </div>
            {quote.expires_at && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
                <Calendar className="h-3 w-3" />
                Valida fino al {new Date(quote.expires_at).toLocaleDateString("it-IT")}
              </div>
            )}
          </div>
          {quote.description && (
            <p className="text-sm text-muted-foreground mt-4">{quote.description}</p>
          )}
        </div>

        {/* Items table */}
        {items.length > 0 && (
          <div className="bg-background rounded-xl shadow-sm border overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h3 className="font-semibold">Dettaglio Prodotti e Servizi</h3>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Prodotto</TableHead>
                    <TableHead className="text-right">Q.tà</TableHead>
                    <TableHead className="text-right">Prezzo Unit.</TableHead>
                    {items.some(i => i.discount_percent > 0) && (
                      <TableHead className="text-right">Sconto</TableHead>
                    )}
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
                          {item.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {item.quantity} {item.unit_of_measure || ""}
                      </TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(item.unit_price)}</TableCell>
                      {items.some(i => i.discount_percent > 0) && (
                        <TableCell className="text-right text-sm">
                          {item.discount_percent > 0 ? `${item.discount_percent}%` : "—"}
                        </TableCell>
                      )}
                      <TableCell className="text-right text-sm">{item.vat_rate}%</TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {formatCurrency(item.line_total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Totals */}
            <div className="px-6 py-4 border-t bg-muted/30">
              <div className="flex justify-end">
                <div className="w-full max-w-xs space-y-1.5 text-sm">
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
                  <hr className="border-border" />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Totale</span>
                    <span>{formatCurrency(quote.total)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        {quote.notes && (
          <div className="bg-background rounded-xl p-6 shadow-sm border">
            <h3 className="font-semibold mb-3">Note e Condizioni</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{quote.notes}</p>
          </div>
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

        {/* Sign / Refuse section */}
        {status === "inviata" && !actionDone && (
          <div className="bg-card rounded-xl p-6 shadow-lg border-2 border-primary/20 space-y-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Accetta o Rifiuta l'Offerta</h3>
            </div>

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
              <Button
                onClick={handleSign}
                disabled={!signName.trim() || submitting}
                size="lg"
                className="min-w-[180px]"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Accetta Offerta
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowRefuseDialog(true)}
                size="lg"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Rifiuta
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Accettando questa offerta confermi i termini e le condizioni indicate.
              La firma digitale ha valore legale ai sensi dell'art. 20 del CAD.
            </p>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pt-4 pb-8">
          Powered by Edilizia in Cloud
        </p>
      </div>

      {/* Refuse Dialog */}
      <Dialog open={showRefuseDialog} onOpenChange={setShowRefuseDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rifiuta Offerta</DialogTitle>
            <DialogDescription>
              Sei sicuro di voler rifiutare l'offerta {quote.quote_number}? L'azienda verrà informata.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Motivo del rifiuto (opzionale)</label>
            <Textarea
              value={refuseReason}
              onChange={(e) => setRefuseReason(e.target.value)}
              placeholder="Specifica il motivo..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRefuseDialog(false)}>
              Annulla
            </Button>
            <Button variant="destructive" onClick={handleRefuse} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
              Conferma Rifiuto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Header component ──
function Header({ company }: { company: { name?: string; logo_url?: string; address?: string; phone?: string; email?: string; vat_number?: string } }) {
  return (
    <div className="bg-primary text-primary-foreground">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center gap-4">
          {company.logo_url ? (
            <img
              src={company.logo_url}
              alt={company.name}
              className="h-12 w-12 object-contain rounded-lg bg-background/10 p-1"
            />
          ) : (
            <div className="h-12 w-12 rounded-lg bg-background/10 flex items-center justify-center">
              <Building2 className="h-6 w-6" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold">{company.name || "Offerta"}</h1>
            {company.address && (
              <p className="text-sm opacity-80">{company.address}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
