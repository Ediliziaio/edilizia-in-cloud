import { useState } from 'react';
import { Calculator, CheckCheck, ChevronDown, FileText, Image, Mic, Paperclip, ScanLine, SlidersHorizontal, Sparkles, WandSparkles, Wallet } from 'lucide-react';
import { ThinkingPromptInput } from '@/components/ui/thinking-prompt-input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { QuoteSupportingFileDialog } from './QuoteSupportingFileDialog';
import { QuoteVoiceDialog, type QuoteAudioTranscriber } from './QuoteVoiceDialog';
import type { QuoteDossierPage } from '@/lib/preventivi/quoteDossier';

export type QuoteComposerAction = 'formulas' | 'quantity' | 'estimate' | 'review' | 'models' | 'budget' | 'vision' | 'example' | 'project' | 'tax' | 'schedule' | 'planning';
export function QuoteChatComposer({ value, onValueChange, onSubmit, onStop, onAttachPlan, onAction, busy, disabled, real, hasPlan, hasLines, transcribe, onEvidence, planningEnabled }: {
  value: string; onValueChange: (text: string) => void; onSubmit: () => void; onStop: () => void; onAttachPlan: () => void; onAction: (action: QuoteComposerAction) => void;
  busy: boolean; disabled?: boolean; real: boolean; hasPlan: boolean; hasLines: boolean; transcribe?: QuoteAudioTranscriber;
  onEvidence?: (page: QuoteDossierPage) => boolean;
  planningEnabled?: boolean;
}) {
  const [panel, setPanel] = useState<'materials' | 'voice' | null>(null);
  const locked = busy || disabled;
  const insert = (text: string, evidence?: QuoteDossierPage) => { const next = value.trim() ? `${value}\n\n${text}` : text; if (next.length > 3000 || evidence && onEvidence && !onEvidence(evidence)) return false; onValueChange(next); return true; };
  const item = (label: string, action: QuoteComposerAction, Icon: typeof Calculator) => <DropdownMenuItem disabled={locked} onSelect={() => onAction(action)}><Icon size={16} aria-hidden="true" />{label}</DropdownMenuItem>;
  return <div className="quote-composer-dock">
    <ThinkingPromptInput compact inline value={value} onValueChange={onValueChange} onSubmit={onSubmit} onStop={onStop} busy={busy} disabled={disabled || panel !== null} placeholder="Descrivi il lavoro a Silvio…"
      trailingTools={<>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button type="button" className="quote-composer-icon" aria-label="Allega file" title="Allega planimetria o materiali" disabled={locked}><Paperclip size={18} aria-hidden="true" /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="quote-composer-menu">
            <DropdownMenuLabel>Aggiungi al progetto</DropdownMenuLabel>
            <DropdownMenuItem disabled={locked} onSelect={onAttachPlan}><Image size={16} aria-hidden="true" />Allega planimetria</DropdownMenuItem>
            <DropdownMenuItem disabled={locked || !import.meta.env.DEV && import.meta.env.VITE_QUOTE_CAD_ENABLED !== 'true'} onSelect={onAttachPlan}><FileText size={16} aria-hidden="true" />Allega disegno DWG · {import.meta.env.DEV ? 'lettura locale' : import.meta.env.VITE_QUOTE_CAD_ENABLED === 'true' ? 'convertitore server' : 'convertitore da attivare'}</DropdownMenuItem>
            <DropdownMenuItem disabled={locked} onSelect={() => setPanel('materials')}><FileText size={16} aria-hidden="true" />Materiali e documenti</DropdownMenuItem>
            {!hasPlan && <><DropdownMenuSeparator />{item('Leggi immagine di esempio (OCR reale)', 'example', ScanLine)}</>}
          </DropdownMenuContent>
        </DropdownMenu>
        <button type="button" className="quote-composer-icon quote-composer-mic" aria-label="Registra un messaggio vocale" title="Registra, riascolta e trascrivi" disabled={locked} onClick={() => setPanel('voice')}><Mic size={18} aria-hidden="true" /></button>
      </>} />
    <div className="quote-composer-footer">
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" className="quote-composer-tool-trigger" aria-label="Strumenti preventivo" disabled={locked}><SlidersHorizontal size={14} aria-hidden="true" /><span>Strumenti</span><ChevronDown size={12} aria-hidden="true" /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="quote-composer-menu">
          <DropdownMenuLabel>Lavora sul preventivo</DropdownMenuLabel>
          {item('Budget, costi, misure e versioni', 'project', SlidersHorizontal)}
          {item('Prezzi e IVA', 'tax', Calculator)}
          {planningEnabled && item('Trasferte, risorse e scadenze · scenari locali', 'planning', CheckCheck)}
          {real && item('Cronoprogramma preliminare con AI', 'schedule', CheckCheck)}
          {hasLines && <>{real && item('Proponi formule con AI', 'formulas', WandSparkles)}{item('Calcola quantità', 'quantity', Calculator)}{item('Stime indicative', 'estimate', Wallet)}{item('Verifica computo', 'review', CheckCheck)}<DropdownMenuSeparator /></>}
          {real && <>{item('Budget preliminare con AI', 'budget', Sparkles)}{hasPlan && item('Analizza immagine con AI · invia copia a OpenRouter', 'vision', ScanLine)}{item('Modello e costi AI', 'models', SlidersHorizontal)}</>}
          {!real && item('Leggi immagine di esempio (OCR reale)', 'example', ScanLine)}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="quote-composer-hint"><span>Invio per inviare <span aria-hidden="true">·</span> Maiusc + Invio per andare a capo</span><span>Nulla cambia finché non confermi</span></div>
    </div>
    {panel === 'materials' && <QuoteSupportingFileDialog onClose={() => setPanel(null)} onInsert={insert} />}
    {panel === 'voice' && <QuoteVoiceDialog onClose={() => setPanel(null)} onInsert={insert} transcribe={transcribe} />}
  </div>;
}
