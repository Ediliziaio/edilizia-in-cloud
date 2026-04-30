import { useState } from "react";
import { Send, AlertCircle, CheckCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Channel = "email" | "sms" | "whatsapp" | "nota_interna";

export interface DiaryComposerPayload {
  channel: Channel;
  subject?: string;
  body: string;
  to_name: string;
  to_email?: string;
  to_phone?: string;
}

interface DiaryComposerProps {
  channel: Channel;
  toName: string;
  toEmail?: string;
  toPhone?: string;
  onSend: (payload: DiaryComposerPayload) => Promise<void>;
  onCancel: () => void;
  onChangeChannel: (channel: Channel) => void;
}

const CHANNEL_LABELS: Record<Channel, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  nota_interna: "Nota interna",
};

const EMAIL_TEMPLATES = [
  {
    label: "Conferma commessa",
    subject: "Conferma commessa",
    body: "Gentile {{CLIENTE}},\n\nCon la presente Le confermiamo la sua commessa.\n\nRimaniamo a disposizione per qualsiasi chiarimento.\n\nCordiali saluti",
  },
  {
    label: "Richiesta informazioni",
    subject: "Richiesta informazioni",
    body: "Gentile {{CLIENTE}},\n\nLa contatto per richiedere alcune informazioni riguardo alla sua commessa.\n\nLa preghiamo di contattarci al più presto.\n\nCordiali saluti",
  },
  {
    label: "Avanzamento lavori",
    subject: "Aggiornamento stato lavori",
    body: "Gentile {{CLIENTE}},\n\nLa informiamo che i lavori relativi alla sua commessa stanno procedendo regolarmente.\n\nRimaniamo a disposizione.\n\nCordiali saluti",
  },
  {
    label: "Appuntamento",
    subject: "Conferma appuntamento",
    body: "Gentile {{CLIENTE}},\n\nCon la presente confermiamo l'appuntamento concordato.\n\nLa aspettiamo.\n\nCordiali saluti",
  },
];

const SMS_TEMPLATES = [
  { label: "Conferma", body: "Salve {{CLIENTE}}, confermiamo la Sua commessa. Per info: {TELEFONO}" },
  { label: "Appuntamento", body: "Salve {{CLIENTE}}, ricordiamo l'appuntamento. Per info: {TELEFONO}" },
];

export function DiaryComposer({
  channel,
  toName,
  toEmail,
  toPhone,
  onSend,
  onCancel,
  onChangeChannel,
}: DiaryComposerProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const smsCount = body.length > 0 ? Math.ceil(body.length / 160) : 0;

  const isValid =
    channel === "email"
      ? subject.trim().length > 0 && body.trim().length > 0
      : body.trim().length > 0;

  const applyTemplate = (tmpl: { subject?: string; body: string }) => {
    if (tmpl.subject) setSubject(tmpl.subject);
    setBody(tmpl.body.replace("{{CLIENTE}}", toName));
  };

  const handleSend = async () => {
    if (!isValid) {
      setError(
        channel === "email"
          ? "Compila oggetto e messaggio prima di inviare."
          : "Scrivi un messaggio prima di inviare."
      );
      return;
    }
    setIsSending(true);
    setError(null);
    try {
      await onSend({
        channel,
        subject: channel === "email" ? subject : undefined,
        body,
        to_name: toName,
        to_email: toEmail,
        to_phone: toPhone,
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onCancel();
      }, 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore durante l'invio. Riprova.");
    } finally {
      setIsSending(false);
    }
  };

  const channels: Channel[] = ["email", "sms", "whatsapp", "nota_interna"];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Channel switcher */}
      <div className="flex items-center gap-1 px-4 pt-4 pb-2 border-b border-gray-100">
        {channels.map((ch) => (
          <button
            key={ch}
            onClick={() => { onChangeChannel(ch); setSubject(""); setBody(""); setError(null); }}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              channel === ch
                ? "bg-primary text-white"
                : "text-gray-500 hover:bg-gray-100"
            )}
          >
            {CHANNEL_LABELS[ch]}
          </button>
        ))}
        <button onClick={onCancel} className="ml-auto text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
        {/* ── EDITOR ── */}
        <div className="p-5 flex flex-col gap-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Composizione</p>

          {/* Template */}
          {(channel === "email" || channel === "sms") && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Template rapido</label>
              <div className="flex flex-wrap gap-1.5">
                {(channel === "email" ? EMAIL_TEMPLATES : SMS_TEMPLATES).map((t) => (
                  <button
                    key={t.label}
                    onClick={() => applyTemplate(t)}
                    className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Destinatario */}
          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            <span className="font-medium">A:</span>{" "}
            {toName}
            {channel === "email" && toEmail && ` <${toEmail}>`}
            {(channel === "sms" || channel === "whatsapp") && toPhone && ` ${toPhone}`}
          </div>

          {/* Oggetto (solo email) */}
          {channel === "email" && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Oggetto <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => { setSubject(e.target.value); setError(null); }}
                placeholder="Es. Conferma commessa ORD-2026-007"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          )}

          {/* Corpo */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-600">
                Messaggio <span className="text-red-400">*</span>
              </label>
              {channel === "sms" && (
                <span className={cn("text-xs", smsCount > 1 ? "text-orange-500 font-medium" : "text-gray-400")}>
                  {body.length} car. · {smsCount} SMS
                </span>
              )}
            </div>
            <textarea
              value={body}
              onChange={(e) => { setBody(e.target.value); setError(null); }}
              placeholder={
                channel === "nota_interna"
                  ? "Scrivi una nota per il tuo team..."
                  : "Scrivi il messaggio..."
              }
              rows={channel === "email" ? 10 : 5}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-mono"
            />
          </div>

          {/* Feedback */}
          {error && (
            <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <CheckCircle className="h-3.5 w-3.5 shrink-0" />
              {channel === "nota_interna" ? "Nota salvata!" : "Messaggio inviato!"}
            </div>
          )}

          {/* Action bar */}
          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleSend}
              disabled={!isValid || isSending || success}
              size="sm"
              className={cn(
                "flex-1 text-sm font-semibold transition-all",
                isValid && !isSending
                  ? "bg-orange-500 hover:bg-orange-600 text-white"
                  : "opacity-50"
              )}
            >
              {isSending ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Invio...</>
              ) : (
                <><Send className="h-3.5 w-3.5 mr-1.5" />
                {channel === "nota_interna" ? "Salva nota" : "Invia"}</>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={onCancel} disabled={isSending} className="text-sm">
              Annulla
            </Button>
          </div>
        </div>

        {/* ── PREVIEW ── */}
        <div className="p-5 flex flex-col gap-4 bg-gray-50">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Preview</p>

          {channel === "email" && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden text-sm">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <p className="text-xs text-gray-400">Oggetto</p>
                <p className="font-medium text-gray-900 mt-0.5">{subject || <span className="text-gray-300 italic">nessun oggetto</span>}</p>
              </div>
              <div className="px-4 py-3 whitespace-pre-wrap text-gray-700 min-h-[200px] font-mono text-xs leading-relaxed overflow-y-auto max-h-64">
                {body || <span className="text-gray-300 italic">corpo vuoto</span>}
              </div>
            </div>
          )}

          {channel === "sms" && (
            <div className="flex flex-col gap-3">
              <div className="bg-blue-500 text-white text-sm rounded-2xl rounded-tl-sm px-4 py-3 max-w-[280px] whitespace-pre-wrap leading-relaxed font-mono text-xs">
                {body || <span className="opacity-50 italic">messaggio vuoto</span>}
              </div>
              {smsCount > 1 && (
                <p className="text-xs text-orange-600 font-medium">
                  ⚠️ Verrà diviso in {smsCount} SMS separati
                </p>
              )}
            </div>
          )}

          {channel === "whatsapp" && (
            <div className="bg-[#DCF8C6] text-gray-900 text-xs rounded-2xl rounded-tr-sm px-4 py-3 max-w-[280px] whitespace-pre-wrap leading-relaxed font-mono">
              {body || <span className="text-gray-400 italic">messaggio vuoto</span>}
            </div>
          )}

          {channel === "nota_interna" && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <p className="text-xs text-amber-600 font-medium mb-2">📝 Nota interna (solo team)</p>
              <p className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                {body || <span className="text-gray-300 italic">nota vuota</span>}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
