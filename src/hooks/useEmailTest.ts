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

export function useEmailTest() {
  const [history, setHistory] = useState<EmailTestResult[]>([]);

  const sendMutation = useMutation({
    mutationFn: async (payload: EmailTestPayload): Promise<{ messageId?: string }> => {
      const { data, error } = await supabase.functions.invoke("send-test-email", {
        body: {
          to: payload.to,
          subject: payload.subject,
          testMode: true,
          stream: "transactional",
          ...(payload.body ? { html: `<p>${payload.body.replace(/\n/g, "<br>")}</p>` } : {}),
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
