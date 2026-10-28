/**
 * POS sul modello ufficiale: lettura e salvataggio dei documenti, figure della
 * sicurezza dell'impresa, allegati, e le azioni che passano dal server
 * (crea, dati dell'app, lavorazioni proposte dall'AI, approvazione).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { readAllPages } from "@/lib/personale/readAllPages";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { Json, TablesUpdate } from "@/integrations/supabase/types";
import {
  normalizzaPos, type Lavorazione, type PosContenuto, type VoceMancante,
} from "../../supabase/functions/_shared/posModello";
import type { ContestoPos } from "../../supabase/functions/_shared/posModello";
import type { RevisionePos } from "@/lib/sicurezza/posHtml";

const BUCKET = "sicurezza-documenti";

export interface IterPos {
  firma_datore_il?: string | null;
  consultazione_rls_il?: string | null;
  affidataria_inviato_il?: string | null;
  affidataria_esito?: "positivo" | "negativo" | null;
  affidataria_esito_il?: string | null;
  cse_inviato_il?: string | null;
  cse_esito?: "positivo" | "negativo" | null;
  cse_esito_il?: string | null;
  note?: string | null;
}

export interface PosRiga {
  id: string;
  company_id: string;
  order_id: string;
  status: string;
  revisione: number;
  revisioni: RevisionePos[];
  contenuto: PosContenuto;
  /** Il documento non ha ancora il POS sul modello (vecchio generatore o bozza vuota). */
  daCompilare: boolean;
  iter: IterPos;
  approvato_da_nome: string | null;
  approvato_il: string | null;
  created_at: string;
  updated_at: string | null;
  commessa: { order_code: string | null; description: string | null } | null;
}

const chiavi = {
  elenco: (companyId: string | null) => ["pos", "elenco", companyId] as const,
  uno: (companyId: string | null, id: string | undefined) => ["pos", "uno", companyId, id] as const,
  figure: (companyId: string | null) => ["pos", "figure", companyId] as const,
};

const SELECT_POS =
  "id, company_id, order_id, status, revisione, revisioni, contenuto, iter, approvato_da_nome, approvato_il, created_at, updated_at, document_type, commessa:orders!pos_documents_order_id_fkey(order_code, description)";

type RigaDb = {
  id: string; company_id: string; order_id: string; status: string; revisione: number | null;
  revisioni: unknown; contenuto: unknown; iter: unknown; approvato_da_nome: string | null; approvato_il: string | null;
  created_at: string; updated_at: string | null; document_type: string | null;
  commessa: { order_code: string | null; description: string | null } | null;
};

function daDb(r: RigaDb): PosRiga {
  const modello = !!r.contenuto && typeof r.contenuto === "object" && (r.contenuto as { versione_modello?: unknown }).versione_modello === 1;
  return {
    id: r.id,
    company_id: r.company_id,
    order_id: r.order_id,
    status: r.status,
    revisione: r.revisione ?? 0,
    revisioni: Array.isArray(r.revisioni) ? (r.revisioni as RevisionePos[]) : [],
    contenuto: normalizzaPos(r.contenuto),
    daCompilare: !modello,
    iter: (r.iter && typeof r.iter === "object" ? r.iter : {}) as IterPos,
    approvato_da_nome: r.approvato_da_nome,
    approvato_il: r.approvato_il,
    created_at: r.created_at,
    updated_at: r.updated_at,
    commessa: r.commessa,
  };
}

export function usePosElenco() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.elenco(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<PosRiga[]> => {
      const rows = await readAllPages((from,to)=>supabase
        .from("pos_documents")
        .select(SELECT_POS)
        .eq("company_id",companyId!)
        .or("document_type.is.null,document_type.eq.pos")
        .is("superseded_by",null)
        .order("created_at",{ascending:false}).order("id").range(from,to));
      return (rows as unknown as RigaDb[]).map(daDb);
    },
    staleTime: 30 * 1000,
  });
}

export function usePos(id: string | undefined) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.uno(companyId, id),
    enabled: !!id && !!companyId,
    queryFn: async (): Promise<PosRiga | null> => {
      const { data, error } = await supabase
        .from("pos_documents")
        .select(SELECT_POS)
        .eq("id", id!)
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return data ? daDb(data as unknown as RigaDb) : null;
    },
    // L'editor si rimonta quando il POS cambia: niente ricariche mentre si scrive.
    refetchOnWindowFocus: false,
  });
}

// ── Server ───────────────────────────────────────────────────────────────────

export class ErrorePos extends Error {
  constructor(message: string, readonly mancanti: VoceMancante[] = []) {
    super(message);
  }
}

async function rispostaServerPos(corpo: Record<string, unknown>): Promise<Response> {
  const { data: sessione } = await supabase.auth.getSession();
  const token = sessione.session?.access_token;
  if (!token) throw new ErrorePos("Sessione scaduta: accedi di nuovo e riprova");
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/genera-pos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...corpo, versione_client: 2, versione_psc_client: 1, versione_prodotti_client: 1, versione_tecnica_client: 1, versione_fonti_tecniche_client: 1, versione_mezzi_client: 1, versione_documenti_mezzi_client: 1, versione_requisiti_addetti_client: 1 }),
  });
}

export async function chiamaServerPos<T>(corpo: Record<string, unknown>): Promise<T> {
  const res = await rispostaServerPos(corpo);
  const testo = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = testo ? JSON.parse(testo) : {};
  } catch {
    // risposta non JSON: il messaggio è il testo
  }
  if (!res.ok || json.ok === false) {
    const messaggio = (typeof json.error === "string" && json.error) || testo || "Operazione non riuscita";
    throw new ErrorePos(messaggio, Array.isArray(json.mancanti) ? (json.mancanti as VoceMancante[]) : []);
  }
  return json as T;
}

export function useCreaPos() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, ruoloImpresa, sorgentePos, modelloId }: { orderId: string; ruoloImpresa?: string; sorgentePos?: Pick<PosRiga, "id" | "updated_at">; modelloId?: string }) =>
      chiamaServerPos<{ pos_id: string; avvisi: string[] }>({ azione: "crea", company_id: companyId, order_id: orderId, ruolo_impresa: ruoloImpresa, sorgente_pos_id: sorgentePos?.id, attesa_updated_at: sorgentePos?.updated_at, modello_id: modelloId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "POS non creato"),
  });
}

export async function datiAppPos(companyId: string, posId: string) {
  return chiamaServerPos<{ contenuto: PosContenuto; contesto: ContestoPos }>({ azione: "dati_app", company_id: companyId, pos_id: posId });
}

export async function lavorazioniAiPos(companyId: string, posId: string) {
  return chiamaServerPos<{ lavorazioni: Lavorazione[]; modalita_organizzative?: string }>({ azione: "lavorazioni_ai", company_id: companyId, pos_id: posId });
}

export function useApprovaPos() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({posId,attesaUpdatedAt}:{posId:string;attesaUpdatedAt:string|null}) => {
      if(!companyId || attesaUpdatedAt===undefined) throw new Error("Ricarica il POS prima di approvarlo");
      return chiamaServerPos<{ approvato_da_nome: string }>({ azione: "approva", company_id: companyId, pos_id: posId, attesa_updated_at:attesaUpdatedAt });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos"] });
      toast.success("POS approvato");
    },
  });
}

// ── Scritture dirette (RLS: permesso Sicurezza Cantiere) ─────────────────────

export function useSalvaPos(id: string) {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (campi: { contenuto?: PosContenuto; iter?: IterPos; attesa_updated_at:string|null }) => {
      const riga: TablesUpdate<"pos_documents"> = { updated_at: new Date().toISOString() };
      if (campi.contenuto) {
        const c = campi.contenuto;
        riga.contenuto = c as unknown as Json;
        // Colonne riassuntive per la lista e per chi le legge ancora.
        riga.tipo_lavori = c.opera.descrizione_attivita || "Da specificare";
        riga.indirizzo_cantiere = [c.opera.cantiere.via, c.opera.cantiere.localita, c.opera.cantiere.provincia].filter(Boolean).join(", ") || "Da specificare";
        riga.data_inizio = c.opera.data_inizio || null;
        riga.data_fine_prevista = c.opera.data_fine || null;
        riga.numero_lavoratori = c.lavoratori.reduce((t, r) => t + (r.numero || 0), 0) || null;
        riga.responsabile_sicurezza = c.rspp.nominativo || null;
      }
      if (campi.iter) riga.iter = campi.iter as unknown as Json;
      const atteso=campi.attesa_updated_at;
      if(!companyId || atteso===undefined) throw new Error("Ricarica il POS prima di salvarlo");
      let query=supabase.from("pos_documents").update(riga).eq("id",id).eq("company_id",companyId!);
      query=atteso===null?query.is("updated_at",null):query.eq("updated_at",atteso);
      const {data,error}=await query.select(SELECT_POS).maybeSingle();
      if(error) throw error;
      if(!data) throw new Error("Il POS è cambiato o non è più modificabile. Ricarica prima di salvare: le tue modifiche locali sono ancora qui.");
      const aggiornato=daDb(data as unknown as RigaDb);
      qc.setQueryData(chiavi.uno(companyId,id),aggiornato);
      return aggiornato;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos"] }),
    onError: (e) => toast.error(e instanceof Error ? `POS non salvato: ${e.message}` : "POS non salvato"),
  });
}

/** Un POS approvato non si tocca: si apre una nuova revisione, che torna in bozza. */
export function useNuovaRevisione(pos: PosRiga | null | undefined) {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (descrizione: string) => {
      if (!pos || !companyId || pos.company_id !== companyId) throw new Error("POS non disponibile nell’azienda corrente");
      const { data, error } = await supabase.rpc('pos_apri_revisione' as never, {
        _pos_id: pos.id,
        _descrizione: descrizione,
        _attesa_updated_at: pos.updated_at,
      } as never);
      if(error) throw error;
      if(!data) throw new Error('Revisione non aperta: ricarica il POS.');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos"] });
      toast.success("Nuova revisione aperta: il POS è tornato in bozza");
    },
    onError: (e) => toast.error(e instanceof Error ? `Revisione non aperta: ${e.message}` : "Revisione non aperta"),
  });
}

export function useEliminaPos() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pos_documents").delete().eq("id", id).eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos"] });
      toast.success("POS eliminato");
    },
    onError: (e) => toast.error(e instanceof Error ? `POS non eliminato: ${e.message}` : "POS non eliminato"),
  });
}

// ── Allegati ─────────────────────────────────────────────────────────────────

export async function caricaAllegatoPos(companyId: string, posId: string, file: File): Promise<string> {
  if(!file.size || file.size>20*1024*1024) throw new Error("Per l’emissione del POS scegli un file non vuoto fino a 20 MB");
  const sicuro = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const path = `${companyId}/pos/${posId}/${crypto.randomUUID()}-${sicuro}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  return path;
}

export async function rimuoviAllegatoPos(path: string): Promise<void> {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}

export async function linkAllegatoPos(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

// ── Figure della sicurezza dell'impresa ──────────────────────────────────────

export type RuoloFigura =
  | "datore_lavoro" | "dirigente" | "direttore_tecnico" | "preposto" | "capocantiere" | "rspp"
  | "medico_competente" | "rls" | "rlst" | "addetto_antincendio" | "addetto_primo_soccorso";

export interface FiguraSicurezza {
  id: string;
  company_id: string;
  ruolo: RuoloFigura;
  nominativo: string;
  hr_profilo_id: string | null;
  esterno: boolean;
  telefono: string | null;
  email: string | null;
  mansioni_sicurezza: string | null;
  attestato: string | null;
  scadenza: string | null;
  note: string | null;
  attivo: boolean;
}

export function useFigureSicurezza() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.figure(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<FiguraSicurezza[]> => {
      const { data, error } = await supabase
        .from("sicurezza_figure")
        .select("*")
        .eq("company_id", companyId!)
        .eq("attivo", true)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as FiguraSicurezza[];
    },
  });
}

export type FiguraInput = Omit<FiguraSicurezza, "id" | "company_id" | "attivo"> & { id?: string };

export function useSalvaFigura() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...campi }: FiguraInput) => {
      const riga = {
        ...campi,
        nominativo: campi.nominativo.trim(),
        telefono: campi.telefono?.trim() || null,
        email: campi.email?.trim() || null,
        mansioni_sicurezza: campi.mansioni_sicurezza?.trim() || null,
        attestato: campi.attestato?.trim() || null,
        scadenza: campi.scadenza || null,
        note: campi.note?.trim() || null,
      };
      const q = id
        ? supabase.from("sicurezza_figure").update(riga).eq("id", id).eq("company_id", companyId!)
        : supabase.from("sicurezza_figure").insert({ ...riga, company_id: companyId! });
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: chiavi.figure(companyId) });
      toast.success(v.id ? "Figura aggiornata" : "Figura aggiunta");
    },
    onError: (e) => toast.error(e instanceof Error ? `Figura non salvata: ${e.message}` : "Figura non salvata"),
  });
}

export function useEliminaFigura() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Si spegne, non si cancella: i POS approvati la citano ancora.
      const { error } = await supabase.from("sicurezza_figure").update({ attivo: false }).eq("id", id).eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chiavi.figure(companyId) });
      toast.success("Figura tolta");
    },
    onError: (e) => toast.error(e instanceof Error ? `Figura non tolta: ${e.message}` : "Figura non tolta"),
  });
}


export interface ModelloPosAziendale {
  id: string; nome: string; ambito: string; versione: number; created_at: string;
}

export function useModelliPos(enabled = true) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["pos", "modelli", companyId], enabled: !!companyId && enabled,
    queryFn: () => readAllPages<ModelloPosAziendale>((from,to) => supabase.from("pos_modelli_aziendali" as never)
      .select("id,nome,ambito,versione,created_at").eq("company_id",companyId!).eq("archiviato",false)
      .order("nome").order("versione",{ascending:false}).order("id").range(from,to) as never),
  });
}

export function useSalvaModelloPos() {
  const companyId=useEffectiveCompanyId();
  const qc=useQueryClient();
  return useMutation({
    mutationFn: (input:{pos:Pick<PosRiga,"id"|"updated_at">;nome:string;ambito:string;testiVerificati:boolean}) =>
      chiamaServerPos<{modello_id:string;versione:number}>({azione:"salva_modello",company_id:companyId,pos_id:input.pos.id,attesa_updated_at:input.pos.updated_at,nome:input.nome,ambito:input.ambito,testi_verificati:input.testiVerificati}),
    onSuccess: r=>{ qc.invalidateQueries({queryKey:["pos","modelli"]}); toast.success(`Modello aziendale salvato, versione ${r.versione}`); },
    onError: e=>toast.error(e instanceof Error?e.message:"Modello non salvato"),
  });
}

export function useArchiviaModelloPos() {
  const companyId=useEffectiveCompanyId();
  const qc=useQueryClient();
  return useMutation({
    mutationFn: (id:string)=>chiamaServerPos({azione:"archivia_modello",company_id:companyId,modello_id:id}),
    onSuccess:()=>{qc.invalidateQueries({queryKey:["pos","modelli"]});toast.success("Versione archiviata. I POS già creati restano invariati.");},
    onError:e=>toast.error(e instanceof Error?e.message:"Modello non archiviato"),
  });
}


export async function pdfAnteprimaPos(companyId:string,posId:string): Promise<Blob> {
  const res=await rispostaServerPos({azione:"anteprima_pdf",company_id:companyId,pos_id:posId});
  if(!res.ok) {
    const json=await res.json().catch(()=>({}));
    throw new ErrorePos(json.error||"Anteprima PDF non disponibile");
  }
  if(!res.headers.get("Content-Type")?.includes("application/pdf")) throw new ErrorePos("Il server non ha restituito un PDF");
  return res.blob();
}
