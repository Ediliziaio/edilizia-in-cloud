/** A copied tool payload is data, never a user-facing answer or an instruction. */
const INTERNAL_KEYS = ['attivita','aree','creata','eseguito','commesse','commessa','records','personale','rate','toolName','nota_permessi','limited_to'];
const fallback = 'Non riesco a presentare questi dati in modo leggibile. Chiedimi un riepilogo o un dettaglio specifico.';
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown) => typeof value === 'string' ? value.replace(/[\r\n]/g,' ').slice(0,160) : '';
const money = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('it-IT',{style:'currency',currency:'EUR'}) : null;
function orderLine(value: unknown,index:number):string {
 const row=object(value)??{};
 const name=text(row.description)||text(row.order_code)||`Commessa ${index+1}`;
 const fields=[['Venduto',row.total_amount??row.preventivo_totale],['Costi',row.consuntivo],['Margine',row.margine]];
 const amounts=fields.flatMap(([label,value])=>{const v=money(value);return v?[`${label}: ${v}`]:[]});
 return name+(amounts.length?' — '+amounts.join('; '):'');
}
export function publicSilvioReply(answer:string):string {
 // The marker is confined to the local test provider, but must not expose its payload either.
 const cleaned=answer.replace(/^\[Collaudo locale[^\n]*\]\s*/,'').trim();
 const candidate=cleaned.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 let parsed:unknown;
 try{parsed=JSON.parse(candidate)}catch{return cleaned===answer.trim()?answer:fallback}
 const root=object(parsed);
 if(!root||!INTERNAL_KEYS.some(k=>Object.prototype.hasOwnProperty.call(root,k)))return answer;
 // Only allowlisted display fields; never IDs, prompts, URLs, metadata or permission instructions.
 if(root.creata===true)return 'Attività creata nell’area richiesta.';
 if(root.eseguito===true)return 'Operazione sull’attività completata.';
 if(Array.isArray(root.attivita))return root.attivita.length?root.attivita.slice(0,50).map((r,i)=>{const row=object(r)??{};return '• '+(text(row.title)||`Attività ${i+1}`)+(text(row.status)?' — '+text(row.status).replace(/_/g,' '):'')}).join('\n'):'Nessuna attività consultabile con questi filtri.';
 if(Array.isArray(root.commesse))return root.commesse.length?root.commesse.slice(0,50).map((r,i)=>'• '+orderLine(r,i)).join('\n'):'Nessuna commessa consultabile con questi filtri.';
 if(object(root.commessa))return orderLine(root.commessa,0);
 if(Array.isArray(root.personale))return root.personale.length?root.personale.slice(0,50).map((r,i)=>{const row=object(r)??{};const name=[text(row.first_name),text(row.last_name)].filter(Boolean).join(' ')||`Persona ${i+1}`;const values=[['Retribuzione lorda',row.gross_salary],['Retribuzione netta',row.net_salary],['Costo orario',row.costo_orario]].flatMap(([k,v])=>{const amount=money(v);return amount?[`${k}: ${amount}`]:[]});return '• '+name+(values.length?' — '+values.join('; '):'')}).join('\n'):'Nessuna persona consultabile con questi filtri.';
 if(Array.isArray(root.records))return root.records.length?root.records.slice(0,50).map((r,i)=>{const row=object(r)??{};return '• '+(text(row.name)||[text(row.first_name),text(row.last_name)].filter(Boolean).join(' ')||`Elemento ${i+1}`)}).join('\n'):'Nessun elemento consultabile con questi filtri.';
 return fallback;
}
