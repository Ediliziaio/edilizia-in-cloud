/**
 * Documenti personali del cliente: carta d'identità, codice fiscale e altri
 * documenti della persona. Tutti facoltativi, anche più file per tipo (fronte
 * e retro). Compaiono anche nei documenti di ogni commessa del cliente.
 * Il contratto NON si carica qui: va nella commessa.
 */
import { supabase } from "@/integrations/supabase/client";
import { problemaFile } from "@/lib/commesse/documentiCommessa";
import { riduciFoto } from "@/lib/commesse/riduciFoto";

export const BUCKET_DOCUMENTI_CLIENTE = "customer-documents";

export type TipoDocumentoCliente = "identity" | "fiscal_code" | "other";

export const TIPI_DOCUMENTO_CLIENTE: { tipo: TipoDocumentoCliente; etichetta: string; aiuto: string }[] = [
  { tipo: "identity", etichetta: "Documento d'identità", aiuto: "Carta d'identità, patente o passaporto: anche fronte e retro in file separati." },
  { tipo: "fiscal_code", etichetta: "Codice fiscale", aiuto: "Tessera sanitaria o codice fiscale." },
  { tipo: "other", etichetta: "Altri documenti personali", aiuto: "Permesso di soggiorno, visura camerale, delega…" },
];

/** Etichette anche per i tipi storici (contratti caricati sul cliente prima del 16/09/2026). */
export const ETICHETTA_DOCUMENTO_CLIENTE: Record<string, string> = {
  identity: "Documento d'identità",
  fiscal_code: "Codice fiscale",
  other: "Altro documento personale",
  contract: "Contratto",
};

export type FileDocumentiCliente = Partial<Record<TipoDocumentoCliente, File[]>>;

export function contaFileDocumentiCliente(v: FileDocumentiCliente): number {
  return Object.values(v).reduce((t, l) => t + (l?.length ?? 0), 0);
}

/** Aggiunge file a un tipo scartando quelli non ammessi e i doppioni (stesso nome e peso). */
export function aggiungiFileCliente(
  v: FileDocumentiCliente,
  tipo: TipoDocumentoCliente,
  nuovi: File[],
): { valore: FileDocumentiCliente; scartati: string[] } {
  const esistenti = v[tipo] ?? [];
  const scartati: string[] = [];
  const buoni: File[] = [];
  for (const f of nuovi) {
    const problema = problemaFile(f);
    if (problema) { scartati.push(problema); continue; }
    if ([...esistenti, ...buoni].some((e) => e.name === f.name && e.size === f.size)) continue;
    buoni.push(f);
  }
  return { valore: { ...v, [tipo]: [...esistenti, ...buoni] }, scartati };
}

export function togliFileCliente(v: FileDocumentiCliente, tipo: TipoDocumentoCliente, indice: number): FileDocumentiCliente {
  return { ...v, [tipo]: (v[tipo] ?? []).filter((_, i) => i !== indice) };
}

export function percorsoDocumentoCliente(companyId: string, customerId: string, tipo: string, nome: string, ora = Date.now(), caso = Math.random()): string {
  const pulito = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_");
  return `${companyId}/${customerId}/${tipo}/${ora}-${Math.floor(caso * 1e6)}-${pulito}`;
}

/** Carica i documenti del cliente; restituisce quanti sono saliti e i nomi dei falliti. */
export async function caricaDocumentiCliente(opts: {
  companyId: string;
  customerId: string;
  userId: string;
  file: FileDocumentiCliente;
}): Promise<{ caricati: number; falliti: string[] }> {
  let caricati = 0;
  const falliti: string[] = [];
  const voci = (Object.entries(opts.file) as [TipoDocumentoCliente, File[] | undefined][])
    .flatMap(([tipo, lista]) => (lista ?? []).map((f) => ({ tipo, f })));

  for (const { tipo, f } of voci) {
    const { file } = await riduciFoto(f);
    const percorso = percorsoDocumentoCliente(opts.companyId, opts.customerId, tipo, file.name);
    try {
      const { error: errUpload } = await supabase.storage
        .from(BUCKET_DOCUMENTI_CLIENTE)
        .upload(percorso, file, { contentType: file.type || undefined, upsert: false });
      if (errUpload) throw errUpload;
      const { error: errRiga } = await supabase.from("customer_documents" as never).insert({
        company_id: opts.companyId,
        customer_id: opts.customerId,
        document_type: tipo,
        file_name: file.name,
        file_path: percorso,
        file_type: file.type || null,
        file_size: file.size,
        uploaded_by: opts.userId,
      } as never);
      if (errRiga) {
        await supabase.storage.from(BUCKET_DOCUMENTI_CLIENTE).remove([percorso]);
        throw errRiga;
      }
      caricati++;
    } catch {
      falliti.push(f.name);
    }
  }
  return { caricati, falliti };
}
