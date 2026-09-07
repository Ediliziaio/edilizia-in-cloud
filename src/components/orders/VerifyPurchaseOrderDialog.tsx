/**
 * VerifyPurchaseOrderDialog — FASE 5.2
 * Dialog a step per avviare la verifica AI dell'OdA
 *
 * Step 1: Selezione modalita (confronto ordine / upload PDF / upload immagine)
 * Step 2: Upload/conferma
 * Step 3: Risultato inline
 */
import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck, Upload, FileText, Image as ImageIcon, Loader2,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { VerificationResultCard, type VerificationData } from "./VerificationResultCard";
import type { JSX } from "react";

// ── Types ─────────────────────────────────────────────────────────────────

export interface VerifyPurchaseOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseOrderId: string;
  odaNumber: string;
  orderId?: string | null;
  orderCode?: string | null;
  /** Path nel bucket order-attachments del documento gia' allegato all'ordine
   *  (conferma d'ordine del sito, modulo firmato, scontrino). Se c'e', la
   *  verifica puo' usarlo senza far ricaricare il file una seconda volta. */
  attachmentUrl?: string | null;
}

type VerificationMode = "auto" | "document_pdf" | "document_image" | "attachment";

// ── Component ─────────────────────────────────────────────────────────────

export function VerifyPurchaseOrderDialog({
  open, onOpenChange, purchaseOrderId, odaNumber, orderId, orderCode, attachmentUrl,
}: VerifyPurchaseOrderDialogProps): JSX.Element {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<VerificationMode>("auto");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [result, setResult] = useState<VerificationData | null>(null);

  const resetState = useCallback((): void => {
    setStep(1);
    setMode("auto");
    setUploadedFile(null);
    setResult(null);
  }, []);

  const handleOpenChange = useCallback((open: boolean): void => {
    if (!open) resetState();
    onOpenChange(open);
  }, [onOpenChange, resetState]);

  // ── Verify mutation ─────────────────────────────────────────────────

  const verifyMutation = useMutation({
    mutationFn: async (): Promise<VerificationData> => {
      let supplierDocumentBase64: string | undefined;

      if (mode === "attachment" && attachmentUrl) {
        // Il documento sta gia' nello storage: si scarica e si manda come se
        // fosse stato caricato ora. E' lo stesso file che si vede nella scheda
        // "Conferma d'ordine" del dettaglio.
        const { data: signed, error: signErr } = await supabase.storage
          .from("order-attachments")
          .createSignedUrl(attachmentUrl, 600);
        if (signErr || !signed?.signedUrl) {
          throw new Error("Documento allegato non scaricabile dallo storage");
        }
        const resp = await fetch(signed.signedUrl);
        if (!resp.ok) throw new Error("Documento allegato non scaricabile");
        const bytes = new Uint8Array(await resp.arrayBuffer());
        if (bytes.length > 10 * 1024 * 1024) throw new Error("Documento troppo grande (max 10MB)");
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const base = btoa(binary);
        // Le immagini vanno marcate col prefisso, altrimenti l'edge le tratta
        // da PDF e Claude riceve bytes JPEG dentro un blocco document.
        const isImg = /\.(jpe?g|png|webp)$/i.test(attachmentUrl);
        supplierDocumentBase64 = isImg ? `data:image/jpeg;base64,${base}` : base;
      }

      if ((mode === "document_pdf" || mode === "document_image") && uploadedFile) {
        const arrayBuffer = await uploadedFile.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        supplierDocumentBase64 = btoa(binary);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Non autenticato");

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-purchase-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            purchase_order_id: purchaseOrderId,
            order_id: orderId || undefined,
            verification_mode: mode === "auto" ? "auto" : "document_upload",
            supplier_document_base64: supplierDocumentBase64,
          }),
        },
      );

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(errBody.error || `Errore ${resp.status}`);
      }

      return resp.json() as Promise<VerificationData>;
    },
    onSuccess: (data: VerificationData) => {
      setResult(data);
      setStep(3);
      queryClient.invalidateQueries({ queryKey: ["purchase-order-verifications", purchaseOrderId] });
      queryClient.invalidateQueries({ queryKey: ["purchase-order-detail", purchaseOrderId] });
    },
    onError: (e: Error) => {
      toast.error("Errore nella verifica AI", { description: e.message });
    },
  });

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File troppo grande (max 10MB)");
        return;
      }
      setUploadedFile(file);
    }
  }, []);

  const canStartVerification = (): boolean => {
    if (mode === "auto") return !!orderId;
    if (mode === "attachment") return !!attachmentUrl;
    return !!uploadedFile;
  };

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Verifica AI — {odaNumber}
          </DialogTitle>
          <DialogDescription>
            Confronta l'ordine d'acquisto con il documento del cliente o del fornitore usando l'intelligenza artificiale.
          </DialogDescription>
        </DialogHeader>

        {/* Step 1 — Mode Selection */}
        {step === 1 && (
          <div className="space-y-4 py-2">
            <Label className="text-sm font-medium">Seleziona modalità di verifica</Label>
            <div className="grid gap-3">
              {/* Auto mode */}
              <button
                type="button"
                onClick={() => setMode("auto")}
                disabled={!orderId}
                className={`flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-colors ${
                  mode === "auto" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                } ${!orderId ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <FileText className="h-5 w-5 mt-0.5 text-primary shrink-0" />
                <div>
                  <p className="font-medium text-sm">Confronta con Commessa Cliente</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {orderId
                      ? `Confronto automatico degli articoli dell'OdA con la commessa ${orderCode || ""}`
                      : "Non disponibile — OdA non collegato a una commessa"}
                  </p>
                </div>
              </button>

              {/* Documento gia' allegato all'ordine */}
              {attachmentUrl && (
                <button
                  type="button"
                  onClick={() => setMode("attachment")}
                  className={`flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-colors cursor-pointer ${
                    mode === "attachment" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
                >
                  <ShieldCheck className="h-5 w-5 mt-0.5 text-primary shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Usa il documento allegato all'ordine</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Confronta la conferma d'ordine gia' caricata ({attachmentUrl.split("/").pop()}) senza ricaricarla
                    </p>
                  </div>
                </button>
              )}

              {/* PDF upload */}
              <button
                type="button"
                onClick={() => setMode("document_pdf")}
                className={`flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-colors cursor-pointer ${
                  mode === "document_pdf" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
              >
                <Upload className="h-5 w-5 mt-0.5 text-primary shrink-0" />
                <div>
                  <p className="font-medium text-sm">Carica Preventivo Fornitore (PDF)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Carica il PDF del preventivo o della conferma d'ordine del fornitore
                  </p>
                </div>
              </button>

              {/* Image upload */}
              <button
                type="button"
                onClick={() => setMode("document_image")}
                className={`flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-colors cursor-pointer ${
                  mode === "document_image" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
              >
                <ImageIcon className="h-5 w-5 mt-0.5 text-primary shrink-0" />
                <div>
                  <p className="font-medium text-sm">Carica Preventivo Fornitore (Foto)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Carica una foto o scansione del preventivo del fornitore
                  </p>
                </div>
              </button>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setStep(2)}>
                Avanti
              </Button>
            </div>
          </div>
        )}

        {/* Step 2 — Upload/Confirm */}
        {step === 2 && (
          <div className="space-y-4 py-2">
            {mode === "auto" || mode === "attachment" ? (
              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-medium">Riepilogo confronto</p>
                <p className="text-xs text-muted-foreground">
                  {mode === "auto"
                    ? <>L'AI confronterà gli articoli dell'OdA <strong>{odaNumber}</strong> con quelli della commessa cliente <strong>{orderCode || ""}</strong>.</>
                    : <>L'AI confronterà il documento allegato (<strong>{attachmentUrl?.split("/").pop()}</strong>) con il contenuto dell'OdA <strong>{odaNumber}</strong>{orderCode ? <> e della commessa <strong>{orderCode}</strong></> : null}.</>}
                </p>
                <p className="text-xs text-muted-foreground">
                  Verranno verificati: quantità, prezzi, descrizioni e specifiche tecniche.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <Label>Carica documento fornitore</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  {uploadedFile ? (
                    <div className="space-y-2">
                      <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                      <p className="text-sm font-medium">{uploadedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setUploadedFile(null)}
                      >
                        Cambia file
                      </Button>
                    </div>
                  ) : (
                    <label className="cursor-pointer space-y-2 block">
                      <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
                      <p className="text-sm text-muted-foreground">
                        {mode === "document_pdf"
                          ? "Clicca per caricare un PDF (max 10MB)"
                          : "Clicca per caricare un'immagine (max 10MB)"}
                      </p>
                      <input
                        type="file"
                        className="hidden"
                        accept={mode === "document_pdf" ? ".pdf" : "image/*"}
                        onChange={handleFileChange}
                      />
                    </label>
                  )}
                </div>
              </div>
            )}

            {/* Processing state */}
            {verifyMutation.isPending && (
              <div className="rounded-lg border p-6 bg-primary/5 text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                <p className="text-sm font-medium">Analisi in corso...</p>
                <p className="text-xs text-muted-foreground">
                  L'AI sta confrontando i documenti. Potrebbe richiedere fino a 60 secondi.
                </p>
                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                  <div className="bg-primary h-full animate-pulse rounded-full" style={{ width: "70%" }} />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(1)} disabled={verifyMutation.isPending}>
                Indietro
              </Button>
              <Button
                onClick={() => verifyMutation.mutate()}
                disabled={!canStartVerification() || verifyMutation.isPending}
              >
                {verifyMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifica in corso...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4 mr-2" />
                    Avvia Verifica
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3 — Results */}
        {step === 3 && result && (
          <div className="space-y-4 py-2">
            <VerificationResultCard data={result} />
            <div className="flex justify-end">
              <Button onClick={() => handleOpenChange(false)}>Chiudi</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
