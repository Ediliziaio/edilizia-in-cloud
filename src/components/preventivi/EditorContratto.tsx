import { RichTextEditorSafe } from '@/components/ui/rich-text-editor-safe';
import { htmlPerEditorContratto } from '@/lib/preventivi/contrattoEditor';
import { contrattoInHtml, leggiTestoRiccoContratto, separaFirmeContratto } from '../../../supabase/functions/_shared/testoRiccoContratto';
import { Button } from '@/components/ui/button';

export function EditorContratto({value,onChange}: {value:string;onChange:(html:string)=>void}) {
  const signature=separaFirmeContratto(leggiTestoRiccoContratto(value));
  return <div className="space-y-3" data-contract-editor>
    <p className="text-xs text-muted-foreground">Seleziona le parole da modificare: font e dimensione si applicano solo alla selezione. Gli stili Articolo, Testo e Nota aiutano a mantenere il documento coerente.</p>
    <RichTextEditorSafe value={htmlPerEditorContratto(value)} onChange={onChange} documentMode minHeight={320} placeholder="Scrivi le clausole del contratto…" />
    {signature.firmeRilevate && <div className="rounded-lg border bg-background p-3 text-xs space-y-2">
      <p>Rilevate righe firma nel testo importato. Nel PDF vengono organizzate nella pagina «Accettazione proposta», senza ripetere i trattini nelle clausole. Il documento originale resta conservato.</p>
      <Button type="button" variant="outline" size="sm" onClick={()=>onChange(contrattoInHtml(signature.righe))}>Organizza anche il testo nell’editor</Button>
    </div>}
    <div className="rounded-lg border bg-muted/20 p-3 text-xs space-y-2" aria-label="Blocco firme del documento">
      <p className="font-medium">Accettazione e firme · blocco automatico nel PDF</p>
      <div className="grid grid-cols-3 gap-3 py-2 text-muted-foreground">
        {['Luogo e data', 'Per l’impresa', 'Firma del committente'].map(label=><div key={label} className="border-t pt-2">{label}</div>)}
      </div>
      <p>I nomi provengono dal preventivo. La seconda firma appare quando il testo elenca le clausole da approvare specificamente. Nessuna firma o accettazione viene applicata automaticamente.</p>
    </div>
  </div>;
}
