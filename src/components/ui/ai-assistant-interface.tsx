"use client";

import type React from "react";
import { useState, useRef } from "react";
import { Mic, ArrowUp, HardHat, Wallet, Users, TrendingUp, Loader2, Square } from "lucide-react";
import { SilvioAvatar } from "@/components/silvio/SilvioAvatar";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useVoiceInput } from "@/hooks/useVoiceInput";

/**
 * AIAssistantInterface — empty-state in stile ChatGPT/Claude per Silvio AI
 * (tema CHIARO, accenti arancio brand). Logo + saluto + input "pill" centrale +
 * 4 carte-suggerimento curate per l'edilizia. Chiama `onSend(testo)`.
 */

const SUGGESTIONS: Array<{ icon: React.ElementType; title: string; prompt: string }> = [
  {
    icon: HardHat,
    title: "Cantieri in ritardo",
    prompt: "Quali cantieri sono in ritardo o sopra budget? Riassumi lo stato.",
  },
  {
    icon: Wallet,
    title: "Fatture da sollecitare",
    prompt: "Quali fatture sono scadute e da sollecitare? Mostrami gli importi.",
  },
  {
    icon: TrendingUp,
    title: "Flusso di cassa 90 giorni",
    prompt: "Com'è il flusso di cassa nei prossimi 90 giorni? Segnala le criticità.",
  },
  {
    icon: Users,
    title: "Lead da ricontattare",
    prompt: "Quali lead o opportunità vanno ricontattati oggi?",
  },
];

export function AIAssistantInterface({
  onSend,
  disabled = false,
  userName,
}: {
  onSend: (message: string) => void;
  disabled?: boolean;
  userName?: string;
}) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const voice = useVoiceInput((t) => setInputValue((p) => (p ? `${p} ${t}` : t)));

  const send = (text: string) => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setInputValue("");
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center px-4">
      {/* Logo Silvio */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="mb-5"
      >
        <SilvioAvatar size={64} bg="white" className="shadow-lg" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="mb-7 text-center"
      >
        <h1 className="text-[28px] leading-tight font-bold text-slate-800 mb-1.5">
          A cosa stai pensando{userName ? `, ${userName}` : ""}?
        </h1>
        <p className="text-slate-500 text-[15px]">
          Chiedi a <span className="font-medium text-orange-600">Silvio</span> di cantieri, finanza, clienti e molto altro.
        </p>
      </motion.div>

      {/* Input pill */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="w-full flex items-center gap-2 bg-white border border-slate-200 rounded-full shadow-sm pl-5 pr-2 py-2 focus-within:border-orange-300 focus-within:shadow-md transition-all"
      >
        <input
          ref={inputRef}
          autoFocus
          type="text"
          placeholder="Fai una domanda a Silvio…"
          value={inputValue}
          disabled={disabled}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(inputValue);
            }
          }}
          className="flex-1 min-w-0 bg-transparent text-slate-700 text-[15px] outline-none placeholder:text-slate-400 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={voice.toggle}
          disabled={disabled || voice.transcribing}
          className={cn(
            "p-2 rounded-full transition-colors",
            voice.recording ? "text-rose-500 bg-rose-50 animate-pulse" : "text-slate-400 hover:text-slate-600",
          )}
          aria-label={voice.recording ? "Ferma registrazione" : "Detta con la voce"}
          title={voice.recording ? "Ferma e trascrivi" : "Detta con la voce"}
        >
          {voice.transcribing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : voice.recording ? (
            <Square className="w-4 h-4 fill-current" />
          ) : (
            <Mic className="w-5 h-5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => send(inputValue)}
          disabled={!inputValue.trim() || disabled}
          className={cn(
            "w-9 h-9 flex items-center justify-center rounded-full transition-colors shrink-0",
            inputValue.trim() && !disabled
              ? "bg-orange-500 text-white hover:bg-orange-600"
              : "bg-slate-100 text-slate-400 cursor-not-allowed",
          )}
          aria-label="Invia"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      </motion.div>

      {/* Carte suggerimento */}
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-5">
        {SUGGESTIONS.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.button
              key={s.title}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 + i * 0.05 }}
              onClick={() => send(s.prompt)}
              disabled={disabled}
              className="group flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-white text-left hover:border-orange-200 hover:bg-orange-50/40 hover:shadow-sm transition-all disabled:opacity-60"
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-500 group-hover:bg-orange-100">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-700">{s.title}</span>
                <span className="block text-xs text-slate-400 line-clamp-2">{s.prompt}</span>
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

export default AIAssistantInterface;
