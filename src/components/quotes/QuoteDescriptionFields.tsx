import { Input } from '@/components/ui/input';
import { TestoCheCresce } from '@/components/ui/testo-che-cresce';
import { useT } from '@/lib/campo/lingua/LinguaCampo';
export function QuoteDescriptionFields({name,description,onChange}:{name:string;description:string;onChange:(field:'name'|'description',value:string)=>void}) {
 const t = useT();
 return <div className="min-w-0 flex-1 space-y-2"><Input aria-label={t("Titolo descrizione")} value={name} onChange={e=>onChange('name',e.target.value)} placeholder={t("Titolo della descrizione…")}/><TestoCheCresce aria-label={t("Testo descrizione")} minRighe={4} maxLength={20000} value={description} onChange={e=>onChange('description',e.target.value)} placeholder={t("Descrivi il lavoro, le condizioni o le specifiche…")}/><p className="text-xs text-muted-foreground">{t("Solo testo per il cliente: senza quantità e prezzi. Non modifica il totale e non crea materiali da acquistare.")}</p></div>;
}
