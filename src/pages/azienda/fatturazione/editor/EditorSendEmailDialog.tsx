import { useState, useEffect, useCallback, useRef } from "react";
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
import type { ClienteSnapshot } from "@/types/fatturazione";
import type { EditorState } from "./useEditorState";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  /** Salva le modifiche in volo prima di inviare: il server genera l'email dal
   *  documento salvato, non da ciò che è a schermo. */
  saveNow: () => Promise<void>;
}

export function EditorSendEmailDialog({ state, open, onOpenChange, saveNow }: Props) {
  const t = useT();
  const docLabel = TIPO_LABELS[state.tipo] || "Documento";
  const cliente = state.cliente_snapshot as (ClienteSnapshot & { email?: string }) | null | undefined;
  // Una bozza ha già il suo numero (01/10/2026) ma non è emessa: inviarla al
  // cliente significa mandargli un documento non emesso. Si emette prima.
  const isBozza = state.stato === "bozza";

  // Fetch email from anagrafica if available
  const { data: anagraficaData } = useQuery({
    queryKey: ["anagrafica-email", state.anagrafica_id],
    enabled: open && !!state.anagrafica_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("anagrafiche_native")
        .select("email, pec")
        .eq("id", state.anagrafica_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Derive customer email: anagrafica email > anagrafica pec > snapshot pec
  const customerEmail = anagraficaData?.email || anagraficaData?.pec || cliente?.pec || cliente?.email || "";

  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const richiesteInCorso = useRef(new Map<string, string>());
  const sendingRef = useRef(false);
  const openedDocument = useRef<string | null>(null);
  const recipientEdited = useRef(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) {
      openedDocument.current = null;
      return;
    }
    const documentKey = state.id || `${state.tipo}:${state.numero}`;
    if (openedDocument.current !== documentKey) {
      openedDocument.current = documentKey;
      recipientEdited.current = false;
      setToEmail(customerEmail);
      setSubject(`${docLabel} N° ${state.numero || "—"}`);
      setMessage("");
    } else if (!recipientEdited.current) {
      // L'anagrafica può arrivare dopo che l'utente ha iniziato a scrivere:
      // precompila solo il destinatario non modificato, senza azzerare la bozza.
      setToEmail(customerEmail);
    }
  }, [open, customerEmail, docLabel, state.id, state.tipo, state.numero]);

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSend = useCallback(async () => {
    if (sendingRef.current || !state.id || !toEmail) return;
    if (isBozza) {
      toast.error(t("Documento in bozza"), { description: t("Emetti il documento prima di inviarlo via email.") });
      return;
    }
    if (!isValidEmail(toEmail)) {
      toast.error(t("Indirizzo email non valido"));
      return;
    }

    sendingRef.current = true;
    setIsSending(true);
    // Il salvataggio automatico aspetta 2 secondi: un dettaglio appena modificato
    // (una riga, una nota) non sarebbe nel PDF allegato, perché l'email si genera
    // dal documento salvato. Salviamo prima, come per «Emetti» e «Invia a SDI».
    try {
      await saveNow();
    } catch (err) {
      toast.error(t("Modifiche non salvate: email non inviata"), { description: (err as Error).message });
      setIsSending(false);
      sendingRef.current = false;
      return;
    }
    try {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(
        JSON.stringify([toEmail.trim().toLowerCase(), subject, message]),
      ));
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const chiave = `eic:documento-email:${state.id}:${hash}`;
      let id = richiesteInCorso.current.get(chiave);
      try { id ??= sessionStorage.getItem(chiave) ?? undefined; } catch { /* solo memoria */ }
      id ??= crypto.randomUUID();
      richiesteInCorso.current.set(chiave, id);
      try { sessionStorage.setItem(chiave, id); } catch { /* solo memoria */ }
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await supabase.functions.invoke("send-documento-email", {
        body: {
          documento_id: state.id,
          to_email: toEmail,
          subject: subject || undefined,
          message: message || undefined,
          request_id: id,
        },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });

      if (resp.error) {
        const ctx = (resp.error as { context?: Response }).context;
        const corpo = ctx instanceof Response ? await ctx.clone().json().catch((): null => null) : null;
        throw new Error(corpo?.error ?? t("Risposta dell’invio non disponibile. Premi «Invia» per verificare la stessa richiesta."));
      }
      const result = resp.data as { success?: boolean; error?: string; stato?: string };
      if (result.stato === "in_corso" || result.stato === "incerto") {
        toast.warning(result.stato === "in_corso" ? t("Invio in corso") : t("Esito dell’invio da verificare"), {
          description: t("Premi «Invia» per controllare questa richiesta nel registro. Il controllo non spedisce una seconda email."),
        });
        return;
      }
      if (!result.success) {
        throw new Error(result.error || t("Errore sconosciuto"));
      }

      toast.success(t("Email inviata"), { description: t("Inviata a {toEmail}", { toEmail: String(toEmail ?? "") }) });
      richiesteInCorso.current.delete(chiave);
      try { sessionStorage.removeItem(chiave); } catch { /* solo memoria */ }
      onOpenChange(false);
    } catch (err) {
      toast.error(t("Errore invio email"), { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsSending(false);
      sendingRef.current = false;
    }
  }, [state.id, toEmail, subject, message, onOpenChange, saveNow, isBozza]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!sendingRef.current) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            {t("Invia {documento} via email", { documento: t(docLabel) })}
          </DialogTitle>
          <DialogDescription>{t("{docLabel} N° {numero} verrà inviata al destinatario con tutti i dettagli.", { docLabel: t(docLabel), numero: String(state.numero ?? "") })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Bozza: non si invia un documento non ancora emesso */}
          {isBozza && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{t("Questo documento è ancora una bozza: ha già il suo numero ({numero}), ma non è emesso. Emettilo prima di inviarlo al cliente.", { numero: String(state.numero ?? "") })}</span>
            </div>
          )}

          {/* Destinatario */}
          <div className="space-y-1.5">
            <Label htmlFor="document-email-to" className="text-sm font-medium">{t("Destinatario *")}</Label>
            <Input
              id="document-email-to"
              disabled={isSending}
              type="email"
              placeholder="email@cliente.it"
              value={toEmail}
              onChange={(e) => { recipientEdited.current = true; setToEmail(e.target.value); }}
              className={!toEmail ? "border-amber-300" : ""}
            />
            {!customerEmail && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600">
                <AlertCircle className="h-3 w-3" />
                <span>{t("Nessuna email trovata per il cliente. Inserisci manualmente.")}</span>
              </div>
            )}
          </div>

          {/* Oggetto */}
          <div className="space-y-1.5">
            <Label htmlFor="document-email-subject" className="text-sm font-medium">{t("Oggetto")}</Label>
            <Input
              id="document-email-subject"
              disabled={isSending}
              placeholder={`${docLabel} N° ${state.numero || ""}`}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          {/* Messaggio personalizzato */}
          <div className="space-y-1.5">
            <Label htmlFor="document-email-message" className="text-sm font-medium">{t("Messaggio (opzionale)")}</Label>
            <Textarea
              id="document-email-message"
              disabled={isSending}
              placeholder={t("Aggiungi un messaggio personalizzato per il cliente...")}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <p className="text-[11px] text-muted-foreground">
              {t("I dettagli del documento (righe, totali, scadenza, IBAN) verranno inclusi automaticamente.")}
            </p>
          </div>

          {/* Riepilogo documento */}
          <div className="rounded-lg bg-muted/50 border p-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("Riepilogo")}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
              <span className="text-muted-foreground">{t("Documento:")}</span>
              <span className="font-medium">{t(docLabel)} {state.numero}</span>
              <span className="text-muted-foreground">{t("Cliente:")}</span>
              <span className="font-medium truncate">
                {(cliente?.ragione_sociale || `${cliente?.nome || ""} ${cliente?.cognome || ""}`.trim()) || "—"}
              </span>
              <span className="text-muted-foreground">{t("Totale:")}</span>
              <span className="font-bold text-primary">
                {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(state.totale_da_pagare ?? 0)}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            {t("Annulla")}
          </Button>
          <Button
            onClick={handleSend}
            disabled={isSending || isBozza || !toEmail || !isValidEmail(toEmail)}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1.5" />
            )}
            {isSending ? t("Invio in corso...") : t("Invia email")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
