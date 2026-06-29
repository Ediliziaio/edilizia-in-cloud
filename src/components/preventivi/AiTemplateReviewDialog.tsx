/**
 * AiTemplateReviewDialog — anteprima dei testi generati dall'AI PRIMA di
 * scriverli nel template. L'utente rivede ogni sezione, copia quello che serve,
 * e applica al template solo quando e' soddisfatto (poi rifinisce nell'editor).
 *
 * Condiviso tra i moduli edili: riceve un draft con la forma dei 13 campi che
 * gli editor / il PDF gia' consumano. Read-only + copia per sezione; l'editing
 * fine avviene nell'editor dopo l'applicazione.
 */
import * as React from "react";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Copy, Sparkles } from "lucide-react";
import { toast } from "sonner";

export interface AiDraftListItem { titolo: string; descrizione?: string | null; }
export interface AiDraftFaqItem { domanda: string; risposta: string; }
export interface AiDraftCronoItem { fase: string; durata?: string | null; descrizione?: string | null; }

export interface AiTemplateDraft {
  cover_title?: string | null;
  cover_subtitle?: string | null;
  chi_siamo?: string | null;
  esigenze?: AiDraftListItem[];
  soluzione?: AiDraftListItem[];
  usp?: AiDraftListItem[];
  garanzie?: AiDraftListItem[];
  percorso?: AiDraftListItem[];
  cronoprogramma?: AiDraftCronoItem[];
  faq?: AiDraftFaqItem[];
  payment_terms_text?: string | null;
  validity_text?: string | null;
  footer_text?: string | null;
}

function stripHtml(s?: string | null): string {
  return (s ?? "")
    .replace(/<\/(p|li|ul|ol|div|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[a-z/!?][^>]*>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
const listText = (items?: AiDraftListItem[]) =>
  (items ?? []).map((i) => `• ${i.titolo}${i.descrizione ? ` — ${i.descrizione}` : ""}`).join("\n");
const faqText = (items?: AiDraftFaqItem[]) =>
  (items ?? []).map((i) => `${i.domanda}\n${i.risposta}`).join("\n\n");
const cronoText = (items?: AiDraftCronoItem[]) =>
  (items ?? []).map((i) => `${i.fase}${i.durata ? ` (${i.durata})` : ""}${i.descrizione ? ` — ${i.descrizione}` : ""}`).join("\n");

function ListView({ items }: { items?: AiDraftListItem[] }) {
  return (
    <ul className="space-y-1">
      {(items ?? []).map((i, idx) => (
        <li key={idx}>
          <span className="font-medium">{i.titolo}</span>
          {i.descrizione ? <span className="text-muted-foreground"> — {i.descrizione}</span> : null}
        </li>
      ))}
    </ul>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  draft: AiTemplateDraft | null;
  onApply: (draft: AiTemplateDraft) => void;
}

export function AiTemplateReviewDialog({ open, onOpenChange, draft, onApply }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!draft) return null;

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
    } catch {
      toast.error("Copia non riuscita");
    }
  };

  const sections: { key: string; label: string; body: React.ReactNode; copyText: string; show: boolean }[] = [
    {
      key: "cover", label: "Copertina", show: !!(draft.cover_title || draft.cover_subtitle),
      copyText: [draft.cover_title, draft.cover_subtitle].filter(Boolean).join("\n"),
      body: (<><p className="font-medium">{draft.cover_title}</p>{draft.cover_subtitle ? <p className="text-muted-foreground">{draft.cover_subtitle}</p> : null}</>),
    },
    {
      key: "chi_siamo", label: "Chi siamo", show: !!draft.chi_siamo,
      copyText: stripHtml(draft.chi_siamo), body: <p className="whitespace-pre-wrap">{stripHtml(draft.chi_siamo)}</p>,
    },
    { key: "esigenze", label: "Esigenze del cliente", show: !!draft.esigenze?.length, copyText: listText(draft.esigenze), body: <ListView items={draft.esigenze} /> },
    { key: "soluzione", label: "La soluzione", show: !!draft.soluzione?.length, copyText: listText(draft.soluzione), body: <ListView items={draft.soluzione} /> },
    { key: "usp", label: "Perché sceglierci", show: !!draft.usp?.length, copyText: listText(draft.usp), body: <ListView items={draft.usp} /> },
    { key: "garanzie", label: "Garanzie", show: !!draft.garanzie?.length, copyText: listText(draft.garanzie), body: <ListView items={draft.garanzie} /> },
    { key: "percorso", label: "Come lavoriamo", show: !!draft.percorso?.length, copyText: listText(draft.percorso), body: <ListView items={draft.percorso} /> },
    {
      key: "cronoprogramma", label: "Cronoprogramma", show: !!draft.cronoprogramma?.length,
      copyText: cronoText(draft.cronoprogramma), body: <p className="whitespace-pre-wrap">{cronoText(draft.cronoprogramma)}</p>,
    },
    {
      key: "faq", label: "FAQ", show: !!draft.faq?.length, copyText: faqText(draft.faq),
      body: (<div className="space-y-2">{(draft.faq ?? []).map((f, i) => (<div key={i}><p className="font-medium">{f.domanda}</p><p className="text-muted-foreground">{f.risposta}</p></div>))}</div>),
    },
    {
      key: "condizioni", label: "Condizioni & pagamento", show: !!(draft.payment_terms_text || draft.validity_text),
      copyText: [stripHtml(draft.payment_terms_text), draft.validity_text].filter(Boolean).join("\n"),
      body: (<>{draft.payment_terms_text ? <p className="whitespace-pre-wrap">{stripHtml(draft.payment_terms_text)}</p> : null}{draft.validity_text ? <p className="text-muted-foreground mt-1">{draft.validity_text}</p> : null}</>),
    },
  ];
  const visible = sections.filter((s) => s.show);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-orange-500" />
            Anteprima testi generati
          </DialogTitle>
          <DialogDescription>
            Rivedi le sezioni. Copia quello che ti serve, poi applica al template e rifinisci nell&apos;editor.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nessun testo generato.</p>
          ) : (
            visible.map((s) => (
              <div key={s.key} className="rounded-lg border p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</span>
                  <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => void copy(s.key, s.copyText)}>
                    {copied === s.key ? <><Check className="h-3.5 w-3.5" />Copiato</> : <><Copy className="h-3.5 w-3.5" />Copia</>}
                  </Button>
                </div>
                <div className="text-sm leading-relaxed">{s.body}</div>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button type="button" className="gap-1.5 bg-orange-500 hover:bg-orange-600" onClick={() => onApply(draft)}>
            <Check className="h-4 w-4" />
            Applica al template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AiTemplateReviewDialog;
