export interface EconomicItem {label:string;amount:string;discountable:boolean;industrial_cost:string}
export interface EconomicInput {items:EconomicItem[];discount:string;rounding:'half_up'|'down'|'up';round_per_line:boolean;travel:string;guarantees:string;preparation:string;other_costs:string;rule_source:string}
function scaled(value:string,places:number):bigint {
 const raw=String(value).trim().replace(',','.');if(!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(raw))throw new Error(`Numero non valido: usa al massimo ${places} decimali e nessun separatore delle migliaia.`);
 const[a,b='']=raw.split('.');return BigInt(a)*10n**BigInt(places)+BigInt(b.padEnd(places,'0'));
}
export function cents(value:string){return scaled(value,2);}
export function decimal(value:bigint){const negative=value<0n;const n=negative?-value:value;return `${negative?'-':''}${n/100n}.${String(n%100n).padStart(2,'0')}`;}
function rounded(numerator:bigint,denominator:bigint,mode:EconomicInput['rounding']) {const q=numerator/denominator;const r=numerator%denominator;return q+(r===0n?0n:mode==='up'?1n:mode==='half_up'&&r*2n>=denominator?1n:0n);}
export function calculateEconomics(input:EconomicInput){
 if(!input.items.length)throw new Error('Definisci almeno una voce economica.');if(!input.rule_source.trim())throw new Error('Indica la fonte delle regole economiche della gara.');
 const rate=scaled(input.discount,4);if(rate>1_000_000n)throw new Error('Il ribasso deve essere compreso tra 0 e 100%.');
 const factor=1_000_000n-rate;let base=0n,eligible=0n,fixed=0n,discounted=0n,costs=0n;let costCoverage=true;
 for(const item of input.items){if(!item.label.trim())throw new Error('Descrivi ogni voce.');const amount=cents(item.amount);base+=amount;if(item.discountable){eligible+=amount;discounted+=rounded(amount*factor,1_000_000n,input.rounding);}else fixed+=amount;if(item.industrial_cost.trim())costs+=cents(item.industrial_cost);else costCoverage=false;}
 if(!input.round_per_line)discounted=rounded(eligible*factor,1_000_000n,input.rounding);
 for(const key of ['travel','guarantees','preparation','other_costs']as const){if(input[key].trim())costs+=cents(input[key]);else costCoverage=false;}
 const offered=fixed+discounted;const margin=offered-costs;
 return{base:decimal(base),eligible:decimal(eligible),fixed:decimal(fixed),offered:decimal(offered),reduction:decimal(eligible-discounted),industrial_cost:decimal(costs),margin:costCoverage?decimal(margin):null,cost_coverage_complete:costCoverage,margin_percent:costCoverage&&offered>0n?Number(margin*10000n/offered)/100:null,rule_source:input.rule_source};
}
