import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, Check, Clock, Info, Send, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import { useComputeMaxDiscount } from "@/hooks/useDiscountRules";
import { usePermissions } from "@/hooks/usePermissions";

interface Props {
  quoteId: string;
  /** Sconto attualmente sul preventivo (discount_percent). */
  currentDiscount: number;
  /** Stato approvazione corrente. */
  approvalStatus?: "not_required" | "pending" | "approved" | "rejected" | "counter_proposed";
  /** Callback dopo update sconto locale. */
  onDiscountChange: (value: number) => void;
}

export function QuoteDiscountControl({
  quoteId,
  currentDiscount,
  approvalStatus = "not_required",
  onDiscountChange,
}: Props) {
  const qc = useQueryClient();
  // Autorizzazione a IMPOSTARE sconti oltre soglia = permesso PER-AZIENDA
  // (admin d'azienda o staff con can_approve_discounts). Prima arrivava come prop
  // canApproveDiscounts derivata dal ruolo GLOBALE del chiamante → uno staff marketing
  // multi-azienda poteva forzare sconti in un'azienda dove non è autorizzato.
  const { canApproveDiscounts } = usePermissions();
  const { data: limits, isLoading } = useComputeMaxDiscount(quoteId);

  const maxSconto = limits?.max_sconto_pct ?? 10;
  const approvaOltre = limits?.approva_oltre_pct ?? null;
  const margine = limits?.margine_pct_pre;

  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [requestedPct, setRequestedPct] = useState<number>(currentDiscount);
  const [requestNote, setRequestNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const needsApproval = useMemo(() => {
    if (canApproveDiscounts) return false;
    if (approvaOltre != null && currentDiscount > approvaOltre) return true;
    return currentDiscount > maxSconto;
  }, [canApproveDiscounts, approvaOltre, currentDiscount, maxSconto]);

  const effectiveMax = canApproveDiscounts ? 100 : maxSconto;

  const handleSlider = (val: number[]) => {
    const v = Math.min(val[0], effectiveMax);
    onDiscountChange(v);
  };

  const openRequest = () => {
    setRequestedPct(Math.max(currentDiscount, maxSconto + 1));
    setRequestNote("");
    setShowRequestDialog(true);
  };

  const submitRequest = async () => {
    if (!quoteId) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("request_quote_approval", {
        p_quote_id: quoteId,
        p_sconto_richiesto_pct: requestedPct,
        p_note: requestNote || null,
      });
      if (error) throw error;
      toast.success("Richiesta di autorizzazione inviata all'admin");
      setShowRequestDialog(false);
      qc.invalidateQueries({ queryKey: ["quote", quoteId] });
      qc.invalidateQueries({ queryKey: ["max-discount", quoteId] });
    } catch (e) {
      toast.error(`Errore: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = () => {
    switch (approvalStatus) {
      case "pending":
        return <Badge variant="outline" className="border-orange-500 text-orange-600"><Clock className="h-3 w-3 mr-1" />In attesa admin</Badge>;
      case "approved":
        return <Badge className="bg-green-600"><Check className="h-3 w-3 mr-1" />Approvato</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rifiutato</Badge>;
      case "counter_proposed":
        return <Badge className="bg-blue-600"><Send className="h-3 w-3 mr-1" />Contro-proposta</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4 rounded-lg border p-4 bg-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-medium text-sm flex items-center gap-2">
            Sconto applicato
            {statusBadge()}
          </h4>
          {!isLoading && (
            <p className="text-xs text-muted-foreground mt-1">
              Max consentito: <strong>{maxSconto.toFixed(1)}%</strong>
              {approvaOltre != null && <> · approvazione oltre {approvaOltre.toFixed(1)}%</>}
              {limits && limits.applied_rules.length > 0 && (
                <> · {limits.applied_rules.length} regol{limits.applied_rules.length > 1 ? "e" : "a"} applicat{limits.applied_rules.length > 1 ? "e" : "a"}</>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            step="0.1"
            min="0"
            max={effectiveMax}
            value={currentDiscount}
            onChange={(e) => handleSlider([Number(e.target.value)])}
            className="w-20 h-9 text-right"
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      </div>

      <Slider
        value={[currentDiscount]}
        onValueChange={handleSlider}
        min={0}
        max={Math.max(20, Math.ceil(effectiveMax))}
        step={0.5}
        disabled={approvalStatus === "pending"}
      />

      {!canApproveDiscounts && needsApproval && approvalStatus !== "pending" && (
        <Alert className="border-orange-500 bg-orange-50 dark:bg-orange-950/30">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertTitle className="text-orange-900 dark:text-orange-200">Sconto oltre il consentito</AlertTitle>
          <AlertDescription className="text-sm text-orange-900 dark:text-orange-200">
            Il limite per questo preventivo è {maxSconto.toFixed(1)}%. Per applicare uno sconto superiore
            serve l'autorizzazione di un admin.
            <div className="mt-2">
              <Button size="sm" variant="outline" onClick={openRequest}>
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Richiedi autorizzazione admin
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {approvalStatus === "pending" && (
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertDescription>
            Hai inviato una richiesta di autorizzazione. Attendi la decisione dell'admin prima di continuare.
          </AlertDescription>
        </Alert>
      )}

      {canApproveDiscounts && margine != null && (
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Info className="h-3 w-3" />
          Visibile solo admin: margine pre-sconto stimato <strong>{margine.toFixed(1)}%</strong>
          {limits && limits.applied_rules.length > 0 && (
            <span className="ml-2">
              · Regole: {limits.applied_rules.map((r) => r.name).join(", ")}
            </span>
          )}
        </div>
      )}

      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Richiedi autorizzazione sconto</DialogTitle>
            <DialogDescription>
              L'admin riceverà una notifica e potrà approvare, rifiutare o proporre un contro-sconto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Sconto richiesto (%)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={requestedPct}
                onChange={(e) => setRequestedPct(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Motivazione (opzionale)</Label>
              <Textarea
                placeholder="es. cliente strategico, primo ordine, trattativa già avanzata..."
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRequestDialog(false)}>Annulla</Button>
            <Button onClick={submitRequest} disabled={submitting}>
              {submitting ? "Invio..." : "Invia richiesta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
