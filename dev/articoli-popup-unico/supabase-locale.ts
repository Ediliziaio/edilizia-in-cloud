/** Backend dimostrativo in memoria: nessuna connessione al database del gestionale. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { catalogoSimulazione, fornitoriSimulazione } from "./simulazione-appartamento";
type Riga = Record<string, unknown>;
const azienda = "articoli-demo-locale";
const provaAppartamento = new URLSearchParams(location.search).get("simulazione") === "appartamento";
const famiglia = (id: string, nome: string, supplier_id: string) => ({ id, nome, company_id: azienda, supplier_id, attivo: true, mostra_preventivo: true, deleted_at: null,
  codice: id.toUpperCase(), descrizione: null, immagine_url: null, categoria_id: null, vertical: "serramenti", modalita_prezzo_base: "mq", unit_of_measure: "pz", vat_rate: 22,
  prezzo_base_mode: "vendita", prezzo_base_acquisto: 140, prezzo_base_vendita: 220, sconto_fornitore_1: 0, sconto_fornitore_2: 0, markup_tipo: "none", markup_valore: 0, manodopera_costo_acquisto: 0, axes: [], custom_field_values: {} });
const tabelle: Record<string, Riga[]> = {
  suppliers: [
    { id: "fornitore-a", company_id: azienda, name: "Serramenti · Fornitore dimostrativo", vat_rate: 22, payment_method: "bonifico_unico", is_active: true },
    { id: "fornitore-b", company_id: azienda, name: "Schermature · Fornitore dimostrativo", vat_rate: 22, payment_method: "bonifico_unico", is_active: true },
    ...(provaAppartamento ? fornitoriSimulazione.map(f=>({...f,company_id:azienda,vat_rate:22,payment_method:"bonifico_unico",is_active:true})) : []),
  ],
  article_families: [famiglia("finestra", "Finestra due ante", "fornitore-a"), famiglia("tapparella", "Tapparella in alluminio", "fornitore-b"), famiglia("zanzariera", "Zanzariera laterale", "fornitore-b"), famiglia("cassonetto", "Cassonetto isolato", "fornitore-b"), famiglia("persiana", "Persiana a battente", "fornitore-a"), famiglia("porta", "Porta su misura", "fornitore-a")],
  article_templates: [{ id: "cemento", company_id: azienda, attivo: true, name: "Cemento · sacco 25 kg", supplier_id: "fornitore-b", unit_of_measure: "sacco", standard_cost: 8.5, vat_rate: 22 },
    { id: "silicone", company_id: azienda, attivo: true, name: "Silicone neutro", supplier_id: null, unit_of_measure: "pz", standard_cost: 4.8, vat_rate: 22 },
    ...(provaAppartamento ? catalogoSimulazione.map(a=>({...a,company_id:azienda})) : [])],
  warehouse_stock: [{ id: "stock-viti", company_id: azienda, name: "Viti per posa", quantity: 30, quantity_available: 18, quantity_reserved: 12, unit_cost: 5, vat_rate: 22, supplier_id: "fornitore-b", unita_misura: "scatola", tracking_mode: "fungible", warehouse: { id: "deposito", name: "Deposito dimostrativo" } }],
};
function query(tabella: string) {
  let filtri: Array<(r: Riga) => boolean> = [];
  let da = 0; let a = Infinity; let una = false; let inserite: Riga[] | null = null;
  const risposta = () => {
    const righe = (inserite ?? tabelle[tabella] ?? []).filter(r => filtri.every(f => f(r))).slice(da, a + 1);
    return { data: una ? righe[0] ?? null : righe, error: null };
  };
  const q = {
    select: (_campi?: string) => q,
    eq: (k: string, v: unknown) => { if (!k.includes(".")) filtri.push(r => r[k] === v); return q; },
    neq: (k: string, v: unknown) => { filtri.push(r => r[k] !== v); return q; },
    is: (k: string, v: unknown) => { filtri.push(r => (r[k] ?? null) === v); return q; },
    in: (k: string, vs: unknown[]) => { filtri.push(r => vs.includes(r[k])); return q; },
    order: (_k?: string, _opzioni?: unknown) => q,
    limit: (n: number) => { a = n - 1; return q; },
    range: (inizio: number, fine: number) => { da = inizio; a = fine; return q; },
    insert: (dati: Riga | Riga[]) => { inserite = (Array.isArray(dati) ? dati : [dati]).map(r => ({ ...(tabella === "article_templates" ? { attivo: true } : {}), ...r, id: crypto.randomUUID() })); tabelle[tabella] = [...(tabelle[tabella] ?? []), ...inserite]; filtri = []; return q; },
    maybeSingle: () => { una = true; return Promise.resolve(risposta()); },
    single: () => { una = true; return Promise.resolve(risposta()); },
    then: (ok: (r: ReturnType<typeof risposta>) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(risposta()).then(ok, ko),
  };
  return q;
}
const richieste = new Map<string,{impronta:string;result:unknown}>();
export const supabase = {
  from: query,
  rpc: async (fn:string, p:Record<string,unknown>) => {
    if (fn !== "commessa_prepara_forniture") return {data:[],error:null};
    const key=String(p.p_richiesta), impronta=JSON.stringify(p.p_voci), precedente=richieste.get(key);
    if (precedente) return precedente.impronta===impronta ? {data:precedente.result,error:null} : {data:null,error:{message:"Richiesta già salvata con altri dati"}};
    const righe=(p.p_voci as Riga[]).map(r=>({...r,id:crypto.randomUUID(),order_id:p.p_commessa}));
    const result={ids:righe.map(r=>r.id),voci_inserite:righe.length};
    tabelle.order_items=[...(tabelle.order_items??[]),...righe];richieste.set(key,{impronta,result});return {data:result,error:null};
  },
  auth: { getSession: async () => ({ data: { session: null }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  functions: { invoke: async () => ({ data: null, error: new Error("Operazione non disponibile nella prova locale") }) },
} as unknown as SupabaseClient;
