import type {FamilyWithAxes,AxisSelection} from '@/types/articleFamily';
import {Label} from '@/components/ui/label';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {variantiBestInfissi,avvisiVariantiBestInfissi} from '@/lib/listino/bestInfissiVarianti';
import {variantiTecnicheVisibili,riepilogoVariantiTecniche,type VarianteTecnicaConfermata} from '@/lib/listino/variantiTecnicheConfermate';

/** Campo comune a preventivi classici e Serramenti. Nessun collegamento al motore dei prezzi. */
export function VariantiTecnicheProdotto({famiglia,selezione,varianti,specifiche,onChange}:{
 famiglia:FamilyWithAxes; selezione:AxisSelection; varianti?:readonly VarianteTecnicaConfermata[];
 specifiche:Record<string,string>;onChange:(specifiche:Record<string,string>)=>void;
}){
 const visibili=variantiTecnicheVisibili(varianti??variantiBestInfissi(famiglia),famiglia,selezione);
 const riepilogo=riepilogoVariantiTecniche(visibili,specifiche);
 const avvisi=avvisiVariantiBestInfissi(famiglia);
 if(!visibili.length&&!avvisi.length)return null;
 return <div className="space-y-3">{visibili.length>0&&<fieldset className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/30 p-3">
 <legend className="px-1 text-sm font-medium">Varianti confermate dal produttore</legend>
 <p className="text-xs text-muted-foreground">Le scelte vengono riportate nella descrizione o nelle note tecniche del prodotto. Prezzi e supplementi del listino restano invariati; la disponibilità tecnica non indica che un accessorio sia incluso nel prezzo.</p>
 <div className="grid gap-3 sm:grid-cols-2">{visibili.map(v=><div key={v.codice}><Label htmlFor={`specifica-${famiglia.id}-${v.codice}`}>{v.nome}</Label><Select value={specifiche[v.codice]||'_non_specificato'} onValueChange={valore=>onChange({...specifiche,[v.codice]:valore==='_non_specificato'?'':valore})}><SelectTrigger id={`specifica-${famiglia.id}-${v.codice}`}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="_non_specificato">Da specificare</SelectItem>{v.valori.map(valore=><SelectItem key={valore.codice} value={valore.codice}>{valore.nome}</SelectItem>)}</SelectContent></Select><a href={v.fonte} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-primary underline">Fonte del produttore</a></div>)}</div>
 {riepilogo.length>0&&<ul aria-label="Riepilogo varianti confermate" className="space-y-1 text-xs">{riepilogo.map(riga=><li key={riga}>{riga}</li>)}</ul>}
 </fieldset>}{avvisi.length>0&&<details className="rounded-lg border border-amber-200 bg-amber-50/30 p-3 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium text-foreground">Varianti ancora da verificare</summary><ul className="mt-2 list-disc space-y-1 pl-4">{avvisi.map(avviso=><li key={avviso}>{avviso}</li>)}</ul></details>}</div>;
}
