import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { leggiBozzaComputo, type BozzaComputo } from "./editorNativo";
import { leggiAllegatoLocale, salvaAllegatiRipristinati } from "./allegatiLocali";

type Row = { id: string; company_id: string; created_by: string; revision: number; payload: Json; title: string | null; client_name: string | null; items_count: number; updated_at: string };
type CloudDatabase = Omit<Database, "public"> & { public: Omit<Database["public"], "Tables"> & { Tables: Database["public"]["Tables"] & {
  computo_preventivo_drafts: { Row: Row; Insert: { id: string; company_id: string; payload: Json; revision?: number }; Update: { payload?: Json; revision?: number }; Relationships: [] };
  computo_preventivo_costi: { Row: { company_id: string; draft_id: string; costi: Json; updated_at: string }; Insert: { company_id: string; draft_id: string; costi: Json; updated_at?: string }; Update: { costi?: Json; updated_at?: string }; Relationships: [] };
} } };
const db = supabase as unknown as SupabaseClient<CloudDatabase>;
const BUCKET = "quote-materials";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Dal 29/10/2026 il preventivo con computo si salva nel gestionale per ogni azienda (prima solo Demo Azienda 2). */
export const computoCloudAttivo = (companyId: string | undefined) => !!companyId && uuid.test(companyId);
export class ConflittoComputoCloud extends Error {
  constructor() { super("Il computo è stato modificato da un altro dispositivo. Le tue modifiche sono al sicuro su questo computer: scarica la tua copia e riapri la versione salvata."); }
}
export type ComputoCloud = { id: string; revision: number; bozza: BozzaComputo; updatedAt: string };
export type RiepilogoComputoCloud = { id: string; titolo: string; committente: string; numeroVoci: number; updatedAt: string };

function verifica(companyId: string, id?: string) {
  // L'azienda la controllano le policy del database; qui si rifiutano solo identificativi che non sono UUID (niente «../» nei percorsi).
  if (!uuid.test(companyId) || (id != null && !uuid.test(id))) throw new Error("Azienda o computo non riconosciuti: ricarica la pagina.");
}
export function percorsoAllegatoComputo(companyId: string, draftId: string, fileId: string) {
  verifica(companyId, draftId);
  if (!uuid.test(fileId)) throw new Error("Identificativo allegato non valido.");
  return `${companyId}/computo-preventivi/${draftId.toLowerCase()}/${fileId.toLowerCase()}`;
}
export async function improntaComputo(bozza: BozzaComputo) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(bozza)));
  return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, "0")).join("");
}
/**
 * I costi stimati delle voci stanno in `computo_preventivo_costi` (29/10/2026), che legge solo chi ha il
 * permesso dei costi: nella bozza, che legge chiunque veda i preventivi, la voce ha il costo vuoto.
 * Qui si ricorda quali bozze avevano una riga di costi, per poterla svuotare quando si tolgono tutti.
 */
const costiPresenti = new Set<string>();
export async function leggiComputoCloud(companyId: string, id: string): Promise<ComputoCloud | null> {
  verifica(companyId, id);
  const { data, error } = await db.from("computo_preventivo_drafts").select("id, revision, payload, updated_at").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) throw new Error("Il gestionale non risponde. La copia su questo computer non è stata toccata.");
  if (!data) return null;
  const bozza = leggiBozzaComputo(JSON.stringify(data.payload));
  // Chi non ha il permesso riceve zero righe: la bozza resta senza costi, come deve.
  const { data: riga } = await db.from("computo_preventivo_costi").select("costi").eq("company_id", companyId).eq("draft_id", id).maybeSingle();
  const costi = riga?.costi && typeof riga.costi === "object" && !Array.isArray(riga.costi) ? riga.costi as Record<string, unknown> : null;
  if (costi) costiPresenti.add(id);
  return { id: data.id, revision: data.revision, updatedAt: data.updated_at,
    bozza: costi ? { ...bozza, voci: bozza.voci.map(v => typeof costi[v.id] === "string" ? { ...v, costo: costi[v.id] as string } : v) } : bozza };
}
export async function elencaComputiCloud(companyId: string): Promise<RiepilogoComputoCloud[]> {
  verifica(companyId);
  const { data, error } = await db.from("computo_preventivo_drafts").select("id,title,client_name,items_count,updated_at").eq("company_id", companyId).order("updated_at", { ascending: false }).limit(200);
  if (error) throw new Error("L'elenco dei computi salvati non si apre adesso.");
  return (data ?? []).map(r => ({ id: r.id, titolo: r.title ?? "", committente: r.client_name ?? "", numeroVoci: r.items_count, updatedAt: r.updated_at }));
}
/**
 * Allegati già caricati in questa sessione, per bozza. Gli allegati sono
 * immutabili (un id per file): da quando il computo si salva da solo, a ogni
 * pausa di scrittura, ricaricarli tutti ogni volta voleva dire rispedire fino
 * a 50 MB per una virgola cambiata nella descrizione.
 */
const allegatiCaricati = new Map<string, Set<string>>();

export async function salvaComputoCloud(companyId: string, id: string, scope: string, bozza: BozzaComputo, revision: number): Promise<ComputoCloud> {
  verifica(companyId, id);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Versione del computo non valida.");
  const valida = leggiBozzaComputo(JSON.stringify(bozza));
  if (new Blob([JSON.stringify(valida)]).size > 6 * 1024 * 1024) throw new Error("Il computo supera il limite di 6 MB di dati. Gli allegati sono salvati separatamente.");
  let totale = 0;
  const caricati = allegatiCaricati.get(id) ?? new Set<string>();
  // I file sono immutabili e vengono caricati prima della conferma della revisione.
  for (const meta of valida.allegati) {
    if (caricati.has(meta.id)) { totale += meta.dimensione; continue; }
    const blob = await leggiAllegatoLocale(scope, meta.id);
    if (!blob || blob.size !== meta.dimensione || blob.type !== meta.mime) throw new Error(`File locale mancante o non coerente: ${meta.nome}.`);
    if ((totale += blob.size) > 50 * 1024 * 1024) throw new Error("Gli allegati superano il limite complessivo di 50 MB.");
    const { error } = await db.storage.from(BUCKET).upload(percorsoAllegatoComputo(companyId, id, meta.id), blob, { contentType: meta.mime, upsert: false });
    if (error && String(error.statusCode) !== "409") throw new Error(`Non riesco a caricare l'allegato ${meta.nome}. La versione salvata non è stata sostituita.`);
    caricati.add(meta.id);
  }
  allegatiCaricati.set(id, caricati);
  // I costi vanno nella loro tabella riservata, non nella bozza che leggono tutti.
  const costi = Object.fromEntries(valida.voci.filter(v => (v.costo ?? "").trim()).map(v => [v.id, v.costo.trim()]));
  const payload = { ...valida, voci: valida.voci.map(v => v.costo ? { ...v, costo: "" } : v) } as unknown as Json;
  const table = db.from("computo_preventivo_drafts");
  const result = revision === 0
    ? await table.insert({ id, company_id: companyId, payload, revision: 1 }).select("id,revision,updated_at").single()
    : await table.update({ payload, revision: revision + 1 }).eq("company_id", companyId).eq("id", id).eq("revision", revision).select("id,revision,updated_at").maybeSingle();
  if (result.error?.code === "23505" || (!result.error && !result.data)) throw new ConflittoComputoCloud();
  if (result.error || !result.data) throw new Error("Salvataggio non riuscito. Dati e allegati restano su questo computer.");
  if (Object.keys(costi).length || costiPresenti.has(id)) {
    const { error: erroreCosti } = await db.from("computo_preventivo_costi").upsert({ company_id: companyId, draft_id: id, costi, updated_at: new Date().toISOString() }, { onConflict: "company_id,draft_id" });
    // Senza il permesso dei costi la scrittura è rifiutata: i costi restano su questo computer, la bozza è salva.
    if (!erroreCosti) costiPresenti.add(id);
  }
  return { id: result.data.id, revision: result.data.revision, bozza: valida, updatedAt: result.data.updated_at };
}
export async function preparaAllegatiCloud(companyId: string, id: string, scope: string, bozza: BozzaComputo) {
  verifica(companyId, id);
  const nuovi: { id: string; blob: Blob }[] = [];
  let totale = 0;
  for (const meta of bozza.allegati) {
    if ((totale += meta.dimensione) > 50 * 1024 * 1024) throw new Error("Gli allegati del computo superano 50 MB.");
    const locale = await leggiAllegatoLocale(scope, meta.id);
    if (locale?.size === meta.dimensione && locale.type === meta.mime) continue;
    const { data, error } = await db.storage.from(BUCKET).download(percorsoAllegatoComputo(companyId, id, meta.id));
    if (error || !data || data.size !== meta.dimensione || data.type !== meta.mime) throw new Error(`Recupero allegato non riuscito: ${meta.nome}. Nessun dato locale è stato sostituito.`);
    nuovi.push({ id: meta.id, blob: data });
  }
  if (nuovi.length) await salvaAllegatiRipristinati(scope, nuovi);
}
