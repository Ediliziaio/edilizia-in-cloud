/**
 * EmailPreviewActions — bottoni "Anteprima" e "Invia prova a me" per i nodi email
 * del builder. Chiama la edge function `automation-email-render` che usa lo stesso
 * wrapping brandizzato del send reale → l'anteprima è fedele all'email che arriva.
 *
 * - Anteprima: apre un dialog con l'email finale renderizzata in un iframe isolato
 *   (così gli stili dell'email non si mescolano con quelli dell'app).
 * - Invia prova: manda l'email all'indirizzo dell'utente loggato (mai ad altri).
 */
import { useState } from "react";
import { Eye, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

interface EmailPreviewActionsProps {
  oggetto?: string;
  corpo?: string;
  mittenteNome?: string;
  /** Valori d'esempio per le variabili (override dei default lato edge). */
  vars?: Record<string, string>;
}

export function EmailPreviewActions({ oggetto, corpo, mittenteNome, vars }: EmailPreviewActionsProps) {
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");

  const body = { corpo: corpo || "", oggetto: oggetto || "", mittente_nome: mittenteNome || "", vars };

  const handlePreview = async () => {
    if (!corpo?.trim()) { toast.error("Scrivi prima il corpo dell'email"); return; }
    setPreviewing(true);
    try {
      const { data, error } = await supabase.functions.invoke("automation-email-render", {
        body: { ...body, mode: "preview" },
      });
      if (error) throw error;
      if (!data?.ok || !data.html) throw new Error(data?.error || "Anteprima non disponibile");
      setPreviewHtml(data.html);
      setPreviewSubject(data.subject || oggetto || "");
      setOpen(true);
    } catch (e) {
      toast.error(`Anteprima fallita: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPreviewing(false);
    }
  };

  const handleTest = async () => {
    if (!corpo?.trim()) { toast.error("Scrivi prima il corpo dell'email"); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("automation-email-render", {
        body: { ...body, mode: "test" },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Invio fallito");
      toast.success(`Email di prova inviata a ${data.sentTo}`);
    } catch (e) {
      toast.error(`Invio prova fallito: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" className="h-8 flex-1 gap-1.5 text-xs"
          onClick={handlePreview} disabled={previewing}>
          {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
          Anteprima
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-8 flex-1 gap-1.5 text-xs"
          onClick={handleTest} disabled={sending}>
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Invia prova a me
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium">
              Anteprima email{previewSubject ? ` — ${previewSubject}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="rounded-md border bg-white overflow-hidden">
            <iframe
              title="Anteprima email"
              srcDoc={previewHtml}
              sandbox=""
              className="w-full h-[60vh] bg-white"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Variabili compilate con valori d'esempio. Layout identico all'email reale.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
