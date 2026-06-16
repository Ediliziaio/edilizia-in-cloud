/**
 * RoiSendEmailDialog — Round 2 del Simulatore ROI: invia il report al cliente.
 *
 * Dialog shadcn premium (è inviato a clienti reali):
 *  - destinatario precompilato dall'email del contatto, se disponibile;
 *  - oggetto e messaggio precompilati e modificabili;
 *  - all'invio genera il PDF brandizzato (roiSimulatorPdf), lo allega in base64
 *    e chiama l'edge `send-roi-report` (che passa da sendEmailUnified → allegati
 *    supportati su tutti i provider). Toast successo/errore.
 *
 * Brand EdiliziaInCloud nel corpo; Domus Group resta solo nel footer legale del
 * PDF. Nessun claim su localizzazione server (UE/Italia/Europa).
 */
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { RoiInputs, RoiResults } from "@/lib/roiSimulator";
import { roiPdfBase64, roiPdfFileName } from "@/lib/roiSimulatorPdf";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mail, Send, Loader2, FileText } from "lucide-react";

const EUR = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? n : 0,
  );

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Riepilogo HTML brandizzato dei numeri + CTA (fallback se l'allegato è off). */
function buildEmailHtml(
  results: RoiResults,
  clientName: string,
  message: string,
): string {
  const saluto = (clientName || "").trim() || "Gentile cliente";
  const guadagna = results.risparmioAnnuo > 0;
  const intro = escapeHtml(message).replace(/\n/g, "<br>");
  const payback =
    guadagna && results.paybackGiorni > 0
      ? `<p style="margin:8px 0 0;font-size:13px;color:#16a34a;font-weight:600;">Si ripaga in ${results.paybackGiorni.toLocaleString("it-IT")} ${results.paybackGiorni === 1 ? "giorno" : "giorni"}.</p>`
      : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

<tr><td style="background:#1e3a5f;padding:24px 32px;">
  <span style="color:#ffffff;font-size:18px;font-weight:700;">EdiliziaInCloud</span><br>
  <span style="color:#9db4d6;font-size:12px;">Il gestionale per imprese edili italiane</span>
</td></tr>

<tr><td style="padding:32px;">
  <p style="font-size:14px;color:#334155;margin:0 0 16px;">${saluto},</p>
  ${intro ? `<p style="font-size:14px;color:#334155;margin:0 0 20px;line-height:1.6;">${intro}</p>` : ""}

  <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
    <tr>
      <td width="50%" style="padding:14px;background:#fef2f2;border-radius:8px;border:1px solid #fecaca;">
        <span style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;font-weight:600;">Ti costa oggi</span><br>
        <span style="font-size:22px;font-weight:700;color:#b91c1c;">${EUR(results.costoAttualeAnnuo)}</span><br>
        <span style="font-size:11px;color:#94a3b8;">all'anno</span>
      </td>
      <td width="12"></td>
      <td width="50%" style="padding:14px;background:#f0fdf4;border-radius:8px;border:1px solid #86efac;">
        <span style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;font-weight:600;">Con EdiliziaInCloud</span><br>
        <span style="font-size:22px;font-weight:700;color:#16a34a;">${EUR(results.costoConEicAnnuo)}</span><br>
        <span style="font-size:11px;color:#94a3b8;">all'anno</span>
      </td>
    </tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0;">
    <tr><td style="padding:18px;background:#1e3a5f;border-radius:8px;text-align:center;">
      <span style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#9db4d6;font-weight:600;">${guadagna ? "Con EdiliziaInCloud guadagni" : "Stima risparmio"}</span><br>
      <span style="font-size:30px;font-weight:800;color:#ffffff;">${EUR(Math.max(0, results.risparmioAnnuo))}</span>
      <span style="font-size:14px;color:#9db4d6;font-weight:600;"> / anno</span>
    </td></tr>
  </table>
  ${payback}

  <p style="font-size:14px;color:#1e3a5f;font-weight:700;margin:20px 0 0;">
    EdiliziaInCloud non ti costa: ti fa guadagnare.
  </p>
  <p style="font-size:12px;color:#64748b;margin:6px 0 0;">
    In allegato trovi il report completo con il dettaglio dei tuoi numeri.
  </p>
</td></tr>

<tr><td style="background:#f4f6fa;padding:16px 32px;text-align:center;">
  <p style="font-size:11px;color:#94a3b8;margin:0;">Domus Group S.r.l. · P.IVA 13132010961 · info@ediliziaincloud.com</p>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

interface RoiSendEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inputs: RoiInputs;
  results: RoiResults;
  clientName: string;
  /** Email del contatto, per precompilare il destinatario. */
  defaultEmail?: string | null;
  /** Contesto opzionale (es. opportunity_id) salvato nei metadata di invio. */
  metadata?: Record<string, unknown>;
}

export function RoiSendEmailDialog({
  open,
  onOpenChange,
  inputs,
  results,
  clientName,
  defaultEmail,
  metadata,
}: RoiSendEmailDialogProps) {
  const defaultSubject = useMemo(
    () =>
      results.risparmioAnnuo > 0
        ? `${clientName ? `${clientName.trim()}, ` : ""}ecco quanto puoi guadagnare con EdiliziaInCloud`
        : "La tua analisi ROI con EdiliziaInCloud",
    [clientName, results.risparmioAnnuo],
  );
  const defaultMessage = useMemo(
    () =>
      `Come promesso le invio l'analisi personalizzata dei costi della sua attività.\n\n` +
      `Con EdiliziaInCloud risparmierebbe circa ${EUR(Math.max(0, results.risparmioAnnuo))} all'anno rispetto a quanto spende oggi. ` +
      `Nel PDF allegato trova tutti i dettagli.\n\n` +
      `Resto a disposizione per qualsiasi chiarimento.`,
    [results.risparmioAnnuo],
  );

  // Hydration una-tantum all'apertura del dialog (niente setState-in-effect).
  const [hydrated, setHydrated] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  if (open && !hydrated) {
    setTo((defaultEmail ?? "").trim());
    setSubject(defaultSubject);
    setMessage(defaultMessage);
    setHydrated(true);
  }
  if (!open && hydrated) setHydrated(false);

  const recipientValid = isEmail(to);

  const handleSend = async () => {
    if (!recipientValid) {
      toast.error("Inserisci un indirizzo email valido");
      return;
    }
    setSending(true);
    try {
      const attachmentContent = roiPdfBase64(inputs, results, clientName);
      const html = buildEmailHtml(results, clientName, message);

      const { data, error } = await supabase.functions.invoke("send-roi-report", {
        body: {
          to: to.trim(),
          subject: subject.trim() || defaultSubject,
          html,
          client_name: clientName || null,
          attachment: {
            filename: roiPdfFileName(clientName),
            content: attachmentContent,
            type: "application/pdf",
          },
          metadata: metadata ?? null,
        },
      });

      if (error) throw error;
      if (data && (data as { error?: string }).error) {
        throw new Error((data as { error?: string }).error);
      }

      toast.success("Report inviato al cliente", {
        description: `Email con PDF allegato spedita a ${to.trim()}.`,
      });
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore nell'invio";
      toast.error("Invio non riuscito", { description: msg });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (sending ? null : onOpenChange(v))}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Invia il report al cliente
          </DialogTitle>
          <DialogDescription>
            Spedisci l'analisi ROI con il PDF brandizzato in allegato. Oggetto e messaggio sono già
            pronti: modificali se vuoi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="roi-email-to" className="text-xs text-muted-foreground">
              Destinatario
            </Label>
            <Input
              id="roi-email-to"
              type="email"
              inputMode="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="cliente@esempio.it"
              className="h-9"
              aria-invalid={to.length > 0 && !recipientValid}
            />
            {to.length > 0 && !recipientValid && (
              <p className="text-[11px] text-destructive">Indirizzo email non valido</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="roi-email-subject" className="text-xs text-muted-foreground">
              Oggetto
            </Label>
            <Input
              id="roi-email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-9"
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="roi-email-message" className="text-xs text-muted-foreground">
              Messaggio
            </Label>
            <Textarea
              id="roi-email-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="resize-none"
            />
          </div>

          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">
              In allegato: <strong className="text-foreground">{roiPdfFileName(clientName)}</strong>
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Annulla
          </Button>
          <Button onClick={handleSend} disabled={sending || !recipientValid} className="gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Invio..." : "Invia report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RoiSendEmailDialog;
