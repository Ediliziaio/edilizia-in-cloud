import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { parseContractExtract, type ContractExtract } from "./contractExtract";
import type { StoredContractFile } from "./contractPreparation";

const CAMPO = "_letture_commessa";
const ASSOCIAZIONE = "_commessa_importazione";
const COLONNE = "id,company_id,sha256_hash,structured_fields,updated_at";
type Archivio = Pick<typeof supabase, "from">;
type Riga = { id: string; company_id: string; sha256_hash: string | null; structured_fields: unknown; updated_at: string };
export interface LetturaContrattoSalvata {
  analysisId?: string;
  orderId?: string | null;
  versione: 1;
  contesto: string;
  salvata_il: string;
  estratto: ContractExtract;
  originale: StoredContractFile;
}

export function commessaDellaLettura(campi: unknown): string | null {
  const id = oggetto(oggetto(campi)?.[ASSOCIAZIONE])?.order_id;
  return typeof id === "string" && id ? id : null;
}

export class AnalisiGiaCollegataError extends Error {
  constructor(public orderId: string) {
    super("Questo documento è già collegato a una commessa. Apri quella commessa per riprendere la lettura.");
    this.name = "AnalisiGiaCollegataError";
  }
}

export async function verificaAnalisiPerNuovaCommessa(companyId: string, source: StoredContractFile, db: Archivio = supabase): Promise<void> {
  let query = db.from("document_analysis_results").select(COLONNE).eq("company_id", companyId);
  query = source.sha256 ? query.eq("sha256_hash", source.sha256) : source.analysisId ? query.eq("id", source.analysisId) : query.eq("storage_path", source.path);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("Non riesco a verificare se il documento è già collegato a una commessa.", { cause: error });
  const id = commessaDellaLettura(data?.structured_fields);
  if (id) throw new AnalisiGiaCollegataError(id);
}

const oggetto = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;

/** Le note e la destinazione cambiano l'interpretazione, il nome del file no. */
export function contestoLetturaContratto(destinazione: string, azienda: string | null | undefined, note: string): string {
  return JSON.stringify([1, destinazione, azienda?.trim() ?? "", note.trim()]);
}

export function indicazioniLetturaContratto(contesto: string): string | null {
  try { const v: unknown = JSON.parse(contesto); return Array.isArray(v) && v[0] === 1 && typeof v[3] === "string" ? v[3] : null; }
  catch { return null; }
}

function stessoPercorso(a: string, b: string): boolean {
  try { return JSON.stringify(JSON.parse(a).slice(0, 3)) === JSON.stringify(JSON.parse(b).slice(0, 3)); }
  catch { return false; }
}

export async function improntaFileContratto(file: File): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}

function originaleAmmesso(v: unknown, companyId: string, orderId?: string | null): v is StoredContractFile {
  const s = oggetto(v);
  if (!s || typeof s.path !== "string" || typeof s.name !== "string" || !s.name || typeof s.mime !== "string" || /\.\.|%|\\/.test(s.path)) return false;
  return s.bucket === "documenti-smart" && s.path.startsWith(`${companyId}/ai-contratti/`)
    || !!orderId && s.bucket === "order-attachments" && s.path.startsWith(`${orderId}/ai-contratti/`);
}

function letture(riga: Riga, companyId: string, contesto: string, orderId?: string | null, recenti = false): LetturaContrattoSalvata[] {
  if (riga.company_id !== companyId) return [];
  const associata = commessaDellaLettura(riga.structured_fields);
  if (associata && associata !== orderId) return [];
  const archiviate = oggetto(riga.structured_fields)?.[CAMPO];
  if (!Array.isArray(archiviate)) return [];
  return archiviate.flatMap(value => {
    const v = oggetto(value);
    if (!v || v.versione !== 1 || typeof v.contesto !== "string" || !(recenti ? stessoPercorso(v.contesto, contesto) : v.contesto === contesto) || typeof v.salvata_il !== "string" || !Number.isFinite(Date.parse(v.salvata_il)) || !oggetto(v.estratto) || !originaleAmmesso(v.originale, companyId, orderId)) return [];
    const estratto = parseContractExtract(v.estratto);
    if (!estratto.summary && !estratto.descrizione_lavori && !estratto.cliente.nome_completo && !estratto.voci.length) return [];
    return [{ versione: 1 as const, analysisId: riga.id, orderId: associata, contesto: v.contesto, salvata_il: v.salvata_il, estratto,
      originale: { ...v.originale, ...(riga.sha256_hash ? { sha256: riga.sha256_hash } : {}), analysisId: riga.id } }];
  });
}

/** Il risultato è una fotografia documentale, senza scadenza. Giacenze e ordini si rileggono sempre. */
export async function cercaLetturaContratto(companyId: string, hash: string, contesto: string, orderId?: string | null, db: Archivio = supabase): Promise<LetturaContrattoSalvata | null> {
  const { data, error } = await db.from("document_analysis_results").select(COLONNE).eq("company_id", companyId).eq("sha256_hash", hash).maybeSingle();
  if (error) throw new Error("Non riesco a verificare le analisi già salvate.", { cause: error });
  const associata = commessaDellaLettura(data?.structured_fields);
  if (associata && associata !== orderId) throw new AnalisiGiaCollegataError(associata);
  return data ? letture(data, companyId, contesto, orderId)[0] ?? null : null;
}

export async function elencaLettureContratto(companyId: string, contesto: string, orderId?: string | null, db: Archivio = supabase): Promise<LetturaContrattoSalvata[]> {
  let query = db.from("document_analysis_results").select(COLONNE).eq("company_id", companyId)
    .not(`structured_fields->${CAMPO}`, "is", null);
  query = orderId ? query.eq(`structured_fields->${ASSOCIAZIONE}->>order_id`, orderId)
    : query.is(`structured_fields->${ASSOCIAZIONE}->>order_id`, null);
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(30);
  if (error) throw new Error("Analisi salvate non disponibili.", { cause: error });
  return (data ?? []).flatMap(r => letture(r, companyId, contesto, orderId, true)).slice(0, 3);
}

/** Riusa la riga dell'inbox senza sovrascrivere le altre analisi o i collegamenti del documento. */
export async function salvaLetturaContratto(input: {
  companyId: string; hash: string; contesto: string; estratto: ContractExtract;
  originale: StoredContractFile; uploadedBy: string | null; orderId?: string | null;
}, db: Archivio = supabase): Promise<LetturaContrattoSalvata> {
  if (!/^[a-f0-9]{64}$/.test(input.hash) || !originaleAmmesso(input.originale, input.companyId, input.orderId)) throw new Error("Riferimento del documento non valido.");
  const lettura: LetturaContrattoSalvata = {
    versione: 1, contesto: input.contesto, salvata_il: new Date().toISOString(),
    estratto: input.estratto, originale: input.originale,
  };
  for (let tentativo = 0; tentativo < 2; tentativo++) {
    const { data: esistente, error: eRead } = await db.from("document_analysis_results").select(COLONNE)
      .eq("company_id", input.companyId).eq("sha256_hash", input.hash).maybeSingle();
    if (eRead) throw new Error("Analisi letta, ma non archiviata: riprova il salvataggio.", { cause: eRead });
    const campi = oggetto(esistente?.structured_fields) ?? {};
    const associata = commessaDellaLettura(campi);
    if (associata && associata !== input.orderId) throw new AnalisiGiaCollegataError(associata);
    const altre = (Array.isArray(campi[CAMPO]) ? campi[CAMPO] : []).filter(v => oggetto(v)?.contesto !== input.contesto).slice(0, 7);
    const structured = { ...campi, [CAMPO]: [lettura, ...altre],
      ...(input.orderId ? { [ASSOCIAZIONE]: { order_id: input.orderId, associata_il: new Date().toISOString() } } : {}) } as unknown as Json;
    if (esistente) {
      const { data, error } = await db.from("document_analysis_results").update({ structured_fields: structured })
        .eq("id", esistente.id).eq("company_id", input.companyId).eq("updated_at", esistente.updated_at).select("id").maybeSingle();
      if (error) throw new Error("Analisi letta, ma non archiviata: riprova il salvataggio.", { cause: error });
      if (data) return { ...lettura, analysisId: esistente.id, orderId: input.orderId ?? null,
        originale: { ...input.originale, sha256: input.hash, analysisId: esistente.id } };
    } else {
      const { error } = await db.from("document_analysis_results").insert({
        company_id: input.companyId, sha256_hash: input.hash, storage_bucket: input.originale.bucket,
        storage_path: input.originale.path, file_name: input.originale.name, mime_type: input.originale.mime,
        file_size_bytes: input.originale.size ?? null, uploaded_by: input.uploadedBy,
        doc_type: input.estratto.origine_lettura === "computo" ? "computo_metrico" : "contratto",
        parser_used: "contratto_commessa", status: "review_required", structured_fields: structured,
      });
      if (!error) return { ...lettura, orderId: input.orderId ?? null, originale: { ...input.originale, sha256: input.hash } };
      if (error.code !== "23505") throw new Error("Analisi letta, ma non archiviata: riprova il salvataggio.", { cause: error });
    }
  }
  throw new Error("Il documento è stato aggiornato durante il salvataggio: riprova.");
}

/** Associazione al salvataggio della commessa, non quando si apre o si applica l'anteprima. */
export async function collegaAnalisiAllaCommessa(companyId: string, orderId: string, source: StoredContractFile, db: Archivio = supabase): Promise<void> {
  const ordine = await db.from("orders").select("id").eq("company_id", companyId).eq("id", orderId).maybeSingle();
  if (ordine.error || !ordine.data) throw new Error("Commessa non disponibile per collegare l'analisi.");
  for (let tentativo = 0; tentativo < 3; tentativo++) {
    let query = db.from("document_analysis_results").select(COLONNE).eq("company_id", companyId);
    query = source.sha256 ? query.eq("sha256_hash", source.sha256) : source.analysisId ? query.eq("id", source.analysisId) : query.eq("storage_path", source.path);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error("Non riesco a collegare la lettura alla commessa.", { cause: error });
    if (!data) return; // Originali di flussi precedenti senza una lettura archiviata.
    const associata = commessaDellaLettura(data.structured_fields);
    if (associata === orderId) return;
    if (associata) throw new AnalisiGiaCollegataError(associata);
    const structured_fields = { ...oggetto(data.structured_fields), [ASSOCIAZIONE]: { order_id: orderId, associata_il: new Date().toISOString() } } as unknown as Json;
    const risultato = await db.from("document_analysis_results").update({ structured_fields })
      .eq("company_id", companyId).eq("id", data.id).eq("updated_at", data.updated_at).select("id").maybeSingle();
    if (risultato.error) throw new Error("Non riesco a collegare la lettura alla commessa.", { cause: risultato.error });
    if (risultato.data) return;
  }
  throw new Error("La lettura è cambiata durante il collegamento: riprova dalla commessa.");
}
