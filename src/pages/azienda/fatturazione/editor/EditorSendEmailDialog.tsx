import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, Send, Loader2, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { EditorState } from "./useEditorState";

const TIPO_LABELS: Record<string, string> = {
  fattura: "Fattura", fattura_pa: "Fattura PA", proforma: "Proforma",
  nota_credito: "Nota di Credito", nota_debito: "Nota di Debito",
  ddt: "DDT", parcella: "Parcella",
  fattura_accompagnatoria: "Fattura Accompagnatoria",
};

interface Props {
  state: EditorState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditorSendEmailDialog({ state, open, onOpenChange }: Props) {
  const docLabel = TIPO_LABELS[state.tipo] || "Documento";
  const cliente = state.cliente_snapshot as Record<string, any> | null;

  // Fetch email from anagrafica if available
  const { data: anagraficaData } = useQuery({
    queryKey: ["anagrafica-email", state.anagrafica_id],
    enabled: open && !!state.anagrafica_id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("anagrafiche_native")
        .select("email, pec")
        .eq("id", state.anagrafica_id!)
        .maybeSingle();
      return data as { email?: string; pec?: string } | null;
    },
  });

  // Derive customer email: anagrafica email > anagrafica pec > snapshot pec
  const customerEmail = anagraficaData?.email || anagraficaData?.pec || cliente?.pec || cliente?.email || "";

  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setToEmail(customerEmail);
      setSubject(`${docLabel} N° ${state.numero || "—"}`);
      setMessage("");
      setIsSending(false);
    }
  }, [open, customerEmail, docLabel, state.numero]);

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSend = useCallback(async () => {
    if (!state.id || !toEmail) return;
    if (!isValidEmail(toEmail)) {
      toast.error("Indirizzo email non valido");
      return;
    }

    setIsSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await supabase.functions.invoke("send-documento-email", {
        body: {
          documento_id: state.id,
          to_email: toEmail,
          subject: subject || undefined,
          message: message || undefined,
        },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });

      if (resp.error) throw new Error(resp.error.message);
      const result = resp.data as { success?: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || "Errore sconosciuto");
      }

      toast.success("Email inviata", { description: `Inviata a ${toEmail}` });
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Errore invio email", { description: err.message });
    } finally {
      setIsSending(false);
    }
  }, [state.id, toEmail, subject, message, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Invia {docLabel} via email
          </DialogTitle>
          <DialogDescription>
            {docLabel} N° {state.numero} verrà inviata al destinatario con tutti i dettagli.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Destinatario */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Destinatario *</Label>
            <Input
              type="email"
              placeholder="email@cliente.it"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              className={!toEmail ? "border-amber-300" : ""}
            />
            {!customerEmail && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600">
                <AlertCircle className="h-3 w-3" />
                <span>Nessuna email trovata per il cliente. Inserisci manualmente.</span>
              </div>
            )}
          </div>

          {/* Oggetto */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Oggetto</Label>
            <Input
              placeholder={`${docLabel} N° ${state.numero || ""}`}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          {/* Messaggio personalizzato */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Messaggio (opzionale)</Label>
            <Textarea
              placeholder="Aggiungi un messaggio personalizzato per il cliente..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <p className="text-[11px] text-muted-foreground">
              I dettagli del documento (righe, totali, scadenza, IBAN) verranno inclusi automaticamente.
            </p>
          </div>

          {/* Riepilogo documento */}
          <div className="rounded-lg bg-muted/50 border p-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Riepilogo</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
              <span className="text-muted-foreground">Documento:</span>
              <span className="font-medium">{docLabel} {state.numero}</span>
              <span className="text-muted-foreground">Cliente:</span>
              <span className="font-medium truncate">
                {(cliente?.ragione_sociale || `${cliente?.nome || ""} ${cliente?.cognome || ""}`.trim()) || "—"}
              </span>
              <span className="text-muted-foreground">Totale:</span>
              <span className="font-bold text-primary">
                {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(state.totale_da_pagare ?? 0)}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Annulla
          </Button>
          <Button
            onClick={handleSend}
            disabled={isSending || !toEmail || !isValidEmail(toEmail)}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1.5" />
            )}
            {isSending ? "Invio in corso..." : "Invia email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
