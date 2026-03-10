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
  AlertTriangle, ShieldCheck, Clock,
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f4f4f5" }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#71717a" }} />
      </div>
    );
  }

  // ── Invalid / expired ──
  if (!data?.valid) {
    const reason = data?.reason;
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#f4f4f5" }}>
        <div className="max-w-md w-full text-center space-y-4 rounded-xl p-8 shadow-lg border" style={{ background: "#ffffff" }}>
          {reason === "expired" ? (
            <Clock className="h-12 w-12 mx-auto" style={{ color: "#f59e0b" }} />
          ) : (
            <AlertTriangle className="h-12 w-12 mx-auto" style={{ color: "#ef4444" }} />
          )}
          <h2 className="text-xl font-bold" style={{ color: "#18181b" }}>
            {reason === "expired" ? "Offerta Scaduta" :
             reason === "token_invalid" ? "Link Non Valido" : "Errore"}
          </h2>
          <p className="text-sm" style={{ color: "#71717a" }}>
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
  const hasDiscounts = items.some(i => i.discount_percent > 0);

  // ── Already signed ──
  if (status === "accettata" || actionDone === "signed") {
    return (
      <div className="min-h-screen" style={{ background: "#f4f4f5" }}>
        <BlueHeader company={company} quoteNumber={quote.quote_number} statusLabel="Accettata" statusColor="#22c55e" />
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="rounded-xl p-8 shadow-lg border text-center space-y-4" style={{ background: "#ffffff" }}>
            <CheckCircle className="h-16 w-16 mx-auto" style={{ color: "#22c55e" }} />
            <h2 className="text-2xl font-bold" style={{ color: "#18181b" }}>Offerta Accettata</h2>
            <p style={{ color: "#71717a" }}>
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
      <div className="min-h-screen" style={{ background: "#f4f4f5" }}>
        <BlueHeader company={company} quoteNumber={quote.quote_number} statusLabel="Rifiutata" statusColor="#ef4444" />
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="rounded-xl p-8 shadow-lg border text-center space-y-4" style={{ background: "#ffffff" }}>
            <XCircle className="h-16 w-16 mx-auto" style={{ color: "#ef4444" }} />
            <h2 className="text-2xl font-bold" style={{ color: "#18181b" }}>Offerta Rifiutata</h2>
            <p style={{ color: "#71717a" }}>
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
    <div className="min-h-screen" style={{ background: "#f4f4f5" }}>
      <BlueHeader company={company} quoteNumber={quote.quote_number} statusLabel="In attesa di firma" statusColor="#f59e0b" />

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Quote info + Company info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl p-6 shadow-sm border" style={{ background: "#ffffff" }}>
            <h3 className="font-semibold text-sm mb-3" style={{ color: "#71717a" }}>DETTAGLI OFFERTA</h3>
            <p className="font-bold text-lg" style={{ color: "#18181b" }}>
              {quote.title || `Offerta ${quote.quote_number}`}
            </p>
            <p className="text-sm mt-1" style={{ color: "#71717a" }}>
              N. {quote.quote_number} • {new Date(quote.created_at).toLocaleDateString("it-IT")}
            </p>
            {quote.description && (
              <p className="text-sm mt-3" style={{ color: "#52525b" }}>{quote.description}</p>
            )}
          </div>

          <div className="rounded-xl p-6 shadow-sm border" style={{ background: "#ffffff" }}>
            <h3 className="font-semibold text-sm mb-3" style={{ color: "#71717a" }}>AZIENDA</h3>
            <div className="space-y-1 text-sm">
              {company.name && <p className="font-bold" style={{ color: "#18181b" }}>{company.name}</p>}
              {company.address && <p style={{ color: "#52525b" }}>{company.address}</p>}
              {company.phone && <p style={{ color: "#52525b" }}>Tel: {company.phone}</p>}
              {company.email && <p style={{ color: "#52525b" }}>{company.email}</p>}
              {company.vat_number && <p style={{ color: "#71717a" }}>P.IVA: {company.vat_number}</p>}
            </div>
            {quote.expires_at && (
              <div className="flex items-center gap-1.5 text-xs mt-4 px-3 py-1.5 rounded-full" style={{ background: "#fef3c7", color: "#92400e" }}>
                <Calendar className="h-3 w-3" />
                Valida fino al {new Date(quote.expires_at).toLocaleDateString("it-IT")}
              </div>
            )}
          </div>
        </div>

        {/* Items table */}
        {items.length > 0 && (
          <div className="rounded-xl shadow-sm border overflow-hidden" style={{ background: "#ffffff" }}>
            <div className="px-6 py-4 border-b">
              <h3 className="font-semibold" style={{ color: "#18181b" }}>Dettaglio Prodotti e Servizi</h3>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow style={{ background: "#f8fafc" }}>
                    <TableHead>Prodotto</TableHead>
                    <TableHead className="text-right">Q.tà</TableHead>
                    <TableHead className="text-right">Prezzo Unit.</TableHead>
                    {hasDiscounts && <TableHead className="text-right">Sconto</TableHead>}
                    <TableHead className="text-right">IVA</TableHead>
                    <TableHead className="text-right">Totale</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm" style={{ color: "#18181b" }}>{item.name}</p>
                          {item.description && (
                            <p className="text-xs mt-0.5" style={{ color: "#71717a" }}>{item.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {item.quantity} {item.unit_of_measure || ""}
                      </TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(item.unit_price)}</TableCell>
                      {hasDiscounts && (
                        <TableCell className="text-right text-sm" style={{ color: item.discount_percent > 0 ? "#ef4444" : "#71717a" }}>
                          {item.discount_percent > 0 ? `-${item.discount_percent}%` : "—"}
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
            <div className="px-6 py-4 border-t" style={{ background: "#f8fafc" }}>
              <div className="flex justify-end">
                <div className="w-full max-w-xs space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span style={{ color: "#71717a" }}>Subtotale</span>
                    <span>{formatCurrency(quote.subtotal)}</span>
                  </div>
                  {(quote.discount_percent || 0) > 0 && (
                    <div className="flex justify-between" style={{ color: "#ef4444" }}>
                      <span>Sconto {quote.discount_percent}%</span>
                      <span>-{formatCurrency(quote.discount_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span style={{ color: "#71717a" }}>IVA</span>
                    <span>{formatCurrency(quote.vat_amount)}</span>
                  </div>
                  <hr style={{ borderColor: "#e4e4e7" }} />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Totale</span>
                    <span style={{ color: "#1e3a5f" }}>{formatCurrency(quote.total)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        {quote.notes && (
          <div className="rounded-xl p-6 shadow-sm border" style={{ background: "#ffffff" }}>
            <h3 className="font-semibold mb-3" style={{ color: "#18181b" }}>Note e Condizioni</h3>
            <p className="text-sm whitespace-pre-wrap" style={{ color: "#52525b" }}>{quote.notes}</p>
          </div>
        )}

        {/* PDF download */}
        {data.pdf_url && (
          <div className="text-center">
            <a
              href={data.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border"
              style={{ color: "#1e3a5f", borderColor: "#cbd5e1", background: "#ffffff" }}
            >
              <FileDown className="h-4 w-4" />
              Scarica PDF completo
            </a>
          </div>
        )}

        {/* Sign / Refuse section — dark blue box */}
        {status === "inviata" && !actionDone && (
          <div className="rounded-xl p-6 shadow-lg space-y-5" style={{ background: "#1e3a5f", color: "#ffffff" }}>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" style={{ color: "#93c5fd" }} />
              <h3 className="font-semibold text-lg">Accetta o Rifiuta l'Offerta</h3>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>
                Il tuo nome completo (per la firma)
              </label>
              <Input
                value={signName}
                onChange={(e) => setSignName(e.target.value)}
                placeholder="Mario Rossi"
                className="max-w-sm border-0"
                style={{ background: "rgba(255,255,255,0.15)", color: "#ffffff" }}
              />
            </div>

            <div className="flex gap-3 flex-wrap">
              <Button
                onClick={handleSign}
                disabled={!signName.trim() || submitting}
                size="lg"
                className="min-w-[180px]"
                style={{ background: "#22c55e", color: "#ffffff" }}
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
                style={{ borderColor: "rgba(255,255,255,0.3)", color: "#ffffff", background: "transparent" }}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Rifiuta
              </Button>
            </div>

            <p className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
              Accettando questa offerta confermi i termini e le condizioni indicate.
              La firma digitale ha valore legale ai sensi del Regolamento eIDAS (UE) n. 910/2014 e dell'art. 20 del CAD (D.Lgs. 82/2005).
              Il tuo nome, indirizzo IP e data/ora saranno registrati come prova della firma.
            </p>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs pt-4 pb-8" style={{ color: "#a1a1aa" }}>
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

// ── Blue Header component ──
function BlueHeader({
  company,
  quoteNumber,
  statusLabel,
  statusColor,
}: {
  company: { name?: string; logo_url?: string };
  quoteNumber: string;
  statusLabel: string;
  statusColor: string;
}) {
  return (
    <div style={{ background: "#1e3a5f" }}>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {company.logo_url ? (
              <img
                src={company.logo_url}
                alt={company.name}
                className="h-12 w-12 object-contain rounded-lg p-1"
                style={{ background: "rgba(255,255,255,0.15)" }}
              />
            ) : (
              <div className="h-12 w-12 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.15)" }}>
                <Building2 className="h-6 w-6" style={{ color: "#ffffff" }} />
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold" style={{ color: "#ffffff" }}>{company.name || "Offerta"}</h1>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>Offerta n. {quoteNumber}</p>
            </div>
          </div>
          <span
            className="text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{ background: statusColor, color: "#ffffff" }}
          >
            {statusLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
