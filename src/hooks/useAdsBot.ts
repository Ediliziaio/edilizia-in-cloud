/**
 * useAdsBot — hook per la chat conversazionale con AdsBot.
 *
 * Gestisce:
 *   • History dei messaggi (persistita in localStorage per company)
 *   • sendMessage(text, context) → invoca ai-ads-bot-chat
 *   • clear() → reset conversazione
 *
 * Context permette di iniettare campagna selezionata / step wizard /
 * piattaforma per dare risposte più mirate.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AdsBotMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  suggestions?: string[];
  actions?: Array<{ label: string; type: string; url?: string }>;
}

export interface AdsBotContext {
  selected_campaign_id?: string;
  current_wizard_step?: number;
  platform?: "meta" | "google";
}

const STORAGE_KEY_PREFIX = "eic_adsbot_history_";
const MAX_HISTORY = 30;

const WELCOME_MESSAGE: AdsBotMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Ciao! Sono AdsBot, il tuo consulente Meta/Google Ads. Posso aiutarti a impostare budget, scegliere il pubblico, leggere le metriche o risolvere errori. Cosa ti serve?",
  timestamp: Date.now(),
  suggestions: [
    "Quanto budget mi serve per iniziare?",
    "Cosa è il CPL e qual è un valore buono per edilizia?",
    "Mi consigli una creatività per ristrutturazione bagni?",
  ],
};

export function useAdsBot(companyId: string | undefined) {
  const [messages, setMessages] = useState<AdsBotMessage[]>([WELCOME_MESSAGE]);
  const [isLoading, setIsLoading] = useState(false);

  const storageKey = companyId ? `${STORAGE_KEY_PREFIX}${companyId}` : null;

  // Carica history
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const stored = JSON.parse(raw) as AdsBotMessage[];
        if (Array.isArray(stored) && stored.length > 0) {
          setMessages(stored);
          return;
        }
      }
    } catch {
      // ignore
    }
    setMessages([WELCOME_MESSAGE]);
  }, [storageKey]);

  // Persiste history
  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(messages.slice(-MAX_HISTORY)));
    } catch {
      // ignore
    }
  }, [messages, storageKey]);

  const sendMessage = useCallback(
    async (text: string, context?: AdsBotContext) => {
      if (!companyId || !text.trim()) return;

      const userMsg: AdsBotMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text.trim(),
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        // History per il backend: escludi welcome + escludi ultimo user (lo passiamo separato)
        const historyForBackend = messages
          .filter((m) => m.id !== "welcome")
          .slice(-10) // ultimi 10 turni
          .map((m) => ({ role: m.role, content: m.content }));

        const { data, error } = await supabase.functions.invoke<{
          success: boolean;
          reply: string;
          suggestions?: string[];
          actions?: Array<{ label: string; type: string; url?: string }>;
          error?: string;
          user_message?: string;
        }>("ads-bot-chat", {
          body: {
            company_id: companyId,
            history: historyForBackend,
            message: text.trim(),
            context,
          },
        });

        if (error) {
          toast.error("AdsBot non disponibile", { description: error.message });
          // Aggiungi messaggio di errore visibile
          setMessages((prev) => [
            ...prev,
            {
              id: `e-${Date.now()}`,
              role: "assistant",
              content: "Mi spiace, ho avuto un problema tecnico. Riprova tra qualche secondo.",
              timestamp: Date.now(),
            },
          ]);
          return;
        }

        if (data?.error === "insufficient_credits") {
          toast.error("Crediti AI esauriti", {
            description: data.user_message ?? "Ricarica per continuare.",
          });
          return;
        }

        if (!data?.reply) {
          toast.error("Risposta AdsBot vuota");
          return;
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: data.reply,
            timestamp: Date.now(),
            suggestions: data.suggestions,
            actions: data.actions,
          },
        ]);
      } catch (err) {
        toast.error("Errore AdsBot", { description: String((err as Error).message ?? err) });
      } finally {
        setIsLoading(false);
      }
    },
    [companyId, messages],
  );

  const clear = useCallback(() => {
    setMessages([WELCOME_MESSAGE]);
    if (storageKey) {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    }
  }, [storageKey]);

  return {
    messages,
    isLoading,
    sendMessage,
    clear,
  };
}
