import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import { compressImage } from "@/lib/campo/foto-compressor";
import { getSubdomainUrl } from "@/utils/subdomainNav";
import { isNative } from "@/lib/mobile/platform";
import type {
  EsitoCodice, Mezzo, MezzoAllocazione, MezzoAssegnazione, MezzoCategoria, MezzoClasse, MezzoConAssegnazione,
  MezzoDisponibilita, MezzoDocumento, MezzoFoto, MezzoInCarico, MezzoInventario, MezzoManutenzione, MezzoScadenza,
  MezzoScansione, MezzoSegnalazione, SchedaCampoAttrezzo, SegnalazioneStato, SegnalazioneTipo,
} from "@/types/mezzi";
import { toast } from "sonner";

const BUCKET = "mezzi-documenti";

// Una chiave per forma di dato: la stessa chiave con select diversi avvelena la cache.
const chiavi = {
  elenco: (companyId: string | null) => ["mezzi", "elenco", companyId] as const,
  scheda: (id: string | undefined) => ["mezzi", "scheda", id] as const,
  scadenze: (companyId: string | null) => ["mezzi", "scadenze", companyId] as const,
  documenti: (mezzoId: string | undefined) => ["mezzi", "documenti", mezzoId] as const,
  manutenzioni: (mezzoId: string | undefined) => ["mezzi", "manutenzioni", mezzoId] as const,
  storico: (mezzoId: string | undefined) => ["mezzi", "storico", mezzoId] as const,
  foto: (mezzoId: string | undefined) => ["mezzi", "foto", mezzoId] as const,
  segnalazioni: (mezzoId: string | undefined) => ["mezzi", "segnalazioni", mezzoId] as const,
  segnalazioniAperte: (companyId: string | null) => ["mezzi", "segnalazioni-aperte", companyId] as const,
  costiParco: (companyId: string | null) => ["mezzi", "costi-parco", companyId] as const,
  commessa: (orderId: string | undefined) => ["mezzi", "commessa", orderId] as const,
  inCarico: (userId: string | undefined) => ["mezzi", "in-carico", userId] as const,
  categorie: (companyId: string | null) => ["mezzi", "categorie", companyId] as const,
  disponibilita: (companyId: string | null) => ["mezzi", "disponibilita", companyId] as const,
  allocazioni: (mezzoId: string | undefined) => ["mezzi", "allocazioni", mezzoId] as const,
  ultimeViste: (companyId: string | null) => ["mezzi", "ultime-viste", companyId] as const,
  scansioni: (mezzoId: string | undefined) => ["mezzi", "scansioni", mezzoId] as const,
  inventari: (companyId: string | null) => ["mezzi", "inventari", companyId] as const,
  inventario: (id: string | undefined) => ["mezzi", "inventario", id] as const,
  codice: (codice: string | undefined, companyId: string | null | undefined) => ["mezzi", "codice", codice, companyId] as const,
};

/** Il messaggio vero del database (i trigger scrivono in italiano: «Non basta: disponibili 250 m²»). */
function messaggio(e: unknown, riserva: string): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message || riserva;
  }
  return riserva;
}

// Tabelle e funzioni nuove (05/10/2026): il client tipizzato su tabelle con
// molte relazioni manda TypeScript in «instantiation excessively deep». Si
// passa dal client senza tipi e si ritipizza il risultato qui sotto.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// Il mezzo su cui è caricato un attrezzo è la stessa tabella. Su una relazione
// con sé stessa PostgREST non trova il vincolo per nome («mezzi!mezzi_su_mezzo_id_fkey»
// → PGRST200, elenco e scheda vuoti per ogni azienda, 24/09/2026). E attenzione:
// «mezzi!su_mezzo_id» è la direzione OPPOSTA (gli attrezzi caricati su questo
// mezzo, un array). Il mezzo sopra, un oggetto, è «su_mezzo_id(...)».
const SELECT_CON_ASSEGNAZIONE =
  "*, persona:hr_profili!mezzi_assegnato_hr_profilo_id_fkey(nome, cognome), commessa:orders!mezzi_assegnato_order_id_fkey(order_code, client_name, client_company), sopra:su_mezzo_id(nome)";

type RigaConAssegnazione = Mezzo & {
  persona: { nome: string | null; cognome: string | null } | null;
  commessa: { order_code: string | null; client_name: string | null; client_company: string | null } | null;
  sopra: { nome: string | null } | null;
};

function conAssegnazione(r: RigaConAssegnazione): MezzoConAssegnazione {
  const { persona, commessa, sopra, ...mezzo } = r;
  const nomePersona = [persona?.nome, persona?.cognome].filter(Boolean).join(" ");
  const commessaTesto = commessa
    ? [commessa.order_code, commessa.client_company || commessa.client_name].filter(Boolean).join(" · ")
    : "";
  return {
    ...mezzo,
    assegnato_persona: nomePersona || null,
    assegnato_commessa: commessaTesto || null,
    su_mezzo_nome: sopra?.nome ?? null,
  };
}

/** I mezzi dell'azienda (senza quelli eliminati), dal nome. */
export function useMezzi() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.elenco(companyId),
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mezzi")
        .select(SELECT_CON_ASSEGNAZIONE)
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("nome", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as RigaConAssegnazione[]).map(conAssegnazione);
    },
    staleTime: 60 * 1000,
  });
}

export function useMezzo(id: string | undefined) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.scheda(id),
    enabled: !!id && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mezzi")
        .select(SELECT_CON_ASSEGNAZIONE)
        .eq("id", id!)
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? conAssegnazione(data as unknown as RigaConAssegnazione) : null;
    },
    staleTime: 30 * 1000,
  });
}

/** Le scadenze di tutti i mezzi (vista mezzi_scadenze): elenco "Da controllare" e pallini. */
export function useMezziScadenze() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.scadenze(companyId),
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mezzi_scadenze")
        .select("*")
        .eq("company_id", companyId!);
      if (error) throw error;
      return (data ?? []) as unknown as MezzoScadenza[];
    },
    staleTime: 60 * 1000,
  });
}

export function useMezzoDocumenti(mezzoId: string | undefined) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.documenti(mezzoId),
    enabled: !!mezzoId && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mezzi_documenti")
        .select("*")
        .eq("mezzo_id", mezzoId!)
        .eq("company_id", companyId!)
        .order("data_scadenza", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as MezzoDocumento[];
    },
    staleTime: 30 * 1000,
  });
}

export function useMezzoManutenzioni(mezzoId: string | undefined) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.manutenzioni(mezzoId),
    enabled: !!mezzoId && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mezzi_manutenzioni")
        .select("*")
        .eq("mezzo_id", mezzoId!)
        .eq("company_id", companyId!)
        .order("data", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MezzoManutenzione[];
    },
    staleTime: 30 * 1000,
  });
}

// ── File ─────────────────────────────────────────────────────────────────────

/** Carica un file nel bucket privato: {company_id}/{mezzo_id}/{uuid}-{nome}. */
export async function caricaFileMezzo(companyId: string, mezzoId: string, file: File): Promise<{ path: string; name: string }> {
  const sicuro = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const path = `${companyId}/${mezzoId}/${crypto.randomUUID()}-${sicuro}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  return { path, name: file.name };
}

/** Toglie un file caricato che non serve più (es. il salvataggio del documento non è andato). */
export async function rimuoviFileMezzo(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}

/** Link temporaneo (un'ora) per aprire un file. */
export async function linkFileMezzo(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

// ── Scritture ────────────────────────────────────────────────────────────────

/** Campi di testo e data: stringa vuota → null, così il database non rifiuta "". */
function pulisci<T extends Record<string, unknown>>(obj: T, campi: string[]): T {
  const out: Record<string, unknown> = { ...obj };
  for (const c of campi) if (out[c] === "") out[c] = null;
  return out as T;
}

async function utenteCorrente(): Promise<string | null> {
  return (await supabase.auth.getUser()).data.user?.id ?? null;
}

function useInvalidaMezzi() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["mezzi"] });
}

// «classe» la calcola il database dal tipo (colonna generata): non si scrive.
export type MezzoInput = Partial<Omit<Mezzo, "company_id" | "created_at" | "updated_at" | "created_by" | "deleted_at" | "classe">> & {
  nome: string;
};

export function useSalvaMezzo() {
  const companyId = useEffectiveCompanyId();
  const invalida = useInvalidaMezzi();
  return useMutation({
    mutationFn: async (input: MezzoInput): Promise<string> => {
      if (!companyId) throw new Error("Azienda non trovata");
      const { id, ...resto } = pulisci(input as Record<string, unknown>, [
        "targa", "marca", "modello", "matricola", "note", "contatore_aggiornato_il",
        "assegnato_hr_profilo_id", "assegnato_order_id", "codice", "categoria_id", "unita_misura",
      ]) as MezzoInput;
      if (typeof resto.targa === "string") resto.targa = resto.targa.toUpperCase().replace(/\s+/g, "");
      // Se arriva un mezzo intero (con la classe, generata dal database), la classe non si scrive.
      delete (resto as Record<string, unknown>).classe;
      if (id) {
        const { error } = await supabase.from("mezzi").update(resto).eq("id", id).eq("company_id", companyId);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("mezzi")
        .insert({ ...resto, company_id: companyId, created_by: await utenteCorrente() })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (_id, v) => {
      invalida();
      toast.success(v.tipo === "attrezzatura" ? "Attrezzatura salvata" : "Mezzo salvato");
    },
    onError: (e) => toast.error(`Non ho salvato: ${messaggio(e, "errore sconosciuto")}`),
  });
}

/** Elimina il mezzo dall'elenco: resta nel database (deleted_at) con il suo storico. */
export function useEliminaMezzo() {
  const companyId = useEffectiveCompanyId();
  const invalida = useInvalidaMezzi();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("mezzi")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      invalida();
      toast.success("Mezzo eliminato");
    },
    onError: (e) => toast.error(e instanceof Error ? `Non ho eliminato il mezzo: ${e.message}` : "Non ho eliminato il mezzo"),
  });
}

export type DocumentoInput = Partial<Omit<MezzoDocumento, "company_id" | "mezzo_id" | "created_at" | "updated_at" | "created_by">>;

export function useSalvaDocumentoMezzo(mezzoId: string) {
  const companyId = useEffectiveCompanyId();
  const invalida = useInvalidaMezzi();
  return useMutation({
    mutationFn: async (input: DocumentoInput) => {
      if (!companyId) throw new Error("Azienda non trovata");
      const { id, ...resto } = pulisci(input as Record<string, unknown>, [
        "titolo", "ente", "data_inizio", "data_scadenza", "note", "file_path", "file_name",
      ]) as DocumentoInput;
      if (id) {
        const { error } = await supabase.from("mezzi_documenti").update(resto).eq("id", id).eq("company_id", companyId);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("mezzi_documenti").insert({
        ...resto, mezzo_id: mezzoId, company_id: companyId, created_by: await utenteCorrente(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalida();
      toast.success("Documento salvato");
    },
    onError: (e) => toast.error(e instanceof Error ? `Non ho salvato il documento: ${e.message}` : "Non ho salvato il documento"),
  });
}

export function useEliminaDocumentoMezzo() {
  const companyId = useEffectiveCompanyId();
  const invalida = useInvalidaMezzi();
  return useMutation({
    mutationFn: async (doc: MezzoDocumento) => {
      const { error } = await supabase.from("mezzi_documenti").delete().eq("id", doc.id).eq("company_id", companyId!);
      if (error) throw error;
      // Il file dopo la riga: se la riga non si cancella, il file resta raggiungibile.
      if (doc.file_path) await supabase.storage.from(BUCKET).remove([doc.file_path]);
    },
    onSuccess: () => {
      invalida();
      toast.success("Documento eliminato");
    },
    onError: (e) => toast.error(e instanceof Error ? `Non ho eliminato il documento: ${e.message}` : "Non ho eliminato il documento"),
  });
}

export type ManutenzioneInput = Partial<Omit<MezzoManutenzione, "company_id" | "mezzo_id" | "created_at" | "updated_at" | "created_by">>;

export function useSalvaManutenzioneMezzo(mezzoId: string) {
  const companyId = useEffectiveCompanyId();
  const invalida = useInvalidaMezzi();
  return useMutation({
    mutationFn: async (input: ManutenzioneInput) => {
      if (!companyId) throw new Error("Azienda non trovata");
      const { id, ...resto } = pulisci(input as Record<string, unknown>, [
        "officina", "descrizione", "prossima_data", "file_path", "file_name",
      ]) as ManutenzioneInput;
      if (id) {
        const { error } = await supabase.from("mezzi_manutenzioni").update(resto).eq("id", id).eq("company_id", companyId);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("mezzi_manutenzioni").insert({
        ...resto, data: resto.data!, mezzo_id: mezzoId, company_id: companyId, created_by: await utenteCorrente(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalida();
      toast.success("Intervento salvato");
    },
    onError: (e) => toast.error(e instanceof Error ? `Non ho salvato l'intervento: ${e.message}` : "Non ho salvato l'intervento"),
  });
}

export function useEliminaManutenzioneMezzo() {
  const companyId = useEffectiveCompanyId();
  const invalida = useInvalidaMezzi();
  return useMutation({
    mutationFn: async (m: MezzoManutenzione) => {
      const { error } = await supabase.from("mezzi_manutenzioni").delete().eq("id", m.id).eq("company_id", companyId!);
      if (error) throw error;
      if (m.file_path) await supabase.storage.from(BUCKET).remove([m.file_path]);
    },
    onSuccess: () => {
      invalida();
      toast.success("Intervento eliminato");
    },
    onError: (e) => toast.error(e instanceof Error ? `Non ho eliminato l'intervento: ${e.message}` : "Non ho eliminato l'intervento"),
  });
}

// ── Storico delle assegnazioni ───────────────────────────────────────────────

export type PeriodoConNomi = MezzoAssegnazione & {
  persona: string | null;
  commessa: string | null;
  su_mezzo_nome: string | null;
};

export function useMezzoAssegnazioni(mezzoId: string | undefined) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.storico(mezzoId),
    enabled: !!mezzoId && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mezzi_assegnazioni")
        .select("*, persona:hr_profili!mezzi_assegnazioni_hr_profilo_id_fkey(nome, cognome), commessa:orders!mezzi_assegnazioni_order_id_fkey(order_code, client_name, client_company), sopra:mezzi!mezzi_assegnazioni_su_mezzo_id_fkey(nome)")
        .eq("mezzo_id", mezzoId!)
        .eq("company_id", companyId!)
        .order("dal", { ascending: false });
      if (error) throw error;
      type Riga = MezzoAssegnazione & {
        persona: { nome: string | null; cognome: string | null } | null;
        commessa: { order_code: string | null; client_name: string | null; client_company: string | null } | null;
        sopra: { nome: string | null } | null;
      };
      return ((data ?? []) as unknown as Riga[]).map(({ persona, commessa, sopra, ...p }): PeriodoConNomi => ({
        ...p,
        persona: [persona?.nome, persona?.cognome].filter(Boolean).join(" ") || null,
        commessa: commessa ? [commessa.order_code, commessa.client_company || commessa.client_name].filter(Boolean).join(" · ") || null : null,
        su_mezzo_nome: sopra?.nome ?? null,
      }));
    },
    staleTime: 30 * 1000,
  });
}

export type PeriodoInput = Pick<MezzoAssegnazione, "hr_profilo_id" | "order_id" | "dal" | "al" | "note"> & { id?: string };

/** Un periodo passato scritto a mano (es. prima di usare l'app): quelli nuovi li scrive il database. */
export function useSalvaPeriodo(mezzoId: string) {
  const companyId = useEffectiveCompanyId();
  const invalida = useInvalidaMezzi();
  return useMutation({
    mutationFn: async (input: PeriodoInput) => {
      if (!companyId) throw new Error("Azienda non trovata");
      const { id, ...resto } = input;
      if (id) {
        const { error } = await supabase.from("mezzi_assegnazioni").update(resto).eq("id", id).eq("company_id", companyId);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("mezzi_assegnazioni").insert({
        ...resto, mezzo_id: mezzoId, company_id: companyId, created_by: await utenteCorrente(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalida();
      toast.success("Periodo salvato");
    },
    onError: (e) => toast.error(e instanceof Error ? `Non ho salvato il periodo: ${e.message}` : "Non ho salvato il periodo"),
  });
}

export function useEliminaPeriodo() {
  const companyId = useEffectiveCompanyId();
  const invalida = useInvalidaMezzi();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("mezzi_assegnazioni").delete().eq("id", id).eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      invalida();
      toast.success("Periodo eliminato");
    },
    onError: (e) => toast.error(e instanceof Error ? `Non ho eliminato il periodo: ${e.message}` : "Non ho eliminato il periodo"),
  });
}

// ── Foto ─────────────────────────────────────────────────────────────────────

export type FotoConLink = MezzoFoto & { url: string | null };

/** Link temporanei per più file in una chiamata sola. */
export async function linkFileMezzi(paths: string[]): Promise<Map<string, string>> {
  const unici = [...new Set(paths.filter(Boolean))];
  if (!unici.length) return new Map();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(unici, 3600);
  if (error) return new Map();
  return new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl]));
}

export function useMezzoFoto(mezzoId: string | undefined) {
  return useQuery({
    queryKey: chiavi.foto(mezzoId),
    enabled: !!mezzoId,
    queryFn: async (): Promise<FotoConLink[]> => {
      const { data, error } = await supabase
        .from("mezzi_foto")
        .select("*")
        .eq("mezzo_id", mezzoId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const righe = (data ?? []) as MezzoFoto[];
      const link = await linkFileMezzi(righe.map((f) => f.file_path));
      return righe.map((f) => ({ ...f, url: link.get(f.file_path) ?? null }));
    },
    // I link durano un'ora: si rinnovano prima.
    staleTime: 30 * 60 * 1000,
  });
}

/** Comprime la foto (lato lungo 1920 px, JPEG) prima di caricarla; se non ci riesce, carica l'originale. */
async function caricaFoto(companyId: string, mezzoId: string, file: File): Promise<string> {
  let blob: Blob = file;
  let nome = file.name;
  try {
    const compressa = await compressImage(file);
    blob = compressa.blob;
    nome = nome.replace(/\.[^.]+$/, "") + ".jpg";
  } catch {
    // HEIC o formato che il browser non sa leggere: si tiene il file com'è.
  }
  const sicuro = nome.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  const path = `${companyId}/${mezzoId}/foto-${crypto.randomUUID()}-${sicuro}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: false,
    contentType: blob.type || "image/jpeg",
  });
  if (error) throw error;
  return path;
}

/** Carica foto del mezzo (anche più di una). La prima diventa copertina se il mezzo non ne ha. */
export function useCaricaFotoMezzo(mezzoId: string) {
  const companyId = useEffectiveCompanyId();
  const invalida = useInvalidaMezzi();
  return useMutation({
    mutationFn: async ({ files, segnalazioneId, copertinaSeManca = true }: { files: File[]; segnalazioneId?: string; copertinaSeManca?: boolean }) => {
      if (!companyId) throw new Error("Azienda non trovata");
      const caricati: string[] = [];
      try {
        for (const f of files) caricati.push(await caricaFoto(companyId, mezzoId, f));
        const { error } = await supabase.from("mezzi_foto").insert(
          caricati.map((file_path) => ({
            file_path, mezzo_id: mezzoId, company_id: companyId, segnalazione_id: segnalazioneId ?? null,
          })),
        );
        if (error) throw error;
      } catch (e) {
        if (caricati.length) await supabase.storage.from(BUCKET).remove(caricati);
        throw e;
      }
      if (copertinaSeManca && caricati[0]) {
        // Solo se non c'è già una copertina: la condizione sta nella query, non in una lettura prima.
        await supabase.from("mezzi").update({ foto_path: caricati[0] }).eq("id", mezzoId).is("foto_path", null);
      }
      return caricati.length;
    },
    onSuccess: (n) => {
      invalida();
      toast.success(n === 1 ? "Foto caricata" : `${n} foto caricate`);
    },
    onError: (e) => toast.error(e instanceof Error ? `Non ho caricato le foto: ${e.message}` : "Non ho caricato le foto"),
  });
}

export function useImpostaCopertina(mezzoId: string) {
  const companyId = useEffectiveCompanyId();
  const invalida = useInvalidaMezzi();
  return useMutation({
    mutationFn: async (filePath: string) => {
      const { error } = await supabase.from("mezzi").update({ foto_path: filePath }).eq("id", mezzoId).eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      invalida();
      toast.success("Copertina aggiornata");
    },
    onError: (e) => toast.error(e instanceof Error ? `Non ho cambiato la copertina: ${e.message}` : "Non ho cambiato la copertina"),
  });
}

export function useEliminaFotoMezzo(mezzoId: string) {
  const companyId = useEffectiveCompanyId();
  const invalida = useInvalidaMezzi();
  return useMutation({
    mutationFn: async (foto: MezzoFoto) => {
      const { error } = await supabase.from("mezzi_foto").delete().eq("id", foto.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([foto.file_path]);
      // Se era la copertina, il mezzo resta senza (la prossima foto caricata la prende).
      await supabase.from("mezzi").update({ foto_path: null }).eq("id", mezzoId).eq("company_id", companyId!).eq("foto_path", foto.file_path);
    },
    onSuccess: () => {
      invalida();
      toast.success("Foto eliminata");
    },
    onError: (e) => toast.error(e instanceof Error ? `Non ho eliminato la foto: ${e.message}` : "Non ho eliminato la foto"),
  });
}

/** Link della copertina di più mezzi, per l'elenco. */
export function useCopertineMezzi(paths: string[]) {
  const chiave = [...new Set(paths.filter(Boolean))].sort();
  return useQuery({
    queryKey: ["mezzi", "copertine", chiave],
    enabled: chiave.length > 0,
    queryFn: () => linkFileMezzi(chiave),
    staleTime: 30 * 60 * 1000,
  });
}

// ── Segnalazioni ─────────────────────────────────────────────────────────────

export type SegnalazioneConChi = MezzoSegnalazione & { chi: string | null };

export function useMezzoSegnalazioni(mezzoId: string | undefined) {
  return useQuery({
    queryKey: chiavi.segnalazioni(mezzoId),
    enabled: !!mezzoId,
    queryFn: async (): Promise<SegnalazioneConChi[]> => {
      const { data, error } = await supabase
        .from("mezzi_segnalazioni")
        .select("*, profilo:hr_profili!mezzi_segnalazioni_hr_profilo_id_fkey(nome, cognome)")
        .eq("mezzo_id", mezzoId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      type Riga = MezzoSegnalazione & { profilo: { nome: string | null; cognome: string | null } | null };
      return ((data ?? []) as unknown as Riga[]).map(({ profilo, ...r }) => ({
        ...r,
        chi: [profilo?.nome, profilo?.cognome].filter(Boolean).join(" ") || null,
      }));
    },
    staleTime: 30 * 1000,
  });
}

/** Guasti e danni ancora da chiudere in tutta l'azienda, per l'elenco dei mezzi. */
export function useSegnalazioniAperte() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.segnalazioniAperte(companyId),
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mezzi_segnalazioni")
        .select("id, mezzo_id, tipo, descrizione, stato, created_at")
        .eq("company_id", companyId!)
        .neq("stato", "chiusa")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Pick<MezzoSegnalazione, "id" | "mezzo_id" | "tipo" | "descrizione" | "stato" | "created_at">[];
    },
    staleTime: 60 * 1000,
  });
}

export function useAggiornaSegnalazione() {
  const invalida = useInvalidaMezzi();
  return useMutation({
    mutationFn: async ({ id, stato, nota }: { id: string; stato: SegnalazioneStato; nota?: string | null }) => {
      const chiusa = stato === "chiusa";
      const { error } = await supabase
        .from("mezzi_segnalazioni")
        .update({
          stato,
          nota_chiusura: nota ?? null,
          chiusa_at: chiusa ? new Date().toISOString() : null,
          chiusa_da: chiusa ? await utenteCorrente() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalida();
      toast.success("Segnalazione aggiornata");
    },
    onError: (e) => toast.error(e instanceof Error ? `Non ho aggiornato la segnalazione: ${e.message}` : "Non ho aggiornato la segnalazione"),
  });
}

// ── Costi del parco ──────────────────────────────────────────────────────────

/**
 * Importi di assicurazione e bollo e manutenzioni degli ultimi 12 mesi di tutti
 * i mezzi, per costo annuo e valore del parco nell'elenco.
 */
export function useCostiParco() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.costiParco(companyId),
    enabled: !!companyId,
    queryFn: async () => {
      const unAnnoFa = new Date(Date.now() - 366 * 864e5).toISOString().slice(0, 10);
      const [doc, man] = await Promise.all([
        supabase
          .from("mezzi_documenti")
          .select("mezzo_id, categoria, importo, data_scadenza, created_at")
          .eq("company_id", companyId!)
          .in("categoria", ["assicurazione", "bollo"])
          .not("importo", "is", null),
        supabase
          .from("mezzi_manutenzioni")
          .select("mezzo_id, data, costo")
          .eq("company_id", companyId!)
          .gte("data", unAnnoFa),
      ]);
      if (doc.error) throw doc.error;
      if (man.error) throw man.error;
      return {
        documenti: (doc.data ?? []) as Array<Pick<MezzoDocumento, "mezzo_id" | "categoria" | "importo" | "data_scadenza" | "created_at">>,
        manutenzioni: (man.data ?? []) as Array<Pick<MezzoManutenzione, "mezzo_id" | "data" | "costo">>,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ── Mezzi di una commessa ────────────────────────────────────────────────────

export interface MezzoSullaCommessa {
  mezzo_id: string;
  nome: string;
  targa: string | null;
  tipo: string;
  rata_mensile: number | null;
  /** Periodi in cui il mezzo è stato (o è) su questa commessa. */
  periodi: Array<Pick<MezzoAssegnazione, "dal" | "al">>;
  adesso: boolean;
}

/** I mezzi che sono stati o sono su una commessa, con i periodi: per la card della commessa. */
export function useMezziDellaCommessa(orderId: string | undefined) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.commessa(orderId),
    enabled: !!orderId && !!companyId,
    queryFn: async (): Promise<MezzoSullaCommessa[]> => {
      const { data, error } = await supabase
        .from("mezzi_assegnazioni")
        .select("mezzo_id, dal, al, mezzo:mezzi!mezzi_assegnazioni_mezzo_id_fkey(nome, targa, tipo, rata_mensile, deleted_at)")
        .eq("order_id", orderId!)
        .eq("company_id", companyId!)
        .order("dal", { ascending: true });
      if (error) throw error;
      type Riga = { mezzo_id: string; dal: string; al: string | null; mezzo: { nome: string; targa: string | null; tipo: string; rata_mensile: number | null; deleted_at: string | null } | null };
      const perMezzo = new Map<string, MezzoSullaCommessa>();
      for (const r of (data ?? []) as unknown as Riga[]) {
        if (!r.mezzo || r.mezzo.deleted_at) continue;
        const cur = perMezzo.get(r.mezzo_id) ?? {
          mezzo_id: r.mezzo_id, nome: r.mezzo.nome, targa: r.mezzo.targa, tipo: r.mezzo.tipo,
          rata_mensile: r.mezzo.rata_mensile, periodi: [], adesso: false,
        };
        cur.periodi.push({ dal: r.dal, al: r.al });
        if (!r.al) cur.adesso = true;
        perMezzo.set(r.mezzo_id, cur);
      }
      return [...perMezzo.values()].sort((a, b) => Number(b.adesso) - Number(a.adesso) || a.nome.localeCompare(b.nome));
    },
    staleTime: 60 * 1000,
  });
}

export interface MontaggioSullaCommessa {
  id: string;
  mezzo_id: string;
  nome: string;
  unita_misura: string | null;
  quantita_totale: number;
  rata_mensile: number | null;
  quantita: number;
  dal: string;
  al: string | null;
  adesso: boolean;
}

/** Ponteggi e altre attrezzature a quantità montati sulla commessa (anche quelli già rientrati). */
export function useMontaggiDellaCommessa(orderId: string | undefined) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["mezzi", "commessa-montaggi", orderId] as const,
    enabled: !!orderId && !!companyId,
    queryFn: async (): Promise<MontaggioSullaCommessa[]> => {
      const { data, error } = await db
        .from("mezzi_allocazioni")
        .select("id, mezzo_id, quantita, dal, al, mezzo:mezzi!mezzi_allocazioni_mezzo_id_fkey(nome, unita_misura, quantita_totale, rata_mensile, deleted_at)")
        .eq("order_id", orderId)
        .eq("company_id", companyId)
        .order("dal", { ascending: true });
      if (error) throw error;
      const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
      type Riga = {
        id: string; mezzo_id: string; quantita: number; dal: string; al: string | null;
        mezzo: { nome: string; unita_misura: string | null; quantita_totale: number | null; rata_mensile: number | null; deleted_at: string | null } | null;
      };
      return ((data ?? []) as Riga[])
        .filter((r) => r.mezzo && !r.mezzo.deleted_at)
        .map((r) => ({
          id: r.id, mezzo_id: r.mezzo_id, nome: r.mezzo!.nome, unita_misura: r.mezzo!.unita_misura,
          quantita_totale: Number(r.mezzo!.quantita_totale ?? 0), rata_mensile: r.mezzo!.rata_mensile,
          quantita: Number(r.quantita), dal: r.dal, al: r.al, adesso: !r.al || r.al > oggi,
        }))
        .sort((a, b) => Number(b.adesso) - Number(a.adesso) || a.nome.localeCompare(b.nome));
    },
    staleTime: 60 * 1000,
  });
}

/** Mette un mezzo sulla commessa (o lo toglie): lo storico lo registra il database. */
export function useAssegnaMezzoACommessa() {
  const companyId = useEffectiveCompanyId();
  const invalida = useInvalidaMezzi();
  return useMutation({
    mutationFn: async ({ mezzoId, orderId }: { mezzoId: string; orderId: string | null }) => {
      const { error } = await supabase.from("mezzi").update({ assegnato_order_id: orderId }).eq("id", mezzoId).eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      invalida();
      toast.success(v.orderId ? "Mezzo messo sul cantiere" : "Mezzo tolto dal cantiere");
    },
    onError: (e) => toast.error(e instanceof Error ? `Non ho spostato il mezzo: ${e.message}` : "Non ho spostato il mezzo"),
  });
}

// ── Dal telefono: i mezzi che ho in carico ───────────────────────────────────

/** I mezzi che ho in carico io, con gli attrezzi caricati sopra. Solo per chi lavora in campo. */
export function useMieiMezzi(attivo = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: chiavi.inCarico(user?.id),
    enabled: attivo && !!user?.id,
    queryFn: async (): Promise<MezzoInCarico[]> => {
      const { data, error } = await supabase.rpc("mezzi_in_carico");
      if (error) throw error;
      return (data ?? []) as unknown as MezzoInCarico[];
    },
    staleTime: 60 * 1000,
  });
}

/**
 * Una segnalazione dal campo: km aggiornati, guasto, danno. Le foto si caricano
 * nella cartella del mezzo e si legano alla segnalazione. L'azienda la decide il
 * database dal mezzo.
 */
export function useInviaSegnalazione(mezzoId: string, aziendaDelMezzo?: string) {
  // Le foto vanno nella cartella dell'azienda del mezzo, che per chi lavora per
  // due aziende può non essere quella attiva sul telefono.
  const aziendaAttiva = useEffectiveCompanyId();
  const companyId = aziendaDelMezzo ?? aziendaAttiva;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tipo, descrizione, contatore, files }: { tipo: SegnalazioneTipo; descrizione?: string; contatore?: number | null; files?: File[] }) => {
      if (!companyId) throw new Error("Azienda non trovata");
      const { data, error } = await supabase
        .from("mezzi_segnalazioni")
        .insert({ mezzo_id: mezzoId, tipo, descrizione: descrizione?.trim() || null, contatore: contatore ?? null })
        .select("id")
        .single();
      if (error) throw error;
      const caricati: string[] = [];
      try {
        for (const f of files ?? []) caricati.push(await caricaFoto(companyId, mezzoId, f));
        if (caricati.length) {
          const { error: e2 } = await supabase.from("mezzi_foto").insert(
            caricati.map((file_path) => ({ file_path, mezzo_id: mezzoId, company_id: companyId, segnalazione_id: data.id })),
          );
          if (e2) throw e2;
        }
      } catch (e) {
        if (caricati.length) await supabase.storage.from(BUCKET).remove(caricati);
        // La segnalazione è partita: le foto no. Lo si dice, senza perdere il testo già mandato.
        throw new Error(`La segnalazione è arrivata, le foto no: ${e instanceof Error ? e.message : "errore"}`, { cause: e });
      }
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["mezzi"] });
      toast.success(v.tipo === "km" ? "Km aggiornati" : "Segnalazione inviata all'ufficio");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Non ho inviato la segnalazione"),
  });
}

// ── Lettura automatica dei documenti (AI) ────────────────────────────────────

export type TipoLettura = "polizza_veicolo" | "libretto_circolazione";

/**
 * Legge un documento già caricato nel bucket dei mezzi con la funzione di
 * estrazione AI (generic-doc-ai-extract) e restituisce i campi trovati. Consuma
 * crediti AI dell'azienda; se non va, chi chiama lo dice e si compila a mano.
 */
export async function leggiDocumentoConAI(args: {
  companyId: string;
  path: string;
  fileName: string;
  mime: string;
  tipo: TipoLettura;
}): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke("generic-doc-ai-extract", {
    body: {
      storage_bucket: BUCKET,
      storage_path: args.path,
      file_name: args.fileName,
      mime_type: args.mime || "application/pdf",
      company_id: args.companyId,
      doc_type: args.tipo,
    },
  });
  if (error) throw new Error(error.message || "Lettura automatica non riuscita");
  if (data?.error) throw new Error(String(data.error));
  return (data?.extracted ?? {}) as Record<string, unknown>;
}

/** Sposta un file già caricato in un'altra cartella del bucket (es. dal «nuovo mezzo» al mezzo creato). */
export async function spostaFileMezzo(da: string, a: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).move(da, a);
  if (error) throw error;
}

/**
 * Dopo aver creato o salvato un mezzo compilato dal libretto: il file del
 * libretto diventa un documento del mezzo e, se sul libretto c'è la prossima
 * revisione, anche quella diventa una scadenza.
 */
export async function allegaLibretto(args: {
  companyId: string;
  mezzoId: string;
  path: string;
  fileName: string;
  immatricolazione: string | null;
  prossimaRevisione: string | null;
}): Promise<void> {
  let path = args.path;
  // Caricato prima che il mezzo esistesse: si sposta nella sua cartella, così
  // anche chi lo ha in carico lo vede dal telefono.
  if (!path.startsWith(`${args.companyId}/${args.mezzoId}/`)) {
    const nuovo = `${args.companyId}/${args.mezzoId}/${path.split("/").pop()}`;
    await spostaFileMezzo(path, nuovo);
    path = nuovo;
  }
  const uid = await utenteCorrente();
  const righe = [{
    company_id: args.companyId, mezzo_id: args.mezzoId, categoria: "libretto", titolo: "Libretto di circolazione",
    data_inizio: args.immatricolazione, file_path: path, file_name: args.fileName, created_by: uid,
  }];
  const { error } = await supabase.from("mezzi_documenti").insert(righe);
  if (error) throw error;
  if (args.prossimaRevisione) {
    const { error: e2 } = await supabase.from("mezzi_documenti").insert({
      company_id: args.companyId, mezzo_id: args.mezzoId, categoria: "revisione", titolo: "Dal libretto",
      data_scadenza: args.prossimaRevisione, alert_giorni_prima: 30, created_by: uid,
    });
    if (e2) throw e2;
  }
}

// ── Categorie degli attrezzi ─────────────────────────────────────────────────

/**
 * Le categorie dell'azienda. Chi non ne ha ancora (azienda nata dopo il
 * 05/10/2026, o senza mezzi allora) riceve le predefinite alla prima apertura.
 */
export function useMezziCategorie() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.categorie(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<MezzoCategoria[]> => {
      const leggi = async () => {
        const { data, error } = await db
          .from("mezzi_categorie")
          .select("id, company_id, classe, nome, icona, ordine, attiva, predefinita")
          .eq("company_id", companyId)
          .order("ordine", { ascending: true })
          .order("nome", { ascending: true });
        if (error) throw error;
        return (data ?? []) as MezzoCategoria[];
      };
      const righe = await leggi();
      if (righe.some((c) => c.classe === "attrezzatura")) return righe;
      const { error } = await db.rpc("mezzi_categorie_predefinite", { p_company: companyId });
      if (error) return righe; // senza categorie si lavora lo stesso
      return leggi();
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSalvaCategoria() {
  const companyId = useEffectiveCompanyId();
  const invalida = useInvalidaMezzi();
  return useMutation({
    mutationFn: async (input: { id?: string; nome: string; classe?: MezzoClasse; ordine?: number; icona?: string | null }) => {
      if (!companyId) throw new Error("Azienda non trovata");
      const nome = input.nome.trim();
      if (!nome) throw new Error("Scrivi il nome della categoria");
      if (input.id) {
        const { error } = await db.from("mezzi_categorie").update({ nome, ...(input.ordine != null ? { ordine: input.ordine } : {}) })
          .eq("id", input.id).eq("company_id", companyId);
        if (error) throw error;
        return;
      }
      const { error } = await db.from("mezzi_categorie").insert({
        company_id: companyId, nome, classe: input.classe ?? "attrezzatura", ordine: input.ordine ?? 500, icona: input.icona ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalida();
      toast.success("Categoria salvata");
    },
    onError: (e) => {
      const m = messaggio(e, "errore sconosciuto");
      toast.error(/duplicate|uq_mezzi_categorie_nome/i.test(m) ? "C'è già una categoria con questo nome" : `Non ho salvato la categoria: ${m}`);
    },
  });
}

/** Gli attrezzi della categoria restano, senza categoria (on delete set null). */
export function useEliminaCategoria() {
  const companyId = useEffectiveCompanyId();
  const invalida = useInvalidaMezzi();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("mezzi_categorie").delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalida();
      toast.success("Categoria eliminata");
    },
    onError: (e) => toast.error(`Non ho eliminato la categoria: ${messaggio(e, "errore sconosciuto")}`),
  });
}

// ── Attrezzature a quantità (ponteggi, transenne…) ───────────────────────────

/** Totale, montato e disponibile di ogni attrezzatura a quantità dell'azienda. */
export function useMezziDisponibilita() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.disponibilita(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<Map<string, MezzoDisponibilita>> => {
      const { data, error } = await db.from("mezzi_disponibilita").select("*").eq("company_id", companyId);
      if (error) throw error;
      return new Map(((data ?? []) as MezzoDisponibilita[]).map((r) => [r.mezzo_id, {
        ...r,
        quantita_totale: Number(r.quantita_totale ?? 0),
        in_uso: Number(r.in_uso ?? 0),
        disponibile: Number(r.disponibile ?? 0),
        cantieri: Number(r.cantieri ?? 0),
      }]));
    },
    staleTime: 30 * 1000,
  });
}

export type AllocazioneConCantiere = MezzoAllocazione & { cantiere: string | null; aperta: boolean };

/** I montaggi di un'attrezzatura a quantità, aperti prima, poi lo storico. */
export function useMezzoAllocazioni(mezzoId: string | undefined) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.allocazioni(mezzoId),
    enabled: !!mezzoId && !!companyId,
    queryFn: async (): Promise<AllocazioneConCantiere[]> => {
      const { data, error } = await db
        .from("mezzi_allocazioni")
        .select("*, commessa:orders!mezzi_allocazioni_order_id_fkey(order_code, client_name, client_company)")
        .eq("mezzo_id", mezzoId)
        .eq("company_id", companyId)
        .order("dal", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
      type Riga = MezzoAllocazione & { commessa: { order_code: string | null; client_name: string | null; client_company: string | null } | null };
      return ((data ?? []) as Riga[])
        .map(({ commessa, ...a }) => ({
          ...a,
          quantita: Number(a.quantita),
          cantiere: commessa ? [commessa.order_code, commessa.client_company || commessa.client_name].filter(Boolean).join(" · ") || null : null,
          // Come nel database: rientrato «oggi» libera la quantità oggi stesso.
          aperta: !a.al || a.al > oggi,
        }))
        .sort((x, y) => Number(y.aperta) - Number(x.aperta));
    },
    staleTime: 30 * 1000,
  });
}

/** Monta una parte su un cantiere (o in un altro posto). Il database controlla che basti. */
export function useMontaQuantita(mezzoId: string) {
  const companyId = useEffectiveCompanyId();
  const invalida = useInvalidaMezzi();
  return useMutation({
    mutationFn: async (input: { order_id: string | null; luogo?: string | null; quantita: number; dal?: string; note?: string | null }) => {
      if (!companyId) throw new Error("Azienda non trovata");
      const { error } = await db.from("mezzi_allocazioni").insert({
        company_id: companyId,
        mezzo_id: mezzoId,
        order_id: input.order_id,
        luogo: input.luogo?.trim() || null,
        quantita: input.quantita,
        ...(input.dal ? { dal: input.dal } : {}),
        note: input.note?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalida();
      toast.success("Montaggio segnato");
    },
    onError: (e) => toast.error(messaggio(e, "Non ho segnato il montaggio")),
  });
}

/** Rientro di tutto o di una parte (mezzi_rientro tiene lo storico giusto). */
export function useRientroQuantita() {
  const invalida = useInvalidaMezzi();
  return useMutation({
    mutationFn: async (input: { allocazioneId: string; quantita: number; data?: string | null }) => {
      const { error } = await db.rpc("mezzi_rientro", {
        p_allocazione: input.allocazioneId, p_quantita: input.quantita, p_data: input.data ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalida();
      toast.success("Rientro segnato");
    },
    onError: (e) => toast.error(messaggio(e, "Non ho segnato il rientro")),
  });
}

/** Per correggere uno sbaglio: il montaggio sparisce anche dai costi del cantiere. */
export function useEliminaAllocazione() {
  const companyId = useEffectiveCompanyId();
  const invalida = useInvalidaMezzi();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("mezzi_allocazioni").delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalida();
      toast.success("Montaggio eliminato");
    },
    onError: (e) => toast.error(messaggio(e, "Non ho eliminato il montaggio")),
  });
}

// ── Codici, etichette e scansioni ────────────────────────────────────────────

/** L'indirizzo che va nel QR: dal telefono apre la pagina dell'attrezzo (/q/…). */
export function indirizzoQr(codice: string, companyId: string): string {
  const percorso = `/q/${encodeURIComponent(codice)}?c=${companyId}`;
  // Nell'app iOS/Android la pagina gira su https://localhost: un'etichetta
  // stampata da lì deve comunque portare al sito vero.
  if (isNative) return `https://lavori.ediliziaincloud.com${percorso}`;
  // Sottodominio dei lavori: chi scansiona di più è chi sta in cantiere. In
  // locale getSubdomainUrl restituisce il solo percorso: serve l'indirizzo intero.
  const url = getSubdomainUrl(percorso, "lavori");
  return url.startsWith("http") || typeof window === "undefined" ? url : `${window.location.origin}${url}`;
}

/** Riserva N codici nuovi per stampare etichette vuote, da collegare poi agli attrezzi. */
export function useRiservaEtichette() {
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async ({ quante, classe }: { quante: number; classe: MezzoClasse }): Promise<string[]> => {
      const { data, error } = await db.rpc("mezzi_riserva_etichette", { p_company: companyId, p_quanti: quante, p_classe: classe });
      if (error) throw error;
      return ((data ?? []) as unknown[]).map((r) => (typeof r === "string" ? r : String((r as Record<string, unknown>).mezzi_riserva_etichette ?? "")));
    },
    onError: (e) => toast.error(messaggio(e, "Non ho riservato i codici")),
  });
}

/** Legge un codice: ufficio → id della scheda; campo → scheda ridotta con le azioni. */
export async function cercaCodiceMezzo(codice: string, companyId?: string | null): Promise<EsitoCodice> {
  const { data, error } = await db.rpc("mezzo_da_codice", { p_codice: codice, p_company: companyId ?? null });
  if (error) throw error;
  return (data ?? { esito: "sconosciuto" }) as EsitoCodice;
}

export function useCodiceMezzo(codice: string | undefined, companyId: string | null | undefined) {
  return useQuery({
    queryKey: chiavi.codice(codice, companyId),
    enabled: !!codice,
    queryFn: () => cercaCodiceMezzo(codice!, companyId),
    // Ogni lettura conta come «visto» (mezzi_scansioni): si legge all'apertura,
    // non a ogni ritorno sulla scheda del telefono.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export type AzioneAttrezzo = "prendo" | "cantiere" | "carico_su" | "magazzino" | "smarrito" | "monta" | "rientra";

/** Le azioni rapide dopo una scansione (dal campo, ma anche dall'ufficio). */
export function useAzioneAttrezzo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      mezzoId: string; azione: AzioneAttrezzo; orderId?: string | null; suMezzoId?: string | null;
      quantita?: number | null; allocazioneId?: string | null; nota?: string | null;
    }): Promise<SchedaCampoAttrezzo> => {
      const { data, error } = await db.rpc("campo_attrezzo_azione", {
        p_mezzo_id: input.mezzoId,
        p_azione: input.azione,
        p_order_id: input.orderId ?? null,
        p_su_mezzo_id: input.suMezzoId ?? null,
        p_quantita: input.quantita ?? null,
        p_allocazione_id: input.allocazioneId ?? null,
        p_nota: input.nota ?? null,
      });
      if (error) throw error;
      return (data as { mezzo: SchedaCampoAttrezzo }).mezzo;
    },
    onSuccess: (nuova, v) => {
      // La pagina aperta dalla scansione si aggiorna con la scheda restituita:
      // rileggere il codice registrerebbe un'altra «vista».
      qc.setQueriesData<EsitoCodice>({ queryKey: ["mezzi", "codice"] }, (vecchio) =>
        vecchio && vecchio.esito === "trovato" && vecchio.vista === "campo" && vecchio.id === nuova.id
          ? { ...vecchio, mezzo: nuova }
          : vecchio,
      );
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "mezzi" && q.queryKey[1] !== "codice" });
      const testo: Record<AzioneAttrezzo, string> = {
        prendo: "Ora è in carico a te",
        cantiere: "Segnato: lasciato in cantiere",
        carico_su: "Segnato: caricato sul furgone",
        magazzino: "Segnato: riportato in magazzino",
        smarrito: "L'ufficio è stato avvisato",
        monta: "Montaggio segnato",
        rientra: "Rientro segnato",
      };
      toast.success(testo[v.azione]);
    },
    onError: (e) => toast.error(messaggio(e, "Non sono riuscito a segnarlo")),
  });
}

/** Quando è stato visto l'ultima volta ogni mezzo (scansione o fine giornata). */
export function useUltimeViste() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.ultimeViste(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await db.from("mezzi_ultima_vista").select("mezzo_id, ultima_vista_at").eq("company_id", companyId);
      if (error) throw error;
      return new Map(
        ((data ?? []) as Array<{ mezzo_id: string; ultima_vista_at: string | null }>)
          .filter((r) => r.ultima_vista_at)
          .map((r) => [r.mezzo_id, r.ultima_vista_at as string]),
      );
    },
    staleTime: 60 * 1000,
  });
}

export type ScansioneConNomi = MezzoScansione & { chi: string | null; cantiere: string | null };

/** Le letture del QR di un mezzo, con chi e dove. */
export function useMezzoScansioni(mezzoId: string | undefined) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.scansioni(mezzoId),
    enabled: !!mezzoId && !!companyId,
    queryFn: async (): Promise<ScansioneConNomi[]> => {
      const { data, error } = await db
        .from("mezzi_scansioni")
        .select("*, commessa:orders!mezzi_scansioni_order_id_fkey(order_code, client_name, client_company)")
        .eq("mezzo_id", mezzoId)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      type Riga = MezzoScansione & { commessa: { order_code: string | null; client_name: string | null; client_company: string | null } | null };
      const righe = (data ?? []) as Riga[];
      // I nomi dalle persone dell'azienda: profilo HR se c'è, sennò il profilo utente.
      const hrIds = [...new Set(righe.map((r) => r.hr_profilo_id).filter(Boolean))] as string[];
      const userIds = [...new Set(righe.filter((r) => !r.hr_profilo_id).map((r) => r.user_id).filter(Boolean))] as string[];
      const [hr, utenti] = await Promise.all([
        hrIds.length ? db.from("hr_profili").select("id, nome, cognome").in("id", hrIds) : Promise.resolve({ data: [] }),
        userIds.length ? db.from("profiles").select("id, first_name, last_name").in("id", userIds) : Promise.resolve({ data: [] }),
      ]);
      const nomeHr = new Map(((hr.data ?? []) as Array<{ id: string; nome: string | null; cognome: string | null }>)
        .map((p) => [p.id, [p.nome, p.cognome].filter(Boolean).join(" ")]));
      const nomeUtente = new Map(((utenti.data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>)
        .map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ")]));
      return righe.map(({ commessa, ...r }) => ({
        ...r,
        quantita: r.quantita != null ? Number(r.quantita) : null,
        chi: (r.hr_profilo_id && nomeHr.get(r.hr_profilo_id)) || (r.user_id && nomeUtente.get(r.user_id)) || null,
        cantiere: commessa ? [commessa.order_code, commessa.client_company || commessa.client_name].filter(Boolean).join(" · ") || null : null,
      }));
    },
    staleTime: 30 * 1000,
  });
}

// ── Inventari ────────────────────────────────────────────────────────────────

export function useInventari() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.inventari(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<Array<MezzoInventario & { contati: number }>> => {
      const { data, error } = await db
        .from("mezzi_inventari")
        .select("*, conte:mezzi_scansioni(count)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      type Riga = MezzoInventario & { conte: Array<{ count: number }> | null };
      return ((data ?? []) as Riga[]).map(({ conte, ...i }) => ({ ...i, contati: conte?.[0]?.count ?? 0 }));
    },
    staleTime: 30 * 1000,
  });
}

export function useInventario(id: string | undefined) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.inventario(id),
    enabled: !!id && !!companyId,
    queryFn: async () => {
      const [inv, conte] = await Promise.all([
        db.from("mezzi_inventari").select("*").eq("id", id).eq("company_id", companyId).maybeSingle(),
        db.from("mezzi_scansioni").select("id, mezzo_id, quantita, created_at, user_id").eq("inventario_id", id).order("created_at", { ascending: false }),
      ]);
      if (inv.error) throw inv.error;
      if (conte.error) throw conte.error;
      return {
        inventario: (inv.data ?? null) as MezzoInventario | null,
        conte: ((conte.data ?? []) as Array<Pick<MezzoScansione, "id" | "mezzo_id" | "quantita" | "created_at" | "user_id">>)
          .map((c) => ({ ...c, quantita: c.quantita != null ? Number(c.quantita) : null })),
      };
    },
    staleTime: 5 * 1000,
  });
}

export function useCreaInventario() {
  const companyId = useEffectiveCompanyId();
  const invalida = useInvalidaMezzi();
  return useMutation({
    mutationFn: async (input: Pick<MezzoInventario, "titolo" | "classe" | "categoria_id" | "dove">): Promise<string> => {
      if (!companyId) throw new Error("Azienda non trovata");
      const { data, error } = await db.from("mezzi_inventari")
        .insert({ company_id: companyId, ...input, titolo: input.titolo.trim() })
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => invalida(),
    onError: (e) => toast.error(messaggio(e, "Non ho avviato l'inventario")),
  });
}

export type EsitoConta = {
  esito: "contato" | "aggiornato" | "gia_contato" | "sconosciuto";
  atteso?: boolean;
  codice?: string;
  mezzo?: SchedaCampoAttrezzo;
};

export function useContaInventario(inventarioId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { codice?: string; mezzoId?: string; quantita?: number | null }): Promise<EsitoConta> => {
      const { data, error } = await db.rpc("mezzi_inventario_conta", {
        p_inventario: inventarioId,
        p_codice: input.codice ?? null,
        p_quantita: input.quantita ?? null,
        p_mezzo_id: input.mezzoId ?? null,
      });
      if (error) throw error;
      return data as EsitoConta;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chiavi.inventario(inventarioId) });
      qc.invalidateQueries({ queryKey: ["mezzi", "ultime-viste"] });
    },
    onError: (e) => toast.error(messaggio(e, "Non ho contato l'attrezzo")),
  });
}

export function useAnnullaConta(inventarioId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (scansioneId: string) => {
      const { error } = await db.from("mezzi_scansioni").delete().eq("id", scansioneId).eq("inventario_id", inventarioId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chiavi.inventario(inventarioId) }),
    onError: (e) => toast.error(messaggio(e, "Non ho tolto la conta")),
  });
}

export function useChiudiInventario(inventarioId: string) {
  const invalida = useInvalidaMezzi();
  return useMutation({
    mutationFn: async (input: { segnalaMancanti: boolean; riportaInMagazzino: boolean }) => {
      const { data, error } = await db.rpc("mezzi_inventario_chiudi", {
        p_inventario: inventarioId,
        p_segnala_mancanti: input.segnalaMancanti,
        p_riporta_in_magazzino: input.riportaInMagazzino,
      });
      if (error) throw error;
      return data as { segnalati: number; riportati_in_magazzino: number };
    },
    onSuccess: (r) => {
      invalida();
      const parti = ["Inventario chiuso"];
      if (r.segnalati) parti.push(`${r.segnalati} ${r.segnalati === 1 ? "segnalazione" : "segnalazioni"} all'ufficio`);
      if (r.riportati_in_magazzino) parti.push(`${r.riportati_in_magazzino} riportati in magazzino`);
      toast.success(parti.join(" · "));
    },
    onError: (e) => toast.error(messaggio(e, "Non ho chiuso l'inventario")),
  });
}
