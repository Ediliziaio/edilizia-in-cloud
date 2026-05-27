/**
 * EmailSignatureEditor — editor firma personale per account email.
 *
 * 2026-05-27 (richiesta utente): la firma viene auto-appesa al body
 * delle email inviate da Cliente/Contatto/Email. Pattern Gmail:
 * non si vede nel composer, ma viene aggiunta in invio.
 *
 * Dipende da migration 20270527050000_email_account_signature.sql
 * che aggiunge signature_html + signature_text a email_oauth_connections.
 *
 * Embeddato in EmailOAuthConnectionsCard come collapsible per ogni account.
 * Salvataggio inline on-blur, no bottone esplicito (UX rapida).
 */
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Check, AlertCircle } from "lucide-react";

interface EmailSignatureEditorProps {
  connectionId: string;
  initialHtml?: string | null;
  initialText?: string | null;
  /** Email mittente — usato per generare placeholder firma default. */
  emailAddress?: string | null;
  /** Invalida la query genitore al salvataggio. */
  onSaved?: () => void;
}

const DEFAULT_PLACEHOLDER = `Mario Rossi
Geometra
Edilizia Rossi S.r.l.
Tel: +39 333 1234567
Web: www.ediliziarossi.it`;

export function EmailSignatureEditor({
  connectionId,
  initialHtml,
  initialText,
  emailAddress,
  onSaved,
}: EmailSignatureEditorProps) {
  const qc = useQueryClient();
  const [text, setText] = useState(initialText ?? "");
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setText(initialText ?? "");
    setDirty(false);
  }, [initialText, connectionId]);

  const saveMutation = useMutation({
    mutationFn: async (newText: string) => {
      // Converto plain text in HTML semplice <p> per line + <br/> per empty
      const trimmed = newText.trim();
      const newHtml = trimmed
        ? trimmed
            .split("\n")
            .map((line) =>
              line.trim()
                ? `<p style="margin:0 0 4px 0">${line
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")}</p>`
                : `<br/>`,
            )
            .join("")
        : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("email_oauth_connections")
        .update({
          signature_text: trimmed || null,
          signature_html: newHtml,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-compose-accounts"] });
      qc.invalidateQueries({ queryKey: ["email-oauth-connections"] });
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      toast.success("Firma salvata");
      onSaved?.();
    },
    onError: (e) => {
      // Errore tipico: colonna non esiste (migration pending)
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("signature_html") || msg.includes("signature_text") || msg.includes("42703")) {
        toast.error("Migration firma email non ancora applicata", {
          description: "Esegui `supabase db push` per attivare le firme personali.",
        });
        return;
      }
      toast.error("Errore salvataggio firma", { description: msg });
    },
  });

  const handleBlur = () => {
    if (dirty && text !== (initialText ?? "")) {
      saveMutation.mutate(text);
    }
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-semibold flex items-center gap-1.5">
          Firma email
          {saved && <Check className="h-3 w-3 text-emerald-600" />}
          {saveMutation.isPending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </Label>
        {text.trim() ? (
          <span className="text-[10px] text-emerald-700 flex items-center gap-0.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Attiva
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground">Nessuna firma</span>
        )}
      </div>
      <Textarea
        value={text}
        placeholder={DEFAULT_PLACEHOLDER}
        rows={4}
        maxLength={2000}
        className="text-xs font-mono resize-y"
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleBlur();
          }
        }}
      />
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          Appesa automaticamente a tutte le email inviate da {emailAddress || "questo account"}.
        </span>
        {dirty && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => saveMutation.mutate(text)}
            disabled={saveMutation.isPending}
          >
            Salva ora
          </Button>
        )}
      </div>
      {initialHtml && initialHtml !== initialText && (
        <p className="text-[10px] text-muted-foreground flex items-start gap-1">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          La versione HTML è impostata. Modificando qui verrà rigenerata da plain text.
        </p>
      )}
    </div>
  );
}
