// src/hooks/useGeneraleDocumenti.ts
// Modulo «Documenti» della commessa generale: legge l'archivio della generale e delle figlie
// (order_attachments), i segni della checklist (commesse_generali_documenti) e le scelte
// dell'azienda sull'elenco (commesse_generali_documenti_voci). Le regole stanno in
// src/lib/orders/generali/documenti.ts.
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { ATTACHMENTS_BUCKET } from "@/components/orders/filePreviewUtils";
import { cartellaSuggerita, percorsoDocumento, problemaFile, type CartellaDocumenti } from "@/lib/commesse/documentiCommessa";
import type { ModelloGenerale, RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import {
  calcolaChecklist, nomeVoceValido, nuovaChiavePersonale, oggiLocale, vociDelModello,
  type AllegatoCommessa, type AmbitoVoce, type ChecklistDocumenti, type RigaVoceAzienda, type SegnoDocumento, type VoceDocumento,
} from "@/lib/orders/generali/documenti";
import { userErrorMessage } from "@/lib/userErrorMessage";

// Le tabelle del modulo non sono ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const chiaviDocumentiGenerale = {
  voci: (companyId: string | null | undefined) => ["commesse-generali-documenti-voci", companyId] as const,
  // Sotto «order-attachments, <generale>»: quando l'archivio della generale cambia (carica, sposta,
  // elimina dalla scheda Documenti) la checklist si rilegge da sola.
  checklist: (generaleId: string) => ["order-attachments", generaleId, "documenti-richiesti"] as const,
};

/** Il messaggio per chi usa l'app: quello del database quando è scritto per lui, altrimenti uno generico. */
export function messaggioDocumenti(e: unknown, fallback: string): string {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === "22023" && err.message) return err.message;
  if (err?.code === "42501") return "Non hai il permesso di fare questa modifica.";
  if (err?.code === "23505") return "È già segnato.";
  if (e instanceof Error && !("code" in e)) return e.message;
  return userErrorMessage(e, fallback);
}

const BLOCCO = 60;
const PAGINA = 1000;

/** Una lettura `in (…)` a blocchi di commesse e a pagine di righe: niente tagli silenziosi a mille. */
async function leggiPerCommesse<T>(
  ids: string[],
  leggi: (blocco: string[], da: number, a: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const righe: T[] = [];
  for (let i = 0; i < ids.length; i += BLOCCO) {
    const blocco = ids.slice(i, i + BLOCCO);
    for (let da = 0; ; da += PAGINA) {
      const { data, error } = await leggi(blocco, da, da + PAGINA - 1);
      if (error) throw error;
      righe.push(...(data ?? []));
      if ((data ?? []).length < PAGINA) break;
    }
  }
  return righe;
}

/** Le scelte dell'azienda su tutti i modelli; senza tabella o senza permesso, l'elenco di partenza. */
export function useVociDocumentiAzienda() {
  const companyId = useEffectiveCompanyId();
  const query = useQuery({
    queryKey: chiaviDocumentiGenerale.voci(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RigaVoceAzienda[]> => {
      const { data, error } = await db
        .from("commesse_generali_documenti_voci")
        .select("id, modello, chiave, nome, ambito, obbligatoria, con_scadenza, tolta, posizione")
        .eq("company_id", companyId)
        .order("posizione")
        .order("chiave");
      if (error) throw error;
      return (data ?? []) as RigaVoceAzienda[];
    },
  });
  return { righe: query.data ?? [], isLoading: query.isLoading, isError: query.isError, refetch: query.refetch };
}

export interface ChecklistGenerale {
  checklist: ChecklistDocumenti | null;
  voci: VoceDocumento[];
  /** Gli allegati di ogni commessa (generale e figlie), per scegliere «tra i caricati». */
  allegatiPer: Map<string, AllegatoCommessa[]>;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/** La checklist dei documenti di una generale: archivio di generale e figlie, segni, voci dell'azienda. */
export function useChecklistGenerale(r: RiepilogoGenerale): ChecklistGenerale {
  const generaleId = r.generale.id;
  const ids = useMemo(() => [generaleId, ...r.figlie.map((f) => f.id)], [generaleId, r.figlie]);
  const azienda = useVociDocumentiAzienda();
  const query = useQuery({
    queryKey: [...chiaviDocumentiGenerale.checklist(generaleId), ids.join(",")],
    staleTime: 30_000,
    queryFn: async (): Promise<{ allegati: AllegatoCommessa[]; segni: SegnoDocumento[] }> => {
      const [allegati, segni] = await Promise.all([
        leggiPerCommesse<AllegatoCommessa>(ids, (blocco, da, a) => supabase
          .from("order_attachments")
          .select("id, order_id, file_name, file_url, file_type, created_at")
          .in("order_id", blocco)
          .order("created_at", { ascending: false })
          .order("id")
          .range(da, a) as unknown as PromiseLike<{ data: AllegatoCommessa[] | null; error: unknown }>),
        leggiPerCommesse<SegnoDocumento>(ids, (blocco, da, a) => db
          .from("commesse_generali_documenti")
          .select("id, order_id, voce, tipo, attachment_id, scadenza")
          .in("order_id", blocco)
          .order("id")
          .range(da, a)),
      ]);
      return { allegati, segni };
    },
  });

  const voci = useMemo(() => vociDelModello(r.generale.modello, azienda.righe), [r.generale.modello, azienda.righe]);
  const checklist = useMemo(() => {
    if (!query.data) return null;
    return calcolaChecklist({
      voci,
      generaleId,
      figlie: r.figlie.map((f) => ({ id: f.id, incassato: r.permessi.importi ? f.incassato : null })),
      allegati: query.data.allegati,
      segni: query.data.segni,
      oggi: oggiLocale(),
    });
  }, [query.data, voci, generaleId, r.figlie, r.permessi.importi]);
  const allegatiPer = useMemo(() => {
    const m = new Map<string, AllegatoCommessa[]>();
    for (const a of query.data?.allegati ?? []) m.set(a.order_id, [...(m.get(a.order_id) ?? []), a]);
    return m;
  }, [query.data]);

  return {
    checklist,
    voci,
    allegatiPer,
    // Le voci dell'azienda non bloccano: se non si leggono resta l'elenco di partenza.
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => { void query.refetch(); void azienda.refetch(); },
  };
}

function useInvalidaChecklist(generaleId: string) {
  const qc = useQueryClient();
  return (orderId?: string) => Promise.all([
    qc.invalidateQueries({ queryKey: chiaviDocumentiGenerale.checklist(generaleId) }),
    // L'archivio della commessa toccata (la scheda Documenti della figlia, quella della generale).
    orderId ? qc.invalidateQueries({ queryKey: ["order-attachments", orderId] }) : undefined,
    orderId ? qc.invalidateQueries({ queryKey: ["order-documents-summary", orderId] }) : undefined,
  ]);
}

/** Scrive il segno di un file su una voce: lo stesso file sulla stessa voce ha una riga sola. */
async function segnaFile(p: { orderId: string; voce: string; attachmentId: string; tipo: "documento" | "escluso"; scadenza: string | null }) {
  const { data: esistente, error: e1 } = await db
    .from("commesse_generali_documenti")
    .select("id")
    .eq("order_id", p.orderId)
    .eq("voce", p.voce)
    .eq("attachment_id", p.attachmentId)
    .maybeSingle();
  if (e1) throw e1;
  const valori = { tipo: p.tipo, scadenza: p.tipo === "documento" ? p.scadenza : null };
  const { error } = esistente
    ? await db.from("commesse_generali_documenti").update(valori).eq("id", esistente.id).select("id").single()
    // company_id lo mette il database: è quello della commessa.
    : await db.from("commesse_generali_documenti").insert({ order_id: p.orderId, voce: p.voce, attachment_id: p.attachmentId, ...valori })
      .select("id").single();
  if (error) throw error;
}

export type AzioneDocumento =
  /** Questo file è il documento della voce (conferma un file riconosciuto o ne sceglie uno tra i caricati). */
  | { tipo: "segna"; orderId: string; voce: string; attachmentId: string; scadenza: string | null }
  /** Il file riconosciuto dal nome (o segnato) non c'entra con la voce. */
  | { tipo: "non_e_questo"; orderId: string; voce: string; attachmentId: string }
  | { tipo: "scadenza"; segnoId: string; scadenza: string | null }
  | { tipo: "non_serve"; orderId: string; voce: string }
  | { tipo: "serve"; segnoId: string };

export function useAzioneDocumento(generaleId: string) {
  const invalida = useInvalidaChecklist(generaleId);
  return useMutation({
    mutationFn: async (a: AzioneDocumento) => {
      if (a.tipo === "segna") return segnaFile({ ...a, tipo: "documento" });
      if (a.tipo === "non_e_questo") return segnaFile({ ...a, tipo: "escluso", scadenza: null });
      if (a.tipo === "scadenza") {
        const { error } = await db.from("commesse_generali_documenti").update({ scadenza: a.scadenza }).eq("id", a.segnoId).select("id").single();
        if (error) throw error;
        return;
      }
      if (a.tipo === "non_serve") {
        const { error } = await db.from("commesse_generali_documenti")
          .insert({ order_id: a.orderId, voce: a.voce, tipo: "non_serve" })
          .select("id").single();
        if (error && error.code !== "23505") throw error;
        return;
      }
      const { error } = await db.from("commesse_generali_documenti").delete().eq("id", a.segnoId).eq("tipo", "non_serve");
      if (error) throw error;
    },
    onSettled: () => invalida(),
  });
}

/**
 * Carica un file nell'archivio della commessa giusta (la generale o la figlia), nella cartella
 * proposta dal nome della voce e del file, e lo segna per la voce. Se il segno non si scrive il file
 * resta nell'archivio (è un documento vero) e l'errore lo dice.
 */
export function useCaricaDocumentoVoce(generaleId: string) {
  const { user } = useAuth();
  const companyId = useEffectiveCompanyId();
  const invalida = useInvalidaChecklist(generaleId);
  return useMutation({
    mutationFn: async (p: { orderId: string; voce: Pick<VoceDocumento, "id" | "nome">; file: File; scadenza: string | null }) => {
      if (!user?.id || !companyId) throw new Error("Sessione scaduta: entra di nuovo per caricare.");
      const problema = problemaFile(p.file);
      if (problema) throw new Error(problema);
      const { data: cartelle } = await (supabase
        .from("order_document_folders" as never)
        .select("id, company_id, nome, posizione, visibile_cliente, obbligatoria, archiviata_at")
        .eq("company_id" as never, companyId as never) as unknown as PromiseLike<{ data: CartellaDocumenti[] | null }>);
      const folderId = cartellaSuggerita(`${p.voce.nome} ${p.file.name}`, cartelle ?? []);
      const tipo = p.file.type || "application/octet-stream";
      const percorso = percorsoDocumento(p.orderId, p.file.name);
      const { error: e1 } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(percorso, p.file, { contentType: tipo });
      if (e1) throw e1;
      const { data, error: e2 } = await supabase.from("order_attachments").insert({
        order_id: p.orderId, file_name: p.file.name, file_url: percorso, file_type: tipo,
        file_size: p.file.size, uploaded_by: user.id, visible_to_customer: false, folder_id: folderId,
      } as never).select("id").single();
      if (e2 || !data) {
        await supabase.storage.from(ATTACHMENTS_BUCKET).remove([percorso]);
        throw e2 ?? new Error("Documento non registrato");
      }
      try {
        await segnaFile({ orderId: p.orderId, voce: p.voce.id, attachmentId: (data as { id: string }).id, tipo: "documento", scadenza: p.scadenza });
      } catch (e) {
        throw new Error(`Il file è nell'archivio, ma non è stato segnato per «${p.voce.nome}»: ${messaggioDocumenti(e, "riprova da «Scegli tra i caricati»")}`, { cause: e });
      }
    },
    onSettled: (_d, _e, p) => invalida(p.orderId),
  });
}

// ── Impostazioni: le scelte dell'azienda sull'elenco ─────────────────────────

export type ModificaVoce =
  | { tipo: "cambia"; modello: ModelloGenerale; chiave: string; patch: { ambito?: AmbitoVoce; obbligatoria?: boolean; con_scadenza?: boolean; tolta?: boolean } }
  /** Torna come l'elenco di partenza (solo per le voci di partenza). */
  | { tipo: "come_partenza"; modello: ModelloGenerale; chiave: string }
  | { tipo: "aggiungi"; modello: ModelloGenerale; nome: string; ambito: AmbitoVoce; obbligatoria: boolean; conScadenza: boolean };

export function useModificaVoceDocumento() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: ModificaVoce) => {
      if (!companyId) throw new Error("Seleziona un’azienda prima di salvare.");
      if (m.tipo === "cambia") {
        const { error } = await db.from("commesse_generali_documenti_voci")
          .upsert({ company_id: companyId, modello: m.modello, chiave: m.chiave, ...m.patch }, { onConflict: "company_id,modello,chiave" })
          .select("id").single();
        if (error) throw error;
        return;
      }
      if (m.tipo === "come_partenza") {
        const { error } = await db.from("commesse_generali_documenti_voci")
          .delete().eq("company_id", companyId).eq("modello", m.modello).eq("chiave", m.chiave);
        if (error) throw error;
        return;
      }
      const nome = nomeVoceValido(m.nome);
      if (!nome) throw new Error("Scrivi il nome del documento (al massimo 120 caratteri).");
      const righe = qc.getQueryData<RigaVoceAzienda[]>(chiaviDocumentiGenerale.voci(companyId)) ?? [];
      const doppia = vociDelModello(m.modello, righe).find((v) => !v.tolta && v.nome.toLowerCase() === nome.toLowerCase());
      if (doppia) throw new Error(`«${doppia.nome}» c'è già nell'elenco.`);
      const posizione = righe.filter((r) => r.modello === m.modello).reduce((max, r) => Math.max(max, r.posizione), 0) + 1;
      const { error } = await db.from("commesse_generali_documenti_voci").insert({
        company_id: companyId, modello: m.modello, chiave: nuovaChiavePersonale(), nome,
        ambito: m.ambito, obbligatoria: m.obbligatoria, con_scadenza: m.conScadenza, posizione,
      }).select("id").single();
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chiaviDocumentiGenerale.voci(companyId) }),
  });
}
