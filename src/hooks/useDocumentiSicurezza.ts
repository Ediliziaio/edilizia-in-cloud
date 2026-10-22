/**
 * I documenti di sicurezza, da UN posto solo per chi li guarda:
 * - archivio della sicurezza (`sicurezza_documenti`, bucket `sicurezza-documenti`):
 *   PSC, notifica, PiMUS, patente a crediti, DURC dell'impresa…;
 * - scheda del subappaltatore (`documenti_subappaltatore`) e suo fascicolo
 *   (`subappaltatori_documenti`, caricamento in massa e lettura AI), nel bucket
 *   `subappaltatori-documenti`: DURC, POS, visura, DVR delle imprese.
 * Un documento si carica una volta: quello di un subappaltatore caricato dalla
 * sicurezza finisce nella sua scheda (e il DURC aggiorna la scadenza della
 * scheda), quello caricato dalla scheda compare nella sicurezza.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  tipoDaSubappaltatore, tipoPerSubappaltatore,
  type DocumentoSicurezza, type TipoDocumentoSicurezza,
} from "@/lib/sicurezza/documentiSicurezza";

export const BUCKET_SICUREZZA = "sicurezza-documenti";
export const BUCKET_SUBAPPALTATORI = "subappaltatori-documenti";

export const chiaviDocumentiSicurezza = {
  tutti: ["sicurezza-documenti"] as const,
  elenco: (companyId: string | null | undefined, orderId?: string | null) =>
    ["sicurezza-documenti", companyId, orderId ?? "tutti"] as const,
};

const COLONNE = "id, order_id, subappaltatore_id, tipo, titolo, file_path, file_name, data_documento, data_scadenza, note, created_at";

type Riga = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : null);

/** Con `orderId`: i documenti della commessa, quelli di tutta l'azienda e quelli dei suoi subappaltatori. */
export function useDocumentiSicurezza(companyId: string | null | undefined, orderId?: string | null) {
  return useQuery({
    queryKey: chiaviDocumentiSicurezza.elenco(companyId, orderId),
    queryFn: async (): Promise<DocumentoSicurezza[]> => {
      let q = supabase.from("sicurezza_documenti" as never).select(COLONNE).eq("company_id", companyId!);
      if (orderId) q = q.or(`order_id.eq.${orderId},order_id.is.null`);
      let qs = supabase.from("subappaltatori_sicurezza").select("id, order_id, campo_subappaltatore_id").eq("company_id", companyId!);
      if (orderId) qs = qs.eq("order_id", orderId);
      const [propri, subRes] = await Promise.all([q.order("created_at", { ascending: false }), qs]);
      if (propri.error) throw propri.error;
      if (subRes.error) throw subRes.error;
      const documenti: DocumentoSicurezza[] = ((propri.data ?? []) as unknown as DocumentoSicurezza[]).map((d) => ({ ...d, fonte: "sicurezza" as const }));

      const sub = (subRes.data ?? []) as Array<{ id: string; order_id: string | null; campo_subappaltatore_id: string | null }>;
      if (!sub.length) return documenti;
      const sicIds = sub.map((x) => x.id);
      const perAnagrafica = new Map<string, typeof sub>();
      for (const x of sub) if (x.campo_subappaltatore_id) perAnagrafica.set(x.campo_subappaltatore_id, [...(perAnagrafica.get(x.campo_subappaltatore_id) ?? []), x]);

      const [scheda, fascicolo] = await Promise.all([
        supabase.from("documenti_subappaltatore" as never)
          .select("id, subappaltatore_id, tipo, nome_file, url, data_rilascio, data_scadenza, note, created_at")
          .in("subappaltatore_id", sicIds),
        perAnagrafica.size
          ? supabase.from("subappaltatori_documenti" as never)
            .select("id, subappaltatore_id, tipo, storage_path, numero_protocollo, data_emissione, scadenza, status, created_at")
            .in("subappaltatore_id", [...perAnagrafica.keys()]).in("status", ["active", "expired"])
          : Promise.resolve({ data: [], error: null }),
      ]);
      // Gli archivi dei subappaltatori sono un di più: se uno non si legge, la sicurezza resta usabile.
      const ordinePerSic = new Map(sub.map((x) => [x.id, x.order_id]));
      for (const r of ((scheda.data ?? []) as Riga[])) {
        const sicId = s(r.subappaltatore_id)!;
        documenti.push({
          id: `scheda-${s(r.id)}`, fonte: "subappaltatore", bucket: BUCKET_SUBAPPALTATORI,
          order_id: ordinePerSic.get(sicId) ?? null, subappaltatore_id: sicId,
          tipo: tipoDaSubappaltatore(s(r.tipo) ?? ""), titolo: s(r.note) || s(r.nome_file) || "Documento",
          file_path: s(r.url) ?? "", file_name: s(r.nome_file) ?? "",
          data_documento: s(r.data_rilascio), data_scadenza: s(r.data_scadenza), note: null,
          created_at: s(r.created_at) ?? "",
        });
      }
      for (const r of ((fascicolo.data ?? []) as Riga[])) {
        const path = s(r.storage_path);
        if (!path) continue;
        // Un'anagrafica può lavorare in più commesse: il documento vale per ognuna.
        for (const x of perAnagrafica.get(s(r.subappaltatore_id) ?? "") ?? []) {
          documenti.push({
            id: `fascicolo-${s(r.id)}-${x.id}`, fonte: "fascicolo", bucket: BUCKET_SUBAPPALTATORI,
            order_id: x.order_id, subappaltatore_id: x.id,
            tipo: tipoDaSubappaltatore(s(r.tipo) ?? ""),
            titolo: [s(r.tipo)?.toUpperCase(), s(r.numero_protocollo)].filter(Boolean).join(" ") || "Documento",
            file_path: path, file_name: path.split("/").pop() ?? "",
            data_documento: s(r.data_emissione), data_scadenza: s(r.scadenza), note: null,
            created_at: s(r.created_at) ?? "",
          });
          if (!orderId) break; // nell'archivio generale basta una volta
        }
      }
      return documenti;
    },
    enabled: !!companyId,
  });
}

export interface NuovoDocumentoSicurezza {
  file: File;
  tipo: TipoDocumentoSicurezza;
  titolo: string;
  orderId: string | null;
  subappaltatoreId: string | null;
  dataDocumento: string | null;
  dataScadenza: string | null;
  note: string | null;
}

export const LIMITE_FILE_SICUREZZA = 50 * 1024 * 1024;

export function useCaricaDocumentiSicurezza(companyId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nuovi: NuovoDocumentoSicurezza[]) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      for (const n of nuovi) {
        if (n.file.size > LIMITE_FILE_SICUREZZA) throw new Error(`«${n.file.name}» supera i 50 MB.`);
        if (n.subappaltatoreId) await caricaPerSubappaltatore(companyId, n);
        else await caricaInSicurezza(companyId, n);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chiaviDocumentiSicurezza.tutti });
      // Le pagine dei subappaltatori vedono subito il documento caricato da qui.
      qc.invalidateQueries({ queryKey: ["documenti-sub"] });
      qc.invalidateQueries({ queryKey: ["subappaltatore"] });
      qc.invalidateQueries({ queryKey: ["subappaltatori-page", companyId] });
      qc.invalidateQueries({ queryKey: ["sicurezza-commessa-sub"] });
    },
  });
}

async function caricaInSicurezza(companyId: string, n: NuovoDocumentoSicurezza) {
  const estensione = n.file.name.includes(".") ? n.file.name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "") : "bin";
  const percorso = `${companyId}/documenti/${n.orderId ?? "azienda"}/${crypto.randomUUID()}.${estensione || "bin"}`;
  const { error: errFile } = await supabase.storage.from(BUCKET_SICUREZZA)
    .upload(percorso, n.file, { contentType: n.file.type || "application/octet-stream" });
  if (errFile) throw new Error(`Non riesco a caricare «${n.file.name}». Riprova tra poco.`);
  const { error } = await supabase.from("sicurezza_documenti" as never).insert({
    company_id: companyId, order_id: n.orderId, subappaltatore_id: null,
    tipo: n.tipo, titolo: n.titolo.trim() || n.file.name, file_path: percorso, file_name: n.file.name,
    mime_type: n.file.type || null, size_bytes: n.file.size,
    data_documento: n.dataDocumento, data_scadenza: n.dataScadenza, note: n.note,
  } as never);
  if (error) {
    // Niente file orfani: la riga non c'è, il file si toglie.
    await supabase.storage.from(BUCKET_SICUREZZA).remove([percorso]);
    throw new Error(`Non riesco a salvare «${n.file.name}». Riprova tra poco.`);
  }
}

/** Nella scheda del subappaltatore, come il suo caricamento singolo: stesso bucket, stesso percorso. */
async function caricaPerSubappaltatore(companyId: string, n: NuovoDocumentoSicurezza) {
  const nomeSicuro = n.file.name.replace(/[^\w.-]+/g, "_");
  const percorso = `${companyId}/${n.subappaltatoreId}/${Date.now()}-${nomeSicuro}`;
  const { error: errFile } = await supabase.storage.from(BUCKET_SUBAPPALTATORI)
    .upload(percorso, n.file, { contentType: n.file.type || "application/octet-stream", upsert: false });
  if (errFile) throw new Error(`Non riesco a caricare «${n.file.name}». Riprova tra poco.`);
  const tipo = tipoPerSubappaltatore(n.tipo);
  const { error } = await supabase.from("documenti_subappaltatore" as never).insert({
    company_id: companyId, subappaltatore_id: n.subappaltatoreId, tipo,
    nome_file: n.file.name, url: percorso,
    data_rilascio: n.dataDocumento, data_scadenza: n.dataScadenza,
    // Il titolo resta nelle note: la scheda del subappaltatore non ha un campo titolo.
    note: [n.titolo.trim() && n.titolo.trim() !== n.file.name.replace(/\.[^.]+$/, "") ? n.titolo.trim() : null, n.note].filter(Boolean).join(" — ") || null,
  } as never);
  if (error) {
    await supabase.storage.from(BUCKET_SUBAPPALTATORI).remove([percorso]);
    throw new Error(`Non riesco a salvare «${n.file.name}». Riprova tra poco.`);
  }
  // Come la scheda: il DURC con scadenza aggiorna la data del subappaltatore.
  if (tipo === "durc" && n.dataScadenza) {
    await supabase.from("subappaltatori_sicurezza").update({ durc_scadenza: n.dataScadenza }).eq("id", n.subappaltatoreId!);
  }
}

export function useEliminaDocumentoSicurezza() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: Pick<DocumentoSicurezza, "id" | "file_path" | "fonte">) => {
      // Da qui si eliminano solo i documenti della sicurezza: quelli dei
      // subappaltatori si gestiscono dalla loro scheda.
      if (doc.fonte && doc.fonte !== "sicurezza") throw new Error("Questo documento si elimina dalla scheda del subappaltatore.");
      const { error } = await supabase.from("sicurezza_documenti" as never).delete().eq("id", doc.id);
      if (error) throw new Error("Non riesco a eliminare il documento. Riprova tra poco.");
      await supabase.storage.from(BUCKET_SICUREZZA).remove([doc.file_path]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chiaviDocumentiSicurezza.tutti }),
  });
}

/** Apre il file in una nuova scheda (link firmato di 2 minuti). */
export async function apriDocumentoSicurezza(doc: Pick<DocumentoSicurezza, "file_path" | "bucket">): Promise<void> {
  // Vecchi documenti dei subappaltatori salvati con un indirizzo completo.
  if (/^https?:\/\//.test(doc.file_path)) { window.open(doc.file_path, "_blank", "noopener,noreferrer"); return; }
  const scheda = window.open("", "_blank");
  const { data, error } = await supabase.storage.from(doc.bucket ?? BUCKET_SICUREZZA).createSignedUrl(doc.file_path, 120);
  if (error || !data?.signedUrl) {
    scheda?.close();
    throw new Error("Non riesco ad aprire il documento. Riprova tra poco.");
  }
  if (scheda) scheda.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
}
