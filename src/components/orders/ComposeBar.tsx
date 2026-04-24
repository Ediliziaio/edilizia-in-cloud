import { useState, useEffect } from "react";
import { Mail, Phone, MessageSquare, StickyNote, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { MessageTemplate } from "@/hooks/useOrderDiary";

type Channel = "email" | "sms" | "whatsapp" | "nota_interna";

const CHANNELS: { id: Channel; label: string; icon: typeof Mail; color: string }[] = [
  { id: "email",         label: "Email",        icon: Mail,          color: "text-blue-600"    },
  { id: "sms",           label: "SMS",           icon: Phone,         color: "text-green-600"   },
  { id: "whatsapp",      label: "WhatsApp",      icon: MessageSquare, color: "text-emerald-600" },
  { id: "nota_interna",  label: "Nota interna",  icon: StickyNote,    color: "text-slate-500"   },
];

interface ComposeBarProps {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  templates: MessageTemplate[];
  onSend: (payload: {
    channel: string;
    to_name: string;
    to_email?: string;
    to_phone?: string;
    subject?: string;
    body: string;
    template_id?: string;
  }) => void;
  onAddNote: (body: string) => void;
  isSending: boolean;
}

/** Sostituisce variabili template {{cliente_nome}} ecc. */
function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || `{{${key}}}`);
}

export function ComposeBar({
  customerName,
  customerEmail,
  customerPhone,
  templates,
  onSend,
  onAddNote,
  isSending,
}: ComposeBarProps) {
  const [channel, setChannel]     = useState<Channel>("email");
  const [subject, setSubject]     = useState("");
  const [body, setBody]           = useState("");
  const [templateId, setTemplateId] = useState<string>("__free__");

  const vars: Record<string, string> = {
    cliente_nome:  customerName,
    cliente_email: customerEmail || "",
    cliente_tel:   customerPhone || "",
  };

  // Filtra template per canale selezionato
  const channelTemplates = templates.filter(t => t.channel === channel);

  // Quando si seleziona un template, pre-riempie
  useEffect(() => {
    if (!templateId || templateId === "__free__") return;
    const tpl = templates.find(t => t.id === templateId);
    if (!tpl) return;
    setBody(interpolate(tpl.body, vars));
    if (tpl.subject) setSubject(interpolate(tpl.subject, vars));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const handleChannelChange = (ch: Channel) => {
    setChannel(ch);
    setTemplateId("__free__");
    setBody("");
    setSubject("");
  };

  const handleSend = () => {
    if (!body.trim()) return;
    if (channel === "nota_interna") {
      onAddNote(body.trim());
    } else {
      onSend({
        channel,
        to_name:   customerName,
        to_email:  channel === "email" ? customerEmail : undefined,
        to_phone:  (channel === "sms" || channel === "whatsapp") ? customerPhone : undefined,
        subject:   channel === "email" ? subject : undefined,
        body:      body.trim(),
        template_id: templateId && templateId !== "__free__" ? templateId : undefined,
      });
    }
    setBody("");
    setSubject("");
    setTemplateId("__free__");
  };

  return (
    <Card className="border-2 border-primary/20">
      <CardContent className="pt-4 pb-3 space-y-3">
        {/* Selezione canale */}
        <div className="flex gap-1.5 flex-wrap">
          {CHANNELS.map(ch => {
            const Icon = ch.icon;
            const isDisabled =
              (ch.id === "email" && !customerEmail) ||
              ((ch.id === "sms" || ch.id === "whatsapp") && !customerPhone);
            return (
              <Button
                key={ch.id}
                variant={channel === ch.id ? "default" : "outline"}
                size="sm"
                onClick={() => handleChannelChange(ch.id)}
                disabled={isDisabled && ch.id !== "nota_interna"}
                className="text-xs gap-1.5"
              >
                <Icon className={cn("h-3.5 w-3.5", channel !== ch.id && ch.color)} />
                {ch.label}
              </Button>
            );
          })}
        </div>

        {/* Template selector */}
        {channelTemplates.length > 0 && (
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger className="h-8 text-xs w-full">
              <SelectValue placeholder="Scegli un template..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__free__">Testo libero</SelectItem>
              {channelTemplates.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Subject (solo email) */}
        {channel === "email" && (
          <Input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Oggetto email..."
            className="text-sm"
          />
        )}

        {/* Corpo messaggio */}
        <Textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder={
            channel === "nota_interna" ? "Aggiungi una nota interna (visibile solo allo staff)..." :
            channel === "email"        ? "Scrivi il messaggio email..." :
            channel === "sms"          ? "Scrivi il messaggio SMS (max 160 caratteri)..." :
            "Scrivi il messaggio WhatsApp..."
          }
          rows={3}
          className="text-sm resize-none"
        />

        {/* Counter SMS */}
        {channel === "sms" && body.length > 0 && (
          <p className={cn("text-xs", body.length > 160 ? "text-red-500" : "text-muted-foreground")}>
            {body.length}/160 caratteri
          </p>
        )}

        {/* Bottone invio */}
        <div className="flex justify-end">
          <Button
            onClick={handleSend}
            disabled={!body.trim() || isSending}
            size="sm"
            className="gap-1.5"
          >
            {isSending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Send className="h-3.5 w-3.5" />
            }
            {channel === "nota_interna" ? "Salva nota" : "Invia"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
