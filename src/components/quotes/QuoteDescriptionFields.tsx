import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
export function QuoteDescriptionFields({name,description,onChange}:{name:string;description:string;onChange:(field:'name'|'description',value:string)=>void}) {
 return <div className="min-w-0 flex-1 space-y-2"><Input aria-label="Titolo descrizione" value={name} onChange={e=>onChange('name',e.target.value)} placeholder="Titolo della descrizione…"/><Textarea aria-label="Testo descrizione" value={description} onChange={e=>onChange('description',e.target.value)} placeholder="Descrivi il lavoro, le condizioni o le specifiche…" className="min-h-24"/><p className="text-xs text-muted-foreground">Solo testo per il cliente: senza quantità e prezzi. Non modifica il totale e non crea materiali da acquistare.</p></div>;
}
