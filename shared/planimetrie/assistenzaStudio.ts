import { DATI_URBANISTICI, type MetricaUrbanistica } from "./urbanistica.ts";

export interface AlternativaFrazionamento {
  id: string;
  asse: "x" | "y";
  percentuali: number[];
  superfici: number[];
  muriMq: number;
}
export interface RispostaAlternativa { id: string; motivazione: string; verifiche: string[] }
export interface RequisitoDaEstratto {
  metrica: MetricaUrbanistica;
  estratto: string;
  condizione: string;
  soglia?: number;
}

const record = (v: unknown): v is Record<string,unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const testo = (v: unknown, max: number): v is string => typeof v === "string" && !!v.trim() && v.length <= max;
const misura = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100_000;
const chiave = (v: unknown): v is string => typeof v === "string" && /^\d{1,2}$/.test(v);

export function validaAlternative(a: unknown): a is AlternativaFrazionamento[] {
  return Array.isArray(a) && a.length>=1 && a.length<=14 && new Set(a.map(x=>record(x) ? x.id : null)).size === a.length
    && a.every(v=>record(v) && chiave(v.id) && (v.asse === "x" || v.asse === "y") && misura(v.muriMq)
      && Array.isArray(v.percentuali) && v.percentuali.length>=1 && v.percentuali.length<=2
      && v.percentuali.every((p,i,a)=>misura(p) && p>0 && p<100 && (i===0 || p>a[i-1]))
      && Array.isArray(v.superfici) && v.superfici.length === v.percentuali.length+1 && v.superfici.every(n=>misura(n) && n>0));
}

export function leggiRispostaFrazionamento(json: unknown, alternative: AlternativaFrazionamento[]): RispostaAlternativa[] {
  if (!record(json) || !Array.isArray(json.suggerimenti)) return [];
  const ids = new Set(alternative.map(a=>a.id));
  const validi: RispostaAlternativa[] = [];
  for (const a of json.suggerimenti.slice(0,3)) {
    if (!record(a) || !chiave(a.id) || !ids.delete(a.id) || !testo(a.motivazione,500) || !Array.isArray(a.verifiche)) continue;
    validi.push({id:a.id,motivazione:a.motivazione,verifiche:a.verifiche.slice(0,4).filter(v=>testo(v,180))});
  }
  return validi;
}

const compatta = (v: string) => v.replace(/\s+/g," ").trim();

export function leggiRispostaUrbanistica(json: unknown, testoFonte: string): RequisitoDaEstratto[] {
  if (!record(json) || !Array.isArray(json.requisiti)) return [];
  const fonte = compatta(testoFonte);
  const validi: RequisitoDaEstratto[] = [];
  for (const r of json.requisiti.slice(0,8)) {
    if (!record(r) || typeof r.metrica !== "string" || !Object.hasOwn(DATI_URBANISTICI,r.metrica)
      || !testo(r.estratto,500) || !testo(r.condizione,450) || compatta(r.estratto).length<12 || !fonte.includes(compatta(r.estratto))) continue;
    const numeri = (r.estratto.match(/\d+(?:[,.]\d+)?/g) ?? []).map(n=>Number(n.replace(",",".")));
    const soglia = (r.metrica==="superficie" || r.metrica==="altezza") && misura(r.soglia) && r.soglia>0 && numeri.includes(r.soglia) ? r.soglia : undefined;
    validi.push({metrica:r.metrica as MetricaUrbanistica,estratto:r.estratto.trim(),condizione:r.condizione.trim(),...(soglia ? {soglia} : {})});
  }
  return validi;
}
