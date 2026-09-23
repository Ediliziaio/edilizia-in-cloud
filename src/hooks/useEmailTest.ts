import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type EmailTemplate = "plain" | "welcome" | "notification";

export interface EmailTestPayload {
  to: string;
  subject: string;
  template: EmailTemplate;
  body?: string;
}

export interface EmailTestResult {
  id: string;
  to: string;
  subject: string;
  template: EmailTemplate;
  success: boolean;
  error?: string;
  sentAt: string;
}

const MAX_HISTORY = 10;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// La edge function send-test-email non conosce i template: accetta solo `html`.
// Il rendering dei template avviene quindi qui lato client, così il selettore
// nella UI produce davvero email diverse (prima welcome/notification inviavano
// tutte il fallback generico "Test email").
function buildTestHtml(payload: EmailTestPayload): string | undefined {
  if (payload.template === "plain") {
    if (!payload.body) return undefined;
    return `<p>${escapeHtml(payload.body).replace(/\n/g, "<br>")}</p>`;
  }
  const wrapper = (title: string, content: string) =>
    `<html><body style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;margin:0;padding:24px;background:#f8fafc;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;">
        <h1 style="font-size:20px;margin:0 0 16px;">${title}</h1>
        ${content}
        <p style="font-size:12px;color:#94a3b8;margin-top:24px;">[TEST] Email di prova inviata da Edilizia in Cloud — nessuna azione richiesta.</p>
      </div>
    </body></html>`;
  if (payload.template === "welcome") {
    return wrapper(
      "Benvenuto in Edilizia in Cloud 👷",
      `<p style="font-size:14px;line-height:1.6;">Questa è un'anteprima dell'email di benvenuto. Il tuo account è pronto: gestisci preventivi, cantieri e fatture da un unico posto.</p>
       <p style="margin:24px 0;"><a href="https://admin.ediliziaincloud.com" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;">Accedi al gestionale</a></p>`,
    );
  }
  return wrapper(
    "Notifica dalla piattaforma",
    `<p style="font-size:14px;line-height:1.6;">Questa è un'anteprima di una notifica di sistema (es. scadenza documento, nuovo messaggio, promemoria appuntamento).</p>`,
  );
}

export function useEmailTest() {
  const [history, setHistory] = useState<EmailTestResult[]>([]);

  const sendMutation = useMutation({
    mutationFn: async (payload: EmailTestPayload): Promise<{ messageId?: string }> => {
      const html = buildTestHtml(payload);
      const { data, error } = await supabase.functions.invoke("send-test-email", {
        body: {
          to: payload.to,
          subject: payload.subject,
          testMode: true,
          stream: "transactional",
          ...(html ? { html } : {}),
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error as string);
      return data as { messageId?: string };
    },
    onSuccess: (_, payload) => {
      const result: EmailTestResult = {
        id: crypto.randomUUID(),
        to: payload.to,
        subject: payload.subject,
        template: payload.template,
        success: true,
        sentAt: new Date().toISOString(),
      };
      setHistory((prev) => [result, ...prev].slice(0, MAX_HISTORY));
      toast.success(`Email inviata a ${payload.to}`);
    },
    onError: (err: Error, payload) => {
      const result: EmailTestResult = {
        id: crypto.randomUUID(),
        to: payload.to,
        subject: payload.subject,
        template: payload.template,
        success: false,
        error: err.message,
        sentAt: new Date().toISOString(),
      };
      setHistory((prev) => [result, ...prev].slice(0, MAX_HISTORY));
      toast.error(`Errore invio: ${err.message}`);
    },
  });

  const clearHistory = useCallback(() => setHistory([]), []);

  return {
    sendEmail: sendMutation.mutate,
    isSending: sendMutation.isPending,
    history,
    clearHistory,
  };
}
