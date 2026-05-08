/**
 * ProviderIcon — icona/glyph per provider AI.
 *
 * Niente immagini esterne (no API hits). Usa caratteri Unicode + colori
 * brand per identificare visivamente il provider del modello selezionato.
 */
import { cn } from '@/lib/utils';
import { Brain } from 'lucide-react';

interface Props {
  provider: string;
  className?: string;
}

const PROVIDER_GLYPH: Record<string, { glyph: string; bg: string; text: string }> = {
  openai:       { glyph: '◐', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  anthropic:    { glyph: 'A', bg: 'bg-orange-100', text: 'text-orange-700' },
  google:       { glyph: '✦', bg: 'bg-blue-100', text: 'text-blue-700' },
  moonshotai:   { glyph: '☾', bg: 'bg-violet-100', text: 'text-violet-700' },
  deepseek:     { glyph: '◆', bg: 'bg-indigo-100', text: 'text-indigo-700' },
  'x-ai':       { glyph: 'X', bg: 'bg-slate-200', text: 'text-slate-800' },
  'meta-llama': { glyph: 'M', bg: 'bg-blue-100', text: 'text-blue-600' },
  mistralai:    { glyph: '✸', bg: 'bg-red-100', text: 'text-red-600' },
  cohere:       { glyph: '✷', bg: 'bg-pink-100', text: 'text-pink-600' },
};

export function ProviderIcon({ provider, className }: Props) {
  const meta = PROVIDER_GLYPH[provider];
  if (!meta) {
    return <Brain className={cn('text-slate-500', className)} />;
  }
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold leading-none aspect-square',
        meta.bg,
        meta.text,
        className,
      )}
      style={{ fontSize: '0.7em' }}
      aria-label={provider}
    >
      {meta.glyph}
    </span>
  );
}
